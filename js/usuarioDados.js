const API_URL = 'https://sistema-financeiro-backend-o199.onrender.com/api';

class UsuarioDados {
    constructor() {
        this.cache = {
            usuario: null,
            timestamp: null,
            dados: null,
            timestampDados: null
        };
        this.cacheDuration = 5 * 60 * 1000;
    }

    async verificarAcesso() {
        const token = sessionStorage.getItem('token');
        const usuarioAtual = sessionStorage.getItem('usuarioAtual');
        
        if (!token || !usuarioAtual) {
            this.redirecionarParaLogin();
            return false;
        }
        
        try {
            const response = await fetch(`${API_URL}/usuarios/current`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) {
                this.limparSessao();
                this.redirecionarParaLogin();
                return false;
            }
            
            return true;
        } catch (error) {
            return this.verificarAcessoLocal();
        }
    }

    verificarAcessoLocal() {
        const usuarioAtual = sessionStorage.getItem('usuarioAtual');
        if (!usuarioAtual) {
            this.redirecionarParaLogin();
            return false;
        }
        return true;
    }

    redirecionarParaLogin() {
        const pathname = window.location.pathname;
        if (!pathname.includes('login.html')) {
            window.location.href = 'login.html';
        }
    }

    async getUsuarioAtual() {
        if (this.isCacheUsuarioValido()) {
            return this.cache.usuario;
        }

        const token = sessionStorage.getItem('token');
        if (token) {
            try {
                const response = await fetch(`${API_URL}/usuarios/current`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    this.cache.usuario = data.data;
                    this.cache.timestamp = Date.now();
                    return data.data;
                }
            } catch (error) {
                console.warn('Falha na API, usando dados da sessão');
            }
        }

        return this.getUsuarioSessao();
    }

    getUsuarioSessao() {
        try {
            const dadosUsuario = sessionStorage.getItem('dadosUsuarioLogado');
            if (dadosUsuario) {
                const usuario = JSON.parse(dadosUsuario);
                this.cache.usuario = usuario;
                this.cache.timestamp = Date.now();
                return usuario;
            }
        } catch (error) {
            console.error('Erro ao ler dados da sessão:', error);
        }
        return null;
    }

