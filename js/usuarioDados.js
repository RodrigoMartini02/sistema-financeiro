// ================================================================
// SISTEMA DE GERENCIAMENTO DE USUÁRIOS E DADOS
// ================================================================

class UsuarioDataManager {
    constructor() {
        this.dadosCache = null;
        this.usuarioAtualCache = null;
        this.timestampCache = null;
        this.timestampCacheUsuario = null;
        this.inicializado = false;
        
        this.aguardarSistemaMainPronto();
    }

    // ================================================================
    // INICIALIZAÇÃO
    // ================================================================
    
    async aguardarSistemaMainPronto() {
        let tentativas = 0;
        const maxTentativas = 50;
        
        const verificarMain = () => {
            tentativas++;
            
            if (window.sistemaInicializado === true || window.dadosFinanceiros || window.salvarDados) {
                this.initializeSystem();
            } else if (tentativas >= maxTentativas) {
                this.initializeSystem();
            } else {
                setTimeout(verificarMain, 200);
            }
        };
        
        verificarMain();
    }

    async initializeSystem() {
        try {
            this.executarMigracoes();
            this.inicializado = true;
        } catch (error) {
            this.inicializado = true;
        }
    }

    // ================================================================
    // VERIFICAÇÃO DE ACESSO
    // ================================================================
    
    async verificarAcesso() {
        if (!this.inicializado) {
            await this.aguardarInicializacao();
        }

        const usuarioAtual = sessionStorage.getItem('usuarioAtual');
        if (!usuarioAtual) {
            this.redirecionarParaLogin();
            return false;
        }
        
        return true;
    }

    async aguardarInicializacao() {
        let tentativas = 0;
        const maxTentativas = 25;
        
        while (!this.inicializado && tentativas < maxTentativas) {
            await new Promise(resolve => setTimeout(resolve, 200));
            tentativas++;
        }
    }

    redirecionarParaLogin() {
        const pathname = window.location.pathname;
        if (pathname.includes('index.html') || 
            pathname.includes('financeiro.html') ||
            pathname === '/' ||
            (!pathname.includes('login.html') && pathname.length > 1)) {
            window.location.href = 'login.html';
        }
    }

    // ================================================================
    // GERENCIAMENTO DE USUÁRIO ATUAL
    // ================================================================
    
    getUsuarioAtual() {
        if (this.usuarioAtualCache && this.isCacheUsuarioValido()) {
            return this.usuarioAtualCache;
        }

        const dadosSessao = sessionStorage.getItem('dadosUsuarioLogado');
        if (dadosSessao) {
            try {
                const usuario = JSON.parse(dadosSessao);
                this.usuarioAtualCache = usuario;
                this.timestampCacheUsuario = Date.now();
                return usuario;
            } catch (error) {
                // Continuar para busca local
            }
        }

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

        return null;
    }

    async atualizarUsuarioAtual(dadosAtualizados) {
        if (!this.inicializado) {
            await this.aguardarInicializacao();
        }

        return this.atualizarUsuarioLocal(dadosAtualizados);
    }

    atualizarUsuarioLocal(dadosAtualizados) {
        const documentoLogado = sessionStorage.getItem('usuarioAtual');
        if (!documentoLogado) {
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
                
                return true;
            }
            
            return false;
            
        } catch (error) {
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

        if (this.dadosCache && this.isCacheValido()) {
            return this.dadosCache;
        }

        if (window.dadosFinanceiros && typeof window.dadosFinanceiros === 'object') {
            this.dadosCache = window.dadosFinanceiros;
            this.timestampCache = Date.now();
            return window.dadosFinanceiros;
        }

        return this.getDadosFinanceirosLocal();
    }

    getDadosFinanceirosLocal() {
        const usuarioAtual = sessionStorage.getItem('usuarioAtual');
        
        if (!usuarioAtual) {
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
                }
                
                this.dadosCache = usuario.dadosFinanceiros;
                this.timestampCache = Date.now();
                return usuario.dadosFinanceiros;
            }
            
