// ================================================================
// SISTEMA PRINCIPAL - MAIN.JS REFATORADO
// Versão corrigida, compatível e sem dependências circulares
// ================================================================

console.log('🚀 Carregando Main.js refatorado...');

// ================================================================
// VARIÁVEIS GLOBAIS PRINCIPAIS
// ================================================================

let dadosFinanceiros = {};
let anoAtual = new Date().getFullYear();
let mesAtual = new Date().getMonth();
let mesAberto = null;
let anoAberto = null;

// Estados de controle centralizados
let sistemaInicializado = false;
let salvandoDados = false;
let timerSalvamento = null;

// Configurações da API
let apiClient = null;
let sistemaAdapter = null;
let useAPI = false;

// Sistema de inicialização por fases
const faseInicializacao = {
    AGUARDANDO_DOM: 'aguardando_dom',
    VERIFICANDO_API: 'verificando_api', 
    VERIFICANDO_ACESSO: 'verificando_acesso',
    CARREGANDO_DADOS: 'carregando_dados',
    CONFIGURANDO_UI: 'configurando_ui',
    INICIANDO_MODULOS: 'iniciando_modulos',
    CONCLUIDO: 'concluido'
};

let faseAtual = faseInicializacao.AGUARDANDO_DOM;

// ================================================================
// INICIALIZAÇÃO PRINCIPAL - SEM DEPENDÊNCIAS CIRCULARES
// ================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('📄 DOM carregado, iniciando sistema...');
    faseAtual = faseInicializacao.VERIFICANDO_API;
    
    try {
        await iniciarSistemaOrdenado();
    } catch (error) {
        console.error('❌ Erro crítico na inicialização:', error);
        exibirErroInicializacao(error);
    }
});

async function iniciarSistemaOrdenado() {
    console.log('🎯 Iniciando sistema em fases ordenadas...');
    
    // FASE 1: Verificar API (sem aguardar outros módulos)
    await verificarDisponibilidadeAPI();
    faseAtual = faseInicializacao.VERIFICANDO_ACESSO;
    
    // FASE 2: Verificar acesso do usuário
    if (!await verificarAcessoUsuario()) {
        return; // Para aqui se não tem acesso
    }
    faseAtual = faseInicializacao.CARREGANDO_DADOS;
    
    // FASE 3: Carregar dados essenciais
    await carregarDadosEssenciais();
    faseAtual = faseInicializacao.CONFIGURANDO_UI;
    
    // FASE 4: Configurar interface básica
    configurarInterfaceBasica();
    faseAtual = faseInicializacao.INICIANDO_MODULOS;
    
    // FASE 5: Exportar funções globais ANTES dos módulos
    exportarFuncoesGlobais();
    
    // FASE 6: Marcar sistema como inicializado
    sistemaInicializado = true;
    faseAtual = faseInicializacao.CONCLUIDO;
    
    // FASE 7: Notificar outros módulos que podem inicializar
    notificarSistemaReady();
    
    // FASE 8: Configurar interface avançada
    await configurarInterfaceAvancada();
    
    console.log('✅ Sistema principal inicializado completamente');
}

// ================================================================
// FASE 1: VERIFICAÇÃO DE API
// ================================================================

async function verificarDisponibilidadeAPI() {
    console.log('🔍 FASE 1: Verificando disponibilidade da API...');
    
    // Aguardar API estar disponível (máximo 3 segundos)
    const apiDisponivel = await aguardarAPIComTimeout();
    
    if (apiDisponivel && window.apiClient && window.sistemaAdapter) {
        try {
            apiClient = window.apiClient;
            sistemaAdapter = window.sistemaAdapter;
            useAPI = true;
            console.log('✅ API detectada e configurada');
        } catch (error) {
            console.error('❌ Erro ao configurar API:', error);
            useAPI = false;
        }
    } else {
        console.warn('⚠️ API não detectada, usando apenas localStorage');
        useAPI = false;
    }
    
    console.log('📊 Modo de operação:', useAPI ? 'API + LocalStorage' : 'LocalStorage');
}

function aguardarAPIComTimeout() {
    return new Promise((resolve) => {
        let tentativas = 0;
        const maxTentativas = 15; // 3 segundos
        
        function verificar() {
            tentativas++;
            
            if (window.apiClient && window.sistemaAdapter) {
                resolve(true);
            } else if (tentativas >= maxTentativas) {
                console.warn('⏰ Timeout aguardando API');
                resolve(false);
            } else {
                setTimeout(verificar, 200);
            }
        }
        
        verificar();
    });
}

// ================================================================
// FASE 2: VERIFICAÇÃO DE ACESSO
// ================================================================

async function verificarAcessoUsuario() {
    console.log('🔐 FASE 2: Verificando acesso do usuário...');
    
    // Verificação via API se disponível
    if (useAPI && apiClient) {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                console.log('❌ Token não encontrado');
                redirecionarParaLogin();
                return false;
            }
            
            await apiClient.verificarToken();
            console.log('✅ Token válido (API)');
            return true;
        } catch (error) {
            console.error('❌ Token inválido (API):', error);
            redirecionarParaLogin();
            return false;
        }
    }
    
    // Verificação local básica
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    if (!usuarioAtual) {
        console.log('❌ Usuário não logado');
        redirecionarParaLogin();
        return false;
    }
    
    console.log('✅ Acesso verificado (localStorage)');
    return true;
}

function redirecionarParaLogin() {
    const pathname = window.location.pathname;
    if (pathname.includes('index.html') || 
        pathname.includes('financeiro.html') ||
        pathname === '/' ||
        (!pathname.includes('login.html') && pathname.length > 1)) {
        console.log('🔄 Redirecionando para login...');
        window.location.href = 'login.html';
    }
}

// ================================================================
// FASE 3: CARREGAMENTO DE DADOS ESSENCIAIS
// ================================================================

async function carregarDadosEssenciais() {
    console.log('📊 FASE 3: Carregando dados essenciais...');
    
    if (useAPI && sistemaAdapter) {
        try {
            console.log('🌐 Tentando carregar dados da API...');
            dadosFinanceiros = await sistemaAdapter.carregarDadosFinanceiros();
            
            if (dadosFinanceiros && typeof dadosFinanceiros === 'object') {
                console.log('✅ Dados carregados da API');
                return;
            }
        } catch (error) {
            console.error('❌ Erro ao carregar dados da API:', error);
        }
    }
    
    // Fallback para dados locais
    console.log('💾 Carregando dados do localStorage...');
    carregarDadosLocal();
}

