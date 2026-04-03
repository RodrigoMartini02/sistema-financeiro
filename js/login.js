// ================================================================
// SISTEMA DE LOGIN OTIMIZADO - SEM TEMPORIZADORES DESNECESSÁRIOS
// ================================================================

document.addEventListener('DOMContentLoaded', function() {
    inicializarSistemaLoginRapido();
});

// ================================================================
// VARIÁVEIS GLOBAIS
// ================================================================

const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

function isMobileDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 768;
}

let elementos = {};
let _recoveryCode = null; // Código de recuperação validado (usado em processarNovaSenha)

// ================================================================
// INICIALIZAÇÃO RÁPIDA - SEM AGUARDOS
// ================================================================

function inicializarSistemaLoginRapido() {
    try {
        // Teste básico de localStorage
        if (!testLocalStorage()) {
            (window.mostrarToast || alert)("Seu navegador tem o armazenamento local desativado. Por favor, ative-o nas configurações.", 'error');
            return;
        }

        // Obter elementos e configurar sistema imediatamente
        elementos = obterElementosDOM();
        configurarSistemaCompleto();
        configurarLandingPage();

        // Carregar dependências opcionais em background
        carregarDependenciasBackground();

        window.loginSistemaInicializado = true;

    } catch (error) {
        console.error('[Login] Falha na inicialização:', error);
    }
}


function configurarSistemaCompleto() {
    // Configurar todos os eventos
    configurarEventListenersLogin();
    configurarEventListenersCadastro();
    configurarEventListenersRecuperacao();
    configurarNavegacaoModais();
    configurarFechamentoModais();
    configurarLimpezaMensagens();
    configurarFormatacaoDocumentos();
    configurarToggleSenha();
    configurarForcaSenha();
    configurarGoogleLogin();
    inicializarModais();
}

// ================================================================
// LOGIN COM GOOGLE
// ================================================================

const GOOGLE_CLIENT_ID = '277550403516-rkoa3kntkihbdr3ljvbb0vj42kkbkqle.apps.googleusercontent.com';

function configurarGoogleLogin() {
    const btnGoogle = document.getElementById('btn-google-login');
    if (!btnGoogle) return;

    btnGoogle.addEventListener('click', function() {
        // Aguardar a biblioteca do Google carregar
        if (typeof google === 'undefined' || !google.accounts) {
            (window.mostrarToast || alert)('Aguarde o carregamento do Google. Tente novamente em instantes.', 'warning');
            return;
        }

        const client = google.accounts.oauth2.initCodeClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'email profile',
            ux_mode: 'redirect',
            redirect_uri: window.location.origin + '/index.html',
            state: 'google_login'
        });
        client.requestCode();
    });

    // Verificar se voltou do redirect do Google com o código
    verificarRetornoGoogle();
}

function _finalizarLogin(token, usuario, identificador) {
    const dadosUsuario = JSON.stringify({
        id: usuario.id,
        nome: usuario.nome || usuario.name,
        documento: identificador,
        email: usuario.email,
        tipo: usuario.tipo
    });
    sessionStorage.setItem('token', token);
    sessionStorage.setItem('usuarioAtual', identificador);
    sessionStorage.setItem('dadosUsuarioLogado', dadosUsuario);
    localStorage.setItem('token', token);
    localStorage.setItem('usuarioAtual', identificador);
    localStorage.setItem('dadosUsuarioLogado', dadosUsuario);
    localStorage.removeItem('perfilAtivoId');
    localStorage.removeItem('perfilAtivoNome');

    const redirect = sessionStorage.getItem('redirectAfterLogin');
    sessionStorage.removeItem('redirectAfterLogin');
    window.location.href = redirect || (isMobileDevice() ? 'ia-mobile.html' : 'app.html');
}

