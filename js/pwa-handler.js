// js/pwa-handler.js
(function() {
    try {
        let deferredPrompt;
        const pwaBanner = document.getElementById('pwa-install-banner');
        const androidActions = document.getElementById('pwa-android-actions');
        const iosInstructions = document.getElementById('pwa-ios-instructions');

        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

        if (!isStandalone) {
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                deferredPrompt = e;
                if (pwaBanner && androidActions) {
                    pwaBanner.style.display = 'block';
                    androidActions.style.display = 'flex';
                }
            });

            if (isIOS) {
                setTimeout(() => {
                    if (pwaBanner && iosInstructions) {
                        pwaBanner.style.display = 'block';
                        iosInstructions.style.display = 'block';
                    }
                }, 5000);
            }
        }

        const btnInstall = document.getElementById('btn-install-pwa');
        if (btnInstall) {
            btnInstall.addEventListener('click', async () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    await deferredPrompt.userChoice;
                    deferredPrompt = null;
                    pwaBanner.style.display = 'none';
                }
            });
        }

        document.querySelectorAll('.btn-close-pwa').forEach(btn => {
            btn.addEventListener('click', () => {
                pwaBanner.style.display = 'none';
            });
        });
    } catch (error) {
        console.error("Erro no PWA Handler, mas seguindo com o login:", error);
    }
})();