function carregarDadosLocal() {
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    
    if (!usuarioAtual) {
        console.error('❌ Nenhum usuário logado para carregar dados');
        dadosFinanceiros = criarEstruturaVazia();
        return;
    }

    try {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const usuario = usuarios.find(u => 
            u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual
        );
        
        if (usuario) {
            if (!usuario.dadosFinanceiros) {
                usuario.dadosFinanceiros = criarEstruturaVazia();
                localStorage.setItem('usuarios', JSON.stringify(usuarios));
                console.log('📁 Estrutura financeira inicial criada');
            }
            
            dadosFinanceiros = usuario.dadosFinanceiros;
            console.log('✅ Dados carregados do localStorage');
        } else {
            console.warn('⚠️ Usuário não encontrado, criando estrutura vazia');
            dadosFinanceiros = criarEstruturaVazia();
        }
    } catch (error) {
        console.error('❌ Erro ao carregar dados locais:', error);
        dadosFinanceiros = criarEstruturaVazia();
    }
}

function criarEstruturaVazia() {
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

// ================================================================
// FASE 4: CONFIGURAÇÃO DE INTERFACE BÁSICA
// ================================================================

function configurarInterfaceBasica() {
    console.log('🎨 FASE 4: Configurando interface básica...');
    
    try {
        // Configurar navegação
        setupNavigation();
        
        // Configurar controles de ano
        setupControlesAno();
        
        // Configurar modais básicos
        setupModaisBasicos();
        
        // Atualizar ano atual na interface
        atualizarElemento('ano-atual', anoAtual);
        
        console.log('✅ Interface básica configurada');
    } catch (error) {
        console.error('❌ Erro ao configurar interface básica:', error);
    }
}

function setupNavigation() {
    const toggleSidebar = document.getElementById('toggleSidebar');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (toggleSidebar && sidebar && mainContent) {
        toggleSidebar.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        });
    }
    
    // Configurar links de navegação
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Remover active de todos os links
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            // Esconder todas as seções
            document.querySelectorAll('section[id$="-section"]').forEach(section => {
                section.classList.remove('active');
            });
            
            // Mostrar seção correspondente
            const sectionId = link.getAttribute('data-section') + '-section';
            const section = document.getElementById(sectionId);
            if (section) {
                section.classList.add('active');
                
                // Ações específicas por seção
                onSecaoAtivada(link.getAttribute('data-section'));
            }
        });
    });
}

function onSecaoAtivada(secao) {
    switch (secao) {
        case 'meses':
            setTimeout(() => {
                renderizarMeses(anoAtual);
                atualizarResumoAnual(anoAtual);
            }, 100);
            break;
            
        case 'fin-sights':
            if (typeof onRevistaActivated === 'function') {
                setTimeout(() => onRevistaActivated(), 100);
            }
            break;
            
        case 'relatorios':
            // Notificar sistema de relatórios
            if (window.sistemaRelatoriosTelaCheia) {
                setTimeout(() => {
                    window.sistemaRelatoriosTelaCheia.carregarCategorias();
                }, 100);
            }
            break;
    }
}

function setupControlesAno() {
    // Botões de navegação de ano
    const btnAnoAnterior = document.getElementById('btn-ano-anterior');
    const btnProximoAno = document.getElementById('btn-proximo-ano');
    const btnNovoAno = document.getElementById('btn-novo-ano');
    const btnExcluirAno = document.getElementById('btn-excluir-ano-atual');
    
    if (btnAnoAnterior) {
        btnAnoAnterior.addEventListener('click', () => mudarAno(anoAtual - 1));
    }
    
    if (btnProximoAno) {
        btnProximoAno.addEventListener('click', () => mudarAno(anoAtual + 1));
    }
    
    if (btnNovoAno) {
        btnNovoAno.addEventListener('click', abrirModalNovoAno);
    }
    
    if (btnExcluirAno) {
        btnExcluirAno.addEventListener('click', () => excluirAno(anoAtual));
    }
    
    // Formulário de novo ano
    const formNovoAno = document.getElementById('form-novo-ano');
    if (formNovoAno) {
        formNovoAno.addEventListener('submit', criarNovoAno);
    }
}

function setupModaisBasicos() {
    // Configurar fechamento de modais
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', () => {
            const modal = closeBtn.closest('.modal');
            if (modal && modal.id !== 'modal-lock-screen') {
                modal.style.display = 'none';
            }
        });
    });

    // Fechar modal clicando fora
    window.addEventListener('click', event => {
        if (event.target.classList.contains('modal') && 
            event.target.id !== 'modal-lock-screen') {
            event.target.style.display = 'none';
        }
    });
}

// ================================================================
// FASE 5: EXPORTAÇÃO DE FUNÇÕES GLOBAIS
// ================================================================

function exportarFuncoesGlobais() {
    console.log('📤 FASE 5: Exportando funções globais...');
    
    // Dados principais
    window.dadosFinanceiros = dadosFinanceiros;
    window.anoAtual = anoAtual;
    window.mesAtual = mesAtual;
    window.mesAberto = mesAberto;
    window.anoAberto = anoAberto;
    
    // Estados de controle
    window.sistemaInicializado = sistemaInicializado;
    window.salvandoDados = salvandoDados;
    
    // Configurações da API
    window.apiClient = apiClient;
    window.sistemaAdapter = sistemaAdapter;
    window.useAPI = useAPI;
    
    // Funções essenciais
    window.formatarMoeda = formatarMoeda;
    window.formatarData = formatarData;
    window.gerarId = gerarId;
    window.salvarDados = salvarDados;
    window.garantirEstruturaDados = garantirEstruturaDados;
    
    // Funções de interface
    window.abrirModal = abrirModal;
    window.fecharModal = fecharModal;
    window.atualizarElemento = atualizarElemento;
    window.obterValorElemento = obterValorElemento;
    
    // Funções de gestão de dados
    window.mudarAno = mudarAno;
    window.criarAnoSimples = criarAnoSimples;
    window.excluirAno = excluirAno;
    window.calcularSaldoMes = calcularSaldoMes;
    
    // Funções de renderização
    window.abrirDetalhesDoMes = abrirDetalhesDoMes;
    window.renderizarMeses = renderizarMeses;
    window.renderizarDetalhesDoMes = renderizarDetalhesDoMes;
    window.carregarDadosDashboard = carregarDadosDashboard;
    window.atualizarResumoAnual = atualizarResumoAnual;
    
    console.log('✅ Funções globais exportadas');
}

