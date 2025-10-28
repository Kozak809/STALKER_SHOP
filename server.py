import os
import re
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from flask import Blueprint, Flask, abort, jsonify, request, send_from_directory
from flask_cors import CORS
from supabase import Client, create_client

DEFAULT_SUPABASE_URL = "https://cwrmvjekoemlfkvmonff.supabase.co"
DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3cm12amVrb2VtbGZrdm1vbmZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1ODkwNzQsImV4cCI6MjA3NjE2NTA3NH0.T0AV8ZH1CNkPTsHUfKGMH1qVrVhDBkbNUnUO9aRR_Uk"
SUPABASE_URL = os.environ.get("SUPABASE_URL", DEFAULT_SUPABASE_URL)
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", DEFAULT_SUPABASE_KEY)
CACHE_TTL = int(os.environ.get("CACHE_TTL", "60"))

# Hardcoded Monero адрес для тестирования
MONERO_ADDRESS = "42QjDRrUmyL5uMyZvCTxhfLjBRv3Z1zJz5x8Dq8F7SV3T8q1WKvQR2Z7p8z3XhXL8Z7J7N3Z7Z7Z7Z7Z7Z7Z7"
MONERO_WALLET_KEY = "test_wallet_key_hardcoded"

class KitCache:
    def __init__(self):
        self.data: List[Dict[str, Any]] = []
        self.last_update = 0
        self.lock = threading.Lock()
   
    def is_expired(self) -> bool:
        return time.time() - self.last_update > CACHE_TTL
   
    def get(self) -> List[Dict[str, Any]]:
        with self.lock:
            return self.data.copy()
   
    def set(self, data: List[Dict[str, Any]]) -> None:
        with self.lock:
            self.data = data
            self.last_update = time.time()

cache = KitCache()
update_thread = None

def get_supabase_client() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be configured")
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_all_kits() -> List[Dict[str, Any]]:
    client = get_supabase_client()
    query = client.table("products").select("id,name,price,type,photo,quantity,category")
    try:
        data = query.order("id", desc=False).execute().data
    except Exception:
        data = query.execute().data
    return data or []

def background_update_cache() -> None:
    """Фоновое обновление кеша"""
    global update_thread
    try:
        new_data = fetch_all_kits()
        cache.set(new_data)
    except Exception as e:
        print(f"Ошибка при обновлении кеша: {e}")
    finally:
        update_thread = None

def get_kits_with_cache() -> List[Dict[str, Any]]:
    """Возвращает кешированные данные и запускает обновление в фоне если нужно"""
    global update_thread
   
    # Возвращаем кешированные данные
    cached_data = cache.get()
   
    # Если кеш пуст, загружаем синхронно
    if not cached_data:
        try:
            cached_data = fetch_all_kits()
            cache.set(cached_data)
        except Exception:
            pass
   
    # Если кеш истёк, запускаем фоновое обновление
    if cache.is_expired() and update_thread is None:
        update_thread = threading.Thread(target=background_update_cache, daemon=True)
        update_thread.start()
   
    return cached_data

def validate_receipt(receipt_text: str) -> bool:
    """Проверяет валидность чека (антиинъекция)"""
    if not receipt_text or len(receipt_text) > 5000:
        return False
    
    # Базовая проверка на SQL инъекции
    dangerous_patterns = [
        r"(?i)(drop|delete|insert|update|union|select)[\s\(]",
        r"(?i)(script|iframe|javascript|onerror|onclick)",
        r"--",
        r";.*--",
    ]
    
    for pattern in dangerous_patterns:
        if re.search(pattern, receipt_text):
            return False
    
    return True

def verify_items_quantity(items: List[Dict], products: List[Dict]) -> bool:
    """Проверяет соответствие товаров и количеств в базе"""
    product_map = {str(p.get('id', p.get('name'))): p for p in products}
    
    for item in items:
        item_id = str(item.get('id'))
        product = product_map.get(item_id)
        
        if not product:
            return False
        
        # Проверяем цену
        if product.get('price') != item.get('price'):
            return False
        
        # Проверяем доступность количества
        if product.get('quantity', 0) < item.get('quantity', 0):
            return False
    
    return True

def calculate_monero_amount(total_rub: float) -> str:
    """Преобразует RUB в XMR (упрощённо, для тестирования)"""
    # Здесь должен быть реальный курс обмена
    xmr_per_rub = 0.00005  # Условный коэффициент
    return f"{total_rub * xmr_per_rub:.8f}"

