// ================================================================
// SISTEMA DE GERENCIAMENTO DE USUÁRIOS E DADOS
// VERSÃO INTEGRADA COM API + FALLBACK LOCALSTORAGE
// ================================================================

class UsuarioDataManager {
    constructor() {
        this.apiClient = null;
        this.sistemaAdapter = null;
        this.useAPI = false;
        this.dadosCache = null;
        this.usuarioAtualCache = null;
        
        this.initializeSystem();
    }

    // ================================================================
    // INICIALIZAÇÃO DO SISTEMA
    // ================================================================
    
    async initializeSystem() {
        // Aguardar API estar disponível
        setTimeout(() => {
            this.checkAPIAvailability();
        }, 100);
    }

    checkAPIAvailability() {
        if (typeof window.apiClient !== 'undefined' && typeof window.sistemaAdapter !== 'undefined') {
            this.apiClient = window.apiClient;
            this.sistemaAdapter = window.sistemaAdapter;
            this.useAPI = true;
            console.log('✅ UsuarioDataManager: API inicializada');
        } else {
            console.warn('⚠️ UsuarioDataManager: Usando localStorage (fallback)');
            this.useAPI = false;
        }
    }

    // ================================================================
    // VERIFICAÇÃO DE ACESSO
    // ================================================================
    
