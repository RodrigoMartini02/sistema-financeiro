// ================================================================
// API CLIENT - SISTEMA FINANCEIRO COMPLETO
// ================================================================

console.log('🚀 Carregando API Client...');

// Detecta se estamos em ambiente de desenvolvimento (local) ou produção (online)
const IS_DEVELOPMENT = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// URLs do backend para cada ambiente
const PROD_BASE_URL = 'https://sistema-financeiro-backend-c199.onrender.com/api';
const DEV_BASE_URL = 'http://localhost:5000/api';

// Define a URL correta a ser usada
const API_BASE_URL = IS_DEVELOPMENT ? DEV_BASE_URL : PROD_BASE_URL;

console.log(`Ambiente detectado: ${IS_DEVELOPMENT ? 'Desenvolvimento' : 'Produção'}. Usando API em: ${API_BASE_URL}`);


class APIClient {
    constructor(baseURL = API_BASE_URL) {
        this.baseURL = baseURL;
        this.token = localStorage.getItem('authToken');
        this.usuarioAtual = null;
        this.isOnline = true;
        
        // Cache para dados offline
        this.cache = {
            categorias: null,
            transacoes: new Map(),
            dashboard: new Map(),
            orcamentos: null,
            timestamp: null
        };
        
        this.configurarInterceptors();
        this.verificarConexao();
    }
    
    // ================================================================
    // CONFIGURAÇÃO E UTILITÁRIOS
    // ================================================================
    
    configurarInterceptors() {
        // Verificar conexão periodicamente
        setInterval(() => this.verificarConexao(), 30000);
        
        // Detectar mudanças na conexão
        window.addEventListener('online', () => {
            this.isOnline = true;
            console.log('✅ Conexão restaurada - sincronizando dados...');
            this.sincronizarDadosOffline();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('⚠️ Modo offline ativado');
        });
    }
    
