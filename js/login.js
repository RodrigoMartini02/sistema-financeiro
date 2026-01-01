// ================================================================
// SISTEMA DE LOGIN OTIMIZADO - SEM TEMPORIZADORES DESNECESSÁRIOS
// ================================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('Login otimizado carregado - inicialização rápida...');
    inicializarSistemaLoginRapido();
});

// ================================================================
// VARIÁVEIS GLOBAIS
// ================================================================

const API_URL = 'https://sistema-financeiro-backend-o199.onrender.com/api';

let elementos = {};
let emailJSDisponivel = false;

const EMAIL_CONFIG = {
    serviceId: 'service_financas',
    templateId: 'template_recuperacao',
    userId: 'oW3fgPbnchMKc42Yf'
};

// ================================================================
// INICIALIZAÇÃO RÁPIDA - SEM AGUARDOS
// ================================================================

function inicializarSistemaLoginRapido() {
    try {
        console.log('Inicialização imediata do login...');
        
        // Teste básico de localStorage
        if (!testLocalStorage()) {
            alert("Seu navegador tem o armazenamento local desativado. Por favor, ative-o nas configurações.");
            return;
        }
        
        // Obter elementos e configurar sistema imediatamente
        elementos = obterElementosDOM();
        configurarSistemaCompleto();
        
        // Carregar dependências opcionais em background
        carregarDependenciasBackground();
        
        window.loginSistemaInicializado = true;
        console.log('Login pronto para uso');
        
    } catch (error) {
        console.error('Erro na inicialização:', error);
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
    inicializarModais();
}

function carregarDependenciasBackground() {
    // EmailJS em background (não bloqueia login)
    if (!window.emailjs) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js';
        script.onload = () => {
            try {
                emailjs.init(EMAIL_CONFIG.userId);
                emailJSDisponivel = true;
                console.log('EmailJS carregado');
            } catch (e) {
                console.warn('EmailJS erro:', e);
            }
        };
        script.onerror = () => console.warn('EmailJS falhou');
        document.head.appendChild(script);
    } else {
        emailJSDisponivel = true;
    }
    
    // UsuarioDados se disponível
    if (window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function') {
        window.usuarioDados.aguardarPronto().then(() => {
            console.log('UsuarioDados integrado');
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
                    console.log('✅ Código válido! Abrindo tela de nova senha...');
                    
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

async function processarLogin(documento, password, isModal) {
    console.log('🔐 Processando login via API...');

    const errorElement = isModal ? elementos.modalErrorMessage : elementos.errorMessage;
    const botaoSubmit = isModal ?
        document.querySelector('#modal-login-form button[type="submit"]') :
        document.querySelector('#login-form button[type="submit"]');

    if (errorElement) errorElement.style.display = 'none';
    setLoadingState(botaoSubmit, true);

    try {
        const docLimpo = documento.replace(/[^\d]+/g, '');
        console.log('📤 Enviando credenciais:', { documento: docLimpo, url: `${API_URL}/auth/login` });

        // Login via API
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                documento: docLimpo,
                senha: password
            })
        });

        console.log('📥 Status da resposta:', response.status, response.statusText);
        const data = await response.json();
        console.log('📥 Dados recebidos:', data);

        if (!response.ok) {
            throw new Error(data.message || 'Documento ou senha incorretos');
        }

        console.log('✅ Login bem-sucedido via API!');

        // Salvar token JWT e dados do usuário
        // API retorna: { success: true, data: { token, usuario: {...} } }
        const token = data.data?.token || data.token;
        const usuario = data.data?.usuario || data.user || data.usuario || data;

        sessionStorage.setItem('token', token);
        sessionStorage.setItem('usuarioAtual', docLimpo);

        sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify({
            id: usuario.id,
            nome: usuario.nome || usuario.name,
            documento: docLimpo,
            email: usuario.email,
            tipo: usuario.tipo,
            password: password // Manter senha para desbloqueio interno
        }));

        // Registrar tentativa em background
        registrarTentativaBackground(documento, true);

        // Redirecionamento
        window.location.href = 'index.html';

    } catch (error) {
        console.error('❌ Erro durante login:', error);
        mostrarErroLogin(errorElement, error.message || 'Erro no sistema. Tente novamente.');
        registrarTentativaBackground(documento, false);

        // Limpar senha
        const passwordField = isModal ?
            document.getElementById('modal-password') :
            document.getElementById('password');
        if (passwordField) passwordField.value = '';

    } finally {
        setLoadingState(botaoSubmit, false);
    }
}

