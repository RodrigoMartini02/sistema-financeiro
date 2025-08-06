// ================================================================
// SISTEMA DE LOGIN INTEGRADO - VERSÃO FINAL CORRIGIDA
// Compatível com main.js e usuarioDados.js corrigidos
// ================================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('📦 Login.js carregado - iniciando sistema...');
    inicializarSistemaLogin().catch(error => {
        console.error('❌ Erro crítico na inicialização do login:', error);
        alert('Erro ao inicializar sistema. Por favor, recarregue a página.');
    });
});

// ================================================================
// VARIÁVEIS GLOBAIS E ESTADO DO SISTEMA
// ================================================================

let apiClient = null;
let sistemaAdapter = null; 
let useAPI = false;
let sistemaLoginInicializado = false;
let emailJSCarregado = false;

const EMAIL_CONFIG = {
    serviceId: 'service_financas',
    templateId: 'template_recuperacao', 
    userId: 'oW3fgPbnchMKc42Yf'
};

// ================================================================
// AGUARDAR DEPENDÊNCIAS E INICIALIZAÇÃO COORDENADA
// ================================================================

async function aguardarDependenciasLogin() {
    console.log('⏳ Aguardando dependências para login...');
    
    return new Promise((resolve) => {
        let tentativas = 0;
        const maxTentativas = 30; // 6 segundos
        
        function verificarDependencias() {
            tentativas++;
            
            // Verificar se as APIs globais estão disponíveis
            const apiDisponivel = window.apiClient && window.sistemaAdapter;
            const mainInicializado = window.sistemaInicializado === true;
            const usuarioDadosDisponivel = window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function';
            
            if (apiDisponivel || mainInicializado || usuarioDadosDisponivel) {
                console.log('✅ Dependências encontradas:', {
                    api: !!apiDisponivel,
                    main: !!mainInicializado, 
                    usuarioDados: !!usuarioDadosDisponivel,
                    tentativas
                });
                resolve(true);
            } else if (tentativas >= maxTentativas) {
                console.warn('⚠️ Timeout aguardando dependências, continuando...');
                resolve(false);
            } else {
                console.log(`⏳ Aguardando dependências... ${tentativas}/${maxTentativas}`);
                setTimeout(verificarDependencias, 200);
            }
        }
        
        verificarDependencias();
    });
}

async function configurarIntegracaoAPI() {
    // Tentar usar APIs globais se disponíveis
    if (window.apiClient && window.sistemaAdapter) {
        try {
            apiClient = window.apiClient;
            sistemaAdapter = window.sistemaAdapter;
            useAPI = window.useAPI || true;
            console.log('✅ Login integrado com API global');
            return true;
        } catch (error) {
            console.error('❌ Erro ao integrar com API global:', error);
        }
    }
    
    // Fallback - não usar API
    console.log('💾 Login configurado para usar apenas localStorage');
    useAPI = false;
    apiClient = null;
    sistemaAdapter = null;
    return false;
}

// ================================================================
// INICIALIZAÇÃO PRINCIPAL DO SISTEMA DE LOGIN
// ================================================================

async function inicializarSistemaLogin() {
    try {
        console.log('🚀 Inicializando sistema de login...');
        
        // Aguardar dependências
        await aguardarDependenciasLogin();
        
        // Configurar integração com API
        await configurarIntegracaoAPI();
        
        // Teste de localStorage
        if (!testLocalStorage()) {
            console.error("❌ LocalStorage não funciona!");
            alert("Seu navegador tem o armazenamento local desativado. Por favor, ative-o nas configurações do navegador.");
            return;
        }
        
        // Carregar EmailJS
        await carregarEmailJS();
        
        // Obter elementos do DOM
        const elementos = obterElementosDOM();
        
        if (!elementos.loginForm && !elementos.modalLoginForm) {
            console.error('❌ Nenhum formulário de login encontrado');
            return;
        }
        
        // Inicializar sistema
        await configurarSistemaLoginCompleto(elementos);
        
        sistemaLoginInicializado = true;
        window.loginSistemaInicializado = true;
        
        console.log('✅ Sistema de login inicializado:', {
            useAPI,
            emailJS: emailJSCarregado,
            elementos: Object.keys(elementos).filter(k => elementos[k]).length
        });
        
    } catch (error) {
        console.error('❌ Erro na inicialização do login:', error);
        // Tentar fallback básico
        await inicializarLoginFallback();
    }
}

async function inicializarLoginFallback() {
    console.log('🔄 Inicializando login via fallback...');
    
    try {
        const elementos = obterElementosDOM();
        
        // Configurar apenas formulários básicos
        if (elementos.loginForm) {
            elementos.loginForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                const documento = document.getElementById('documento')?.value?.trim();
                const password = document.getElementById('password')?.value?.trim();
                if (documento && password) {
                    await processarLoginBasico(documento, password, false);
                }
            });
        }
        
        if (elementos.modalLoginForm) {
            elementos.modalLoginForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                const documento = document.getElementById('modal-documento')?.value?.trim();
                const password = document.getElementById('modal-password')?.value?.trim();
                if (documento && password) {
                    await processarLoginBasico(documento, password, true);
                }
            });
        }
        
        configurarEventosBasicos(elementos);
        sistemaLoginInicializado = true;
        window.loginSistemaInicializado = true;
        
        console.log('✅ Login fallback inicializado');
        
    } catch (error) {
        console.error('❌ Falha total na inicialização do login:', error);
        alert('Erro crítico no sistema de login. Por favor, recarregue a página.');
    }
}

