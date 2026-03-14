// ================================================================
// SISTEMA DE LOGIN OTIMIZADO - SEM TEMPORIZADORES DESNECESSÁRIOS
// ================================================================

document.addEventListener('DOMContentLoaded', function() {
    inicializarSistemaLoginRapido();
});

// ================================================================
// VARIÁVEIS GLOBAIS
// ================================================================

const API_URL = 'https://sistema-financeiro-backend-o199.onrender.com/api';

let elementos = {};

// ================================================================
// INICIALIZAÇÃO RÁPIDA - SEM AGUARDOS
// ================================================================

function inicializarSistemaLoginRapido() {
    try {
        // Teste básico de localStorage
        if (!testLocalStorage()) {
            alert("Seu navegador tem o armazenamento local desativado. Por favor, ative-o nas configurações.");
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
        configurarLoginMinimo();
    }
}


function configurarSistemaCompleto() {
    // Inicializar estrutura de dados se necessário
    if (!localStorage.getItem('usuarios')) {
        localStorage.setItem('usuarios', JSON.stringify([]));
    }
    
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
            alert('Aguarde o carregamento do Google. Tente novamente em instantes.');
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
            // Usuário Google não cadastrado - abrir cadastro com dados pré-preenchidos
            if (data.needsRegistration && data.googleData) {
                if (typeof window.hideLoadingScreen === 'function') {
                    window.hideLoadingScreen();
                }

                const gd = data.googleData;
                const campoNome = document.getElementById('cadastro-nome');
                const campoEmail = document.getElementById('cadastro-email');
                if (campoNome) { campoNome.value = gd.nome; campoNome.readOnly = true; }
                if (campoEmail) { campoEmail.value = gd.email; campoEmail.readOnly = true; }

                // Guardar googleId para vincular no cadastro
                sessionStorage.setItem('googlePendingId', gd.googleId);

                if (elementos.cadastroModal) elementos.cadastroModal.style.display = 'flex';

                mostrarErroCadastro('Conta Google sem cadastro. Informe seu CPF/CNPJ e crie uma senha para continuar.');
                return;
            }

            throw new Error(data.message || 'Erro ao autenticar com Google');
        }

        const token = data.data?.token || data.token;
        const usuario = data.data?.usuario || data.usuario;

        const dadosUsuarioGoogle = JSON.stringify({
            id: usuario.id,
            nome: usuario.nome,
            documento: usuario.documento || '',
            email: usuario.email,
            tipo: usuario.tipo
        });
        sessionStorage.setItem('token', token);
        sessionStorage.setItem('usuarioAtual', usuario.documento || usuario.email);
        sessionStorage.setItem('dadosUsuarioLogado', dadosUsuarioGoogle);
        localStorage.setItem('token', token);
        localStorage.setItem('usuarioAtual', usuario.documento || usuario.email);
        localStorage.setItem('dadosUsuarioLogado', dadosUsuarioGoogle);

        window.location.href = 'app.html';
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
    // EmailJS agora é gerenciado pelo backend - não precisa carregar no frontend

    // UsuarioDados se disponível
    if (window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function') {
        window.usuarioDados.aguardarPronto().then(() => {
            // UsuarioDados integrado silenciosamente
        });
    }

    // Limpeza automática
    verificarELimparDados();
}

// ================================================================
// CONFIGURAÇÃO DE EVENTOS DE LOGIN
// ================================================================

