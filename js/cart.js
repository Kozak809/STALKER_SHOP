// Состояние оплаты
let checkoutStep = 'cart'; // cart, payment, result
let currentPaymentData = null;
let paymentCheckInterval = null;

// Получить параметр из URL
function getUrlParameter(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

// Функция для получения корзины
function getCart() {
    return JSON.parse(localStorage.getItem('cart')) || [];
}

// Функция для сохранения корзины
function saveCart(cart) {
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartBadge();
}

// Функция для очистки корзины
function clearCart() {
    localStorage.removeItem('cart');
    updateCartBadge();
}

// Обновить значок количества товаров
function updateCartBadge() {
    const cart = getCart();
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const badge = document.querySelector('[data-cart-count]');
    
    if (badge) {
        if (totalItems > 0) {
            badge.textContent = totalItems;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

// Добавить товар в корзину
function addProductToCart(product) {
    const selected_quantity = parseInt(document.getElementById("quantity").textContent);
    const quantity = product.quantity || 0;
    
    if (selected_quantity > 0 && selected_quantity <= quantity) {
        let cart = getCart();
        
        let existingItem = cart.find(item => item.id === product.id);
        
        if (existingItem) {
            existingItem.quantity += selected_quantity;
        } else {
            cart.push({
                id: product.id,
                name: product.name,
                price: product.price,
                quantity: selected_quantity
            });
        }
        
        saveCart(cart);
        alert(`"${product.name}" добавлен в корзину!`);
        document.getElementById("quantity").textContent = '1';
    } else {
        alert("Неверное количество");
    }
}

// Удалить товар из корзины
function removeFromCart(productId) {
    let cart = getCart();
    cart = cart.filter(item => item.id !== productId);
    saveCart(cart);
    renderCart();
}

// Изменить количество товара в корзине
function updateQuantityInCart(productId, newQuantity) {
    let cart = getCart();
    const item = cart.find(item => item.id === productId);
    
    if (item) {
        if (newQuantity <= 0) {
            removeFromCart(productId);
        } else {
            item.quantity = newQuantity;
            saveCart(cart);
            renderCart();
        }
    }
}

// Получить общую стоимость корзины
function getTotalPrice() {
    const cart = getCart();
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

// Перейти к этапу оформления заказа
function openCheckout() {
    const cart = getCart();
    
    if (cart.length === 0) {
        alert('Корзина пуста');
        return;
    }
    
    checkoutStep = 'payment';
    createPayment();
}

// Вернуться к корзине
function backToCart() {
    checkoutStep = 'cart';
    if (paymentCheckInterval) {
        clearInterval(paymentCheckInterval);
        paymentCheckInterval = null;
    }
    currentPaymentData = null;
    renderCart();
}

// Создать платеж
async function createPayment() {
    const cart = getCart();
    const total = getTotalPrice();
    
    renderCart(); // Показываем загрузку
    
    try {
        const response = await fetch('/api/checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: cart,
                total: total,
                timestamp: new Date().toISOString()
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            checkoutStep = 'error';
            currentPaymentData = { error: data.error || 'Ошибка при создании платежа' };
            renderCart();
            return;
        }
        
        currentPaymentData = {
            paymentId: data.payment_id,
            moneroAddress: data.monero_address,
            xmrAmount: data.amount,
            totalRub: data.total_rub,
            expiresIn: data.expires_in,
            expiresAt: Date.now() + (data.expires_in * 1000),
            status: 'pending'
        };
        
        renderCart();
        startPaymentTimer();
        startPaymentStatusCheck();
        
    } catch (error) {
        checkoutStep = 'error';
        currentPaymentData = { error: 'Ошибка сети: ' + error.message };
        renderCart();
    }
}

// Запустить таймер оплаты
function startPaymentTimer() {
    const updateTimer = () => {
        if (!currentPaymentData || !currentPaymentData.expiresAt) return;
        
        const remaining = Math.max(0, Math.floor((currentPaymentData.expiresAt - Date.now()) / 1000));
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        
        const timerEl = document.getElementById('payment-timer');
        if (timerEl) {
            timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        
        if (remaining <= 0 && paymentCheckInterval) {
            clearInterval(paymentCheckInterval);
            currentPaymentData.status = 'expired';
            renderCart();
        }
    };
    
    updateTimer();
    setInterval(updateTimer, 1000);
}

// Автопроверка статуса платежа
function startPaymentStatusCheck() {
    paymentCheckInterval = setInterval(() => {
        checkPaymentStatus(true);
    }, 5000);
}

// Проверить статус платежа
async function checkPaymentStatus(silent = false) {
    if (!currentPaymentData || !currentPaymentData.paymentId) return;
    
    try {
        const response = await fetch(`/api/payment/status/${currentPaymentData.paymentId}`);
        const data = await response.json();
        
        if (response.ok) {
            currentPaymentData.status = data.status;
            
            if (data.status === 'confirmed') {
                clearInterval(paymentCheckInterval);
                checkoutStep = 'success';
                renderCart();
                
                // Убрали автоочистку
                // setTimeout(() => {
                //     clearCart();
                //     backToCart();
                // }, 3000);
            } else if (data.status === 'expired') {
                clearInterval(paymentCheckInterval);
                renderCart();
            } else if (!silent) {
                renderCart();
            }
        }
    } catch (error) {
        console.error('Ошибка проверки статуса:', error);
    }
}

// Симулировать оплату
async function simulatePayment() {
    if (!currentPaymentData || !currentPaymentData.paymentId) return;
    
    try {
        const response = await fetch(`/api/payment/confirm/${currentPaymentData.paymentId}`, {
            method: 'POST'
        });
        
        const data = await response.json();
        console.log('Результат симуляции:', data);
        
        if (response.ok && data.success) {
            // Сохраняем координаты
            if (data.coordinates && data.coordinates.length > 0) {
                currentPaymentData.coordinates = data.coordinates;
            }
            
            // Переходим к успешной оплате
            clearInterval(paymentCheckInterval);
            checkoutStep = 'success';
            renderCart();
        } else {
            alert('Ошибка симуляции: ' + (data.message || 'Неизвестная ошибка'));
        }
    } catch (error) {
        console.error('Ошибка симуляции оплаты:', error);
        alert('Ошибка сети: ' + error.message);
    }
}

// Тестовая оплата
async function testPayment() {
    const cart = getCart();
    
    if (!cart || cart.length === 0) {
        alert('Корзина пуста');
        return;
    }
    
    checkoutStep = 'test-loading';
    renderCart();
    
    try {
        const response = await fetch('/api/payment/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: cart
            })
        });
        
        const data = await response.json();
        
        console.log('Ответ сервера:', data); // Логируем ответ
        
        if (!response.ok) {
            alert('Ошибка тестовой оплаты: ' + (data.error || 'Неизвестная ошибка'));
            checkoutStep = 'error';
            renderCart();
            return;
        }
        
        checkoutStep = 'test-success';
        currentPaymentData = { coordinates: data.coordinates };
        console.log('Координаты:', currentPaymentData); // Логируем координаты
        renderCart();
        
        // Убрали автоочистку корзины
        // setTimeout(() => {
        //     clearCart();
        //     backToCart();
        // }, 5000);
        
    } catch (error) {
        alert('Ошибка сети: ' + error.message);
        checkoutStep = 'error';
        renderCart();
    }
}

// Копировать в буфер
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('Скопировано!');
    }).catch(err => {
        alert('Не удалось скопировать: ' + err);
    });
}

