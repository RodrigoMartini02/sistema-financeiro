document.addEventListener('DOMContentLoaded', function() {
    console.log('Login otimizado carregado - inicialização rápida...');
    inicializarSistemaLoginRapido();
});

let elementos = {};
let emailJSDisponivel = false;

const EMAIL_CONFIG = {
    serviceId: 'service_financas',
    templateId: 'template_recuperacao', 
    userId: 'oW3fgPbnchMKc42Yf'
};

const API_URL = 'https://sistema-financeiro-kxed.onrender.com/api';

function inicializarSistemaLoginRapido() {
    try {
        console.log('Inicialização imediata do login...');
        
        if (!testLocalStorage()) {
            alert("Seu navegador tem o armazenamento local desativado. Por favor, ative-o nas configurações.");
            return;
        }
        
        elementos = obterElementosDOM();
        configurarSistemaCompleto();
        carregarDependenciasBackground();
        
        window.loginSistemaInicializado = true;
        console.log('Login pronto para uso');
        
    } catch (error) {
        console.error('Erro na inicialização:', error);
        configurarLoginMinimo();
    }
}

function configurarSistemaCompleto() {
    configurarEventListenersLogin();
    configurarEventListenersCadastro();
    configurarEventListenersRecuperacao();
    configurarNavegacaoModais();
    configurarFechamentoModais();
    configurarLimpezaMensagens();
    configurarFormatacaoDocumentos();
    inicializarModais();
}

function carregarDependenciasBackground() {
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
    
    if (window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function') {
        window.usuarioDados.aguardarPronto().then(() => {
            console.log('UsuarioDados integrado');
        });
    }
    
    verificarELimparDados();
}

function configurarEventListenersLogin() {
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
            await processarRecuperacaoSenha();
        });
    }
    
    if (elementos.formNovaSenha) {
        elementos.formNovaSenha.addEventListener('submit', async function(e) {
            e.preventDefault();
            await processarNovaSenha();
        });
    }
}

async function processarLogin(documento, password, isModal) {
    console.log('Processando login...');
    
    const errorElement = isModal ? elementos.modalErrorMessage : elementos.errorMessage;
    const botaoSubmit = isModal ? 
        document.querySelector('#modal-login-form button[type="submit"]') :
        document.querySelector('#login-form button[type="submit"]');
    
    if (errorElement) errorElement.style.display = 'none';
    setLoadingState(botaoSubmit, true);
    
    try {
        const loginValido = await validarLoginRapido(documento, password);
        
        if (loginValido) {
            window.location.href = 'index.html';
        }
        
    } catch (error) {
        console.error('Erro durante login:', error);
        mostrarErroLogin(errorElement, error.message || 'Erro no sistema. Tente novamente.');
        
        const passwordField = isModal ? 
            document.getElementById('modal-password') : 
            document.getElementById('password');
        if (passwordField) passwordField.value = '';
        
    } finally {
        setLoadingState(botaoSubmit, false);
    }
}

async function validarLoginRapido(documento, password) {
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                documento,
                senha: password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro ao fazer login');
        }

        sessionStorage.setItem('token', data.data.token);
        sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(data.data.usuario));
        sessionStorage.setItem('usuarioAtual', data.data.usuario.documento.replace(/[^\d]+/g, ''));

        return true;

    } catch (error) {
        console.error('Erro no login:', error);
        throw error;
    }
}

async function processarFormularioCadastro() {
    const nome = document.getElementById('cadastro-nome')?.value?.trim();
    const email = document.getElementById('cadastro-email')?.value?.trim();
    const documento = document.getElementById('cadastro-documento')?.value?.trim();
    const password = document.getElementById('cadastro-password')?.value?.trim();
    const confirmPassword = document.getElementById('cadastro-confirm-password')?.value?.trim();
    const botaoSubmit = elementos.formCadastro?.querySelector('button[type="submit"]');
    
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
    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                nome,
                email,
                documento,
                senha: password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro ao cadastrar');
        }

        return { success: true, data: data.data };

    } catch (error) {
        throw new Error(error.message);
    }
}

async function processarRecuperacaoSenha() {
    const email = document.getElementById('recuperacao-email')?.value?.trim();
    const codigo = document.getElementById('codigo-recuperacao')?.value?.trim();
    const botaoSubmit = elementos.formRecuperacao?.querySelector('button[type="submit"]');
    
    if (elementos.recuperacaoErrorMessage) elementos.recuperacaoErrorMessage.style.display = 'none';
    if (elementos.recuperacaoSuccessMessage) elementos.recuperacaoSuccessMessage.style.display = 'none';
    
    if (!email) {
        mostrarErroRecuperacao('Por favor, informe seu email');
        return;
    }
    
    setLoadingState(botaoSubmit, true);
    
    try {
        if (!codigo) {
            const usuario = obterUsuarioPorEmail(email);
            if (!usuario) {
                mostrarErroRecuperacao('Email não encontrado');
                return;
            }
            
            if (!emailJSDisponivel) {
                mostrarErroRecuperacao('Serviço de email temporariamente indisponível');
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
                
                const campoCodeContainer = document.getElementById('campo-codigo-container');
                if (campoCodeContainer) {
                    campoCodeContainer.style.display = 'block';
                }
            } else {
                mostrarErroRecuperacao('Erro ao enviar email');
            }
            
        } else {
            const verificacao = verificarCodigoRecuperacao(email, codigo);
            
            if (verificacao.valido) {
                if (elementos.recuperacaoModal) elementos.recuperacaoModal.style.display = 'none';
                if (elementos.novaSenhaModal) {
                    elementos.novaSenhaModal.style.display = 'flex';
                    const emailField = document.getElementById('email-nova-senha');
                    if (emailField) emailField.value = email;
                }
            } else {
                mostrarErroRecuperacao(verificacao.motivo || 'Código inválido');
            }
        }
        
    } catch (error) {
        console.error('Erro na recuperação:', error);
        mostrarErroRecuperacao('Erro no sistema. Tente novamente.');
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
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const usuarioIndex = usuarios.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
        
        if (usuarioIndex === -1) {
            mostrarErroNovaSenha('Usuário não encontrado');
            return;
        }
        
        usuarios[usuarioIndex].password = novaSenha;
        localStorage.setItem('usuarios', JSON.stringify(usuarios));
        
        if (elementos.novaSenhaSuccessMessage) {
            elementos.novaSenhaSuccessMessage.textContent = 'Senha alterada com sucesso!';
            elementos.novaSenhaSuccessMessage.style.display = 'block';
        }
        
        setTimeout(() => {
            if (elementos.novaSenhaModal) elementos.novaSenhaModal.style.display = 'none';
            if (elementos.loginModal) elementos.loginModal.style.display = 'flex';
        }, 1800);
        
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        mostrarErroNovaSenha('Erro ao alterar senha.');
    } finally {
        setLoadingState(botaoSubmit, false);
    }
}

