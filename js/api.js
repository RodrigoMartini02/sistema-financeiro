// ================================================================
// API CLIENT - SISTEMA FINANCEIRO CORRIGIDO
// ================================================================

console.log('🚀 Carregando API Client...');

const IS_DEVELOPMENT = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const PROD_BASE_URL = 'https://sistema-financeiro-kxed.onrender.com/api';
const DEV_BASE_URL = 'http://localhost:5000/api';
const API_BASE_URL = IS_DEVELOPMENT ? DEV_BASE_URL : PROD_BASE_URL;

console.log(`Ambiente: ${IS_DEVELOPMENT ? 'Desenvolvimento' : 'Produção'}. API: ${API_BASE_URL}`);

class APIClient {
    constructor(baseURL = API_BASE_URL) {
        this.baseURL = baseURL;
        this.token = localStorage.getItem('authToken');
        this.usuarioAtual = null;
        this.isOnline = true;
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
        
        try {
            console.log(`🌐 API Request: ${requestOptions.method || 'GET'} ${url}`);
            
            const response = await fetch(url, requestOptions);
            
            if (!response.ok) {
                if (response.status === 401) {
                    this.handleUnauthorized();
                    throw new Error('Sessão expirada. Faça login novamente.');
                }
                
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
            
            const data = await response.json();
            console.log(`✅ API Response: ${endpoint}`, data);
            return data;
            
        } catch (error) {
            console.error(`❌ API Error [${endpoint}]:`, error);
            throw error;
        }
    }
    
    handleUnauthorized() {
        this.token = null;
        this.usuarioAtual = null;
        localStorage.removeItem('authToken');
        sessionStorage.removeItem('usuarioAtual');
        sessionStorage.removeItem('dadosUsuarioLogado');
        
        // Redirecionar para login
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1000);
    }
    
    // ================================================================
    // AUTENTICAÇÃO
    // ================================================================
    
    async login(documento, senha) {
        try {
            console.log('🔐 Fazendo login...');
            
            const response = await this.makeRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ documento, senha })
            });
            
            if (response.token) {
                this.token = response.token;
                this.usuarioAtual = response.usuario;
                
                localStorage.setItem('authToken', this.token);
                sessionStorage.setItem('usuarioAtual', documento.replace(/[^\d]+/g, ''));
                sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(response.usuario));
                
                console.log('✅ Login bem-sucedido');
                return { success: true, token: this.token, usuario: response.usuario };
            }
            
            throw new Error('Token não recebido');
            
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
            this.usuarioAtual = response.usuario;
            return response.usuario;
        } catch (error) {
            this.handleUnauthorized();
            throw error;
        }
    }
    
    logout() {
        console.log('👋 Fazendo logout...');
        this.token = null;
        this.usuarioAtual = null;
        localStorage.removeItem('authToken');
        sessionStorage.removeItem('usuarioAtual');
        sessionStorage.removeItem('dadosUsuarioLogado');
    }
    
    // ================================================================
    // TRANSAÇÕES
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
            console.error('Erro ao buscar transações:', error);
            throw error;
        }
    }
    
    async criarTransacao(transacao) {
        try {
            console.log('💰 Criando transação:', transacao.tipo);
            
            return await this.makeRequest('/transacoes', {
                method: 'POST',
                body: JSON.stringify(transacao)
            });
        } catch (error) {
            console.error('Erro ao criar transação:', error);
            throw error;
        }
    }
    
    async excluirTransacao(id) {
        try {
            return await this.makeRequest(`/transacoes/${id}`, {
                method: 'DELETE'
            });
        } catch (error) {
            console.error('Erro ao excluir transação:', error);
            throw error;
        }
    }
    
    // ================================================================
    // CATEGORIAS
    // ================================================================
    
    async getCategorias() {
        try {
            return await this.makeRequest('/categorias');
        } catch (error) {
            console.error('Erro ao buscar categorias:', error);
            throw error;
        }
    }
    
    // ================================================================
    // DASHBOARD
    // ================================================================
    
    async getDashboardData(ano) {
        try {
            return await this.makeRequest(`/dashboard/${ano}`);
        } catch (error) {
            console.error('Erro ao buscar dashboard:', error);
            throw error;
        }
    }
}

// ================================================================
// ADAPTER SIMPLIFICADO
// ================================================================

class SistemaAdapter {
    constructor(apiClient) {
        this.api = apiClient;
    }
    