// ================================================================
// FASE 6: NOTIFICAÇÃO PARA MÓDULOS
// ================================================================

function notificarSistemaReady() {
    console.log('📢 FASE 6: Notificando módulos que sistema está pronto...');
    
    // Disparar evento customizado
    const evento = new CustomEvent('sistemaFinanceiroReady', {
        detail: {
            faseAtual: faseAtual,
            sistemaInicializado: sistemaInicializado,
            useAPI: useAPI,
            dadosCarregados: !!dadosFinanceiros
        }
    });
    
    window.dispatchEvent(evento);
    
    // Aguardar um pouco para módulos processarem
    setTimeout(() => {
        console.log('⏰ Aguardando módulos iniciarem...');
    }, 500);
}

// ================================================================
// FASE 7: CONFIGURAÇÃO AVANÇADA
// ================================================================

async function configurarInterfaceAvancada() {
    console.log('🎨 FASE 7: Configurando interface avançada...');
    
    try {
        // Configurar transações rápidas
        configurarTransacoesRapidas();
        
        // Configurar abas
        configurarAbas();
        
        // Configurar outros controles
        configurarOutrosControles();
        
        // Configurar sistema de bloqueio
        configurarSistemaBloqueio();
        
        // Verificar se precisa criar ano
        if (!dadosFinanceiros[anoAtual]) {
            abrirModalNovoAno();
        } else {
            await carregarDadosDashboard(anoAtual);
            atualizarResumoAnual(anoAtual);
            renderizarMeses(anoAtual);
        }
        
        console.log('✅ Interface avançada configurada');
        
    } catch (error) {
        console.error('❌ Erro na configuração avançada:', error);
    }
}

// ================================================================
// SALVAMENTO DE DADOS - THREAD-SAFE
// ================================================================

async function salvarDados() {
    if (salvandoDados) {
        console.log('⏳ Salvamento já em progresso, aguardando...');
        return await aguardarSalvamento();
    }
    
    if (timerSalvamento) {
        clearTimeout(timerSalvamento);
    }
    
    return new Promise((resolve) => {
        timerSalvamento = setTimeout(async () => {
            salvandoDados = true;
            let sucesso = false;
            
            try {
                // Tentar salvar via API primeiro
                if (useAPI && sistemaAdapter) {
                    console.log('💾 Salvando via API...');
                    sucesso = await sistemaAdapter.salvarDadosUsuario(dadosFinanceiros);
                    
                    if (sucesso) {
                        console.log('✅ Dados salvos via API');
                    } else {
                        console.warn('⚠️ Falha na API, tentando localStorage...');
                        sucesso = await salvarDadosLocal();
                    }
                } else {
                    sucesso = await salvarDadosLocal();
                }
                
            } catch (error) {
                console.error('❌ Erro durante salvamento:', error);
                sucesso = await salvarDadosLocal();
            } finally {
                salvandoDados = false;
                resolve(sucesso);
            }
        }, 300); // Debounce de 300ms
    });
}

async function aguardarSalvamento() {
    let tentativas = 0;
    const maxTentativas = 20; // 4 segundos
    
    while (salvandoDados && tentativas < maxTentativas) {
        await new Promise(resolve => setTimeout(resolve, 200));
        tentativas++;
    }
    
    return !salvandoDados;
}

async function salvarDadosLocal() {
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    
    if (!usuarioAtual) {
        console.error('❌ Usuário não logado para salvamento');
        return false;
    }

    try {
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
        
        console.error('❌ Usuário não encontrado para salvamento');
        return false;
        
    } catch (error) {
        console.error('❌ Erro ao salvar no localStorage:', error);
        return false;
    }
}

// ================================================================
// GESTÃO DE ANOS
// ================================================================

async function mudarAno(ano) {
    try {
        if (!dadosFinanceiros[ano]) {
            if (confirm(`O ano ${ano} ainda não foi configurado. Deseja criar agora?`)) {
                await criarAnoSimples(ano);
            }
            return;
        }
        
        anoAtual = ano;
        window.anoAtual = anoAtual;
        atualizarElemento('ano-atual', anoAtual);
        
        await carregarDadosDashboard(anoAtual);
        atualizarResumoAnual(anoAtual);
        renderizarMeses(anoAtual);
        
    } catch (error) {
        console.error('❌ Erro ao mudar ano:', error);
        alert('Erro ao mudar ano: ' + error.message);
    }
}

async function criarAnoSimples(ano) {
    try {
        if (dadosFinanceiros[ano]) {
            alert(`O ano ${ano} já existe!`);
            return;
        }
        
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
        
        await salvarDados();
        
        anoAtual = ano;
        window.anoAtual = anoAtual;
        atualizarElemento('ano-atual', anoAtual);
        
        await carregarDadosDashboard(anoAtual);
        atualizarResumoAnual(anoAtual);
        renderizarMeses(anoAtual);
        
        alert(`Ano ${ano} criado com sucesso!`);
        
    } catch (error) {
        console.error('❌ Erro ao criar ano:', error);
        alert('Erro ao criar ano: ' + error.message);
    }
}

async function criarNovoAno(e) {
    e.preventDefault();
    
    try {
        const ano = parseInt(obterValorElemento('ano'));
        
        if (isNaN(ano) || ano < 2020 || ano > 2050) {
            alert('Por favor, informe um ano válido entre 2020 e 2050.');
            return;
        }
        
        await criarAnoSimples(ano);
        fecharModal('modal-novo-ano');
        
    } catch (error) {
        console.error('❌ Erro ao criar novo ano:', error);
        alert('Erro ao criar novo ano: ' + error.message);
    }
}

async function excluirAno(ano) {
    try {
        if (!dadosFinanceiros[ano]) {
            alert(`O ano ${ano} não existe!`);
            return;
        }

        if (!confirm(`Tem certeza que deseja excluir todos os dados do ano ${ano}?\n\nEsta ação não pode ser desfeita!`)) {
            return;
        }
        
        if (!confirm(`CONFIRMAÇÃO FINAL: Excluir definitivamente o ano ${ano}?`)) {
            return;
        }

        delete dadosFinanceiros[ano];
        await salvarDados();
        
        // Se excluiu o ano atual, voltar para ano atual
        if (ano === anoAtual) {
            anoAtual = new Date().getFullYear();
            window.anoAtual = anoAtual;
            atualizarElemento('ano-atual', anoAtual);
            
            if (!dadosFinanceiros[anoAtual]) {
                abrirModalNovoAno();
            } else {
                await carregarDadosDashboard(anoAtual);
                atualizarResumoAnual(anoAtual);
                renderizarMeses(anoAtual);
            }
        } else {
            await carregarDadosDashboard(anoAtual);
            atualizarResumoAnual(anoAtual);
            renderizarMeses(anoAtual);
        }
        
        alert(`O ano ${ano} foi excluído com sucesso!`);
        
    } catch (error) {
        console.error('❌ Erro ao excluir ano:', error);
        alert('Erro ao excluir ano: ' + error.message);
    }
}

