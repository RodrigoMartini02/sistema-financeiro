(function() {
    try {
        let deferredPrompt;
        const banner = document.getElementById('pwa-install-banner');
        const overlay = document.getElementById('pwa-overlay');
        const androidActions = document.getElementById('pwa-android-actions');
        const iosInstructions = document.getElementById('pwa-ios-instructions');

        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

        const openPwaModal = (type) => {
            if (!banner || !overlay) return;
            banner.style.display = 'block';
            overlay.style.display = 'block';
            
            if (type === 'android') {
                androidActions.style.display = 'block';
                iosInstructions.style.display = 'none';
            } else {
                androidActions.style.display = 'none';
                iosInstructions.style.display = 'block';
            }
        };

        const closePwaModal = () => {
            banner.style.display = 'none';
            overlay.style.display = 'none';
            sessionStorage.setItem('pwa_banner_viewed', 'true');
        };

        // Escutador Android
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            if (!isStandalone && !sessionStorage.getItem('pwa_banner_viewed')) {
                openPwaModal('android');
            }
        });

        // Escutador iOS
        if (isIOS && !isStandalone && !sessionStorage.getItem('pwa_banner_viewed')) {
            setTimeout(() => openPwaModal('ios'), 5000);
        }

        // Botão de instalação Android
        document.getElementById('btn-install-pwa')?.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                await deferredPrompt.userChoice;
                deferredPrompt = null;
                closePwaModal();
            }
        });

        // Botões de fechar e clique no fundo
        document.querySelectorAll('.btn-close-pwa').forEach(btn => btn.addEventListener('click', closePwaModal));
        overlay?.addEventListener('click', closePwaModal);

    } catch (e) { console.error("PWA Handler Error:", e); }
})();