    async verificarConexao() {
        try {
            const response = await fetch(`${this.baseURL}/health`, { 
                method: 'GET',
                timeout: 5000 
            });
            this.isOnline = response.ok;
        } catch (error) {
            this.isOnline = false;
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
        
        try {
            const response = await fetch(url, requestOptions);
            
            if (!response.ok) {
                if (response.status === 401) {
                    this.handleUnauthorized();
                    throw new Error('Token inválido ou expirado');
                }
                
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
            
            return await response.json();
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
    }
    
    // ================================================================
    // AUTENTICAÇÃO
    // ================================================================
    
    async login(documento, senha) {
        try {
            console.log('🔐 Fazendo login via API...');
            
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
                
                console.log('✅ Login bem-sucedido via API');
                return { success: true, token: this.token, usuario: response.usuario };
            }
            
            throw new Error('Token não recebido');
            
        } catch (error) {
            console.error('❌ Erro no login API:', error);
            throw error;
        }
    }
    
    async register(dadosUsuario) {
        try {
            console.log('📝 Registrando usuário via API...');
            
            const response = await this.makeRequest('/auth/register', {
                method: 'POST',
                body: JSON.stringify(dadosUsuario)
            });
            
            console.log('✅ Usuário registrado via API');
            return response;
            
        } catch (error) {
            console.error('❌ Erro no registro API:', error);
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
        this.limparCache();
    }
    
    // ================================================================
    // CATEGORIAS
    // ================================================================
    
    async getCategorias() {
        try {
            if (this.cache.categorias && this.isCacheValido()) {
                return this.cache.categorias;
            }
            
            const response = await this.makeRequest('/categorias');
            this.cache.categorias = response;
            this.cache.timestamp = Date.now();
            
            return response;
        } catch (error) {
            console.error('Erro ao buscar categorias:', error);
            throw error;
        }
    }
    
    async criarCategoria(categoria) {
        try {
            const response = await this.makeRequest('/categorias', {
                method: 'POST',
                body: JSON.stringify(categoria)
            });
            
            // Invalidar cache
            this.cache.categorias = null;
            
            return response;
        } catch (error) {
            console.error('Erro ao criar categoria:', error);
            throw error;
        }
    }
    
    async atualizarCategoria(id, categoria) {
        try {
            const response = await this.makeRequest(`/categorias/${id}`, {
                method: 'PUT',
                body: JSON.stringify(categoria)
            });
            
            this.cache.categorias = null;
            return response;
        } catch (error) {
            console.error('Erro ao atualizar categoria:', error);
            throw error;
        }
    }
    
    async excluirCategoria(id) {
        try {
            const response = await this.makeRequest(`/categorias/${id}`, {
                method: 'DELETE'
            });
            
            this.cache.categorias = null;
            return response;
        } catch (error) {
            console.error('Erro ao excluir categoria:', error);
            throw error;
        }
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
            
            const response = await this.makeRequest(endpoint);
            return response;
        } catch (error) {
            console.error('Erro ao buscar transações:', error);
            throw error;
        }
    }
    
    async criarTransacao(transacao) {
        try {
            console.log('💰 Criando transação via API...', transacao.tipo);
            
            const response = await this.makeRequest('/transacoes', {
                method: 'POST',
                body: JSON.stringify(transacao)
            });
            
            // Invalidar caches relacionados
            this.invalidarCachesTransacoes();
            
            return response;
        } catch (error) {
            console.error('Erro ao criar transação:', error);
            throw error;
        }
    }
    
    async atualizarTransacao(id, transacao) {
        try {
            const response = await this.makeRequest(`/transacoes/${id}`, {
                method: 'PUT',
                body: JSON.stringify(transacao)
            });
            
            this.invalidarCachesTransacoes();
            return response;
        } catch (error) {
            console.error('Erro ao atualizar transação:', error);
            throw error;
        }
    }
    
    async excluirTransacao(id) {
        try {
            const response = await this.makeRequest(`/transacoes/${id}`, {
                method: 'DELETE'
            });
            
            this.invalidarCachesTransacoes();
            return response;
        } catch (error) {
            console.error('Erro ao excluir transação:', error);
            throw error;
        }
    }
    
    async marcarTransacaoComoPaga(id, valorPago) {
        try {
            const response = await this.makeRequest(`/transacoes/${id}/pagar`, {
                method: 'PATCH',
                body: JSON.stringify({ valorPago })
            });
            
            this.invalidarCachesTransacoes();
            return response;
        } catch (error) {
            console.error('Erro ao marcar transação como paga:', error);
            throw error;
        }
    }
    
    // ================================================================
    // DASHBOARD
    // ================================================================
    
    async getDashboardData(ano) {
        try {
            const cacheKey = `dashboard_${ano}`;
            
            if (this.cache.dashboard.has(cacheKey) && this.isCacheValido()) {
                return this.cache.dashboard.get(cacheKey);
            }
            
            const response = await this.makeRequest(`/dashboard/${ano}`);
            
            this.cache.dashboard.set(cacheKey, response);
            this.cache.timestamp = Date.now();
            
            return response;
        } catch (error) {
            console.error('Erro ao buscar dados do dashboard:', error);
            throw error;
        }
    }
    
    async getDashboardResumo() {
        try {
            const response = await this.makeRequest('/dashboard/resumo');
            return response;
        } catch (error) {
            console.error('Erro ao buscar resumo do dashboard:', error);
            throw error;
        }
    }
    
    // ================================================================
    // ORÇAMENTOS
    // ================================================================
    
    async getOrcamentos(filtros = {}) {
        try {
            const params = new URLSearchParams();
            Object.entries(filtros).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    params.append(key, value);
                }
            });
            
            const queryString = params.toString();
            const endpoint = `/orcamentos${queryString ? '?' + queryString : ''}`;
            
            const response = await this.makeRequest(endpoint);
            return response;
        } catch (error) {
            console.error('Erro ao buscar orçamentos:', error);
            throw error;
        }
    }
    
    async criarOrcamento(orcamento) {
        try {
            const response = await this.makeRequest('/orcamentos', {
                method: 'POST',
                body: JSON.stringify(orcamento)
            });
            
            this.cache.orcamentos = null;
            return response;
        } catch (error) {
            console.error('Erro ao criar orçamento:', error);
            throw error;
        }
    }
    
    async atualizarOrcamento(id, orcamento) {
        try {
            const response = await this.makeRequest(`/orcamentos/${id}`, {
                method: 'PUT',
                body: JSON.stringify(orcamento)
            });
            
            this.cache.orcamentos = null;
            return response;
        } catch (error) {
            console.error('Erro ao atualizar orçamento:', error);
            throw error;
        }
    }
    
    async excluirOrcamento(id) {
        try {
            const response = await this.makeRequest(`/orcamentos/${id}`, {
                method: 'DELETE'
            });
            
            this.cache.orcamentos = null;
            return response;
        } catch (error) {
            console.error('Erro ao excluir orçamento:', error);
            throw error;
        }
    }
    
    // ================================================================
    // RELATÓRIOS
    // ================================================================
    
    async getRelatorioGastos(filtros) {
        try {
            const params = new URLSearchParams();
            Object.entries(filtros).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    params.append(key, value);
                }
            });
            
            const response = await this.makeRequest(`/relatorios/gastos?${params.toString()}`);
            return response;
        } catch (error) {
            console.error('Erro ao buscar relatório de gastos:', error);
            throw error;
        }
    }
    
    // ================================================================
    // UTILITÁRIOS DE CACHE
    // ================================================================
    
    invalidarCachesTransacoes() {
        this.cache.transacoes.clear();
        this.cache.dashboard.clear();
        this.cache.orcamentos = null;
    }
    
    isCacheValido() {
        if (!this.cache.timestamp) return false;
        const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
        return (Date.now() - this.cache.timestamp) < CACHE_DURATION;
    }
    
    limparCache() {
        this.cache.categorias = null;
        this.cache.transacoes.clear();
        this.cache.dashboard.clear();
        this.cache.orcamentos = null;
        this.cache.timestamp = null;
    }
    
    // ================================================================
    // SINCRONIZAÇÃO OFFLINE
    // ================================================================
    
    async sincronizarDadosOffline() {
        // Implementar sincronização quando voltar online
        console.log('🔄 Sincronizando dados offline... (implementar se necessário)');
    }
    
    // ================================================================
    // STATUS E DIAGNÓSTICO
    // ================================================================
    
    getStatus() {
        return {
            online: this.isOnline,
            autenticado: !!this.token,
            usuario: this.usuarioAtual?.nome,
            cacheValido: this.isCacheValido(),
            baseURL: this.baseURL
        };
    }
}