// ================================================================
// CONFIGURAÇÃO DE EMAILJS
// ================================================================

async function carregarEmailJS() {
    try {
        if (window.emailjs) {
            emailJSCarregado = true;
            console.log('✅ EmailJS já estava carregado');
            return true;
        }
        
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js';
            script.onload = () => {
                try {
                    emailjs.init(EMAIL_CONFIG.userId);
                    emailJSCarregado = true;
                    console.log('✅ EmailJS carregado e inicializado');
                    resolve(true);
                } catch (e) {
                    console.error('❌ Erro ao inicializar EmailJS:', e);
                    emailJSCarregado = false;
                    resolve(false);
                }
            };
            script.onerror = () => {
                console.error('❌ Erro ao carregar EmailJS');
                emailJSCarregado = false;
                resolve(false);
            };
            document.head.appendChild(script);
        });
        
    } catch (error) {
        console.error('❌ Erro ao carregar EmailJS:', error);
        emailJSCarregado = false;
        return false;
    }
}

// ================================================================
// OBTENÇÃO DE ELEMENTOS DO DOM
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
        
        // Mensagens de erro e sucesso
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
// AUTENTICAÇÃO HÍBRIDA CORRIGIDA
// ================================================================

async function validarLogin(documento, password) {
    console.log('🔐 Validando login...', useAPI ? 'via API' : 'via localStorage');
    
    // Registrar tentativa
    const docLimpo = documento.replace(/[^\d]+/g, '');
    
    // Verificar bloqueio
    const bloqueio = verificarBloqueioLogin(documento);
    if (bloqueio.bloqueado) {
        throw new Error(`Conta temporariamente bloqueada. Tente novamente em ${bloqueio.tempoRestante} minutos.`);
    }
    
    let loginValido = false;
    
    // Tentar API primeiro se disponível
    if (useAPI && apiClient) {
        try {
            console.log('🌐 Tentando login via API...');
            const resultado = await apiClient.login(documento, password);
            
            if (resultado && resultado.token) {
                localStorage.setItem('token', resultado.token);
                loginValido = true;
                console.log('✅ Login API bem-sucedido');
            }
        } catch (error) {
            console.error('❌ Erro no login via API:', error.message);
            console.log('🔄 Tentando fallback para localStorage...');
        }
    }
    
    // Fallback para localStorage se API falhou ou não está disponível
    if (!loginValido) {
        console.log('💾 Validando via localStorage...');
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const usuario = usuarios.find(u => 
            u.documento && 
            u.documento.replace(/[^\d]+/g, '') === docLimpo && 
            u.password === password
        );
        
        loginValido = !!usuario;
        console.log(loginValido ? '✅ Login localStorage válido' : '❌ Credenciais inválidas');
    }
    
    // Registrar tentativa
    registrarTentativaLogin(documento, loginValido);
    
    return loginValido;
}

// ================================================================
// PROCESSO DE LOGIN OTIMIZADO
// ================================================================

async function processarLogin(documento, password, isModal) {
    console.log('🚀 Iniciando processo de login...');
    
    const errorElement = isModal ? elementos.modalErrorMessage : elementos.errorMessage;
    const botaoSubmit = isModal ? 
        document.querySelector('#modal-login-form button[type="submit"]') :
        document.querySelector('#login-form button[type="submit"]');
    
    // Limpar mensagens de erro
    if (errorElement) errorElement.style.display = 'none';
    
    // Estado de loading
    setLoadingState(botaoSubmit, true);
    
    try {
        // Aguardar sistema estar pronto se necessário
        if (window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function') {
            console.log('⏳ Aguardando usuarioDados estar pronto...');
            await window.usuarioDados.aguardarPronto();
        }
        
        const loginValido = await validarLogin(documento, password);
        
        if (loginValido) {
            console.log('✅ Login bem-sucedido, configurando sessão...');
            
            const docLimpo = documento.replace(/[^\d]+/g, '');
            sessionStorage.setItem('usuarioAtual', docLimpo);
            
            // Salvar dados do usuário baseado no modo
            await salvarDadosUsuarioSessao(docLimpo);
            
            console.log('🔄 Redirecionando para sistema principal...');
            
            // Aguardar um pouco para garantir que dados foram salvos
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 200);
            
        } else {
            console.log('❌ Login inválido');
            mostrarErroLogin(errorElement, 'Documento ou senha incorretos');
            
            // Limpar senha
            const passwordField = isModal ? 
                document.getElementById('modal-password') : 
                document.getElementById('password');
            if (passwordField) passwordField.value = '';
        }
        
    } catch (error) {
        console.error('❌ Erro durante login:', error);
        mostrarErroLogin(errorElement, error.message || 'Erro no sistema. Tente novamente.');
    } finally {
        setLoadingState(botaoSubmit, false);
    }
}