            return this.criarEstruturaInicial();
            
        } catch (error) {
            return this.criarEstruturaInicial();
        }
    }

    async salvarDadosUsuario(dadosFinanceiros) {
        if (!this.inicializado) {
            await this.aguardarInicializacao();
        }

        if (!dadosFinanceiros || typeof dadosFinanceiros !== 'object') {
            return false;
        }

        if (window.salvarDados && typeof window.salvarDados === 'function') {
            try {
                window.dadosFinanceiros = dadosFinanceiros;
                const sucesso = await window.salvarDados();
                
                if (sucesso) {
                    this.dadosCache = dadosFinanceiros;
                    this.timestampCache = Date.now();
                    return true;
                }
            } catch (error) {
                // Fallback para salvamento local
            }
        }

        return this.salvarDadosLocal(dadosFinanceiros);
    }

    salvarDadosLocal(dadosFinanceiros) {
        const usuarioAtual = sessionStorage.getItem('usuarioAtual');
        
        if (!usuarioAtual) {
            return false;
        }

        try {
            const usuarios = this.getUsuariosLocalStorage();
            const index = usuarios.findIndex(u => 
                u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual
            );
            
            if (index !== -1) {
                usuarios[index].dadosFinanceiros = dadosFinanceiros;
                usuarios[index].ultimaAtualizacao = new Date().toISOString();
                localStorage.setItem('usuarios', JSON.stringify(usuarios));
                
                this.dadosCache = dadosFinanceiros;
                this.timestampCache = Date.now();
                return true;
            }
            
            return false;
            
        } catch (error) {
            return false;
        }
    }

    // ================================================================
    // INTEGRAÇÃO COM SISTEMA PRINCIPAL
    // ================================================================
    
    async sincronizarComSistemaPrincipal() {
        try {
            const dadosLocais = this.getDadosFinanceirosLocal();
            
            if (window.dadosFinanceiros) {
                const dadosJson = JSON.stringify(dadosLocais);
                const sistemaPrincipalJson = JSON.stringify(window.dadosFinanceiros);
                
                if (dadosJson !== sistemaPrincipalJson) {
                    window.dadosFinanceiros = dadosLocais;
                    
                    if (typeof window.forcarAtualizacaoSistema === 'function') {
                        await window.forcarAtualizacaoSistema();
                    }
                }
            } else {
                window.dadosFinanceiros = dadosLocais;
            }
            
            return true;
        } catch (error) {
            return false;
        }
    }

    // ================================================================
    // OPERAÇÕES SIMPLIFICADAS
    // ================================================================
    
    async salvarReceita(mes, ano, receita, id = null) {
        if (!this.inicializado) {
            await this.aguardarInicializacao();
        }

        if (window.salvarReceita && typeof window.salvarReceita === 'function') {
            try {
                const resultado = await window.salvarReceita({ 
                    preventDefault: () => {},
                    mes, ano, receita, id 
                });
                this.limparCache();
                return resultado;
            } catch (error) {
                // Fallback local
            }
        }

        return this.salvarReceitaLocal(mes, ano, receita, id);
    }

    async salvarDespesa(mes, ano, despesa, id = null) {
        if (!this.inicializado) {
            await this.aguardarInicializacao();
        }

        if (window.salvarDespesa && typeof window.salvarDespesa === 'function') {
            try {
                const resultado = await window.salvarDespesa({ 
                    preventDefault: () => {},
                    mes, ano, despesa, id 
                });
                this.limparCache();
                return resultado;
            } catch (error) {
                // Fallback local
            }
        }

        return this.salvarDespesaLocal(mes, ano, despesa, id);
    }

    async excluirReceita(mes, ano, index, opcao, descricao) {
        if (!this.inicializado) {
            await this.aguardarInicializacao();
        }

        return this.excluirReceitaLocal(mes, ano, index, opcao, descricao);
    }

    async excluirDespesa(mes, ano, index, opcao, dados) {
        if (!this.inicializado) {
            await this.aguardarInicializacao();
        }

        return this.excluirDespesaLocal(mes, ano, index, opcao, dados);
    }

    // ================================================================
    // OPERAÇÕES LOCAIS BÁSICAS
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
                for (let m = 0; m < 12; m++) {
                    if (dados[ano]?.meses[m]?.receitas) {
                        dados[ano].meses[m].receitas = dados[ano].meses[m].receitas.filter(
                            r => r.descricao !== descricao
                        );
                    }
                }
            }
            
            const resultado = this.salvarDadosLocal(dados);
            if (resultado) {
                this.sincronizarComSistemaPrincipal();
            }
            return resultado;
        } catch (error) {
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
            
            const resultado = this.salvarDadosLocal(dados);
            if (resultado) {
                this.sincronizarComSistemaPrincipal();
            }
            return resultado;
        } catch (error) {
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
                despesas: [],
                fechado: false,
                saldoAnterior: 0,
                saldoFinal: 0
            };
        }
        
        return estrutura;
    }

    garantirEstruturaMes(dados, ano, mes) {
        if (!dados[ano]) {
            dados[ano] = { meses: [] };
        }
        
        if (!dados[ano].meses[mes]) {
            dados[ano].meses[mes] = { 
                receitas: [], 
                despesas: [],
                fechado: false,
                saldoAnterior: 0,
                saldoFinal: 0
            };
        }
    }

    gerarId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    isCacheValido() {
        if (!this.timestampCache) return false;
        const CACHE_DURATION = 5 * 60 * 1000;
        return (Date.now() - this.timestampCache) < CACHE_DURATION;
    }

    isCacheUsuarioValido() {
        if (!this.timestampCacheUsuario) return false;
        const CACHE_DURATION = 10 * 60 * 1000;
        return (Date.now() - this.timestampCacheUsuario) < CACHE_DURATION;
    }

    limparCache() {
        this.dadosCache = null;
        this.timestampCache = null;
    }

    limparCacheUsuario() {
        this.usuarioAtualCache = null;
        this.timestampCacheUsuario = null;
    }

    getUsuariosLocalStorage() {
        try {
            return JSON.parse(localStorage.getItem('usuarios')) || [];
        } catch (error) {
            return [];
        }
    }

    // ================================================================
    // MIGRAÇÃO E COMPATIBILIDADE
    // ================================================================
    
    executarMigracoes() {
        try {
            const usuarios = this.getUsuariosLocalStorage();
            let necessitaAtualizacao = false;

            usuarios.forEach(usuario => {
                if (!usuario.dadosFinanceiros) {
                    usuario.dadosFinanceiros = this.criarEstruturaInicial();
                    necessitaAtualizacao = true;
                }

                if (usuario.dadosFinanceiros) {
                    Object.keys(usuario.dadosFinanceiros).forEach(ano => {
                        const anoData = usuario.dadosFinanceiros[ano];
                        if (anoData && anoData.meses) {
                            anoData.meses.forEach(mes => {
                                if (mes) {
                                    if (mes.receitas) {
                                        mes.receitas.forEach(receita => {
                                            if (!receita.id) {
                                                receita.id = this.gerarId();
                                                necessitaAtualizacao = true;
                                            }
                                        });
                                    }
                                    
                                    if (mes.despesas) {
                                        mes.despesas.forEach(despesa => {
                                            if (!despesa.id) {
                                                despesa.id = this.gerarId();
                                                necessitaAtualizacao = true;
                                            }
                                        });
                                    }
                                    
                                    if (mes.fechado === undefined) {
                                        mes.fechado = false;
                                        necessitaAtualizacao = true;
                                    }
                                    if (mes.saldoAnterior === undefined) {
                                        mes.saldoAnterior = 0;
                                        necessitaAtualizacao = true;
                                    }
                                    if (mes.saldoFinal === undefined) {
                                        mes.saldoFinal = 0;
                                        necessitaAtualizacao = true;
                                    }
                                }
                            });
                        }
                    });
                }
            });

            if (necessitaAtualizacao) {
                localStorage.setItem('usuarios', JSON.stringify(usuarios));
            }

        } catch (error) {
            // Erro silencioso
        }
    }

    // ================================================================
    // MÉTODOS PÚBLICOS
    // ================================================================
    
    async recarregarDados() {
        this.limparCache();
        const dados = await this.getDadosFinanceirosUsuario();
        await this.sincronizarComSistemaPrincipal();
        return dados;
    }

    getStatusConexao() {
        return {
            inicializado: this.inicializado,
            localStorage: this.testLocalStorage(),
            modo: 'LocalStorage Only',
            sistemaMain: !!(window.sistemaInicializado || window.dadosFinanceiros)
        };
    }

    async aguardarPronto() {
        await this.aguardarInicializacao();
        return this.inicializado;
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
}

