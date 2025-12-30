const API_URL = 'https://sistema-financeiro-backend-o199.onrender.com/api';

document.addEventListener('DOMContentLoaded', function() {
    console.log('Sistema de login inicializado');
    inicializarLogin();
});

let elementos = {};

function inicializarLogin() {
    elementos = obterElementosDOM();
    configurarEventListeners();
    configurarNavegacaoModais();
    configurarFechamentoModais();
    configurarFormatacaoDocumentos();
    inicializarEstadoModais();
}

function obterElementosDOM() {
    return {
        loginModal: document.getElementById('loginModal'),
        cadastroModal: document.getElementById('cadastroModal'),
        recuperacaoModal: document.getElementById('recuperacaoSenhaModal'),
        
        loginForm: document.getElementById('login-form'),
        modalLoginForm: document.getElementById('modal-login-form'),
        formCadastro: document.getElementById('form-cadastro'),
        formRecuperacao: document.getElementById('form-recuperacao-senha'),
        
        errorMessage: document.getElementById('error-message'),
        modalErrorMessage: document.getElementById('modal-error-message'),
        cadastroErrorMessage: document.getElementById('cadastro-error-message'),
        cadastroSuccessMessage: document.getElementById('cadastro-success-message'),
        recuperacaoErrorMessage: document.getElementById('recuperacao-error-message'),
        recuperacaoSuccessMessage: document.getElementById('recuperacao-success-message'),
        
        openLoginModalBtn: document.getElementById('openLoginModalBtn'),
        modalAbrirCadastroBtn: document.getElementById('modal-abrir-cadastro'),
        cadastroAbrirLoginBtn: document.getElementById('cadastro-abrir-login'),
        esqueceuSenhaBtn: document.getElementById('modal-esqueceu-senha'),
        recuperacaoAbrirLoginBtn: document.getElementById('recuperacao-abrir-login')
    };
}

function configurarEventListeners() {
    if (elementos.loginForm) {
        elementos.loginForm.addEventListener('submit', (e) => processarLogin(e, false));
    }
    
    if (elementos.modalLoginForm) {
        elementos.modalLoginForm.addEventListener('submit', (e) => processarLogin(e, true));
    }
    
    if (elementos.formCadastro) {
        elementos.formCadastro.addEventListener('submit', processarCadastro);
    }
    
    if (elementos.formRecuperacao) {
        elementos.formRecuperacao.addEventListener('submit', processarRecuperacao);
    }
}

async function processarLogin(event, isModal) {
    event.preventDefault();
    
    const documentoId = isModal ? 'modal-documento' : 'documento';
    const passwordId = isModal ? 'modal-password' : 'password';
    const errorElement = isModal ? elementos.modalErrorMessage : elementos.errorMessage;
    
    const documento = document.getElementById(documentoId)?.value?.trim();
    const senha = document.getElementById(passwordId)?.value?.trim();
    const botaoSubmit = event.target.querySelector('button[type="submit"]');
    
    if (!documento || !senha) {
        mostrarErro(errorElement, 'Documento e senha são obrigatórios');
        return;
    }
    
    setLoadingState(botaoSubmit, true);
    limparErro(errorElement);
    
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documento, senha })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro no login');
        }

        if (!data.data?.token || !data.data?.usuario) {
            throw new Error('Resposta inválida do servidor');
        }

        sessionStorage.setItem('token', data.data.token);
        sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(data.data.usuario));
        sessionStorage.setItem('usuarioAtual', data.data.usuario.documento.replace(/[^\d]+/g, ''));

        window.location.href = 'index.html';

    } catch (error) {
        console.error('Erro no login:', error);
        mostrarErro(errorElement, error.message);
        document.getElementById(passwordId).value = '';
    } finally {
        setLoadingState(botaoSubmit, false);
    }
}

async function processarCadastro(event) {
    event.preventDefault();
    
    const nome = document.getElementById('cadastro-nome')?.value?.trim();
    const email = document.getElementById('cadastro-email')?.value?.trim();
    const documento = document.getElementById('cadastro-documento')?.value?.trim();
    const senha = document.getElementById('cadastro-password')?.value?.trim();
    const confirmarSenha = document.getElementById('cadastro-confirm-password')?.value?.trim();
    const botaoSubmit = event.target.querySelector('button[type="submit"]');
    
    limparErro(elementos.cadastroErrorMessage);
    limparSucesso(elementos.cadastroSuccessMessage);
    
    const validacao = validarCadastro(nome, email, documento, senha, confirmarSenha);
    if (!validacao.valido) {
        mostrarErro(elementos.cadastroErrorMessage, validacao.erro);
        return;
    }
    
    setLoadingState(botaoSubmit, true);
    
    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, email, documento, senha })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro no cadastro');
        }

        mostrarSucesso(elementos.cadastroSuccessMessage, 'Cadastro realizado com sucesso!');
        elementos.formCadastro.reset();
        
        setTimeout(() => {
            fecharModal(elementos.cadastroModal);
            abrirModal(elementos.loginModal);
        }, 2000);

    } catch (error) {
        console.error('Erro no cadastro:', error);
        mostrarErro(elementos.cadastroErrorMessage, error.message);
    } finally {
        setLoadingState(botaoSubmit, false);
    }
}

