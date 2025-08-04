let dadosFinanceiros = {};
let anoAtual = new Date().getFullYear();
let mesAtual = new Date().getMonth();
let mesAberto = null;
let anoAberto = null;
let salvandoDados = false;
let timerSalvamento = null;

// VARIÁVEIS DA API
let sistemaAdapter = null;
let useAPI = true;

document.addEventListener('DOMContentLoaded', () => {
    iniciarSistema();
});

async function iniciarSistema() {
    // Inicializar API
    await initializeAPISystem();
    
    // Verificar acesso
    if (!await verificarAcessoSistema()) {
        return;
    }
    
    // Carregar dados
    await carregarDadosIniciais();
    
    // Configurar eventos
    setupEventListeners();
    setupNavigation();
    
    // Exportar funções globais
    exportarFuncoesGlobais();
    atualizarElemento('ano-atual', anoAtual);
    
    // Verificar se ano existe
    if (!dadosFinanceiros[anoAtual]) {
        abrirModalNovoAno();
    } else {
        await carregarDadosDashboard(anoAtual);
        atualizarResumoAnual(anoAtual);
    }
}

// INICIALIZAÇÃO DA API
async function initializeAPISystem() {
    if (typeof window.apiClient !== 'undefined' && typeof window.sistemaAdapter !== 'undefined') {
        apiClient = window.apiClient;
        sistemaAdapter = window.sistemaAdapter;
        useAPI = true;
        console.log('✅ Sistema API inicializado');
    } else {
        console.warn('⚠️ API não encontrada, usando localStorage');
        useAPI = false;
    }
}

// VERIFICAÇÃO DE ACESSO
async function verificarAcessoSistema() {
    if (useAPI && sistemaAdapter) {
        return await sistemaAdapter.verificarAcesso();
    }
    
    // Fallback para verificação local
    if (typeof window.usuarioDados !== 'undefined' && window.usuarioDados.verificarAcesso) {
        return window.usuarioDados.verificarAcesso();
    }
    
    return true;
}

// CARREGAMENTO DE DADOS INICIAL
async function carregarDadosIniciais() {
    if (useAPI && sistemaAdapter) {
        try {
            dadosFinanceiros = await sistemaAdapter.carregarDadosFinanceiros();
            console.log('✅ Dados carregados da API');
        } catch (error) {
            console.error('❌ Erro ao carregar dados da API:', error);
            carregarDadosLocal();
        }
    } else {
        carregarDadosLocal();
    }
}

// FALLBACK PARA DADOS LOCAIS
function carregarDadosLocal() {
    if (typeof window.usuarioDados !== 'undefined' && window.usuarioDados.getDadosFinanceirosUsuario) {
        const dados = window.usuarioDados.getDadosFinanceirosUsuario();
        if (dados) {
            dadosFinanceiros = dados;
            return;
        }
    }
    
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    
    if (!usuarioAtual) {
        console.error('Nenhum usuário logado');
        return;
    }

    const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    const usuario = usuarios.find(u => u.documento.replace(/[^\d]+/g, '') === usuarioAtual);
    
    if (usuario) {
        if (!usuario.dadosFinanceiros) {
            usuario.dadosFinanceiros = {
                receitas: [],
                despesas: [],
                investimentos: [],
                metas: []
            };
        }
        
        dadosFinanceiros = usuario.dadosFinanceiros;
    }
}

// SALVAMENTO DE DADOS ATUALIZADO
async function salvarDados() {
    if (salvandoDados) return false;
    
    if (timerSalvamento) {
        clearTimeout(timerSalvamento);
    }
    
    timerSalvamento = setTimeout(async () => {
        salvandoDados = true;
        
        try {
            if (useAPI && sistemaAdapter) {
                const sucesso = await sistemaAdapter.salvarDadosUsuario(dadosFinanceiros);
                salvandoDados = false;
                return sucesso;
            }
            
            // Fallback para localStorage
            if (typeof window.usuarioDados !== 'undefined' && window.usuarioDados.salvarDadosUsuario) {
                const sucesso = window.usuarioDados.salvarDadosUsuario(dadosFinanceiros);
                salvandoDados = false;
                return sucesso;
            }
            
            const usuarioAtual = sessionStorage.getItem('usuarioAtual');
            
            if (!usuarioAtual) {
                salvandoDados = false;
                return false;
            }

            const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
            const index = usuarios.findIndex(u => u.documento.replace(/[^\d]+/g, '') === usuarioAtual);
            
            if (index !== -1) {
                usuarios[index].dadosFinanceiros = dadosFinanceiros;
                localStorage.setItem('usuarios', JSON.stringify(usuarios));
                salvandoDados = false;
                return true;
            }
            
            salvandoDados = false;
            return false;
            
        } catch (error) {
            console.error('Erro ao salvar dados:', error);
            salvandoDados = false;
            return false;
        }
    }, 300);
}