async function processarLoginBasico(documento, password, isModal) {
    console.log('🚀 Processando login básico...');
    
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
            const errorElement = isModal ? 
                document.getElementById('modal-error-message') : 
                document.getElementById('error-message');
            mostrarErroLogin(errorElement, 'Documento ou senha incorretos');
        }
    } catch (error) {
        console.error('❌ Erro no login básico:', error);
    }
}

async function salvarDadosUsuarioSessao(docLimpo) {
    try {
        // Tentar obter dados via API primeiro
        if (useAPI && apiClient && apiClient.usuarioAtual) {
            sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(apiClient.usuarioAtual));
            console.log('💾 Dados do usuário da API salvos na sessão');
            return;
        }
        
        // Fallback para localStorage
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const usuario = usuarios.find(u => 
            u.documento && u.documento.replace(/[^\d]+/g, '') === docLimpo
        );
        
        if (usuario) {
            sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(usuario));
            console.log('💾 Dados do usuário do localStorage salvos na sessão');
        } else {
            console.warn('⚠️ Usuário não encontrado para salvar dados da sessão');
        }
    } catch (error) {
        console.error('❌ Erro ao salvar dados do usuário na sessão:', error);
    }
}

// ================================================================
// PROCESSO DE CADASTRO INTEGRADO
// ================================================================

async function processarCadastro(nome, email, documento, password) {
    console.log('📝 Iniciando processo de cadastro...');
    
    try {
        // Aguardar sistema estar pronto se necessário
        if (window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function') {
            console.log('⏳ Aguardando usuarioDados estar pronto...');
            await window.usuarioDados.aguardarPronto();
        }
        
        // Tentar cadastro via API primeiro
        if (useAPI && apiClient) {
            try {
                console.log('🌐 Tentando cadastro via API...');
                const dadosUsuario = { nome, email, documento, senha: password };
                const resultado = await apiClient.register(dadosUsuario);
                console.log('✅ Cadastro API bem-sucedido');
                return { success: true, data: resultado };
            } catch (error) {
                console.error('❌ Erro no cadastro via API:', error);
                console.log('🔄 Tentando fallback para localStorage...');
            }
        }
        
        // Fallback para localStorage
        return await processarCadastroLocal(nome, email, documento, password);
        
    } catch (error) {
        console.error('❌ Erro no processo de cadastro:', error);
        throw error;
    }
}

async function processarCadastroLocal(nome, email, documento, password) {
    console.log('💾 Cadastrando via localStorage...');
    
    const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    
    // Verificar se já existe
    const docLimpo = documento.replace(/[^\d]+/g, '');
    const jaExiste = usuarios.some(u => 
        u.email.toLowerCase() === email.toLowerCase() || 
        (u.documento && u.documento.replace(/[^\d]+/g, '') === docLimpo)
    );
    
    if (jaExiste) {
        throw new Error('Usuário já existe com este email ou documento');
    }
    
    const novoUsuario = {
        nome,
        email,
        documento,
        password,
        dataCadastro: new Date().toISOString(),
        dadosFinanceiros: criarEstruturaFinanceiraInicial()
    };
    
    usuarios.push(novoUsuario);
    localStorage.setItem('usuarios', JSON.stringify(usuarios));
    
    console.log('✅ Cadastro localStorage bem-sucedido');
    return { success: true, data: novoUsuario };
}

function criarEstruturaFinanceiraInicial() {
    const anoAtual = new Date().getFullYear();
    const estrutura = {};
    
    estrutura[anoAtual] = { meses: [] };
    for (let i = 0; i < 12; i++) {
        estrutura[anoAtual].meses[i] = {
            receitas: [],
            despesas: [],
            fechado: false
        };
    }
    
    return estrutura;
}

// ================================================================
// SISTEMA DE RECUPERAÇÃO DE SENHA
// ================================================================

function gerarCodigoRecuperacao() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function salvarCodigoRecuperacao(email, codigo) {
    const codigosRecuperacao = JSON.parse(localStorage.getItem('codigosRecuperacao')) || {};
    codigosRecuperacao[email] = {
        codigo: codigo,
        expiracao: Date.now() + (15 * 60 * 1000), // 15 minutos
        tentativas: 0
    };
    localStorage.setItem('codigosRecuperacao', JSON.stringify(codigosRecuperacao));
}

function verificarCodigoRecuperacao(email, codigoInformado) {
    const codigosRecuperacao = JSON.parse(localStorage.getItem('codigosRecuperacao')) || {};
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
    
    // Código válido - remover da lista
    delete codigosRecuperacao[email];
    localStorage.setItem('codigosRecuperacao', JSON.stringify(codigosRecuperacao));
    
    return { valido: true };
}

