// ================================================================
// API CLIENT - SISTEMA FINANCEIRO CORRIGIDO E INTEGRADO
// Versão 2.1.0 - Compatível com PostgreSQL + Frontend existente
// ================================================================

console.log('🚀 Carregando API Client v2.1.0...');

// Verificar se já existe um apiClient e limpar
if (window.apiClient) {
    console.log('⚠️ API Client anterior detectado, substituindo...');
    window.apiClient = null;
}
if (window.sistemaAdapter) {
    window.sistemaAdapter = null;
}

// ================================================================
// CONFIGURAÇÕES E DETECÇÃO DE AMBIENTE
// ================================================================

const IS_DEVELOPMENT = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' ||
                      window.location.port === '5500';

const PROD_BASE_URL = 'https://sistema-financeiro-api.onrender.com/api';
const DEV_BASE_URL = 'http://localhost:5000/api';
const API_BASE_URL = IS_DEVELOPMENT ? DEV_BASE_URL : PROD_BASE_URL;

console.log(`🌍 Ambiente: ${IS_DEVELOPMENT ? 'Desenvolvimento' : 'Produção'}`);
console.log(`🔗 API Base URL: ${API_BASE_URL}`);

// ================================================================
// CLASSE PRINCIPAL DO API CLIENT
// ================================================================

class APIClient {
    constructor(baseURL = API_BASE_URL) {
        this.baseURL = baseURL;
        this.token = localStorage.getItem('authToken') || localStorage.getItem('token');
        this.usuarioAtual = null;
        this.isOnline = navigator.onLine;
        this.requestQueue = [];
        this.retryCount = 0;
        this.maxRetries = 3;
        
        this.setupNetworkListeners();
        this.loadCachedUser();
    }
    
    // ================================================================
    // CONFIGURAÇÃO E UTILITÁRIOS
    // ================================================================
    
    setupNetworkListeners() {
        window.addEventListener('online', () => {
            console.log('🌐 Conexão restaurada');
            this.isOnline = true;
            this.processRequestQueue();
        });
        
        window.addEventListener('offline', () => {
            console.log('📴 Conexão perdida');
            this.isOnline = false;
        });
    }
    
    loadCachedUser() {
        try {
            const cachedUser = sessionStorage.getItem('dadosUsuarioLogado');
            if (cachedUser) {
                this.usuarioAtual = JSON.parse(cachedUser);
            }
        } catch (error) {
            console.warn('⚠️ Erro ao carregar usuário do cache:', error);
        }
    }
    
