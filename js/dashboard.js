// ================================================================
// SISTEMA DE CORES FIXAS POR CATEGORIA
// ================================================================

const CORES_DISPONIVEIS = [
    'rgba(255, 99, 132, 0.7)',
    'rgba(54, 162, 235, 0.7)', 
    'rgba(255, 206, 86, 0.7)',
    'rgba(75, 192, 192, 0.7)',
    'rgba(153, 102, 255, 0.7)',
    'rgba(255, 159, 64, 0.7)',
    'rgba(220, 53, 69, 0.7)',
    'rgba(83, 102, 255, 0.7)',
    'rgba(199, 199, 199, 0.7)',
    'rgba(50, 205, 50, 0.7)'
];

let coresCategorias = {};

function obterCorCategoria(categoria) {
    categoria = categoria.trim();
    if (categoria === 'Cartão') {
        categoria = 'Cartão de Crédito';
    }
    
    if (coresCategorias[categoria]) {
        return coresCategorias[categoria];
    }
    
    const indiceDisponivel = Object.keys(coresCategorias).length % CORES_DISPONIVEIS.length;
    const novaCor = CORES_DISPONIVEIS[indiceDisponivel];
    coresCategorias[categoria] = novaCor;
    
    return novaCor;
}

function obterCoresParaCategorias(categorias) {
    return categorias.map(categoria => obterCorCategoria(categoria));
}

// ================================================================
// INICIALIZAÇÃO
// ================================================================

document.addEventListener('DOMContentLoaded', function() {
    aguardarSistemaCompleto().then(sistemaReady => {
        if (sistemaReady) {
            configurarObservadores();
        }
    });
});

async function aguardarSistemaCompleto() {
    let tentativas = 0;
    const maxTentativas = 50;
    
    while (tentativas < maxTentativas) {
        if (window.sistemaInicializado && 
            window.dadosFinanceiros && 
            typeof window.calcularTotalDespesas === 'function' &&
            typeof window.obterValorRealDespesa === 'function' &&
            typeof window.obterCategoriaLimpa === 'function') {
            return true;
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
        tentativas++;
    }
    
    return false;
}

function configurarObservadores() {
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const dashboardSection = document.getElementById('dashboard-section');
                if (dashboardSection && dashboardSection.classList.contains('active')) {
                    setTimeout(() => carregarDadosDashboard(window.anoAtual), 100);
                }
            }
        });
    });

    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection) {
        observer.observe(dashboardSection, { attributes: true });

        // Carregar dashboard imediatamente se já estiver ativo
        if (dashboardSection.classList.contains('active')) {
            setTimeout(() => carregarDadosDashboard(window.anoAtual), 100);
        }
    }
    
    document.getElementById('btn-ano-anterior')?.addEventListener('click', function() {
        limparGraficos();
        resetarFiltros();
        setTimeout(() => carregarDadosDashboard(window.anoAtual), 100);
    });
    
    document.getElementById('btn-proximo-ano')?.addEventListener('click', function() {
        limparGraficos();
        resetarFiltros();
        setTimeout(() => carregarDadosDashboard(window.anoAtual), 100);
    });
}


function resetarFiltros() {
    document.querySelectorAll('select[id*="tipo-filter"]').forEach(select => {
        select.value = 'ambos';
    });

    document.querySelectorAll('select[id*="categoria-filter"]').forEach(select => {
        select.value = '';
    });

    document.querySelectorAll('select[id*="pagamento-filter"]').forEach(select => {
        select.value = 'todas';
    });

    document.querySelectorAll('select[id*="status-filter"]').forEach(select => {
        select.value = 'todos';
    });

    // Resetar filtros do balanço
    const periodoFilter = document.getElementById('balanco-periodo-filter');
    const anoFilter = document.getElementById('balanco-ano-filter');
    const mesFilter = document.getElementById('balanco-mes-filter');

    if (periodoFilter) periodoFilter.value = 'ano';
    if (anoFilter) anoFilter.style.display = 'none';
    if (mesFilter) {
        mesFilter.style.display = 'none';
        mesFilter.dataset.initialized = '';
    }
}

function limparGraficos() {
    const graficos = [
        'balancoChart',
        'tendenciaChart',
        'receitasDespesasChart',
        'categoriasBarrasChart',
        'categoriasEmpilhadasChart',
        'jurosChart',
        'parcelamentosChart',
        'formaPagamentoChart'
    ];

    graficos.forEach(grafico => {
        if (window[grafico]) {
            window[grafico].destroy();
            window[grafico] = null;
        }
    });

    // Limpar gráfico de média de categorias
    if (window.mediaCategoriasChart) {
        window.mediaCategoriasChart.destroy();
        window.mediaCategoriasChart = null;
    }
}



// ================================================================
// FUNÇÃO MAXIMIZAR
// ================================================================


let graficoZoomInstance = null;

document.addEventListener('click', function(e) {
    // Verifica se o botão clicado tem o atributo data-chart (botões de maximizar gráficos)
    if (e.target.hasAttribute('data-chart')) {
        const nomeVariavelGrafico = e.target.getAttribute('data-chart');
        const graficoOriginal = window[nomeVariavelGrafico];

        if (graficoOriginal) {
            const modal = document.getElementById('modal-zoom-grafico');
            const canvasZoom = document.getElementById('canvas-zoom-render');
            const ctx = canvasZoom.getContext('2d');

            modal.style.display = 'flex';

            if (graficoZoomInstance) {
                graficoZoomInstance.destroy();
            }

            graficoZoomInstance = new Chart(ctx, {
                type: graficoOriginal.config.type,
                data: JSON.parse(JSON.stringify(graficoOriginal.data)),
                options: {
                    ...graficoOriginal.options,
                    maintainAspectRatio: false,
                    responsive: true,
                    plugins: {
                        ...graficoOriginal.options.plugins,
                        legend: {
                            display: true,
                            position: 'bottom'
                        }
                    }
                }
            });
        }
    }
});

document.getElementById('fechar-modal-zoom').onclick = function() {
    document.getElementById('modal-zoom-grafico').style.display = 'none';
    if (graficoZoomInstance) {
        graficoZoomInstance.destroy();
        graficoZoomInstance = null;
    }
};

window.onclick = function(event) {
    const modal = document.getElementById('modal-zoom-grafico');
    if (event.target == modal) {
        modal.style.display = 'none';
        if (graficoZoomInstance) {
            graficoZoomInstance.destroy();
            graficoZoomInstance = null;
        }
    }
};


// ================================================================
// FUNÇÃO PRINCIPAL DE CARREGAMENTO
// ================================================================

async function carregarDadosDashboard(ano) {
    if (!window.dadosFinanceiros[ano]) {
        return;
    }

    // Carregar reservas antes de criar os gráficos
    if (typeof window.carregarReservasAPI === 'function') {
        await window.carregarReservasAPI();
    }

    const dadosProcessados = processarDadosReais(window.dadosFinanceiros, ano);

    atualizarResumoDashboard(dadosProcessados.resumoAnual);
    preencherSelectCategorias();

    const filtrosPadrao = { categoria: '', formaPagamento: 'todas', status: 'todos', tipo: 'ambos' };

    criarGraficoBalanco(dadosProcessados.dadosMensais);
    criarGraficoTendenciaAnualComFiltros(window.dadosFinanceiros, ano, filtrosPadrao);
    criarGraficoReceitasDespesasComFiltros(dadosProcessados.dadosMensais, filtrosPadrao);
    criarGraficoBarrasCategoriasComFiltros(window.dadosFinanceiros, ano, filtrosPadrao);
    criarGraficoCategoriasMensaisComFiltros(window.dadosFinanceiros, ano, filtrosPadrao);
    criarGraficoJurosComFiltros(window.dadosFinanceiros, ano, filtrosPadrao);
    criarGraficoParcelamentosComFiltros(window.dadosFinanceiros, ano, filtrosPadrao);
    criarGraficoFormaPagamentoComFiltros(window.dadosFinanceiros, ano, filtrosPadrao);
    renderDistribuicaoCartoes(window.dadosFinanceiros, ano, filtrosPadrao);
    renderizarGraficoMediaCategorias();
}