function configurarEventListenersLogin() {
    // Login principal
    if (elementos.loginForm) {
        elementos.loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const documento = document.getElementById('documento')?.value?.trim();
            const password = document.getElementById('password')?.value?.trim();
            
            if (documento && password) {
                await processarLogin(documento, password, false);
            }
        });
    }
    
    // Login modal
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

                const validacao = verificarCodigoRecuperacao(email, codigoInput);

                if (validacao.valido) {
                    if (document.getElementById('email-nova-senha')) {
                        document.getElementById('email-nova-senha').value = email;
                    }
                    
                    if (elementos.recuperacaoModal) elementos.recuperacaoModal.style.display = 'none';
                    if (elementos.novaSenhaModal) elementos.novaSenhaModal.style.display = 'flex';
                } else {
                    mostrarErroRecuperacao(validacao.motivo || 'Código incorreto ou expirado');
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

    // ✅ Mostrar loading screen com imagens
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

        // Salvar token JWT e dados do usuário
        // API retorna: { success: true, data: { token, usuario: {...} } }
        const token = data.data?.token || data.token;
        const usuario = data.data?.usuario || data.user || data.usuario || data;

        const dadosUsuario = JSON.stringify({
            id: usuario.id,
            nome: usuario.nome || usuario.name,
            documento: docLimpo,
            email: usuario.email,
            tipo: usuario.tipo
            // Senha removida por segurança - usar token JWT para autenticação
        });
        sessionStorage.setItem('token', token);
        sessionStorage.setItem('usuarioAtual', docLimpo);
        sessionStorage.setItem('dadosUsuarioLogado', dadosUsuario);
        localStorage.setItem('token', token);
        localStorage.setItem('usuarioAtual', docLimpo);
        localStorage.setItem('dadosUsuarioLogado', dadosUsuario);

        // Registrar tentativa em background
        registrarTentativaBackground(documento, true);

        // Redirecionamento
        window.location.href = 'app.html';

    } catch (error) {
        // ✅ Esconder loading screen em caso de erro
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

        registrarTentativaBackground(documento, false);

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
    // Limpar mensagens
    if (elementos.cadastroErrorMessage) elementos.cadastroErrorMessage.style.display = 'none';
    if (elementos.cadastroSuccessMessage) elementos.cadastroSuccessMessage.style.display = 'none';
    
    // Validações
    if (!nome || !email || !documento || !password) {
        mostrarErroCadastro('Todos os campos são obrigatórios');
        return;
    }
    
    if (password !== confirmPassword) {
        mostrarErroCadastro('As senhas não coincidem');
        return;
    }
    
    if (password.length < 6) {
        mostrarErroCadastro('A senha deve ter pelo menos 6 caracteres');
        return;
    }
    
    if (!validarDocumento(documento)) {
        mostrarErroCadastro('CPF/CNPJ inválido');
        return;
    }
    
    if (typeof window.showLoadingScreen === 'function') window.showLoadingScreen();

    try {
        await processarCadastro(nome, email, documento, password);

        if (typeof window.hideLoadingScreen === 'function') window.hideLoadingScreen();

        if (elementos.cadastroSuccessMessage) {
            elementos.cadastroSuccessMessage.textContent = 'Cadastro realizado com sucesso!';
            elementos.cadastroSuccessMessage.style.display = 'block';
        }

        // Limpar estado Google pendente e desbloquear campos
        sessionStorage.removeItem('googlePendingId');
        const campoNome = document.getElementById('cadastro-nome');
        const campoEmail = document.getElementById('cadastro-email');
        if (campoNome) campoNome.readOnly = false;
        if (campoEmail) campoEmail.readOnly = false;

        if (elementos.formCadastro) elementos.formCadastro.reset();

        // Fechar modal de cadastro após sucesso
        setTimeout(() => {
            if (elementos.cadastroModal) elementos.cadastroModal.style.display = 'none';
        }, 2000);

    } catch (error) {
        if (typeof window.hideLoadingScreen === 'function') window.hideLoadingScreen();
        mostrarErroCadastro(error.message || 'Erro ao criar conta.');
    }
}

