(function() {
    const STORAGE_KEY = 'sf-theme';

    function aplicarTema(tema) {
        document.documentElement.setAttribute('data-theme', tema);
        localStorage.setItem(STORAGE_KEY, tema);
        const icon = document.getElementById('theme-icon');
        if (icon) {
            icon.className = tema === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
        }
    }

    // Aplica tema salvo imediatamente (antes do DOM completo para evitar flash)
    const temaSalvo = localStorage.getItem(STORAGE_KEY) || 'dark';
    document.documentElement.setAttribute('data-theme', temaSalvo);

    document.addEventListener('DOMContentLoaded', function() {
        // Atualiza ícone após DOM
        const icon = document.getElementById('theme-icon');
        if (icon) icon.className = temaSalvo === 'dark' ? 'fas fa-moon' : 'fas fa-sun';

        const btn = document.getElementById('btn-toggle-theme');
        if (btn) {
            btn.addEventListener('click', function() {
                const atual = document.documentElement.getAttribute('data-theme') || 'dark';
                aplicarTema(atual === 'dark' ? 'light' : 'dark');
            });
        }
    });
})();
