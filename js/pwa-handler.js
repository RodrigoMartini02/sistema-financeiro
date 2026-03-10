/**
 * Fin-Gerence - PWA Installation Handler
 * Gerencia a detecção e o banner de instalação customizado
 */

(function() {
    try {
        let deferredPrompt;
        
        // Seleção dos elementos
        const pwaBanner = document.getElementById('pwa-install-banner');
        const pwaOverlay = document.getElementById('pwa-overlay');
        const androidActions = document.getElementById('pwa-android-actions');
        const iosInstructions = document.getElementById('pwa-ios-instructions');

        // Detecções de Sistema e Estado
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

        // Função para mostrar o banner centralizado
        const showPwaModal = (type) => {
            if (!pwaBanner || !pwaOverlay) return;

            pwaBanner.style.display = 'block';
            pwaOverlay.style.display = 'block';

            if (type === 'android') {
                if (androidActions) androidActions.style.display = 'block';
                if (iosInstructions) iosInstructions.style.display = 'none';
            } else if (type === 'ios') {
                if (androidActions) androidActions.style.display = 'none';
                if (iosInstructions) iosInstructions.style.display = 'block';
            }
        };

        // Função para fechar o modal
        const closePwaModal = () => {
            if (pwaBanner) pwaBanner.style.display = 'none';
            if (pwaOverlay) pwaOverlay.style.display = 'none';
            // Opcional: não mostrar novamente nesta sessão
            sessionStorage.setItem('pwa_prompt_closed', 'true');
        };

        // 1. LÓGICA ANDROID / CHROME
        window.addEventListener('beforeinstallprompt', (e) => {
            // Impede o banner padrão do navegador
            e.preventDefault();
            // Salva o evento para disparar no clique do botão "Baixar"
            deferredPrompt = e;

            // Se não estiver instalado e não tiver sido fechado nesta sessão, mostra
            if (!isStandalone && !sessionStorage.getItem('pwa_prompt_closed')) {
                showPwaModal('android');
            }
        });

        // 2. LÓGICA IOS / SAFARI
        // iOS não tem o evento 'beforeinstallprompt', mostramos por tempo de navegação
        if (isIOS && !isStandalone && !sessionStorage.getItem('pwa_prompt_closed')) {
            setTimeout(() => {
                showPwaModal('ios');
            }, 6000); // 6 segundos após carregar
        }

        // 3. EVENTOS DOS BOTÕES
        
        // Botão Baixar (Android)
        const btnInstall = document.getElementById('btn-install-pwa');
        if (btnInstall) {
            btnInstall.addEventListener('click', async () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    console.log(`[PWA] Escolha do usuário: ${outcome}`);
                    deferredPrompt = null;
                    closePwaModal();
                }
            });
        }

        // Botões de Fechar (Ambos)
        document.querySelectorAll('.btn-close-pwa').forEach(btn => {
            btn.addEventListener('click', closePwaModal);
        });

        // Fechar ao clicar no overlay (fundo escuro)
        if (pwaOverlay) {
            pwaOverlay.addEventListener('click', closePwaModal);
        }

    } catch (err) {
        console.error("[PWA Handler Error]: ", err);
    }
})();