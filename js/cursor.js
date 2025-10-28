// Создаем кастомный анимированный курсор
document.addEventListener('DOMContentLoaded', function() {
    const cursor = document.createElement('div');
    cursor.id = 'custom-cursor';
    cursor.style.cssText = `
        position: fixed;
        width: 32px;
        height: 32px;
        pointer-events: none;
        z-index: 99999;
        transform: translate(-50%, -50%);
        background-image: url('images/cursor.gif');
        background-size: contain;
        background-repeat: no-repeat;
    `;
    document.body.appendChild(cursor);

    // Обновляем позицию курсора при движении мыши
    document.addEventListener('mousemove', function(e) {
        cursor.style.left = e.clientX + 'px';
        cursor.style.top = e.clientY + 10 + 'px';
    });

    document.addEventListener('mouseleave', function() {
        cursor.style.display = 'none';
    });

    // Показываем курсор когда мышь входит в окно
    document.addEventListener('mouseenter', function() {
        cursor.style.display = 'block';
    });
});
