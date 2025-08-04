// ================================================================
// SISTEMA DE GERENCIAMENTO DE DADOS - API-FIRST
// ================================================================

class UsuarioDataManager {
    constructor() {
        this.apiClient = null;
        this.sistemaAdapter = null;
        this.useAPI = false;
        
        this.initializeSystem();
    }

    initializeSystem() {
        if (typeof window.apiClient !== 'undefined' && typeof window.sistemaAdapter !== 'undefined') {
            this.apiClient = window.apiClient;
            this.sistemaAdapter = window.sistemaAdapter;
            this.useAPI = true;
            console.log('✅ UsuarioDataManager: API inicializada com sucesso.');
        } else {
            console.error('❌ UsuarioDataManager: API Client ou SistemaAdapter não foram encontrados. O sistema não funcionará online.');
            this.useAPI = false;
        }
    }

    // ================================================================
    // VERIFICAÇÃO DE ACESSO
    // ================================================================
    
    async verificarAcesso() {
        if (!this.useAPI) {
            this.redirecionarParaLogin();
            return false;
        }
        
        try {
            const token = this.apiClient.token || localStorage.getItem('authToken');
            if (!token) {
                this.redirecionarParaLogin();
                return false;
            }
            await this.apiClient.verificarToken();
            return true;
        } catch (error) {
            console.error('❌ Verificação de acesso falhou, token inválido:', error);
            this.redirecionarParaLogin();
            return false;
        }
    }

    redirecionarParaLogin() {
        const path = window.location.pathname;
        if (path.includes('index.html') || path.includes('financeiro.html') || path === '/') {
            window.location.href = 'login.html';
        }
    }

    // ================================================================
    // GERENCIAMENTO DE DADOS (AGORA 100% VIA API)
    // ================================================================
    
    getUsuarioAtual() {
        if (this.useAPI && this.apiClient) {
            return this.apiClient.usuarioAtual;
        }
        return null;
    }

    async getDadosFinanceirosUsuario() {
        if (this.useAPI && this.sistemaAdapter) {
            // A responsabilidade de carregar os dados agora é do sistemaAdapter
            return await this.sistemaAdapter.carregarDadosFinanceiros();
        }
        // Se a API não estiver disponível, retorna um objeto vazio para não quebrar a interface
        return {};
    }

    async salvarDadosUsuario(dadosFinanceiros) {
        if (this.useAPI) {
            // Esta função se torna obsoleta no modelo API,
            // pois cada transação é salva individualmente.
            console.warn('Deprecation Warning: salvarDadosUsuario não deve ser usado em modo API. As transações são salvas individualmente.');
            return Promise.resolve(true);
        }
        return false; // Não há salvamento local neste modelo
    }

    // ================================================================
    // MÉTODOS DE TRANSAÇÃO (WRAPPERS PARA O ADAPTER)
    // ================================================================
    
    async adicionarReceita(mes, ano, receita) {
        if (!this.useAPI) throw new Error("API não disponível.");
        return await this.sistemaAdapter.salvarReceita(mes, ano, receita);
    }

    async adicionarDespesa(mes, ano, despesa) {
        if (!this.useAPI) throw new Error("API não disponível.");
        return await this.sistemaAdapter.salvarDespesa(mes, ano, despesa);
    }

    async excluirTransacao(id, tipo) {
        if (!this.useAPI) throw new Error("API não disponível.");
        // A API de exclusão provavelmente só precisa do ID, o tipo é para o fallback antigo
        return await this.apiClient.excluirTransacao(id);
    }
    
    // ================================================================
    // UTILIDADES
    // ================================================================
    
    async recarregarDados() {
        if(this.sistemaAdapter) {
            this.sistemaAdapter.api.limparCache();
        }
        return await this.getDadosFinanceirosUsuario();
    }

    limparCache() {
         if(this.sistemaAdapter) {
            this.sistemaAdapter.api.limparCache();
        }
    }
}

// ================================================================
// INSTÂNCIA GLOBAL E INTERFACE DE COMPATIBILIDADE
// ================================================================

const usuarioDataManager = new UsuarioDataManager();

window.usuarioDados = {
    verificarAcesso: () => usuarioDataManager.verificarAcesso(),
    getUsuarioAtual: () => usuarioDataManager.getUsuarioAtual(),
    getDadosFinanceirosUsuario: () => usuarioDataManager.getDadosFinanceirosUsuario(),
    salvarDadosUsuario: (dados) => usuarioDataManager.salvarDadosUsuario(dados),
    
    adicionarReceita: (mes, ano, receita) => usuarioDataManager.adicionarReceita(mes, ano, receita),
    adicionarDespesa: (mes, ano, despesa) => usuarioDataManager.adicionarDespesa(mes, ano, despesa),
    excluirTransacao: (id, tipo) => usuarioDataManager.excluirTransacao(id, tipo),
    
    recarregarDados: () => usuarioDataManager.recarregarDados(),
    limparCache: () => usuarioDataManager.limparCache(),
    
    // Funções obsoletas no modo API, mas mantidas por compatibilidade
    executarMigracoes: () => true 
};