function validarLoginRapido(documento, password) {
    const docLimpo = documento.replace(/[^\d]+/g, '');
    
    // Verificar bloqueio simples
    const bloqueio = verificarBloqueio(documento);
    if (bloqueio.bloqueado) {
        throw new Error(`Conta bloqueada. Aguarde ${bloqueio.tempoRestante} minutos.`);
    }
    
    // Validação direta
    const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    const usuario = usuarios.find(u => 
        u.documento && 
        u.documento.replace(/[^\d]+/g, '') === docLimpo && 
        u.password === password
    );
    
    return !!usuario;
}

function salvarDadosUsuarioSessao(docLimpo) {
    try {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const usuario = usuarios.find(u => 
            u.documento && u.documento.replace(/[^\d]+/g, '') === docLimpo
        );
        
        if (usuario) {
            sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(usuario));
        }
    } catch (error) {
        console.warn('Erro ao salvar dados da sessão:', error);
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
    const botaoSubmit = elementos.formCadastro?.querySelector('button[type="submit"]');
    
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
    
    setLoadingState(botaoSubmit, true);
    
    try {
        const resultado = await processarCadastro(nome, email, documento, password);
        
        if (elementos.cadastroSuccessMessage) {
            elementos.cadastroSuccessMessage.textContent = 'Cadastro realizado com sucesso!';
            elementos.cadastroSuccessMessage.style.display = 'block';
        }
        
        if (elementos.formCadastro) elementos.formCadastro.reset();
        
        // Redirecionamento rápido
        setTimeout(() => {
            if (elementos.cadastroModal) elementos.cadastroModal.style.display = 'none';
            if (elementos.loginModal) elementos.loginModal.style.display = 'flex';
        }, 2000);
        
    } catch (error) {
        mostrarErroCadastro(error.message || 'Erro ao criar conta.');
    } finally {
        setLoadingState(botaoSubmit, false);
    }
}

async function processarCadastro(nome, email, documento, password) {
    const docLimpo = documento.replace(/[^\d]+/g, '');

    try {
        console.log('📝 Cadastrando usuário via API...');

        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                nome: nome,
                email: email,
                documento: docLimpo,
                senha: password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro ao cadastrar usuário');
        }

        console.log('✅ Cadastro realizado com sucesso via API!');
        return { success: true, data: data.usuario };

    } catch (error) {
        console.error('❌ Erro no cadastro:', error);
        throw error;
    }
}

function criarEstruturaFinanceiraInicial() {
    const anoAtual = new Date().getFullYear();
    const estrutura = {};
    
    estrutura[anoAtual] = { meses: [] };
    for (let i = 0; i < 12; i++) {
        estrutura[anoAtual].meses[i] = {
            receitas: [],
            despesas: [],
            fechado: false,
            saldoAnterior: 0,
            saldoFinal: 0
        };
    }
    
    return estrutura;
}

// ================================================================
// RECUPERAÇÃO DE SENHA
// ================================================================

async function processarRecuperacaoSenha() {
    const email = document.getElementById('recuperacao-email')?.value?.trim();
    const botaoSubmit = elementos.formRecuperacao?.querySelector('button[type="submit"]');

    if (elementos.recuperacaoErrorMessage) elementos.recuperacaoErrorMessage.style.display = 'none';
    if (elementos.recuperacaoSuccessMessage) elementos.recuperacaoSuccessMessage.style.display = 'none';

    if (!email) {
        mostrarErroRecuperacao('Por favor, informe seu email');
        return;
    }

    setLoadingState(botaoSubmit, true);

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
        mostrarErroRecuperacao(error.message);
    } finally {
        setLoadingState(botaoSubmit, false);
    }
}

async function processarNovaSenha() {
    const email = document.getElementById('email-nova-senha')?.value?.trim();
    const novaSenha = document.getElementById('nova-senha')?.value?.trim();
    const confirmarSenha = document.getElementById('confirmar-nova-senha')?.value?.trim();
    const botaoSubmit = elementos.formNovaSenha?.querySelector('button[type="submit"]');
    
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
    
    setLoadingState(botaoSubmit, true);
    
    try {
        console.log('📤 Enviando nova senha para o servidor...');

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

        if (elementos.novaSenhaSuccessMessage) {
            elementos.novaSenhaSuccessMessage.textContent = 'Senha alterada com sucesso no banco!';
            elementos.novaSenhaSuccessMessage.style.display = 'block';
        }
        
        setTimeout(() => {
            if (elementos.novaSenhaModal) elementos.novaSenhaModal.style.display = 'none';
            if (elementos.loginModal) elementos.loginModal.style.display = 'flex';
        }, 2000);
        
    } catch (error) {
        console.error('❌ Erro ao resetar senha:', error);
        mostrarErroNovaSenha(error.message || 'Erro ao alterar senha no servidor.');
    } finally {
        setLoadingState(botaoSubmit, false);
    }
}

