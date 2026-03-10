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

        // FUNÇÃO PARA FECHAR (Exposta globalmente para o onclick do HTML)
        window.fecharModalPwa = () => {
            if (!banner || !overlay) return;
            banner.style.setProperty('display', 'none', 'important');
            overlay.style.setProperty('display', 'none', 'important');
            sessionStorage.setItem('pwa_banner_viewed', 'true');
        };

        // FUNÇÃO DE INSTALAÇÃO (Exposta globalmente para o onclick do HTML)
        window.iniciarInstalacao = async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`Usuário respondeu à instalação: ${outcome}`);
                deferredPrompt = null;
                window.fecharModalPwa();
                
                // Feedback discreto
                if (outcome === 'accepted') {
                    const toast = document.createElement('div');
                    toast.className = 'pwa-toast';
                    toast.innerText = "Instalação iniciada...";
                    document.body.appendChild(toast);
                    setTimeout(() => toast.remove(), 3000);
                }
            }
        };

        // Escutador Android (Chrome/Edge)
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            // Só mostra se não estiver instalado e não tiver visto nesta sessão
            if (!isStandalone && !sessionStorage.getItem('pwa_banner_viewed')) {
                openPwaModal('android');
            }
        });

        // Escutador iOS (Safari)
        if (isIOS && !isStandalone && !sessionStorage.getItem('pwa_banner_viewed')) {
            // No iOS, aguardamos 5s para não assustar o usuário assim que ele entra
            setTimeout(() => openPwaModal('ios'), 5000);
        }

        // Listener para clique no overlay (fundo escuro)
        overlay?.addEventListener('click', window.fecharModalPwa);

    } catch (e) { 
        console.error("PWA Handler Error:", e); 
    }
})();