    async verificarAcesso() {
        if (this.useAPI && this.apiClient) {
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    this.redirecionarParaLogin();
                    return false;
                }
                
                await this.apiClient.verificarToken();
                return true;
            } catch (error) {
                console.error('❌ Token inválido:', error);
                this.redirecionarParaLogin();
                return false;
            }
        }
        
        // Fallback para verificação local
        const usuarioAtual = sessionStorage.getItem('usuarioAtual');
        if (!usuarioAtual) {
            this.redirecionarParaLogin();
            return false;
        }
        
        return true;
    }

    redirecionarParaLogin() {
        if (window.location.pathname.includes('index.html') || 
            window.location.pathname.includes('financeiro.html')) {
            console.log('❌ Redirecionando para login...');
            window.location.href = 'login.html';
        }
    }

    // ================================================================
    // GERENCIAMENTO DE USUÁRIO ATUAL
    // ================================================================
    
    getUsuarioAtual() {
        // Retornar cache se disponível
        if (this.usuarioAtualCache) {
            return this.usuarioAtualCache;
        }

        if (this.useAPI && this.apiClient && this.apiClient.usuarioAtual) {
            this.usuarioAtualCache = this.apiClient.usuarioAtual;
            return this.usuarioAtualCache;
        }

        // Fallback para dados locais
        const dadosSessao = sessionStorage.getItem('dadosUsuarioLogado');
        if (dadosSessao) {
            try {
                this.usuarioAtualCache = JSON.parse(dadosSessao);
                return this.usuarioAtualCache;
            } catch (error) {
                console.error('Erro ao parse dos dados do usuário:', error);
            }
        }

        // Buscar nos dados locais
        const documentoLogado = sessionStorage.getItem('usuarioAtual');
        if (documentoLogado) {
            const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
            const usuario = usuarios.find(u => 
                u.documento && u.documento.replace(/[^\d]+/g, '') === documentoLogado
            );
            
            if (usuario) {
                this.usuarioAtualCache = usuario;
                sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(usuario));
                return usuario;
            }
        }

        return null;
    }

    async atualizarUsuarioAtual(dadosAtualizados) {
        if (this.useAPI && this.apiClient) {
            try {
                // Atualizar via API (implementar endpoint se necessário)
                console.log('📝 Atualizando usuário via API...');
                this.usuarioAtualCache = { ...this.usuarioAtualCache, ...dadosAtualizados };
                sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(this.usuarioAtualCache));
                return true;
            } catch (error) {
                console.error('Erro ao atualizar usuário via API:', error);
            }
        }

        // Fallback para atualização local
        const documentoLogado = sessionStorage.getItem('usuarioAtual');
        if (documentoLogado) {
            const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
            const index = usuarios.findIndex(u => 
                u.documento && u.documento.replace(/[^\d]+/g, '') === documentoLogado
            );
            
            if (index !== -1) {
                usuarios[index] = { ...usuarios[index], ...dadosAtualizados };
                localStorage.setItem('usuarios', JSON.stringify(usuarios));
                
                this.usuarioAtualCache = usuarios[index];
                sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(usuarios[index]));
                return true;
            }
        }

        return false;
    }

    // ================================================================
    // GERENCIAMENTO DE DADOS FINANCEIROS
    // ================================================================
    
    async getDadosFinanceirosUsuario() {
        // Retornar cache se disponível e recente
        if (this.dadosCache && this.isCacheValido()) {
            return this.dadosCache;
        }

        if (this.useAPI && this.sistemaAdapter) {
            try {
                console.log('📊 Carregando dados financeiros da API...');
                const dados = await this.sistemaAdapter.carregarDadosFinanceiros();
                this.dadosCache = dados;
                this.timestampCache = Date.now();
                return dados;
            } catch (error) {
                console.error('Erro ao carregar dados da API:', error);
            }
        }

        // Fallback para dados locais
        return this.getDadosFinanceirosLocal();
    }

    getDadosFinanceirosLocal() {
        const usuarioAtual = sessionStorage.getItem('usuarioAtual');
        
        if (!usuarioAtual) {
            console.warn('Nenhum usuário logado');
            return {};
        }

        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const usuario = usuarios.find(u => 
            u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual
        );
        
        if (usuario) {
            if (!usuario.dadosFinanceiros) {
                usuario.dadosFinanceiros = this.criarEstruturaInicial();
                localStorage.setItem('usuarios', JSON.stringify(usuarios));
            }
            
            this.dadosCache = usuario.dadosFinanceiros;
            this.timestampCache = Date.now();
            return usuario.dadosFinanceiros;
        }

        return {};
    }

    async salvarDadosUsuario(dadosFinanceiros) {
        if (this.useAPI && this.sistemaAdapter) {
            try {
                console.log('💾 Salvando dados via API...');
                const sucesso = await this.sistemaAdapter.salvarDadosUsuario(dadosFinanceiros);
                if (sucesso) {
                    this.dadosCache = dadosFinanceiros;
                    this.timestampCache = Date.now();
                    return true;
                }
            } catch (error) {
                console.error('Erro ao salvar dados via API:', error);
            }
        }

        // Fallback para salvamento local
        return this.salvarDadosLocal(dadosFinanceiros);
    }

    salvarDadosLocal(dadosFinanceiros) {
        const usuarioAtual = sessionStorage.getItem('usuarioAtual');
        
        if (!usuarioAtual) {
            console.warn('Nenhum usuário logado para salvar dados');
            return false;
        }

        try {
            const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
            const index = usuarios.findIndex(u => 
                u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual
            );
            
            if (index !== -1) {
                usuarios[index].dadosFinanceiros = dadosFinanceiros;
                localStorage.setItem('usuarios', JSON.stringify(usuarios));
                
                this.dadosCache = dadosFinanceiros;
                this.timestampCache = Date.now();
                console.log('✅ Dados salvos localmente');
                return true;
            }
            
            console.warn('Usuário não encontrado para salvar dados');
            return false;
            
        } catch (error) {
            console.error('Erro ao salvar dados localmente:', error);
            return false;
        }
    }

    // ================================================================
    // GERENCIAMENTO DE TRANSAÇÕES VIA API
    // ================================================================
    
    async adicionarReceita(mes, ano, receita) {
        if (this.useAPI && this.sistemaAdapter) {
            try {
                console.log('💰 Adicionando receita via API...');
                return await this.sistemaAdapter.salvarReceita(mes, ano, receita);
            } catch (error) {
                console.error('Erro ao adicionar receita via API:', error);
            }
        }

        // Fallback para adição local
        return this.adicionarReceitaLocal(mes, ano, receita);
    }

    async adicionarDespesa(mes, ano, despesa) {
        if (this.useAPI && this.sistemaAdapter) {
            try {
                console.log('💸 Adicionando despesa via API...');
                return await this.sistemaAdapter.salvarDespesa(mes, ano, despesa);
            } catch (error) {
                console.error('Erro ao adicionar despesa via API:', error);
            }
        }

        // Fallback para adição local
        return this.adicionarDespesaLocal(mes, ano, despesa);
    }

    async excluirTransacao(id, tipo) {
        if (this.useAPI && this.sistemaAdapter) {
            try {
                console.log(`🗑️ Excluindo ${tipo} via API...`);
                return await this.sistemaAdapter.excluirTransacao(id);
            } catch (error) {
                console.error(`Erro ao excluir ${tipo} via API:`, error);
            }
        }

        // Fallback para exclusão local
        return this.excluirTransacaoLocal(id, tipo);
    }

    // ================================================================
    // OPERAÇÕES LOCAIS (FALLBACK)
    // ================================================================
    
    adicionarReceitaLocal(mes, ano, receita) {
        const dados = this.getDadosFinanceirosLocal();
        
        if (!dados[ano]) {
            dados[ano] = { meses: [] };
        }
        
        if (!dados[ano].meses[mes]) {
            dados[ano].meses[mes] = { receitas: [], despesas: [] };
        }
        
        receita.id = this.gerarId();
        dados[ano].meses[mes].receitas.push(receita);
        
        return this.salvarDadosLocal(dados);
    }

    adicionarDespesaLocal(mes, ano, despesa) {
        const dados = this.getDadosFinanceirosLocal();
        
        if (!dados[ano]) {
            dados[ano] = { meses: [] };
        }
        
        if (!dados[ano].meses[mes]) {
            dados[ano].meses[mes] = { receitas: [], despesas: [] };
        }
        
        despesa.id = this.gerarId();
        dados[ano].meses[mes].despesas.push(despesa);
        
        return this.salvarDadosLocal(dados);
    }

    excluirTransacaoLocal(id, tipo) {
        const dados = this.getDadosFinanceirosLocal();
        let encontrou = false;

        // Procurar em todos os anos e meses
        Object.keys(dados).forEach(ano => {
            if (dados[ano] && dados[ano].meses) {
                dados[ano].meses.forEach(mes => {
                    if (mes && mes[tipo + 's']) {
                        const index = mes[tipo + 's'].findIndex(item => item.id === id);
                        if (index !== -1) {
                            mes[tipo + 's'].splice(index, 1);
                            encontrou = true;
                        }
                    }
                });
            }
        });

        if (encontrou) {
            return this.salvarDadosLocal(dados);
        }

        return false;
    }

    // ================================================================
    // UTILIDADES
    // ================================================================
    
    criarEstruturaInicial() {
        const anoAtual = new Date().getFullYear();
        const estrutura = {};
        
        estrutura[anoAtual] = { meses: [] };
        for (let i = 0; i < 12; i++) {
            estrutura[anoAtual].meses[i] = {
                receitas: [],
                despesas: []
            };
        }
        
        return estrutura;
    }

    gerarId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    isCacheValido() {
        if (!this.timestampCache) return false;
        
        // Cache válido por 5 minutos
        const CACHE_DURATION = 5 * 60 * 1000;
        return (Date.now() - this.timestampCache) < CACHE_DURATION;
    }

    limparCache() {
        this.dadosCache = null;
        this.usuarioAtualCache = null;
        this.timestampCache = null;
    }

    // ================================================================
    // MIGRAÇÃO E COMPATIBILIDADE
    // ================================================================
    
    executarMigracoes() {
        if (!this.useAPI) {
            console.log('🔄 Executando migrações locais...');
            this.executarMigracoesLocais();
        }
        return true;
    }

    executarMigracoesLocais() {
        try {
            const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
            let necessitaAtualizacao = false;

            usuarios.forEach(usuario => {
                // Migração 1: Garantir estrutura de dados financeiros
                if (!usuario.dadosFinanceiros) {
                    usuario.dadosFinanceiros = this.criarEstruturaInicial();
                    necessitaAtualizacao = true;
                }

                // Migração 2: Adicionar IDs únicos às transações existentes
                if (usuario.dadosFinanceiros) {
                    Object.keys(usuario.dadosFinanceiros).forEach(ano => {
                        if (usuario.dadosFinanceiros[ano] && usuario.dadosFinanceiros[ano].meses) {
                            usuario.dadosFinanceiros[ano].meses.forEach(mes => {
                                if (mes) {
                                    // Receitas
                                    if (mes.receitas) {
                                        mes.receitas.forEach(receita => {
                                            if (!receita.id) {
                                                receita.id = this.gerarId();
                                                necessitaAtualizacao = true;
                                            }
                                        });
                                    }
                                    
                                    // Despesas
                                    if (mes.despesas) {
                                        mes.despesas.forEach(despesa => {
                                            if (!despesa.id) {
                                                despesa.id = this.gerarId();
                                                necessitaAtualizacao = true;
                                            }
                                        });
                                    }
                                }
                            });
                        }
                    });
                }
            });

            if (necessitaAtualizacao) {
                localStorage.setItem('usuarios', JSON.stringify(usuarios));
                console.log('✅ Migrações executadas com sucesso');
            }

        } catch (error) {
            console.error('❌ Erro durante migração:', error);
        }
    }

    // ================================================================
    // MÉTODOS DE DIAGNÓSTICO
    // ================================================================
    
    diagnosticoSistema() {
        const diagnostico = {
            timestamp: new Date().toISOString(),
            useAPI: this.useAPI,
            apiDisponivel: !!this.apiClient,
            sistemaAdapterDisponivel: !!this.sistemaAdapter,
            usuarioLogado: !!this.getUsuarioAtual(),
            cacheValido: this.isCacheValido(),
            localStorage: this.testLocalStorage()
        };

        console.log('🔍 Diagnóstico do Sistema:', diagnostico);
        return diagnostico;
    }

    testLocalStorage() {
        try {
            const testKey = '__test_storage_' + Date.now();
            localStorage.setItem(testKey, 'test');
            const retrieved = localStorage.getItem(testKey);
            localStorage.removeItem(testKey);
            return retrieved === 'test';
        } catch (error) {
            return false;
        }
    }

    // ================================================================
    // MÉTODOS PÚBLICOS PARA COMPATIBILIDADE
    // ================================================================
    
    async recarregarDados() {
        this.limparCache();
        return await this.getDadosFinanceirosUsuario();
    }

    getStatusConexao() {
        return {
            api: this.useAPI && !!this.apiClient,
            localStorage: this.testLocalStorage(),
            modo: this.useAPI ? 'API' : 'LocalStorage'
        };
    }
}