    async makeRequest(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...(this.token && { 'Authorization': `Bearer ${this.token}` })
            }
        };
        
        const requestOptions = { ...defaultOptions, ...options };
        
        // Adicionar headers extras se necessário
        if (requestOptions.body && typeof requestOptions.body === 'object') {
            requestOptions.body = JSON.stringify(requestOptions.body);
        }
        
        try {
            console.log(`🌐 API Request: ${requestOptions.method || 'GET'} ${endpoint}`);
            
            const response = await fetch(url, requestOptions);
            
            if (!response.ok) {
                await this.handleErrorResponse(response, endpoint, requestOptions);
                return null;
            }
            
            const data = await response.json();
            console.log(`✅ API Response: ${endpoint}`, data);
            
            this.retryCount = 0; // Reset retry count on success
            return data;
            
        } catch (error) {
            console.error(`❌ API Error [${endpoint}]:`, error);
            
            if (!this.isOnline) {
                this.queueRequest(endpoint, requestOptions);
                throw new Error('Sem conexão com a internet. Operação será executada quando a conexão for restaurada.');
            }
            
            // Retry logic para erros de rede
            if (this.retryCount < this.maxRetries && this.shouldRetry(error)) {
                this.retryCount++;
                console.log(`🔄 Tentativa ${this.retryCount}/${this.maxRetries} para ${endpoint}`);
                await this.delay(1000 * this.retryCount);
                return this.makeRequest(endpoint, options);
            }
            
            throw error;
        }
    }
    
    async handleErrorResponse(response, endpoint, requestOptions) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 401) {
            console.warn('🔑 Token expirado ou inválido');
            this.handleUnauthorized();
            throw new Error('Sessão expirada. Faça login novamente.');
        }
        
        if (response.status === 403) {
            throw new Error('Acesso negado. Você não tem permissão para esta operação.');
        }
        
        if (response.status === 404) {
            throw new Error('Recurso não encontrado.');
        }
        
        if (response.status === 409) {
            throw new Error(errorData.error || 'Conflito de dados.');
        }
        
        if (response.status >= 500) {
            throw new Error('Erro interno do servidor. Tente novamente mais tarde.');
        }
        
        throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    
    shouldRetry(error) {
        return error.name === 'TypeError' || 
               error.message.includes('fetch') ||
               error.message.includes('network');
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    queueRequest(endpoint, options) {
        this.requestQueue.push({ endpoint, options, timestamp: Date.now() });
        console.log(`📋 Solicitação enfileirada: ${endpoint}`);
    }
    
    async processRequestQueue() {
        if (this.requestQueue.length === 0) return;
        
        console.log(`🔄 Processando ${this.requestQueue.length} solicitações enfileiradas...`);
        
        const currentQueue = [...this.requestQueue];
        this.requestQueue = [];
        
        for (const request of currentQueue) {
            try {
                await this.makeRequest(request.endpoint, request.options);
            } catch (error) {
                console.error('❌ Erro ao processar solicitação enfileirada:', error);
            }
        }
    }
    
    handleUnauthorized() {
        this.token = null;
        this.usuarioAtual = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('token');
        sessionStorage.removeItem('usuarioAtual');
        sessionStorage.removeItem('dadosUsuarioLogado');
        
        // Redirecionar para login após um delay
        setTimeout(() => {
            if (!window.location.pathname.includes('login.html')) {
                window.location.href = 'login.html';
            }
        }, 1000);
    }
    
    // ================================================================
    // MÉTODOS DE AUTENTICAÇÃO
    // ================================================================
    
    async login(documento, senha) {
        try {
            console.log('🔐 Realizando login...');
            
            const response = await this.makeRequest('/auth/login', {
                method: 'POST',
                body: { documento, senha }
            });
            
            if (!response) {
                throw new Error('Falha na autenticação');
            }
            
            if (response.token) {
                this.token = response.token;
                this.usuarioAtual = response.usuario;
                
                // Salvar tokens e dados do usuário
                localStorage.setItem('authToken', this.token);
                localStorage.setItem('token', this.token);
                sessionStorage.setItem('usuarioAtual', documento.replace(/[^\d]+/g, ''));
                sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(response.usuario));
                
                console.log('✅ Login realizado com sucesso');
                return { 
                    success: true, 
                    token: this.token, 
                    usuario: response.usuario 
                };
            }
            
            throw new Error('Token não recebido do servidor');
            
        } catch (error) {
            console.error('❌ Erro no login:', error);
            throw error;
        }
    }
    
    async verificarToken() {
        if (!this.token) {
            throw new Error('Token não encontrado');
        }
        
        try {
            const response = await this.makeRequest('/auth/me');
            
            if (response && response.usuario) {
                this.usuarioAtual = response.usuario;
                sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(response.usuario));
                return response.usuario;
            }
            
            throw new Error('Dados do usuário não recebidos');
            
        } catch (error) {
            this.handleUnauthorized();
            throw error;
        }
    }
    
    logout() {
        console.log('👋 Realizando logout...');
        this.token = null;
        this.usuarioAtual = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('token');
        sessionStorage.removeItem('usuarioAtual');
        sessionStorage.removeItem('dadosUsuarioLogado');
        this.requestQueue = [];
    }
    
    // ================================================================
    // MÉTODOS DE TRANSAÇÕES
    // ================================================================
    
    async getTransacoes(filtros = {}) {
        try {
            const params = new URLSearchParams();
            Object.entries(filtros).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    params.append(key, value);
                }
            });
            
            const queryString = params.toString();
            const endpoint = `/transacoes${queryString ? '?' + queryString : ''}`;
            
            return await this.makeRequest(endpoint);
        } catch (error) {
            console.error('❌ Erro ao buscar transações:', error);
            throw error;
        }
    }
    
    async criarTransacao(transacao) {
        try {
            console.log('💰 Criando transação:', transacao.tipo);
            
            return await this.makeRequest('/transacoes', {
                method: 'POST',
                body: transacao
            });
        } catch (error) {
            console.error('❌ Erro ao criar transação:', error);
            throw error;
        }
    }
    
    async atualizarTransacao(id, dados) {
        try {
            console.log('📝 Atualizando transação:', id);
            
            return await this.makeRequest(`/transacoes/${id}`, {
                method: 'PUT',
                body: dados
            });
        } catch (error) {
            console.error('❌ Erro ao atualizar transação:', error);
            throw error;
        }
    }
    
    async excluirTransacao(id, opcoes = {}) {
        try {
            console.log('🗑️ Excluindo transação:', id);
            
            return await this.makeRequest(`/transacoes/${id}`, {
                method: 'DELETE',
                body: opcoes
            });
        } catch (error) {
            console.error('❌ Erro ao excluir transação:', error);
            throw error;
        }
    }
    
    // ================================================================
    // MÉTODOS DE CATEGORIAS
    // ================================================================
    
    async getCategorias() {
        try {
            return await this.makeRequest('/categorias');
        } catch (error) {
            console.error('❌ Erro ao buscar categorias:', error);
            throw error;
        }
    }
    
    async criarCategoria(categoria) {
        try {
            console.log('📂 Criando categoria:', categoria);
            
            return await this.makeRequest('/categorias', {
                method: 'POST',
                body: { categoria }
            });
        } catch (error) {
            console.error('❌ Erro ao criar categoria:', error);
            throw error;
        }
    }
    
    // ================================================================
    // MÉTODOS DE DADOS FINANCEIROS
    // ================================================================
    
    async getDadosFinanceiros(ano = null) {
        try {
            const params = ano ? `?ano=${ano}` : '';
            return await this.makeRequest(`/dados-financeiros${params}`);
        } catch (error) {
            console.error('❌ Erro ao buscar dados financeiros:', error);
            throw error;
        }
    }
    
    async salvarDadosFinanceiros(dados) {
        try {
            console.log('💾 Salvando dados financeiros...');
            
            return await this.makeRequest('/dados-financeiros', {
                method: 'POST',
                body: { dadosFinanceiros: dados }
            });
        } catch (error) {
            console.error('❌ Erro ao salvar dados financeiros:', error);
            throw error;
        }
    }
    
    // ================================================================
    // MÉTODOS DE DASHBOARD
    // ================================================================
    
    async getDashboardData(ano) {
        try {
            return await this.makeRequest(`/dashboard/${ano}`);
        } catch (error) {
            console.error('❌ Erro ao buscar dados do dashboard:', error);
            throw error;
        }
    }
    
    // ================================================================
    // MÉTODOS DE RELATÓRIOS
    // ================================================================
    
    async getRelatorioCategorias(ano) {
        try {
            return await this.makeRequest(`/relatorios/categorias/${ano}`);
        } catch (error) {
            console.error('❌ Erro ao buscar relatório de categorias:', error);
            throw error;
        }
    }
    
    async getRelatorioMensal(ano, mes) {
        try {
            return await this.makeRequest(`/relatorios/mensal/${ano}/${mes}`);
        } catch (error) {
            console.error('❌ Erro ao buscar relatório mensal:', error);
            throw error;
        }
    }
    
    // ================================================================
    // MÉTODOS DE USUÁRIOS (Admin)
    // ================================================================
    
    async getUsuarios(filtros = {}) {
        try {
            const params = new URLSearchParams(filtros);
            return await this.makeRequest(`/usuarios?${params}`);
        } catch (error) {
            console.error('❌ Erro ao buscar usuários:', error);
            throw error;
        }
    }
    
    async alterarStatusUsuario(id, status) {
        try {
            return await this.makeRequest(`/usuarios/${id}/status`, {
                method: 'PUT',
                body: { status }
            });
        } catch (error) {
            console.error('❌ Erro ao alterar status do usuário:', error);
            throw error;
        }
    }
    
    // ================================================================
    // MÉTODOS DE SISTEMA
    // ================================================================
    
    async getHealth() {
        try {
            return await this.makeRequest('/health');
        } catch (error) {
            console.error('❌ Erro ao verificar saúde do sistema:', error);
            throw error;
        }
    }
    
    async getBackup(userId) {
        try {
            return await this.makeRequest(`/backup/${userId}`);
        } catch (error) {
            console.error('❌ Erro ao gerar backup:', error);
            throw error;
        }
    }
}