def save_payment_record(payment_id: str, items: List[Dict], total: float, 
                       monero_address: str, xmr_amount: str) -> bool:
    """Сохраняет запись платежа в БД (или в памяти для тестирования)"""
    try:
        client = get_supabase_client()
        
        payment_data = {
            'payment_id': payment_id,
            'items': items,
            'total_rub': total,
            'monero_address': monero_address,
            'xmr_amount': xmr_amount,
            'status': 'pending',
            'created_at': time.time(),
            'expires_at': time.time() + 3600  # Истекает через час
        }
        
        try:
            response = client.table('payments').insert(payment_data).execute()
            return response.data is not None
        except Exception:
            # Если таблицы нет, сохраняем в памяти
            if not hasattr(save_payment_record, 'memory_storage'):
                save_payment_record.memory_storage = {}
            save_payment_record.memory_storage[payment_id] = payment_data
            return True
    except Exception as e:
        print(f"Ошибка при сохранении платежа: {e}")
        return False

def get_payment_status(payment_id: str) -> Optional[Dict]:
    """Получает статус платежа из БД (или из памяти)"""
    try:
        client = get_supabase_client()
        try:
            response = client.table('payments').select('*').eq('payment_id', payment_id).execute()
            
            if response.data and len(response.data) > 0:
                return response.data[0]
        except Exception:
            # Если таблицы нет, проверяем память
            if hasattr(save_payment_record, 'memory_storage'):
                return save_payment_record.memory_storage.get(payment_id)
        
        return None
    except Exception as e:
        print(f"Ошибка при получении статуса платежа: {e}")
        return None

def update_payment_status(payment_id: str, status: str) -> bool:
    """Обновляет статус платежа (в БД или в памяти)"""
    try:
        client = get_supabase_client()
        try:
            response = client.table('payments').update({
                'status': status,
                'updated_at': time.time()
            }).eq('payment_id', payment_id).execute()
            
            return response.data is not None
        except Exception:
            # Если таблицы нет, обновляем в памяти
            if hasattr(save_payment_record, 'memory_storage') and payment_id in save_payment_record.memory_storage:
                save_payment_record.memory_storage[payment_id]['status'] = status
                save_payment_record.memory_storage[payment_id]['updated_at'] = time.time()
                return True
            return False
    except Exception as e:
        print(f"Ошибка при обновлении статуса платежа: {e}")
        return False

def confirm_payment_simulation(payment_id: str) -> Dict[str, Any]:
    """Симуляция подтверждения платежа (для тестирования) с выдачей координат"""
    payment = get_payment_status(payment_id)
    
    if not payment:
        return {'success': False, 'message': 'Платёж не найден'}
    
    # Проверяем, не истёк ли срок платежа
    if payment.get('expires_at', 0) < time.time():
        update_payment_status(payment_id, 'expired')
        return {'success': False, 'message': 'Срок платежа истёк'}
    
    # Проверяем текущий статус
    if payment.get('status') != 'pending':
        return {'success': False, 'message': 'Платёж уже обработан'}
    
    # Обновляем статус на confirmed
    if not update_payment_status(payment_id, 'confirmed'):
        return {'success': False, 'message': 'Не удалось обновить статус'}
    
    # Получаем координаты товаров
    items = payment.get('items', [])
    result = process_test_payment(items)
    
    return {
        'success': True,
        'message': 'Платёж подтверждён',
        'status': 'confirmed',
        'coordinates': result.get('coordinates', [])
    }

def get_product_coordinates(product_id: int) -> Optional[List[str]]:
    """Получает все координаты товара из таблицы coordinates"""
    try:
        client = get_supabase_client()
        response = client.table('coordinates').select('cords').eq('product_id', product_id).execute()
        
        if response.data and len(response.data) > 0:
            # Возвращаем список всех координат для этого товара
            return [item.get('cords') for item in response.data if item.get('cords')]
        return None
    except Exception as e:
        print(f"Ошибка при получении координат: {e}")
        return None

def delete_product_coordinates(product_id: int) -> bool:
    """Удаляет все координаты товара из таблицы coordinates"""
    try:
        client = get_supabase_client()
        response = client.table('coordinates').delete().eq('product_id', product_id).execute()
        
        return True  # Даже если ничего не удалилось, считаем успехом
    except Exception as e:
        print(f"Ошибка при удалении координат: {e}")
        return False

def delete_specific_coordinates(coords_to_delete: List[str], product_id: int) -> bool:
    """Удаляет конкретные координаты из таблицы coordinates"""
    try:
        client = get_supabase_client()
        
        deleted_count = 0
        for coord in coords_to_delete:
            response = client.table('coordinates').delete().eq('product_id', product_id).eq('cords', coord).execute()
            if response.data:
                deleted_count += 1
                print(f"  Удалена координата: {coord}")
        
        print(f"Всего удалено координат: {deleted_count} из {len(coords_to_delete)}")
        return True
    except Exception as e:
        print(f"Ошибка при удалении конкретных координат: {e}")
        return False

