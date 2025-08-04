// =====================================================
// Sistema de Controle Financeiro - Login JavaScript
// VERSÃO COM EMAIL REAL USANDO EMAILJS + API INTEGRADA
// =====================================================

document.addEventListener('DOMContentLoaded', function() {
    // =====================================================
    // VARIÁVEIS DE INTEGRAÇÃO COM API
    // =====================================================
    
    let apiClient = null;
    let useAPI = true;

    // =====================================================
    // CONFIGURAÇÃO EMAILJS - CONFIGURE SUAS CREDENCIAIS
    // =====================================================
    
    const EMAIL_CONFIG = {
        serviceId: 'service_financas',
        templateId: 'template_recuperacao', 
        userId: 'oW3fgPbnchMKc42Yf'
    };

    // =====================================================
    // INICIALIZAÇÃO DO SISTEMA
    // =====================================================
    
    // Inicializar API Client
    function initializeAPIClient() {
        if (typeof window.apiClient !== 'undefined') {
            apiClient = window.apiClient;
            console.log('✅ API Client inicializado');
            return true;
        } else {
            console.warn('⚠️ API Client não encontrado, usando localStorage');
            useAPI = false;
            return false;
        }
    }

    // Aguardar API estar disponível
    setTimeout(() => {
        initializeAPIClient();
    }, 500);
    
    // Carregar EmailJS dinamicamente
    function carregarEmailJS() {
        return new Promise((resolve, reject) => {
            if (window.emailjs) {
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js';
            script.onload = () => {
                emailjs.init(EMAIL_CONFIG.userId);
                console.log('✅ EmailJS carregado com sucesso');
                resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    // Carregar EmailJS na inicialização
    carregarEmailJS().catch(error => {
        console.error('❌ Erro ao carregar EmailJS:', error);
    });

    // Teste do localStorage no início
    try {
        const testKey = '__test_storage__';
        localStorage.setItem(testKey, testKey);
        localStorage.removeItem(testKey);
        console.log("✅ LocalStorage está funcionando corretamente");
    } catch (e) {
        console.error("❌ ERRO: LocalStorage não está funcionando!", e);
        alert("Seu navegador tem o armazenamento local desativado. Por favor, ative-o nas configurações do navegador para usar o sistema.");
    }

    // Elementos principais - Login
    const loginModal = document.getElementById('loginModal');
    const loginForm = document.getElementById('login-form');
    const modalLoginForm = document.getElementById('modal-login-form');
    const errorMessage = document.getElementById('error-message');
    const modalErrorMessage = document.getElementById('modal-error-message');
    const openLoginModalBtn = document.getElementById('openLoginModalBtn');
    const mobileLoginBtn = document.getElementById('mobile-login-btn');
    const loginCloseBtn = document.querySelector('.login-close');
    
    // Elementos principais - Cadastro
    const cadastroModal = document.getElementById('cadastroModal');
    const formCadastro = document.getElementById('form-cadastro');
    const cadastroErrorMessage = document.getElementById('cadastro-error-message');
    const cadastroSuccessMessage = document.getElementById('cadastro-success-message');
    const cadastroCloseBtn = document.querySelector('.cadastro-close');
    
    // Elementos principais - Recuperação de Senha
    const recuperacaoModal = document.getElementById('recuperacaoSenhaModal');
    const formRecuperacao = document.getElementById('form-recuperacao-senha');
    const recuperacaoErrorMessage = document.getElementById('recuperacao-error-message');
    const recuperacaoSuccessMessage = document.getElementById('recuperacao-success-message');
    const recuperacaoCloseBtn = document.querySelector('.recuperacao-close');
    
    // Elementos principais - Nova Senha
    const novaSenhaModal = document.getElementById('novaSenhaModal');
    const formNovaSenha = document.getElementById('form-nova-senha');
    const novaSenhaErrorMessage = document.getElementById('nova-senha-error-message');
    const novaSenhaSuccessMessage = document.getElementById('nova-senha-success-message');
    const novaSenhaCloseBtn = document.querySelector('.nova-senha-close');
    
    // Elementos para alternar entre login e cadastro
    const abrirCadastroBtn = document.getElementById('abrir-cadastro');
    const modalAbrirCadastroBtn = document.getElementById('modal-abrir-cadastro');
    const cadastroAbrirLoginBtn = document.getElementById('cadastro-abrir-login');
    
    // Elementos para esqueceu senha
    const esqueceuSenhaBtn = document.getElementById('modal-esqueceu-senha');
    const recuperacaoAbrirLoginBtn = document.getElementById('recuperacao-abrir-login');
    
    // =====================================================
    // SISTEMA DE CÓDIGOS DE RECUPERAÇÃO
    // =====================================================
    
    // Gerar código de 6 dígitos
    function gerarCodigoRecuperacao() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
    
    // Salvar código de recuperação temporariamente
    function salvarCodigoRecuperacao(email, codigo) {
        const codigosRecuperacao = JSON.parse(localStorage.getItem('codigosRecuperacao')) || {};
        codigosRecuperacao[email] = {
            codigo: codigo,
            expiracao: Date.now() + (15 * 60 * 1000), // 15 minutos
            tentativas: 0
        };
        localStorage.setItem('codigosRecuperacao', JSON.stringify(codigosRecuperacao));
        
        console.log(`🔐 Código de recuperação salvo para ${email}: ${codigo}`);
    }
    
    // Verificar código de recuperação
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
    
    // =====================================================
    // FUNÇÕES DE EMAIL REAL
    // =====================================================
    
    // Enviar email de recuperação real
    async function enviarEmailRecuperacao(email, codigo, nomeUsuario = 'Usuário') {
        try {
            if (!window.emailjs) {
                throw new Error('EmailJS não está carregado');
            }
            
            const templateParams = {
                to_email: email,
                to_name: nomeUsuario,
                codigo_recuperacao: codigo,
                validade: '15 minutos',
                sistema_nome: 'Sistema de Controle Financeiro',
                from_name: 'Sistema Financeiro'
            };
            
            console.log('📧 Enviando email de recuperação...', { email, codigo });
            
            const response = await emailjs.send(
                EMAIL_CONFIG.serviceId,
                EMAIL_CONFIG.templateId,
                templateParams
            );
            
            console.log('✅ Email enviado com sucesso:', response);
            
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
    
    // =====================================================
    // FUNÇÕES DE VALIDAÇÃO E FORMATAÇÃO
    // =====================================================
    
    // Inicialização do Local Storage para usuários, se não existir
    if (!localStorage.getItem('usuarios')) {
        localStorage.setItem('usuarios', JSON.stringify([]));
        console.log("✅ LocalStorage inicializado para 'usuarios'");
    }
    
    // Função para validar CPF
    function validarCPF(cpf) {
        cpf = cpf.replace(/[^\d]+/g, '');
        if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
        
        let soma = 0;
        let resto;
        
        for (let i = 1; i <= 9; i++) 
            soma = soma + parseInt(cpf.substring(i-1, i)) * (11 - i);
        
        resto = (soma * 10) % 11;
        if ((resto === 10) || (resto === 11)) resto = 0;
        if (resto !== parseInt(cpf.substring(9, 10))) return false;
        
        soma = 0;
        for (let i = 1; i <= 10; i++) 
            soma = soma + parseInt(cpf.substring(i-1, i)) * (12 - i);
            
        resto = (soma * 10) % 11;
        if ((resto === 10) || (resto === 11)) resto = 0;
        if (resto !== parseInt(cpf.substring(10, 11))) return false;
        
        return true;
    }
    
    // Função para validar CNPJ
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
        
        tamanho = tamanho + 1;
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
    
    // Função para validar CPF ou CNPJ
    function validarDocumento(documento) {
        const doc = documento.replace(/[^\d]+/g, '');
        
        if (doc.length === 11) {
            return validarCPF(doc);
        } else if (doc.length === 14) {
            return validarCNPJ(doc);
        }
        
        return false;
    }
    
    // Formatação do CPF/CNPJ conforme digitação
    function formatarDocumento(input) {
        let documento = input.value.replace(/\D/g, '');
        
        if (documento.length <= 11) {
            // Formatar como CPF
            if (documento.length > 9) {
                documento = documento.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
            } else if (documento.length > 6) {
                documento = documento.replace(/(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3');
            } else if (documento.length > 3) {
                documento = documento.replace(/(\d{3})(\d{0,3})/, '$1.$2');
            }
        } else {
            // Formatar como CNPJ
            if (documento.length > 12) {
                documento = documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5');
            } else if (documento.length > 8) {
                documento = documento.replace(/(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4');
            } else if (documento.length > 5) {
                documento = documento.replace(/(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3');
            } else if (documento.length > 2) {
                documento = documento.replace(/(\d{2})(\d{0,3})/, '$1.$2');
            }
        }
        
        input.value = documento;
    }
    
    // Função para verificar se um documento já existe (localStorage)
    function documentoExiste(documento) {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const docLimpo = documento.replace(/[^\d]+/g, '');
        return usuarios.some(u => u.documento && u.documento.replace(/[^\d]+/g, '') === docLimpo);
    }
    
    // Função para verificar se um email já está cadastrado (localStorage)
    function emailExiste(email) {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        return usuarios.some(u => u.email === email);
    }
    
    // Função para obter usuário por email
    function obterUsuarioPorEmail(email) {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        return usuarios.find(u => u.email.toLowerCase() === email.toLowerCase());
    }
    
    // =====================================================
    // FUNÇÕES DE AUTENTICAÇÃO COM API
    // =====================================================
    
    // Validação de login com fallback
    function validateLoginLocal(documento, password) {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const docLimpo = documento.replace(/[^\d]+/g, '');
        
        return usuarios.some(u => u.documento && u.documento.replace(/[^\d]+/g, '') === docLimpo && u.password === password);
    }
    
    // Função para validar login (API + fallback)
    async function validateLogin(documento, password) {
        if (useAPI && apiClient) {
            try {
                console.log('🔄 Tentando login via API...');
                const resultado = await apiClient.login(documento, password);
                return resultado.token ? true : false;
            } catch (error) {
                console.error('❌ Erro no login via API:', error);
                return validateLoginLocal(documento, password);
            }
        } else {
            return validateLoginLocal(documento, password);
        }
    }
    
    // Verificação de usuário existente com API
    async function verificarUsuarioExistente(documento, email) {
        if (!useAPI || !apiClient) {
            return {
                documentoExiste: documentoExiste(documento),
                emailExiste: emailExiste(email)
            };
        }

        try {
            const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
            const docLimpo = documento.replace(/[^\d]+/g, '');
            
            return {
                documentoExiste: usuarios.some(u => u.documento && u.documento.replace(/[^\d]+/g, '') === docLimpo),
                emailExiste: usuarios.some(u => u.email === email)
            };
        } catch (error) {
            return {
                documentoExiste: documentoExiste(documento),
                emailExiste: emailExiste(email)
            };
        }
    }
    
    // Cadastro com API
    async function processarCadastroComAPI(dadosUsuario) {
        if (!useAPI || !apiClient) {
            return { success: false, useLocal: true };
        }

        try {
            const resultado = await apiClient.register(dadosUsuario);
            return { success: true, data: resultado };
        } catch (error) {
            console.error('❌ Erro no cadastro via API:', error);
            return { success: false, error: error.message, useLocal: true };
        }
    }
    
    // =====================================================
    // FUNÇÕES DE LOADING
    // =====================================================
    
    function setLoadingState(button, loading = true) {
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
    
    // =====================================================
    // FUNÇÕES DE PROCESSO ATUALIZADAS
    // =====================================================
    
    // Função para processar login (ATUALIZADA COM API)
    async function processLogin(documento, password, isModal) {
        try {
            const loginValido = await validateLogin(documento, password);
            
            if (loginValido) {
                console.log('✅ Login bem-sucedido, redirecionando...');
                
                const docLimpo = documento.replace(/[^\d]+/g, '');
                sessionStorage.setItem('usuarioAtual', docLimpo);
                
                salvarUsuarioLogado(documento);
                
                if (window.location.pathname.includes('index.html')) {
                    exibirNomeUsuario();
                }
                
                if (!window.location.pathname.includes('index.html')) {
                    window.location.href = 'index.html';
                }
            } else {
                console.log('❌ Login falhou');
                if (isModal) {
                    modalErrorMessage.textContent = 'Documento ou senha incorretos';
                    modalErrorMessage.style.display = 'block';
                    document.getElementById('modal-password').value = '';
                } else {
                    errorMessage.textContent = 'Documento ou senha incorretos';
                    errorMessage.style.display = 'block';
                    document.getElementById('password').value = '';
                }
            }
        } catch (error) {
            console.error('❌ Erro no processo de login:', error);
            const mensagem = 'Erro no sistema. Tente novamente.';
            if (isModal) {
                modalErrorMessage.textContent = mensagem;
                modalErrorMessage.style.display = 'block';
            } else {
                errorMessage.textContent = mensagem;
                errorMessage.style.display = 'block';
            }
        }
    }
    
    // =====================================================
    // RECUPERAÇÃO DE SENHA COM EMAIL REAL
    // =====================================================
    
    // Processo de recuperação de senha ATUALIZADO
    async function processarRecuperacaoSenha(email) {
        const botao = formRecuperacao.querySelector('button[type="submit"]');
        
        try {
            // Verificar se email existe
            const usuario = obterUsuarioPorEmail(email);
            
            if (!usuario) {
                recuperacaoErrorMessage.textContent = 'Email não encontrado no sistema.';
                recuperacaoErrorMessage.style.display = 'block';
                return;
            }
            
            setLoadingState(botao, true);
            
            // Gerar código de recuperação
            const codigo = gerarCodigoRecuperacao();
            
            // Salvar código temporariamente
            salvarCodigoRecuperacao(email, codigo);
            
            // Enviar email real
            const resultadoEmail = await enviarEmailRecuperacao(email, codigo, usuario.nome);
            
            if (resultadoEmail.success) {
                recuperacaoErrorMessage.style.display = 'none';
                recuperacaoSuccessMessage.textContent = 'Código de recuperação enviado para seu email! Verifique sua caixa de entrada.';
                recuperacaoSuccessMessage.style.display = 'block';
                
                // Preparar modal de nova senha
                document.getElementById('nova-senha-documento').value = usuario.documento;
                
                // Adicionar campo de código ao modal de nova senha
                adicionarCampoCodigoVerificacao(email);
                
                console.log(`✅ Email de recuperação enviado para: ${email}`);
                
                // Trocar para modal de nova senha após 3 segundos
                setTimeout(() => {
                    recuperacaoModal.style.display = 'none';
                    novaSenhaModal.style.display = 'flex';
                    recuperacaoSuccessMessage.style.display = 'none';
                    formRecuperacao.reset();
                }, 3000);
                
            } else {
                recuperacaoErrorMessage.textContent = resultadoEmail.message;
                recuperacaoErrorMessage.style.display = 'block';
            }
            
        } catch (error) {
            console.error('❌ Erro na recuperação:', error);
            recuperacaoErrorMessage.textContent = 'Erro ao processar recuperação. Tente novamente.';
            recuperacaoErrorMessage.style.display = 'block';
        } finally {
            setLoadingState(botao, false);
        }
    }
    
    // Adicionar campo de código de verificação ao modal
    function adicionarCampoCodigoVerificacao(email) {
        const novaSenhaModal = document.getElementById('novaSenhaModal');
        const formNovaSenha = document.getElementById('form-nova-senha');
        
        // Verificar se já existe o campo
        let campoCodigoExistente = document.getElementById('codigo-verificacao');
        
        if (!campoCodigoExistente) {
            // Criar campo de código
            const divCodigo = document.createElement('div');
            divCodigo.className = 'form-group';
            divCodigo.innerHTML = `
                <label for="codigo-verificacao">
                    <i class="fas fa-key"></i>
                    Código de Verificação
                </label>
                <input type="text" 
                       id="codigo-verificacao" 
                       name="codigo" 
                       required 
                       maxlength="6" 
                       placeholder="Digite o código de 6 dígitos"
                       style="text-align: center; letter-spacing: 0.5em; font-weight: bold;">
                <small>Código enviado para: ${email}</small>
            `;
            
            // Inserir antes do primeiro campo de senha
            const primeiroInput = formNovaSenha.querySelector('.form-group');
            formNovaSenha.insertBefore(divCodigo, primeiroInput);
        }
        
        // Armazenar email para verificação
        novaSenhaModal.setAttribute('data-email', email);
    }
    
    // Processar nova senha com verificação de código
    async function processarNovaSenha() {
        const botao = formNovaSenha.querySelector('button[type="submit"]');
        const email = novaSenhaModal.getAttribute('data-email');
        const codigo = document.getElementById('codigo-verificacao')?.value;
        const novaSenha = document.getElementById('nova-senha').value.trim();
        const confirmarSenha = document.getElementById('confirmar-nova-senha').value.trim();
        const documento = document.getElementById('nova-senha-documento').value;
        
        // Validações
        if (codigo && codigo.length !== 6) {
            novaSenhaErrorMessage.textContent = 'O código deve ter 6 dígitos.';
            novaSenhaErrorMessage.style.display = 'block';
            return;
        }
        
        if (novaSenha !== confirmarSenha) {
            novaSenhaErrorMessage.textContent = 'As senhas não coincidem.';
            novaSenhaErrorMessage.style.display = 'block';
            return;
        }
        
        if (novaSenha.length < 6) {
            novaSenhaErrorMessage.textContent = 'A senha deve ter no mínimo 6 caracteres.';
            novaSenhaErrorMessage.style.display = 'block';
            return;
        }
        
        // Verificar código se foi fornecido
        if (codigo && email) {
            const verificacao = verificarCodigoRecuperacao(email, codigo);
            if (!verificacao.valido) {
                novaSenhaErrorMessage.textContent = `Código inválido: ${verificacao.motivo}`;
                novaSenhaErrorMessage.style.display = 'block';
                return;
            }
        }
        
        setLoadingState(botao, true);
        
        try {
            // Atualizar senha no localStorage
            const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
            const docLimpo = documento.replace(/[^\d]+/g, '');
            
            const index = usuarios.findIndex(u => {
                const usuarioDocLimpo = u.documento ? u.documento.replace(/[^\d]+/g, '') : null;
                return usuarioDocLimpo === docLimpo;
            });
            
            if (index !== -1) {
                usuarios[index].password = novaSenha;
                localStorage.setItem('usuarios', JSON.stringify(usuarios));
                
                novaSenhaErrorMessage.style.display = 'none';
                novaSenhaSuccessMessage.textContent = 'Senha alterada com sucesso! Você já pode fazer login.';
                novaSenhaSuccessMessage.style.display = 'block';
                
                console.log('✅ Senha alterada com sucesso');
                
                // Limpar campo de código se existir
                const campoCodigoDiv = document.getElementById('codigo-verificacao')?.closest('.form-group');
                if (campoCodigoDiv) {
                    campoCodigoDiv.remove();
                }
                
                setTimeout(() => {
                    novaSenhaModal.style.display = 'none';
                    loginModal.style.display = 'flex';
                    novaSenhaSuccessMessage.style.display = 'none';
                    formNovaSenha.reset();
                }, 2000);
                
            } else {
                novaSenhaErrorMessage.textContent = 'Usuário não encontrado.';
                novaSenhaErrorMessage.style.display = 'block';
            }
            
        } catch (error) {
            console.error('❌ Erro ao alterar senha:', error);
            novaSenhaErrorMessage.textContent = 'Erro ao salvar nova senha. Tente novamente.';
            novaSenhaErrorMessage.style.display = 'block';
        } finally {
            setLoadingState(botao, false);
        }
    }
    
    // =====================================================
    // INICIALIZAÇÃO DOS MODAIS E UI
    // =====================================================
    
    // Esconder modais ao carregar a página
    if (loginModal) {
        loginModal.style.display = 'none';
        console.log("✅ Modal de login ocultado");
    } else {
        console.warn("⚠️ Modal de login não encontrado");
    }

    if (cadastroModal) {
        cadastroModal.style.display = 'none';
        console.log("✅ Modal de cadastro ocultado");
    } else {
        console.warn("⚠️ Modal de cadastro não encontrado");
    }
    
    if (recuperacaoModal) recuperacaoModal.style.display = 'none';
    if (novaSenhaModal) novaSenhaModal.style.display = 'none';
    
    // Esconder mensagens de erro/sucesso inicialmente
    if (errorMessage) errorMessage.style.display = 'none';
    if (modalErrorMessage) modalErrorMessage.style.display = 'none';
    if (cadastroErrorMessage) cadastroErrorMessage.style.display = 'none';
    if (cadastroSuccessMessage) cadastroSuccessMessage.style.display = 'none';
    if (recuperacaoErrorMessage) recuperacaoErrorMessage.style.display = 'none';
    if (recuperacaoSuccessMessage) recuperacaoSuccessMessage.style.display = 'none';
    if (novaSenhaErrorMessage) novaSenhaErrorMessage.style.display = 'none';
    if (novaSenhaSuccessMessage) novaSenhaSuccessMessage.style.display = 'none';
    
    // =====================================================
    // EVENT LISTENERS
    // =====================================================
    
    // Login no formulário principal
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const documento = document.getElementById('documento').value.trim();
            const password = document.getElementById('password').value.trim();
            processLogin(documento, password, false);
        });
    }
    
    // Login no modal
    if (modalLoginForm) {
        modalLoginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const documento = document.getElementById('modal-documento').value.trim();
            const password = document.getElementById('modal-password').value.trim();
            processLogin(documento, password, true);
        });
    }
    
    // Formatação automática do documento no login
    const documentoInputs = [
        document.getElementById('documento'),
        document.getElementById('modal-documento')
    ];
    
    documentoInputs.forEach(input => {
        if (input) {
            input.addEventListener('input', function() {
                formatarDocumento(this);
            });
        }
    });
    
    // Formatação automática do documento no cadastro
    const cadastroDocumentoInput = document.getElementById('cadastro-documento');
    if (cadastroDocumentoInput) {
        cadastroDocumentoInput.addEventListener('input', function() {
            formatarDocumento(this);
        });
    }
    
    // Cadastrar novo usuário (ATUALIZADO COM API)
    if (formCadastro) {
        console.log("✅ Formulário de cadastro encontrado, adicionando event listener");
        
        formCadastro.addEventListener('submit', async function(e) {
            e.preventDefault();
            console.log("📝 Formulário de cadastro enviado");
            
            const nome = document.getElementById('cadastro-nome').value.trim();
            const email = document.getElementById('cadastro-email').value.trim();
            const documento = document.getElementById('cadastro-documento').value.trim();
            const password = document.getElementById('cadastro-password').value.trim();
            const confirmPassword = document.getElementById('cadastro-confirm-password').value.trim();
            const botao = formCadastro.querySelector('button[type="submit"]');
            
            console.log("📋 Dados capturados:", { nome, email, documento });
            
            cadastroErrorMessage.style.display = 'none';
            cadastroSuccessMessage.style.display = 'none';
            
            // Validações
            if (password !== confirmPassword) {
                console.log("❌ Erro: Senhas não coincidem");
                cadastroErrorMessage.textContent = 'As senhas não coincidem';
                cadastroErrorMessage.style.display = 'block';
                return;
            }
            
            if (password.length < 6) {
                console.log("❌ Erro: Senha muito curta");
                cadastroErrorMessage.textContent = 'A senha deve ter pelo menos 6 caracteres';
                cadastroErrorMessage.style.display = 'block';
                return;
            }
            
            if (!validarDocumento(documento)) {
                console.log("❌ Erro: Documento inválido");
                cadastroErrorMessage.textContent = 'CPF/CNPJ inválido';
                cadastroErrorMessage.style.display = 'block';
                return;
            }
            
            // Verificar se usuário já existe
            const verificacao = await verificarUsuarioExistente(documento, email);
            
            if (verificacao.documentoExiste) {
                console.log("❌ Erro: Documento já cadastrado");
                cadastroErrorMessage.textContent = 'CPF/CNPJ já cadastrado';
                cadastroErrorMessage.style.display = 'block';
                return;
            }
            
            if (verificacao.emailExiste) {
                console.log("❌ Erro: Email já cadastrado");
                cadastroErrorMessage.textContent = 'E-mail já cadastrado';
                cadastroErrorMessage.style.display = 'block';
                return;
            }
            
            setLoadingState(botao, true);
            
            try {
                // Tentar cadastro via API primeiro
                const dadosUsuario = { nome, email, documento, senha: password };
                const resultadoAPI = await processarCadastroComAPI(dadosUsuario);
                
                if (resultadoAPI.success) {
                    console.log("✅ Usuário cadastrado via API:", resultadoAPI.data);
                    
                    cadastroSuccessMessage.textContent = 'Cadastro realizado com sucesso! Você já pode fazer login.';
                    cadastroSuccessMessage.style.display = 'block';
                    
                    formCadastro.reset();
                    
                    setTimeout(function() {
                        cadastroModal.style.display = 'none';
                        if (window.innerWidth <= 768) {
                            loginModal.style.display = 'flex';
                        }
                        cadastroSuccessMessage.style.display = 'none';
                    }, 3000);
                    
                } else if (resultadoAPI.useLocal) {
                    // Fallback para localStorage
                    console.log("💾 Cadastrando no localStorage (fallback)");
                    const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
                    
                    const novoUsuario = {
                        nome,
                        email,
                        documento,
                        password,
                        dataCadastro: new Date().toISOString()
                    };
                    
                    usuarios.push(novoUsuario);
                    localStorage.setItem('usuarios', JSON.stringify(usuarios));
                    
                    console.log("✅ Usuário cadastrado localmente:", novoUsuario);
                    
                    cadastroSuccessMessage.textContent = 'Cadastro realizado com sucesso! Você já pode fazer login.';
                    cadastroSuccessMessage.style.display = 'block';
                    
                    formCadastro.reset();
                    
                    setTimeout(function() {
                        cadastroModal.style.display = 'none';
                        if (window.innerWidth <= 768) {
                            loginModal.style.display = 'flex';
                        }
                        cadastroSuccessMessage.style.display = 'none';
                    }, 3000);
                    
                } else {
                    cadastroErrorMessage.textContent = resultadoAPI.error || 'Erro ao criar conta. Tente novamente.';
                    cadastroErrorMessage.style.display = 'block';
                }
                
            } catch (error) {
                console.error("❌ Erro ao cadastrar usuário:", error);
                cadastroErrorMessage.textContent = 'Erro interno. Tente novamente.';
                cadastroErrorMessage.style.display = 'block';
            } finally {
                setLoadingState(botao, false);
            }
        });
    } else {
        console.warn("⚠️ Formulário de cadastro não encontrado");
    }
    
    // Processar recuperação de senha ATUALIZADO
    if (formRecuperacao) {
        formRecuperacao.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const email = document.getElementById('recuperacao-email').value.trim();
            
            // Limpar mensagens anteriores
            recuperacaoErrorMessage.style.display = 'none';
            recuperacaoSuccessMessage.style.display = 'none';
            
            if (!email) {
                recuperacaoErrorMessage.textContent = 'Por favor, informe o email.';
                recuperacaoErrorMessage.style.display = 'block';
                return;
            }
            
            processarRecuperacaoSenha(email);
        });
    }
    
    // Processar definição de nova senha ATUALIZADO
    if (formNovaSenha) {
        formNovaSenha.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Limpar mensagens anteriores
            novaSenhaErrorMessage.style.display = 'none';
            novaSenhaSuccessMessage.style.display = 'none';
            
            processarNovaSenha();
        });
    }
    
    // =====================================================
    // NAVEGAÇÃO ENTRE MODAIS
    // =====================================================
    
    // Abrir modal de login
    if (openLoginModalBtn) {
        openLoginModalBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log("🔑 Abrindo modal de login");
            loginModal.style.display = 'flex';
        });
    } else {
        console.warn("⚠️ Botão de login não encontrado");
    }
    
    if (mobileLoginBtn) {
        mobileLoginBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log("📱 Abrindo modal de login (mobile)");
            loginModal.style.display = 'flex';
        });
    }
    
    // Navegação: Login para Cadastro
    if (modalAbrirCadastroBtn) {
        modalAbrirCadastroBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log("📝 Navegando de login para cadastro");
            loginModal.style.display = 'none';
            cadastroModal.style.display = 'flex';
        });
    }
    
    // Navegação: Cadastro para Login
    if (cadastroAbrirLoginBtn) {
        cadastroAbrirLoginBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log("🔑 Navegando de cadastro para login");
            cadastroModal.style.display = 'none';
            loginModal.style.display = 'flex';
        });
    }
    
    // Navegação: Login para Recuperação
    if (esqueceuSenhaBtn) {
        esqueceuSenhaBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log("🔐 Navegando para recuperação de senha");
            loginModal.style.display = 'none';
            recuperacaoModal.style.display = 'flex';
        });
    }
    
    // Navegação: Recuperação para Login
    if (recuperacaoAbrirLoginBtn) {
        recuperacaoAbrirLoginBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log("🔑 Navegando de recuperação para login");
            recuperacaoModal.style.display = 'none';
            loginModal.style.display = 'flex';
        });
    }
    
    // =====================================================
    // FECHAR MODAIS
    // =====================================================
    
    if (loginCloseBtn) {
        loginCloseBtn.addEventListener('click', function() {
            console.log("❌ Fechando modal de login");
            loginModal.style.display = 'none';
            if (modalLoginForm) modalLoginForm.reset();
            if (modalErrorMessage) modalErrorMessage.style.display = 'none';
        });
    }
    
    if (cadastroCloseBtn) {
        cadastroCloseBtn.addEventListener('click', function() {
            console.log("❌ Fechando modal de cadastro");
            cadastroModal.style.display = 'none';
            if (formCadastro) formCadastro.reset();
            if (cadastroErrorMessage) cadastroErrorMessage.style.display = 'none';
            if (cadastroSuccessMessage) cadastroSuccessMessage.style.display = 'none';
        });
    }
    
    if (recuperacaoCloseBtn) {
        recuperacaoCloseBtn.addEventListener('click', function() {
            console.log("❌ Fechando modal de recuperação");
            recuperacaoModal.style.display = 'none';
            if (formRecuperacao) formRecuperacao.reset();
            if (recuperacaoErrorMessage) recuperacaoErrorMessage.style.display = 'none';
            if (recuperacaoSuccessMessage) recuperacaoSuccessMessage.style.display = 'none';
        });
    }
    
    if (novaSenhaCloseBtn) {
        novaSenhaCloseBtn.addEventListener('click', function() {
            console.log("❌ Fechando modal de nova senha");
            novaSenhaModal.style.display = 'none';
            if (formNovaSenha) formNovaSenha.reset();
            if (novaSenhaErrorMessage) novaSenhaErrorMessage.style.display = 'none';
            if (novaSenhaSuccessMessage) novaSenhaSuccessMessage.style.display = 'none';
            
            // Remover campo de código se existir
            const campoCodigoDiv = document.getElementById('codigo-verificacao')?.closest('.form-group');
            if (campoCodigoDiv) {
                campoCodigoDiv.remove();
            }
        });
    }
    
    // Fechar modais ao clicar fora
    window.addEventListener('click', function(event) {
        if (event.target === loginModal) {
            console.log("❌ Fechando modal de login (clique fora)");
            loginModal.style.display = 'none';
            if (modalLoginForm) modalLoginForm.reset();
            if (modalErrorMessage) modalErrorMessage.style.display = 'none';
        }
        
        if (event.target === cadastroModal) {
            console.log("❌ Fechando modal de cadastro (clique fora)");
            cadastroModal.style.display = 'none';
            if (formCadastro) formCadastro.reset();
            if (cadastroErrorMessage) cadastroErrorMessage.style.display = 'none';
            if (cadastroSuccessMessage) cadastroSuccessMessage.style.display = 'none';
        }
        
        if (event.target === recuperacaoModal) {
            console.log("❌ Fechando modal de recuperação (clique fora)");
            recuperacaoModal.style.display = 'none';
            if (formRecuperacao) formRecuperacao.reset();
            if (recuperacaoErrorMessage) recuperacaoErrorMessage.style.display = 'none';
            if (recuperacaoSuccessMessage) recuperacaoSuccessMessage.style.display = 'none';
        }
        
        if (event.target === novaSenhaModal) {
            console.log("❌ Fechando modal de nova senha (clique fora)");
            novaSenhaModal.style.display = 'none';
            if (formNovaSenha) formNovaSenha.reset();
            if (novaSenhaErrorMessage) novaSenhaErrorMessage.style.display = 'none';
            if (novaSenhaSuccessMessage) novaSenhaSuccessMessage.style.display = 'none';
            
            // Remover campo de código se existir
            const campoCodigoDiv = document.getElementById('codigo-verificacao')?.closest('.form-group');
            if (campoCodigoDiv) {
                campoCodigoDiv.remove();
            }
        }
    });
    
    // =====================================================
    // ESCONDER MENSAGENS AO DIGITAR
    // =====================================================
    
    const inputsLogin = [
        document.getElementById('documento'),
        document.getElementById('password'),
        document.getElementById('modal-documento'),
        document.getElementById('modal-password')
    ];
    
    inputsLogin.forEach(input => {
        if (input) {
            input.addEventListener('input', function() {
                if (input.id.includes('modal')) {
                    if (modalErrorMessage) modalErrorMessage.style.display = 'none';
                } else {
                    if (errorMessage) errorMessage.style.display = 'none';
                }
            });
        }
    });
    
    const inputsCadastro = [
        document.getElementById('cadastro-nome'),
        document.getElementById('cadastro-email'),
        document.getElementById('cadastro-documento'),
        document.getElementById('cadastro-password'),
        document.getElementById('cadastro-confirm-password')
    ];
    
    inputsCadastro.forEach(input => {
        if (input) {
            input.addEventListener('input', function() {
                if (cadastroErrorMessage) cadastroErrorMessage.style.display = 'none';
            });
        }
    });
    
    const inputsRecuperacao = [document.getElementById('recuperacao-email')];
    inputsRecuperacao.forEach(input => {
        if (input) {
            input.addEventListener('input', function() {
                if (recuperacaoErrorMessage) recuperacaoErrorMessage.style.display = 'none';
            });
        }
    });
    
    const inputsNovaSenha = [
        document.getElementById('nova-senha'),
        document.getElementById('confirmar-nova-senha')
    ];
    inputsNovaSenha.forEach(input => {
        if (input) {
            input.addEventListener('input', function() {
                if (novaSenhaErrorMessage) novaSenhaErrorMessage.style.display = 'none';
            });
        }
    });
    
    // =====================================================
    // FUNÇÕES DE USUÁRIO LOGADO ATUALIZADAS
    // =====================================================
    
    // Função para salvar dados do usuário logado (ATUALIZADA COM API)
    function salvarUsuarioLogado(documento) {
        if (useAPI && apiClient && apiClient.usuarioAtual) {
            sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(apiClient.usuarioAtual));
            console.log("✅ Dados do usuário da API salvos:", apiClient.usuarioAtual.nome);
            return;
        }

        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const docLimpo = documento.replace(/[^\d]+/g, '');
        
        const usuario = usuarios.find(u => u.documento && u.documento.replace(/[^\d]+/g, '') === docLimpo);
        
        if (usuario) {
            sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(usuario));
            console.log("✅ Dados do usuário local salvos:", usuario.nome);
        }
    }
    
    // Função para obter dados do usuário logado
    function obterUsuarioLogado() {
        const dadosLogado = sessionStorage.getItem('dadosUsuarioLogado');
        if (dadosLogado) {
            return JSON.parse(dadosLogado);
        }
        
        const documentoLogado = sessionStorage.getItem('usuarioAtual');
        if (documentoLogado) {
            const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
            const usuario = usuarios.find(u => u.documento && u.documento.replace(/[^\d]+/g, '') === documentoLogado);
            if (usuario) {
                sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(usuario));
                return usuario;
            }
        }
        
        return null;
    }
    
    // Função para exibir o nome do usuário no header
    function exibirNomeUsuario() {
        const usuarioLogado = obterUsuarioLogado();
        const nomeUsuarioElement = document.getElementById('nome-usuario');
        
        if (usuarioLogado && nomeUsuarioElement) {
            const primeiroNome = usuarioLogado.nome.split(' ')[0];
            nomeUsuarioElement.innerHTML = `<i class="fas fa-user-circle"></i> Olá ${primeiroNome}. Seu assistente financeiro pessoal está pronto!`;
            nomeUsuarioElement.style.display = 'block';
            console.log('✅ Nome do usuário exibido:', primeiroNome);
        } else if (nomeUsuarioElement) {
            nomeUsuarioElement.style.display = 'none';
        }
    }
    
    // Função para verificar se usuário está logado (ATUALIZADA COM API)
    function verificarUsuarioLogado() {
        if (useAPI && apiClient && apiClient.token) {
            apiClient.verificarToken()
                .then(usuario => {
                    sessionStorage.setItem('usuarioAtual', usuario.documento.replace(/[^\d]+/g, ''));
                    sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(usuario));
                    exibirNomeUsuario();
                    return true;
                })
                .catch(() => {
                    if (window.location.pathname.includes('index.html')) {
                        console.log("❌ Token inválido, redirecionando para login");
                        window.location.href = 'login.html';
                    }
                    return false;
                });
            return;
        }

        const documentoLogado = sessionStorage.getItem('usuarioAtual');
        
        if (documentoLogado) {
            salvarUsuarioLogado(documentoLogado);
            exibirNomeUsuario();
            return true;
        } else {
            if (window.location.pathname.includes('index.html')) {
                console.log("❌ Usuário não logado, redirecionando para login");
                window.location.href = 'login.html';
            }
            return false;
        }
    }
    
    // Função para logout (ATUALIZADA COM API)
    function realizarLogout() {
        if (useAPI && apiClient) {
            apiClient.logout();
        }
        
        sessionStorage.removeItem('usuarioAtual');
        sessionStorage.removeItem('dadosUsuarioLogado');
        
        const nomeUsuarioElement = document.getElementById('nome-usuario');
        if (nomeUsuarioElement) {
            nomeUsuarioElement.style.display = 'none';
        }
        
        console.log('✅ Logout realizado');
        window.location.href = 'login.html';
    }
    
    // =====================================================
    // INICIALIZAÇÃO FINAL
    // =====================================================
    
    // Verificar se usuário está logado ao carregar a página
    verificarUsuarioLogado();
    
    // Event listener para logout (se o botão existir)
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            realizarLogout();
        });
    }
    
    // Event listener para botão de refresh
    const btnRefresh = document.getElementById('btn-refresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', function() {
            exibirNomeUsuario();
        });
    }
    
    // =====================================================
    // FUNÇÕES DE DIAGNÓSTICO E DEBUG
    // =====================================================
    
    function diagnosticLocalStorage() {
        try {
            const testValue = 'test_' + Date.now();
            localStorage.setItem('__test', testValue);
            
            const retrievedValue = localStorage.getItem('__test');
            const writeSuccess = retrievedValue === testValue;
            
            localStorage.removeItem('__test');
            
            console.log('📊 Diagnóstico localStorage - funcionando:', writeSuccess);
            
            const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
            console.log('👥 Total de usuários cadastrados:', usuarios.length);
            
            return {
                success: writeSuccess,
                message: writeSuccess ? 'LocalStorage funcionando' : 'Erro no LocalStorage'
            };
        } catch (error) {
            console.error('❌ Diagnóstico localStorage - erro:', error);
            return {
                success: false,
                message: 'Erro no LocalStorage: ' + error.message
            };
        }
    }
    
    // Executar diagnóstico
    const storageStatus = diagnosticLocalStorage();
    if (!storageStatus.success) {
        alert('⚠️ Aviso: ' + storageStatus.message + '. O sistema pode não funcionar corretamente.');
    }
    
    // Debug: verificar configuração do EmailJS
    function verificarConfiguracaoEmail() {
        if (!EMAIL_CONFIG.serviceId || EMAIL_CONFIG.serviceId === 'service_financas') {
            console.warn('⚠️ AVISO: Configure o serviceId do EmailJS');
        }
        if (!EMAIL_CONFIG.templateId || EMAIL_CONFIG.templateId === 'template_recuperacao') {
            console.warn('⚠️ AVISO: Configure o templateId do EmailJS');
        }
        if (!EMAIL_CONFIG.userId || EMAIL_CONFIG.userId === 'sua_chave_publica') {
            console.warn('⚠️ AVISO: Configure o userId (Public Key) do EmailJS');
        }
        
        console.log('📧 Status EmailJS:', EMAIL_CONFIG);
    }
    
    verificarConfiguracaoEmail();
    
    // Log de inicialização
    console.log('🚀 =====================================================');
    console.log('🌟 Sistema de Controle Financeiro inicializado!');
    console.log('🔗 API integrada:', useAPI ? 'SIM' : 'NÃO');
    console.log('📧 Email real configurado via EmailJS');
    console.log('💾 Dados salvos no localStorage (fallback)');
    console.log('🔐 Sistema de recuperação de senha ativo');
    console.log('🚀 =====================================================');
});

// =====================================================
// FUNÇÕES GLOBAIS PARA COMPATIBILIDADE
// =====================================================

// Função global para mostrar/ocultar senha
function togglePassword(inputId, button) {
    const input = document.getElementById(inputId);
    const icon = button.querySelector('i');
    
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

// Função global para abrir modal
function abrirModal(modalName) {
    const modals = {
        login: document.getElementById('loginModal'),
        cadastro: document.getElementById('cadastroModal'),
        recuperacao: document.getElementById('recuperacaoSenhaModal'),
        novaSenha: document.getElementById('novaSenhaModal')
    };
    
    // Fechar todos os modais
    Object.values(modals).forEach(modal => {
        if (modal) modal.style.display = 'none';
    });
    
    // Abrir modal solicitado
    if (modals[modalName]) {
        modals[modalName].style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

// Verificar compatibilidade com navegador
if (typeof Storage === "undefined") {
    console.error("❌ LocalStorage não suportado neste navegador");
    alert("Seu navegador não suporta armazenamento local. Algumas funcionalidades podem não funcionar.");
}