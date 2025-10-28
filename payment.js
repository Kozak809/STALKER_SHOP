let currentCheckoutData = null;
let paymentCheckInterval = null;

// Создаём HTML модалки при загрузке
function initCheckoutModal() {
    const modalHTML = `
        <div id="checkout-modal" class="checkout-modal">
            <div class="checkout-content">
                <div class="checkout-header">Оформление заказа</div>
                
                <div id="checkout-message"></div>
                
                <div id="checkout-items-container" class="checkout-items"></div>
                
                <div class="checkout-total">
                    <span>Итого:</span>
                    <span id="checkout-total-price">0₽</span>
                </div>
                
                <div id="payment-info" class="payment-info" style="display:none;">
                    <div class="payment-info-title">Информация для оплаты:</div>
                    <div class="payment-address">
                        <strong>Monero адрес:</strong><br>
                        <code id="monero-address" class="monero-address"></code>
                        <button class="copy-btn" onclick="copyToClipboard()">Копировать</button>
                    </div>
                    <div class="payment-amount">
                        <strong>Сумма:</strong> <span id="xmr-amount">0</span> XMR
                    </div>
                    <div class="payment-id">
                        <strong>ID платежа:</strong> <span id="payment-id-display"></span>
                    </div>
                    <div class="payment-timer">
                        <strong>Истекает через:</strong> <span id="payment-timer">60:00</span>
                    </div>
                    <div class="payment-status-info">
                        <strong>Статус:</strong> <span id="payment-status-text">Ожидание оплаты</span>
                    </div>
                </div>
                
                <div class="checkout-buttons" id="initial-buttons">
                    <button class="checkout-btn checkout-btn-confirm" onclick="submitCheckout()">Создать платёж</button>
                    <button class="checkout-btn checkout-btn-cancel" onclick="closeCheckoutModal()">Отмена</button>
                </div>
                
                <div class="checkout-buttons" id="payment-buttons" style="display:none;">
                    <button class="checkout-btn checkout-btn-check" onclick="checkPaymentStatus()">Проверить статус</button>
                    <button class="checkout-btn checkout-btn-simulate" onclick="simulatePayment()">Симулировать оплату</button>
                    <button class="checkout-btn checkout-btn-cancel" onclick="closeCheckoutModal()">Закрыть</button>
                </div>
            </div>
        </div>
    `;
    
    const styleHTML = `
        <style>
        .checkout-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            z-index: 1000;
            justify-content: center;
            align-items: center;
        }

        .checkout-modal.active {
            display: flex;
        }

        .checkout-content {
            background: white;
            border-radius: 12px;
            padding: 32px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        }

        .checkout-header {
            font-size: 28px;
            font-weight: bold;
            margin-bottom: 24px;
            text-align: center;
        }

        .checkout-items {
            margin-bottom: 24px;
            padding: 16px;
            background: #f5f5f5;
            border-radius: 8px;
        }

        .checkout-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
            padding-bottom: 12px;
            border-bottom: 1px solid #eee;
        }

        .checkout-item:last-child {
            margin-bottom: 0;
            padding-bottom: 0;
            border-bottom: none;
        }

        .checkout-item-info {
            flex: 1;
        }

        .checkout-item-name {
            font-weight: 600;
            margin-bottom: 4px;
        }

        .checkout-item-qty {
            color: #666;
            font-size: 14px;
        }

        .checkout-item-price {
            font-weight: bold;
            text-align: right;
        }

        .checkout-total {
            display: flex;
            justify-content: space-between;
            font-size: 20px;
            font-weight: bold;
            padding: 16px;
            background: #f0f0f0;
            border-radius: 8px;
            margin-bottom: 24px;
        }

        .payment-info {
            margin-bottom: 24px;
            padding: 16px;
            background: #e7f3ff;
            border: 2px solid #2196F3;
            border-radius: 8px;
        }

        .payment-info-title {
            font-weight: bold;
            margin-bottom: 12px;
            color: #1976D2;
            font-size: 16px;
        }

        .payment-address, .payment-amount, .payment-id, .payment-timer, .payment-status-info {
            margin-bottom: 10px;
            font-size: 14px;
        }

        .monero-address {
            display: block;
            background: #fff;
            padding: 8px;
            border-radius: 4px;
            word-break: break-all;
            font-family: monospace;
            font-size: 11px;
            margin: 4px 0 8px 0;
        }

        .copy-btn {
            padding: 6px 12px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }

        .copy-btn:hover {
            background: #45a049;
        }

        .checkout-buttons {
            display: flex;
            gap: 12px;
            justify-content: center;
        }

        .checkout-btn {
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            font-weight: bold;
        }

        .checkout-btn-confirm {
            background: #3264b1;
            color: white;
            flex: 1;
        }

        .checkout-btn-confirm:hover {
            background: #2851a0;
        }

        .checkout-btn-cancel {
            background: #ddd;
            color: #333;
            flex: 1;
        }

        .checkout-btn-cancel:hover {
            background: #ccc;
        }

        .checkout-btn-check {
            background: #2196F3;
            color: white;
            flex: 1;
        }

        .checkout-btn-check:hover {
            background: #1976D2;
        }

        .checkout-btn-simulate {
            background: #FF9800;
            color: white;
            flex: 1;
        }

        .checkout-btn-simulate:hover {
            background: #F57C00;
        }

        .checkout-loading {
            text-align: center;
            color: #666;
        }

        .checkout-error {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 16px;
        }

        .checkout-success {
            background: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 16px;
        }
        </style>
    `;
    
    // Добавляем стили в head
    document.head.insertAdjacentHTML('beforeend', styleHTML);
    
    // Добавляем модаль в body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Добавляем обработчик клика вне модали
    const modal = document.getElementById('checkout-modal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeCheckoutModal();
            }
        });
    }
}