function garantirEstruturaDados(ano, mes) {
    if (!dadosFinanceiros[ano]) {
        dadosFinanceiros[ano] = { meses: [] };
    }
    
    if (!dadosFinanceiros[ano].meses[mes]) {
        dadosFinanceiros[ano].meses[mes] = { receitas: [], despesas: [] };
    }
}

async function mudarAno(ano) {
    if (!dadosFinanceiros[ano]) {
        if (confirm(`O ano ${ano} ainda não foi configurado. Deseja criar agora?`)) {
            await criarAnoSimples(ano);
        }
        return;
    }
    
    anoAtual = ano;
    atualizarElemento('ano-atual', anoAtual);
    
    await carregarDadosDashboard(anoAtual);
    atualizarResumoAnual(anoAtual);
    renderizarMeses(anoAtual);
}

async function criarAnoSimples(ano) {
    if (dadosFinanceiros[ano]) {
        alert(`O ano ${ano} já existe!`);
        return;
    }
    
    dadosFinanceiros[ano] = { meses: [] };
    
    for (let i = 0; i < 12; i++) {
        dadosFinanceiros[ano].meses[i] = {
            receitas: [],
            despesas: []
        };
    }
    
    await salvarDados();
    
    anoAtual = ano;
    atualizarElemento('ano-atual', anoAtual);
    
    await carregarDadosDashboard(anoAtual);
    atualizarResumoAnual(anoAtual);
    renderizarMeses(anoAtual);
    
    alert(`Ano ${ano} criado com sucesso!`);
}

async function criarNovoAno(e) {
    e.preventDefault();
    
    const ano = parseInt(obterValorElemento('ano'));
    
    if (dadosFinanceiros[ano]) {
        alert(`O ano ${ano} já existe!`);
        return;
    }
    
    dadosFinanceiros[ano] = { meses: [] };
    
    for (let i = 0; i < 12; i++) {
        dadosFinanceiros[ano].meses[i] = {
            receitas: [],
            despesas: []
        };
    }
    
    await salvarDados();
    
    anoAtual = ano;
    atualizarElemento('ano-atual', anoAtual);
    
    await carregarDadosDashboard(anoAtual);
    atualizarResumoAnual(anoAtual);
    renderizarMeses(anoAtual);
    
    fecharModal('modal-novo-ano');
    alert(`Ano ${ano} criado com sucesso!`);
}

async function excluirAno(ano) {
    if (!dadosFinanceiros[ano]) {
        alert(`O ano ${ano} não existe!`);
        return;
    }

    if (confirm(`Tem certeza que deseja excluir todos os dados do ano ${ano}?`)) {
        delete dadosFinanceiros[ano];
        
        await salvarDados();
        
        if (ano === anoAtual) {
            anoAtual = new Date().getFullYear();
            atualizarElemento('ano-atual', anoAtual);
            
            if (!dadosFinanceiros[anoAtual]) {
                abrirModalNovoAno();
            } else {
                await carregarDadosDashboard(anoAtual);
                atualizarResumoAnual(anoAtual);
            }
        } else {
            await carregarDadosDashboard(anoAtual);
            atualizarResumoAnual(anoAtual);
        }
        
        alert(`O ano ${ano} foi excluído com sucesso!`);
    }
}

function abrirModalNovoAno() {
    const inputAno = document.getElementById('ano');
    if (inputAno) {
        inputAno.value = anoAtual;
    }
    abrirModal('modal-novo-ano');
}