function abrirModalNovoAno() {
    const inputAno = document.getElementById('ano');
    if (inputAno) {
        inputAno.value = anoAtual;
    }
    abrirModal('modal-novo-ano');
}

// ================================================================
// RENDERIZAÇÃO DE MESES
// ================================================================

function renderizarMeses(ano) {
    try {
        const mesesContainer = document.querySelector('.meses-container');
        if (!mesesContainer) {
            console.warn('⚠️ Container de meses não encontrado');
            return;
        }
        
        mesesContainer.innerHTML = '';
        
        for (let i = 0; i < 12; i++) {
            const mesCard = criarCardMes(i, ano);
            mesesContainer.appendChild(mesCard);
        }
        
        console.log(`✅ ${12} meses renderizados para o ano ${ano}`);
        
    } catch (error) {
        console.error('❌ Erro ao renderizar meses:', error);
    }
}

function criarCardMes(mes, ano) {
    const mesCard = document.createElement('div');
    mesCard.className = 'mes-card';
    mesCard.dataset.mes = mes;
    mesCard.dataset.ano = ano;
    
    const saldo = calcularSaldoMes(mes, ano);
    const dadosMes = dadosFinanceiros[ano]?.meses[mes];
    const fechado = dadosMes?.fechado || false;
    const temTransacoes = (saldo.receitas > 0 || saldo.despesas > 0);
    
    // Aplicar classes de status
    if (fechado) {
        mesCard.classList.add('mes-fechado');
    } else if (temTransacoes) {
        mesCard.classList.add('mes-ativo');
    } else {
        mesCard.classList.add('mes-vazio');
    }
    
    preencherConteudoMes(mesCard, mes, ano, saldo, fechado, temTransacoes);
    
    // Event listener para abrir detalhes
    mesCard.addEventListener('click', () => abrirDetalhesDoMes(mes, ano));
    
    return mesCard;
}

function preencherConteudoMes(mesCard, mes, ano, saldo, fechado, temTransacoes) {
    const template = document.getElementById('template-mes-card');
    if (!template) {
        console.error('❌ Template mes-card não encontrado');
        mesCard.innerHTML = `<p>Erro: Template não encontrado</p>`;
        return;
    }
    
    const clone = template.content.cloneNode(true);
    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                       'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    // Preencher dados básicos
    clone.querySelector('.mes-nome').textContent = nomesMeses[mes];
    
    // Saldo anterior
    const saldoAnteriorDiv = clone.querySelector('.mes-saldo-anterior');
    if (saldo.saldoAnterior !== 0) {
        saldoAnteriorDiv.classList.remove('hidden');
        const valorAnterior = clone.querySelector('.valor-anterior');
        valorAnterior.textContent = formatarMoeda(saldo.saldoAnterior);
        valorAnterior.className = `valor-anterior ${saldo.saldoAnterior >= 0 ? 'positivo' : 'negativo'}`;
    }
    
    // Valores do mês
    clone.querySelector('.mes-receita').textContent = formatarMoeda(saldo.receitas);
    clone.querySelector('.mes-despesa').textContent = formatarMoeda(saldo.despesas);
    
    const saldoValor = clone.querySelector('.mes-saldo-valor');
    saldoValor.textContent = formatarMoeda(saldo.saldoFinal);
    saldoValor.className = `mes-saldo-valor ${saldo.saldoFinal >= 0 ? 'mes-saldo-positivo' : 'mes-saldo-negativo'}`;
    
    // Configurar botões
    const btnReabrir = clone.querySelector('.btn-reabrir');
    const btnFechar = clone.querySelector('.btn-fechar');
    const btnDetalhes = clone.querySelector('.btn-detalhes');
    
    if (fechado) {
        btnReabrir.classList.remove('hidden');
        btnReabrir.onclick = (e) => {
            e.stopPropagation();
            reabrirMes(mes, ano);
        };
    } else if (temTransacoes) {
        btnFechar.classList.remove('hidden');
        btnFechar.onclick = (e) => {
            e.stopPropagation();
            fecharMes(mes, ano);
        };
    }
    
    btnDetalhes.onclick = (e) => {
        e.stopPropagation();
        abrirDetalhesDoMes(mes, ano);
    };
    
    mesCard.appendChild(clone);
}

// ================================================================
// DETALHES DO MÊS
// ================================================================

function abrirDetalhesDoMes(mes, ano) {
    try {
        mesAberto = mes;
        anoAberto = ano;
        
        // Atualizar variáveis globais
        window.mesAberto = mesAberto;
        window.anoAberto = anoAberto;
        
        const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                           'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        
        atualizarElemento('detalhes-mes-titulo', `${nomesMeses[mes]} de ${ano}`);
        
        renderizarDetalhesDoMes(mes, ano);
        ativarPrimeiraAba();
        configurarBotoesModal();
        
        // Configurar filtros após renderização
        setTimeout(() => {
            if (typeof window.criarFiltrosCategorias === 'function') {
                window.criarFiltrosCategorias(mes, ano);
            }
            if (typeof window.criarFiltrosFormaPagamento === 'function') {
                window.criarFiltrosFormaPagamento(mes, ano);
            }
            if (typeof window.criarFiltrosStatus === 'function') {
                window.criarFiltrosStatus();
            }
        }, 100);
        
        abrirModal('modal-detalhes-mes');
        
    } catch (error) {
        console.error('❌ Erro ao abrir detalhes do mês:', error);
        alert('Erro ao abrir detalhes do mês: ' + error.message);
    }
}