    async verificarAcesso() {
        try {
            if (this.api.token) {
                await this.api.verificarToken();
                return true;
            }
            
            const usuarioAtual = sessionStorage.getItem('usuarioAtual');
            if (!usuarioAtual) {
                this.redirecionarParaLogin();
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('❌ Verificação de acesso falhou:', error);
            this.redirecionarParaLogin();
            return false;
        }
    }
    
    redirecionarParaLogin() {
        if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
            window.location.href = 'login.html';
        }
    }
    
    async carregarDadosFinanceiros() {
        try {
            console.log('📊 Carregando dados financeiros...');
            
            const anoAtual = new Date().getFullYear();
            const anos = [anoAtual - 1, anoAtual, anoAtual + 1];
            
            const dadosFinanceiros = {};
            
            for (const ano of anos) {
                dadosFinanceiros[ano] = { meses: [] };
                
                // Inicializar 12 meses
                for (let mes = 0; mes < 12; mes++) {
                    dadosFinanceiros[ano].meses[mes] = {
                        receitas: [],
                        despesas: [],
                        fechado: false
                    };
                }
                
                try {
                    const transacoes = await this.api.getTransacoes({ ano, limit: 1000 });
                    this.organizarTransacoesPorMes(transacoes.transacoes || [], dadosFinanceiros[ano]);
                } catch (error) {
                    console.warn(`⚠️ Erro ao carregar dados de ${ano}:`, error);
                }
            }
            
            console.log('✅ Dados financeiros carregados');
            return dadosFinanceiros;
            
        } catch (error) {
            console.error('❌ Erro ao carregar dados:', error);
            throw error;
        }
    }
    
    organizarTransacoesPorMes(transacoes, dadosAno) {
        transacoes.forEach(transacao => {
            const mes = transacao.mes;
            if (mes >= 0 && mes < 12) {
                const dadosTransacao = this.converterTransacaoAPIParaLocal(transacao);
                
                if (transacao.tipo === 'receita') {
                    dadosAno.meses[mes].receitas.push(dadosTransacao);
                } else if (transacao.tipo === 'despesa') {
                    dadosAno.meses[mes].despesas.push(dadosTransacao);
                }
            }
        });
    }
    
    converterTransacaoAPIParaLocal(transacao) {
        return {
            id: transacao.id,
            descricao: transacao.descricao,
            valor: parseFloat(transacao.valor),
            valorPago: parseFloat(transacao.valorPago || 0),
            categoria: transacao.categoria?.nome || 'Sem categoria',
            categoriaId: transacao.categoriaId,
            formaPagamento: transacao.formaPagamento,
            data: transacao.dataTransacao,
            dataCompra: transacao.dataTransacao,
            dataVencimento: transacao.dataVencimento,
            status: transacao.status,
            quitado: transacao.status === 'pago',
            parcelado: transacao.parcelamento?.total > 1,
            parcela: transacao.parcelamento?.total > 1 ? 
                     `${transacao.parcelamento.atual}/${transacao.parcelamento.total}` : null,
            totalParcelas: transacao.parcelamento?.total || 1,
            idGrupoParcelamento: transacao.parcelamento?.grupoId,
            observacoes: transacao.observacoes
        };
    }
    
    async salvarReceita(mes, ano, receita) {
        try {
            console.log('💰 Salvando receita:', receita.descricao);
            
            const transacaoAPI = this.converterReceitaParaAPI(receita, mes, ano);
            return await this.api.criarTransacao(transacaoAPI);
        } catch (error) {
            console.error('❌ Erro ao salvar receita:', error);
            throw error;
        }
    }
    
    async salvarDespesa(mes, ano, despesa) {
        try {
            console.log('💸 Salvando despesa:', despesa.descricao);
            
            const transacaoAPI = this.converterDespesaParaAPI(despesa, mes, ano);
            return await this.api.criarTransacao(transacaoAPI);
        } catch (error) {
            console.error('❌ Erro ao salvar despesa:', error);
            throw error;
        }
    }
    
    converterReceitaParaAPI(receita, mes, ano) {
        return {
            tipo: 'receita',
            descricao: receita.descricao,
            valor: parseFloat(receita.valor),
            valorPago: parseFloat(receita.valor),
            categoriaId: 1, // ID da categoria "Receitas" - ajustar conforme necessário
            formaPagamento: 'pix',
            dataTransacao: receita.data,
            status: 'pago',
            mes: mes,
            ano: ano
        };
    }
    