function openCheckoutModal(cartItems) {
    currentCheckoutData = {
        items: cartItems,
        total: cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0),
        timestamp: new Date().toISOString(),
        paymentId: null
    };
    
    // Отображаем товары
    const itemsContainer = document.getElementById('checkout-items-container');
    if (itemsContainer) {
        itemsContainer.innerHTML = cartItems.map(item => `
            <div class="checkout-item">
                <div class="checkout-item-info">
                    <div class="checkout-item-name">${item.name}</div>
                    <div class="checkout-item-qty">Кол-во: ${item.quantity}</div>
                </div>
                <div class="checkout-item-price">${(item.price * item.quantity).toLocaleString('ru-RU')}₽</div>
            </div>
        `).join('');
    }
    
    // Отображаем сумму
    const totalPrice = document.getElementById('checkout-total-price');
    if (totalPrice) {
        totalPrice.textContent = currentCheckoutData.total.toLocaleString('ru-RU') + '₽';
    }
    
    // Сбрасываем UI
    const messageDiv = document.getElementById('checkout-message');
    if (messageDiv) {
        messageDiv.innerHTML = '';
    }
    
    const paymentInfo = document.getElementById('payment-info');
    if (paymentInfo) {
        paymentInfo.style.display = 'none';
    }
    
    const initialButtons = document.getElementById('initial-buttons');
    const paymentButtons = document.getElementById('payment-buttons');
    if (initialButtons) initialButtons.style.display = 'flex';
    if (paymentButtons) paymentButtons.style.display = 'none';
    
    // Очищаем таймер если был
    if (paymentCheckInterval) {
        clearInterval(paymentCheckInterval);
        paymentCheckInterval = null;
    }
    
    // Показываем модалку
    const modal = document.getElementById('checkout-modal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeCheckoutModal() {
    const modal = document.getElementById('checkout-modal');
    if (modal) {
        modal.classList.remove('active');
    }
    
    // Очищаем таймеры
    if (paymentCheckInterval) {
        clearInterval(paymentCheckInterval);
        paymentCheckInterval = null;
    }
    
    currentCheckoutData = null;
}

async function submitCheckout() {
    const messageDiv = document.getElementById('checkout-message');
    
    if (!currentCheckoutData) {
        if (messageDiv) {
            messageDiv.innerHTML = '<div class="checkout-error">Ошибка: данные заказа не найдены</div>';
        }
        return;
    }
    
    if (messageDiv) {
        messageDiv.innerHTML = '<div class="checkout-loading">Создание платежа...</div>';
    }
    
    try {
        const response = await fetch('/api/checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: currentCheckoutData.items,
                total: currentCheckoutData.total,
                timestamp: currentCheckoutData.timestamp
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            if (messageDiv) {
                messageDiv.innerHTML = `<div class="checkout-error">${data.error || 'Ошибка при создании платежа'}</div>`;
            }
            return;
        }
        
        // Сохраняем payment_id
        currentCheckoutData.paymentId = data.payment_id;
        currentCheckoutData.expiresAt = Date.now() + (data.expires_in * 1000);
        
        // Показываем информацию о платеже
        document.getElementById('monero-address').textContent = data.monero_address;
        document.getElementById('xmr-amount').textContent = data.amount;
        document.getElementById('payment-id-display').textContent = data.payment_id;
        
        const paymentInfo = document.getElementById('payment-info');
        if (paymentInfo) {
            paymentInfo.style.display = 'block';
        }
        
        // Переключаем кнопки
        const initialButtons = document.getElementById('initial-buttons');
        const paymentButtons = document.getElementById('payment-buttons');
        if (initialButtons) initialButtons.style.display = 'none';
        if (paymentButtons) paymentButtons.style.display = 'flex';
        
        if (messageDiv) {
            messageDiv.innerHTML = '<div class="checkout-success">Платёж создан! Переведите указанную сумму на адрес выше.</div>';
        }
        
        // Запускаем таймер и автопроверку
        startPaymentTimer();
        startPaymentStatusCheck();
        
    } catch (error) {
        if (messageDiv) {
            messageDiv.innerHTML = `<div class="checkout-error">Ошибка сети: ${error.message}</div>`;
        }
    }
}