// ================================================================
// PROCESSAMENTO DE DADOS
// ================================================================

function processarDadosReais(dadosFinanceiros, ano) {
    const nomesMeses = [
        'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
        'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
    ];

    const dadosMensais = {
        labels: nomesMeses,
        receitas: [],
        despesas: [],
        saldos: []
    };

    let receitasAno = 0;
    let totalDespesas = 0;
    let totalJuros = 0;
    let totalEconomias = 0;

    for (let i = 0; i < 12; i++) {
        const dadosMes = dadosFinanceiros[ano]?.meses[i] || { receitas: [], despesas: [] };
        const saldoInfo = window.calcularSaldoMes ? window.calcularSaldoMes(i, ano) :
                         { saldoAnterior: 0, receitas: 0, despesas: 0 };

        // Reservas do mês
        let reservasMes = 0;
        if (window.reservasCache && Array.isArray(window.reservasCache)) {
            reservasMes = window.reservasCache
                .filter(r => parseInt(r.mes) === i && parseInt(r.ano) === ano)
                .reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
        }

        // Receitas Totais do mês = saldo anterior + receitas - reservas
        const receitasTotaisMes = saldoInfo.saldoAnterior + saldoInfo.receitas - reservasMes;

        const despesasMes = window.calcularTotalDespesas ? window.calcularTotalDespesas(dadosMes.despesas || []) : 0;
        const jurosMes = window.calcularTotalJuros ? window.calcularTotalJuros(dadosMes.despesas || []) : 0;
        const economiasMes = window.calcularTotalEconomias ? window.calcularTotalEconomias(dadosMes.despesas || []) : 0;

        receitasAno += saldoInfo.receitas;
        totalDespesas += despesasMes;
        totalJuros += jurosMes;
        totalEconomias += economiasMes;

        dadosMensais.receitas.push(receitasTotaisMes);
        dadosMensais.despesas.push(despesasMes);

        // Saldo do mês = Receitas Totais - Despesas
        const saldoMes = receitasTotaisMes - despesasMes;
        dadosMensais.saldos.push(saldoMes);
    }

    // Receitas Totais do Dashboard = apenas receitas cadastradas no ano (sem saldo anterior, sem reservas)
    const receitasTotais = receitasAno;

    const resumoAnual = {
        receitas: receitasTotais,
        despesas: totalDespesas,
        saldo: receitasTotais - totalDespesas,
        juros: totalJuros,
        economias: totalEconomias
    };

    return {
        dadosMensais,
        resumoAnual
    };
}

function atualizarResumoDashboard(resumo) {
    document.getElementById('dashboard-total-receitas').textContent = window.formatarMoeda(resumo.receitas);
    document.getElementById('dashboard-total-despesas').textContent = window.formatarMoeda(resumo.despesas);
    document.getElementById('dashboard-saldo-anual').textContent = window.formatarMoeda(resumo.saldo);
    document.getElementById('dashboard-total-juros').textContent = window.formatarMoeda(resumo.juros);
    document.getElementById('dashboard-total-economias').textContent = window.formatarMoeda(resumo.economias);
}

// ================================================================
// GRÁFICO 1: BALANÇO COM FILTRO DE PERÍODO
// ================================================================

// Cache dos dados do gráfico de balanço
window.dadosBalancoCache = null;

// Configuração das 5 linhas do gráfico
const BALANCO_DATASETS_CONFIG = {
    balanco: {
        label: 'Balanço',
        borderColor: 'rgb(253, 126, 20)',
        backgroundColor: 'rgba(253, 126, 20, 0.1)',
        order: 1
    },
    saldo: {
        label: 'Saldo em Conta',
        borderColor: 'rgb(0, 123, 255)',
        backgroundColor: 'rgba(0, 123, 255, 0.1)',
        order: 2
    },
    reservas: {
        label: 'Reservas',
        borderColor: 'rgb(147, 51, 234)',
        backgroundColor: 'rgba(147, 51, 234, 0.1)',
        order: 3
    }
};

// Inicializar filtros de ano
function inicializarFiltrosBalanco(forceReset = false) {
    const anoFilter = document.getElementById('balanco-ano-filter');
    if (!anoFilter) return;

    // Só preencher se estiver vazio ou forçado
    if (anoFilter.options.length === 0 || forceReset) {
        const valorAtual = anoFilter.value;
        const anosDisponiveis = Object.keys(window.dadosFinanceiros || {}).map(Number).sort();
        const anoAtual = window.anoAtual || new Date().getFullYear();

        anoFilter.innerHTML = '';
        anosDisponiveis.forEach(ano => {
            const option = document.createElement('option');
            option.value = ano;
            option.textContent = ano;
            if (forceReset) {
                if (ano === anoAtual) option.selected = true;
            } else {
                if (valorAtual && ano === parseInt(valorAtual)) option.selected = true;
                else if (!valorAtual && ano === anoAtual) option.selected = true;
            }
            anoFilter.appendChild(option);
        });
    }
}

// Resetar filtros do balanço para o padrão
function resetarFiltrosBalanco() {
    const periodoFilter = document.getElementById('balanco-periodo-filter');
    const anoFilter = document.getElementById('balanco-ano-filter');
    const mesFilter = document.getElementById('balanco-mes-filter');

    if (periodoFilter) periodoFilter.value = 'ano';
    if (anoFilter) {
        anoFilter.style.display = 'none';
        anoFilter.dataset.initialized = '';
    }
    if (mesFilter) {
        mesFilter.style.display = 'none';
        mesFilter.value = new Date().getMonth();
        mesFilter.dataset.initialized = '';
    }

    inicializarFiltrosBalanco(true);
    criarGraficoBalancoPorAnos();
}

function filtrarBalancoPeriodo() {
    const periodo = document.getElementById('balanco-periodo-filter')?.value || 'ano';
    const anoFilter = document.getElementById('balanco-ano-filter');
    const mesFilter = document.getElementById('balanco-mes-filter');

    // Inicializar filtros se necessário (sem forçar reset)
    inicializarFiltrosBalanco(false);

    // Mostrar/esconder filtros conforme período selecionado
    if (anoFilter) {
        // ANO: esconde tudo (mostra todos os anos)
        // MÊS: mostra ano
        // SEMANA/DIA: mostra ano + mês
        anoFilter.style.display = (periodo === 'mes' || periodo === 'semana' || periodo === 'dia') ? 'inline-block' : 'none';
    }

    if (mesFilter) {
        mesFilter.style.display = (periodo === 'semana' || periodo === 'dia') ? 'inline-block' : 'none';
        if (mesFilter.style.display !== 'none' && !mesFilter.dataset.initialized) {
            mesFilter.value = new Date().getMonth();
            mesFilter.dataset.initialized = 'true';
        }
    }

    const ano = parseInt(anoFilter?.value) || window.anoAtual;
    const mes = parseInt(mesFilter?.value) || 0;

    switch(periodo) {
        case 'ano':
            criarGraficoBalancoPorAnos();
            break;
        case 'mes':
            criarGraficoBalancoPorMeses(ano);
            break;
        case 'semana':
            criarGraficoBalancoPorSemanas(ano, mes);
            break;
        case 'dia':
            criarGraficoBalancoPorDias(ano, mes);
            break;
    }
}

// Criar dataset padrão para linha
function criarDatasetLinha(config, data, pointRadius = 4) {
    return {
        label: config.label,
        data: data,
        borderColor: config.borderColor,
        backgroundColor: config.backgroundColor,
        fill: false,
        tension: 0.3,
        borderWidth: 2,
        pointRadius: pointRadius,
        pointHoverRadius: 6,
        pointBackgroundColor: config.borderColor,
        order: config.order
    };
}