// ================================================================
// SISTEMA ADAPTER - CONVERTE DADOS ENTRE FRONTEND/BACKEND
// ================================================================

class SistemaAdapter {
    constructor(apiClient) {
        this.api = apiClient;
        this.useLocalStorage = false;
    }
    
    // ================================================================
    // VERIFICAÇÃO DE ACESSO
    // ================================================================
    
    async verificarAcesso() {
        try {
            if (this.api.token) {
                await this.api.verificarToken();
                return true;
            }
            
            // Verificar se há usuário no sessionStorage
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
        if (window.location.pathname.includes('index.html')) {
            window.location.href = 'login.html';
        }
    }
    
    // ================================================================
    // DADOS FINANCEIROS - CONVERSÃO PRINCIPAL
    // ================================================================
    
    async carregarDadosFinanceiros() {
        try {
            console.log('📊 Carregando dados financeiros via API...');
            
            // Buscar transações de vários períodos
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
                
                // Buscar transações do ano
                try {
                    const transacoes = await this.api.getTransacoes({ ano, limit: 1000 });
                    this.organizarTransacoesPorMes(transacoes.transacoes || [], dadosFinanceiros[ano]);
                } catch (error) {
                    console.warn(`⚠️ Erro ao carregar dados de ${ano}:`, error);
                }
            }
            
            console.log('✅ Dados financeiros carregados da API');
            return dadosFinanceiros;
            
        } catch (error) {
            console.error('❌ Erro ao carregar dados financeiros:', error);
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
            observacoes: transacao.observacoes,
            metadados: transacao.metadados
        };
    }
    
    converterTransacaoLocalParaAPI(transacao, mes, ano, tipo) {
        return {
            tipo: tipo,
            descricao: transacao.descricao,
            valor: parseFloat(transacao.valor),
            valorPago: parseFloat(transacao.valorPago || 0),
            categoriaId: transacao.categoriaId || this.encontrarCategoriaIdPorNome(transacao.categoria),
            formaPagamento: transacao.formaPagamento || 'pix',
            dataTransacao: transacao.dataCompra || transacao.data,
            dataVencimento: transacao.dataVencimento,
            status: transacao.quitado ? 'pago' : 'pendente',
            parcelamento: transacao.parcelado ? {
                total: transacao.totalParcelas || 1,
                atual: this.extrairParcelaAtual(transacao.parcela) || 1,
                grupoId: transacao.idGrupoParcelamento
            } : { total: 1, atual: 1, grupoId: null },
            observacoes: transacao.observacoes,
            mes: mes,
            ano: ano
        };
    }
    
    // ================================================================
    // SALVAR DADOS FINANCEIROS
    // ================================================================
    
    async salvarDadosUsuario(dadosFinanceiros) {
        try {
            console.log('💾 Salvando dados financeiros via API...');
            
            // Não precisamos salvar tudo de uma vez
            // As transações já são salvas individualmente
            
            return true;
        } catch (error) {
            console.error('❌ Erro ao salvar dados:', error);
            throw error;
        }
    }
    