async function enviarEmailRecuperacao(email, codigo, nomeUsuario = 'Usuário') {
    try {
        if (!emailJSCarregado || !window.emailjs) {
            throw new Error('EmailJS não está disponível');
        }
        
        const templateParams = {
            to_email: email,
            to_name: nomeUsuario,
            codigo_recuperacao: codigo,
            validade: '15 minutos',
            sistema_nome: 'Sistema de Controle Financeiro',
            from_name: 'Sistema Financeiro'
        };
        
        const response = await emailjs.send(
            EMAIL_CONFIG.serviceId, 
            EMAIL_CONFIG.templateId, 
            templateParams
        );
        
        return { 
            success: true, 
            message: 'Email de recuperação enviado com sucesso!', 
            messageId: response.text 
        };
        
    } catch (error) {
        console.error('❌ Erro ao enviar email:', error);
        return { 
            success: false, 
            message: 'Erro ao enviar email: ' + error.message 
        };
    }
}

function obterUsuarioPorEmail(email) {
    const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    return usuarios.find(u => u.email.toLowerCase() === email.toLowerCase());
}

// ================================================================
// CONFIGURAÇÃO COMPLETA DO SISTEMA
// ================================================================

async function configurarSistemaLoginCompleto(elementos) {
    // Inicializar usuários se necessário
    if (!localStorage.getItem('usuarios')) {
        localStorage.setItem('usuarios', JSON.stringify([]));
    }
    
    // Configurar todos os event listeners
    configurarEventListenersLogin(elementos);
    configurarEventListenersCadastro(elementos);
    configurarEventListenersRecuperacao(elementos);
    configurarNavegacaoModais(elementos);
    configurarFechamentoModais(elementos);
    configurarLimpezaMensagens(elementos);
    configurarFormatacaoDocumentos(elementos);
    
    // Inicializar modais
    inicializarModais(elementos);
    
    console.log('✅ Sistema de login configurado completamente');
}