async function processarCadastro(nome, email, documento, password) {
    const docLimpo = documento.replace(/[^\d]+/g, '');
    const googleId = sessionStorage.getItem('googlePendingId') || null;

    try {
        const body = { nome, email, documento: docLimpo, senha: password };
        if (googleId) body.google_id = googleId;

        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro ao cadastrar usuário');
        }

        return { success: true, data: data.usuario };

    } catch (error) {
        throw error;
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

    if (typeof window.showLoadingScreen === 'function') window.showLoadingScreen();

    try {
        const response = await fetch(`${API_URL}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Email não encontrado');
        }

        const codigo = Math.floor(100000 + Math.random() * 900000).toString();

        const envioEmail = await enviarEmailRecuperacao(email, codigo, data.data?.nome || 'Usuário');

        if (envioEmail.success) {
            salvarCodigoRecuperacao(email, codigo);

            if (elementos.recuperacaoSuccessMessage) {
                elementos.recuperacaoSuccessMessage.textContent = 'Email enviado! Verifique sua caixa de entrada.';
                elementos.recuperacaoSuccessMessage.style.display = 'block';
            }

            const campoCodigoContainer = document.getElementById('campo-codigo-container');
            if (campoCodigoContainer) {
                campoCodigoContainer.style.display = 'block';
            }
        } else {
            throw new Error('Erro ao enviar e-mail de recuperação');
        }

    } catch (error) {
        if (typeof window.hideLoadingScreen === 'function') window.hideLoadingScreen();
        mostrarErroRecuperacao(error.message);
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
    
    if (novaSenha.length < 6) {
        mostrarErroNovaSenha('A senha deve ter pelo menos 6 caracteres');
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
                novaSenha: novaSenha
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro ao atualizar senha no servidor');
        }

        if (typeof window.hideLoadingScreen === 'function') window.hideLoadingScreen();

        if (elementos.novaSenhaSuccessMessage) {
            elementos.novaSenhaSuccessMessage.textContent = 'Senha alterada com sucesso no banco!';
            elementos.novaSenhaSuccessMessage.style.display = 'block';
        }

        // Fechar modal de nova senha após sucesso
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
            if (elementos.loginModal) elementos.loginModal.style.display = 'none';
            if (elementos.cadastroModal) elementos.cadastroModal.style.display = 'flex';
        });
    }

    // Cadastro -> Login
    if (elementos.cadastroAbrirLoginBtn) {
        elementos.cadastroAbrirLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (elementos.cadastroModal) elementos.cadastroModal.style.display = 'none';
            if (elementos.loginModal) elementos.loginModal.style.display = 'flex';
        });
    }

    // Login -> Recuperação de senha
    if (elementos.esqueceuSenhaBtn) {
        elementos.esqueceuSenhaBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (elementos.loginModal) elementos.loginModal.style.display = 'none';
            if (elementos.recuperacaoModal) elementos.recuperacaoModal.style.display = 'flex';
        });
    }

    // Recuperação -> Login
    if (elementos.recuperacaoAbrirLoginBtn) {
        elementos.recuperacaoAbrirLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (elementos.recuperacaoModal) elementos.recuperacaoModal.style.display = 'none';
            if (elementos.loginModal) elementos.loginModal.style.display = 'flex';
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
        { btn: elementos.loginCloseBtn, modal: elementos.loginModal },
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
        const modais = [elementos.loginModal, elementos.cadastroModal, elementos.recuperacaoModal, elementos.novaSenhaModal];
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
    const modais = [elementos.loginModal, elementos.cadastroModal, elementos.recuperacaoModal, elementos.novaSenhaModal];
    modais.forEach(modal => {
        if (modal) modal.style.display = 'none';
    });

    const mensagens = [
        elementos.errorMessage, elementos.modalErrorMessage,
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
        loginModal: document.getElementById('loginModal'),
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
        loginCloseBtn: document.querySelector('.login-close'),
        cadastroCloseBtn: document.querySelector('.cadastro-close'),
        recuperacaoCloseBtn: document.querySelector('.recuperacao-close'),
        novaSenhaCloseBtn: document.querySelector('.nova-senha-close')
    };
}

// ================================================================
// SISTEMA DE SEGURANÇA OTIMIZADO
// ================================================================

function verificarBloqueio(documento) {
    try {
        const tentativas = JSON.parse(localStorage.getItem('tentativasLogin') || '{}');
        const docLimpo = documento.replace(/[^\d]+/g, '');
        const tentativasUsuario = tentativas[docLimpo] || [];
        
        const agora = Date.now();
        const ultimaHora = agora - (60 * 60 * 1000);
        
        const falhasRecentes = tentativasUsuario.filter(t => 
            !t.sucesso && t.timestamp > ultimaHora
        ).length;
        
        return {
            bloqueado: falhasRecentes >= 5,
            tempoRestante: falhasRecentes >= 5 ? Math.ceil((agora - ultimaHora) / 60000) : 0
        };
    } catch {
        return { bloqueado: false, tempoRestante: 0 };
    }
}

function registrarTentativaBackground(documento, sucesso) {
    // Execução em background para não atrasar login
    setTimeout(() => {
        try {
            const tentativas = JSON.parse(localStorage.getItem('tentativasLogin') || '{}');
            const docLimpo = documento.replace(/[^\d]+/g, '');
            
            if (!tentativas[docLimpo]) {
                tentativas[docLimpo] = [];
            }
            
            tentativas[docLimpo].push({
                timestamp: Date.now(),
                sucesso
            });
            
            // Manter apenas 5 últimas
            tentativas[docLimpo] = tentativas[docLimpo].slice(-5);
            localStorage.setItem('tentativasLogin', JSON.stringify(tentativas));
        } catch (error) {
            // Erro ao registrar tentativa - silencioso
        }
    }, 0);
}

// ================================================================
// FUNÇÕES DE RECUPERAÇÃO DE SENHA
// ================================================================


function salvarCodigoRecuperacao(email, codigo) {
    const codigosRecuperacao = JSON.parse(localStorage.getItem('codigosRecuperacao') || '{}');
    codigosRecuperacao[email] = {
        codigo: codigo,
        expiracao: Date.now() + (15 * 60 * 1000),
        tentativas: 0
    };
    localStorage.setItem('codigosRecuperacao', JSON.stringify(codigosRecuperacao));
}

function verificarCodigoRecuperacao(email, codigoInformado) {
    const codigosRecuperacao = JSON.parse(localStorage.getItem('codigosRecuperacao') || '{}');
    const dadosCodigo = codigosRecuperacao[email];
    
    if (!dadosCodigo) {
        return { valido: false, motivo: 'Código não encontrado' };
    }
    
    if (Date.now() > dadosCodigo.expiracao) {
        delete codigosRecuperacao[email];
        localStorage.setItem('codigosRecuperacao', JSON.stringify(codigosRecuperacao));
        return { valido: false, motivo: 'Código expirado' };
    }
    
    if (dadosCodigo.tentativas >= 3) {
        return { valido: false, motivo: 'Muitas tentativas' };
    }
    
    if (dadosCodigo.codigo !== codigoInformado) {
        dadosCodigo.tentativas++;
        localStorage.setItem('codigosRecuperacao', JSON.stringify(codigosRecuperacao));
        return { valido: false, motivo: 'Código incorreto' };
    }
    
    delete codigosRecuperacao[email];
    localStorage.setItem('codigosRecuperacao', JSON.stringify(codigosRecuperacao));
    
    return { valido: true };
}

async function enviarEmailRecuperacao(email, codigo, nomeUsuario = 'Usuário') {
    try {
        // Enviar email via backend (credenciais seguras no servidor)
        const response = await fetch(`${API_URL}/auth/send-recovery-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                codigo: codigo,
                nome: nomeUsuario
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            return { success: true };
        } else {
            throw new Error(data.message || 'Erro ao enviar email');
        }

    } catch (error) {
        return { success: false, message: 'Erro ao enviar e-mail: ' + error.message };
    }
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


function verificarELimparDados() {
    try {
        const agora = Date.now();
        
        // Limpar códigos de recuperação expirados
        const codigosRecuperacao = JSON.parse(localStorage.getItem('codigosRecuperacao') || '{}');
        let alterou = false;
        
        Object.keys(codigosRecuperacao).forEach(email => {
            if (codigosRecuperacao[email].expiracao < agora) {
                delete codigosRecuperacao[email];
                alterou = true;
            }
        });
        
        if (alterou) {
            localStorage.setItem('codigosRecuperacao', JSON.stringify(codigosRecuperacao));
        }
        
        // Limpar tentativas antigas
        const tentativas = JSON.parse(localStorage.getItem('tentativasLogin') || '{}');
        alterou = false;
        
        Object.keys(tentativas).forEach(doc => {
            const tentativasValidas = tentativas[doc].filter(t => 
                agora - t.timestamp < 24 * 60 * 60 * 1000
            );
            
            if (tentativasValidas.length !== tentativas[doc].length) {
                tentativas[doc] = tentativasValidas;
                alterou = true;
            }
            
            if (tentativas[doc].length === 0) {
                delete tentativas[doc];
                alterou = true;
            }
        });
        
        if (alterou) {
            localStorage.setItem('tentativasLogin', JSON.stringify(tentativas));
        }

    } catch (error) {
        // Erro na limpeza - silencioso
    }
}

function configurarLoginMinimo() {
    // Fallback básico caso tudo falhe
    try {
        const modalLoginForm = document.getElementById('modal-login-form');
        if (modalLoginForm) {
            modalLoginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const doc = document.getElementById('modal-documento')?.value;
                const pass = document.getElementById('modal-password')?.value;
                if (doc && pass) processarLoginMinimo(doc, pass);
            });
        }
    } catch (error) {
        // Falha total - silencioso
    }
}

