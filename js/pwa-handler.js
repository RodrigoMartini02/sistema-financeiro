/**
 * PWA Handler - Fin-Gerence
 * Gerencia a instalação do Web App em Android e iOS
 */

let deferredPrompt;
const pwaBanner = document.getElementById('pwa-install-banner');
const androidActions = document.getElementById('pwa-android-actions');
const iosInstructions = document.getElementById('pwa-ios-instructions');

// 1. Identificar se é iOS e se já está instalado
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

// 2. Lógica para Android (Chrome)
window.addEventListener('beforeinstallprompt', (e) => {
    // Impede o banner automático do navegador
    e.preventDefault();
    // Guarda o evento
    deferredPrompt = e;
    
    // Se não estiver instalado, mostra o nosso banner com botões Android
    if (!isStandalone) {
        pwaBanner.style.display = 'block';
        androidActions.style.display = 'flex';
        iosInstructions.style.display = 'none';
    }
});

// 3. Lógica para iOS (Safari)
// O iOS não tem o evento 'beforeinstallprompt', então mostramos por tempo
if (isIOS && !isStandalone) {
    // Mostra o banner após 5 segundos para não ser invasivo
    setTimeout(() => {
        pwaBanner.style.display = 'block';
        androidActions.style.display = 'none';
        iosInstructions.style.display = 'block';
    }, 5000);
}

// 4. Executar a instalação (Botão Android)
const btnInstall = document.getElementById('btn-install-pwa');
if (btnInstall) {
    btnInstall.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`[PWA] Usuário respondeu à instalação: ${outcome}`);
            deferredPrompt = null;
            pwaBanner.style.display = 'none';
        }
    });
}

// 5. Fechar o banner (Botão Cancelar/Depois)
document.querySelectorAll('.btn-close-pwa').forEach(btn => {
    btn.addEventListener('click', () => {
        pwaBanner.style.display = 'none';
        // Opcional: Salvar no sessionStorage para não incomodar o usuário na mesma sessão
        sessionStorage.setItem('pwa-banner-closed', 'true');
    });
});

// 6. Esconder se já foi fechado nesta sessão
if (sessionStorage.getItem('pwa-banner-closed')) {
    pwaBanner.style.display = 'none';
}