function configurarEventListenersLogin(elementos) {
    // Formulário de login principal
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
    
    // Formulário de login modal
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

function configurarEventListenersCadastro(elementos) {
    if (elementos.formCadastro) {
        elementos.formCadastro.addEventListener('submit', async function(e) {
            e.preventDefault();
            await processarFormularioCadastro(elementos);
        });
    }
}

async function processarFormularioCadastro(elementos) {
    const nome = document.getElementById('cadastro-nome')?.value?.trim();
    const email = document.getElementById('cadastro-email')?.value?.trim();
    const documento = document.getElementById('cadastro-documento')?.value?.trim();
    const password = document.getElementById('cadastro-password')?.value?.trim();
    const confirmPassword = document.getElementById('cadastro-confirm-password')?.value?.trim();
    const botaoSubmit = elementos.formCadastro.querySelector('button[type="submit"]');
    
    // Limpar mensagens
    if (elementos.cadastroErrorMessage) elementos.cadastroErrorMessage.style.display = 'none';
    if (elementos.cadastroSuccessMessage) elementos.cadastroSuccessMessage.style.display = 'none';
    
    // Validações
    if (!nome || !email || !documento || !password) {
        mostrarErroCadastro(elementos, 'Todos os campos são obrigatórios');
        return;
    }
    
    if (password !== confirmPassword) {
        mostrarErroCadastro(elementos, 'As senhas não coincidem');
        return;
    }
    
    if (password.length < 6) {
        mostrarErroCadastro(elementos, 'A senha deve ter pelo menos 6 caracteres');
        return;
    }
    
    if (!validarDocumento(documento)) {
        mostrarErroCadastro(elementos, 'CPF/CNPJ inválido');
        return;
    }
    
    // Estado de loading
    setLoadingState(botaoSubmit, true);
    
    try {
        const resultado = await processarCadastro(nome, email, documento, password);
        
        if (elementos.cadastroSuccessMessage) {
            elementos.cadastroSuccessMessage.textContent = 'Cadastro realizado com sucesso! Você já pode fazer login.';
            elementos.cadastroSuccessMessage.style.display = 'block';
        }
        
        // Limpar formulário
        if (elementos.formCadastro) elementos.formCadastro.reset();
        
        // Fechar modal após delay e redirecionar para login
        setTimeout(() => {
            if (elementos.cadastroModal) elementos.cadastroModal.style.display = 'none';
            if (window.innerWidth <= 768 && elementos.loginModal) {
                elementos.loginModal.style.display = 'flex';
            }
            if (elementos.cadastroSuccessMessage) elementos.cadastroSuccessMessage.style.display = 'none';
        }, 3000);
        
    } catch (error) {
        console.error('❌ Erro no cadastro:', error);
        mostrarErroCadastro(elementos, error.message || 'Erro ao criar conta. Tente novamente.');
    } finally {
        setLoadingState(botaoSubmit, false);
    }
}

function configurarEventListenersRecuperacao(elementos) {
    if (elementos.formRecuperacao) {
        elementos.formRecuperacao.addEventListener('submit', async function(e) {
            e.preventDefault();
            await processarRecuperacaoSenha(elementos);
        });
    }
    
    if (elementos.formNovaSenha) {
        elementos.formNovaSenha.addEventListener('submit', async function(e) {
            e.preventDefault();
            await processarNovaSenha(elementos);
        });
    }
}

async function processarRecuperacaoSenha(elementos) {
    const email = document.getElementById('recuperacao-email')?.value?.trim();
    const codigo = document.getElementById('codigo-recuperacao')?.value?.trim();
    const botaoSubmit = elementos.formRecuperacao.querySelector('button[type="submit"]');
    
    if (elementos.recuperacaoErrorMessage) elementos.recuperacaoErrorMessage.style.display = 'none';
    if (elementos.recuperacaoSuccessMessage) elementos.recuperacaoSuccessMessage.style.display = 'none';
    
    if (!email) {
        mostrarErroRecuperacao(elementos, 'Por favor, informe seu email');
        return;
    }
    
    setLoadingState(botaoSubmit, true);
    
    try {
        if (!codigo) {
            // Enviar código
            const usuario = obterUsuarioPorEmail(email);
            if (!usuario) {
                mostrarErroRecuperacao(elementos, 'Email não encontrado');
                return;
            }
            
            const codigoGerado = gerarCodigoRecuperacao();
            salvarCodigoRecuperacao(email, codigoGerado);
            
            const resultado = await enviarEmailRecuperacao(email, codigoGerado, usuario.nome);
            
            if (resultado.success) {
                if (elementos.recuperacaoSuccessMessage) {
                    elementos.recuperacaoSuccessMessage.textContent = 'Código enviado! Verifique seu email.';
                    elementos.recuperacaoSuccessMessage.style.display = 'block';
                }
                
                // Mostrar campo do código
                const campoCodeContainer = document.getElementById('campo-codigo-container');
                if (campoCodeContainer) {
                    campoCodeContainer.style.display = 'block';
                }
            } else {
                mostrarErroRecuperacao(elementos, resultado.message || 'Erro ao enviar email');
            }
            
        } else {
            // Verificar código
            const verificacao = verificarCodigoRecuperacao(email, codigo);
            
            if (verificacao.valido) {
                // Código válido - ir para nova senha
                if (elementos.recuperacaoModal) elementos.recuperacaoModal.style.display = 'none';
                if (elementos.novaSenhaModal) {
                    elementos.novaSenhaModal.style.display = 'flex';
                    document.getElementById('email-nova-senha').value = email;
                }
            } else {
                mostrarErroRecuperacao(elementos, verificacao.motivo || 'Código inválido');
            }
        }
        
    } catch (error) {
        console.error('❌ Erro na recuperação:', error);
        mostrarErroRecuperacao(elementos, 'Erro no sistema. Tente novamente.');
    } finally {
        setLoadingState(botaoSubmit, false);
    }
}

async function processarNovaSenha(elementos) {
    const email = document.getElementById('email-nova-senha')?.value?.trim();
    const novaSenha = document.getElementById('nova-senha')?.value?.trim();
    const confirmarSenha = document.getElementById('confirmar-nova-senha')?.value?.trim();
    const botaoSubmit = elementos.formNovaSenha.querySelector('button[type="submit"]');
    
    if (elementos.novaSenhaErrorMessage) elementos.novaSenhaErrorMessage.style.display = 'none';
    if (elementos.novaSenhaSuccessMessage) elementos.novaSenhaSuccessMessage.style.display = 'none';
    
    // Validações
    if (!novaSenha || !confirmarSenha) {
        mostrarErroNovaSenha(elementos, 'Todos os campos são obrigatórios');
        return;
    }
    
    if (novaSenha !== confirmarSenha) {
        mostrarErroNovaSenha(elementos, 'As senhas não coincidem');
        return;
    }
    
    if (novaSenha.length < 6) {
        mostrarErroNovaSenha(elementos, 'A senha deve ter pelo menos 6 caracteres');
        return;
    }
    
    setLoadingState(botaoSubmit, true);
    
    try {
        // Atualizar senha no localStorage
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const usuarioIndex = usuarios.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
        
        if (usuarioIndex === -1) {
            mostrarErroNovaSenha(elementos, 'Usuário não encontrado');
            return;
        }
        
        usuarios[usuarioIndex].password = novaSenha;
        localStorage.setItem('usuarios', JSON.stringify(usuarios));
        
        if (elementos.novaSenhaSuccessMessage) {
            elementos.novaSenhaSuccessMessage.textContent = 'Senha alterada com sucesso!';
            elementos.novaSenhaSuccessMessage.style.display = 'block';
        }
        
        // Fechar modal e redirecionar para login
        setTimeout(() => {
            if (elementos.novaSenhaModal) elementos.novaSenhaModal.style.display = 'none';
            if (elementos.loginModal) elementos.loginModal.style.display = 'flex';
            if (elementos.novaSenhaSuccessMessage) elementos.novaSenhaSuccessMessage.style.display = 'none';
        }, 3000);
        
    } catch (error) {
        console.error('❌ Erro ao alterar senha:', error);
        mostrarErroNovaSenha(elementos, 'Erro ao alterar senha. Tente novamente.');
    } finally {
        setLoadingState(botaoSubmit, false);
    }
}

// ================================================================
// NAVEGAÇÃO E CONTROLE DE MODAIS
// ================================================================

function configurarNavegacaoModais(elementos) {
    // Abrir modal de login
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
    
    // Navegar entre login e cadastro
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
    
    // Abrir recuperação de senha
    if (elementos.esqueceuSenhaBtn) {
        elementos.esqueceuSenhaBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (elementos.loginModal) elementos.loginModal.style.display = 'none';
            if (elementos.recuperacaoModal) elementos.recuperacaoModal.style.display = 'flex';
        });
    }
    
    // Voltar para login da recuperação
    if (elementos.recuperacaoAbrirLoginBtn) {
        elementos.recuperacaoAbrirLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (elementos.recuperacaoModal) elementos.recuperacaoModal.style.display = 'none';
            if (elementos.loginModal) elementos.loginModal.style.display = 'flex';
        });
    }
}