function startPaymentTimer() {
    const timerElement = document.getElementById('payment-timer');
    if (!timerElement || !currentCheckoutData.expiresAt) return;
    
    const updateTimer = () => {
        const remaining = Math.max(0, Math.floor((currentCheckoutData.expiresAt - Date.now()) / 1000));
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        if (remaining <= 0) {
            clearInterval(paymentCheckInterval);
            document.getElementById('payment-status-text').textContent = 'Истёк срок';
        }
    };
    
    updateTimer();
    setInterval(updateTimer, 1000);
}

function startPaymentStatusCheck() {
    // Проверяем статус каждые 5 секунд
    paymentCheckInterval = setInterval(() => {
        checkPaymentStatus(true);
    }, 5000);
}

async function checkPaymentStatus(silent = false) {
    if (!currentCheckoutData || !currentCheckoutData.paymentId) {
        return;
    }
    
    const messageDiv = document.getElementById('checkout-message');
    
    if (!silent && messageDiv) {
        messageDiv.innerHTML = '<div class="checkout-loading">Проверка статуса...</div>';
    }
    
    try {
        const response = await fetch(`/api/payment/status/${currentCheckoutData.paymentId}`);
        const data = await response.json();
        
        if (!response.ok) {
            if (!silent && messageDiv) {
                messageDiv.innerHTML = `<div class="checkout-error">${data.error || 'Ошибка при проверке статуса'}</div>`;
            }
            return;
        }
        
        // Обновляем статус
        const statusText = document.getElementById('payment-status-text');
        if (statusText) {
            const statusMap = {
                'pending': 'Ожидание оплаты',
                'confirmed': 'Подтверждён ✓',
                'expired': 'Истёк срок'
            };
            statusText.textContent = statusMap[data.status] || data.status;
        }
        
        if (data.status === 'confirmed') {
            if (messageDiv) {
                messageDiv.innerHTML = '<div class="checkout-success"><strong>Платёж подтверждён!</strong> Заказ выполнен.</div>';
            }
            
            // Останавливаем проверку
            if (paymentCheckInterval) {
                clearInterval(paymentCheckInterval);
                paymentCheckInterval = null;
            }
            
            // Через 3 секунды закрываем и очищаем корзину
            setTimeout(() => {
                closeCheckoutModal();
                if (typeof clearCart === 'function') clearCart();
                if (typeof updateCartBadge === 'function') updateCartBadge();
                if (typeof renderCart === 'function') renderCart();
            }, 3000);
        } else if (data.status === 'expired') {
            if (messageDiv) {
                messageDiv.innerHTML = '<div class="checkout-error">Срок платежа истёк. Создайте новый заказ.</div>';
            }
            
            if (paymentCheckInterval) {
                clearInterval(paymentCheckInterval);
                paymentCheckInterval = null;
            }
        } else if (!silent && messageDiv) {
            messageDiv.innerHTML = '<div class="checkout-success">Статус обновлён. Ожидаем оплату...</div>';
        }
        
    } catch (error) {
        if (!silent && messageDiv) {
            messageDiv.innerHTML = `<div class="checkout-error">Ошибка сети: ${error.message}</div>`;
        }
    }
}

async function simulatePayment() {
    if (!currentCheckoutData || !currentCheckoutData.paymentId) {
        return;
    }
    
    const messageDiv = document.getElementById('checkout-message');
    
    if (messageDiv) {
        messageDiv.innerHTML = '<div class="checkout-loading">Симуляция оплаты...</div>';
    }
    
    try {
        const response = await fetch(`/api/payment/confirm/${currentCheckoutData.paymentId}`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            if (messageDiv) {
                messageDiv.innerHTML = `<div class="checkout-error">${data.message || 'Ошибка при подтверждении'}</div>`;
            }
            return;
        }
        
        // Обновляем статус сразу
        await checkPaymentStatus(false);
        
    } catch (error) {
        if (messageDiv) {
            messageDiv.innerHTML = `<div class="checkout-error">Ошибка сети: ${error.message}</div>`;
        }
    }
}

function copyToClipboard() {
    const address = document.getElementById('monero-address').textContent;
    
    navigator.clipboard.writeText(address).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = 'Скопировано!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    }).catch(err => {
        alert('Не удалось скопировать: ' + err);
    });
}

// Инициализация при загрузке страницы
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCheckoutModal);
} else {
    initCheckoutModal();
}