function renderizarMeses(ano) {
    const mesesContainer = document.querySelector('.meses-container');
    if (!mesesContainer) return;
    
    mesesContainer.innerHTML = '';
    
    for (let i = 0; i < 12; i++) {
        const mesCard = criarCardMes(i, ano);
        mesesContainer.appendChild(mesCard);
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
    
    aplicarClassesStatusMes(mesCard, fechado, temTransacoes);
    preencherConteudoMes(mesCard, mes, ano, saldo, fechado, temTransacoes);
    
    mesCard.addEventListener('click', () => abrirDetalhesDoMes(mes, ano));
    
    return mesCard;
}

function aplicarClassesStatusMes(mesCard, fechado, temTransacoes) {
    if (fechado) {
        mesCard.classList.add('mes-fechado');
    } else if (temTransacoes) {
        mesCard.classList.add('mes-ativo');
    } else {
        mesCard.classList.add('mes-vazio');
    }
}

function preencherConteudoMes(mesCard, mes, ano, saldo, fechado, temTransacoes) {
    const template = document.getElementById('template-mes-card');
    if (!template) {
        console.error('Template mes-card não encontrado');
        return;
    }
    
    const clone = template.content.cloneNode(true);
    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                       'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    clone.querySelector('.mes-nome').textContent = nomesMeses[mes];
    
    const saldoAnteriorDiv = clone.querySelector('.mes-saldo-anterior');
    if (saldo.saldoAnterior !== 0) {
        saldoAnteriorDiv.classList.remove('hidden');
        const valorAnterior = clone.querySelector('.valor-anterior');
        valorAnterior.textContent = formatarMoeda(saldo.saldoAnterior);
        valorAnterior.className = `valor-anterior ${saldo.saldoAnterior >= 0 ? 'positivo' : 'negativo'}`;
    }
    
    clone.querySelector('.mes-receita').textContent = formatarMoeda(saldo.receitas);
    clone.querySelector('.mes-despesa').textContent = formatarMoeda(saldo.despesas);
    
    const saldoValor = clone.querySelector('.mes-saldo-valor');
    saldoValor.textContent = formatarMoeda(saldo.saldoFinal);
    saldoValor.className = `mes-saldo-valor ${saldo.saldoFinal >= 0 ? 'mes-saldo-positivo' : 'mes-saldo-negativo'}`;
    
    const btnReabrir = clone.querySelector('.btn-reabrir');
    const btnFechar = clone.querySelector('.btn-fechar');
    const btnDetalhes = clone.querySelector('.btn-detalhes');
    
    if (fechado) {
        btnReabrir.classList.remove('hidden');
        btnReabrir.onclick = (e) => {
            e.stopPropagation();
            if (typeof reabrirMes === 'function') {
                reabrirMes(mes, ano);
                renderizarMeses(ano);
            }
        };
    } else if (temTransacoes) {
        btnFechar.classList.remove('hidden');
        btnFechar.onclick = (e) => {
            e.stopPropagation();
            if (typeof fecharMes === 'function') {
                fecharMes(mes, ano);
                renderizarMeses(ano);
            }
        };
    }
    
    btnDetalhes.onclick = (e) => {
        e.stopPropagation();
        abrirDetalhesDoMes(mes, ano);
    };
    
    mesCard.appendChild(clone);
}

function abrirDetalhesDoMes(mes, ano) {
    mesAberto = mes;
    anoAberto = ano;
    
    const nomesMeses = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    
    atualizarElemento('detalhes-mes-titulo', `${nomesMeses[mes]} de ${ano}`);
    
    renderizarDetalhesDoMes(mes, ano);
    ativarPrimeiraAba();
    configurarBotoesModal();
    
    setTimeout(() => {
        if (typeof criarFiltrosCategorias === 'function') {
            criarFiltrosCategorias(mes, ano);
        }
        if (typeof criarFiltrosFormaPagamento === 'function') {
            criarFiltrosFormaPagamento(mes, ano);
        }
        if (typeof criarFiltrosStatus === 'function') {
            criarFiltrosStatus();
        }
    }, 100);
    
    abrirModal('modal-detalhes-mes');
}

function renderizarDetalhesDoMes(mes, ano) {
    try {
        const dadosMes = obterDadosMes(ano, mes);
        const saldo = calcularSaldoMes(mes, ano);
        const totalJuros = typeof calcularTotalJuros === 'function' ? 
                          calcularTotalJuros(dadosMes.despesas || []) : 0;
        const fechado = dadosMes.fechado || false;
        
        atualizarResumoDetalhes(saldo, totalJuros);
        atualizarTituloDetalhes(mes, ano, fechado);
        
        if (typeof renderizarReceitas === 'function') {
            renderizarReceitas(dadosMes.receitas, fechado);
        }
        
        if (typeof renderizarDespesas === 'function') {
            renderizarDespesas(dadosMes.despesas, mes, ano, fechado);
        }
        
        if (typeof atualizarContadoresFiltro === 'function') {
            atualizarContadoresFiltro();
        }
        
    } catch (error) {
        console.error("Erro ao renderizar detalhes do mês:", error);
    }
}

function obterDadosMes(ano, mes) {
    return (dadosFinanceiros[ano] && dadosFinanceiros[ano].meses[mes]) || 
           { receitas: [], despesas: [] };
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
    atualizarElemento('resumo-saldo', formatarMoeda(saldo.saldoFinal));
}

// DASHBOARD COM API
async function carregarDadosDashboard(ano) {
    if (useAPI && sistemaAdapter) {
        try {
            const dashboardData = await sistemaAdapter.getDashboardData(ano);
            if (dashboardData) {
                atualizarElementosDashboard(dashboardData);
                return;
            }
        } catch (error) {
            console.error('Erro ao carregar dashboard da API:', error);
        }
    }
    
    // Fallback para cálculo local
    carregarDadosDashboardLocal(ano);
}

function carregarDadosDashboardLocal(ano) {
    if (!dadosFinanceiros[ano]) return;
    
    let totalReceitas = 0;
    let totalDespesas = 0;
    let totalJuros = 0;
    
    for (let mes = 0; mes < 12; mes++) {
        const dadosMes = dadosFinanceiros[ano].meses[mes] || { receitas: [], despesas: [] };
        
        if (typeof calcularTotalReceitas === 'function') {
            totalReceitas += calcularTotalReceitas(dadosMes.receitas);
        }
        
        if (typeof calcularTotalDespesas === 'function') {
            totalDespesas += calcularTotalDespesas(dadosMes.despesas);
        }
        
        if (typeof calcularTotalJuros === 'function') {
            totalJuros += calcularTotalJuros(dadosMes.despesas);
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

function calcularSaldoMes(mes, ano) {
    if (typeof window.calcularSaldoMes === 'function') {
        return window.calcularSaldoMes(mes, ano);
    }
    
    const dadosMes = obterDadosMes(ano, mes);
    
    const receitas = typeof calcularTotalReceitas === 'function' ? 
                    calcularTotalReceitas(dadosMes.receitas || []) : 0;
    const despesas = typeof calcularTotalDespesas === 'function' ? 
                    calcularTotalDespesas(dadosMes.despesas || []) : 0;
    
    return {
        saldoAnterior: 0,
        receitas: receitas,
        despesas: despesas,
        saldoFinal: receitas - despesas
    };
}

function setupNavigation() {
    const toggleSidebar = document.getElementById('toggleSidebar');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (toggleSidebar) {
        toggleSidebar.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        });
    }
    
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            document.querySelectorAll('section[id$="-section"]').forEach(section => {
                section.classList.remove('active');
            });
            
            const sectionId = link.getAttribute('data-section') + '-section';
            const section = document.getElementById(sectionId);
            if (section) {
                section.classList.add('active');
                
                if (link.getAttribute('data-section') === 'meses') {
                    renderizarMeses(anoAtual);
                    atualizarResumoAnual(anoAtual);
                }

                if (sectionId === 'fin-sights-section' && typeof onRevistaActivated === 'function') {
                    onRevistaActivated();
                }
            }
        });
    });
}