function configurarFechamentoModais(elementos) {
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
            
            // Ocultar campo de código se existir
            const campoCode = modal.querySelector('#campo-codigo-container');
            if (campoCode) campoCode.style.display = 'none';
        }
    }
    
    // Botões de fechar
    if (elementos.loginCloseBtn) {
        elementos.loginCloseBtn.addEventListener('click', () => fecharModal(elementos.loginModal));
    }
    
    if (elementos.cadastroCloseBtn) {
        elementos.cadastroCloseBtn.addEventListener('click', () => fecharModal(elementos.cadastroModal));
    }
    
    if (elementos.recuperacaoCloseBtn) {
        elementos.recuperacaoCloseBtn.addEventListener('click', () => fecharModal(elementos.recuperacaoModal));
    }
    
    if (elementos.novaSenhaCloseBtn) {
        elementos.novaSenhaCloseBtn.addEventListener('click', () => fecharModal(elementos.novaSenhaModal));
    }
    
    // Fechar clicando fora do modal
    window.addEventListener('click', function(event) {
        if (event.target === elementos.loginModal) fecharModal(elementos.loginModal);
        if (event.target === elementos.cadastroModal) fecharModal(elementos.cadastroModal);
        if (event.target === elementos.recuperacaoModal) fecharModal(elementos.recuperacaoModal);
        if (event.target === elementos.novaSenhaModal) fecharModal(elementos.novaSenhaModal);
    });
}

function configurarLimpezaMensagens(elementos) {
    // Limpar mensagens de erro ao digitar - Login
    const camposLogin = [
        'documento', 'password', 
        'modal-documento', 'modal-password'
    ];
    
    camposLogin.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('input', () => {
                const errorEl = fieldId.includes('modal') ? 
                    elementos.modalErrorMessage : elementos.errorMessage;
                if (errorEl) errorEl.style.display = 'none';
            });
        }
    });
    
    // Limpar mensagens de erro ao digitar - Cadastro
    const camposCadastro = [
        'cadastro-nome', 'cadastro-email', 
        'cadastro-documento', 'cadastro-password', 
        'cadastro-confirm-password'
    ];
    
    camposCadastro.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('input', () => {
                if (elementos.cadastroErrorMessage) {
                    elementos.cadastroErrorMessage.style.display = 'none';
                }
            });
        }
    });
    
    // Limpar mensagens de erro ao digitar - Recuperação
    const camposRecuperacao = ['recuperacao-email', 'codigo-recuperacao'];
    
    camposRecuperacao.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('input', () => {
                if (elementos.recuperacaoErrorMessage) {
                    elementos.recuperacaoErrorMessage.style.display = 'none';
                }
            });
        }
    });
    
    // Limpar mensagens de erro ao digitar - Nova senha
    const camposNovaSenha = ['nova-senha', 'confirmar-nova-senha'];
    
    camposNovaSenha.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('input', () => {
                if (elementos.novaSenhaErrorMessage) {
                    elementos.novaSenhaErrorMessage.style.display = 'none';
                }
            });
        }
    });
}

function configurarFormatacaoDocumentos(elementos) {
    const camposDocumento = [
        'documento', 'modal-documento', 'cadastro-documento'
    ];
    
    camposDocumento.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('input', () => formatarDocumento(field));
        }
    });
}

function inicializarModais(elementos) {
    // Ocultar todos os modais inicialmente
    const modais = [
        elementos.loginModal, 
        elementos.cadastroModal, 
        elementos.recuperacaoModal, 
        elementos.novaSenhaModal
    ];
    
    modais.forEach(modal => {
        if (modal) modal.style.display = 'none';
    });
    
    // Ocultar todas as mensagens inicialmente
    const mensagens = [
        elementos.errorMessage, elementos.modalErrorMessage,
        elementos.cadastroErrorMessage, elementos.cadastroSuccessMessage,
        elementos.recuperacaoErrorMessage, elementos.recuperacaoSuccessMessage,
        elementos.novaSenhaErrorMessage, elementos.novaSenhaSuccessMessage
    ];
    
    mensagens.forEach(msg => {
        if (msg) msg.style.display = 'none';
    });
    
    // Ocultar campos condicionais
    const campoCode = document.getElementById('campo-codigo-container');
    if (campoCode) campoCode.style.display = 'none';
}

function configurarEventosBasicos(elementos) {
    // Navegação básica entre modais
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

    // Fechar modais
    [elementos.loginCloseBtn, elementos.cadastroCloseBtn].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.modal');
                if (modal) modal.style.display = 'none';
            });
        }
    });
}

// ================================================================
// FUNÇÕES DE VALIDAÇÃO
// ================================================================