// Opções padrão do gráfico
function getOpcoesGrafico() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            intersect: false,
            mode: 'index'
        },
        scales: {
            y: {
                ticks: {
                    callback: function(value) {
                        return window.formatarMoeda(value);
                    }
                },
                grid: {
                    color: 'rgba(0, 0, 0, 0.05)'
                }
            },
            x: {
                grid: {
                    display: false
                }
            }
        },
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: {
                    usePointStyle: true,
                    padding: 15
                },
                onClick: function(e, legendItem) {
                    const index = legendItem.datasetIndex;
                    const chart = this.chart;
                    const isVisible = chart.isDatasetVisible(index);
                    chart.setDatasetVisibility(index, !isVisible);
                    chart.update();
                }
            },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                titleColor: '#fff',
                bodyColor: '#fff',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1,
                callbacks: {
                    label: function(context) {
                        return context.dataset.label + ': ' + window.formatarMoeda(context.raw);
                    }
                }
            }
        }
    };
}

// ================================================================
// FILTRO ANO: Mostra totais por ano (2024, 2025, 2026...)
// ================================================================
function criarGraficoBalancoPorAnos() {
    const ctx = document.getElementById('balanco-chart')?.getContext('2d');
    if (!ctx) return;

    if (window.balancoChart) {
        window.balancoChart.destroy();
    }

    const dadosFinanceiros = window.dadosFinanceiros || {};
    const reservasCache = window.reservasCache || [];
    const anos = Object.keys(dadosFinanceiros).map(Number).sort();

    if (anos.length === 0) return;

    const labels = anos.map(a => a.toString());
    const receitas = [];
    const despesas = [];
    const balancos = [];
    const saldos = [];
    const reservas = [];

    let saldoAcumulado = 0;
    let reservasAcumuladas = 0;

    anos.forEach(ano => {
        const anoData = dadosFinanceiros[ano];
        let receitaAno = 0;
        let despesaAno = 0;
        let reservaAno = 0;

        if (anoData?.meses) {
            for (let m = 0; m < 12; m++) {
                const mesDados = anoData.meses[m];
                if (mesDados) {
                    receitaAno += (mesDados.receitas || []).reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
                    despesaAno += (mesDados.despesas || []).reduce((sum, d) => sum + parseFloat(d.valor || 0), 0);
                }
            }
        }

        // Reservas do ano
        reservaAno = reservasCache
            .filter(r => parseInt(r.ano) === ano)
            .reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);

        const balancoAno = receitaAno - despesaAno;
        saldoAcumulado += balancoAno - reservaAno;
        reservasAcumuladas += reservaAno;

        receitas.push(receitaAno);
        despesas.push(despesaAno);
        balancos.push(balancoAno);
        saldos.push(saldoAcumulado);
        reservas.push(reservasAcumuladas);
    });

    window.balancoChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                criarDatasetLinha(BALANCO_DATASETS_CONFIG.balanco, balancos, 6),
                criarDatasetLinha(BALANCO_DATASETS_CONFIG.saldo, saldos, 6),
                criarDatasetLinha(BALANCO_DATASETS_CONFIG.reservas, reservas, 6)
            ]
        },
        options: getOpcoesGrafico()
    });
}

// ================================================================
// FILTRO MÊS: Mostra os 12 meses do ano selecionado
// ================================================================
function criarGraficoBalancoPorMeses(ano) {
    const ctx = document.getElementById('balanco-chart')?.getContext('2d');
    if (!ctx) return;

    if (window.balancoChart) {
        window.balancoChart.destroy();
    }

    const dadosFinanceiros = window.dadosFinanceiros || {};
    const reservasCache = window.reservasCache || [];
    const anoData = dadosFinanceiros[ano];

    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const receitas = [];
    const despesas = [];
    const balancos = [];
    const saldos = [];
    const reservas = [];

    // Calcular saldo inicial (anos anteriores)
    let saldoAcumulado = 0;
    let reservasAcumuladas = 0;

    Object.keys(dadosFinanceiros).map(Number).filter(a => a < ano).forEach(anoAnt => {
        const anoAntData = dadosFinanceiros[anoAnt];
        if (anoAntData?.meses) {
            for (let m = 0; m < 12; m++) {
                const mesDados = anoAntData.meses[m];
                if (mesDados) {
                    const recMes = (mesDados.receitas || []).reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
                    const despMes = (mesDados.despesas || []).reduce((sum, d) => sum + parseFloat(d.valor || 0), 0);
                    const resMes = reservasCache
                        .filter(r => parseInt(r.ano) === anoAnt && parseInt(r.mes) === m)
                        .reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
                    saldoAcumulado += recMes - despMes - resMes;
                    reservasAcumuladas += resMes;
                }
            }
        }
    });

    for (let m = 0; m < 12; m++) {
        const mesDados = anoData?.meses?.[m];
        const receitaMes = mesDados ? (mesDados.receitas || []).reduce((sum, r) => sum + parseFloat(r.valor || 0), 0) : 0;
        const despesaMes = mesDados ? (mesDados.despesas || []).reduce((sum, d) => sum + parseFloat(d.valor || 0), 0) : 0;
        const reservaMes = reservasCache
            .filter(r => parseInt(r.ano) === ano && parseInt(r.mes) === m)
            .reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);

        const balancoMes = receitaMes - despesaMes;
        saldoAcumulado += balancoMes - reservaMes;
        reservasAcumuladas += reservaMes;

        receitas.push(receitaMes);
        despesas.push(despesaMes);
        balancos.push(balancoMes);
        saldos.push(saldoAcumulado);
        reservas.push(reservasAcumuladas);
    }

    window.balancoChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: meses,
            datasets: [
                criarDatasetLinha(BALANCO_DATASETS_CONFIG.balanco, balancos),
                criarDatasetLinha(BALANCO_DATASETS_CONFIG.saldo, saldos),
                criarDatasetLinha(BALANCO_DATASETS_CONFIG.reservas, reservas)
            ]
        },
        options: getOpcoesGrafico()
    });
}

// ================================================================
// FILTRO SEMANA: Mostra semanas do mês selecionado
// ================================================================
function criarGraficoBalancoPorSemanas(ano, mes) {
    const ctx = document.getElementById('balanco-chart')?.getContext('2d');
    if (!ctx) return;

    if (window.balancoChart) {
        window.balancoChart.destroy();
    }

    const dadosFinanceiros = window.dadosFinanceiros || {};
    const reservasCache = window.reservasCache || [];
    const totalDias = new Date(ano, mes + 1, 0).getDate();

    const mesDados = dadosFinanceiros[ano]?.meses?.[mes];
    const receitaMes = mesDados ? (mesDados.receitas || []).reduce((sum, r) => sum + parseFloat(r.valor || 0), 0) : 0;
    const despesaMes = mesDados ? (mesDados.despesas || []).reduce((sum, d) => sum + parseFloat(d.valor || 0), 0) : 0;
    const reservaMes = reservasCache
        .filter(r => parseInt(r.ano) === ano && parseInt(r.mes) === mes)
        .reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);

    const labels = [];
    const receitas = [];
    const despesas = [];
    const balancos = [];
    const saldos = [];
    const reservas = [];

    // Calcular saldo inicial do mês
    let saldoAcumulado = calcularSaldoAteData(ano, mes, dadosFinanceiros, reservasCache);
    let reservasAcumuladas = calcularReservasAteData(ano, mes, reservasCache);

    let diaAtual = 1;
    let semanaNum = 1;

    while (diaAtual <= totalDias) {
        const inicioSemana = diaAtual;
        const fimSemana = Math.min(diaAtual + 6, totalDias);
        const proporcao = (fimSemana - inicioSemana + 1) / totalDias;

        labels.push(`Sem ${semanaNum}`);

        const receitaSemana = receitaMes * proporcao;
        const despesaSemana = despesaMes * proporcao;
        const reservaSemana = reservaMes * proporcao;
        const balancoSemana = receitaSemana - despesaSemana;

        saldoAcumulado += balancoSemana - reservaSemana;
        reservasAcumuladas += reservaSemana;

        receitas.push(receitaSemana);
        despesas.push(despesaSemana);
        balancos.push(balancoSemana);
        saldos.push(saldoAcumulado);
        reservas.push(reservasAcumuladas);

        diaAtual = fimSemana + 1;
        semanaNum++;
    }

    window.balancoChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                criarDatasetLinha(BALANCO_DATASETS_CONFIG.balanco, balancos),
                criarDatasetLinha(BALANCO_DATASETS_CONFIG.saldo, saldos),
                criarDatasetLinha(BALANCO_DATASETS_CONFIG.reservas, reservas)
            ]
        },
        options: getOpcoesGrafico()
    });
}

