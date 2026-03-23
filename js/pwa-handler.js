(function() {
    try {
        let deferredPrompt;
        const banner = document.getElementById('pwa-install-banner');
        const overlay = document.getElementById('pwa-overlay');
        const androidActions = document.getElementById('pwa-android-actions');
        const iosInstructions = document.getElementById('pwa-ios-instructions');

        // Detecção de ambiente
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth <= 768;

        // FUNÇÃO PARA ABRIR (Usa setProperty para vencer o !important do CSS se necessário)
        const openPwaModal = (type) => {
            if (!banner || !overlay) return;
            banner.style.setProperty('display', 'block', 'important');
            overlay.style.setProperty('display', 'block', 'important');
            
            if (type === 'android') {
                androidActions.style.display = 'block';
                iosInstructions.style.display = 'none';
            } else {
                androidActions.style.display = 'none';
                iosInstructions.style.display = 'block';
            }
        };

        // FUNÇÃO PARA FECHAR
        window.fecharModalPwa = () => {
            if (!banner || !overlay) return;
            banner.style.setProperty('display', 'none', 'important');
            overlay.style.setProperty('display', 'none', 'important');
            sessionStorage.setItem('pwa_banner_viewed', 'true');
        };

        // FUNÇÃO DE INSTALAÇÃO
        window.iniciarInstalacao = async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                deferredPrompt = null;
                window.fecharModalPwa();
                
                // Chrome já mostra seu próprio status de instalação — não exibir toast duplicado
            }
        };

        // Escutador Android (Chrome/Edge) — somente mobile
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            if (isMobile && !isStandalone && !sessionStorage.getItem('pwa_banner_viewed')) {
                openPwaModal('android');
            }
        });

        // Escutador iOS (Safari) — somente mobile
        if (isMobile && isIOS && !isStandalone && !sessionStorage.getItem('pwa_banner_viewed')) {
            setTimeout(() => openPwaModal('ios'), 5000);
        }

        // Listeners dos botões
        overlay?.addEventListener('click', window.fecharModalPwa);
        document.getElementById('btn-install-pwa')?.addEventListener('click', window.iniciarInstalacao);
        document.getElementById('btn-pwa-dispensar')?.addEventListener('click', window.fecharModalPwa);
        document.getElementById('btn-pwa-entendi')?.addEventListener('click', window.fecharModalPwa);

    } catch (e) {
        console.error("PWA Handler Error:", e); 
    }
})();