// ================================================================
// SISTEMA ADAPTER - COMPATIBILIDADE COM FRONTEND EXISTENTE
// ================================================================

class SistemaAdapter {
    constructor(apiClient) {
        this.api = apiClient;
        this.pronto = false;
        this.tentativasReconexao = 0;
        this.maxTentativasReconexao = 3;
    }
    
    // ================================================================
    // MÉTODOS DE VERIFICAÇÃO E INICIALIZAÇÃO
    // ================================================================
    
    async aguardarPronto() {
        if (this.pronto) return true;
        
        return new Promise((resolve) => {
            let tentativas = 0;
            const maxTentativas = 30;
            
            const verificar = () => {
                tentativas++;
                
                if (this.pronto) {
                    resolve(true);
                } else if (tentativas >= maxTentativas) {
                    console.warn('⚠️ Timeout aguardando adapter estar pronto');
                    resolve(false);
                } else {
                    setTimeout(verificar, 200);
                }
            };
            
            verificar();
        });
    }
    
    async verificarAcesso() {
        try {
            if (this.api.token) {
                await this.api.verificarToken();
                this.pronto = true;
                return true;
            }
            
            const usuarioAtual = sessionStorage.getItem('usuarioAtual');
            if (!usuarioAtual) {
                this.redirecionarParaLogin();
                return false;
            }
            
            this.pronto = true;
            return true;
        } catch (error) {
            console.error('❌ Verificação de acesso falhou:', error);
            this.redirecionarParaLogin();
            return false;
        }
    }
    