// ================================================================
// FILTRO DIA: Mostra dias do mês selecionado
// ================================================================
function criarGraficoBalancoPorDias(ano, mes) {
    const ctx = document.getElementById('balanco-chart')?.getContext('2d');
    if (!ctx) return;

    if (window.balancoChart) {
        window.balancoChart.destroy();
    }

    const dadosFinanceiros = window.dadosFinanceiros || {};
    const reservasCache = window.reservasCache || [];
    const totalDias = new Date(ano, mes + 1, 0).getDate();

    const mesDados = dadosFinanceiros[ano]?.meses?.[mes];
    const receitaMes = mesDados ? (mesDados.receitas || []).reduce((sum, r) => sum + parseFloat(r.valor || 0), 0) : 0;
    const despesaMes = mesDados ? (mesDados.despesas || []).reduce((sum, d) => sum + parseFloat(d.valor || 0), 0) : 0;
    const reservaMes = reservasCache
        .filter(r => parseInt(r.ano) === ano && parseInt(r.mes) === mes)
        .reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);

    const receitaDia = receitaMes / totalDias;
    const despesaDia = despesaMes / totalDias;
    const reservaDia = reservaMes / totalDias;

    const labels = [];
    const receitas = [];
    const despesas = [];
    const balancos = [];
    const saldos = [];
    const reservas = [];

    // Calcular saldo inicial do mês
    let saldoAcumulado = calcularSaldoAteData(ano, mes, dadosFinanceiros, reservasCache);
    let reservasAcumuladas = calcularReservasAteData(ano, mes, reservasCache);

    for (let dia = 1; dia <= totalDias; dia++) {
        labels.push(dia.toString());

        const balancoDia = receitaDia - despesaDia;
        saldoAcumulado += balancoDia - reservaDia;
        reservasAcumuladas += reservaDia;

        receitas.push(receitaDia);
        despesas.push(despesaDia);
        balancos.push(balancoDia);
        saldos.push(saldoAcumulado);
        reservas.push(reservasAcumuladas);
    }

    window.balancoChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                criarDatasetLinha(BALANCO_DATASETS_CONFIG.balanco, balancos, 2),
                criarDatasetLinha(BALANCO_DATASETS_CONFIG.saldo, saldos, 2),
                criarDatasetLinha(BALANCO_DATASETS_CONFIG.reservas, reservas, 2)
            ]
        },
        options: getOpcoesGrafico()
    });
}

// Funções auxiliares para calcular saldo e reservas acumuladas
function calcularSaldoAteData(ano, mes, dadosFinanceiros, reservasCache) {
    let saldo = 0;

    Object.keys(dadosFinanceiros).map(Number).sort().forEach(anoProc => {
        if (anoProc > ano) return;
        const anoData = dadosFinanceiros[anoProc];
        if (!anoData?.meses) return;

        const mesLimite = anoProc === ano ? mes : 12;
        for (let m = 0; m < mesLimite; m++) {
            const mesDados = anoData.meses[m];
            if (mesDados) {
                const recMes = (mesDados.receitas || []).reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
                const despMes = (mesDados.despesas || []).reduce((sum, d) => sum + parseFloat(d.valor || 0), 0);
                const resMes = reservasCache
                    .filter(r => parseInt(r.ano) === anoProc && parseInt(r.mes) === m)
                    .reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
                saldo += recMes - despMes - resMes;
            }
        }
    });

    return saldo;
}

function calcularReservasAteData(ano, mes, reservasCache) {
    return reservasCache
        .filter(r => {
            const rAno = parseInt(r.ano);
            const rMes = parseInt(r.mes);
            return rAno < ano || (rAno === ano && rMes < mes);
        })
        .reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
}

// Função legada para compatibilidade
function criarGraficoBalanco(dados) {
    window.dadosBalancoCache = dados;
    filtrarBalancoPeriodo();
}

// ================================================================
// GRÁFICO 2: TENDÊNCIA ANUAL
// ================================================================

function criarGraficoTendenciaAnualComFiltros(dadosFinanceiros, anoAtual, filtros) {
    const ctx = document.getElementById('tendencia-chart')?.getContext('2d');
    if (!ctx) return;

    const anos = [anoAtual-2, anoAtual-1, anoAtual];
    const dadosReceitas = [];
    const dadosDespesas = [];

    anos.forEach(ano => {
        let receitasAno = 0;
        let totalDespesas = 0;

        // Saldo inicial do ano
        const saldoInicialAno = window.obterSaldoAnterior ? window.obterSaldoAnterior(0, ano) : 0;

        if (dadosFinanceiros[ano]) {
            for (let i = 0; i < 12; i++) {
                const dadosMes = dadosFinanceiros[ano].meses[i];
                if (!dadosMes) continue;

                const despesasFiltradas = aplicarFiltrosDespesas(dadosMes.despesas || [], filtros);

                const receitasMes = (dadosMes.receitas || []).reduce((sum, r) => {
                    if (r.saldoAnterior === true ||
                        r.descricao?.includes('Saldo Anterior') ||
                        r.automatica === true) {
                        return sum;
                    }
                    return sum + (r.valor || 0);
                }, 0);

                receitasAno += receitasMes;
                totalDespesas += window.calcularTotalDespesas ?
                                window.calcularTotalDespesas(despesasFiltradas) : 0;
            }
        }

        // Total de reservas do ano
        let totalReservado = 0;
        if (window.reservasCache && Array.isArray(window.reservasCache)) {
            totalReservado = window.reservasCache
                .filter(r => parseInt(r.ano) === ano)
                .reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
        }

        // Receitas Totais = saldo inicial + receitas - reservas
        const receitasTotais = saldoInicialAno + receitasAno - totalReservado;

        dadosReceitas.push(receitasTotais);
        dadosDespesas.push(totalDespesas);
    });
    
    if (window.tendenciaChart) {
        window.tendenciaChart.destroy();
    }
    
    const datasets = [];
    
    if (filtros.tipo === 'ambos' || filtros.tipo === 'receitas') {
        datasets.push({
            label: 'Receitas Totais',
            data: dadosReceitas,
            backgroundColor: 'rgba(40, 167, 69, 0.7)',
            borderColor: 'rgb(40, 167, 69)'
        });
    }
    
    if (filtros.tipo === 'ambos' || filtros.tipo === 'despesas') {
        datasets.push({
            label: 'Despesas Totais',
            data: dadosDespesas,
            backgroundColor: 'rgba(220, 53, 69, 0.7)',
            borderColor: 'rgb(220, 53, 69)'
        });
    }
    
    window.tendenciaChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: anos.map(ano => ano.toString()),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return window.formatarMoeda(value);
                        }
                    }
                },
                x: {
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + window.formatarMoeda(context.raw);
                        },
                        afterBody: function(tooltipItems) {
                            if (filtros.tipo === 'ambos' && tooltipItems.length >= 1) {
                                const dataIndex = tooltipItems[0].dataIndex;
                                const receita = dadosReceitas[dataIndex];
                                const despesa = dadosDespesas[dataIndex];
                                const saldo = receita - despesa;
                                return 'Saldo: ' + window.formatarMoeda(saldo);
                            }
                        }
                    }
                }
            }
        }
    });
}