function validarCPF(cpf) {
    cpf = cpf.replace(/[^\d]+/g, '');
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    
    let soma = 0, resto;
    for (let i = 1; i <= 9; i++) {
        soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
    }
    
    resto = (soma * 10) % 11;
    if ((resto === 10) || (resto === 11)) resto = 0;
    if (resto !== parseInt(cpf.substring(9, 10))) return false;
    
    soma = 0;
    for (let i = 1; i <= 10; i++) {
        soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
    }
    
    resto = (soma * 10) % 11;
    if ((resto === 10) || (resto === 11)) resto = 0;
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
// FUNÇÕES DE EXIBIÇÃO DE MENSAGENS
// ================================================================

function mostrarErroLogin(errorElement, mensagem) {
    if (errorElement) {
        errorElement.textContent = mensagem;
        errorElement.style.display = 'block';
    }
}

function mostrarErroCadastro(elementos, mensagem) {
    if (elementos.cadastroErrorMessage) {
        elementos.cadastroErrorMessage.textContent = mensagem;
        elementos.cadastroErrorMessage.style.display = 'block';
    }
}

function mostrarErroRecuperacao(elementos, mensagem) {
    if (elementos.recuperacaoErrorMessage) {
        elementos.recuperacaoErrorMessage.textContent = mensagem;
        elementos.recuperacaoErrorMessage.style.display = 'block';
    }
}

function mostrarErroNovaSenha(elementos, mensagem) {
    if (elementos.novaSenhaErrorMessage) {
        elementos.novaSenhaErrorMessage.textContent = mensagem;
        elementos.novaSenhaErrorMessage.style.display = 'block';
    }
}

// ================================================================
// FUNÇÕES UTILITÁRIAS
// ================================================================

function testLocalStorage() {
    try {
        const testKey = '__test_storage__';
        localStorage.setItem(testKey, testKey);
        localStorage.removeItem(testKey);
        console.log('✅ LocalStorage funcionando');
        return true;
    } catch (e) {
        console.error("❌ LocalStorage não funciona:", e);
        return false;
    }
}

function setLoadingState(button, loading = true) {
    if (!button) return;
    
    if (loading) {
        button.classList.add('loading');
        button.disabled = true;
        const originalText = button.textContent;
        button.setAttribute('data-original-text', originalText);
        button.textContent = 'Carregando...';
    } else {
        button.classList.remove('loading');
        button.disabled = false;
        const originalText = button.getAttribute('data-original-text');
        if (originalText) {
            button.textContent = originalText;
        }
    }
}

// ================================================================
// SISTEMA DE SEGURANÇA E BLOQUEIO
// ================================================================

function registrarTentativaLogin(documento, sucesso) {
    try {
        const tentativas = JSON.parse(localStorage.getItem('tentativasLogin') || '{}');
        const agora = Date.now();
        const docLimpo = documento.replace(/[^\d]+/g, '');
        
        if (!tentativas[docLimpo]) {
            tentativas[docLimpo] = [];
        }
        
        tentativas[docLimpo].push({
            timestamp: agora,
            sucesso,
            ip: 'local',
            dispositivo: detectarDispositivo()
        });
        
        // Manter apenas últimas 10 tentativas
        tentativas[docLimpo] = tentativas[docLimpo].slice(-10);
        
        // Limpar tentativas antigas (mais de 24h)
        Object.keys(tentativas).forEach(doc => {
            tentativas[doc] = tentativas[doc].filter(t => agora - t.timestamp < 24 * 60 * 60 * 1000);
            if (tentativas[doc].length === 0) {
                delete tentativas[doc];
            }
        });
        
        localStorage.setItem('tentativasLogin', JSON.stringify(tentativas));
    } catch (error) {
        console.error('❌ Erro ao registrar tentativa:', error);
    }
}

function verificarBloqueioLogin(documento) {
    try {
        const tentativas = JSON.parse(localStorage.getItem('tentativasLogin') || '{}');
        const docLimpo = documento.replace(/[^\d]+/g, '');
        const tentativasUsuario = tentativas[docLimpo] || [];
        
        const agora = Date.now();
        const ultimaHora = agora - (60 * 60 * 1000);
        
        // Contar falhas na última hora
        const falhasRecentes = tentativasUsuario.filter(t => 
            !t.sucesso && t.timestamp > ultimaHora
        ).length;
        
        const bloqueado = falhasRecentes >= 5;
        const tempoRestante = bloqueado ? 
            Math.ceil((ultimaHora - Math.min(...tentativasUsuario.filter(t => !t.sucesso).map(t => t.timestamp))) / 1000 / 60) : 0;
        
        return {
            bloqueado,
            falhasRecentes,
            tempoRestante
        };
    } catch (error) {
        console.error('❌ Erro ao verificar bloqueio:', error);
        return { bloqueado: false, falhasRecentes: 0, tempoRestante: 0 };
    }
}

function detectarDispositivo() {
    const userAgent = navigator.userAgent;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const isTablet = /iPad|Android(?=.*Mobile)/i.test(userAgent);
    const isDesktop = !isMobile && !isTablet;
    
    return {
        isMobile,
        isTablet,
        isDesktop,
        userAgent,
        screen: {
            width: window.screen.width,
            height: window.screen.height
        }
    };
}

// ================================================================
// FUNÇÕES GLOBAIS PARA COMPATIBILIDADE
// ================================================================

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
    const status = {
        timestamp: new Date().toISOString(),
        sistemaLoginInicializado,
        useAPI,
        apiClient: !!apiClient,
        sistemaAdapter: !!sistemaAdapter,
        emailJSCarregado,
        localStorage: testLocalStorage(),
        sessionStorage: (() => {
            try {
                const test = 'test';
                sessionStorage.setItem(test, test);
                sessionStorage.removeItem(test);
                return true;
            } catch (e) {
                return false;
            }
        })(),
        usuarios: JSON.parse(localStorage.getItem('usuarios') || '[]').length,
        usuarioAtual: sessionStorage.getItem('usuarioAtual'),
        dadosUsuarioLogado: !!sessionStorage.getItem('dadosUsuarioLogado'),
        codigosRecuperacao: Object.keys(JSON.parse(localStorage.getItem('codigosRecuperacao') || '{}')).length
    };
    
    console.table(status);
    return status;
}

