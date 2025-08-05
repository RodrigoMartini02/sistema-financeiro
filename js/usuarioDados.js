// ================================================================
// SISTEMA DE GERENCIAMENTO DE USUÁRIOS E DADOS
// VERSÃO INTEGRADA COM API + FALLBACK LOCALSTORAGE - CORRIGIDA
// ================================================================

class UsuarioDataManager {
    constructor() {
        this.apiClient = null;
        this.sistemaAdapter = null;
        this.useAPI = false;
        this.dadosCache = null;
        this.usuarioAtualCache = null;
        this.timestampCache = null;
        this.inicializado = false;
        
        // Aguardar main.js estar pronto antes de inicializar
        this.aguardarSistemaMainPronto();
    }

    // ================================================================
    // INICIALIZAÇÃO CONTROLADA
    // ================================================================
    
    async aguardarSistemaMainPronto() {
        let tentativas = 0;
        const maxTentativas = 50; // 10 segundos
        
        const verificarMain = () => {
            tentativas++;
            
            if (window.sistemaInicializado === true) {
                console.log('✅ UsuarioDataManager: main.js pronto, inicializando...');
                this.initializeSystem();
            } else if (tentativas >= maxTentativas) {
                console.warn('⚠️ UsuarioDataManager: timeout aguardando main.js, inicializando mesmo assim...');
                this.initializeSystem();
            } else {
                console.log(`⏳ UsuarioDataManager aguardando main.js... ${tentativas}/${maxTentativas}`);
                setTimeout(verificarMain, 200);
            }
        };
        
        verificarMain();
    }

    async initializeSystem() {
        try {
            console.log('🚀 Inicializando UsuarioDataManager...');
            
            // Aguardar APIs estarem disponíveis
            await this.aguardarAPIDisponivel();
            
            // Verificar disponibilidade da API
            this.checkAPIAvailability();
            
            // Executar migrações se necessário
            if (!this.useAPI) {
                this.executarMigracoes();
            }
            
            this.inicializado = true;
            console.log('✅ UsuarioDataManager inicializado:', {
                useAPI: this.useAPI,
                apiClient: !!this.apiClient,
                sistemaAdapter: !!this.sistemaAdapter
            });
            
        } catch (error) {
            console.error('❌ Erro na inicialização do UsuarioDataManager:', error);
            this.useAPI = false;
            this.inicializado = true;
        }
    }

    async aguardarAPIDisponivel() {
        return new Promise((resolve) => {
            let tentativas = 0;
            const maxTentativas = 25; // 5 segundos
            
            const verificar = () => {
                tentativas++;
                
                if (window.apiClient && window.sistemaAdapter) {
                    resolve(true);
                } else if (tentativas >= maxTentativas) {
                    console.warn('⚠️ UsuarioDataManager: API não encontrada após aguardar');
                    resolve(false);
                } else {
                    setTimeout(verificar, 200);
                }
            };
            
            verificar();
        });
    }

    checkAPIAvailability() {
        if (window.apiClient && window.sistemaAdapter && 
            typeof window.apiClient.verificarToken === 'function' &&
            typeof window.sistemaAdapter.carregarDadosFinanceiros === 'function') {
            
            this.apiClient = window.apiClient;
            this.sistemaAdapter = window.sistemaAdapter;
            this.useAPI = true;
            console.log('✅ UsuarioDataManager: API configurada com sucesso');
        } else {
            console.warn('⚠️ UsuarioDataManager: API incompleta, usando localStorage');
            this.useAPI = false;
            this.apiClient = null;
            this.sistemaAdapter = null;
        }
    }

    // ================================================================
    // VERIFICAÇÃO DE ACESSO
    // ================================================================
    