    // ================================================================
    // RECEITAS - ADAPTAÇÃO PARA O FRONTEND
    // ================================================================
    
    async salvarReceita(mes, ano, receita) {
        try {
            console.log('💰 Salvando receita via API...', receita.descricao);
            
            const transacaoAPI = this.converterTransacaoLocalParaAPI(receita, mes, ano, 'receita');
            const resultado = await this.api.criarTransacao(transacaoAPI);
            
            console.log('✅ Receita salva com sucesso');
            return resultado;
        } catch (error) {
            console.error('❌ Erro ao salvar receita:', error);
            throw error;
        }
    }
    
    // ================================================================
    // DESPESAS - ADAPTAÇÃO PARA O FRONTEND
    // ================================================================
    
    async salvarDespesa(mes, ano, despesa) {
        try {
            console.log('💸 Salvando despesa via API...', despesa.descricao);
            
            const transacaoAPI = this.converterTransacaoLocalParaAPI(despesa, mes, ano, 'despesa');
            const resultado = await this.api.criarTransacao(transacaoAPI);
            
            console.log('✅ Despesa salva com sucesso');
            return resultado;
        } catch (error) {
            console.error('❌ Erro ao salvar despesa:', error);
            throw error;
        }
    }
    
    // ================================================================
    // CATEGORIAS - ADAPTAÇÃO PARA O FRONTEND
    // ================================================================
    
    async salvarCategoria(categoria) {
        try {
            console.log('🏷️ Salvando categoria via API...', categoria.nome);
            
            const resultado = await this.api.criarCategoria({
                nome: categoria.nome,
                cor: categoria.cor || '#3498db',
                icone: categoria.icone || 'fas fa-tag'
            });
            
            // Invalidar cache de categorias
            this.api.cache.categorias = null;
            
            console.log('✅ Categoria salva com sucesso');
            return resultado;
        } catch (error) {
            console.error('❌ Erro ao salvar categoria:', error);
            throw error;
        }
    }
    
    async excluirCategoria(categoriaId) {
        try {
            const resultado = await this.api.excluirCategoria(categoriaId);
            
            // Invalidar cache
            this.api.cache.categorias = null;
            
            return resultado;
        } catch (error) {
            console.error('❌ Erro ao excluir categoria:', error);
            throw error;
        }
    }
    
    // ================================================================
    // DASHBOARD - ADAPTAÇÃO PARA O FRONTEND
    // ================================================================
    
    async getDashboardData(ano) {
        try {
            console.log('📊 Carregando dashboard via API para', ano);
            
            const dashboardData = await this.api.getDashboardData(ano);
            
            // Converter para formato esperado pelo frontend
            return {
                ano: dashboardData.ano,
                totalReceitas: dashboardData.resumo.totalReceitas,
                totalDespesas: dashboardData.resumo.totalDespesas,
                saldo: dashboardData.resumo.saldoTotal,
                totalJuros: dashboardData.resumo.totalJuros || 0,
                resumoMensal: dashboardData.resumoMensal,
                gastosPorCategoria: dashboardData.gastosPorCategoria,
                transacoesRecentes: dashboardData.transacoesRecentes,
                contasPendentes: dashboardData.contasPendentes,
                estatisticas: dashboardData.estatisticas
            };
        } catch (error) {
            console.error('❌ Erro ao carregar dashboard:', error);
            throw error;
        }
    }
    
    // ================================================================
    // ORÇAMENTOS - ADAPTAÇÃO PARA O FRONTEND
    // ================================================================
    
    async getOrcamentos(mes, ano) {
        try {
            const filtros = {};
            if (mes !== undefined) filtros.mes = mes;
            if (ano) filtros.ano = ano;
            
            const orcamentos = await this.api.getOrcamentos(filtros);
            
            // Converter para formato esperado pelo frontend
            return orcamentos.map(orc => ({
                id: orc.id,
                categoriaId: orc.categoriaId,
                categoria: orc.categoria?.nome,
                valorLimite: parseFloat(orc.valorLimite),
                gastoRealizado: parseFloat(orc.gastoRealizado || 0),
                percentualUsado: orc.percentualUsado || 0,
                saldoRestante: orc.saldoRestante || 0,
                status: orc.status,
                mes: orc.mes,
                ano: orc.ano
            }));
        } catch (error) {
            console.error('❌ Erro ao carregar orçamentos:', error);
            throw error;
        }
    }
    