function processarLoginMinimo(documento, password) {
    try {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const docLimpo = documento.replace(/[^\d]+/g, '');
        const usuario = usuarios.find(u => 
            u.documento && 
            u.documento.replace(/[^\d]+/g, '') === docLimpo && 
            u.password === password
        );
        
        if (usuario) {
            const dadosOffline = JSON.stringify(usuario);
            sessionStorage.setItem('usuarioAtual', docLimpo);
            sessionStorage.setItem('dadosUsuarioLogado', dadosOffline);
            localStorage.setItem('usuarioAtual', docLimpo);
            localStorage.setItem('dadosUsuarioLogado', dadosOffline);
            window.location.href = 'app.html';
        } else {
            alert('Login inválido');
        }
    } catch (error) {
        alert('Erro no sistema');
    }
}

// ================================================================
// FUNÇÕES GLOBAIS EXPORTADAS
// ================================================================

// ================================================================
// CONFIGURAR TOGGLE DE SENHA - EVENT LISTENERS NATIVOS
// ================================================================
function calcularForcaSenha(senha) {
    let pontos = 0;
    if (senha.length >= 6) pontos++;
    if (senha.length >= 8) pontos++;
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
        text.textContent = 'Minimo de 6 caracteres';
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

    // Botão "Entrar" da navbar
    const btnNavLogin = document.getElementById('btn-nav-login');
    if (btnNavLogin) {
        btnNavLogin.addEventListener('click', () => {
            if (elementos.loginModal) elementos.loginModal.style.display = 'flex';
        });
    }

    // Botões "Criar Conta Grátis"
    const botoesCadastro = [
        document.getElementById('btn-hero-cadastro'),
        document.getElementById('btn-cta-cadastro'),
    ];
    botoesCadastro.forEach(btn => {
        if (btn) btn.addEventListener('click', () => {
            document.getElementById('modal-abrir-cadastro').click();
        });
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