function setupEventListeners() {
    configurarEventoElemento('btn-ano-anterior', 'click', () => mudarAno(anoAtual - 1));
    configurarEventoElemento('btn-proximo-ano', 'click', () => mudarAno(anoAtual + 1));
    configurarEventoElemento('btn-novo-ano', 'click', abrirModalNovoAno);
    configurarEventoElemento('form-novo-ano', 'submit', criarNovoAno);
    configurarEventoElemento('btn-excluir-ano-atual', 'click', () => excluirAno(anoAtual));

    configurarTransacoesRapidas();
    configurarModais();
    configurarAbas();
    configurarOutrosControles();
    configurarSistemaBloqueio();
    configurarBotoesAdicionar();
}

function configurarEventoElemento(id, evento, callback) {
    const elemento = document.getElementById(id);
    if (elemento && callback) {
        elemento.addEventListener(evento, callback);
    }
}

function configurarTransacoesRapidas() {
    const btnAdicionarReceitaRapida = document.getElementById('btn-adicionar-receita-rapida');
    const btnAdicionarDespesaRapida = document.getElementById('btn-adicionar-despesa-rapida');
    const modalSelecionarMes = document.getElementById('modal-selecionar-mes');

    if (btnAdicionarReceitaRapida && btnAdicionarDespesaRapida && modalSelecionarMes) {
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
        spanCloseSeletorMes.addEventListener('click', () => modalSelecionarMes.style.display = 'none');

        seletorMesGrid.addEventListener('click', function(e) {
            const botaoMes = e.target.closest('.mes-btn');
            if (!botaoMes) return;

            const mesSelecionado = parseInt(botaoMes.dataset.mes);
            const tipo = tipoTransacaoRapidaInput.value;
            
            modalSelecionarMes.style.display = 'none';

            mesAberto = mesSelecionado;
            anoAberto = anoAtual;

            if (tipo === 'receita' && typeof abrirModalNovaReceita === 'function') {
                abrirModalNovaReceita(); 
            } else if (tipo === 'despesa' && typeof abrirModalNovaDespesa === 'function') {
                abrirModalNovaDespesa();
            }
        });
    }
}