async function processarRecuperacao(event) {
    event.preventDefault();
    
    const email = document.getElementById('recuperacao-email')?.value?.trim();
    const botaoSubmit = event.target.querySelector('button[type="submit"]');
    
    if (!email) {
        mostrarErro(elementos.recuperacaoErrorMessage, 'Email é obrigatório');
        return;
    }
    
    if (!validarEmail(email)) {
        mostrarErro(elementos.recuperacaoErrorMessage, 'Email inválido');
        return;
    }
    
    setLoadingState(botaoSubmit, true);
    limparErro(elementos.recuperacaoErrorMessage);
    
    try {
        const response = await fetch(`${API_URL}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (response.ok) {
            mostrarSucesso(elementos.recuperacaoSuccessMessage, 'Instruções enviadas para seu email!');
            setTimeout(() => {
                fecharModal(elementos.recuperacaoModal);
                abrirModal(elementos.loginModal);
            }, 3000);
        } else {
            mostrarErro(elementos.recuperacaoErrorMessage, data.message || 'Email não encontrado');
        }

    } catch (error) {
        console.error('Erro na recuperação:', error);
        mostrarErro(elementos.recuperacaoErrorMessage, 'Erro no servidor. Tente novamente.');
    } finally {
        setLoadingState(botaoSubmit, false);
    }
}

function validarCadastro(nome, email, documento, senha, confirmarSenha) {
    if (!nome || !email || !documento || !senha) {
        return { valido: false, erro: 'Todos os campos são obrigatórios' };
    }
    
    if (senha !== confirmarSenha) {
        return { valido: false, erro: 'As senhas não coincidem' };
    }
    
    if (senha.length < 6) {
        return { valido: false, erro: 'A senha deve ter pelo menos 6 caracteres' };
    }
    
    if (!validarEmail(email)) {
        return { valido: false, erro: 'Email inválido' };
    }
    
    if (!validarDocumento(documento)) {
        return { valido: false, erro: 'CPF/CNPJ inválido' };
    }
    
    return { valido: true };
}

function configurarNavegacaoModais() {
    if (elementos.openLoginModalBtn) {
        elementos.openLoginModalBtn.addEventListener('click', (e) => {
            e.preventDefault();
            abrirModal(elementos.loginModal);
        });
    }
    
    if (elementos.modalAbrirCadastroBtn) {
        elementos.modalAbrirCadastroBtn.addEventListener('click', (e) => {
            e.preventDefault();
            fecharModal(elementos.loginModal);
            abrirModal(elementos.cadastroModal);
        });
    }
    
    if (elementos.cadastroAbrirLoginBtn) {
        elementos.cadastroAbrirLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            fecharModal(elementos.cadastroModal);
            abrirModal(elementos.loginModal);
        });
    }
    
    if (elementos.esqueceuSenhaBtn) {
        elementos.esqueceuSenhaBtn.addEventListener('click', (e) => {
            e.preventDefault();
            fecharModal(elementos.loginModal);
            abrirModal(elementos.recuperacaoModal);
        });
    }
    
    if (elementos.recuperacaoAbrirLoginBtn) {
        elementos.recuperacaoAbrirLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            fecharModal(elementos.recuperacaoModal);
            abrirModal(elementos.loginModal);
        });
    }
}

function configurarFechamentoModais() {
    const modais = [elementos.loginModal, elementos.cadastroModal, elementos.recuperacaoModal];
    
    modais.forEach(modal => {
        if (modal) {
            const closeBtn = modal.querySelector('.close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => fecharModal(modal));
            }
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    fecharModal(modal);
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

function inicializarEstadoModais() {
    const modais = [elementos.loginModal, elementos.cadastroModal, elementos.recuperacaoModal];
    modais.forEach(modal => {
        if (modal) modal.style.display = 'none';
    });
    
    const mensagens = [
        elementos.errorMessage, elementos.modalErrorMessage,
        elementos.cadastroErrorMessage, elementos.cadastroSuccessMessage,
        elementos.recuperacaoErrorMessage, elementos.recuperacaoSuccessMessage
    ];
    mensagens.forEach(msg => {
        if (msg) msg.style.display = 'none';
    });
}

function abrirModal(modal) {
    if (modal) {
        modal.style.display = 'flex';
    }
}

function fecharModal(modal) {
    if (modal) {
        modal.style.display = 'none';
        const form = modal.querySelector('form');
        if (form) form.reset();
        
        const mensagensErro = modal.querySelectorAll('.error-message');
        const mensagensSucesso = modal.querySelectorAll('.success-message');
        
        mensagensErro.forEach(msg => msg.style.display = 'none');
        mensagensSucesso.forEach(msg => msg.style.display = 'none');
    }
}

function mostrarErro(elemento, mensagem) {
    if (elemento) {
        elemento.textContent = mensagem;
        elemento.style.display = 'block';
    }
}

function limparErro(elemento) {
    if (elemento) {
        elemento.style.display = 'none';
    }
}

function mostrarSucesso(elemento, mensagem) {
    if (elemento) {
        elemento.textContent = mensagem;
        elemento.style.display = 'block';
    }
}

function limparSucesso(elemento) {
    if (elemento) {
        elemento.style.display = 'none';
    }
}

function setLoadingState(button, loading) {
    if (!button) return;
    
    if (loading) {
        button.disabled = true;
        button.textContent = 'Carregando...';
        button.style.opacity = '0.7';
    } else {
        button.disabled = false;
        button.textContent = button.getAttribute('data-text') || 'Entrar';
        button.style.opacity = '1';
    }
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

function validarEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
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

function togglePassword(inputId, button) {
    const input = document.getElementById(inputId);
    const icon = button.querySelector('i');
    
    if (!input || !icon) return;
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

window.togglePassword = togglePassword;