function renderizarDetalhesDoMes(mes, ano) {
    try {
        const dadosMes = obterDadosMes(ano, mes);
        const saldo = calcularSaldoMes(mes, ano);
        const totalJuros = typeof window.calcularTotalJuros === 'function' ?
                          window.calcularTotalJuros(dadosMes.despesas || []) : 0;
        const fechado = dadosMes.fechado || false;
        
        atualizarResumoDetalhes(saldo, totalJuros);
        atualizarTituloDetalhes(mes, ano, fechado);
        
        // Renderizar receitas
        if (typeof window.renderizarReceitas === 'function') {
            window.renderizarReceitas(dadosMes.receitas, fechado);
        }
        
        // Renderizar despesas
        if (typeof window.renderizarDespesas === 'function') {
            window.renderizarDespesas(dadosMes.despesas, mes, ano, fechado);
        }
        
        // Atualizar contadores
        if (typeof window.atualizarContadoresFiltro === 'function') {
            window.atualizarContadoresFiltro();
        }
        
    } catch (error) {
        console.error('❌ Erro ao renderizar detalhes do mês:', error);
    }
}

function obterDadosMes(ano, mes) {
    return (dadosFinanceiros[ano] && dadosFinanceiros[ano].meses[mes]) ||
           { receitas: [], despesas: [], fechado: false };
}

function atualizarTituloDetalhes(mes, ano, fechado) {
    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                       'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const titulo = document.getElementById('detalhes-mes-titulo');
    if (titulo) {
        const icone = fechado ? '<i class="fas fa-lock"></i>' : '<i class="fas fa-chart-bar"></i>';
        const status = fechado ? ' (Fechado)' : '';
        titulo.innerHTML = `${icone} ${nomesMeses[mes]} de ${ano}${status}`;
    }
}

function atualizarResumoDetalhes(saldo, totalJuros) {
    atualizarElemento('resumo-receitas', formatarMoeda(saldo.receitas));
    atualizarElemento('resumo-despesas', formatarMoeda(saldo.despesas));
    atualizarElemento('resumo-juros', formatarMoeda(totalJuros));
    
    const saldoElement = document.getElementById('resumo-saldo');
    if (saldoElement) {
        saldoElement.textContent = formatarMoeda(saldo.saldoFinal);
        saldoElement.className = saldo.saldoFinal >= 0 ? 'saldo-positivo' : 'saldo-negativo';
    }
}

// ================================================================
// DASHBOARD
// ================================================================

async function carregarDadosDashboard(ano) {
    try {
        if (useAPI && sistemaAdapter) {
            console.log('📊 Carregando dashboard da API...');
            const dashboardData = await sistemaAdapter.getDashboardData(ano);
            if (dashboardData) {
                atualizarElementosDashboard(dashboardData);
                console.log('✅ Dashboard carregado da API');
                return;
            }
        }
        
        // Fallback para cálculo local
        console.log('📊 Calculando dashboard localmente...');
        carregarDadosDashboardLocal(ano);
        
    } catch (error) {
        console.error('❌ Erro ao carregar dashboard:', error);
        carregarDadosDashboardLocal(ano);
    }
}

function carregarDadosDashboardLocal(ano) {
    if (!dadosFinanceiros[ano]) {
        atualizarElementosDashboard({ totalReceitas: 0, totalDespesas: 0, totalJuros: 0, saldo: 0 });
        return;
    }
    
    let totalReceitas = 0;
    let totalDespesas = 0;
    let totalJuros = 0;
    
    for (let mes = 0; mes < 12; mes++) {
        const dadosMes = dadosFinanceiros[ano].meses[mes] || { receitas: [], despesas: [] };
        
        // Calcular receitas
        if (typeof window.calcularTotalReceitas === 'function') {
            totalReceitas += window.calcularTotalReceitas(dadosMes.receitas);
        } else {
            totalReceitas += dadosMes.receitas.reduce((sum, r) => sum + (r.valor || 0), 0);
        }
        
        // Calcular despesas
        if (typeof window.calcularTotalDespesas === 'function') {
            totalDespesas += window.calcularTotalDespesas(dadosMes.despesas);
        } else {
            totalDespesas += dadosMes.despesas.reduce((sum, d) => sum + (d.valor || 0), 0);
        }
        
        // Calcular juros
        if (typeof window.calcularTotalJuros === 'function') {
            totalJuros += window.calcularTotalJuros(dadosMes.despesas);
        }
    }
    
    const saldoAnual = totalReceitas - totalDespesas;
    
    atualizarElementosDashboard({
        totalReceitas,
        totalDespesas,
        totalJuros,
        saldo: saldoAnual
    });
}

function atualizarElementosDashboard(dados) {
    atualizarElemento('dashboard-total-receitas', formatarMoeda(dados.totalReceitas));
    atualizarElemento('dashboard-total-despesas', formatarMoeda(dados.totalDespesas));
    atualizarElemento('dashboard-total-juros', formatarMoeda(dados.totalJuros || 0));
    
    const saldoElement = document.getElementById('dashboard-saldo-anual');
    if (saldoElement) {
        saldoElement.textContent = formatarMoeda(dados.saldo);
        saldoElement.className = dados.saldo >= 0 ? 'saldo-positivo' : 'saldo-negativo';
    }
}

async function atualizarResumoAnual(ano) {
    await carregarDadosDashboard(ano);
}

// ================================================================
// CÁLCULO DE SALDO DO MÊS
// ================================================================

function calcularSaldoMes(mes, ano) {
    try {
        // Se função específica existir em receitas.js, usar ela
        if (typeof window.calcularSaldoMes === 'function' && window.calcularSaldoMes !== calcularSaldoMes) {
            return window.calcularSaldoMes(mes, ano);
        }
        
        const dadosMes = obterDadosMes(ano, mes);
        
        // Calcular saldo anterior
        const saldoAnterior = obterSaldoAnterior(mes, ano);
        
        // Calcular receitas
        const receitas = typeof window.calcularTotalReceitas === 'function' ?
                        window.calcularTotalReceitas(dadosMes.receitas || []) :
                        (dadosMes.receitas || []).reduce((sum, r) => sum + (r.valor || 0), 0);
        
        // Calcular despesas
        const despesas = typeof window.calcularTotalDespesas === 'function' ?
                        window.calcularTotalDespesas(dadosMes.despesas || []) :
                        (dadosMes.despesas || []).reduce((sum, d) => sum + (d.valor || 0), 0);
        
        return {
            saldoAnterior: saldoAnterior,
            receitas: receitas,
            despesas: despesas,
            saldoFinal: saldoAnterior + receitas - despesas
        };
        
    } catch (error) {
        console.error('❌ Erro ao calcular saldo do mês:', error);
        return { saldoAnterior: 0, receitas: 0, despesas: 0, saldoFinal: 0 };
    }
}