// ================================================================
// INSTÂNCIA GLOBAL E INICIALIZAÇÃO
// ================================================================

// Criar instância global
const usuarioDataManager = new UsuarioDataManager();

// Aguardar DOM e sistemas estarem prontos
document.addEventListener('DOMContentLoaded', () => {
    // Aguardar um pouco para API estar disponível
    setTimeout(() => {
        usuarioDataManager.checkAPIAvailability();
        console.log('✅ UsuarioDataManager inicializado');
    }, 200);
});

// ================================================================
// INTERFACE PÚBLICA PARA COMPATIBILIDADE
// ================================================================

window.usuarioDados = {
    // Métodos principais
    verificarAcesso: () => usuarioDataManager.verificarAcesso(),
    getUsuarioAtual: () => usuarioDataManager.getUsuarioAtual(),
    getDadosFinanceirosUsuario: () => usuarioDataManager.getDadosFinanceirosUsuario(),
    salvarDadosUsuario: (dados) => usuarioDataManager.salvarDadosUsuario(dados),
    executarMigracoes: () => usuarioDataManager.executarMigracoes(),
    
    // Métodos de transação
    adicionarReceita: (mes, ano, receita) => usuarioDataManager.adicionarReceita(mes, ano, receita),
    adicionarDespesa: (mes, ano, despesa) => usuarioDataManager.adicionarDespesa(mes, ano, despesa),
    excluirTransacao: (id, tipo) => usuarioDataManager.excluirTransacao(id, tipo),
    
    // Métodos utilitários
    recarregarDados: () => usuarioDataManager.recarregarDados(),
    limparCache: () => usuarioDataManager.limparCache(),
    diagnostico: () => usuarioDataManager.diagnosticoSistema(),
    getStatus: () => usuarioDataManager.getStatusConexao(),
    
    // Atualização de usuário
    atualizarUsuario: (dados) => usuarioDataManager.atualizarUsuarioAtual(dados)
};

// Exportar para compatibilidade
window.UsuarioDataManager = UsuarioDataManager;

// Log de inicialização
console.log('🚀 Sistema UsuarioDados carregado com suporte à API + LocalStorage');