function configurarNavegacaoModais() {
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

function obterElementosDOM() {
    return {
        loginModal: document.getElementById('loginModal'),
        cadastroModal: document.getElementById('cadastroModal'),
        recuperacaoModal: document.getElementById('recuperacaoSenhaModal'),
        novaSenhaModal: document.getElementById('novaSenhaModal'),
        
        loginForm: document.getElementById('login-form'),
        modalLoginForm: document.getElementById('modal-login-form'),
        formCadastro: document.getElementById('form-cadastro'),
        formRecuperacao: document.getElementById('form-recuperacao-senha'),
        formNovaSenha: document.getElementById('form-nova-senha'),
        
        errorMessage: document.getElementById('error-message'),
        modalErrorMessage: document.getElementById('modal-error-message'),
        cadastroErrorMessage: document.getElementById('cadastro-error-message'),
        cadastroSuccessMessage: document.getElementById('cadastro-success-message'),
        recuperacaoErrorMessage: document.getElementById('recuperacao-error-message'),
        recuperacaoSuccessMessage: document.getElementById('recuperacao-success-message'),
        novaSenhaErrorMessage: document.getElementById('nova-senha-error-message'),
        novaSenhaSuccessMessage: document.getElementById('nova-senha-success-message'),
        
        openLoginModalBtn: document.getElementById('openLoginModalBtn'),
        mobileLoginBtn: document.getElementById('mobile-login-btn'),
        modalAbrirCadastroBtn: document.getElementById('modal-abrir-cadastro'),
        cadastroAbrirLoginBtn: document.getElementById('cadastro-abrir-login'),
        esqueceuSenhaBtn: document.getElementById('modal-esqueceu-senha'),
        recuperacaoAbrirLoginBtn: document.getElementById('recuperacao-abrir-login'),
        
        loginCloseBtn: document.querySelector('.login-close'),
        cadastroCloseBtn: document.querySelector('.cadastro-close'),
        recuperacaoCloseBtn: document.querySelector('.recuperacao-close'),
        novaSenhaCloseBtn: document.querySelector('.nova-senha-close')
    };
}

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
            throw new Error('EmailJS não disponível');
        }
        
        const templateParams = {
            to_email: email,
            to_name: nomeUsuario,
            codigo_recuperacao: codigo,
            validade: '15 minutos',
            sistema_nome: 'Sistema de Controle Financeiro'
        };
        
        const response = await emailjs.send(
            EMAIL_CONFIG.serviceId, 
            EMAIL_CONFIG.templateId, 
            templateParams
        );
        
        return { success: true, message: 'Email enviado com sucesso!' };
        
    } catch (error) {
        console.error('Erro ao enviar email:', error);
        return { success: false, message: 'Erro ao enviar email: ' + error.message };
    }
}

function obterUsuarioPorEmail(email) {
    const usuarios = JSON.parse(localStorage.getItem('usuarios') || '[]');
    return usuarios.find(u => u.email.toLowerCase() === email.toLowerCase());
}

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
    
    tamanho++;
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
        documento = documento.replace(/(\d{3})(\d)/, '$1.$2');
        documento = documento.replace(/(\d{3})(\d)/, '$1.$2');
        documento = documento.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    } else {
        documento = documento.replace(/^(\d{2})(\d)/, '$1.$2');
        documento = documento.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
        documento = documento.replace(/\.(\d{3})(\d)/, '.$1/$2');
        documento = documento.replace(/(\d{4})(\d)/, '$1-$2');
    }
    
    input.value = documento.substring(0, 18);
}

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
        button.disabled = true;
        button.textContent = 'Carregando...';
        button.style.opacity = '0.7';
    } else {
        button.disabled = false;
        button.textContent = button.getAttribute('data-original-text') || 'Entrar';
        button.style.opacity = '1';
    }
}

function verificarELimparDados() {
    try {
        const agora = Date.now();
        
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
    } catch (error) {
        console.warn('Erro na limpeza:', error);
    }
}

function configurarLoginMinimo() {
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
        token: !!sessionStorage.getItem('token'),
        usuarioAtual: sessionStorage.getItem('usuarioAtual')
    };
}

function limparSessao() {
    sessionStorage.removeItem('usuarioAtual');
    sessionStorage.removeItem('dadosUsuarioLogado');
    sessionStorage.removeItem('token');
    console.log('Sessão limpa');
}

window.togglePassword = togglePassword;
window.diagnosticoLogin = diagnosticoLogin;
window.limparSessao = limparSessao;
window.loginSistemaInicializado = false;