function configurarModais() {
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', () => {
            const modal = closeBtn.closest('.modal');
            if (modal && modal.id !== 'modal-lock-screen') {
                modal.style.display = 'none';
            }
        });
    });

    window.addEventListener('click', event => {
        if (event.target.classList.contains('modal') && event.target.id !== 'modal-lock-screen') {
            event.target.style.display = 'none';
        }
    });
}

function configurarAbas() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
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
    const refreshBtn = document.getElementById('btn-refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async function() {
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
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (useAPI && apiClient) {
                apiClient.logout();
            }
            sessionStorage.removeItem('usuarioAtual');
            window.location.href = 'login.html';
        });
    }
}

function configurarSistemaBloqueio() {
    const lockButton = document.getElementById('btn-lock-system');
    const lockForm = document.getElementById('form-lock-screen');
    const overlay = document.getElementById('lock-screen-overlay');
    const modal = document.getElementById('modal-lock-screen');

    if (lockButton && lockForm && overlay && modal) {
        const passwordInput = document.getElementById('lock-screen-password');
        const modalContent = document.querySelector('#modal-lock-screen .modal-content');
        let inactivityTimer;

        const lockSystem = () => {
            if (modal.classList.contains('visible')) return;
            overlay.classList.add('visible');
            modal.classList.add('visible');
            document.body.classList.add('body-locked');
            passwordInput.value = '';
            setTimeout(() => passwordInput.focus(), 100);
        };

        const unlockSystem = () => {
            overlay.classList.remove('visible');
            modal.classList.remove('visible');
            document.body.classList.remove('body-locked');
            resetInactivityTimer();
        };

        const handleUnlockAttempt = (event) => {
            event.preventDefault();
            const enteredPassword = passwordInput.value;
            if (!enteredPassword) { 
                alert('Por favor, digite sua senha.'); 
                return; 
            }
            
            if (useAPI && apiClient && apiClient.usuarioAtual) {
                if (apiClient.usuarioAtual.senha === enteredPassword) {
                    unlockSystem();
                } else {
                    modalContent.classList.add('shake-animation');
                    setTimeout(() => modalContent.classList.remove('shake-animation'), 500);
                    passwordInput.value = '';
                    passwordInput.focus();
                }
                return;
            }
            
            if (typeof window.usuarioDados?.getUsuarioAtual !== 'function') {
                alert('Erro crítico: A função para buscar o usuário logado não foi encontrada.');
                return;
            }
            
            const usuario = window.usuarioDados.getUsuarioAtual();
            if (!usuario) { 
                alert('Sessão inválida. Por favor, faça login novamente.'); 
                return; 
            }

            if (usuario.password === enteredPassword) {
                unlockSystem();
            } else {
                modalContent.classList.add('shake-animation');
                setTimeout(() => modalContent.classList.remove('shake-animation'), 500);
                passwordInput.value = '';
                passwordInput.focus();
            }
        };

        const resetInactivityTimer = () => {
            clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(() => {
                lockSystem();
            }, 120000);
        };

        lockButton.addEventListener('click', lockSystem);
        lockForm.addEventListener('submit', handleUnlockAttempt);

        ['mousemove', 'keydown', 'scroll', 'click'].forEach(evento => {
            window.addEventListener(evento, resetInactivityTimer);
        });

        resetInactivityTimer();
    }
}

