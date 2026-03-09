(function () {
    var tips = [
        'Organizando suas finanças...',
        'Carregando dashboard personalizado...',
        'Preparando relatórios financeiros...',
        'Sincronizando dados...',
        'Quase lá, aguarde mais um instante...'
    ];
    var tipInterval = null;

    function startTips() {
        var tipText = document.querySelector('.tip-text');
        if (!tipText) return;
        var currentTip = 0;
        function rotate() {
            tipText.style.opacity = '0';
            setTimeout(function () {
                tipText.textContent = tips[currentTip];
                tipText.style.opacity = '1';
                currentTip = (currentTip + 1) % tips.length;
            }, 300);
        }
        rotate();
        tipInterval = setInterval(rotate, 3000);
    }

    window.showLoadingScreen = function () {
        var screen = document.getElementById('loading-screen');
        if (!screen) return;
        screen.classList.add('active');
        startTips();
    };

    window.hideLoadingScreen = function () {
        if (tipInterval) { clearInterval(tipInterval); tipInterval = null; }
        var screen = document.getElementById('loading-screen');
        if (!screen) return;
        screen.classList.add('fade-out');
        setTimeout(function () { screen.classList.remove('active', 'fade-out'); }, 1000);
    };

    // Auto-iniciar tips se a tela já estiver ativa (index.html)
    document.addEventListener('DOMContentLoaded', function () {
        var screen = document.getElementById('loading-screen');
        if (screen && screen.classList.contains('active')) {
            startTips();
        }
    });
})();