def decrease_product_quantity(product_id: int, quantity: int) -> bool:
    """Уменьшает количество товара в БД"""
    try:
        client = get_supabase_client()
        
        # Получаем текущее количество
        response = client.table('products').select('quantity').eq('id', product_id).execute()
        
        if not response.data or len(response.data) == 0:
            print(f"Товар ID={product_id} не найден")
            return False
        
        current_quantity = response.data[0].get('quantity', 0)
        new_quantity = max(0, current_quantity - quantity)
        
        print(f"Товар ID={product_id}: было {current_quantity}, стало {new_quantity}")
        
        # Обновляем количество
        update_response = client.table('products').update({
            'quantity': new_quantity
        }).eq('id', product_id).execute()
        
        return update_response.data is not None
    except Exception as e:
        print(f"Ошибка при обновлении количества товара: {e}")
        return False

def process_test_payment(items: List[Dict]) -> Dict[str, Any]:
    """Обрабатывает тестовую оплату и возвращает координаты товаров"""
    coordinates_data = []
    
    print(f"=== Обработка тестовой оплаты ===")
    print(f"Товары: {items}")
    
    for item in items:
        product_id = item.get('id')
        quantity = item.get('quantity', 1)
        
        print(f"\nОбработка товара ID={product_id}, количество={quantity}")
        
        # Получаем все координаты для этого товара
        coords_list = get_product_coordinates(product_id)
        print(f"Получено координат: {coords_list}")
        
        if coords_list:
            # Берём только нужное количество координат
            coords_to_give = coords_list[:quantity]
            
            print(f"Выдаём координат: {len(coords_to_give)}")
            
            coordinates_data.append({
                'product_id': product_id,
                'product_name': item.get('name', 'Unknown'),
                'quantity': quantity,
                'requested_quantity': quantity,
                'available_quantity': len(coords_list),
                'coordinates': coords_to_give
            })
            
            # Удаляем только выданные координаты из базы
            print(f"Удаляем выданные координаты для товара ID={product_id}")
            delete_result = delete_specific_coordinates(coords_to_give, product_id)
            print(f"Результат удаления координат: {delete_result}")
            
            # Уменьшаем количество товара в БД на количество выданных координат
            actual_quantity = len(coords_to_give)
            print(f"Уменьшаем количество товара ID={product_id} на {actual_quantity}")
            quantity_result = decrease_product_quantity(product_id, actual_quantity)
            print(f"Результат обновления количества: {quantity_result}")
        else:
            print(f"Координаты не найдены для товара ID={product_id}")
            # Если координат нет, всё равно добавляем в список
            coordinates_data.append({
                'product_id': product_id,
                'product_name': item.get('name', 'Unknown'),
                'quantity': quantity,
                'requested_quantity': quantity,
                'available_quantity': 0,
                'coordinates': []
            })
    
    print(f"\n=== Итоговые данные ===")
    print(f"Координаты для отправки: {coordinates_data}")
    
    return {
        'success': True,
        'coordinates': coordinates_data,
        'message': 'Тестовая оплата выполнена успешно'
    }

from pathlib import Path
from typing import Optional

BASE_DIR = Path(__file__).resolve().parent