function limparSessaoCompleta() {
    try {
        // Limpar sessionStorage
        sessionStorage.removeItem('usuarioAtual');
        sessionStorage.removeItem('dadosUsuarioLogado');
        
        // Limpar tokens se existirem
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        
        // Limpar códigos de recuperação expirados
        const codigosRecuperacao = JSON.parse(localStorage.getItem('codigosRecuperacao') || '{}');
        const agora = Date.now();
        
        Object.keys(codigosRecuperacao).forEach(email => {
            if (codigosRecuperacao[email].expiracao < agora) {
                delete codigosRecuperacao[email];
            }
        });
        
        localStorage.setItem('codigosRecuperacao', JSON.stringify(codigosRecuperacao));
        
        console.log('🧹 Sessão limpa completamente');
        return true;
    } catch (error) {
        console.error('❌ Erro ao limpar sessão:', error);
        return false;
    }
}

function validarForcaSenha(senha) {
    const criterios = {
        tamanho: senha.length >= 8,
        maiuscula: /[A-Z]/.test(senha),
        minuscula: /[a-z]/.test(senha),
        numero: /\d/.test(senha),
        especial: /[!@#$%^&*(),.?":{}|<>]/.test(senha)
    };
    
    const pontuacao = Object.values(criterios).filter(Boolean).length;
    
    let forca = 'muito-fraca';
    if (pontuacao >= 5) forca = 'muito-forte';
    else if (pontuacao >= 4) forca = 'forte';
    else if (pontuacao >= 3) forca = 'media';
    else if (pontuacao >= 2) forca = 'fraca';
    
    return {
        forca,
        pontuacao,
        criterios,
        valida: pontuacao >= 3
    };
}

function verificarInicializacaoCompleta() {
    const status = {
        loginInicializado: sistemaLoginInicializado,
        sistemaMainInicializado: !!window.sistemaInicializado,
        usuarioDadosDisponivel: !!(window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function'),
        apiDisponivel: !!(window.apiClient && window.sistemaAdapter),
        dadosFinanceirosDisponivel: !!window.dadosFinanceiros
    };
    
    const todosInicializados = Object.values(status).every(Boolean);
    
    console.log('🔍 Status de inicialização completa:', status);
    console.log(todosInicializados ? '✅ Sistema completamente inicializado' : '⚠️ Sistema ainda inicializando...');
    
    return {
        completo: todosInicializados,
        detalhes: status
    };
}

function aguardarInicializacaoCompleta() {
    return new Promise((resolve) => {
        let tentativas = 0;
        const maxTentativas = 50; // 10 segundos
        
        function verificar() {
            tentativas++;
            const status = verificarInicializacaoCompleta();
            
            if (status.completo) {
                console.log('✅ Sistema completamente inicializado após', tentativas, 'tentativas');
                resolve(true);
            } else if (tentativas >= maxTentativas) {
                console.warn('⚠️ Timeout aguardando inicialização completa');
                resolve(false);
            } else {
                setTimeout(verificar, 200);
            }
        }
        
        verificar();
    });
}

// ================================================================
// EXPORTAÇÃO PARA ESCOPO GLOBAL
// ================================================================

// Exportar funções para compatibilidade
window.togglePassword = togglePassword;
window.diagnosticoLogin = diagnosticoLogin;
window.limparSessaoCompleta = limparSessaoCompleta;
window.validarForcaSenha = validarForcaSenha;
window.verificarInicializacaoCompleta = verificarInicializacaoCompleta;
window.aguardarInicializacaoCompleta = aguardarInicializacaoCompleta;
window.detectarDispositivo = detectarDispositivo;
window.registrarTentativaLogin = registrarTentativaLogin;
window.verificarBloqueioLogin = verificarBloqueioLogin;

// Exportar estado do sistema
window.sistemaLoginInicializado = sistemaLoginInicializado;

console.log('✅ Sistema de Login INTEGRADO E CORRIGIDO carregado!');