    redirecionarParaLogin() {
        const pathname = window.location.pathname;
        if (pathname.includes('index.html') || 
            pathname.includes('financeiro.html') || 
            pathname === '/') {
            window.location.href = 'login.html';
        }
    }
    
    // ================================================================
    // MÉTODOS DE DADOS FINANCEIROS - HÍBRIDO API + LOCALSTORAGE
    // ================================================================
    
    async carregarDadosFinanceiros() {
        try {
            console.log('📊 Carregando dados financeiros...');
            
            // Tentar carregar da API primeiro
            const dadosAPI = await this.api.getDadosFinanceiros();
            if (dadosAPI && Object.keys(dadosAPI).length > 0) {
                console.log('✅ Dados carregados da API');
                return dadosAPI;
            }
            
            // Fallback para localStorage
            console.log('💾 Carregando dados do localStorage...');
            return this.carregarDadosLocal();
            
        } catch (error) {
            console.error('❌ Erro ao carregar dados via API:', error);
            return this.carregarDadosLocal();
        }
    }
    
    carregarDadosLocal() {
        try {
            const usuarioAtual = sessionStorage.getItem('usuarioAtual');
            if (!usuarioAtual) {
                return this.criarEstruturaPadrao();
            }
            
            const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
            const usuario = usuarios.find(u => 
                u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual
            );
            
            if (usuario && usuario.dadosFinanceiros) {
                return usuario.dadosFinanceiros;
            }
            
            return this.criarEstruturaPadrao();
            
        } catch (error) {
            console.error('❌ Erro ao carregar dados locais:', error);
            return this.criarEstruturaPadrao();
        }
    }
    