function obterSaldoAnterior(mes, ano) {
    let mesAnterior = mes - 1;
    let anoAnterior = ano;
    
    if (mes === 0) {
        mesAnterior = 11;
        anoAnterior = ano - 1;
    }
    
    if (!dadosFinanceiros[anoAnterior] || !dadosFinanceiros[anoAnterior].meses) {
        return 0;
    }
    
    const dadosMesAnterior = dadosFinanceiros[anoAnterior].meses[mesAnterior];
    
    if (dadosMesAnterior && dadosMesAnterior.fechado === true) {
        return dadosMesAnterior.saldoFinal || 0;
    }
    
    return 0;
}

// ================================================================
// CONFIGURAÇÕES AVANÇADAS DA INTERFACE
// ================================================================

function configurarTransacoesRapidas() {
    const btnAdicionarReceitaRapida = document.getElementById('btn-adicionar-receita-rapida');
    const btnAdicionarDespesaRapida = document.getElementById('btn-adicionar-despesa-rapida');
    const modalSelecionarMes = document.getElementById('modal-selecionar-mes');

    if (!btnAdicionarReceitaRapida || !btnAdicionarDespesaRapida || !modalSelecionarMes) {
        return; // Elementos não encontrados
    }

    const seletorMesGrid = document.getElementById('seletor-mes-rapido-grid');
    const tipoTransacaoRapidaInput = document.getElementById('tipo-transacao-rapida');
    const selecionarMesTitulo = document.getElementById('selecionar-mes-titulo');
    const spanCloseSeletorMes = modalSelecionarMes.querySelector('.close');

    const abrirModalSelecaoMes = (tipo) => {
        tipoTransacaoRapidaInput.value = tipo;
        selecionarMesTitulo.textContent = `Adicionar ${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`;
        modalSelecionarMes.style.display = 'block';
    };

    btnAdicionarReceitaRapida.addEventListener('click', () => abrirModalSelecaoMes('receita'));
    btnAdicionarDespesaRapida.addEventListener('click', () => abrirModalSelecaoMes('despesa'));
    
    if (spanCloseSeletorMes) {
        spanCloseSeletorMes.addEventListener('click', () => {
            modalSelecionarMes.style.display = 'none';
        });
    }

    if (seletorMesGrid) {
        seletorMesGrid.addEventListener('click', function(e) {
            const botaoMes = e.target.closest('.mes-btn');
            if (!botaoMes) return;

            const mesSelecionado = parseInt(botaoMes.dataset.mes);
            const tipo = tipoTransacaoRapidaInput.value;
            
            modalSelecionarMes.style.display = 'none';

            mesAberto = mesSelecionado;
            anoAberto = anoAtual;
            window.mesAberto = mesAberto;
            window.anoAberto = anoAberto;

            if (tipo === 'receita' && typeof window.abrirModalNovaReceita === 'function') {
                window.abrirModalNovaReceita();
            } else if (tipo === 'despesa' && typeof window.abrirModalNovaDespesa === 'function') {
                window.abrirModalNovaDespesa();
            }
        });
    }
}

function configurarAbas() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Remover active de todas as abas
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            // Ativar aba clicada
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            const tabContent = document.getElementById(tabId);
            if (tabContent) {
                tabContent.classList.add('active');
            }
        });
    });
}

function configurarOutrosControles() {
    // Botão de refresh
    const refreshBtn = document.getElementById('btn-refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async function() {
            try {
                const activeSection = document.querySelector('section.active');
                if (activeSection) {
                    const sectionId = activeSection.id;
                    switch(sectionId) {
                        case 'dashboard-section':
                            await carregarDadosDashboard(anoAtual);
                            atualizarResumoAnual(anoAtual);
                            break;
                        case 'meses-section':
                            renderizarMeses(anoAtual);
                            atualizarResumoAnual(anoAtual);
                            break;
                        case 'poupanca-section':
                            if (typeof window.atualizarResumo === 'function') {
                                window.atualizarResumo();
                                window.atualizarHistoricoTransacoes();
                            }
                            break;
                    }
                }
            } catch (error) {
                console.error('❌ Erro no refresh:', error);
            }
        });
    }

    // Botão de logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            
            try {
                // Logout via API se disponível
                if (useAPI && apiClient && typeof apiClient.logout === 'function') {
                    console.log('🚪 Fazendo logout via API...');
                    await apiClient.logout();
                }
            } catch (error) {
                console.error('❌ Erro no logout via API:', error);
            }
            
            // Limpar dados locais
            sessionStorage.removeItem('usuarioAtual');
            sessionStorage.removeItem('dadosUsuarioLogado');
            localStorage.removeItem('token');
            
            console.log('🚪 Redirecionando para login...');
            window.location.href = 'login.html';
        });
    }
}

function configurarSistemaBloqueio() {
    const lockButton = document.getElementById('btn-lock-system');
    const lockForm = document.getElementById('form-lock-screen');
    const overlay = document.getElementById('lock-screen-overlay');
    const modal = document.getElementById('modal-lock-screen');

    if (!lockButton || !lockForm || !overlay || !modal) {
        return; // Elementos não encontrados
    }

    const passwordInput = document.getElementById('lock-screen-password');
    const modalContent = modal.querySelector('.modal-content');
    let inactivityTimer;

    const lockSystem = () => {
        if (modal.classList.contains('visible')) return;
        
        overlay.classList.add('visible');
        modal.classList.add('visible');
        document.body.classList.add('body-locked');
        
        if (passwordInput) {
            passwordInput.value = '';
            setTimeout(() => passwordInput.focus(), 100);
        }
    };

    const unlockSystem = () => {
        overlay.classList.remove('visible');
        modal.classList.remove('visible');
        document.body.classList.remove('body-locked');
        resetInactivityTimer();
    };

    const handleUnlockAttempt = async (event) => {
        event.preventDefault();
        
        if (!passwordInput) return;
        
        const enteredPassword = passwordInput.value;
        if (!enteredPassword) {
            alert('Por favor, digite sua senha.');
            return;
        }
        
        try {
            let senhaCorreta = false;
            
            // Verificar via API primeiro
            if (useAPI && apiClient && apiClient.usuarioAtual) {
                senhaCorreta = apiClient.usuarioAtual.senha === enteredPassword;
            }
            
            // Fallback para dados locais
            if (!senhaCorreta) {
                const usuario = obterUsuarioAtualLocal();
                if (usuario && (usuario.password === enteredPassword || usuario.senha === enteredPassword)) {
                    senhaCorreta = true;
                }
            }
            
            if (senhaCorreta) {
                unlockSystem();
            } else {
                // Animação de erro
                if (modalContent) {
                    modalContent.classList.add('shake-animation');
                    setTimeout(() => modalContent.classList.remove('shake-animation'), 500);
                }
                passwordInput.value = '';
                passwordInput.focus();
            }
            
        } catch (error) {
            console.error('❌ Erro na verificação de senha:', error);
            alert('Erro ao verificar senha. Tente novamente.');
        }
    };

    const resetInactivityTimer = () => {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            lockSystem();
        }, 2 * 60 * 1000); // 2 minutos
    };

    // Event listeners
    lockButton.addEventListener('click', lockSystem);
    lockForm.addEventListener('submit', handleUnlockAttempt);

    // Timer de inatividade
    ['mousemove', 'keydown', 'scroll', 'click'].forEach(evento => {
        window.addEventListener(evento, resetInactivityTimer);
    });

    resetInactivityTimer();
}