    async verificarAcesso() {
        if (!this.inicializado) {
            console.log('⏳ Aguardando inicialização...');
            await this.aguardarInicializacao();
        }

        if (this.useAPI && this.apiClient) {
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    console.log('❌ Token não encontrado');
                    this.redirecionarParaLogin();
                    return false;
                }
                
                await this.apiClient.verificarToken();
                console.log('✅ Token válido (UsuarioDataManager)');
                return true;
            } catch (error) {
                console.error('❌ Token inválido (UsuarioDataManager):', error);
                this.redirecionarParaLogin();
                return false;
            }
        }
        
        // Fallback para verificação local
        const usuarioAtual = sessionStorage.getItem('usuarioAtual');
        if (!usuarioAtual) {
            console.log('❌ Usuário não logado (UsuarioDataManager)');
            this.redirecionarParaLogin();
            return false;
        }
        
        console.log('✅ Acesso verificado localmente (UsuarioDataManager)');
        return true;
    }

    async aguardarInicializacao() {
        let tentativas = 0;
        const maxTentativas = 25;
        
        while (!this.inicializado && tentativas < maxTentativas) {
            await new Promise(resolve => setTimeout(resolve, 200));
            tentativas++;
        }
        
        if (!this.inicializado) {
            console.warn('⚠️ UsuarioDataManager não inicializou completamente');
        }
    }

    redirecionarParaLogin() {
        const pathname = window.location.pathname;
        if (pathname.includes('index.html') || 
            pathname.includes('financeiro.html') ||
            pathname === '/' ||
            (!pathname.includes('login.html') && pathname.length > 1)) {
            console.log('🔄 UsuarioDataManager: Redirecionando para login...');
            window.location.href = 'login.html';
        }
    }

    // ================================================================
    // GERENCIAMENTO DE USUÁRIO ATUAL
    // ================================================================
    
    getUsuarioAtual() {
        // Retornar cache se válido
        if (this.usuarioAtualCache && this.isCacheUsuarioValido()) {
            return this.usuarioAtualCache;
        }

        // Tentar API primeiro
        if (this.useAPI && this.apiClient && this.apiClient.usuarioAtual) {
            this.usuarioAtualCache = this.apiClient.usuarioAtual;
            this.timestampCacheUsuario = Date.now();
            return this.usuarioAtualCache;
        }

        // Fallback para dados da sessão
        const dadosSessao = sessionStorage.getItem('dadosUsuarioLogado');
        if (dadosSessao) {
            try {
                const usuario = JSON.parse(dadosSessao);
                this.usuarioAtualCache = usuario;
                this.timestampCacheUsuario = Date.now();
                return usuario;
            } catch (error) {
                console.error('❌ Erro ao parse dos dados do usuário:', error);
            }
        }

        // Buscar nos dados locais
        const documentoLogado = sessionStorage.getItem('usuarioAtual');
        if (documentoLogado) {
            const usuarios = this.getUsuariosLocalStorage();
            const usuario = usuarios.find(u => 
                u.documento && u.documento.replace(/[^\d]+/g, '') === documentoLogado
            );
            
            if (usuario) {
                this.usuarioAtualCache = usuario;
                this.timestampCacheUsuario = Date.now();
                sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(usuario));
                return usuario;
            }
        }

        console.warn('⚠️ Usuário atual não encontrado');
        return null;
    }

    async atualizarUsuarioAtual(dadosAtualizados) {
        if (!this.inicializado) {
            await this.aguardarInicializacao();
        }

        if (this.useAPI && this.apiClient) {
            try {
                console.log('📝 Atualizando usuário via API...');
                // Implementar endpoint de atualização quando disponível
                this.usuarioAtualCache = { ...this.usuarioAtualCache, ...dadosAtualizados };
                this.timestampCacheUsuario = Date.now();
                sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(this.usuarioAtualCache));
                return true;
            } catch (error) {
                console.error('❌ Erro ao atualizar usuário via API:', error);
            }
        }

        // Fallback para atualização local
        return this.atualizarUsuarioLocal(dadosAtualizados);
    }

    atualizarUsuarioLocal(dadosAtualizados) {
        const documentoLogado = sessionStorage.getItem('usuarioAtual');
        if (!documentoLogado) {
            console.error('❌ Usuário não logado para atualização');
            return false;
        }

        try {
            const usuarios = this.getUsuariosLocalStorage();
            const index = usuarios.findIndex(u => 
                u.documento && u.documento.replace(/[^\d]+/g, '') === documentoLogado
            );
            
            if (index !== -1) {
                usuarios[index] = { ...usuarios[index], ...dadosAtualizados };
                localStorage.setItem('usuarios', JSON.stringify(usuarios));
                
                this.usuarioAtualCache = usuarios[index];
                this.timestampCacheUsuario = Date.now();
                sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(usuarios[index]));
                
                console.log('✅ Usuário atualizado localmente');
                return true;
            }
            
            console.error('❌ Usuário não encontrado para atualização');
            return false;
            
        } catch (error) {
            console.error('❌ Erro ao atualizar usuário localmente:', error);
            return false;
        }
    }

    // ================================================================
    // GERENCIAMENTO DE DADOS FINANCEIROS
    // ================================================================
    
    async getDadosFinanceirosUsuario() {
        if (!this.inicializado) {
            await this.aguardarInicializacao();
        }

        // Retornar cache se válido
        if (this.dadosCache && this.isCacheValido()) {
            return this.dadosCache;
        }

        if (this.useAPI && this.sistemaAdapter) {
            try {
                console.log('📊 Carregando dados financeiros da API...');
                const dados = await this.sistemaAdapter.carregarDadosFinanceiros();
                if (dados && typeof dados === 'object') {
                    this.dadosCache = dados;
                    this.timestampCache = Date.now();
                    console.log('✅ Dados financeiros carregados da API');
                    return dados;
                }
            } catch (error) {
                console.error('❌ Erro ao carregar dados da API:', error);
            }
        }

        // Fallback para dados locais
        console.log('💾 Carregando dados financeiros localmente...');
        return this.getDadosFinanceirosLocal();
    }

    getDadosFinanceirosLocal() {
        const usuarioAtual = sessionStorage.getItem('usuarioAtual');
        
        if (!usuarioAtual) {
            console.warn('⚠️ Nenhum usuário logado para carregar dados');
            return this.criarEstruturaInicial();
        }

        try {
            const usuarios = this.getUsuariosLocalStorage();
            const usuario = usuarios.find(u => 
                u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual
            );
            
            if (usuario) {
                if (!usuario.dadosFinanceiros) {
                    usuario.dadosFinanceiros = this.criarEstruturaInicial();
                    localStorage.setItem('usuarios', JSON.stringify(usuarios));
                    console.log('📁 Estrutura financeira inicial criada');
                }
                
                this.dadosCache = usuario.dadosFinanceiros;
                this.timestampCache = Date.now();
                console.log('✅ Dados financeiros carregados localmente');
                return usuario.dadosFinanceiros;
            }
            
            console.warn('⚠️ Usuário não encontrado, retornando estrutura inicial');
            return this.criarEstruturaInicial();
            
        } catch (error) {
            console.error('❌ Erro ao carregar dados locais:', error);
            return this.criarEstruturaInicial();
        }
    }

    async salvarDadosUsuario(dadosFinanceiros) {
        if (!this.inicializado) {
            await this.aguardarInicializacao();
        }

        if (!dadosFinanceiros || typeof dadosFinanceiros !== 'object') {
            console.error('❌ Dados financeiros inválidos para salvamento');
            return false;
        }

        let sucessoAPI = false;

        if (this.useAPI && this.sistemaAdapter) {
            try {
                console.log('💾 Salvando dados via API...');
                sucessoAPI = await this.sistemaAdapter.salvarDadosUsuario(dadosFinanceiros);
                if (sucessoAPI) {
                    this.dadosCache = dadosFinanceiros;
                    this.timestampCache = Date.now();
                    console.log('✅ Dados salvos via API');
                    return true;
                }
            } catch (error) {
                console.error('❌ Erro ao salvar dados via API:', error);
            }
        }

        // Fallback para salvamento local
        if (!sucessoAPI) {
            console.log('💾 Salvando dados localmente (fallback)...');
            return this.salvarDadosLocal(dadosFinanceiros);
        }

        return sucessoAPI;
    }

    salvarDadosLocal(dadosFinanceiros) {
        const usuarioAtual = sessionStorage.getItem('usuarioAtual');
        
        if (!usuarioAtual) {
            console.error('❌ Nenhum usuário logado para salvamento');
            return false;
        }

        try {
            const usuarios = this.getUsuariosLocalStorage();
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
            
            console.error('❌ Usuário não encontrado para salvamento');
            return false;
            
        } catch (error) {
            console.error('❌ Erro ao salvar dados localmente:', error);
            return false;
        }
    }

    // ================================================================
    // TRANSAÇÕES VIA API
    // ================================================================
    
    async salvarReceita(mes, ano, receita, id = null) {
        if (!this.inicializado) {
            await this.aguardarInicializacao();
        }

        if (this.useAPI && this.sistemaAdapter) {
            try {
                console.log('💰 Salvando receita via API...');
                const resultado = await this.sistemaAdapter.salvarReceita(mes, ano, receita, id);
                if (resultado) {
                    this.limparCache();
                    return resultado;
                }
            } catch (error) {
                console.error('❌ Erro ao salvar receita via API:', error);
            }
        }

        // Fallback para operação local
        return this.salvarReceitaLocal(mes, ano, receita, id);
    }

    async salvarDespesa(mes, ano, despesa, id = null) {
        if (!this.inicializado) {
            await this.aguardarInicializacao();
        }

        if (this.useAPI && this.sistemaAdapter) {
            try {
                console.log('💸 Salvando despesa via API...');
                const resultado = await this.sistemaAdapter.salvarDespesa(mes, ano, despesa, id);
                if (resultado) {
                    this.limparCache();
                    return resultado;
                }
            } catch (error) {
                console.error('❌ Erro ao salvar despesa via API:', error);
            }
        }

        // Fallback para operação local
        return this.salvarDespesaLocal(mes, ano, despesa, id);
    }

    async excluirReceita(mes, ano, index, opcao, descricao) {
        if (!this.inicializado) {
            await this.aguardarInicializacao();
        }

        if (this.useAPI && this.sistemaAdapter) {
            try {
                console.log('🗑️ Excluindo receita via API...');
                const resultado = await this.sistemaAdapter.excluirReceita(mes, ano, index, opcao, descricao);
                if (resultado) {
                    this.limparCache();
                    return resultado;
                }
            } catch (error) {
                console.error('❌ Erro ao excluir receita via API:', error);
            }
        }

        // Fallback para operação local
        return this.excluirReceitaLocal(mes, ano, index, opcao, descricao);
    }

    async excluirDespesa(mes, ano, index, opcao, dados) {
        if (!this.inicializado) {
            await this.aguardarInicializacao();
        }

        if (this.useAPI && this.sistemaAdapter) {
            try {
                console.log('🗑️ Excluindo despesa via API...');
                const resultado = await this.sistemaAdapter.excluirDespesa(mes, ano, index, opcao, dados);
                if (resultado) {
                    this.limparCache();
                    return resultado;
                }
            } catch (error) {
                console.error('❌ Erro ao excluir despesa via API:', error);
            }
        }

        // Fallback para operação local
        return this.excluirDespesaLocal(mes, ano, index, opcao, dados);
    }

    // ================================================================
    // OPERAÇÕES LOCAIS (FALLBACK)
    // ================================================================
    
    salvarReceitaLocal(mes, ano, receita, id = null) {
        try {
            const dados = this.getDadosFinanceirosLocal();
            
            this.garantirEstruturaMes(dados, ano, mes);
            
            if (id !== null && id !== '') {
                const index = parseInt(id);
                if (dados[ano].meses[mes].receitas[index]) {
                    dados[ano].meses[mes].receitas[index] = { ...receita, id: receita.id || this.gerarId() };
                }
            } else {
                receita.id = receita.id || this.gerarId();
                dados[ano].meses[mes].receitas.push(receita);
            }
            
            return this.salvarDadosLocal(dados);
        } catch (error) {
            console.error('❌ Erro ao salvar receita localmente:', error);
            return false;
        }
    }

    salvarDespesaLocal(mes, ano, despesa, id = null) {
        try {
            const dados = this.getDadosFinanceirosLocal();
            
            this.garantirEstruturaMes(dados, ano, mes);
            
            if (id !== null && id !== '') {
                const index = parseInt(id);
                if (dados[ano].meses[mes].despesas[index]) {
                    dados[ano].meses[mes].despesas[index] = { ...despesa, id: despesa.id || this.gerarId() };
                }
            } else {
                despesa.id = despesa.id || this.gerarId();
                dados[ano].meses[mes].despesas.push(despesa);
            }
            
            return this.salvarDadosLocal(dados);
        } catch (error) {
            console.error('❌ Erro ao salvar despesa localmente:', error);
            return false;
        }
    }

    excluirReceitaLocal(mes, ano, index, opcao, descricao) {
        try {
            const dados = this.getDadosFinanceirosLocal();
            
            if (opcao === 'atual') {
                if (dados[ano]?.meses[mes]?.receitas[index]) {
                    dados[ano].meses[mes].receitas.splice(index, 1);
                }
            } else if (opcao === 'todas') {
                // Excluir todas as receitas com a mesma descrição
                for (let m = 0; m < 12; m++) {
                    if (dados[ano]?.meses[m]?.receitas) {
                        dados[ano].meses[m].receitas = dados[ano].meses[m].receitas.filter(
                            r => r.descricao !== descricao
                        );
                    }
                }
            }
            
            return this.salvarDadosLocal(dados);
        } catch (error) {
            console.error('❌ Erro ao excluir receita localmente:', error);
            return false;
        }
    }

    excluirDespesaLocal(mes, ano, index, opcao, dados_params) {
        try {
            const dados = this.getDadosFinanceirosLocal();
            
            if (opcao === 'atual') {
                if (dados[ano]?.meses[mes]?.despesas[index]) {
                    dados[ano].meses[mes].despesas.splice(index, 1);
                }
            } else if (opcao === 'todas') {
                const { descricaoDespesa, categoriaDespesa, idGrupoParcelamento } = dados_params;
                
                // Excluir todas as despesas relacionadas
                for (let anoAtual = ano; anoAtual <= ano + 3; anoAtual++) {
                    if (!dados[anoAtual]) continue;
                    
                    for (let m = 0; m < 12; m++) {
                        if (!dados[anoAtual].meses[m]?.despesas) continue;
                        
                        dados[anoAtual].meses[m].despesas = dados[anoAtual].meses[m].despesas.filter(d => {
                            if (idGrupoParcelamento) {
                                return d.idGrupoParcelamento !== idGrupoParcelamento;
                            } else {
                                return !(d.descricao === descricaoDespesa && d.categoria === categoriaDespesa);
                            }
                        });
                    }
                }
            }
            
            return this.salvarDadosLocal(dados);
        } catch (error) {
            console.error('❌ Erro ao excluir despesa localmente:', error);
            return false;
        }
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

    garantirEstruturaMes(dados, ano, mes) {
        if (!dados[ano]) {
            dados[ano] = { meses: [] };
        }
        
        if (!dados[ano].meses[mes]) {
            dados[ano].meses[mes] = { receitas: [], despesas: [] };
        }
    }

    gerarId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    isCacheValido() {
        if (!this.timestampCache) return false;
        const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
        return (Date.now() - this.timestampCache) < CACHE_DURATION;
    }

    isCacheUsuarioValido() {
        if (!this.timestampCacheUsuario) return false;
        const CACHE_DURATION = 10 * 60 * 1000; // 10 minutos
        return (Date.now() - this.timestampCacheUsuario) < CACHE_DURATION;
    }

    limparCache() {
        this.dadosCache = null;
        this.timestampCache = null;
        console.log('🧹 Cache de dados limpo');
    }

    limparCacheUsuario() {
        this.usuarioAtualCache = null;
        this.timestampCacheUsuario = null;
        console.log('🧹 Cache de usuário limpo');
    }

    getUsuariosLocalStorage() {
        try {
            return JSON.parse(localStorage.getItem('usuarios')) || [];
        } catch (error) {
            console.error('❌ Erro ao ler usuários do localStorage:', error);
            return [];
        }
    }

    // ================================================================
    // MIGRAÇÃO E COMPATIBILIDADE
    // ================================================================
    
    executarMigracoes() {
        console.log('🔄 Executando migrações locais...');
        
        try {
            const usuarios = this.getUsuariosLocalStorage();
            let necessitaAtualizacao = false;

            usuarios.forEach(usuario => {
                // Migração 1: Estrutura de dados financeiros
                if (!usuario.dadosFinanceiros) {
                    usuario.dadosFinanceiros = this.criarEstruturaInicial();
                    necessitaAtualizacao = true;
                }

                // Migração 2: IDs únicos para transações
                if (usuario.dadosFinanceiros) {
                    Object.keys(usuario.dadosFinanceiros).forEach(ano => {
                        const anoData = usuario.dadosFinanceiros[ano];
                        if (anoData && anoData.meses) {
                            anoData.meses.forEach(mes => {
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
            } else {
                console.log('✅ Nenhuma migração necessária');
            }

        } catch (error) {
            console.error('❌ Erro durante migrações:', error);
        }
    }

    // ================================================================
    // MÉTODOS DE DIAGNÓSTICO
    // ================================================================
    
    diagnosticoSistema() {
        const diagnostico = {
            timestamp: new Date().toISOString(),
            inicializado: this.inicializado,
            useAPI: this.useAPI,
            apiDisponivel: !!this.apiClient,
            sistemaAdapterDisponivel: !!this.sistemaAdapter,
            usuarioLogado: !!this.getUsuarioAtual(),
            cacheValido: this.isCacheValido(),
            cacheUsuarioValido: this.isCacheUsuarioValido(),
            localStorage: this.testLocalStorage()
        };

        console.log('🔍 Diagnóstico UsuarioDataManager:', diagnostico);
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
    // MÉTODOS PÚBLICOS
    // ================================================================
    
    async recarregarDados() {
        this.limparCache();
        return await this.getDadosFinanceirosUsuario();
    }

    getStatusConexao() {
        return {
            inicializado: this.inicializado,
            api: this.useAPI && !!this.apiClient,
            localStorage: this.testLocalStorage(),
            modo: this.useAPI ? 'API + LocalStorage' : 'LocalStorage'
        };
    }

    // Método para aguardar inicialização completa
    async aguardarPronto() {
        await this.aguardarInicializacao();
        return this.inicializado;
    }
}

// ================================================================
// INSTÂNCIA GLOBAL E INICIALIZAÇÃO
// ================================================================

// Criar instância global
const usuarioDataManager = new UsuarioDataManager();

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
    
    // Métodos de transação - CORRIGIDOS
    salvarReceita: (mes, ano, receita, id) => usuarioDataManager.salvarReceita(mes, ano, receita, id),
    salvarDespesa: (mes, ano, despesa, id) => usuarioDataManager.salvarDespesa(mes, ano, despesa, id),
    excluirReceita: (mes, ano, index, opcao, descricao) => usuarioDataManager.excluirReceita(mes, ano, index, opcao, descricao),
    excluirDespesa: (mes, ano, index, opcao, dados) => usuarioDataManager.excluirDespesa(mes, ano, index, opcao, dados),
    
    // Métodos utilitários
    recarregarDados: () => usuarioDataManager.recarregarDados(),
    limparCache: () => usuarioDataManager.limparCache(),
    diagnostico: () => usuarioDataManager.diagnosticoSistema(),
    getStatus: () => usuarioDataManager.getStatusConexao(),
    
    // Atualização de usuário
    atualizarUsuario: (dados) => usuarioDataManager.atualizarUsuarioAtual(dados),
    
    // Método para aguardar inicialização
    aguardarPronto: () => usuarioDataManager.aguardarPronto()
};

// Exportar classe para compatibilidade
window.UsuarioDataManager = UsuarioDataManager;

// Exportar instância
window.usuarioDataManager = usuarioDataManager;

// Log de inicialização
console.log('🚀 Sistema UsuarioDados carregado - aguardando main.js...');