// ================================================================
// GRÁFICO 3: ENTRADAS E SAÍDAS
// ================================================================

function criarGraficoReceitasDespesasComFiltros(dados, filtros) {
    const ctx = document.getElementById('receitas-despesas-chart')?.getContext('2d');
    if (!ctx) return;
    
    if (window.receitasDespesasChart) {
        window.receitasDespesasChart.destroy();
    }
    
    const datasets = [];
    
    if (filtros.tipo === 'ambos' || filtros.tipo === 'receitas') {
        datasets.push({
            label: 'Receitas',
            data: dados.receitas,
            backgroundColor: 'rgba(40, 167, 69, 0.7)',
            borderColor: 'rgb(40, 167, 69)'
        });
    }
    
    if (filtros.tipo === 'ambos' || filtros.tipo === 'despesas') {
        datasets.push({
            label: 'Despesas',
            data: dados.despesas,
            backgroundColor: 'rgba(220, 53, 69, 0.7)',
            borderColor: 'rgb(220, 53, 69)'
        });
    }
    
    window.receitasDespesasChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dados.labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return window.formatarMoeda(value);
                        }
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + window.formatarMoeda(context.raw);
                        }
                    }
                }
            }
        }
    });
}

window.filtrarReceitasDespesas = function() {
    const filtros = obterFiltrosDoGrafico('receitas-despesas');
    
    const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const dadosMensais = {
        labels: nomesMeses,
        receitas: [],
        despesas: []
    };
    
    for (let i = 0; i < 12; i++) {
        const dadosMes = window.dadosFinanceiros[window.anoAtual]?.meses[i];
        
        if (!dadosMes) {
            dadosMensais.receitas.push(0);
            dadosMensais.despesas.push(0);
            continue;
        }
        
        const receitasReais = (dadosMes.receitas || []).reduce((sum, r) => {
            if (r.saldoAnterior === true || 
                r.descricao?.includes('Saldo Anterior') ||
                r.automatica === true) {
                return sum;
            }
            return sum + (r.valor || 0);
        }, 0);
        
        const despesasFiltradas = aplicarFiltrosDespesas(dadosMes.despesas || [], filtros);
        const despesasTotal = window.calcularTotalDespesas ? 
                             window.calcularTotalDespesas(despesasFiltradas) : 0;
        
        dadosMensais.receitas.push(receitasReais);
        dadosMensais.despesas.push(despesasTotal);
    }
    
    criarGraficoReceitasDespesasComFiltros(dadosMensais, filtros);
};

// ================================================================
// GRÁFICO 4: CATEGORIAS ANUAIS (BARRAS)
// ================================================================