function obterUsuarioAtualLocal() {
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    if (!usuarioAtual) return null;
    
    try {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        return usuarios.find(u => u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual);
    } catch (error) {
        console.error('❌ Erro ao obter usuário local:', error);
        return null;
    }
}

// ================================================================
// CONFIGURAÇÃO DE MODAIS E ABAS
// ================================================================

function ativarPrimeiraAba() {
    // Remover active de todas as abas
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Ativar primeira aba
    const primeiraAba = document.querySelector('.tab-btn[data-tab="tab-resumo"]');
    const primeiroConteudo = document.getElementById('tab-resumo');
    
    if (primeiraAba) primeiraAba.classList.add('active');
    if (primeiroConteudo) primeiroConteudo.classList.add('active');
}

function configurarBotoesModal() {
    // Botões de adicionar dentro dos modais
    configurarBotao('btn-nova-receita', () => {
        if (typeof window.abrirModalNovaReceita === 'function') {
            window.abrirModalNovaReceita();
        }
    });
    
    configurarBotao('btn-nova-despesa', () => {
        if (typeof window.abrirModalNovaDespesa === 'function') {
            window.abrirModalNovaDespesa();
        }
    });
    
    // Controles de despesas em lote
    const checkboxTodasDespesas = document.getElementById('pagar-despesas-em-lote');
    if (checkboxTodasDespesas) {
        checkboxTodasDespesas.addEventListener('change', function() {
            const btnPagarEmLote = document.getElementById('btn-pagar-em-lote');
            if (btnPagarEmLote) {
                btnPagarEmLote.disabled = !this.checked;
            }
            
            const checkboxes = document.querySelectorAll('.despesa-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = this.checked;
            });
        });
    }
    
    configurarBotao('btn-pagar-em-lote', () => {
        if (typeof window.pagarDespesasEmLote === 'function') {
            window.pagarDespesasEmLote();
        }
    });
    
    configurarBotao('btn-limpar-filtros', () => {
        if (typeof window.limparFiltros === 'function') {
            window.limparFiltros();
        }
    });
}

function configurarBotao(id, callback) {
    const botao = document.getElementById(id);
    if (botao && callback) {
        // Remover listeners antigos clonando
        const novoBotao = botao.cloneNode(true);
        botao.parentNode.replaceChild(novoBotao, botao);
        
        // Adicionar novo listener
        document.getElementById(id).addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            callback();
        });
    }
}

// ================================================================
// FUNÇÕES UTILITÁRIAS
// ================================================================

function garantirEstruturaDados(ano, mes) {
    if (!dadosFinanceiros[ano]) {
        dadosFinanceiros[ano] = { meses: [] };
    }
    
    if (!dadosFinanceiros[ano].meses[mes]) {
        dadosFinanceiros[ano].meses[mes] = { 
            receitas: [], 
            despesas: [],
            fechado: false,
            saldoAnterior: 0,
            saldoFinal: 0
        };
    }
}

function formatarMoeda(valor) {
    try {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(valor || 0);
    } catch (error) {
        return `R$ ${(valor || 0).toFixed(2)}`;
    }
}

function formatarData(dataString) {
    try {
        const data = new Date(dataString);
        return data.toLocaleDateString('pt-BR');
    } catch (error) {
        console.error('❌ Erro ao formatar data:', error);
        return 'Data inválida';
    }
}

function gerarId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${timestamp}-${random}`;
}

function atualizarElemento(id, valor) {
    const elemento = document.getElementById(id);
    if (elemento) {
        elemento.textContent = valor;
    }
}

function obterValorElemento(id) {
    const elemento = document.getElementById(id);
    return elemento ? elemento.value : '';
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
    }
}

function fecharModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// ================================================================
// GERENCIAMENTO DE ERROS
// ================================================================

function exibirErroInicializacao(error) {
    console.error('❌ ERRO CRÍTICO DE INICIALIZAÇÃO:', error);
    
    // Criar overlay de erro
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(220, 53, 69, 0.9);
        color: white;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        font-family: Arial, sans-serif;
    `;
    
    overlay.innerHTML = `
        <div style="text-align: center; max-width: 500px; padding: 20px;">
            <h2>❌ Erro na Inicialização</h2>
            <p>O sistema encontrou um erro durante a inicialização:</p>
            <pre style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px; margin: 20px 0;">
                ${error.message || error}
            </pre>
            <p><strong>Fase atual:</strong> ${faseAtual}</p>
            <button onclick="window.location.reload()" style="
                background: white;
                color: #dc3545;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
                font-weight: bold;
                margin-top: 20px;
            ">🔄 Recarregar Página</button>
        </div>
    `;
    
    document.body.appendChild(overlay);
}

// ================================================================
// COMPATIBILIDADE COM MÓDULOS EXTERNOS
// ================================================================

// Funções que os módulos externos esperam encontrar
function reabrirMes(mes, ano) {
    if (typeof window.reabrirMes === 'function' && window.reabrirMes !== reabrirMes) {
        return window.reabrirMes(mes, ano);
    }
    
    console.log(`🔓 Reabrindo mês ${mes}/${ano}...`);
    // Implementação básica caso receitas.js não esteja carregado
    alert('Sistema de receitas não carregado completamente.');
}

function fecharMes(mes, ano) {
    if (typeof window.fecharMes === 'function' && window.fecharMes !== fecharMes) {
        return window.fecharMes(mes, ano);
    }
    
    console.log(`🔒 Fechando mês ${mes}/${ano}...`);
    // Implementação básica caso receitas.js não esteja carregado
    alert('Sistema de receitas não carregado completamente.');
}