    async atualizarUsuario(dadosAtualizados) {
        const token = sessionStorage.getItem('token');
        if (token) {
            try {
                const response = await fetch(`${API_URL}/usuarios/current`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(dadosAtualizados)
                });
                
                if (response.ok) {
                    const data = await response.json();
                    sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(data.data));
                    this.cache.usuario = data.data;
                    this.cache.timestamp = Date.now();
                    return true;
                }
            } catch (error) {
                console.warn('Falha ao atualizar via API');
            }
        }

        return this.atualizarUsuarioLocal(dadosAtualizados);
    }

    atualizarUsuarioLocal(dadosAtualizados) {
        try {
            const usuarioAtual = this.getUsuarioSessao();
            if (usuarioAtual) {
                const usuarioAtualizado = { ...usuarioAtual, ...dadosAtualizados };
                sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(usuarioAtualizado));
                this.cache.usuario = usuarioAtualizado;
                this.cache.timestamp = Date.now();
                return true;
            }
        } catch (error) {
            console.error('Erro ao atualizar usuário local:', error);
        }
        return false;
    }

    async getDadosFinanceiros() {
        if (this.isCacheDadosValido()) {
            return this.cache.dados;
        }

        const token = sessionStorage.getItem('token');
        const usuario = await this.getUsuarioAtual();
        
        if (!usuario) return this.criarEstruturaInicial();

        const dados = {
            receitas: await this.buscarReceitas(token, usuario.id),
            despesas: await this.buscarDespesas(token, usuario.id),
            categorias: await this.buscarCategorias(token, usuario.id),
            cartoes: await this.buscarCartoes(token, usuario.id)
        };

        this.cache.dados = dados;
        this.cache.timestampDados = Date.now();
        return dados;
    }

    async buscarReceitas(token, usuarioId) {
        if (!token) return [];
        
        try {
            const response = await fetch(`${API_URL}/receitas?usuario_id=${usuarioId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.data || [];
            }
        } catch (error) {
            console.warn('Erro ao buscar receitas:', error);
        }
        return [];
    }

    async buscarDespesas(token, usuarioId) {
        if (!token) return [];
        
        try {
            const response = await fetch(`${API_URL}/despesas?usuario_id=${usuarioId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.data || [];
            }
        } catch (error) {
            console.warn('Erro ao buscar despesas:', error);
        }
        return [];
    }

    async buscarCategorias(token, usuarioId) {
        if (!token) return [];
        
        try {
            const response = await fetch(`${API_URL}/categorias`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.data || [];
            }
        } catch (error) {
            console.warn('Erro ao buscar categorias:', error);
        }
        return [];
    }

    async buscarCartoes(token, usuarioId) {
        if (!token) return [];
        
        try {
            const response = await fetch(`${API_URL}/cartoes`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.data || [];
            }
        } catch (error) {
            console.warn('Erro ao buscar cartões:', error);
        }
        return [];
    }

    async salvarReceita(receita) {
        const token = sessionStorage.getItem('token');
        if (!token) return false;

        try {
            const method = receita.id ? 'PUT' : 'POST';
            const url = receita.id ? `${API_URL}/receitas/${receita.id}` : `${API_URL}/receitas`;
            
            const response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(receita)
            });
            
            if (response.ok) {
                this.limparCacheDados();
                return true;
            }
        } catch (error) {
            console.error('Erro ao salvar receita:', error);
        }
        return false;
    }

    async salvarDespesa(despesa) {
        const token = sessionStorage.getItem('token');
        if (!token) return false;

        try {
            const method = despesa.id ? 'PUT' : 'POST';
            const url = despesa.id ? `${API_URL}/despesas/${despesa.id}` : `${API_URL}/despesas`;
            
            const response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(despesa)
            });
            
            if (response.ok) {
                this.limparCacheDados();
                return true;
            }
        } catch (error) {
            console.error('Erro ao salvar despesa:', error);
        }
        return false;
    }

    async excluirReceita(receitaId) {
        const token = sessionStorage.getItem('token');
        if (!token) return false;

        try {
            const response = await fetch(`${API_URL}/receitas/${receitaId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                this.limparCacheDados();
                return true;
            }
        } catch (error) {
            console.error('Erro ao excluir receita:', error);
        }
        return false;
    }

    async excluirDespesa(despesaId) {
        const token = sessionStorage.getItem('token');
        if (!token) return false;

        try {
            const response = await fetch(`${API_URL}/despesas/${despesaId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                this.limparCacheDados();
                return true;
            }
        } catch (error) {
            console.error('Erro ao excluir despesa:', error);
        }
        return false;
    }

    criarEstruturaInicial() {
        return {
            receitas: [],
            despesas: [],
            categorias: [],
            cartoes: []
        };
    }

    isCacheUsuarioValido() {
        return this.cache.usuario && 
               this.cache.timestamp && 
               (Date.now() - this.cache.timestamp) < this.cacheDuration;
    }

    isCacheDadosValido() {
        return this.cache.dados && 
               this.cache.timestampDados && 
               (Date.now() - this.cache.timestampDados) < this.cacheDuration;
    }

    limparCache() {
        this.cache.usuario = null;
        this.cache.timestamp = null;
        this.limparCacheDados();
    }

    limparCacheDados() {
        this.cache.dados = null;
        this.cache.timestampDados = null;
    }

    limparSessao() {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('usuarioAtual');
        sessionStorage.removeItem('dadosUsuarioLogado');
        this.limparCache();
    }

    getStatusConexao() {
        const token = sessionStorage.getItem('token');
        return {
            online: navigator.onLine,
            token: !!token,
            usuario: !!this.cache.usuario,
            dados: !!this.cache.dados
        };
    }
}

const usuarioDados = new UsuarioDados();

window.usuarioDados = {
    verificarAcesso: () => usuarioDados.verificarAcesso(),
    getUsuarioAtual: () => usuarioDados.getUsuarioAtual(),
    getDadosFinanceiros: () => usuarioDados.getDadosFinanceiros(),
    atualizarUsuario: (dados) => usuarioDados.atualizarUsuario(dados),
    salvarReceita: (receita) => usuarioDados.salvarReceita(receita),
    salvarDespesa: (despesa) => usuarioDados.salvarDespesa(despesa),
    excluirReceita: (id) => usuarioDados.excluirReceita(id),
    excluirDespesa: (id) => usuarioDados.excluirDespesa(id),
    limparCache: () => usuarioDados.limparCache(),
    limparSessao: () => usuarioDados.limparSessao(),
    getStatus: () => usuarioDados.getStatusConexao()
};

window.UsuarioDados = UsuarioDados;