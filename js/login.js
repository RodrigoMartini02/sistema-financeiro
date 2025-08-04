document.addEventListener('DOMContentLoaded', function() {
    // =====================================================
    // SISTEMA DE ESPERA PARA API CLIENT
    // =====================================================
    
    let apiClient = null;
    let useAPI = false;
    let sistemaInicializado = false;
    
    // Função para aguardar API Client estar disponível
    function aguardarAPIClient() {
        return new Promise((resolve) => {
            let tentativas = 0;
            const maxTentativas = 20; // 4 segundos
            
            function verificarAPI() {
                tentativas++;
                
                if (window.apiClient && typeof window.apiClient.login === 'function') {
                    apiClient = window.apiClient;
                    useAPI = true;
                    console.log('✅ API Client encontrado e inicializado para login.js');
                    resolve(true);
                } else if (tentativas >= maxTentativas) {
                    console.warn('⚠️ API Client não encontrado após', maxTentativas, 'tentativas. Usando localStorage como fallback.');
                    useAPI = false;
                    resolve(false);
                } else {
                    console.log(`⏳ Aguardando API Client... tentativa ${tentativas}/${maxTentativas}`);
                    setTimeout(verificarAPI, 200);
                }
            }
            
            verificarAPI();
        });
    }
    
    // =====================================================
    // INICIALIZAÇÃO DO SISTEMA
    // =====================================================
    
    async function inicializarSistema() {
        console.log('🚀 Inicializando sistema de login...');
        
        // Aguardar API Client
        await aguardarAPIClient();
        
        // Continuar com inicialização
        await inicializarLogin();
        
        sistemaInicializado = true;
        console.log('✅ Sistema de login inicializado completamente');
    }
    
    async function inicializarLogin() {
        // =====================================================
        // CONFIGURAÇÃO EMAIL
        // =====================================================
        
        const EMAIL_CONFIG = {
            serviceId: 'service_financas',
            templateId: 'template_recuperacao',
            userId: 'oW3fgPbnchMKc42Yf'
        };

        function carregarEmailJS() {
            return new Promise((resolve, reject) => {
                if (window.emailjs) {
                    resolve();
                    return;
                }
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js';
                script.onload = () => {
                    try {
                        emailjs.init(EMAIL_CONFIG.userId);
                        console.log('✅ EmailJS carregado com sucesso');
                        resolve();
                    } catch (e) {
                        console.error('❌ Falha ao inicializar EmailJS:', e);
                        reject(e);
                    }
                };
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        // Carregar EmailJS
        try {
            await carregarEmailJS();
        } catch (error) {
            console.error('❌ Erro ao carregar EmailJS:', error);
        }

        // =====================================================
        // TESTE DE LOCALSTORAGE
        // =====================================================
        
        try {
            const testKey = '__test_storage__';
            localStorage.setItem(testKey, testKey);
            localStorage.removeItem(testKey);
            console.log('✅ LocalStorage funcionando');
        } catch (e) {
            console.error("❌ ERRO: LocalStorage não está funcionando!", e);
            alert("Seu navegador tem o armazenamento local desativado. Por favor, ative-o nas configurações do navegador para usar o sistema.");
        }

        // =====================================================
        // ELEMENTOS DO DOM
        // =====================================================
        
        const loginModal = document.getElementById('loginModal');
        const loginForm = document.getElementById('login-form');
        const modalLoginForm = document.getElementById('modal-login-form');
        const errorMessage = document.getElementById('error-message');
        const modalErrorMessage = document.getElementById('modal-error-message');
        const openLoginModalBtn = document.getElementById('openLoginModalBtn');
        const mobileLoginBtn = document.getElementById('mobile-login-btn');
        const loginCloseBtn = document.querySelector('.login-close');
        const cadastroModal = document.getElementById('cadastroModal');
        const formCadastro = document.getElementById('form-cadastro');
        const cadastroErrorMessage = document.getElementById('cadastro-error-message');
        const cadastroSuccessMessage = document.getElementById('cadastro-success-message');
        const cadastroCloseBtn = document.querySelector('.cadastro-close');
        const recuperacaoModal = document.getElementById('recuperacaoSenhaModal');
        const formRecuperacao = document.getElementById('form-recuperacao-senha');
        const recuperacaoErrorMessage = document.getElementById('recuperacao-error-message');
        const recuperacaoSuccessMessage = document.getElementById('recuperacao-success-message');
        const recuperacaoCloseBtn = document.querySelector('.recuperacao-close');
        const novaSenhaModal = document.getElementById('novaSenhaModal');
        const formNovaSenha = document.getElementById('form-nova-senha');
        const novaSenhaErrorMessage = document.getElementById('nova-senha-error-message');
        const novaSenhaSuccessMessage = document.getElementById('nova-senha-success-message');
        const novaSenhaCloseBtn = document.querySelector('.nova-senha-close');
        const modalAbrirCadastroBtn = document.getElementById('modal-abrir-cadastro');
        const cadastroAbrirLoginBtn = document.getElementById('cadastro-abrir-login');
        const esqueceuSenhaBtn = document.getElementById('modal-esqueceu-senha');
        const recuperacaoAbrirLoginBtn = document.getElementById('recuperacao-abrir-login');

        // =====================================================
        // FUNÇÕES DE RECUPERAÇÃO DE SENHA
        // =====================================================
        
        function gerarCodigoRecuperacao() {
            return Math.floor(100000 + Math.random() * 900000).toString();
        }

        function salvarCodigoRecuperacao(email, codigo) {
            const codigosRecuperacao = JSON.parse(localStorage.getItem('codigosRecuperacao')) || {};
            codigosRecuperacao[email] = {
                codigo: codigo,
                expiracao: Date.now() + (15 * 60 * 1000),
                tentativas: 0
            };
            localStorage.setItem('codigosRecuperacao', JSON.stringify(codigosRecuperacao));
        }

        function verificarCodigoRecuperacao(email, codigoInformado) {
            const codigosRecuperacao = JSON.parse(localStorage.getItem('codigosRecuperacao')) || {};
            const dadosCodigo = codigosRecuperacao[email];
            if (!dadosCodigo) return { valido: false, motivo: 'Código não encontrado' };
            if (Date.now() > dadosCodigo.expiracao) {
                delete codigosRecuperacao[email];
                localStorage.setItem('codigosRecuperacao', JSON.stringify(codigosRecuperacao));
                return { valido: false, motivo: 'Código expirado' };
            }
            if (dadosCodigo.tentativas >= 3) return { valido: false, motivo: 'Muitas tentativas' };
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
                if (!window.emailjs) throw new Error('EmailJS não está carregado');
                const templateParams = {
                    to_email: email,
                    to_name: nomeUsuario,
                    codigo_recuperacao: codigo,
                    validade: '15 minutos',
                    sistema_nome: 'Sistema de Controle Financeiro',
                    from_name: 'Sistema Financeiro'
                };
                const response = await emailjs.send(EMAIL_CONFIG.serviceId, EMAIL_CONFIG.templateId, templateParams);
                return { success: true, message: 'Email de recuperação enviado com sucesso!', messageId: response.text };
            } catch (error) {
                console.error('❌ Erro ao enviar email:', error);
                return { success: false, message: 'Erro ao enviar email: ' + error.message };
            }
        }

        // =====================================================
        // FUNÇÕES DE VALIDAÇÃO
        // =====================================================
        
        if (!localStorage.getItem('usuarios')) {
            localStorage.setItem('usuarios', JSON.stringify([]));
        }

        function validarCPF(cpf) {
            cpf = cpf.replace(/[^\d]+/g, '');
            if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
            let soma = 0, resto;
            for (let i = 1; i <= 9; i++) soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
            resto = (soma * 10) % 11;
            if ((resto === 10) || (resto === 11)) resto = 0;
            if (resto !== parseInt(cpf.substring(9, 10))) return false;
            soma = 0;
            for (let i = 1; i <= 10; i++) soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
            resto = (soma * 10) % 11;
            if ((resto === 10) || (resto === 11)) resto = 0;
            if (resto !== parseInt(cpf.substring(10, 11))) return false;
            return true;
        }

        function validarCNPJ(cnpj) {
            cnpj = cnpj.replace(/[^\d]+/g, '');
            if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
            let tamanho = cnpj.length - 2, numeros = cnpj.substring(0, tamanho), digitos = cnpj.substring(tamanho), soma = 0, pos = tamanho - 7;
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

        function obterUsuarioPorEmail(email) {
            const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
            return usuarios.find(u => u.email.toLowerCase() === email.toLowerCase());
        }

        // =====================================================
        // FUNÇÕES DE AUTENTICAÇÃO HÍBRIDA (API + LOCAL)
        // =====================================================
        
        async function validateLogin(documento, password) {
            console.log('🔐 Validando login...', useAPI ? 'via API' : 'via localStorage');
            
            if (useAPI && apiClient) {
                try {
                    console.log('🌐 Tentando login via API...');
                    const resultado = await apiClient.login(documento, password);
                    console.log('✅ Login API bem-sucedido');
                    return !!resultado.token;
                } catch (error) {
                    console.error('❌ Erro no login via API:', error.message);
                    console.log('🔄 Tentando fallback para localStorage...');
                    // Fallback para localStorage
                }
            }
            
            // Validação via localStorage (fallback ou modo principal)
            console.log('💾 Validando via localStorage...');
            const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
            const docLimpo = documento.replace(/[^\d]+/g, '');
            const usuarioValido = usuarios.some(u => 
                u.documento && 
                u.documento.replace(/[^\d]+/g, '') === docLimpo && 
                u.password === password
            );
            
            console.log(usuarioValido ? '✅ Login localStorage válido' : '❌ Login localStorage inválido');
            return usuarioValido;
        }

        // =====================================================
        // FUNÇÕES DE INTERFACE
        // =====================================================
        
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

        // =====================================================
        // PROCESSO DE LOGIN
        // =====================================================
        
        async function processLogin(documento, password, isModal) {
            console.log('🚀 Iniciando processo de login...');
            
            const errorElement = isModal ? modalErrorMessage : errorMessage;
            const passwordElement = isModal ? document.getElementById('modal-password') : document.getElementById('password');

            // Limpar mensagens de erro
            if (errorElement) errorElement.style.display = 'none';

            try {
                const loginValido = await validateLogin(documento, password);
                
                if (loginValido) {
                    console.log('✅ Login bem-sucedido, preparando redirecionamento...');
                    
                    const docLimpo = documento.replace(/[^\d]+/g, '');
                    sessionStorage.setItem('usuarioAtual', docLimpo);
                    
                    // Salvar dados do usuário se API está ativa
                    if (useAPI && apiClient && apiClient.usuarioAtual) {
                        sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(apiClient.usuarioAtual));
                        console.log('💾 Dados do usuário da API salvos');
                    } else {
                        // Buscar dados do localStorage
                        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
                        const usuario = usuarios.find(u => u.documento && u.documento.replace(/[^\d]+/g, '') === docLimpo);
                        if (usuario) {
                            sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(usuario));
                            console.log('💾 Dados do usuário do localStorage salvos');
                        }
                    }
                    
                    console.log('🔄 Redirecionando para index.html...');
                    window.location.href = 'index.html';
                    
                } else {
                    console.log('❌ Login inválido');
                    if (errorElement) {
                        errorElement.textContent = 'Documento ou senha incorretos';
                        errorElement.style.display = 'block';
                    }
                    if (passwordElement) passwordElement.value = '';
                }
            } catch (error) {
                console.error('❌ Erro durante o processo de login:', error);
                if (errorElement) {
                    errorElement.textContent = 'Erro no sistema. Tente novamente.';
                    errorElement.style.display = 'block';
                }
            }
        }

        // =====================================================
        // PROCESSO DE CADASTRO
        // =====================================================
        
        async function processarCadastro(nome, email, documento, password) {
            console.log('📝 Iniciando processo de cadastro...');
            
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
                    // Continuar para fallback
                }
            }
            
            // Fallback para localStorage
            console.log('💾 Cadastrando via localStorage...');
            const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
            
            // Verificar se já existe
            const docLimpo = documento.replace(/[^\d]+/g, '');
            const jaExiste = usuarios.some(u => 
                u.email === email || 
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
                dataCadastro: new Date().toISOString()
            };
            
            usuarios.push(novoUsuario);
            localStorage.setItem('usuarios', JSON.stringify(usuarios));
            
            console.log('✅ Cadastro localStorage bem-sucedido');
            return { success: true, data: novoUsuario };
        }

        // =====================================================
        // RECUPERAÇÃO DE SENHA
        // =====================================================
        
        async function processarRecuperacaoSenha(email) {
            const botao = formRecuperacao.querySelector('button[type="submit"]');
            
            if (recuperacaoErrorMessage) recuperacaoErrorMessage.style.display = 'none';
            if (recuperacaoSuccessMessage) recuperacaoSuccessMessage.style.display = 'none';

            const usuario = obterUsuarioPorEmail(email);
            if (!usuario) {
                if (recuperacaoErrorMessage) {
                    recuperacaoErrorMessage.textContent = 'Email não encontrado no sistema.';
                    recuperacaoErrorMessage.style.display = 'block';
                }
                return;
            }

            setLoadingState(botao, true);
            
            try {
                const codigo = gerarCodigoRecuperacao();
                salvarCodigoRecuperacao(email, codigo);
                const resultadoEmail = await enviarEmailRecuperacao(email, codigo, usuario.nome);

                if (resultadoEmail.success) {
                    if (recuperacaoSuccessMessage) {
                        recuperacaoSuccessMessage.textContent = 'Código enviado para seu email! Verifique sua caixa de entrada.';
                        recuperacaoSuccessMessage.style.display = 'block';
                    }
                    
                    const docInput = document.getElementById('nova-senha-documento');
                    if (docInput) docInput.value = usuario.documento;
                    
                    adicionarCampoCodigoVerificacao(email);

                    setTimeout(() => {
                        if (recuperacaoModal) recuperacaoModal.style.display = 'none';
                        if (novaSenhaModal) novaSenhaModal.style.display = 'flex';
                        if (recuperacaoSuccessMessage) recuperacaoSuccessMessage.style.display = 'none';
                        if (formRecuperacao) formRecuperacao.reset();
                    }, 3000);
                } else {
                    if (recuperacaoErrorMessage) {
                        recuperacaoErrorMessage.textContent = resultadoEmail.message;
                        recuperacaoErrorMessage.style.display = 'block';
                    }
                }
            } catch (error) {
                console.error('❌ Erro na recuperação:', error);
                if (recuperacaoErrorMessage) {
                    recuperacaoErrorMessage.textContent = 'Erro ao processar recuperação. Tente novamente.';
                    recuperacaoErrorMessage.style.display = 'block';
                }
            } finally {
                setLoadingState(botao, false);
            }
        }

        function adicionarCampoCodigoVerificacao(email) {
            let campoCodigoExistente = document.getElementById('codigo-verificacao');
            if (!campoCodigoExistente && formNovaSenha) {
                const divCodigo = document.createElement('div');
                divCodigo.className = 'form-group';
                divCodigo.innerHTML = `
                    <label for="codigo-verificacao"><i class="fas fa-key"></i> Código de Verificação</label>
                    <input type="text" id="codigo-verificacao" name="codigo" required maxlength="6" placeholder="Digite o código de 6 dígitos" style="text-align: center; letter-spacing: 0.5em; font-weight: bold;">
                    <small>Código enviado para: ${email}</small>`;
                const primeiroInput = formNovaSenha.querySelector('.form-group');
                formNovaSenha.insertBefore(divCodigo, primeiroInput);
            }
            if (novaSenhaModal) novaSenhaModal.setAttribute('data-email', email);
        }

        async function processarNovaSenha() {
            const botao = formNovaSenha.querySelector('button[type="submit"]');
            const email = novaSenhaModal ? novaSenhaModal.getAttribute('data-email') : null;
            const codigo = document.getElementById('codigo-verificacao')?.value;
            const novaSenha = document.getElementById('nova-senha')?.value?.trim();
            const confirmarSenha = document.getElementById('confirmar-nova-senha')?.value?.trim();
            const documento = document.getElementById('nova-senha-documento')?.value;

            if (novaSenhaErrorMessage) novaSenhaErrorMessage.style.display = 'none';
            if (novaSenhaSuccessMessage) novaSenhaSuccessMessage.style.display = 'none';

            // Validações
            if ((codigo && codigo.length !== 6) || novaSenha !== confirmarSenha || (novaSenha && novaSenha.length < 6)) {
                const mensagem = (codigo && codigo.length !== 6) ? 'O código deve ter 6 dígitos.' : 
                                (novaSenha !== confirmarSenha) ? 'As senhas não coincidem.' : 
                                'A senha deve ter no mínimo 6 caracteres.';
                if (novaSenhaErrorMessage) {
                    novaSenhaErrorMessage.textContent = mensagem;
                    novaSenhaErrorMessage.style.display = 'block';
                }
                return;
            }
            
            // Verificar código se fornecido
            if (codigo && email) {
                const verificacao = verificarCodigoRecuperacao(email, codigo);
                if (!verificacao.valido) {
                    if (novaSenhaErrorMessage) {
                        novaSenhaErrorMessage.textContent = `Código inválido: ${verificacao.motivo}`;
                        novaSenhaErrorMessage.style.display = 'block';
                    }
                    return;
                }
            }
            
            setLoadingState(botao, true);
            
            try {
                const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
                const docLimpo = documento.replace(/[^\d]+/g, '');
                const index = usuarios.findIndex(u => u.documento && u.documento.replace(/[^\d]+/g, '') === docLimpo);

                if (index !== -1) {
                    usuarios[index].password = novaSenha;
                    localStorage.setItem('usuarios', JSON.stringify(usuarios));
                    
                    if (novaSenhaSuccessMessage) {
                        novaSenhaSuccessMessage.textContent = 'Senha alterada com sucesso! Você já pode fazer login.';
                        novaSenhaSuccessMessage.style.display = 'block';
                    }
                    
                    const campoCodigoDiv = document.getElementById('codigo-verificacao')?.closest('.form-group');
                    if (campoCodigoDiv) campoCodigoDiv.remove();
                    
                    setTimeout(() => {
                        if (novaSenhaModal) novaSenhaModal.style.display = 'none';
                        if (loginModal) loginModal.style.display = 'flex';
                        if (novaSenhaSuccessMessage) novaSenhaSuccessMessage.style.display = 'none';
                        if (formNovaSenha) formNovaSenha.reset();
                    }, 2000);
                } else {
                    if (novaSenhaErrorMessage) {
                        novaSenhaErrorMessage.textContent = 'Usuário não encontrado.';
                        novaSenhaErrorMessage.style.display = 'block';
                    }
                }
            } catch (error) {
                console.error('❌ Erro ao alterar senha:', error);
                if (novaSenhaErrorMessage) {
                    novaSenhaErrorMessage.textContent = 'Erro ao salvar nova senha. Tente novamente.';
                    novaSenhaErrorMessage.style.display = 'block';
                }
            } finally {
                setLoadingState(botao, false);
            }
        }

        // =====================================================
        // INICIALIZAÇÃO DOS MODAIS
        // =====================================================
        
        [loginModal, cadastroModal, recuperacaoModal, novaSenhaModal].forEach(modal => {
            if (modal) modal.style.display = 'none';
        });
        
        [errorMessage, modalErrorMessage, cadastroErrorMessage, cadastroSuccessMessage, 
         recuperacaoErrorMessage, recuperacaoSuccessMessage, novaSenhaErrorMessage, novaSenhaSuccessMessage].forEach(el => {
            if (el) el.style.display = 'none';
        });

        // =====================================================
        // EVENT LISTENERS
        // =====================================================
        
        // Formulários de login
        if (loginForm) {
            loginForm.addEventListener('submit', function(e) {
                e.preventDefault();
                const documento = document.getElementById('documento')?.value?.trim();
                const password = document.getElementById('password')?.value?.trim();
                if (documento && password) {
                    processLogin(documento, password, false);
                }
            });
        }

        if (modalLoginForm) {
            modalLoginForm.addEventListener('submit', function(e) {
                e.preventDefault();
                const documento = document.getElementById('modal-documento')?.value?.trim();
                const password = document.getElementById('modal-password')?.value?.trim();
                if (documento && password) {
                    processLogin(documento, password, true);
                }
            });
        }

        // Formatação de documentos
        [document.getElementById('documento'), document.getElementById('modal-documento'), document.getElementById('cadastro-documento')].forEach(input => {
            if (input) input.addEventListener('input', () => formatarDocumento(input));
        });

        // Formulário de cadastro
        if (formCadastro) {
            formCadastro.addEventListener('submit', async function(e) {
                e.preventDefault();
                const nome = document.getElementById('cadastro-nome')?.value?.trim();
                const email = document.getElementById('cadastro-email')?.value?.trim();
                const documento = document.getElementById('cadastro-documento')?.value?.trim();
                const password = document.getElementById('cadastro-password')?.value?.trim();
                const confirmPassword = document.getElementById('cadastro-confirm-password')?.value?.trim();
                const botao = formCadastro.querySelector('button[type="submit"]');

                if (cadastroErrorMessage) cadastroErrorMessage.style.display = 'none';
                if (cadastroSuccessMessage) cadastroSuccessMessage.style.display = 'none';

                // Validações
                if (!nome || !email || !documento || !password) {
                    if (cadastroErrorMessage) {
                        cadastroErrorMessage.textContent = 'Todos os campos são obrigatórios';
                        cadastroErrorMessage.style.display = 'block';
                    }
                    return;
                }

                if (password !== confirmPassword) {
                    if (cadastroErrorMessage) {
                        cadastroErrorMessage.textContent = 'As senhas não coincidem';
                        cadastroErrorMessage.style.display = 'block';
                    }
                    return;
                }

                if (password.length < 6) {
                    if (cadastroErrorMessage) {
                        cadastroErrorMessage.textContent = 'A senha deve ter pelo menos 6 caracteres';
                        cadastroErrorMessage.style.display = 'block';
                    }
                    return;
                }

                if (!validarDocumento(documento)) {
                    if (cadastroErrorMessage) {
                        cadastroErrorMessage.textContent = 'CPF/CNPJ inválido';
                        cadastroErrorMessage.style.display = 'block';
                    }
                    return;
                }

                setLoadingState(botao, true);
                
                try {
                    const resultado = await processarCadastro(nome, email, documento, password);
                    
                    if (cadastroSuccessMessage) {
                        cadastroSuccessMessage.textContent = 'Cadastro realizado com sucesso! Você já pode fazer login.';
                        cadastroSuccessMessage.style.display = 'block';
                    }
                    
                    if (formCadastro) formCadastro.reset();
                    
                    setTimeout(() => {
                        if (cadastroModal) cadastroModal.style.display = 'none';
                        if (window.innerWidth <= 768 && loginModal) {
                            loginModal.style.display = 'flex';
                        }
                        if (cadastroSuccessMessage) cadastroSuccessMessage.style.display = 'none';
                    }, 3000);

                } catch (error) {
                    console.error('❌ Erro no cadastro:', error);
                    if (cadastroErrorMessage) {
                        cadastroErrorMessage.textContent = error.message || 'Erro ao criar conta. Tente novamente.';
                        cadastroErrorMessage.style.display = 'block';
                    }
                } finally {
                    setLoadingState(botao, false);
                }
            });
        }

        // Formulário de recuperação
        if (formRecuperacao) {
            formRecuperacao.addEventListener('submit', function(e) {
                e.preventDefault();
                const email = document.getElementById('recuperacao-email')?.value?.trim();
                if (email) {
                    processarRecuperacaoSenha(email);
                }
            });
        }

        // Formulário de nova senha
        if (formNovaSenha) {
            formNovaSenha.addEventListener('submit', function(e) {
                e.preventDefault();
                processarNovaSenha();
            });
        }

        // =====================================================
        // NAVEGAÇÃO ENTRE MODAIS
        // =====================================================
        
        if (openLoginModalBtn) {
            openLoginModalBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (loginModal) loginModal.style.display = 'flex';
            });
        }

        if (mobileLoginBtn) {
            mobileLoginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (loginModal) loginModal.style.display = 'flex';
            });
        }

        if (modalAbrirCadastroBtn) {
            modalAbrirCadastroBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (loginModal) loginModal.style.display = 'none';
                if (cadastroModal) cadastroModal.style.display = 'flex';
            });
        }

        if (cadastroAbrirLoginBtn) {
            cadastroAbrirLoginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (cadastroModal) cadastroModal.style.display = 'none';
                if (loginModal) loginModal.style.display = 'flex';
            });
        }

        if (esqueceuSenhaBtn) {
            esqueceuSenhaBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (loginModal) loginModal.style.display = 'none';
                if (recuperacaoModal) recuperacaoModal.style.display = 'flex';
            });
        }

        if (recuperacaoAbrirLoginBtn) {
            recuperacaoAbrirLoginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (recuperacaoModal) recuperacaoModal.style.display = 'none';
                if (loginModal) loginModal.style.display = 'flex';
            });
        }

        // =====================================================
        // FECHAR MODALS
        // =====================================================
        
        function fecharModal(modal) {
            if (modal) {
                modal.style.display = 'none';
                const form = modal.querySelector('form');
                if (form) form.reset();
                const error = modal.querySelector('.error-message');
                const success = modal.querySelector('.success-message');
                if (error) error.style.display = 'none';
                if (success) success.style.display = 'none';
            }
        }

        if (loginCloseBtn) {
            loginCloseBtn.addEventListener('click', () => fecharModal(loginModal));
        }

        if (cadastroCloseBtn) {
            cadastroCloseBtn.addEventListener('click', () => fecharModal(cadastroModal));
        }

        if (recuperacaoCloseBtn) {
            recuperacaoCloseBtn.addEventListener('click', () => fecharModal(recuperacaoModal));
        }

        if (novaSenhaCloseBtn) {
            novaSenhaCloseBtn.addEventListener('click', () => {
                fecharModal(novaSenhaModal);
                const campoCodigoDiv = document.getElementById('codigo-verificacao')?.closest('.form-group');
                if (campoCodigoDiv) campoCodigoDiv.remove();
            });
        }
        
        // Fechar modais clicando fora
        window.addEventListener('click', function(event) {
            if (event.target === loginModal) fecharModal(loginModal);
            if (event.target === cadastroModal) fecharModal(cadastroModal);
            if (event.target === recuperacaoModal) fecharModal(recuperacaoModal);
            if (event.target === novaSenhaModal) {
                fecharModal(novaSenhaModal);
                const campoCodigoDiv = document.getElementById('codigo-verificacao')?.closest('.form-group');
                if (campoCodigoDiv) campoCodigoDiv.remove();
            }
        });

        // =====================================================
        // LIMPAR MENSAGENS AO DIGITAR
        // =====================================================
        
        [document.getElementById('documento'), document.getElementById('password'), 
         document.getElementById('modal-documento'), document.getElementById('modal-password')].forEach(input => {
            if (input) {
                input.addEventListener('input', () => {
                    const errorEl = input.id.includes('modal') ? modalErrorMessage : errorMessage;
                    if (errorEl) errorEl.style.display = 'none';
                });
            }
        });

        [document.getElementById('cadastro-nome'), document.getElementById('cadastro-email'), 
         document.getElementById('cadastro-documento'), document.getElementById('cadastro-password'), 
         document.getElementById('cadastro-confirm-password')].forEach(input => {
            if (input) {
                input.addEventListener('input', () => {
                    if (cadastroErrorMessage) cadastroErrorMessage.style.display = 'none';
                });
            }
        });

        const recuperacaoEmailInput = document.getElementById('recuperacao-email');
        if (recuperacaoEmailInput) {
            recuperacaoEmailInput.addEventListener('input', () => {
                if (recuperacaoErrorMessage) recuperacaoErrorMessage.style.display = 'none';
            });
        }

        [document.getElementById('nova-senha'), document.getElementById('confirmar-nova-senha')].forEach(input => {
            if (input) {
                input.addEventListener('input', () => {
                    if (novaSenhaErrorMessage) novaSenhaErrorMessage.style.display = 'none';
                });
            }
        });

        console.log('✅ Sistema de login inicializado com sucesso!');
        console.log('📊 Status:', {
            useAPI: useAPI,
            apiClientAvailable: !!apiClient,
            sistemaMode: useAPI ? 'API + LocalStorage' : 'LocalStorage only'
        });
    }

    // =====================================================
    // INÍCIO DA INICIALIZAÇÃO
    // =====================================================
    
    inicializarSistema().catch(error => {
        console.error('❌ Erro crítico na inicialização:', error);
        alert('Erro ao inicializar sistema. Por favor, recarregue a página.');
    });
});

// =====================================================
// FUNÇÕES GLOBAIS
// =====================================================

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

// Função global para diagnóstico
function diagnosticoLogin() {
    const status = {
        timestamp: new Date().toISOString(),
        apiClient: !!window.apiClient,
        sistemaAdapter: !!window.sistemaAdapter,
        useAPI: !!window.useAPI,
        localStorage: (() => {
            try {
                const test = 'test';
                localStorage.setItem(test, test);
                localStorage.removeItem(test);
                return 'funcionando';
            } catch (e) {
                return 'erro: ' + e.message;
            }
        })(),
        sessionStorage: (() => {
            try {
                const test = 'test';
                sessionStorage.setItem(test, test);
                sessionStorage.removeItem(test);
                return 'funcionando';
            } catch (e) {
                return 'erro: ' + e.message;
            }
        })(),
        usuarios: JSON.parse(localStorage.getItem('usuarios') || '[]').length,
        emailJS: !!window.emailjs
    };
    
    console.table(status);
    return status;
}

// Exportar para escopo global
window.diagnosticoLogin = diagnosticoLogin;

console.log('📦 Login.js carregado - sistema será inicializado após DOM estar pronto');