function ativarPrimeiraAba() {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    const primeiraAba = document.querySelector('.tab-btn[data-tab="tab-resumo"]');
    const primeiroConteudo = document.getElementById('tab-resumo');
    
    if (primeiraAba) primeiraAba.classList.add('active');
    if (primeiroConteudo) primeiroConteudo.classList.add('active');
}

function configurarBotoesModal() {
    configurarBotoesAdicionar();
    configurarControlesDespesas();
}

function configurarBotoesAdicionar() {
    configurarBotao('btn-nova-receita', window.abrirModalNovaReceita);
    configurarBotao('btn-nova-despesa', window.abrirModalNovaDespesa);
}

function configurarBotao(id, funcaoCallback) {
    const botao = document.getElementById(id);
    if (botao && funcaoCallback) {
        const novoBotao = botao.cloneNode(true);
        botao.parentNode.replaceChild(novoBotao, botao);
        
        novoBotao.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            funcaoCallback();
        });
    }
}

function configurarControlesDespesas() {
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
    
    configurarBotao('btn-pagar-em-lote', window.pagarDespesasEmLote);
    configurarBotao('btn-limpar-filtros', window.limparFiltros);
}

function formatarMoeda(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(dataString) {
    const data = new Date(dataString);
    return data.toLocaleDateString('pt-BR');
}

function gerarId() {
    const timestamp = new Date().getTime();
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

// FUNÇÕES GLOBAIS EXPORTADAS
function exportarFuncoesGlobais() {
    window.dadosFinanceiros = dadosFinanceiros;
    window.anoAtual = anoAtual;
    window.mesAtual = mesAtual;
    window.mesAberto = mesAberto;
    window.anoAberto = anoAberto;
    
    window.formatarMoeda = formatarMoeda;
    window.formatarData = formatarData;
    window.gerarId = gerarId;
    window.salvarDados = salvarDados;
    window.garantirEstruturaDados = garantirEstruturaDados;
    window.abrirDetalhesDoMes = abrirDetalhesDoMes;
    window.renderizarMeses = renderizarMeses;
    window.mudarAno = mudarAno;
    window.criarAnoSimples = criarAnoSimples;
    window.excluirAno = excluirAno;
    window.calcularSaldoMes = calcularSaldoMes;
    window.carregarDadosDashboard = carregarDadosDashboard;
    window.atualizarResumoAnual = atualizarResumoAnual;
    window.renderizarDetalhesDoMes = renderizarDetalhesDoMes;
    window.abrirModal = abrirModal;
    window.fecharModal = fecharModal;
    window.atualizarElemento = atualizarElemento;
    window.obterValorElemento = obterValorElemento;
    
    // Exportar variáveis da API
    window.apiClient = apiClient;
    window.sistemaAdapter = sistemaAdapter;
    window.useAPI = useAPI;
}