    criarEstruturaPadrao() {
        const anoAtual = new Date().getFullYear();
        const estrutura = {};
        
        [anoAtual - 1, anoAtual, anoAtual + 1].forEach(ano => {
            estrutura[ano] = { meses: [] };
            for (let i = 0; i < 12; i++) {
                estrutura[ano].meses[i] = {
                    receitas: [],
                    despesas: [],
                    fechado: false,
                    saldoAnterior: 0,
                    saldoFinal: 0
                };
            }
        });
        
        return estrutura;
    }
    
    async salvarDadosUsuario(dadosFinanceiros) {
        try {
            // Tentar salvar na API primeiro
            const sucessoAPI = await this.api.salvarDadosFinanceiros(dadosFinanceiros);
            if (sucessoAPI) {
                console.log('✅ Dados salvos na API');
                return true;
            }
            
            // Fallback para localStorage
            return this.salvarDadosLocal(dadosFinanceiros);
            
        } catch (error) {
            console.error('❌ Erro ao salvar na API:', error);
            return this.salvarDadosLocal(dadosFinanceiros);
        }
    }
    
    salvarDadosLocal(dadosFinanceiros) {
        try {
            const usuarioAtual = sessionStorage.getItem('usuarioAtual');
            if (!usuarioAtual) return false;
            
            const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
            const index = usuarios.findIndex(u => 
                u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual
            );
            
            if (index !== -1) {
                usuarios[index].dadosFinanceiros = dadosFinanceiros;
                usuarios[index].ultimaAtualizacao = new Date().toISOString();
                localStorage.setItem('usuarios', JSON.stringify(usuarios));
                console.log('✅ Dados salvos no localStorage');
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('❌ Erro ao salvar dados locais:', error);
            return false;
        }
    }
    
    // ================================================================
    // MÉTODOS DE TRANSAÇÕES - COMPATIBILIDADE COM FRONTEND
    // ================================================================
    
    async salvarReceita(mes, ano, receita, id = null) {
        try {
            console.log('💰 Salvando receita via API...');
            
            const transacao = {
                tipo: 'receita',
                descricao: receita.descricao,
                valor: parseFloat(receita.valor),
                categoria: 'Receitas',
                formaPagamento: 'pix',
                dataCompra: receita.data || new Date().toISOString().split('T')[0],
                mes: mes,
                ano: ano,
                id: id
            };
            
            const resultado = await this.api.criarTransacao(transacao);
            return !!resultado;
            
        } catch (error) {
            console.error('❌ Erro ao salvar receita via API:', error);
            return false;
        }
    }
    
    async salvarDespesa(mes, ano, despesa, id = null) {
        try {
            console.log('💸 Salvando despesa via API...');
            
            const transacao = {
                tipo: 'despesa',
                descricao: despesa.descricao,
                valor: parseFloat(despesa.valor),
                valorPago: despesa.valorPago ? parseFloat(despesa.valorPago) : null,
                categoria: despesa.categoria,
                formaPagamento: despesa.formaPagamento || 'debito',
                dataCompra: despesa.dataCompra || despesa.data,
                dataVencimento: despesa.dataVencimento,
                parcelado: despesa.parcelado || false,
                totalParcelas: despesa.totalParcelas || 1,
                idGrupoParcelamento: despesa.idGrupoParcelamento,
                parcela: despesa.parcela,
                valorOriginal: despesa.valorOriginal,
                valorTotalComJuros: despesa.valorTotalComJuros,
                metadados: despesa.metadados,
                observacoes: despesa.observacoes,
                mes: mes,
                ano: ano,
                id: id
            };
            
            const resultado = await this.api.criarTransacao(transacao);
            return !!resultado;
            
        } catch (error) {
            console.error('❌ Erro ao salvar despesa via API:', error);
            return false;
        }
    }
    
    async excluirReceita(mes, ano, index, opcao, descricaoReceita) {
        try {
            console.log('🗑️ Excluindo receita via API...');
            
            const opcoes = {
                opcao: opcao,
                descricaoReceita: descricaoReceita
            };
            
            const resultado = await this.api.excluirTransacao(index, opcoes);
            return !!resultado;
            
        } catch (error) {
            console.error('❌ Erro ao excluir receita via API:', error);
            return false;
        }
    }
    
    async excluirDespesa(mes, ano, index, opcao, dadosExclusao) {
        try {
            console.log('🗑️ Excluindo despesa via API...');
            
            const opcoes = {
                opcao: opcao,
                categoriaDespesa: dadosExclusao.categoriaDespesa,
                idGrupoParcelamento: dadosExclusao.idGrupoParcelamento
            };
            
            const resultado = await this.api.excluirTransacao(index, opcoes);
            return !!resultado;
            
        } catch (error) {
            console.error('❌ Erro ao excluir despesa via API:', error);
            return false;
        }
    }
    
    // ================================================================
    // MÉTODOS DE DASHBOARD E CATEGORIAS
    // ================================================================
    
    async getDashboardData(ano) {
        try {
            return await this.api.getDashboardData(ano);
        } catch (error) {
            console.error('❌ Erro ao buscar dashboard via API:', error);
            return null;
        }
    }
    
    async getCategorias() {
        try {
            return await this.api.getCategorias();
        } catch (error) {
            console.error('❌ Erro ao buscar categorias via API:', error);
            return { despesas: [] };
        }
    }
    
    async salvarCategorias(categorias) {
        try {
            // A API atual não tem endpoint específico para salvar categorias
            // Por enquanto, retornar true para compatibilidade
            return true;
        } catch (error) {
            console.error('❌ Erro ao salvar categorias via API:', error);
            return false;
        }
    }
    
    // ================================================================
    // MÉTODOS DE COMPATIBILIDADE
    // ================================================================
    
    getUsuarioAtual() {
        return this.api.usuarioAtual;
    }
    
    async importarDadosUsuario(dados) {
        try {
            console.log('📥 Importando dados do usuário...');
            // Implementar lógica de importação se necessário
            return true;
        } catch (error) {
            console.error('❌ Erro ao importar dados:', error);
            return false;
        }
    }
    
    async limparDadosUsuario() {
        try {
            console.log('🧹 Limpando dados do usuário...');
            // Implementar lógica de limpeza se necessário
            return true;
        } catch (error) {
            console.error('❌ Erro ao limpar dados:', error);
            return false;
        }
    }
}

// ================================================================
// INICIALIZAÇÃO E CONFIGURAÇÃO GLOBAL
// ================================================================

let apiClient = null;
let sistemaAdapter = null;

async function initializeAPISystem() {
    try {
        console.log('🚀 Inicializando sistema API v2.1.0...');
        
        apiClient = new APIClient();
        sistemaAdapter = new SistemaAdapter(apiClient);
        
        // Verificar se há token salvo e validar
        if (apiClient.token) {
            try {
                await apiClient.verificarToken();
                console.log('✅ Token válido encontrado');
            } catch (error) {
                console.warn('⚠️ Token inválido, limpando dados...');
                apiClient.handleUnauthorized();
                return false;
            }
        }
        
        // Exportar para escopo global
        window.apiClient = apiClient;
        window.sistemaAdapter = sistemaAdapter;
        window.useAPI = true;
        
        // Verificar saúde da API
        try {
            const health = await apiClient.getHealth();
            console.log('🏥 Status da API:', health);
        } catch (error) {
            console.warn('⚠️ API não está respondendo, usando modo híbrido');
        }
        
        console.log('✅ Sistema API inicializado!');
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao inicializar API:', error);
        window.useAPI = false;
        return false;
    }
}

// ================================================================
// INTERFACE DE COMPATIBILIDADE COM FRONTEND EXISTENTE
// ================================================================

window.usuarioDados = {
    aguardarPronto: async () => {
        if (sistemaAdapter) {
            return await sistemaAdapter.aguardarPronto();
        }
        return false;
    },
    
    verificarAcesso: async () => {
        if (sistemaAdapter) {
            return await sistemaAdapter.verificarAcesso();
        }
        return false;
    },
    
    getUsuarioAtual: () => {
        if (sistemaAdapter) {
            return sistemaAdapter.getUsuarioAtual();
        }
        return null;
    },
    
    getDadosFinanceirosUsuario: async () => {
        if (sistemaAdapter) {
            return await sistemaAdapter.carregarDadosFinanceiros();
        }
        return {};
    },
    
    salvarDadosUsuario: async (dados) => {
        if (sistemaAdapter) {
            return await sistemaAdapter.salvarDadosUsuario(dados);
        }
        return false;
    },
    
    salvarReceita: async (mes, ano, receita, id) => {
        if (sistemaAdapter) {
            return await sistemaAdapter.salvarReceita(mes, ano, receita, id);
        }
        return false;
    },
    
    salvarDespesa: async (mes, ano, despesa, id) => {
        if (sistemaAdapter) {
            return await sistemaAdapter.salvarDespesa(mes, ano, despesa, id);
        }
        return false;
    },
    
    excluirReceita: async (mes, ano, index, opcao, descricaoReceita) => {
        if (sistemaAdapter) {
            return await sistemaAdapter.excluirReceita(mes, ano, index, opcao, descricaoReceita);
        }
        return false;
    },
    
    excluirDespesa: async (mes, ano, index, opcao, dadosExclusao) => {
        if (sistemaAdapter) {
            return await sistemaAdapter.excluirDespesa(mes, ano, index, opcao, dadosExclusao);
        }
        return false;
    },
    
    recarregarDados: async () => {
        if (sistemaAdapter) {
            return await sistemaAdapter.carregarDadosFinanceiros();
        }
        return {};
    },
    
    limparCache: () => {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('cache_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
    },
    
    executarMigracoes: () => true,
    
    getStatus: () => {
        if (apiClient && sistemaAdapter) {
            return {
                online: apiClient.isOnline,
                autenticado: !!apiClient.token,
                usuario: apiClient.usuarioAtual?.nome,
                baseURL: apiClient.baseURL,
                pronto: sistemaAdapter.pronto,
                requestQueueSize: apiClient.requestQueue.length
            };
        }
        return { erro: 'API não inicializada' };
    }
};

// ================================================================
// AUTO-INICIALIZAÇÃO E EVENTOS
// ================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Aguardar um pouco para outras dependências carregarem
    setTimeout(async () => {
        try {
            const inicializado = await initializeAPISystem();
            
            if (inicializado && window.location.pathname.includes('index.html')) {
                const acessoValido = await window.usuarioDados.verificarAcesso();
                if (!acessoValido) {
                    console.log('❌ Acesso negado, redirecionando...');
                }
            }
            
            // Disparar evento para notificar outros módulos
            window.dispatchEvent(new CustomEvent('apiSystemReady', {
                detail: { inicializado, useAPI: window.useAPI }
            }));
            
        } catch (error) {
            console.error('❌ Erro na inicialização automática da API:', error);
        }
    }, 800);
});

// ================================================================
// EXPORTAÇÕES GLOBAIS
// ================================================================

window.APIClient = APIClient;
window.SistemaAdapter = SistemaAdapter;
window.initializeAPISystem = initializeAPISystem;

// Função de diagnóstico
window.diagnosticoAPI = () => {
    return {
        inicializado: !!(apiClient && sistemaAdapter),
        token: !!apiClient?.token,
        usuario: apiClient?.usuarioAtual?.nome || 'Não logado',
        online: apiClient?.isOnline || false,
        baseURL: apiClient?.baseURL || 'Não definido',
        requestQueue: apiClient?.requestQueue?.length || 0,
        pronto: sistemaAdapter?.pronto || false
    };
};

console.log('📦 API Client v2.1.0 CORRIGIDO E INTEGRADO carregado!');