    converterDespesaParaAPI(despesa, mes, ano) {
        return {
            tipo: 'despesa',
            descricao: despesa.descricao,
            valor: parseFloat(despesa.valor),
            valorPago: parseFloat(despesa.valorPago || 0),
            categoriaId: this.encontrarCategoriaIdPorNome(despesa.categoria),
            formaPagamento: despesa.formaPagamento || 'pix',
            dataTransacao: despesa.dataCompra || despesa.data,
            dataVencimento: despesa.dataVencimento,
            status: despesa.quitado ? 'pago' : 'pendente',
            parcelamento: despesa.parcelado ? {
                total: despesa.totalParcelas || 1,
                atual: this.extrairParcelaAtual(despesa.parcela) || 1,
                grupoId: despesa.idGrupoParcelamento
            } : { total: 1, atual: 1, grupoId: null },
            observacoes: despesa.observacoes,
            mes: mes,
            ano: ano
        };
    }
    
    encontrarCategoriaIdPorNome(nomeCategoria) {
        // Por enquanto retorna um ID fixo, mas deveria buscar na lista de categorias
        const mapeamento = {
            'Alimentação': 1,
            'Transporte': 2,
            'Saúde': 3,
            'Lazer': 4,
            'Casa': 5,
            'Educação': 6,
            'Trabalho': 7,
            'Outros': 8
        };
        
        return mapeamento[nomeCategoria] || 8; // Default: Outros
    }
    
    extrairParcelaAtual(parcelaString) {
        if (!parcelaString || typeof parcelaString !== 'string') return 1;
        
        const match = parcelaString.match(/^(\d+)\/\d+$/);
        return match ? parseInt(match[1]) : 1;
    }
}

// ================================================================
// INICIALIZAÇÃO
// ================================================================

let apiClient = null;
let sistemaAdapter = null;

async function initializeAPISystem() {
    try {
        console.log('🚀 Inicializando sistema API...');
        
        apiClient = new APIClient();
        sistemaAdapter = new SistemaAdapter(apiClient);
        
        // Verificar se há token salvo
        if (apiClient.token) {
            try {
                await apiClient.verificarToken();
                console.log('✅ Token válido encontrado');
            } catch (error) {
                console.warn('⚠️ Token inválido, redirecionando...');
                apiClient.handleUnauthorized();
                return false;
            }
        }
        
        // Exportar para escopo global
        window.apiClient = apiClient;
        window.sistemaAdapter = sistemaAdapter;
        window.useAPI = true;
        
        console.log('✅ Sistema API inicializado!');
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao inicializar API:', error);
        window.useAPI = false;
        return false;
    }
}

// ================================================================
// INTERFACE DE COMPATIBILIDADE
// ================================================================

window.usuarioDados = {
    verificarAcesso: async () => {
        if (sistemaAdapter) {
            return await sistemaAdapter.verificarAcesso();
        }
        return false;
    },
    
    getUsuarioAtual: () => {
        if (apiClient) {
            return apiClient.usuarioAtual;
        }
        return null;
    },
    
    getDadosFinanceirosUsuario: async () => {
        if (sistemaAdapter) {
            return await sistemaAdapter.carregarDadosFinanceiros();
        }
        return {};
    },
    
    salvarDadosUsuario: async () => {
        // Não necessário com API
        return true;
    },
    
    adicionarReceita: async (mes, ano, receita) => {
        if (sistemaAdapter) {
            return await sistemaAdapter.salvarReceita(mes, ano, receita);
        }
        return false;
    },
    
    adicionarDespesa: async (mes, ano, despesa) => {
        if (sistemaAdapter) {
            return await sistemaAdapter.salvarDespesa(mes, ano, despesa);
        }
        return false;
    },
    
    excluirTransacao: async (id) => {
        if (apiClient) {
            return await apiClient.excluirTransacao(id);
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
        // Cache simples - limpar localStorage
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
        if (apiClient) {
            return {
                online: apiClient.isOnline,
                autenticado: !!apiClient.token,
                usuario: apiClient.usuarioAtual?.nome,
                baseURL: apiClient.baseURL
            };
        }
        return { erro: 'API não inicializada' };
    }
};

// ================================================================
// AUTO-INICIALIZAÇÃO
// ================================================================

document.addEventListener('DOMContentLoaded', async () => {
    setTimeout(async () => {
        try {
            const inicializado = await initializeAPISystem();
            
            if (inicializado && window.location.pathname.includes('index.html')) {
                const acessoValido = await window.usuarioDados.verificarAcesso();
                if (!acessoValido) {
                    console.log('❌ Acesso negado, redirecionando...');
                }
            }
            
        } catch (error) {
            console.error('❌ Erro na inicialização:', error);
        }
    }, 500);
});

window.APIClient = APIClient;
window.SistemaAdapter = SistemaAdapter;
window.initializeAPISystem = initializeAPISystem;

console.log('📦 API Client carregado e aguardando inicialização...');