def register_api_routes(flask_app: Flask) -> None:
    api_blueprint = Blueprint("api", __name__)

    @api_blueprint.route("/kits", methods=["GET"])
    def get_kits_route():
        try:
            kits = get_kits_with_cache()
            return jsonify(kits), 200
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    @api_blueprint.route("/checkout", methods=["POST"])
    def checkout_route():
        try:
            data = request.get_json()

            if not data:
                return jsonify({"error": "Пустой запрос"}), 400

            items = data.get("items", [])
            total = data.get("total", 0)

            # Валидация входных данных
            if not items or total <= 0:
                return jsonify({"error": "Некорректные данные товаров"}), 400

            # Получаем товары из БД
            products = get_kits_with_cache()

            # Проверяем соответствие товаров, цен и количеств
            if not verify_items_quantity(items, products):
                return jsonify({"error": "Некоторые товары недоступны или цены изменились"}), 400

            # Генерируем ID платежа
            payment_id = str(uuid.uuid4())

            # Рассчитываем сумму в Monero
            xmr_amount = calculate_monero_amount(total)

            # Сохраняем запись платежа в БД
            if not save_payment_record(
                payment_id, items, total, MONERO_ADDRESS, xmr_amount
            ):
                return jsonify({"error": "Не удалось создать платёж"}), 500

            # Возвращаем детали платежа
            return (
                jsonify(
                    {
                        "payment_id": payment_id,
                        "status": "pending",
                        "monero_address": MONERO_ADDRESS,
                        "amount": xmr_amount,
                        "total_rub": total,
                        "expires_in": 3600,
                    }
                ),
                200,
            )

        except Exception as exc:
            print(f"Ошибка при обработке checkout: {exc}")
            return jsonify({"error": f"Ошибка сервера: {str(exc)}"}), 500

    @api_blueprint.route("/payment/status/<payment_id>", methods=["GET"])
    def payment_status_route(payment_id: str):
        try:
            payment = get_payment_status(payment_id)
            
            if not payment:
                return jsonify({"error": "Платёж не найден"}), 404
            
            # Проверяем истёк ли срок
            if payment.get('status') == 'pending' and payment.get('expires_at', 0) < time.time():
                update_payment_status(payment_id, 'expired')
                payment['status'] = 'expired'
            
            return jsonify({
                'payment_id': payment.get('payment_id'),
                'status': payment.get('status'),
                'total_rub': payment.get('total_rub'),
                'xmr_amount': payment.get('xmr_amount'),
                'created_at': payment.get('created_at'),
                'expires_at': payment.get('expires_at'),
            }), 200
            
        except Exception as exc:
            print(f"Ошибка при проверке статуса платежа: {exc}")
            return jsonify({"error": str(exc)}), 500
    
    @api_blueprint.route("/payment/confirm/<payment_id>", methods=["POST"])
    def payment_confirm_route(payment_id: str):
        """Endpoint для симуляции подтверждения платежа (для тестирования)"""
        try:
            result = confirm_payment_simulation(payment_id)
            
            if result.get('success'):
                return jsonify(result), 200
            else:
                return jsonify(result), 400
                
        except Exception as exc:
            print(f"Ошибка при подтверждении платежа: {exc}")
            return jsonify({"error": str(exc)}), 500
    
    @api_blueprint.route("/payment/test", methods=["POST"])
    def test_payment_route():
        """Endpoint для тестовой оплаты с получением координат"""
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({"error": "Пустой запрос"}), 400
            
            items = data.get("items", [])
            
            if not items:
                return jsonify({"error": "Нет товаров для оплаты"}), 400
            
            # Обрабатываем тестовую оплату
            result = process_test_payment(items)
            
            return jsonify(result), 200
            
        except Exception as exc:
            print(f"Ошибка при тестовой оплате: {exc}")
            return jsonify({"error": str(exc)}), 500

    flask_app.register_blueprint(api_blueprint, url_prefix="/api")


def resolve_frontend_path(requested_path: str) -> Optional[Path]:
    normalized = (requested_path or "").strip()
    if not normalized or normalized == "/":
        normalized = "index.html"

    # Список запрещённых файлов и расширений
    blocked_files = ['server.py', 'requirements.txt', '.env', '.git']
    blocked_extensions = ['.py', '.pyc', '.pyo', '.env', '.key', '.pem']
    
    # Проверяем имя файла
    filename = normalized.split('/')[-1].lower()
    if any(blocked in filename for blocked in blocked_files):
        print(f"Заблокирован доступ к файлу: {filename}")
        return None
    
    # Проверяем расширение
    if any(filename.endswith(ext) for ext in blocked_extensions):
        print(f"Заблокирован доступ к файлу с расширением: {filename}")
        return None

    candidate_path = (BASE_DIR / normalized.lstrip("/\\")).resolve()

    # Убедимся, что файл остаётся внутри проекта
    if not str(candidate_path).startswith(str(BASE_DIR)):
        return None

    if candidate_path.is_dir():
        candidate_path = candidate_path / "index.html"

    if candidate_path.exists():
        return candidate_path

    # Попытка добавить .html для маршрутов без расширения
    if "." not in Path(normalized).name:
        html_candidate = (BASE_DIR / f"{normalized}.html").resolve()
        if str(html_candidate).startswith(str(BASE_DIR)) and html_candidate.exists():
            return html_candidate

    return None


def register_site_routes(flask_app: Flask) -> None:
    @flask_app.route("/", defaults={"requested_path": "index.html"})
    @flask_app.route("/<path:requested_path>")
    def serve_frontend(requested_path: str):  # type: ignore[override]
        file_path = resolve_frontend_path(requested_path)
        if not file_path:
            abort(404)

        directory = file_path.parent
        filename = file_path.name
        return send_from_directory(str(directory), filename)


def create_app() -> Flask:
    flask_app = Flask(__name__, static_folder=None)
    CORS(flask_app, resources={r"/api/*": {"origins": "*"}})
    register_api_routes(flask_app)
    register_site_routes(flask_app)
    return flask_app


app = create_app()


def main() -> None:
    port_str = os.environ.get("PORT", "8089")
    try:
        port = int(port_str)
    except ValueError:
        port = 8089
    app.run(host="0.0.0.0", port=port, debug=False)


if __name__ == "__main__":
    main()