function criarGraficoBarrasCategoriasComFiltros(dadosFinanceiros, ano, filtros) {
    const ctx = document.getElementById('categorias-barras-chart')?.getContext('2d');
    if (!ctx) return;
    
    const categorias = {};
    
    if (dadosFinanceiros[ano]) {
        for (let i = 0; i < 12; i++) {
            const dadosMes = dadosFinanceiros[ano].meses[i];
            if (!dadosMes || !dadosMes.despesas) continue;
            
            const despesasFiltradas = aplicarFiltrosDespesas(dadosMes.despesas, filtros);
            
            despesasFiltradas.forEach(despesa => {
                const categoria = window.obterCategoriaLimpa ? window.obterCategoriaLimpa(despesa) : (despesa.categoria || 'Sem categoria');
                const valor = window.obterValorRealDespesa ? window.obterValorRealDespesa(despesa) : (despesa.valor || 0);
                
                if (!isNaN(valor) && valor > 0) {
                    categorias[categoria] = (categorias[categoria] || 0) + valor;
                }
            });
        }
    }
    
    const categoriasArray = Object.keys(categorias).map(categoria => ({
        categoria,
        valor: categorias[categoria]
    })).sort((a, b) => b.valor - a.valor).slice(0, 10);
    
    const labels = categoriasArray.map(c => c.categoria);
    const valores = categoriasArray.map(c => c.valor);
    const cores = obterCoresParaCategorias(labels);
    
    if (window.categoriasBarrasChart) {
        window.categoriasBarrasChart.destroy();
    }
    
    if (labels.length > 0) {
        window.categoriasBarrasChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Despesas por Categoria',
                    data: valores,
                    backgroundColor: cores,
                    borderColor: cores.map(cor => cor.replace('0.7', '1')),
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y', // Define a orientação horizontal
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return window.formatarMoeda(value);
                            }
                        }
                    },
                    y: {
                        ticks: {
                            autoSkip: false
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const valor = context.raw;
                                const total = valores.reduce((sum, val) => sum + val, 0);
                                const porcentagem = ((valor / total) * 100).toFixed(1);
                                return `${window.formatarMoeda(valor)} (${porcentagem}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
}

// ================================================================
// GRÁFICO 5: CATEGORIAS MENSAIS (EMPILHADAS)
// ================================================================

function criarGraficoCategoriasMensaisComFiltros(dadosFinanceiros, ano, filtros) {
    const ctx = document.getElementById('categorias-mensais-chart')?.getContext('2d');
    if (!ctx) return;
    
    const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    if (!dadosFinanceiros[ano]) return;
    
    if (window.categoriasEmpilhadasChart) {
        window.categoriasEmpilhadasChart.destroy();
    }
    
    const dadosMensaisPorCategoria = {};
    let todasCategorias = new Set();
    
    for (let i = 0; i < 12; i++) {
        const dadosMes = dadosFinanceiros[ano].meses[i];
        dadosMensaisPorCategoria[i] = { mes: nomesMeses[i], total: 0 };
        
        if (!dadosMes || !dadosMes.despesas) continue;
        
        const despesasFiltradas = aplicarFiltrosDespesas(dadosMes.despesas, filtros);
        
        despesasFiltradas.forEach(despesa => {
            const categoria = window.obterCategoriaLimpa ? window.obterCategoriaLimpa(despesa) : (despesa.categoria || 'Sem categoria');
            const valor = window.obterValorRealDespesa ? window.obterValorRealDespesa(despesa) : (despesa.valor || 0);
            
            if (!isNaN(valor) && valor > 0) {
                todasCategorias.add(categoria);
                dadosMensaisPorCategoria[i][categoria] = (dadosMensaisPorCategoria[i][categoria] || 0) + valor;
                dadosMensaisPorCategoria[i].total += valor;
            }
        });
    }
    
    const categorias = Array.from(todasCategorias);
    let categoriasParaExibir = categorias;
    
    if (categorias.length > 20) {
        const totalPorCategoria = {};
        categorias.forEach(cat => {
            totalPorCategoria[cat] = 0;
            for (let i = 0; i < 12; i++) {
                if (dadosMensaisPorCategoria[i][cat]) totalPorCategoria[cat] += dadosMensaisPorCategoria[i][cat];
            }
        });
        const ordenadas = Object.keys(totalPorCategoria).sort((a,b) => totalPorCategoria[b] - totalPorCategoria[a]).slice(0, 20);
        categoriasParaExibir = [...ordenadas, "Outros"];
        for (let i = 0; i < 12; i++) {
            let outrosValor = 0;
            categorias.forEach(cat => {
                if (!ordenadas.includes(cat) && dadosMensaisPorCategoria[i][cat]) {
                    outrosValor += dadosMensaisPorCategoria[i][cat];
                    delete dadosMensaisPorCategoria[i][cat];
                }
            });
            if (outrosValor > 0) dadosMensaisPorCategoria[i]["Outros"] = outrosValor;
        }
    }
    
    const dadosParaGrafico = Object.values(dadosMensaisPorCategoria);
    
    const datasets = categoriasParaExibir.map((categoria) => {
        return {
            label: categoria,
            data: dadosParaGrafico.map(dadosMes => dadosMes[categoria] || 0),
            backgroundColor: obterCorCategoria(categoria),
            borderColor: obterCorCategoria(categoria).replace('0.7', '1'),
            borderWidth: 1
        };
    });
    
    if (dadosParaGrafico.length > 0 && categoriasParaExibir.length > 0) {
        window.categoriasEmpilhadasChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: nomesMeses,
                datasets: datasets
            },
            options: {
                indexAxis: 'y', // Ativa barras horizontais
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { 
                        stacked: true, // Empilhamento no eixo X (valores)
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return window.formatarMoeda(value);
                            }
                        }
                    },
                    y: { 
                        stacked: true // Empilhamento no eixo Y (meses)
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const valor = context.raw;
                                const categoria = context.dataset.label;
                                const mesIndex = context.dataIndex;
                                const totalMes = dadosParaGrafico[mesIndex].total;
                                const porcentagem = totalMes > 0 ? ((valor / totalMes) * 100).toFixed(1) : 0;
                                return `${categoria}: ${window.formatarMoeda(valor)} (${porcentagem}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
}

// ================================================================
// GRÁFICO 6: JUROS MENSAIS
// ================================================================

function criarGraficoJurosComFiltros(dadosFinanceiros, ano, filtros) {
    const ctx = document.getElementById('juros-chart')?.getContext('2d');
    if (!ctx) return;
    
    const dados = calcularDadosJurosMensaisComFiltros(dadosFinanceiros, ano, filtros);
    
    if (window.jurosChart) {
        window.jurosChart.destroy();
    }
    
    window.jurosChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dados.meses,
            datasets: [
                {
                    label: 'Juros a Pagar',
                    data: dados.jurosAPagar,
                    backgroundColor: 'rgba(255, 159, 64, 0.7)',
                    borderColor: 'rgb(255, 159, 64)'
                },
                {
                    label: 'Juros Pagos',
                    data: dados.jurosPagos,
                    backgroundColor: 'rgba(255, 99, 132, 0.9)',
                    borderColor: 'rgb(255, 99, 132)'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return window.formatarMoeda(value);
                        }
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${window.formatarMoeda(context.raw)}`;
                        }
                    }
                }
            }
        }
    });
    
    atualizarEstatisticasJuros(dados.resumo);
}

function calcularDadosJurosMensaisComFiltros(dadosFinanceiros, ano, filtros) {
    const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    const dadosMensais = {
        meses: nomesMeses,
        jurosAPagar: Array(12).fill(0),
        jurosPagos: Array(12).fill(0)
    };

    let resumoGeral = {
        totalJuros: 0,
        jurosPagos: 0
    };

    if (!dadosFinanceiros[ano]) {
        return { ...dadosMensais, resumo: resumoGeral };
    }

    for (let mes = 0; mes < 12; mes++) {
        const dadosMes = dadosFinanceiros[ano].meses[mes];
        if (!dadosMes || !dadosMes.despesas) continue;

        const despesasFiltradas = aplicarFiltrosDespesas(dadosMes.despesas, filtros);

        despesasFiltradas.forEach(despesa => {
            const isPago = despesa.quitado || despesa.status === 'quitada';

            // Usar a função centralizada de cálculo de juros
            const jurosValor = window.calcularJurosDespesa ? window.calcularJurosDespesa(despesa) : 0;

            if (jurosValor > 0) {
                resumoGeral.totalJuros += jurosValor;

                if (isPago) {
                    dadosMensais.jurosPagos[mes] += jurosValor;
                    resumoGeral.jurosPagos += jurosValor;
                } else {
                    dadosMensais.jurosAPagar[mes] += jurosValor;
                }
            }
        });
    }

    return { ...dadosMensais, resumo: resumoGeral };
}

function atualizarEstatisticasJuros(dados) {
    const porcentagemPagos = dados.totalJuros > 0 ? 
        ((dados.jurosPagos / dados.totalJuros) * 100).toFixed(1) : 0;
    const jurosPendentes = dados.totalJuros - dados.jurosPagos;
    
    document.getElementById('juros-pendentes-valor').textContent = window.formatarMoeda(jurosPendentes);
    document.getElementById('juros-pagos-percentual').textContent = porcentagemPagos + '%';
}

// ================================================================
// GRÁFICO 7: PARCELAMENTOS MENSAIS
// ================================================================

function criarGraficoParcelamentosComFiltros(dadosFinanceiros, ano, filtros) {
    const ctx = document.getElementById('parcelamentos-chart')?.getContext('2d');
    if (!ctx) return;
    
    const dados = calcularDadosParcelamentosMensaisComFiltros(dadosFinanceiros, ano, filtros);
    
    if (window.parcelamentosChart) {
        window.parcelamentosChart.destroy();
    }
    
    window.parcelamentosChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dados.meses,
            datasets: [
                {
                    label: 'Parcelas Pendentes',
                    data: dados.parcelasAPagar,
                    backgroundColor: 'rgba(54, 162, 235, 0.7)',
                    borderColor: 'rgb(54, 162, 235)'
                },
                {
                    label: 'Parcelas Pagas',
                    data: dados.parcelasPagas,
                    backgroundColor: 'rgba(75, 192, 192, 0.9)',
                    borderColor: 'rgb(75, 192, 192)'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return window.formatarMoeda(value);
                        }
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${window.formatarMoeda(context.raw)}`;
                        }
                    }
                }
            }
        }
    });
    
    atualizarEstatisticasParcelamentos(dados.resumo);
}

function calcularDadosParcelamentosMensaisComFiltros(dadosFinanceiros, ano, filtros) {
    const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    const dadosMensais = {
        meses: nomesMeses,
        parcelasAPagar: Array(12).fill(0),
        parcelasPagas: Array(12).fill(0)
    };
    
    let resumoGeral = {
        totalParcelado: 0,
        parcelasPagas: 0
    };
    
    if (!dadosFinanceiros[ano]) {
        return { ...dadosMensais, resumo: resumoGeral };
    }
    
    for (let mes = 0; mes < 12; mes++) {
        const dadosMes = dadosFinanceiros[ano].meses[mes];
        if (!dadosMes || !dadosMes.despesas) continue;
        
        const despesasFiltradas = aplicarFiltrosDespesas(dadosMes.despesas, filtros);
        
        despesasFiltradas.forEach(despesa => {
            if (!despesa.parcelado) return;
            
            const valor = window.obterValorRealDespesa ? window.obterValorRealDespesa(despesa) : (despesa.valor || 0);
            const isPago = despesa.quitado || despesa.status === 'quitada';
            
            resumoGeral.totalParcelado += valor;
            
            if (isPago) {
                dadosMensais.parcelasPagas[mes] += valor;
                resumoGeral.parcelasPagas += valor;
            } else {
                dadosMensais.parcelasAPagar[mes] += valor;
            }
        });
    }
    
    return { ...dadosMensais, resumo: resumoGeral };
}

function atualizarEstatisticasParcelamentos(dados) {
    const porcentagemPagas = dados.totalParcelado > 0 ? 
        ((dados.parcelasPagas / dados.totalParcelado) * 100).toFixed(1) : 0;
    const parcelasPendentes = dados.totalParcelado - dados.parcelasPagas;
    
    document.getElementById('parcelas-pendentes-valor').textContent = window.formatarMoeda(parcelasPendentes);
    document.getElementById('parcelas-pagas-percentual').textContent = porcentagemPagas + '%';
}

// ================================================================
// GRÁFICO 8: FORMAS DE PAGAMENTO
// ================================================================