// ================================================================
// INSTÂNCIA GLOBAL E INICIALIZAÇÃO
// ================================================================

const usuarioDataManager = new UsuarioDataManager();

// ================================================================
// INTERFACE PÚBLICA PARA COMPATIBILIDADE
// ================================================================

window.usuarioDados = {
    verificarAcesso: () => usuarioDataManager.verificarAcesso(),
    getUsuarioAtual: () => usuarioDataManager.getUsuarioAtual(),
    getDadosFinanceirosUsuario: () => usuarioDataManager.getDadosFinanceirosUsuario(),
    salvarDadosUsuario: (dados) => usuarioDataManager.salvarDadosUsuario(dados),
    executarMigracoes: () => usuarioDataManager.executarMigracoes(),
    
    salvarReceita: (mes, ano, receita, id) => usuarioDataManager.salvarReceita(mes, ano, receita, id),
    salvarDespesa: (mes, ano, despesa, id) => usuarioDataManager.salvarDespesa(mes, ano, despesa, id),
    excluirReceita: (mes, ano, index, opcao, descricao) => usuarioDataManager.excluirReceita(mes, ano, index, opcao, descricao),
    excluirDespesa: (mes, ano, index, opcao, dados) => usuarioDataManager.excluirDespesa(mes, ano, index, opcao, dados),
    
    recarregarDados: () => usuarioDataManager.recarregarDados(),
    limparCache: () => usuarioDataManager.limparCache(),
    getStatus: () => usuarioDataManager.getStatusConexao(),
    
    atualizarUsuario: (dados) => usuarioDataManager.atualizarUsuarioAtual(dados),
    
    aguardarPronto: () => usuarioDataManager.aguardarPronto(),
    
    sincronizar: () => usuarioDataManager.sincronizarComSistemaPrincipal()
};

window.UsuarioDataManager = UsuarioDataManager;
window.usuarioDataManager = usuarioDataManager;