// Отрендерить страницу корзины
function renderCart() {
    const cart = getCart();
    const cartContainer = document.getElementById('cart-container');
    
    if (!cartContainer) return;
    
    // Пустая корзина
    if (cart.length === 0 && checkoutStep === 'cart') {
        cartContainer.innerHTML = `
            <div style="text-align:center;padding:64px 16px">
                <p style="font-size:24px;margin-bottom:16px;color:#fff">Ваша корзина пуста</p>
                <a href="index.html" style="color:#fff;text-decoration:underline">Вернуться в магазин</a>
            </div>
        `;
        return;
    }
    
    const total = getTotalPrice();
    let html = '';
    
    // ЭТАП 1: Корзина
    if (checkoutStep === 'cart') {
        let itemsHtml = cart.map(item => `
            <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #eee">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
                    <div>
                        <h3 style="margin:0 0 4px 0;font-size:18px">${item.name}</h3>
                        <p style="margin:0;color:#666;font-size:14px">${item.price.toLocaleString('ru-RU')}₽</p>
                    </div>
                    <button onclick="removeFromCart(${item.id})" style="background:none;border:none;color:red;cursor:pointer;font-size:14px">Удалить</button>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <span style="color:#666">Количество:</span>
                    <div style="display:flex;gap:8px;align-items:center">
                        <button onclick="updateQuantityInCart(${item.id}, ${item.quantity - 1})" style="padding:4px 8px;border:1px solid #ddd;background:white;cursor:pointer">-</button>
                        <span style="min-width:30px;text-align:center">${item.quantity}</span>
                        <button onclick="updateQuantityInCart(${item.id}, ${item.quantity + 1})" style="padding:4px 8px;border:1px solid #ddd;background:white;cursor:pointer">+</button>
                    </div>
                    <span style="font-weight:bold">${(item.price * item.quantity).toLocaleString('ru-RU')}₽</span>
                </div>
            </div>
        `).join('');
        
        html = `
            <div style="width:100%;max-width:1440px;background-color:rgb(255, 234, 210);padding:48px 16px">                
                <div style="display:flex;gap:32px;flex-wrap:wrap">
                    <div style="flex:1;min-width:300px;background:white;padding:24px;border-radius:8px">
                        ${itemsHtml}
                    </div>
                    
                    <div style="flex:0 0 100%;background:white;padding:24px;border-radius:8px;height:fit-content;position:sticky;top:20px">
                        <h2 style="margin:0 0 24px 0;font-size:20px">Итого</h2>
                        
                        <div style="display:flex;justify-content:space-between;margin-bottom:16px">
                            <span>Товаров:</span>
                            <span>${cart.reduce((sum, item) => sum + item.quantity, 0)}</span>
                        </div>
                        
                        <div style="display:flex;justify-content:space-between;margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid #eee">
                            <span style="font-weight:bold;font-size:18px">Сумма:</span>
                            <span style="font-weight:bold;font-size:18px;color:#3264b1">${total.toLocaleString('ru-RU')}₽</span>
                        </div>
                        
                        <button class="hoverBlack" onclick="openCheckout()" style="width:100%;padding:16px;margin-bottom:16px">
                            <div>Оформить заказ</div>
                        </button>
                        
                        <a href="index.html" style="display:block;text-align:center;color:#3264b1;text-decoration:underline">Назад</a>
                    </div>
                </div>
            </div>
        `;
    }
    
    // ЭТАП 2: Создание платежа (загрузка)
    else if (checkoutStep === 'payment' && !currentPaymentData) {
        html = `
            <div style="width:100%;max-width:1440px;background-color:rgb(255, 234, 210);padding:48px 16px">
                <h1 style="font-size:36px;margin-bottom:32px;color:#000;font-family:Eina">Оформление заказа</h1>
                <div style="background:white;padding:48px;border:2px solid #000;text-align:center">
                    <p style="font-size:18px;color:#000">Создание платежа...</p>
                </div>
            </div>
        `;
    }
    
    // ЭТАП 3: Ожидание оплаты
    else if (checkoutStep === 'payment' && currentPaymentData && currentPaymentData.status === 'pending') {
        const statusText = currentPaymentData.status === 'expired' ? 'Истёк срок' : 'Ожидание оплаты';
        
        html = `
            <div style="width:100%;max-width:1440px;background-color:rgb(255, 234, 210);padding:48px 16px">
                <h1 style="font-size:36px;margin-bottom:32px;color:#000;font-family:Eina">Оплата заказа</h1>
                
                <div style="background:white;padding:32px;border:2px solid #000">
                    <h2 style="margin:0 0 24px 0;font-size:24px;color:#000;font-family:Eina">Информация для оплаты</h2>
                    
                    <div style="margin-bottom:20px;padding:16px;background:linear-gradient(90deg, rgba(255,128,0,1) 0%, rgba(255,162,0,1) 50%, rgba(255,179,0,1) 100%);border:2px solid #000">
                        <strong style="color:#000">Статус:</strong> <span style="color:#000">${statusText}</span>
                    </div>
                    
                    <div style="margin-bottom:20px">
                        <strong style="display:block;margin-bottom:8px;color:#000">Monero адрес:</strong>
                        <code style="display:block;background:#f5f5f5;padding:12px;border:2px solid #000;word-break:break-all;font-size:12px;font-family:monospace;color:#000">${currentPaymentData.moneroAddress}</code>
                        <button onclick="copyToClipboard('${currentPaymentData.moneroAddress}')" class="hoverBlack" style="margin-top:8px;padding:8px 16px;cursor:pointer;border:2px solid #000">Копировать адрес</button>
                    </div>
                    
                    <div style="margin-bottom:20px;color:#000">
                        <strong>Сумма к оплате:</strong> ${currentPaymentData.xmrAmount} XMR (${currentPaymentData.totalRub.toLocaleString('ru-RU')}₽)
                    </div>
                    
                    <div style="margin-bottom:20px;color:#000">
                        <strong>ID платежа:</strong> <code style="background:#f5f5f5;padding:4px 8px;border:1px solid #000">${currentPaymentData.paymentId}</code>
                    </div>
                    
                    <div style="margin-bottom:20px;padding:12px;background:#fff3cd;border:2px solid #000">
                        <strong style="color:#000">Истекает через:</strong> <span id="payment-timer" style="color:#000">60:00</span>
                    </div>
                    
                    <div style="display:flex;gap:12px;margin-top:24px;flex-wrap:wrap">
                        <button onclick="checkPaymentStatus(false)" class="hoverBlack" style="flex:1;min-width:200px;padding:12px;cursor:pointer;font-size:16px">
                            Проверить статус
                        </button>
                        <button onclick="simulatePayment()" class="hoverBlack" style="flex:1;min-width:200px;padding:12px;cursor:pointer;font-size:16px">
                            Симулировать оплату
                        </button>
                    </div>
                    
                    <button onclick="backToCart()" style="width:100%;margin-top:12px;padding:12px;background:#ddd;color:#000;border:2px solid #000;cursor:pointer;font-size:16px;transition:all .5s" onmouseover="this.style.background='#ccc'" onmouseout="this.style.background='#ddd'">
                        Вернуться к корзине
                    </button>
                </div>
            </div>
        `;
    }
    
    // ЭТАП 4: Успешная оплата
    else if (checkoutStep === 'success') {
        // Проверяем есть ли координаты
        let coordsSection = '';
        if (currentPaymentData?.coordinates && currentPaymentData.coordinates.length > 0) {
            const coordsList = currentPaymentData.coordinates.map(item => {
                let coordsHtml = '';
                
                if (item.coordinates && item.coordinates.length > 0) {
                    coordsHtml = item.coordinates.map((coord, index) => `
                        <div style="margin-bottom:8px;padding:8px;background:#f5f5f5;border:2px solid #000">
                            <strong style="color:#000">Координата ${index + 1}:</strong>
                            <code style="display:block;margin-top:4px;font-family:monospace;font-size:13px;color:#FF8000">${coord}</code>
                        </div>
                    `).join('');
                } else {
                    coordsHtml = '<p style="color:#666;font-style:italic">Координаты не найдены</p>';
                }
                
                const availableInfo = item.available_quantity !== undefined 
                    ? `<p style="margin:4px 0;color:#666;font-size:14px"></p>`
                    : '';
                
                return `
                    <div style="margin-bottom:20px;padding:16px;background:white;border:2px solid #000;text-align:left">
                        <h3 style="margin:0 0 8px 0;font-size:18px;color:#000;font-family:Eina">${item.product_name}</h3>
                        <p style="margin:0 0 4px 0;color:#000"><strong>Заказано:</strong> ${item.quantity} шт.</p>
                        ${availableInfo}
                        <div style="margin-top:12px">
                            <strong style="display:block;margin-bottom:8px;color:#000">Координаты:</strong>
                            ${coordsHtml}
                        </div>
                    </div>
                `;
            }).join('');
            
            coordsSection = `
                <div style="margin:32px 0;text-align:left">
                    <h3 style="text-align:center;margin-bottom:24px;color:#333;font-size:20px">Ваши координаты товаров:</h3>
                    ${coordsList}
                </div>
            `;
        }
        
        html = `
            <div style="width:100%;max-width:1440px;background-color:rgb(255, 234, 210);padding:48px 16px">
                <h1 style="font-size:36px;margin-bottom:32px;text-align:center;color:#000;font-family:Eina">Заказ выполнен</h1>
                
                <div style="background:white;padding:48px;border:2px solid #000">
                    <div style="text-align:center">
                        <div style="font-size:64px;margin-bottom:24px">✓</div>
                        <h2 style="color:#FF8000;margin:0 0 16px 0;font-size:28px;font-family:Eina">Платёж подтверждён!</h2>
                        <p style="color:#000;font-size:18px;margin-bottom:32px">Заказ успешно выполнен.</p>
                    </div>
                    
                    ${coordsSection}
                    
                    <div style="text-align:center;margin-top:32px;padding-top:24px;border-top:2px solid #000">
                        <button onclick="clearCart(); backToCart();" class="hoverBlack" style="padding:12px 32px;cursor:pointer;font-size:16px;margin-right:12px;margin-bottom:12px">
                            Очистить корзину
                        </button>
                        <button onclick="backToCart()" style="padding:12px 32px;background:#ddd;color:#000;border:2px solid #000;cursor:pointer;font-size:16px;transition:all .5s" onmouseover="this.style.background='#ccc'" onmouseout="this.style.background='#ddd'">
                            Вернуться к корзине
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    // ЭТАП 5: Ошибка создания платежа
    else if (checkoutStep === 'error') {
        html = `
            <div style="width:100%;max-width:1440px;background-color:rgb(255, 234, 210);padding:48px 16px">
                <h1 style="font-size:36px;margin-bottom:32px;color:#000;font-family:Eina">Ошибка</h1>
                
                <div style="background:white;padding:48px;border:2px solid #000;text-align:center">
                    <div style="font-size:64px;margin-bottom:24px;color:#f44336">✗</div>
                    <h2 style="color:#f44336;margin:0 0 16px 0;font-size:28px;font-family:Eina">Не удалось создать платёж</h2>
                    <p style="color:#000;font-size:16px;margin-bottom:24px">${currentPaymentData?.error || 'Неизвестная ошибка'}</p>
                    
                    <button onclick="testPayment()" class="hoverBlack" style="width:100%;max-width:300px;padding:16px;cursor:pointer;font-size:18px;font-weight:bold;margin-bottom:12px">
                        Тестовая оплата
                    </button>
                    
                    <button onclick="backToCart()" style="width:100%;max-width:300px;padding:12px;background:#ddd;color:#000;border:2px solid #000;cursor:pointer;font-size:16px;transition:all .5s" onmouseover="this.style.background='#ccc'" onmouseout="this.style.background='#ddd'">
                        Вернуться к корзине
                    </button>
                </div>
            </div>
        `;
    }
    
    // ЭТАП 6: Тестовая оплата (загрузка)
    else if (checkoutStep === 'test-loading') {
        html = `
            <div style="width:100%;max-width:1440px;background-color:rgb(255, 234, 210);padding:48px 16px">
                <h1 style="font-size:36px;margin-bottom:32px;color:#000;font-family:Eina">Тестовая оплата</h1>
                
                <div style="background:white;padding:48px;border:2px solid #000;text-align:center">
                    <p style="font-size:18px;color:#000">Обработка тестовой оплаты...</p>
                </div>
            </div>
        `;
    }
    
    // ЭТАП 7: Успешная тестовая оплата
    else if (checkoutStep === 'test-success') {
        const coordsList = currentPaymentData?.coordinates?.map(item => {
            let coordsHtml = '';
            
            if (item.coordinates && item.coordinates.length > 0) {
                coordsHtml = item.coordinates.map((coord, index) => `
                    <div style="margin-bottom:8px;padding:8px;background:#f5f5f5;border:2px solid #000">
                        <strong style="color:#000">Координата ${index + 1}:</strong>
                        <code style="display:block;margin-top:4px;font-family:monospace;font-size:13px;color:#FF8000">${coord}</code>
                    </div>
                `).join('');
            } else {
                coordsHtml = '<p style="color:#666;font-style:italic">Координаты не найдены</p>';
            }
            
            const availableInfo = item.available_quantity !== undefined 
                ? `<p style="margin:4px 0;color:#666;font-size:14px"></p>`
                : '';
            
            return `
                <div style="margin-bottom:20px;padding:16px;background:white;border:2px solid #000;text-align:left">
                    <h3 style="margin:0 0 8px 0;font-size:18px;color:#000;font-family:Eina">${item.product_name}</h3>
                    <p style="margin:0 0 4px 0;color:#000"><strong>Заказано:</strong> ${item.quantity} шт.</p>
                    ${availableInfo}
                    <div style="margin-top:12px">
                        <strong style="display:block;margin-bottom:8px;color:#000">Координаты:</strong>
                        ${coordsHtml}
                    </div>
                </div>
            `;
        }).join('') || '<p style="text-align:center;color:#000">Координаты не найдены</p>';
        
        html = `
            <div style="width:100%;max-width:1440px;background-color:rgb(255, 234, 210);padding:48px 16px">
                <h1 style="font-size:36px;margin-bottom:32px;text-align:center;color:#000;font-family:Eina">Тестовая оплата выполнена</h1>
                
                <div style="background:white;padding:32px;border:2px solid #000">
                    <div style="text-align:center;margin-bottom:32px">
                        <div style="font-size:64px;margin-bottom:16px;color:#FF8000">✓</div>
                        <h2 style="color:#FF8000;margin:0 0 8px 0;font-family:Eina">Оплата подтверждена!</h2>
                        <p style="color:#000">Ваши координаты товаров:</p>
                    </div>
                    
                    ${coordsList}
                    
                    <div style="text-align:center;margin-top:32px;padding-top:24px;border-top:2px solid #000">
                        <button onclick="clearCart(); backToCart();" class="hoverBlack" style="padding:12px 32px;cursor:pointer;font-size:16px;margin-right:12px;margin-bottom:12px">
                            Очистить корзину
                        </button>
                        <button onclick="backToCart()" style="padding:12px 32px;background:#ddd;color:#000;border:2px solid #000;cursor:pointer;font-size:16px;transition:all .5s" onmouseover="this.style.background='#ccc'" onmouseout="this.style.background='#ddd'">
                            Вернуться к корзине
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    cartContainer.innerHTML = html;
}

// Отрендерить товары в index
function renderProducts(products) {
    const productsContainer = document.getElementById('products-container');
    
    if (!productsContainer) return;
    
    let html = `
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(250px, 1fr));gap:24px">
    `;
    
    products.forEach(product => {
        html += `
            <div style="background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);transition:transform 0.2s">
                <div style="background:#f0f0f0;height:200px;display:flex;align-items:center;justify-content:center">
                    <img src="${product.image || 'placeholder.jpg'}" alt="${product.name}" style="width:100%;height:100%;object-fit:cover">
                </div>
                <div style="padding:16px">
                    <h3 style="margin:0 0 8px 0;font-size:18px">${product.name}</h3>
                    <p style="margin:0 0 12px 0;color:#666;font-size:14px">${product.description || ''}</p>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                        <span style="font-weight:bold;font-size:18px;color:#3264b1">${product.price.toLocaleString('ru-RU')}₽</span>
                        <span style="color:#999;font-size:12px">${product.quantity} шт</span>
                    </div>
                    <button onclick="goToProduct(${product.id})" style="width:100%;padding:12px;background:#3264b1;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px">
                        Подробнее
                    </button>
                </div>
            </div>
        `;
    });
    
    html += `
        </div>
    `;
    
    productsContainer.innerHTML = html;
}

// Редирект на страницу товара с ID
function goToProduct(productId) {
    window.location.href = `/product.html?id=${productId}`;
}

// Инициализировать значок корзины при загрузке
document.addEventListener('DOMContentLoaded', updateCartBadge);