function criarGraficoFormaPagamentoComFiltros(dadosFinanceiros, ano, filtros) {
    const ctx = document.getElementById('forma-pagamento-chart')?.getContext('2d');
    if (!ctx) return;
    
    const formasPagamento = { pix: 0, debito: 0, dinheiro: 0, credito: 0 };
    
    if (dadosFinanceiros[ano]) {
        for (let i = 0; i < 12; i++) {
            const dadosMes = dadosFinanceiros[ano].meses[i];
            if (!dadosMes || !dadosMes.despesas) continue;
            
            const despesasFiltradas = aplicarFiltrosDespesas(dadosMes.despesas, filtros);
            
            despesasFiltradas.forEach(despesa => {
                const valor = window.obterValorRealDespesa ? window.obterValorRealDespesa(despesa) : (despesa.valor || 0);
                let formaPagamento = despesa.formaPagamento;
                
                if (!formaPagamento) {
                    if (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito') {
                        formaPagamento = 'credito';
                    } else {
                        formaPagamento = 'debito';
                    }
                }
                
                if (formasPagamento.hasOwnProperty(formaPagamento) && !isNaN(valor)) {
                    formasPagamento[formaPagamento] += valor;
                }
            });
        }
    }
    
    const valores = [formasPagamento.pix, formasPagamento.debito, formasPagamento.dinheiro, formasPagamento.credito];
    
    if (window.formaPagamentoChart) {
        window.formaPagamentoChart.destroy();
    }
    
    if (valores.some(v => v > 0)) {
        window.formaPagamentoChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['PIX', 'Débito', 'Dinheiro', 'Crédito'],
                datasets: [{
                    data: valores,
                    backgroundColor: [
                        '#00D4AA',
                        '#3B82F6',
                        '#28A745',
                        '#F59E0B'
                    ],
                    borderColor: '#ffffff',
                    borderWidth: 4,
                    spacing: 4,
                    borderRadius: 6,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const valor = context.raw;
                                const total = valores.reduce((sum, val) => sum + val, 0);
                                const porcentagem = total > 0 ? ((valor / total) * 100).toFixed(1) : 0;
                                return `${context.label}: ${window.formatarMoeda(valor)} (${porcentagem}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
}



// Função para filtrar e disparar a criação do gráfico
window.filtrarMediaItens = function() {
    const filtros = {
        categoria: document.getElementById('media-item-categoria-filter').value,
        formaPagamento: 'todas', // Padrão para este gráfico
        status: 'todos',
        tipo: 'despesas'
    };
    criarGraficoMediaItens(window.dadosFinanceiros, window.anoAtual, filtros);
};

function criarGraficoMediaItens(dadosFinanceiros, ano, filtros) {
    const ctx = document.getElementById('media-itens-chart')?.getContext('2d');
    if (!ctx || !dadosFinanceiros[ano]) return;

    const contagemItens = {}; // { 'Nome da Despesa': { total: 0, qtd: 0 } }

    // Percorre todos os meses do ano
    for (let i = 0; i < 12; i++) {
        const dadosMes = dadosFinanceiros[ano].meses[i];
        if (!dadosMes || !dadosMes.despesas) continue;

        const despesasFiltradas = aplicarFiltrosDespesas(dadosMes.despesas, filtros);

        despesasFiltradas.forEach(despesa => {
            const nome = despesa.descricao || 'Sem descrição';
            const valor = window.obterValorRealDespesa ? window.obterValorRealDespesa(despesa) : (despesa.valor || 0);

            if (valor > 0) {
                if (!contagemItens[nome]) {
                    contagemItens[nome] = { total: 0, qtd: 0 };
                }
                contagemItens[nome].total += valor;
                contagemItens[nome].qtd += 1;
            }
        });
    }

    // Calcula a média e ordena pelos maiores valores médios
    const mediasArray = Object.keys(contagemItens).map(nome => ({
        nome: nome,
        media: contagemItens[nome].total / contagemItens[nome].qtd
    }))
    .sort((a, b) => b.media - a.media)
    .slice(0, 10); // Top 10 itens mais caros em média

    if (window.mediaItensChart) {
        window.mediaItensChart.destroy();
    }

    window.mediaItensChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: mediasArray.map(m => m.nome),
            datasets: [{
                label: 'Valor Médio por Ocorrência',
                data: mediasArray.map(m => m.media),
                backgroundColor: 'rgba(54, 162, 235, 0.7)',
                borderColor: 'rgb(54, 162, 235)',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `Média: ${window.formatarMoeda(context.raw)}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { callback: (value) => window.formatarMoeda(value) }
                }
            }
        }
    });
}

function renderizarGraficoMediaCategorias() {
    const ctx = document.getElementById('media-categorias-chart')?.getContext('2d');
    if (!ctx) return;

    // Busca o ano ativo do sistema global
    const ano = window.anoAtual || new Date().getFullYear();
    const dadosAno = window.dadosFinanceiros[ano];

    if (!dadosAno || !dadosAno.meses) {
        console.warn("Dados não encontrados para o gráfico de médias.");
        return;
    }

    const filtroPagamento = document.getElementById('media-cat-pagamento-filter')?.value || 'todas';
    const totaisPorCategoria = {};

    // 1. Processamento dos dados: Soma anual agrupada por categoria
    for (let i = 0; i < 12; i++) {
        const mes = dadosAno.meses[i];
        if (mes && mes.despesas) {
            mes.despesas.forEach(despesa => {
                // Usa a função obterValorRealDespesa para calcular o valor correto (com juros, quitação antecipada, etc)
                const valor = window.obterValorRealDespesa ? window.obterValorRealDespesa(despesa) : (despesa.valor || 0);
                const forma = (despesa.formaPagamento || '').toLowerCase();

                // Usa obterCategoriaLimpa para padronizar categoria
                const categoria = window.obterCategoriaLimpa ? window.obterCategoriaLimpa(despesa) : (despesa.categoria || 'Sem Categoria');

                // Aplica filtro de forma de pagamento se selecionado
                if (filtroPagamento !== 'todas' && forma !== filtroPagamento) return;

                if (!isNaN(valor) && valor > 0) {
                    totaisPorCategoria[categoria] = (totaisPorCategoria[categoria] || 0) + valor;
                }
            });
        }
    }

    // 2. Cálculo da média mensal (Total Anual / 12 meses)
    const labels = Object.keys(totaisPorCategoria).sort();
    const valoresMedios = labels.map(cat => totaisPorCategoria[cat] / 12);
    const cores = obterCoresParaCategorias(labels);

    // 3. Renderização visual com Chart.js
    if (window.mediaCategoriasChart) {
        window.mediaCategoriasChart.destroy();
    }

    if (labels.length > 0) {
        window.mediaCategoriasChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Média Mensal',
                    data: valoresMedios,
                    backgroundColor: cores,
                    borderColor: cores.map(cor => cor.replace('0.7', '1')),
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return 'Média Mensal: ' + window.formatarMoeda(context.raw);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return window.formatarMoeda(value);
                            }
                        }
                    },
                    y: {
                        ticks: {
                            autoSkip: false
                        }
                    }
                }
            }
        });
    }
}

// Torna a função disponível para o main.js
window.renderizarGraficoMediaCategorias = renderizarGraficoMediaCategorias;

// ================================================================
// GRAFICO DE USO DE CARTOES
// ================================================================