    async salvarOrcamento(orcamento) {
        try {
            const dadosOrcamento = {
                categoriaId: orcamento.categoriaId,
                valorLimite: parseFloat(orcamento.valorLimite),
                mes: orcamento.mes,
                ano: orcamento.ano
            };
            
            const resultado = await this.api.criarOrcamento(dadosOrcamento);
            return resultado;
        } catch (error) {
            console.error('❌ Erro ao salvar orçamento:', error);
            throw error;
        }
    }
    
    // ================================================================
    // UTILITÁRIOS DE CONVERSÃO
    // ================================================================
    
    encontrarCategoriaIdPorNome(nomeCategoria) {
        if (!this.api.cache.categorias) return null;
        
        const categoria = this.api.cache.categorias.find(cat => cat.nome === nomeCategoria);
        return categoria ? categoria.id : null;
    }
    
    extrairParcelaAtual(parcelaString) {
        if (!parcelaString || typeof parcelaString !== 'string') return 1;
        
        const match = parcelaString.match(/^(\d+)\/\d+$/);
        return match ? parseInt(match[1]) : 1;
    }
    
    // ================================================================
    // COMPATIBILIDADE COM SISTEMA ATUAL
    // ================================================================
    
    async getUsuarioAtual() {
        if (this.api.usuarioAtual) {
            return this.api.usuarioAtual;
        }
        
        try {
            return await this.api.verificarToken();
        } catch (error) {
            return null;
        }
    }
    
    async recarregarDados() {
        this.api.limparCache();
        return await this.carregarDadosFinanceiros();
    }
    
    getStatus() {
        return this.api.getStatus();
    }
}

// ================================================================
// INICIALIZAÇÃO E CONFIGURAÇÃO GLOBAL
// ================================================================

let apiClient = null;
let sistemaAdapter = null;

// Função de inicialização
async function initializeAPISystem() {
    try {
        console.log('🚀 Inicializando sistema API...');
        
        // Criar instâncias
        apiClient = new APIClient();
        sistemaAdapter = new SistemaAdapter(apiClient);
        
        // Verificar se há token salvo
        if (apiClient.token) {
            try {
                await apiClient.verificarToken();
                console.log('✅ Token válido encontrado');
            } catch (error) {
                console.warn('⚠️ Token inválido, usuário precisa fazer login');
            }
        }
        
        // Verificar conexão com backend
        try {
            await apiClient.verificarConexao();
            console.log(`✅ Conexão com backend: ${apiClient.isOnline ? 'ONLINE' : 'OFFLINE'}`);
        } catch (error) {
            console.warn('⚠️ Backend não está respondendo, modo offline ativado');
        }
        
        // Exportar para escopo global
        window.apiClient = apiClient;
        window.sistemaAdapter = sistemaAdapter;
        window.useAPI = true;
        
        console.log('✅ Sistema API inicializado com sucesso!');
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao inicializar sistema API:', error);
        
        // Fallback: desabilitar API
        window.useAPI = false;
        return false;
    }
}

// ================================================================
// INTERFACE DE COMPATIBILIDADE PARA O SISTEMA ATUAL
// ================================================================

// Compatibilidade com usuario-dados.js
window.usuarioDados = {
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
    
    executarMigracoes: () => {
        // Não necessário com API
        return true;
    },
    
    // Métodos de transação
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
    
    // Métodos utilitários
    recarregarDados: async () => {
        if (sistemaAdapter) {
            return await sistemaAdapter.recarregarDados();
        }
        return {};
    },
    
    limparCache: () => {
        if (apiClient) {
            apiClient.limparCache();
        }
    },
    
    diagnostico: () => {
        if (apiClient) {
            return apiClient.getStatus();
        }
        return { erro: 'API não inicializada' };
    },
    
    getStatus: () => {
        if (sistemaAdapter) {
            return sistemaAdapter.getStatus();
        }
        return { erro: 'Sistema não inicializado' };
    }
};

// ================================================================
// AUTO-INICIALIZAÇÃO
// ================================================================

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', async () => {
    // Aguardar um pouco para garantir que outros scripts carregaram
    setTimeout(async () => {
        try {
            await initializeAPISystem();
            
            // Verificar se estamos na página principal e se o usuário está logado
            if (window.location.pathname.includes('index.html')) {
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

// ================================================================
// EXPORTAÇÕES GLOBAIS
// ================================================================

window.APIClient = APIClient;
window.SistemaAdapter = SistemaAdapter;
window.initializeAPISystem = initializeAPISystem;

// Log de carregamento
console.log('📦 API Client carregado - aguardando inicialização...');