// ================================================================
// SISTEMA DE LOG E DIAGNÓSTICO
// ================================================================

function diagnosticoSistema() {
    const diagnostico = {
        timestamp: new Date().toISOString(),
        faseAtual: faseAtual,
        sistemaInicializado: sistemaInicializado,
        useAPI: useAPI,
        dadosCarregados: Object.keys(dadosFinanceiros).length > 0,
        usuarioLogado: !!sessionStorage.getItem('usuarioAtual'),
        modulosDetectados: {
            usuarioDados: typeof window.usuarioDados !== 'undefined',
            receitas: typeof window.abrirModalNovaReceita === 'function',
            despesas: typeof window.abrirModalNovaDespesa === 'function',
            configuracoes: typeof window.iniciarCategorias === 'function',
            notificacoes: typeof window.SistemaNotificacoes !== 'undefined'
        },
        apis: {
            apiClient: !!window.apiClient,
            sistemaAdapter: !!window.sistemaAdapter
        }
    };
    
    console.log('🔍 Diagnóstico do Sistema:', diagnostico);
    return diagnostico;
}

// ================================================================
// INTERFACE PÚBLICA PARA COMPATIBILIDADE
// ================================================================

// Função que outros módulos podem usar para verificar se o sistema está pronto
window.aguardarSistemaReady = function() {
    return new Promise((resolve) => {
        if (sistemaInicializado) {
            resolve(true);
            return;
        }
        
        let tentativas = 0;
        const maxTentativas = 50; // 10 segundos
        
        const verificar = () => {
            tentativas++;
            
            if (sistemaInicializado) {
                resolve(true);
            } else if (tentativas >= maxTentativas) {
                console.warn('⏰ Timeout aguardando sistema estar pronto');
                resolve(false);
            } else {
                setTimeout(verificar, 200);
            }
        };
        
        verificar();
    });
};

// Função para módulos verificarem compatibilidade
window.verificarCompatibilidadeModulo = function(nomeModulo, dependencias = []) {
    const problemas = [];
    
    dependencias.forEach(dep => {
        if (typeof window[dep] === 'undefined') {
            problemas.push(`Dependência não encontrada: ${dep}`);
        }
    });
    
    if (!sistemaInicializado) {
        problemas.push('Sistema principal não inicializado');
    }
    
    if (problemas.length > 0) {
        console.warn(`⚠️ Problemas de compatibilidade em ${nomeModulo}:`, problemas);
        return false;
    }
    
    console.log(`✅ Módulo ${nomeModulo} compatível`);
    return true;
};

// ================================================================
// MÉTODO DE ATUALIZAÇÃO FORÇADA
// ================================================================

window.forcarAtualizacaoSistema = async function() {
    console.log('🔄 Forçando atualização do sistema...');
    
    try {
        // Limpar caches
        if (window.usuarioDataManager && typeof window.usuarioDataManager.limparCache === 'function') {
            window.usuarioDataManager.limparCache();
        }
        
        // Recarregar dados
        await carregarDadosEssenciais();
        
        // Atualizar interface
        await carregarDadosDashboard(anoAtual);
        atualizarResumoAnual(anoAtual);
        renderizarMeses(anoAtual);
        
        console.log('✅ Sistema atualizado com sucesso');
        
    } catch (error) {
        console.error('❌ Erro na atualização forçada:', error);
        alert('Erro ao atualizar sistema: ' + error.message);
    }
};

// ================================================================
// SISTEMA DE LOG CENTRALIZADO
// ================================================================

window.logSistema = function(nivel, modulo, mensagem, dados = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        nivel,
        modulo,
        mensagem,
        dados,
        faseAtual,
        sistemaInicializado
    };
    
    switch (nivel) {
        case 'error':
            console.error(`❌ [${modulo}] ${mensagem}`, dados);
            break;
        case 'warn':
            console.warn(`⚠️ [${modulo}] ${mensagem}`, dados);
            break;
        case 'info':
            console.log(`ℹ️ [${modulo}] ${mensagem}`, dados);
            break;
        default:
            console.log(`📝 [${modulo}] ${mensagem}`, dados);
    }
    
    // Salvar logs críticos
    if (nivel === 'error') {
        try {
            const logs = JSON.parse(localStorage.getItem('logs_sistema')) || [];
            logs.unshift(logEntry);
            
            // Manter apenas últimos 50 logs
            if (logs.length > 50) {
                logs.splice(50);
            }
            
            localStorage.setItem('logs_sistema', JSON.stringify(logs));
        } catch (error) {
            console.error('❌ Erro ao salvar log:', error);
        }
    }
};

// ================================================================
// FUNÇÕES PÚBLICAS PARA DEBUG
// ================================================================

window.debugSistema = {
    obterLogs: () => {
        try {
            return JSON.parse(localStorage.getItem('logs_sistema')) || [];
        } catch {
            return [];
        }
    },
    
    limparLogs: () => {
        localStorage.removeItem('logs_sistema');
        console.log('🧹 Logs limpos');
    },
    
    diagnostico: diagnosticoSistema,
    
    reinicarSistema: () => {
        console.log('🔄 Reiniciando sistema...');
        window.location.reload();
    },
    
    obterEstado: () => ({
        faseAtual,
        sistemaInicializado,
        useAPI,
        anoAtual,
        mesAberto,
        anoAberto,
        totalAnos: Object.keys(dadosFinanceiros).length
    })
};

// ================================================================
// EXECUÇÃO E LOGS FINAIS
// ================================================================

console.log('📦 Main.js refatorado carregado - aguardando DOM...');

// Log da versão do sistema
window.VERSAO_SISTEMA = '2.1.0-refatorado';
console.log(`🏷️ Sistema Financeiro v${window.VERSAO_SISTEMA}`);

// Timeout de segurança para casos extremos
setTimeout(() => {
    if (!sistemaInicializado) {
        console.error('⚠️ TIMEOUT: Sistema não inicializou em 30 segundos');
        console.log('🔍 Estado atual:', {
            faseAtual,
            readyState: document.readyState,
            APIs: { apiClient: !!window.apiClient, sistemaAdapter: !!window.sistemaAdapter }
        });
        
        // Tentar inicialização de emergência
        if (document.readyState === 'complete') {
            console.log('🚨 Tentando inicialização de emergência...');
            iniciarSistemaOrdenado().catch(console.error);
        }
    }
}, 30000);