// ================================================================
// NAVEGAÇÃO ENTRE MODAIS
// ================================================================

function configurarNavegacaoModais() {
    // Abrir login
    if (elementos.openLoginModalBtn) {
        elementos.openLoginModalBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (elementos.loginModal) elementos.loginModal.style.display = 'flex';
        });
    }
    
    if (elementos.mobileLoginBtn) {
        elementos.mobileLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (elementos.loginModal) elementos.loginModal.style.display = 'flex';
        });
    }
    
    // Navegação login <-> cadastro
    if (elementos.modalAbrirCadastroBtn) {
        elementos.modalAbrirCadastroBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (elementos.loginModal) elementos.loginModal.style.display = 'none';
            if (elementos.cadastroModal) elementos.cadastroModal.style.display = 'flex';
        });
    }
    
    if (elementos.cadastroAbrirLoginBtn) {
        elementos.cadastroAbrirLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (elementos.cadastroModal) elementos.cadastroModal.style.display = 'none';
            if (elementos.loginModal) elementos.loginModal.style.display = 'flex';
        });
    }
    
    // Recuperação de senha
    if (elementos.esqueceuSenhaBtn) {
        elementos.esqueceuSenhaBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (elementos.loginModal) elementos.loginModal.style.display = 'none';
            if (elementos.recuperacaoModal) elementos.recuperacaoModal.style.display = 'flex';
        });
    }
    
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
            
            // Ocultar mensagens
            const error = modal.querySelector('.error-message');
            const success = modal.querySelector('.success-message');
            if (error) error.style.display = 'none';
            if (success) success.style.display = 'none';
            
            // Ocultar campo de código
            const campoCode = modal.querySelector('#campo-codigo-container');
            if (campoCode) campoCode.style.display = 'none';
        }
    }
    
    // Botões de fechar
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
        { campos: ['documento', 'password'], erro: elementos.errorMessage },
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
        loginForm: document.getElementById('login-form'),
        modalLoginForm: document.getElementById('modal-login-form'),
        formCadastro: document.getElementById('form-cadastro'),
        formRecuperacao: document.getElementById('form-recuperacao-senha'),
        formNovaSenha: document.getElementById('form-nova-senha'),
        
        // Mensagens
        errorMessage: document.getElementById('error-message'),
        modalErrorMessage: document.getElementById('modal-error-message'),
        cadastroErrorMessage: document.getElementById('cadastro-error-message'),
        cadastroSuccessMessage: document.getElementById('cadastro-success-message'),
        recuperacaoErrorMessage: document.getElementById('recuperacao-error-message'),
        recuperacaoSuccessMessage: document.getElementById('recuperacao-success-message'),
        novaSenhaErrorMessage: document.getElementById('nova-senha-error-message'),
        novaSenhaSuccessMessage: document.getElementById('nova-senha-success-message'),
        
        // Botões
        openLoginModalBtn: document.getElementById('openLoginModalBtn'),
        mobileLoginBtn: document.getElementById('mobile-login-btn'),
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
            console.warn('Erro ao registrar tentativa:', error);
        }
    }, 0);
}

// ================================================================
// FUNÇÕES DE RECUPERAÇÃO DE SENHA
// ================================================================

function gerarCodigoRecuperacao() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

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
        if (!emailJSDisponivel || !window.emailjs) {
            console.error('❌ EmailJS não foi carregado corretamente no navegador.');
            throw new Error('Serviço de e-mail indisponível');
        }
        
        // Estes nomes (to_email, to_name, etc) devem ser IGUAIS aos que estão no seu template do EmailJS
        const templateParams = {
            to_email: email,
            to_name: nomeUsuario,
            codigo_recuperacao: codigo,
            validade: '15 minutos',
            sistema_nome: 'Sistema de Controle Financeiro'
        };
        
        console.log('📤 Tentando disparar e-mail via EmailJS...', templateParams);
        
        const response = await emailjs.send(
            EMAIL_CONFIG.serviceId, 
            EMAIL_CONFIG.templateId, 
            templateParams
        );
        
        console.log('✅ Resposta do EmailJS:', response.status, response.text);
        return { success: true };
        
    } catch (error) {
        console.error('❌ Erro real no envio do e-mail:', error);
        return { success: false, message: 'Erro ao enviar e-mail: ' + (error.text || error.message) };
    }
}

function obterUsuarioPorEmail(email) {
    const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    return usuarios.find(u => u.email.toLowerCase() === email.toLowerCase());
}

// ================================================================
// VALIDAÇÕES
// ================================================================

