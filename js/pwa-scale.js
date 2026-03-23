(function () {
    // Largura de referência do layout desktop
    var DESIGN_WIDTH = 1200;
    var sidebar = null;
    var mainContent = null;

    function applyScale() {
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        var isPortrait = vh > vw;
        var scale = vw / DESIGN_WIDTH;

        // Em portrait: colapsar sidebar para liberar espaço visual
        if (isPortrait) {
            if (sidebar && !sidebar.classList.contains('collapsed')) {
                sidebar.classList.add('collapsed');
                if (mainContent) mainContent.classList.add('sidebar-collapsed');
            }
        }

        // Definir variável CSS usada pelo pwa.css
        document.documentElement.style.setProperty('--app-scale', scale.toFixed(4));
    }

    function init() {
        sidebar = document.getElementById('sidebar');
        mainContent = document.querySelector('.main-content');

        applyScale();

        // Re-calcular ao rotacionar ou redimensionar
        window.addEventListener('resize', applyScale);
        window.addEventListener('orientationchange', function () {
            // orientationchange dispara antes do innerWidth atualizar
            setTimeout(applyScale, 150);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
