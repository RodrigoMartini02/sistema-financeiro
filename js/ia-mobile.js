// ================================================================
// IA-MOBILE.JS — Controller exclusivo para ia-mobile.html
// Bottom sheet, perfil, logout, Android back button,
// scroll automático, botão ↓, vibração, PWA install prompt
// ================================================================

(function () {
    'use strict';

    // ── Elementos ────────────────────────────────────────────────
    var backdrop      = document.getElementById('im-sheet-backdrop');
    var sheet         = document.getElementById('im-bottom-sheet');
    var btnSettings   = document.getElementById('im-btn-settings');
    var btnClose      = document.getElementById('im-btn-close-sheet');
    var btnNovaMob    = document.getElementById('im-btn-nova-conversa');
    var btnIrApp      = document.getElementById('im-btn-ir-app');
    var btnLogout     = document.getElementById('im-btn-logout');
    var userNomeEl    = document.getElementById('im-user-nome');
    var chatArea      = document.getElementById('ia-chat-area');
    var scrollBtn     = document.getElementById('im-scroll-btn');
    var installBanner = document.getElementById('im-install-banner');
    var btnInstalar   = document.getElementById('im-btn-instalar');
    var btnDismiss    = document.getElementById('im-btn-dismiss-install');

    // ── 1. SCROLL AUTOMÁTICO + BOTÃO ↓ ───────────────────────────
    var _deferredInstall = null;

    function scrollParaBaixo() {
        if (!chatArea) return;
        chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
    }

    function atualizarScrollBtn() {
        if (!chatArea || !scrollBtn) return;
        var distanciaDoFim = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight;
        if (distanciaDoFim > 120) {
            scrollBtn.classList.add('visible');
        } else {
            scrollBtn.classList.remove('visible');
        }
    }

    if (chatArea) {
        chatArea.addEventListener('scroll', atualizarScrollBtn, { passive: true });
    }

    if (scrollBtn) {
        scrollBtn.addEventListener('click', function () {
            scrollParaBaixo();
            if ('vibrate' in navigator) navigator.vibrate(20);
        });
    }

    // Observar novas mensagens para scroll automático
    // Só rola se o usuário já estiver perto do fim (não interrompe quem lê histórico)
    if (chatArea) {
        var observer = new MutationObserver(function () {
            var distanciaDoFim = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight;
            if (distanciaDoFim < 200) {
                // Usuário está perto do fim — rolar automaticamente
                requestAnimationFrame(function () {
                    chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
                });
            }
            atualizarScrollBtn();
        });
        observer.observe(chatArea, { childList: true, subtree: true });
    }

    // ── 2. FEEDBACK TÁTIL (vibração ao enviar) ───────────────────
    var btnSend = document.getElementById('ia-btn-send');
    if (btnSend && 'vibrate' in navigator) {
        btnSend.addEventListener('click', function () {
            navigator.vibrate(40);
        });
    }

    // Vibrar também ao apertar Enter no textarea
    var textarea = document.getElementById('ia-texto-input');
    if (textarea && 'vibrate' in navigator) {
        textarea.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                navigator.vibrate(40);
            }
        });
    }

    // ── BOTTOM SHEET ─────────────────────────────────────────────
    var _sheetInHistory = false;

    function abrirSheet() {
        backdrop.classList.add('visible');
        sheet.classList.add('open');
        history.pushState({ imSheet: true }, '');
        _sheetInHistory = true;
    }

    function fecharSheet() {
        backdrop.classList.remove('visible');
        sheet.classList.remove('open');
        if (_sheetInHistory) {
            _sheetInHistory = false;
            history.back();
        }
    }

    if (btnSettings) btnSettings.addEventListener('click', abrirSheet);
    if (btnClose)    btnClose.addEventListener('click', fecharSheet);
    if (backdrop)    backdrop.addEventListener('click', fecharSheet);

    // Android back button: fecha sheet se aberto
    window.addEventListener('popstate', function () {
        if (sheet && sheet.classList.contains('open')) {
            _sheetInHistory = false;
            fecharSheet();
        }
    });

    // ── Ações rápidas no sheet ────────────────────────────────────
    document.addEventListener('click', function (e) {
        var acaoBtn = e.target.closest('[data-acao-rapida]');
        if (acaoBtn && acaoBtn.closest('.im-bottom-sheet')) {
            var texto = acaoBtn.getAttribute('data-acao-rapida');
            fecharSheet();
            setTimeout(function () {
                var input = document.getElementById('ia-texto-input');
                if (input) {
                    input.value = texto;
                    input.dispatchEvent(new Event('input'));
                    input.focus();
                    var send = document.getElementById('ia-btn-send');
                    if (send) send.click();
                }
            }, 300);
        }
    });

    // ── Configurar IA (wire que ia.js não faz em modoPagina) ──────
    (function setupIAConfig() {
        var HINTS = {
            openai: 'Chave começa com <code>sk-</code>. Obtenha em platform.openai.com',
            gemini: 'Obtenha sua chave em aistudio.google.com/apikey',
            claude: 'Chave começa com <code>sk-ant-</code>. Obtenha em console.anthropic.com'
        };
        var LABELS = {
            gen:    'Gen ativa — IA interna KASH',
            openai: 'OpenAI ativa — GPT-4o mini',
            gemini: 'Google Gemini ativo — Gemini 2.0 Flash',
            claude: 'Anthropic Claude ativo — Claude Haiku'
        };
        var MASK = '••••••••';
        var API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

        function getToken() {
            return sessionStorage.getItem('token') || localStorage.getItem('token');
        }

        function atualizarUI() {
            var sel  = document.getElementById('ia-provider-select');
            var row  = document.getElementById('ia-key-row');
            var hint = document.getElementById('ia-key-hint');
            if (!sel) return;
            var v = sel.value;
            if (row)  row.style.display = (v === 'gen') ? 'none' : 'flex';
            if (hint) hint.innerHTML    = HINTS[v] || '';
        }

        function salvar() {
            var sel   = document.getElementById('ia-provider-select');
            var inp   = document.getElementById('ia-api-key-input');
            var badge = document.getElementById('ia-badge-status');
            if (!sel) return;
            var provider = sel.value;
            var chave    = inp ? inp.value.trim() : '';
            if (chave === MASK) chave = '';
            if (provider !== 'gen' && !chave && !sessionStorage.getItem('ia_tem_chave_' + provider)) {
                if (typeof window.mostrarToast === 'function') window.mostrarToast('Informe a chave antes de salvar.', 'warning');
                return;
            }
            fetch(API_URL + '/ai/config/chave', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
                body: JSON.stringify({ provider: provider, api_key: chave })
            }).then(function (r) { return r.json(); }).then(function (res) {
                if (res && res.success) {
                    if (typeof window.mostrarToast === 'function') window.mostrarToast((LABELS[provider] || 'Configuração salva') + ' ativa!', 'success');
                    if (inp && provider !== 'gen') { inp.value = MASK; sessionStorage.setItem('ia_tem_chave_' + provider, '1'); }
                    else if (inp) inp.value = '';
                    if (badge) { badge.textContent = LABELS[provider] || provider; badge.className = 'badge ia-badge-status ' + (provider === 'gen' ? 'gen' : 'ativo'); }
                } else {
                    if (typeof window.mostrarToast === 'function') window.mostrarToast('Erro ao salvar: ' + (res.message || 'tente novamente.'), 'error');
                }
            }).catch(function () {
                if (typeof window.mostrarToast === 'function') window.mostrarToast('Erro de conexão ao salvar.', 'error');
            });
        }

        // Wire assim que ia.js disparar 'ia:pronto', com fallback de 1.8s
        function wireIAConfig() {
            var sel = document.getElementById('ia-provider-select');
            if (sel && !sel.dataset.mobileWired) {
                sel.dataset.mobileWired = '1';
                sel.addEventListener('change', function () {
                    atualizarUI();
                    var v = sel.value;
                    if (v === 'gen') { salvar(); return; }
                    var inp = document.getElementById('ia-api-key-input');
                    if (sessionStorage.getItem('ia_tem_chave_' + v)) {
                        if (inp) inp.value = MASK;
                        salvar();
                    } else {
                        if (inp) inp.value = '';
                    }
                });
                atualizarUI();
            }
            var btnSalvar = document.getElementById('ia-btn-salvar-chave');
            if (btnSalvar && !btnSalvar.dataset.mobileWired) {
                btnSalvar.dataset.mobileWired = '1';
                btnSalvar.addEventListener('click', salvar);
            }
        }
        document.addEventListener('ia:pronto', wireIAConfig, { once: true });
        setTimeout(wireIAConfig, 1800); // fallback caso evento não dispare
    })();

    // ── Paperclip + câmera: abrir galeria/câmera/arquivo ─────────
    (function setupAttach() {
        var fileInput  = document.getElementById('ia-file-input');
        var btnAttach  = document.getElementById('btn-attach-file');
        var chipCamera = document.getElementById('chip-camera-boleto');

        function abrirCamera() {
            if (!fileInput) return;
            fileInput.value = '';
            fileInput.setAttribute('capture', 'environment');
            fileInput.click();
        }

        function abrirArquivo() {
            if (!fileInput) return;
            fileInput.value = '';
            fileInput.removeAttribute('capture');
            fileInput.click();
        }

        if (btnAttach)  btnAttach.addEventListener('click', abrirArquivo);
        if (chipCamera) chipCamera.addEventListener('click', abrirCamera);
    })();

    // ── Barcode: abre campo dedicado acima do input ──────────────
    (function setupBarcodePaste() {
        var btnBarcode  = document.getElementById('btn-barcode-paste');
        var chipBoleto  = document.getElementById('chip-boleto');
        var boletoBar   = document.getElementById('ia-boleto-bar');
        var boletoInput = document.getElementById('ia-boleto-input');
        var btnFechar   = document.getElementById('btn-fechar-boleto-page');
        var btnProcessar = document.getElementById('btn-processar-boleto-page');

        function abrirBarraBoleto() {
            if (!boletoBar) return;
            boletoBar.style.display = 'flex';
            if (boletoInput) {
                boletoInput.value = '';
                setTimeout(function () { boletoInput.focus(); }, 100);
            }
        }

        function fecharBarraBoleto() {
            if (!boletoBar) return;
            boletoBar.style.display = 'none';
            if (boletoInput) boletoInput.value = '';
        }

        if (btnBarcode)  btnBarcode.addEventListener('click', abrirBarraBoleto);
        if (chipBoleto)  chipBoleto.addEventListener('click', abrirBarraBoleto);
        if (btnFechar)   btnFechar.addEventListener('click', fecharBarraBoleto);

        // Ao pressionar Ler, só aceita se tiver dígitos suficientes (código de barras ≥ 30 chars numéricos)
        if (btnProcessar && boletoInput) {
            btnProcessar.addEventListener('click', function () {
                var codigo = boletoInput.value.replace(/\s/g, '');
                var apenasNumeros = codigo.replace(/\D/g, '');
                if (apenasNumeros.length < 30) {
                    boletoInput.style.borderColor = '#ef4444';
                    boletoInput.placeholder = 'Código inválido — mínimo 30 dígitos';
                    setTimeout(function () {
                        boletoInput.style.borderColor = '';
                        boletoInput.placeholder = 'Cole a linha digitável do boleto...';
                    }, 2500);
                    return;
                }
                // Válido: delega para o módulo IA (lê ia-boleto-input, chama /boleto API e abre modal)
                // fecharBoleto() é chamado internamente por processarBoleto() em ia.js
                if (window.IA && typeof window.IA.processarBoleto === 'function') {
                    window.IA.processarBoleto();
                }
            });

            // Enter no campo também aciona
            boletoInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); btnProcessar.click(); }
            });
        }
    })();

    // Fechar app (botão X)
    var btnFecharApp = document.getElementById('im-btn-fechar-app');
    if (btnFecharApp) {
        btnFecharApp.addEventListener('click', function () {
            window.close();
            // Fallback: se window.close() não funcionar (alguns Android), minimiza via history
            setTimeout(function () {
                if (!document.hidden) {
                    history.go(-(history.length - 1));
                    setTimeout(function () { window.close(); }, 100);
                }
            }, 200);
        });
    }

    // Nova conversa
    if (btnNovaMob) {
        btnNovaMob.addEventListener('click', function () {
            fecharSheet();
            var btn = document.getElementById('btn-nova-conversa');
            if (btn) setTimeout(function () { btn.click(); }, 200);
        });
    }

    // Ir para o App
    if (btnIrApp) {
        btnIrApp.addEventListener('click', function () {
            window.location.href = 'app.html';
        });
    }

    // Logout
    if (btnLogout) {
        btnLogout.addEventListener('click', function () {
            if (!confirm('Deseja sair da conta?')) return;
            sessionStorage.clear();
            localStorage.removeItem('token');
            localStorage.removeItem('usuarioAtual');
            localStorage.removeItem('dadosUsuarioLogado');
            localStorage.removeItem('perfilAtivoId');
            localStorage.removeItem('perfilAtivoNome');
            localStorage.removeItem('perfilAtivoTipo');
            window.location.replace('index.html');
        });
    }

    // ── Nome do usuário ───────────────────────────────────────────
    function carregarNomeUsuario() {
        try {
            var dados = sessionStorage.getItem('dadosUsuarioLogado');
            if (dados) {
                var obj = JSON.parse(dados);
                if (userNomeEl && obj.nome) userNomeEl.textContent = obj.nome;
            }
        } catch (_) {}
    }

    // ── Drag to dismiss no sheet ──────────────────────────────────
    (function setupDrag() {
        if (!sheet) return;
        var startY = 0, currentY = 0, dragging = false;

        sheet.addEventListener('touchstart', function (e) {
            if (!e.target.closest('.im-sheet-handle')) return;
            startY   = e.touches[0].clientY;
            dragging = true;
        }, { passive: true });

        sheet.addEventListener('touchmove', function (e) {
            if (!dragging) return;
            currentY = e.touches[0].clientY;
            var delta = currentY - startY;
            if (delta > 0) sheet.style.transform = 'translateY(' + delta + 'px)';
        }, { passive: true });

        sheet.addEventListener('touchend', function () {
            if (!dragging) return;
            dragging = false;
            var delta = currentY - startY;
            sheet.style.transform = '';
            if (delta > 80) fecharSheet();
        });
    })();

    // ── Modal de bloqueio PWA ─────────────────────────────────────
    (function setupLockScreen() {
        var overlay       = document.getElementById('lock-screen-overlay');
        var modal         = document.getElementById('modal-lock-screen');
        var form          = document.getElementById('form-lock-screen');
        var passwordInput = document.getElementById('lock-screen-password');
        var LOCK_KEY      = 'iaMobileUnlocked';
        var API_BASE      = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

        if (!overlay || !modal || !form) return;

        function mostrarLock() {
            overlay.classList.add('visible');
            modal.classList.add('visible');
            setTimeout(function () { if (passwordInput) passwordInput.focus(); }, 200);
        }

        function fecharLock() {
            overlay.classList.remove('visible');
            modal.classList.remove('visible');
            sessionStorage.setItem(LOCK_KEY, '1');
        }

        function getToken() {
            return sessionStorage.getItem('token') || localStorage.getItem('token');
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var senha = passwordInput ? passwordInput.value : '';
            if (!senha) return;

            var token = getToken();
            fetch(API_BASE + '/auth/verify-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ senha: senha })
            }).then(function (r) { return r.json(); }).then(function (res) {
                if (res && res.success) {
                    fecharLock();
                } else {
                    var card = document.querySelector('.lock-card');
                    if (card) {
                        card.classList.add('shake-animation');
                        setTimeout(function () { card.classList.remove('shake-animation'); }, 500);
                    }
                    if (passwordInput) { passwordInput.value = ''; passwordInput.focus(); }
                }
            }).catch(function () {
                if (!navigator.onLine) {
                    fecharLock();
                } else {
                    var card = document.querySelector('.lock-card');
                    if (card) {
                        card.classList.add('shake-animation');
                        setTimeout(function () { card.classList.remove('shake-animation'); }, 500);
                    }
                    if (passwordInput) { passwordInput.value = ''; passwordInput.focus(); }
                }
            });
        });

        // Mostrar lock ao abrir (se PWA standalone e não desbloqueado na sessão)
        var isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
        if (isStandalone && sessionStorage.getItem(LOCK_KEY) !== '1') {
            mostrarLock();
        }
    })();

    // ── Inicializar ───────────────────────────────────────────────
    function inicializar() {
        carregarNomeUsuario();
        if (typeof window.inicializarPerfis === 'function') {
            window.inicializarPerfis();
        }
        // Fallback para :has() em WebViews antigas
        if (document.querySelector('.ia-container.im-page')) {
            document.body.classList.add('im-page-active');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar);
    } else {
        setTimeout(inicializar, 500);
    }

})();