async function verificarRetornoGoogle() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (!code || state !== 'google_login') return;

    // Limpar URL
    window.history.replaceState({}, document.title, window.location.pathname);

    // Mostrar loading
    if (typeof window.showLoadingScreen === 'function') {
        window.showLoadingScreen();
    }

    try {
        const response = await fetch(`${API_URL}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirect_uri: window.location.origin + '/index.html' })
        });

        const data = await response.json();

        if (!response.ok) {
            if (typeof window.hideLoadingScreen === 'function') window.hideLoadingScreen();
            const msg = data.message === 'Email não cadastrado no sistema.'
                ? 'Conta não encontrada. Cadastre-se com CPF/CNPJ e senha antes de usar o Google.'
                : (data.message || 'Erro ao autenticar com Google');
            const errorEl = document.getElementById('modal-error-message');
            if (errorEl) {
                errorEl.querySelector('span').textContent = msg;
                errorEl.style.display = 'flex';
            } else {
                (window.mostrarToast || alert)(msg, 'error');
            }
            return;
        }

        const token = data.data?.token || data.token;
        const usuario = data.data?.usuario || data.usuario;

        _finalizarLogin(token, usuario, usuario.documento || usuario.email);
    } catch (error) {
        if (typeof window.hideLoadingScreen === 'function') {
            window.hideLoadingScreen();
        }
        const errorEl = document.getElementById('modal-error-message');
        if (errorEl) {
            errorEl.querySelector('span').textContent = error.message;
            errorEl.style.display = 'flex';
        }
    }
}

function carregarDependenciasBackground() {
    if (window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function') {
        window.usuarioDados.aguardarPronto().then(() => {});
    }
}

// ================================================================
// CONFIGURAÇÃO DE EVENTOS DE LOGIN
// ================================================================

function configurarEventListenersLogin() {
    if (elementos.modalLoginForm) {
        elementos.modalLoginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const documento = document.getElementById('modal-documento')?.value?.trim();
            const password = document.getElementById('modal-password')?.value?.trim();
            
            if (documento && password) {
                await processarLogin(documento, password, true);
            }
        });
    }
}

function configurarEventListenersCadastro() {
    if (elementos.formCadastro) {
        elementos.formCadastro.addEventListener('submit', async function(e) {
            e.preventDefault();
            await processarFormularioCadastro();
        });
    }
}

function configurarEventListenersRecuperacao() {
    if (elementos.formRecuperacao) {
        elementos.formRecuperacao.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const campoCodigoContainer = document.getElementById('campo-codigo-container');
            const codigoInput = document.getElementById('codigo-recuperacao')?.value?.trim();
            const email = document.getElementById('recuperacao-email')?.value?.trim();

            if (campoCodigoContainer && campoCodigoContainer.style.display === 'block') {
                if (!codigoInput) {
                    mostrarErroRecuperacao('Por favor, digite o código recebido');
                    return;
                }

                try {
                    const resp = await fetch(`${API_URL}/auth/verify-recovery-code`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, codigo: codigoInput })
                    });
                    const data = await resp.json();
                    if (!resp.ok) {
                        mostrarErroRecuperacao(data.message || 'Código incorreto ou expirado');
                        return;
                    }
                    _recoveryCode = codigoInput;
                    if (document.getElementById('email-nova-senha')) {
                        document.getElementById('email-nova-senha').value = email;
                    }
                    if (elementos.recuperacaoModal) elementos.recuperacaoModal.style.display = 'none';
                    if (elementos.novaSenhaModal) elementos.novaSenhaModal.style.display = 'flex';
                } catch (err) {
                    mostrarErroRecuperacao('Erro de conexão. Tente novamente.');
                }
            } else {
                await processarRecuperacaoSenha();
            }
        });
    }

    if (elementos.formNovaSenha) {
        elementos.formNovaSenha.addEventListener('submit', async function(e) {
            e.preventDefault();
            await processarNovaSenha();
        });
    }
}


// ================================================================
// PROCESSO DE LOGIN OTIMIZADO
// ================================================================

async function processarLogin(documento, password, isModal, tentativa = 1) {
    const errorElement = isModal ? elementos.modalErrorMessage : elementos.errorMessage;

    if (errorElement) errorElement.style.display = 'none';

    if (typeof window.showLoadingScreen === 'function') {
        window.showLoadingScreen();
    }

    try {
        const docLimpo = documento.replace(/[^\d]+/g, '');

        // Login via API com timeout de 60s
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                documento: docLimpo,
                senha: password
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Documento ou senha incorretos');
        }

        const token = data.data?.token || data.token;
        const usuario = data.data?.usuario || data.user || data.usuario || data;

        _finalizarLogin(token, usuario, docLimpo);

    } catch (error) {
        if (typeof window.hideLoadingScreen === 'function') {
            window.hideLoadingScreen();
        }

        if (error.name === 'AbortError') {
            // Tentar novamente automaticamente até 2 vezes
            if (tentativa < 2) {
                mostrarErroLogin(errorElement, `Servidor demorou muito. Tentando novamente (${tentativa + 1}/2)...`);
                errorElement.style.color = '#ffa500';
                await new Promise(resolve => setTimeout(resolve, 2000));
                return processarLogin(documento, password, isModal, tentativa + 1);
            } else {
                mostrarErroLogin(errorElement, 'Servidor demorando demais. Tente novamente em alguns minutos.');
            }
        } else {
            mostrarErroLogin(errorElement, error.message || 'Erro no sistema. Tente novamente.');
        }

        // Limpar senha apenas se falhou definitivamente
        if (error.name !== 'AbortError' || tentativa >= 2) {
            const passwordField = isModal ?
                document.getElementById('modal-password') :
                document.getElementById('password');
            if (passwordField) passwordField.value = '';
        }
    }
}


// ================================================================
// CADASTRO
// ================================================================

async function processarFormularioCadastro() {
    const nome = document.getElementById('cadastro-nome')?.value?.trim();
    const email = document.getElementById('cadastro-email')?.value?.trim();
    const documento = document.getElementById('cadastro-documento')?.value?.trim();
    const password = document.getElementById('cadastro-password')?.value?.trim();
    const confirmPassword = document.getElementById('cadastro-confirm-password')?.value?.trim();

    if (elementos.cadastroErrorMessage) elementos.cadastroErrorMessage.style.display = 'none';
    if (elementos.cadastroSuccessMessage) elementos.cadastroSuccessMessage.style.display = 'none';

    if (!nome || !email || !documento || !password) {
        mostrarErroCadastro('Todos os campos são obrigatórios');
        return;
    }

    if (password !== confirmPassword) {
        mostrarErroCadastro('As senhas não coincidem');
        return;
    }

    if (password.length < 8) {
        mostrarErroCadastro('A senha deve ter pelo menos 8 caracteres');
        return;
    }

    const docLimpo = documento.replace(/[^\d]+/g, '');
    if (docLimpo.length !== 11) {
        mostrarErroCadastro('Informe um CPF válido (11 dígitos)');
        return;
    }

    if (typeof window.showLoadingScreen === 'function') window.showLoadingScreen();

    try {
        const body = { nome, email, documento: docLimpo, senha: password };

        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (typeof window.hideLoadingScreen === 'function') window.hideLoadingScreen();

        if (!response.ok) {
            mostrarErroCadastro(data.message || 'Erro ao criar conta.');
            return;
        }

        // Capturar localização silenciosamente em background e atualizar via API
        const userId = data.data?.usuario?.id || data.usuario?.id;
        const regToken = data.data?.token || data.token;
        if (userId && regToken && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(async function(pos) {
                try {
                    await fetch(`${API_URL}/usuarios/${userId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${regToken}` },
                        body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
                    });
                } catch (_) { /* silencioso */ }
            }, function() { /* permissão negada — ignorar */ }, { timeout: 10000 });
        }

        if (elementos.cadastroSuccessMessage) {
            elementos.cadastroSuccessMessage.textContent = 'Cadastro realizado com sucesso! Você já pode fazer login.';
            elementos.cadastroSuccessMessage.style.display = 'block';
        }

        if (elementos.formCadastro) elementos.formCadastro.reset();

        setTimeout(() => {
            if (elementos.cadastroModal) elementos.cadastroModal.style.display = 'none';
        }, 2000);

    } catch (error) {
        if (typeof window.hideLoadingScreen === 'function') window.hideLoadingScreen();
        mostrarErroCadastro('Erro de conexão. Tente novamente.');
    }
}

// ================================================================
// RECUPERAÇÃO DE SENHA
// ================================================================

async function processarRecuperacaoSenha() {
    const email = document.getElementById('recuperacao-email')?.value?.trim();
    if (elementos.recuperacaoErrorMessage) elementos.recuperacaoErrorMessage.style.display = 'none';
    if (elementos.recuperacaoSuccessMessage) elementos.recuperacaoSuccessMessage.style.display = 'none';

    if (!email) {
        mostrarErroRecuperacao('Por favor, informe seu email');
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        mostrarErroRecuperacao('Por favor, informe um email válido');
        return;
    }

    if (typeof window.showLoadingScreen === 'function') window.showLoadingScreen();

    try {
        // Backend gera o código, salva no banco e envia o email
        await fetch(`${API_URL}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        // Sempre mostrar mensagem genérica (não revelar se email existe)
        if (elementos.recuperacaoSuccessMessage) {
            elementos.recuperacaoSuccessMessage.textContent = 'Se este email estiver cadastrado, você receberá um código em breve.';
            elementos.recuperacaoSuccessMessage.style.display = 'block';
        }

        const campoCodigoContainer = document.getElementById('campo-codigo-container');
        if (campoCodigoContainer) {
            campoCodigoContainer.style.display = 'block';
        }

    } catch (error) {
        mostrarErroRecuperacao('Erro de conexão. Tente novamente.');
    } finally {
        if (typeof window.hideLoadingScreen === 'function') window.hideLoadingScreen();
    }
}

async function processarNovaSenha() {
    const email = document.getElementById('email-nova-senha')?.value?.trim();
    const novaSenha = document.getElementById('nova-senha')?.value?.trim();
    const confirmarSenha = document.getElementById('confirmar-nova-senha')?.value?.trim();
    if (elementos.novaSenhaErrorMessage) elementos.novaSenhaErrorMessage.style.display = 'none';
    if (elementos.novaSenhaSuccessMessage) elementos.novaSenhaSuccessMessage.style.display = 'none';
    
    if (!novaSenha || !confirmarSenha) {
        mostrarErroNovaSenha('Todos os campos são obrigatórios');
        return;
    }
    
    if (novaSenha !== confirmarSenha) {
        mostrarErroNovaSenha('As senhas não coincidem');
        return;
    }
    
    if (novaSenha.length < 8) {
        mostrarErroNovaSenha('A senha deve ter pelo menos 8 caracteres');
        return;
    }

    if (!_recoveryCode) {
        mostrarErroNovaSenha('Sessão de recuperação inválida. Solicite um novo código.');
        return;
    }

    if (typeof window.showLoadingScreen === 'function') window.showLoadingScreen();

    try {
        const response = await fetch(`${API_URL}/auth/reset-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                novaSenha: novaSenha,
                codigo: _recoveryCode
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro ao atualizar senha no servidor');
        }

        _recoveryCode = null;

        if (typeof window.hideLoadingScreen === 'function') window.hideLoadingScreen();

        if (elementos.novaSenhaSuccessMessage) {
            elementos.novaSenhaSuccessMessage.textContent = 'Senha alterada com sucesso!';
            elementos.novaSenhaSuccessMessage.style.display = 'block';
        }

        setTimeout(() => {
            if (elementos.novaSenhaModal) elementos.novaSenhaModal.style.display = 'none';
        }, 2000);

    } catch (error) {
        if (typeof window.hideLoadingScreen === 'function') window.hideLoadingScreen();
        mostrarErroNovaSenha(error.message || 'Erro ao alterar senha no servidor.');
    }
}

// ================================================================
// NAVEGAÇÃO ENTRE MODAIS
// ================================================================

function configurarNavegacaoModais() {
    // Login -> Cadastro
    if (elementos.modalAbrirCadastroBtn) {
        elementos.modalAbrirCadastroBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (elementos.cadastroModal) elementos.cadastroModal.style.display = 'flex';
        });
    }

    // Cadastro -> Login
    if (elementos.cadastroAbrirLoginBtn) {
        elementos.cadastroAbrirLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (elementos.cadastroModal) elementos.cadastroModal.style.display = 'none';
        });
    }

    // Login -> Recuperação de senha
    if (elementos.esqueceuSenhaBtn) {
        elementos.esqueceuSenhaBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (elementos.recuperacaoModal) elementos.recuperacaoModal.style.display = 'flex';
        });
    }

    // Recuperação -> Login (fechar modal de recuperação)
    if (elementos.recuperacaoAbrirLoginBtn) {
        elementos.recuperacaoAbrirLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (elementos.recuperacaoModal) elementos.recuperacaoModal.style.display = 'none';
        });
    }
}

function configurarFechamentoModais() {
    function fecharModal(modal) {
        if (modal) {
            modal.style.display = 'none';
            const form = modal.querySelector('form');
            if (form) form.reset();

            const error = modal.querySelector('.error-message');
            const success = modal.querySelector('.success-message');
            if (error) error.style.display = 'none';
            if (success) success.style.display = 'none';

            const campoCode = modal.querySelector('#campo-codigo-container');
            if (campoCode) campoCode.style.display = 'none';
        }
    }

    const closeButtons = [
        { btn: elementos.cadastroCloseBtn, modal: elementos.cadastroModal },
        { btn: elementos.recuperacaoCloseBtn, modal: elementos.recuperacaoModal },
        { btn: elementos.novaSenhaCloseBtn, modal: elementos.novaSenhaModal }
    ];

    closeButtons.forEach(({ btn, modal }) => {
        if (btn) {
            btn.addEventListener('click', () => fecharModal(modal));
        }
    });

    // Fechar clicando fora
    window.addEventListener('click', function(event) {
        const modais = [elementos.cadastroModal, elementos.recuperacaoModal, elementos.novaSenhaModal];
        modais.forEach(modal => {
            if (event.target === modal) {
                fecharModal(modal);
            }
        });
    });
}

function configurarLimpezaMensagens() {
    const configuracoes = [
        { campos: ['modal-documento', 'modal-password'], erro: elementos.modalErrorMessage },
        { campos: ['cadastro-nome', 'cadastro-email', 'cadastro-documento', 'cadastro-password', 'cadastro-confirm-password'], erro: elementos.cadastroErrorMessage },
        { campos: ['recuperacao-email', 'codigo-recuperacao'], erro: elementos.recuperacaoErrorMessage },
        { campos: ['nova-senha', 'confirmar-nova-senha'], erro: elementos.novaSenhaErrorMessage }
    ];
    
    configuracoes.forEach(({ campos, erro }) => {
        if (erro) {
            campos.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field) {
                    field.addEventListener('input', () => {
                        erro.style.display = 'none';
                    });
                }
            });
        }
    });
}

function configurarFormatacaoDocumentos() {
    const campos = ['documento', 'modal-documento', 'cadastro-documento'];
    
    campos.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('input', () => formatarDocumento(field));
        }
    });
}

function inicializarModais() {
    const modais = [elementos.cadastroModal, elementos.recuperacaoModal, elementos.novaSenhaModal];
    modais.forEach(modal => {
        if (modal) modal.style.display = 'none';
    });

    const mensagens = [
        elementos.modalErrorMessage,
        elementos.cadastroErrorMessage, elementos.cadastroSuccessMessage,
        elementos.recuperacaoErrorMessage, elementos.recuperacaoSuccessMessage,
        elementos.novaSenhaErrorMessage, elementos.novaSenhaSuccessMessage
    ];

    mensagens.forEach(msg => {
        if (msg) msg.style.display = 'none';
    });

    const campoCode = document.getElementById('campo-codigo-container');
    if (campoCode) campoCode.style.display = 'none';
}

// ================================================================
// ELEMENTOS DO DOM
// ================================================================

function obterElementosDOM() {
    return {
        // Modais
        cadastroModal: document.getElementById('cadastroModal'),
        recuperacaoModal: document.getElementById('recuperacaoSenhaModal'),
        novaSenhaModal: document.getElementById('novaSenhaModal'),

        // Formulários
        modalLoginForm: document.getElementById('modal-login-form'),
        formCadastro: document.getElementById('form-cadastro'),
        formRecuperacao: document.getElementById('form-recuperacao-senha'),
        formNovaSenha: document.getElementById('form-nova-senha'),

        // Mensagens
        modalErrorMessage: document.getElementById('modal-error-message'),
        cadastroErrorMessage: document.getElementById('cadastro-error-message'),
        cadastroSuccessMessage: document.getElementById('cadastro-success-message'),
        recuperacaoErrorMessage: document.getElementById('recuperacao-error-message'),
        recuperacaoSuccessMessage: document.getElementById('recuperacao-success-message'),
        novaSenhaErrorMessage: document.getElementById('nova-senha-error-message'),
        novaSenhaSuccessMessage: document.getElementById('nova-senha-success-message'),

        // Botões de navegação
        modalAbrirCadastroBtn: document.getElementById('modal-abrir-cadastro'),
        cadastroAbrirLoginBtn: document.getElementById('cadastro-abrir-login'),
        esqueceuSenhaBtn: document.getElementById('modal-esqueceu-senha'),
        recuperacaoAbrirLoginBtn: document.getElementById('recuperacao-abrir-login'),

        // Botões de fechar
        cadastroCloseBtn: document.querySelector('.cadastro-close'),
        recuperacaoCloseBtn: document.querySelector('.recuperacao-close'),
        novaSenhaCloseBtn: document.querySelector('.nova-senha-close')
    };
}

// ================================================================
// FUNÇÕES DE MENSAGENS
// ================================================================

function mostrarErroLogin(errorElement, mensagem) {
    if (errorElement) {
        errorElement.textContent = mensagem;
        errorElement.style.display = 'block';
    }
}


function mostrarErroCadastro(mensagem) {
    if (elementos.cadastroErrorMessage) {
        elementos.cadastroErrorMessage.textContent = mensagem;
        elementos.cadastroErrorMessage.style.display = 'block';
    }
}

function mostrarErroRecuperacao(mensagem) {
    if (elementos.recuperacaoErrorMessage) {
        elementos.recuperacaoErrorMessage.textContent = mensagem;
        elementos.recuperacaoErrorMessage.style.display = 'block';
    }
}

function mostrarErroNovaSenha(mensagem) {
    if (elementos.novaSenhaErrorMessage) {
        elementos.novaSenhaErrorMessage.textContent = mensagem;
        elementos.novaSenhaErrorMessage.style.display = 'block';
    }
}

// ================================================================
// UTILITÁRIOS
// ================================================================

function testLocalStorage() {
    try {
        localStorage.setItem('__test__', 'test');
        localStorage.removeItem('__test__');
        return true;
    } catch {
        return false;
    }
}



// ================================================================
// CONFIGURAR TOGGLE DE SENHA
// ================================================================
function calcularForcaSenha(senha) {
    let pontos = 0;
    if (senha.length >= 8) pontos++;
    if (senha.length >= 12) pontos++;
    if (/[A-Z]/.test(senha)) pontos++;
    if (/[0-9]/.test(senha)) pontos++;
    if (/[^A-Za-z0-9]/.test(senha)) pontos++;
    return Math.min(pontos, 5);
}

function atualizarBarraForca(input) {
    const container = input.closest('.form-group')?.querySelector('.password-strength');
    if (!container) return;

    const fill = container.querySelector('.strength-fill');
    const text = container.querySelector('.strength-text');
    if (!fill || !text) return;

    const senha = input.value;
    if (!senha) {
        fill.style.width = '0%';
        fill.style.background = '';
        text.textContent = 'Mínimo de 8 caracteres';
        text.style.color = '';
        return;
    }

    const forca = calcularForcaSenha(senha);
    const niveis = [
        { pct: '20%', cor: '#ef4444', label: 'Muito fraca' },
        { pct: '40%', cor: '#f59e0b', label: 'Fraca' },
        { pct: '60%', cor: '#eab308', label: 'Razoavel' },
        { pct: '80%', cor: '#22c55e', label: 'Boa' },
        { pct: '100%', cor: '#16a34a', label: 'Forte' }
    ];

    const nivel = niveis[Math.max(forca - 1, 0)];
    fill.style.width = nivel.pct;
    fill.style.background = nivel.cor;
    text.textContent = nivel.label;
    text.style.color = nivel.cor;
}

function configurarForcaSenha() {
    const campos = ['cadastro-password', 'nova-senha'];
    campos.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => atualizarBarraForca(input));
        }
    });
}

function configurarToggleSenha() {
    // Selecionar todos os botões de toggle de senha
    document.querySelectorAll('.password-toggle[data-target]').forEach(button => {
        button.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            togglePassword(targetId, this);
        });
    });
}

function togglePassword(inputId, button) {
    const input = document.getElementById(inputId);
    const icon = button.querySelector('i');

    if (!input || !icon) return;

    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
        button.setAttribute('aria-label', 'Ocultar senha');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
        button.setAttribute('aria-label', 'Mostrar senha');
    }
}

function diagnosticoLogin() {
    return {
        timestamp: new Date().toISOString(),
        sistemaInicializado: window.loginSistemaInicializado || false,
        localStorage: testLocalStorage(),
        usuarioAtual: sessionStorage.getItem('usuarioAtual'),
        usuarioDadosDisponivel: !!window.usuarioDados
    };
}

function limparSessao() {
    sessionStorage.removeItem('usuarioAtual');
    sessionStorage.removeItem('dadosUsuarioLogado');
    sessionStorage.removeItem('token');
    localStorage.removeItem('usuarioAtual');
    localStorage.removeItem('dadosUsuarioLogado');
    localStorage.removeItem('token');
}




// ================================================================
// NAVEGAÇÃO E UI DA LANDING PAGE
// ================================================================

function configurarLandingPage() {
    // Navbar scroll effect
    window.addEventListener('scroll', () => {
        const nav = document.getElementById('landing-nav');
        if (!nav) return;
        if (window.scrollY > 50) nav.classList.add('nav-scrolled');
        else nav.classList.remove('nav-scrolled');
    });

    // Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(err => {
                console.warn('Service Worker registration failed:', err);
            });
        });
    }
}

// Exportar para escopo global
window.togglePassword = togglePassword;
window.diagnosticoLogin = diagnosticoLogin;
window.limparSessao = limparSessao;
window.loginSistemaInicializado = false;