function validarCPF(cpf) {
    cpf = cpf.replace(/[^\d]+/g, '');
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    
    let soma = 0;
    for (let i = 1; i <= 9; i++) {
        soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
    }
    
    let resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf.substring(9, 10))) return false;
    
    soma = 0;
    for (let i = 1; i <= 10; i++) {
        soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
    }
    
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf.substring(10, 11))) return false;
    
    return true;
}

function validarCNPJ(cnpj) {
    cnpj = cnpj.replace(/[^\d]+/g, '');
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
    
    let tamanho = cnpj.length - 2;
    let numeros = cnpj.substring(0, tamanho);
    let digitos = cnpj.substring(tamanho);
    let soma = 0;
    let pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
        soma += numeros.charAt(tamanho - i) * pos--;
        if (pos < 2) pos = 9;
    }
    
    let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    if (resultado != digitos.charAt(0)) return false;
    
    tamanho += 1;
    numeros = cnpj.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
        soma += numeros.charAt(tamanho - i) * pos--;
        if (pos < 2) pos = 9;
    }
    
    resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    if (resultado != digitos.charAt(1)) return false;
    
    return true;
}

function validarDocumento(documento) {
    const doc = documento.replace(/[^\d]+/g, '');
    if (doc.length === 11) return validarCPF(doc);
    if (doc.length === 14) return validarCNPJ(doc);
    return false;
}

function formatarDocumento(input) {
    let documento = input.value.replace(/\D/g, '');
    
    if (documento.length <= 11) {
        // CPF
        documento = documento.replace(/(\d{3})(\d)/, '$1.$2');
        documento = documento.replace(/(\d{3})(\d)/, '$1.$2');
        documento = documento.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    } else {
        // CNPJ
        documento = documento.replace(/^(\d{2})(\d)/, '$1.$2');
        documento = documento.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
        documento = documento.replace(/\.(\d{3})(\d)/, '.$1/$2');
        documento = documento.replace(/(\d{4})(\d)/, '$1-$2');
    }
    
    input.value = documento.substring(0, 18);
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

function setLoadingState(button, loading = true) {
    if (!button) return;

    if (loading) {
        // Salvar texto original antes de alterar
        if (!button.hasAttribute('data-original-text')) {
            button.setAttribute('data-original-text', button.textContent);
        }
        button.disabled = true;
        button.textContent = 'Carregando...';
        button.style.opacity = '0.7';
    } else {
        button.disabled = false;
        // Restaurar texto original
        const originalText = button.getAttribute('data-original-text');
        button.textContent = originalText || 'Entrar';
        button.style.opacity = '1';
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
        console.warn('Erro na limpeza:', error);
    }
}

function configurarLoginMinimo() {
    // Fallback básico caso tudo falhe
    try {
        const loginForm = document.getElementById('login-form');
        const modalLoginForm = document.getElementById('modal-login-form');
        
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const doc = document.getElementById('documento')?.value;
                const pass = document.getElementById('password')?.value;
                if (doc && pass) processarLoginMinimo(doc, pass);
            });
        }
        
        if (modalLoginForm) {
            modalLoginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const doc = document.getElementById('modal-documento')?.value;
                const pass = document.getElementById('modal-password')?.value;
                if (doc && pass) processarLoginMinimo(doc, pass);
            });
        }
        
        console.log('Login mínimo configurado');
    } catch (error) {
        console.error('Falha total:', error);
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
            sessionStorage.setItem('usuarioAtual', docLimpo);
            sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(usuario));
            window.location.href = 'index.html';
        } else {
            alert('Login inválido');
        }
    } catch (error) {
        console.error('Erro no login mínimo:', error);
        alert('Erro no sistema');
    }
}

// ================================================================
// FUNÇÕES GLOBAIS EXPORTADAS
// ================================================================

// ================================================================
// CONFIGURAR TOGGLE DE SENHA - EVENT LISTENERS NATIVOS
// ================================================================
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
        emailJSDisponivel,
        localStorage: testLocalStorage(),
        usuarios: JSON.parse(localStorage.getItem('usuarios') || '[]').length,
        usuarioAtual: sessionStorage.getItem('usuarioAtual'),
        usuarioDadosDisponivel: !!window.usuarioDados
    };
}

function limparSessao() {
    sessionStorage.removeItem('usuarioAtual');
    sessionStorage.removeItem('dadosUsuarioLogado');
    console.log('Sessão limpa');
}




// Exportar para escopo global
window.togglePassword = togglePassword;
window.diagnosticoLogin = diagnosticoLogin;
window.limparSessao = limparSessao;
window.loginSistemaInicializado = false;