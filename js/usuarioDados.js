// ================================================================
// SISTEMA DE GERENCIAMENTO DE USUÁRIOS E DADOS
// ================================================================

// URL da API do Backend (usar variável global se já definida)
const API_URL_DADOS = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

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

            // 🔥 CARREGAR DADOS DA API E SINCRONIZAR COM window.dadosFinanceiros
            await this.sincronizarComSistemaPrincipal();
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

            }
        }

        return null;
    }

    async atualizarUsuarioAtual(dadosAtualizados) {
        if (!this.inicializado) {
            await this.aguardarInicializacao();
        }

        const usuario = this.getUsuarioAtual();
        if (!usuario || !usuario.id) {

            return false;
        }

        try {

            const response = await fetch(`${API_URL_DADOS}/usuarios/${usuario.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionStorage.getItem('token') || ''}`
                },
                body: JSON.stringify(dadosAtualizados)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Erro ao atualizar usuário');
            }

            const usuarioAtualizado = { ...usuario, ...dadosAtualizados };
            this.usuarioAtualCache = usuarioAtualizado;
            this.timestampCacheUsuario = Date.now();
            sessionStorage.setItem('dadosUsuarioLogado', JSON.stringify(usuarioAtualizado));

            return true;
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

        return await this.getDadosFinanceirosAPI();
    }

    async getDadosFinanceirosAPI() {
        const usuario = this.getUsuarioAtual();

        if (!usuario || !usuario.id) {
            console.warn('⚠️ Usuário não encontrado, usando localStorage');
            return this.getDadosFinanceirosLocal();
        }

        try {
            const token = sessionStorage.getItem('token') || '';

            // ✅ BUSCAR RECEITAS E DESPESAS DAS TABELAS SEPARADAS
            const [receitasResponse, despesasResponse] = await Promise.all([
                fetch(`${API_URL_DADOS}/receitas`, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                }),
                fetch(`${API_URL_DADOS}/despesas`, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                })
            ]);

            const receitasData = await receitasResponse.json();
            const despesasData = await despesasResponse.json();

            const receitas = receitasData.data || [];
            const despesas = despesasData.data || [];

            console.log(`📊 Carregadas ${receitas.length} receitas e ${despesas.length} despesas da API`);

            // ✅ BUSCAR ANOS CRIADOS PELO USUÁRIO DA TABELA 'anos'
            let anosDoBackend = [];
            try {
                const anosResponse = await fetch(`${API_URL_DADOS}/anos`, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (anosResponse.ok) {
                    const anosData = await anosResponse.json();
                    anosDoBackend = anosData.data || [];
                    console.log(`📅 Anos salvos no backend: ${anosDoBackend.join(', ')}`);
                }
            } catch (error) {
                console.warn('⚠️ Erro ao buscar anos do backend:', error);
            }

            // ✅ DESCOBRIR TODOS OS ANOS QUE TÊM DADOS (receitas/despesas)
            const anosComDados = new Set();
            receitas.forEach(r => anosComDados.add(parseInt(r.ano)));
            despesas.forEach(d => anosComDados.add(parseInt(d.ano)));

            // Adicionar anos criados pelo usuário (mesmo sem receitas/despesas)
            anosDoBackend.forEach(ano => anosComDados.add(parseInt(ano)));

            // Sempre incluir o ano atual
            anosComDados.add(new Date().getFullYear());

            // ✅ ORGANIZAR POR ANO E MÊS - criar estrutura para TODOS os anos
            const dadosFinanceiros = {};
            anosComDados.forEach(ano => {
                dadosFinanceiros[ano] = { meses: [] };
                for (let i = 0; i < 12; i++) {
                    dadosFinanceiros[ano].meses[i] = {
                        receitas: [],
                        despesas: [],
                        fechado: false,
                        saldoAnterior: 0,
                        saldoFinal: 0
                    };
                }
            });

            console.log(`📅 Anos carregados: ${Array.from(anosComDados).sort().join(', ')}`);

            // Processar receitas
            receitas.forEach(receita => {
                const ano = parseInt(receita.ano);
                const mes = parseInt(receita.mes);

                this.garantirEstruturaMes(dadosFinanceiros, ano, mes);

                dadosFinanceiros[ano].meses[mes].receitas.push({
                    id: receita.id,
                    descricao: receita.descricao,
                    valor: parseFloat(receita.valor),
                    data: receita.data_recebimento,
                    dataRecebimento: receita.data_recebimento,
                    observacoes: receita.observacoes || ''
                });
            });

            // Processar despesas
            despesas.forEach(despesa => {
                const ano = parseInt(despesa.ano);
                const mes = parseInt(despesa.mes);

                this.garantirEstruturaMes(dadosFinanceiros, ano, mes);

                const valor = parseFloat(despesa.valor);

                dadosFinanceiros[ano].meses[mes].despesas.push({
                    id: despesa.id,
                    descricao: despesa.descricao,
                    valor: valor,
                    categoria: despesa.categoria_nome || despesa.categoria || 'Sem categoria',
                    categoria_id: despesa.categoria_id,
                    cartao_id: despesa.cartao_id,
                    dataCompra: despesa.data_compra,
                    dataVencimento: despesa.data_vencimento,
                    dataPagamento: despesa.data_pagamento,
                    formaPagamento: despesa.forma_pagamento,
                    parcelado: despesa.parcelado,
                    totalParcelas: despesa.numero_parcelas,
                    parcelaAtual: despesa.parcela_atual,
                    pago: despesa.pago,
                    quitado: despesa.pago,
                    // Campos para juros e economias
                    valorPago: despesa.valor_pago || null,
                    valorOriginal: despesa.valor_original || null,
                    valorTotalComJuros: despesa.valor_total_com_juros || null,
                    observacoes: despesa.observacoes || ''
                });
            });

            this.dadosCache = dadosFinanceiros;
            this.timestampCache = Date.now();

            return dadosFinanceiros;
        } catch (error) {
            console.error('❌ Erro ao buscar dados da API:', error);
            console.warn('⚠️ Usando localStorage como fallback');
            return this.getDadosFinanceirosLocal();
        }
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

        const sucesso = await this.salvarDadosAPI(dadosFinanceiros);

        if (sucesso) {

            this.dadosCache = dadosFinanceiros;
            this.timestampCache = Date.now();
        } else {

        }

        return sucesso;
    }

    async salvarDadosAPI(dadosFinanceiros) {
        const usuario = this.getUsuarioAtual();

        if (!usuario || !usuario.id) {

            return this.salvarDadosLocal(dadosFinanceiros);
        }

        try {

            const response = await fetch(`${API_URL_DADOS}/usuarios/${usuario.id}/dados-financeiros`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionStorage.getItem('token') || ''}`
                },
                body: JSON.stringify({ dadosFinanceiros })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Erro ao salvar dados financeiros');
            }

            this.dadosCache = dadosFinanceiros;
            this.timestampCache = Date.now();

            return true;
        } catch (error) {

            console.warn('⚠️ Usando localStorage como fallback');
            // Fallback para localStorage
            return this.salvarDadosLocal(dadosFinanceiros);
        }
    }

    salvarDadosLocal(dadosFinanceiros) {
        const usuarioAtual = sessionStorage.getItem('usuarioAtual');

        if (!usuarioAtual) {
            return false;
        }

        try {
            const usuarios = this.getUsuariosLocalStorage();
            let index = usuarios.findIndex(u =>
                u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual
            );

            // Se usuário não existe no localStorage (veio da API), criar entrada
            if (index === -1) {
                const dadosUsuarioLogado = sessionStorage.getItem('dadosUsuarioLogado');
                if (dadosUsuarioLogado) {
                    const usuario = JSON.parse(dadosUsuarioLogado);
                    usuarios.push({
                        id: usuario.id,
                        nome: usuario.nome,
                        email: usuario.email,
                        documento: usuarioAtual,
                        password: usuario.password,
                        dadosFinanceiros: dadosFinanceiros,
                        ultimaAtualizacao: new Date().toISOString()
                    });
                    localStorage.setItem('usuarios', JSON.stringify(usuarios));

                    this.dadosCache = dadosFinanceiros;
                    this.timestampCache = Date.now();
                    return true;
                }
                return false;
            }

            // Atualizar usuário existente
            usuarios[index].dadosFinanceiros = dadosFinanceiros;
            usuarios[index].ultimaAtualizacao = new Date().toISOString();
            localStorage.setItem('usuarios', JSON.stringify(usuarios));

            this.dadosCache = dadosFinanceiros;
            this.timestampCache = Date.now();
            return true;

        } catch (error) {

            return false;
        }
    }

    // ================================================================
    // INTEGRAÇÃO COM SISTEMA PRINCIPAL
    // ================================================================
    
    async sincronizarComSistemaPrincipal() {
        try {
            // 🔥 BUSCAR DADOS DA API PRIMEIRO (não do localStorage)

            const dadosAPI = await this.getDadosFinanceirosAPI();

            if (window.dadosFinanceiros) {
                const dadosJson = JSON.stringify(dadosAPI);
                const sistemaPrincipalJson = JSON.stringify(window.dadosFinanceiros);

                if (dadosJson !== sistemaPrincipalJson) {

                    window.dadosFinanceiros = dadosAPI;

                    if (typeof window.forcarAtualizacaoSistema === 'function') {
                        await window.forcarAtualizacaoSistema();
                    }
                }
            } else {

                window.dadosFinanceiros = dadosAPI;
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
                // Fallback para API
            }
        }

        return await this.salvarReceitaAPI(mes, ano, receita, id);
    }

    async salvarReceitaAPI(mes, ano, receita, id = null) {
        try {
            const usuario = this.getUsuarioAtual();
            if (!usuario || !usuario.id) {
                return false;
            }

            const token = sessionStorage.getItem('token');
            const ehEdicao = id !== null && id !== '' && id !== undefined;

            // Preparar dados para API
            const dadosReceita = {
                descricao: receita.descricao,
                valor: parseFloat(receita.valor),
                data_recebimento: receita.data || receita.dataRecebimento || receita.data_recebimento,
                mes: parseInt(mes),
                ano: parseInt(ano),
                observacoes: receita.observacoes || ''
            };

            let response;
            if (ehEdicao) {
                // ✅ EDITAR RECEITA EXISTENTE
                response = await fetch(`${API_URL_DADOS}/receitas/${receita.id || id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(dadosReceita)
                });
            } else {
                // ✅ CRIAR NOVA RECEITA
                response = await fetch(`${API_URL_DADOS}/receitas`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(dadosReceita)
                });
            }

            if (response.ok) {
                this.limparCache();
                return true;
            } else {
                const errorData = await response.json();
                console.error('❌ Erro ao salvar receita:', errorData);
                return false;
            }
        } catch (error) {
            console.error('❌ Erro ao salvar receita:', error);
            return false;
        }
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
                // Fallback para API
            }
        }

        return await this.salvarDespesaAPI(mes, ano, despesa, id);
    }

    async salvarDespesaAPI(mes, ano, despesa, id = null) {
        try {
            const usuario = this.getUsuarioAtual();
            if (!usuario || !usuario.id) {
                return false;
            }

            const token = sessionStorage.getItem('token');
            const ehEdicao = id !== null && id !== '' && id !== undefined;

            // ✅ BUSCAR CATEGORIA_ID SE FORNECIDO NOME DA CATEGORIA
            let categoriaId = despesa.categoria_id || null;
            if (!categoriaId && despesa.categoria) {
                const categoriasUsuario = await this.carregarCategorias();
                const categoriaEncontrada = categoriasUsuario.find(c => c.nome === despesa.categoria);
                if (categoriaEncontrada) {
                    categoriaId = categoriaEncontrada.id;
                    console.log(`📁 Categoria mapeada: ${despesa.categoria} → ID ${categoriaId}`);
                }
            }

            // ✅ BUSCAR CARTAO_ID
            let cartaoId = despesa.cartao_id || null;

            // Se não tem cartao_id mas tem numeroCartao, buscar da API
            if (!cartaoId && despesa.numeroCartao) {
                const cartoesUsuario = await this.carregarCartoes();
                const numeroCartao = parseInt(despesa.numeroCartao);

                // numeroCartao é a posição do cartão (1, 2, 3...), mapear para ID real
                if (cartoesUsuario && cartoesUsuario.length >= numeroCartao) {
                    // Pegar o cartão na posição (numeroCartao - 1) porque array começa em 0
                    const cartaoEncontrado = cartoesUsuario[numeroCartao - 1];
                    if (cartaoEncontrado) {
                        cartaoId = cartaoEncontrado.id;
                        console.log(`💳 Cartão mapeado: posição ${numeroCartao} → ID ${cartaoId} (${cartaoEncontrado.nome})`);
                    }
                }

                // Se não encontrou, avisar mas continuar
                if (!cartaoId) {
                    console.warn(`⚠️ Cartão na posição ${numeroCartao} não encontrado, criando despesa sem cartão`);
                }
            }

            // Preparar dados para API
            const dadosDespesa = {
                descricao: despesa.descricao,
                valor: parseFloat(despesa.valor),
                data_vencimento: despesa.dataVencimento || despesa.data_vencimento || despesa.data,
                data_compra: despesa.dataCompra || despesa.data_compra || null,
                data_pagamento: despesa.dataPagamento || despesa.data_pagamento || null,
                mes: parseInt(mes),
                ano: parseInt(ano),
                categoria_id: categoriaId,
                cartao_id: cartaoId,
                forma_pagamento: despesa.formaPagamento || despesa.forma_pagamento || 'dinheiro',
                parcelado: despesa.parcelado || false,
                total_parcelas: despesa.totalParcelas || despesa.total_parcelas || null,
                parcela_atual: despesa.parcelaAtual || despesa.parcela_atual || null,
                pago: despesa.pago || despesa.quitado || false,
                observacoes: despesa.observacoes || '',
                valor_original: despesa.valorOriginal ? parseFloat(despesa.valorOriginal) : null,
                valor_total_com_juros: despesa.valorTotalComJuros ? parseFloat(despesa.valorTotalComJuros) : null,
                valor_pago: despesa.valorPago ? parseFloat(despesa.valorPago) : null
            };

            let response;
            if (ehEdicao) {
                // ✅ EDITAR DESPESA EXISTENTE
                response = await fetch(`${API_URL_DADOS}/despesas/${despesa.id || id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(dadosDespesa)
                });
            } else {
                // ✅ CRIAR NOVA DESPESA
                response = await fetch(`${API_URL_DADOS}/despesas`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(dadosDespesa)
                });
            }

            if (response.ok) {
                this.limparCache();
                return true;
            } else {
                const errorData = await response.json();
                console.error('❌ Erro ao salvar despesa:', errorData);
                return false;
            }
        } catch (error) {
            console.error('❌ Erro ao salvar despesa:', error);
            return false;
        }
    }

    async excluirReceita(mes, ano, index, opcao, descricao) {
        if (!this.inicializado) {
            await this.aguardarInicializacao();
        }

        return await this.excluirReceitaAPI(mes, ano, index, opcao, descricao);
    }

    async excluirReceitaAPI(mes, ano, index, opcao, descricao) {
        try {
            const dados = await this.getDadosFinanceirosUsuario();

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

            const sucesso = await this.salvarDadosAPI(dados);
            if (sucesso) {
                this.limparCache();
                await this.sincronizarComSistemaPrincipal();
            }
            return sucesso;
        } catch (error) {

            return false;
        }
    }

    async excluirDespesa(mes, ano, index, opcao, dados) {
        if (!this.inicializado) {
            await this.aguardarInicializacao();
        }

        return await this.excluirDespesaAPI(mes, ano, index, opcao, dados);
    }

    async excluirDespesaAPI(mes, ano, index, opcao, dados_params) {
        try {
            const dados = await this.getDadosFinanceirosUsuario();

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

            const sucesso = await this.salvarDadosAPI(dados);
            if (sucesso) {
                this.limparCache();
                await this.sincronizarComSistemaPrincipal();
            }
            return sucesso;
        } catch (error) {

            return false;
        }
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
    // CARREGAR CATEGORIAS E CARTÕES DA API
    // ================================================================

    async carregarCategorias() {
        try {
            const token = sessionStorage.getItem('token') || '';
            const response = await fetch(`${API_URL_DADOS}/categorias`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                return data.data || [];
            }
            return [];
        } catch (error) {
            console.error('❌ Erro ao carregar categorias:', error);
            return [];
        }
    }

    async carregarCartoes() {
        try {
            const token = sessionStorage.getItem('token') || '';
            const response = await fetch(`${API_URL_DADOS}/cartoes`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                return data.data || [];
            }
            return [];
        } catch (error) {
            console.error('❌ Erro ao carregar cartões:', error);
            return [];
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
            modo: 'API - Cloud Database',
            apiUrl: API_URL_DADOS,
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