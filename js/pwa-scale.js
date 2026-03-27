(function () {
    var sidebar = null;
    var mainContent = null;

    function applyScale() {
        var isPortrait = window.innerHeight > window.innerWidth;

        // Em portrait (mobile): colapsar sidebar para liberar espaço visual
        if (isPortrait && sidebar && !sidebar.classList.contains('collapsed')) {
            sidebar.classList.add('collapsed');
            if (mainContent) mainContent.classList.add('sidebar-collapsed');
        }
    }

    function init() {
        sidebar = document.getElementById('sidebar');
        mainContent = document.querySelector('.main-content');

        applyScale();

        // Re-verificar ao rotacionar ou redimensionar
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