function renderDistribuicaoCartoes(dadosFinanceiros, ano, filtros = {}) {
    const ctx = document.getElementById('cartoes-usados-chart');
    if (!ctx) return;

    // Contabilizar uso por cartão
    const usoPorCartao = {};
    const cartoes = window.cartoesUsuario || [];

    // Inicializar contadores para todos os cartões
    cartoes.forEach(cartao => {
        usoPorCartao[cartao.id] = {
            nome: cartao.nome,
            valor: 0,
            quantidade: 0,
            cor: cartao.cor || '#6366f1'
        };
    });

    // Somar despesas por cartão
    if (dadosFinanceiros && dadosFinanceiros[ano]) {
        for (let mes = 0; mes < 12; mes++) {
            const dadosMes = dadosFinanceiros[ano].meses[mes];
            if (!dadosMes || !dadosMes.despesas) continue;

            const despesasFiltradas = aplicarFiltrosDespesas(dadosMes.despesas, filtros);

            despesasFiltradas.forEach(despesa => {
                const formaPag = (despesa.formaPagamento || '').toLowerCase();
                // Apenas despesas de crédito
                if (formaPag !== 'credito' && formaPag !== 'crédito' && !formaPag.includes('cred')) return;

                const cartaoId = despesa.cartao_id || despesa.cartaoId;
                if (cartaoId && usoPorCartao[cartaoId]) {
                    const valor = window.obterValorRealDespesa ? window.obterValorRealDespesa(despesa) : (despesa.valor || 0);
                    usoPorCartao[cartaoId].valor += valor;
                    usoPorCartao[cartaoId].quantidade++;
                }
            });
        }
    }

    // Filtrar apenas cartões com uso
    const cartoesComUso = Object.values(usoPorCartao).filter(c => c.valor > 0);

    // Ordenar por valor (maior para menor)
    cartoesComUso.sort((a, b) => b.valor - a.valor);

    if (window.chartDistribuicaoCartoes) {
        window.chartDistribuicaoCartoes.destroy();
    }

    if (cartoesComUso.length > 0) {
        const labels = cartoesComUso.map(c => c.nome);
        const valores = cartoesComUso.map(c => c.valor);

        // Paleta de cores vibrantes e distintas para cada cartão
        const paletaCores = [
            '#8B4513',  // Marrom
            '#9370DB',  // Roxo claro
            '#E91E63',  // Rosa
            '#00BCD4',  // Ciano
            '#4CAF50',  // Verde
            '#FF9800',  // Laranja
            '#3F51B5',  // Azul índigo
            '#F44336',  // Vermelho
            '#009688',  // Teal
            '#FFEB3B',  // Amarelo
            '#795548',  // Marrom escuro
            '#607D8B'   // Cinza azulado
        ];

        // Atribuir cores da paleta para cada cartão
        const cores = cartoesComUso.map((c, index) => paletaCores[index % paletaCores.length]);

        window.chartDistribuicaoCartoes = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: valores,
                    backgroundColor: cores,
                    borderColor: '#ffffff',
                    borderWidth: 4,
                    spacing: 4,
                    borderRadius: 6,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const valor = context.raw;
                                const total = valores.reduce((sum, val) => sum + val, 0);
                                const porcentagem = total > 0 ? ((valor / total) * 100).toFixed(1) : 0;
                                const cartaoInfo = cartoesComUso[context.dataIndex];
                                return `${context.label}: ${window.formatarMoeda(valor)} (${porcentagem}%) - ${cartaoInfo.quantidade} compras`;
                            }
                        }
                    }
                }
            }
        });
    } else {
        // Sem dados - mostrar mensagem
        ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
    }
}

window.aplicarFiltroDistribuicaoCartoes = function() {
    const filtros = {
        categoria: document.getElementById('cartoes-categoria-filter')?.value || '',
        formaPagamento: 'credito', // Fixo em crédito
        status: 'todos',
        tipo: 'despesas'
    };
    renderDistribuicaoCartoes(window.dadosFinanceiros, window.anoAtual, filtros);
};

window.renderDistribuicaoCartoes = renderDistribuicaoCartoes;

// ================================================================
// SISTEMA DE FILTROS
// ================================================================

function obterCategorias(ano) {
    const categorias = new Set();
    
    if (!window.dadosFinanceiros[ano]) return [];
    
    for (let mes = 0; mes < 12; mes++) {
        const dadosMes = window.dadosFinanceiros[ano].meses[mes];
        if (!dadosMes || !dadosMes.despesas) continue;
        
        dadosMes.despesas.forEach(despesa => {
            const categoria = window.obterCategoriaLimpa ? 
                             window.obterCategoriaLimpa(despesa) : 
                             (despesa.categoria || 'Sem categoria');
            categorias.add(categoria);
        });
    }
    
    return Array.from(categorias).sort();
}

function preencherSelectCategorias() {
    const categorias = obterCategorias(window.anoAtual);
    const selects = document.querySelectorAll('select[id*="categoria-filter"]');
    
    selects.forEach(select => {
        const valorAtual = select.value;
        
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        categorias.forEach(categoria => {
            const option = document.createElement('option');
            option.value = categoria;
            option.textContent = categoria;
            if (categoria === valorAtual) option.selected = true;
            select.appendChild(option);
        });
    });
}

function aplicarFiltrosDespesas(despesas, filtros) {
    return despesas.filter(despesa => {
        let passouFiltro = true;
        
        if (filtros.categoria && filtros.categoria !== '') {
            const categoriaLimpa = window.obterCategoriaLimpa ? 
                                   window.obterCategoriaLimpa(despesa) : 
                                   (despesa.categoria || 'Sem categoria');
            if (categoriaLimpa !== filtros.categoria) passouFiltro = false;
        }
        
        if (filtros.formaPagamento && filtros.formaPagamento !== 'todas') {
            let forma = despesa.formaPagamento;
            if (!forma) {
                if (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito') {
                    forma = 'credito';
                } else {
                    forma = 'debito';
                }
            }
            if (forma !== filtros.formaPagamento) passouFiltro = false;
        }
        
        if (filtros.status && filtros.status !== 'todos') {
            const isPago = despesa.quitado || despesa.status === 'quitada';
            if (filtros.status === 'pagos' && !isPago) passouFiltro = false;
            if (filtros.status === 'pendentes' && isPago) passouFiltro = false;
        }
        
        return passouFiltro;
    });
}

function obterFiltrosDoGrafico(prefixo) {
    const categoria = document.getElementById(`${prefixo}-categoria-filter`)?.value || '';
    const formaPagamento = document.getElementById(`${prefixo}-pagamento-filter`)?.value || 'todas';
    const status = document.getElementById(`${prefixo}-status-filter`)?.value || 'todos';
    const tipo = document.getElementById(`${prefixo}-tipo-filter`)?.value || 'ambos';
    
    return { categoria, formaPagamento, status, tipo };
}




// ================================================================
// FUNÇÕES DE FILTRO ESPECÍFICAS POR GRÁFICO
// ================================================================

window.filtrarTendencia = function() {
    const filtros = obterFiltrosDoGrafico('tendencia');
    criarGraficoTendenciaAnualComFiltros(window.dadosFinanceiros, window.anoAtual, filtros);
};

window.filtrarCategoriasAnual = function() {
    const filtros = obterFiltrosDoGrafico('categorias-anual');
    criarGraficoBarrasCategoriasComFiltros(window.dadosFinanceiros, window.anoAtual, filtros);
};

window.filtrarCategoriasMensal = function() {
    const filtros = obterFiltrosDoGrafico('categorias-mensal');
    criarGraficoCategoriasMensaisComFiltros(window.dadosFinanceiros, window.anoAtual, filtros);
};

window.filtrarJuros = function() {
    const filtros = obterFiltrosDoGrafico('juros');
    criarGraficoJurosComFiltros(window.dadosFinanceiros, window.anoAtual, filtros);
};

window.filtrarParcelamentos = function() {
    const filtros = obterFiltrosDoGrafico('parcelamentos');
    criarGraficoParcelamentosComFiltros(window.dadosFinanceiros, window.anoAtual, filtros);
};

window.filtrarFormaPagamento = function() {
    const filtros = obterFiltrosDoGrafico('forma-pagamento');
    criarGraficoFormaPagamentoComFiltros(window.dadosFinanceiros, window.anoAtual, filtros);
};

// ================================================================
// EXPORTAR FUNÇÕES GLOBAIS
// ================================================================

window.carregarDadosDashboard = carregarDadosDashboard;
window.filtrarBalancoPeriodo = filtrarBalancoPeriodo;
window.resetarFiltrosBalanco = resetarFiltrosBalanco;