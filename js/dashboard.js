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

// ================================================================
// UTILITÁRIO: STEP SIZE DINÂMICO PARA EIXOS MONETÁRIOS
// ================================================================

function calcularStepSize(maxValor) {
    const abs = Math.abs(maxValor || 0);
    if (abs <= 50)    return 5;
    if (abs <= 100)   return 10;
    if (abs <= 500)   return 50;
    if (abs <= 1000)  return 100;
    if (abs <= 2000)  return 200;
    if (abs <= 5000)  return 500;
    if (abs <= 20000) return 2000;
    if (abs <= 50000) return 5000;
    return 10000;
}

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

let dashboardObserverConfigurado = false;

// Inicialização: escuta o evento que main.js dispara APÓS tudo estar pronto
window.addEventListener('sistemaFinanceiroReady', function() {
    if (!dashboardObserverConfigurado) {
        configurarObservadores();
        dashboardObserverConfigurado = true;
    }
    // Carregar gráficos imediatamente se dashboard já estiver visível
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection && dashboardSection.classList.contains('active')) {
        carregarDadosDashboard(window.anoAtual);
    }
});

function configurarObservadores() {
    // Observer para quando o usuário navega para a aba Dashboard
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const dashboardSection = document.getElementById('dashboard-section');
                if (dashboardSection && dashboardSection.classList.contains('active')) {
                    carregarDadosDashboard(window.anoAtual);
                }
            }
        });
    });

    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection) {
        observer.observe(dashboardSection, { attributes: true });
    }

    document.getElementById('btn-ano-anterior')?.addEventListener('click', function() {
        window.anoDashboard = null;
        setTimeout(() => carregarDadosDashboard(window.anoAtual), 100);
    });

    document.getElementById('btn-proximo-ano')?.addEventListener('click', function() {
        window.anoDashboard = null;
        setTimeout(() => carregarDadosDashboard(window.anoAtual), 100);
    });
}


// ================================================================
// FILTRO DE PERÍODO GLOBAL
// ================================================================

window.anoDashboard = null; // null = usa window.anoAtual

function obterFiltrosGlobais() {
    // Mantido para compatibilidade com funções legadas de gráfico ainda referenciadas
    return {
        tipo:           'ambos',
        categoria:      '',
        formaPagamento: 'todas',
        status:         'todos'
    };
}

function _anoGraficosAtual() {
    if (window.anoDashboard === 'todos') {
        return Object.keys(window.dadosFinanceiros || {}).map(Number).filter(Boolean).sort().pop() || window.anoAtual;
    }
    return window.anoAtual;
}

// Dead code — mantidas vazias para não quebrar referências externas
function inicializarPeriodFilter() {}
function aplicarFiltroPeriodo(valor) {}
function resetarFiltros() {}
function limparGraficos() {}
function _reaplicarFiltrosGlobais() {}
function _atualizarRodapeCards(valor) {}



// ================================================================
// FUNÇÃO MAXIMIZAR
// ================================================================


let graficoZoomInstance = null;

document.addEventListener('click', function(e) {
    // Verifica se o botão clicado tem o atributo data-chart (botões de maximizar gráficos)
    const btnZoom = e.target.closest('[data-chart]');
    if (btnZoom) {
        const nomeVariavelGrafico = btnZoom.getAttribute('data-chart');
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

let _dashboardCarregando = false;

async function carregarDadosDashboard(ano) {
    if (!window.dadosFinanceiros || !window.dadosFinanceiros[ano]) {
        return;
    }

    // Guard contra chamadas concorrentes (MutationObserver + sistemaFinanceiroReady)
    if (_dashboardCarregando) return;
    _dashboardCarregando = true;

    try {
        // Carregar reservas antes de criar os gráficos
        if (typeof window.carregarReservasAPI === 'function') {
            await window.carregarReservasAPI();
        }

        // Cards são atualizados pelo main.js (carregarDadosDashboardLocal) - fonte única de verdade
        if (typeof window.carregarDadosDashboardLocal === 'function') {
            window.carregarDadosDashboardLocal(window.anoDashboard ?? ano);
        }

        // Atualizar KPIs dos resumo-cards com dados do filtro temático
        atualizarKpisFixos();

        // Acionar o sistema temático
        if (typeof atualizarDashboardTematico === 'function') {
            atualizarDashboardTematico();
        }
    } finally {
        _dashboardCarregando = false;
    }
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

    // Saldo inicial do ano (saldo final do ano anterior)
    const saldoInicialAno = window.obterSaldoAnterior ? window.obterSaldoAnterior(0, ano) : 0;

    let receitasAno = 0;
    let totalDespesas = 0;
    let totalJuros = 0;
    let totalEconomias = 0;

    for (let i = 0; i < 12; i++) {
        const dadosMes = dadosFinanceiros[ano]?.meses[i] || { receitas: [], despesas: [] };

        // Calcular receitas direto dos dados (sem depender de window.calcularSaldoMes)
        const receitasMes = (dadosMes.receitas || []).reduce((sum, r) => {
            if (r.saldoAnterior === true ||
                r.descricao?.includes('Saldo Anterior') ||
                r.automatica === true) {
                return sum;
            }
            return sum + (parseFloat(r.valor) || 0);
        }, 0);

        // Saldo anterior do mês
        const saldoAnteriorMes = window.obterSaldoAnterior ? window.obterSaldoAnterior(i, ano) : 0;

        // Reservas do mês
        let reservasMes = 0;
        if (window.reservasCache && Array.isArray(window.reservasCache)) {
            reservasMes = window.reservasCache
                .filter(r => parseInt(r.mes) === i && parseInt(r.ano) === ano)
                .reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
        }

        const despesasMes = window.calcularTotalDespesas ? window.calcularTotalDespesas(dadosMes.despesas || []) : 0;
        const jurosMes = window.calcularTotalJuros ? window.calcularTotalJuros(dadosMes.despesas || []) : 0;
        const economiasMes = window.calcularTotalEconomias ? window.calcularTotalEconomias(dadosMes.despesas || []) : 0;

        receitasAno += receitasMes;
        totalDespesas += despesasMes;
        totalJuros += jurosMes;
        totalEconomias += economiasMes;

        // Gráfico "Entradas e Saídas" - receitas do mês
        dadosMensais.receitas.push(receitasMes);
        dadosMensais.despesas.push(despesasMes);

        // Saldo do mês
        const saldoMes = saldoAnteriorMes + receitasMes - despesasMes - reservasMes;
        dadosMensais.saldos.push(saldoMes);
    }

    // Total de reservas do ano
    let totalReservado = 0;
    if (window.reservasCache && Array.isArray(window.reservasCache)) {
        totalReservado = window.reservasCache
            .filter(r => parseInt(r.ano) === ano)
            .reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
    }

    // Receitas Totais = saldo inicial + receitas do ano - reservas (mesma fórmula do main.js e tendência anual)
    const receitasTotais = saldoInicialAno + receitasAno - totalReservado;

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

// ================================================================
// GRÁFICO 1: BALANÇO COM FILTRO DE PERÍODO
// ================================================================

// Configuração das colunas do gráfico de balanço
const BALANCO_DATASETS_CONFIG = {
balanco: {
        label: 'Balanço',
        borderColor: 'rgb(135, 206, 250)', // Light Sky Blue
        backgroundColor: 'rgba(135, 206, 250, 0.45)', // Mesmo tom com transparência
        order: 1
    }
};

function filtrarBalanco() {
    if (window.anoDashboard === 'todos') {
        criarGraficoBalancoPorAnos();
    } else {
        criarGraficoBalancoPorMeses(window.anoAtual || new Date().getFullYear());
    }
}

// Plugin termômetro: barra de fundo sempre até o topo, valor preenchido por cima
const backgroundBarPlugin = {
    id: 'backgroundBar',
    beforeDatasetsDraw(chart) {
        const { ctx, chartArea: { top, height } } = chart;
        chart.data.datasets.forEach((dataset, i) => {
            if (!chart.isDatasetVisible(i)) return;
            chart.getDatasetMeta(i).data.forEach(bar => {
                const bgColor = dataset.backgroundColor.replace(/[\d.]+\)$/, '0.12)');
                ctx.save();
                ctx.fillStyle = bgColor;
                const w = bar.width;
                ctx.fillRect(bar.x - w / 2, top, w, height);
                ctx.restore();
            });
        });
    }
};

// Criar dataset padrão para barra
function criarDatasetBarra(config, data) {
    return {
        label: config.label,
        data: data,
        backgroundColor: config.backgroundColor,
        borderColor: config.borderColor,
        borderWidth: 1,
        borderRadius: 14,
        borderSkipped: false,
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
                    stepSize: calcularStepSize(0),
                    callback: function(value) {
                        return window.formatarMoedaCompacta(value);
                    }
                },
                grid: { display: true, color: 'rgba(0,0,0,0.06)' },
                border: { display: false }
            },
            x: {
                grid: { display: false },
                border: { display: false }
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
                usePointStyle: false,
                boxWidth: 10,
                boxHeight: 10,
                boxPadding: 4,
                callbacks: {
                    label: function(context) {
                        return context.dataset.label + ': ' + window.formatarMoeda(context.raw);
                    }
                }
            }
        }
    };
}

// Plugin: desenha linha zero sempre visível
const zeroLinePlugin = {
    id: 'zeroLine',
    afterDraw(chart) {
        const yScale = chart.scales.y;
        if (!yScale) return;
        const y0 = yScale.getPixelForValue(0);
        if (y0 < yScale.top || y0 > yScale.bottom) return;
        const { ctx, chartArea } = chart;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y0);
        ctx.lineTo(chartArea.right, y0);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#94a3b8';
        ctx.stroke();
        ctx.restore();
    }
};

// ================================================================
// FILTRO ANO: Mostra totais por ano (2024, 2025, 2026...)
// ================================================================
function criarGraficoBalancoPorAnos() {
    const ctx = document.getElementById('balanco-chart')?.getContext('2d');
    if (!ctx) return;

    if (window.balancoChart) window.balancoChart.destroy();

    const anos = Object.keys(window.dadosFinanceiros || {}).map(Number).sort();
    if (anos.length === 0) return;

    const balancos = anos.map(ano => {
        let receitas = 0, despesas = 0;
        for (let m = 0; m < 12; m++) {
            const s = window.calcularSaldoMes(m, ano);
            receitas += s.receitas;
            despesas += s.despesas;
        }
        return receitas - despesas;
    });

    const maxAbs = Math.max(...balancos.map(Math.abs), 1);

    const coresBalanco = balancos.map(v => v >= 0 ? 'rgba(135, 206, 250, 0.7)' : 'rgba(239, 68, 68, 0.7)');

    const opcoesBalanco = getOpcoesGrafico();
    opcoesBalanco.scales.y.min = -(maxAbs * 1.15);
    opcoesBalanco.scales.y.max =   maxAbs * 1.15;
    opcoesBalanco.scales.y.ticks.stepSize = calcularStepSize(maxAbs);
    opcoesBalanco.plugins.legend.display = false;
    opcoesBalanco.layout = { padding: { top: 16, bottom: 16 } };

    const datasetBalancoAnos = {
        ...criarDatasetBarra(BALANCO_DATASETS_CONFIG.balanco, balancos),
        backgroundColor: coresBalanco,
        borderColor: coresBalanco.map(c => c.replace('0.7)', '1)')),
        borderRadius: balancos.map(v => v >= 0
            ? { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 }
            : { topLeft: 0, topRight: 0, bottomLeft: 6, bottomRight: 6 })
    };

    window.balancoChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: anos.map(a => a.toString()),
            datasets: [datasetBalancoAnos]
        },
        options: opcoesBalanco,
        plugins: [zeroLinePlugin]
    });
}

// ================================================================
// FILTRO MÊS: Mostra os 12 meses do ano selecionado
// ================================================================
function criarGraficoBalancoPorMeses(ano) {
    const ctx = document.getElementById('balanco-chart')?.getContext('2d');
    if (!ctx) return;

    if (window.balancoChart) window.balancoChart.destroy();

    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const balancos = Array.from({ length: 12 }, (_, m) => {
        const s = window.calcularSaldoMes(m, ano);
        return s.receitas - s.despesas;
    });

    const maxAbs = Math.max(...balancos.map(Math.abs), 1);

    const coresBalanco = balancos.map(v => v >= 0 ? 'rgba(135, 206, 250, 0.7)' : 'rgba(239, 68, 68, 0.7)');

    const opcoesBalanco = getOpcoesGrafico();
    opcoesBalanco.scales.y.min = -(maxAbs * 1.15);
    opcoesBalanco.scales.y.max =   maxAbs * 1.15;
    opcoesBalanco.scales.y.ticks.stepSize = calcularStepSize(maxAbs);
    opcoesBalanco.plugins.legend.display = false;
    opcoesBalanco.layout = { padding: { top: 16, bottom: 16 } };

    const datasetBalancoMeses = {
        ...criarDatasetBarra(BALANCO_DATASETS_CONFIG.balanco, balancos),
        backgroundColor: coresBalanco,
        borderColor: coresBalanco.map(c => c.replace('0.7)', '1)')),
        borderRadius: balancos.map(v => v >= 0
            ? { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 }
            : { topLeft: 0, topRight: 0, bottomLeft: 6, bottomRight: 6 })
    };

    window.balancoChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: meses,
            datasets: [datasetBalancoMeses]
        },
        options: opcoesBalanco,
        plugins: [zeroLinePlugin]
    });
}
// Função legada para compatibilidade
function criarGraficoBalanco(dados) {
    filtrarBalanco();
}

// ================================================================
// GRÁFICO 2: TENDÊNCIA ANUAL
// ================================================================

function criarGraficoTendenciaAnualComFiltros(dadosFinanceiros, anoAtual, filtros) {
    const ctx = document.getElementById('tendencia-chart')?.getContext('2d');
    if (!ctx) return;

    const anosDisponiveis = Object.keys(dadosFinanceiros).map(Number).filter(Boolean).sort();
    const anos = anoAtual === 'todos'
        ? anosDisponiveis
        : [anoAtual - 2, anoAtual - 1, anoAtual];
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

    const maxValorTendencia = Math.max(...dadosReceitas.concat(dadosDespesas).map(v => Math.abs(v || 0)));
    const datasets = [];
    
    if (filtros.tipo === 'ambos' || filtros.tipo === 'receitas') {
        datasets.push({
            label: 'Receitas Totais',
            data: dadosReceitas,
            backgroundColor: 'rgba(40, 167, 69, 0.7)',
            borderColor: 'rgb(40, 167, 69)',
            borderRadius: { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 },
            borderSkipped: false
        });
    }

    if (filtros.tipo === 'ambos' || filtros.tipo === 'despesas') {
        datasets.push({
            label: 'Despesas Totais',
            data: dadosDespesas,
            backgroundColor: 'rgba(220, 53, 69, 0.7)',
            borderColor: 'rgb(220, 53, 69)',
            borderRadius: { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 },
            borderSkipped: false
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
                    grid: { display: true, color: 'rgba(0,0,0,0.06)' },
                    border: { display: false },
                    ticks: {
                        stepSize: calcularStepSize(maxValorTendencia),
                        callback: function(value) {
                            return window.formatarMoedaCompacta(value);
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    border: { display: false }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    usePointStyle: false,
                    boxWidth: 10,
                    boxHeight: 10,
                    boxPadding: 4,
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

    const maxValorRD = Math.max(...(dados.receitas || []).concat(dados.despesas || []).map(v => Math.abs(v || 0)));
    const datasets = [];

    if (filtros.tipo === 'ambos' || filtros.tipo === 'receitas') {
        datasets.push({
            label: 'Receitas',
            data: dados.receitas,
            backgroundColor: 'rgba(40, 167, 69, 0.7)',
            borderColor: 'rgb(40, 167, 69)',
            borderRadius: { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 },
            borderSkipped: false
        });
    }

    if (filtros.tipo === 'ambos' || filtros.tipo === 'despesas') {
        datasets.push({
            label: 'Despesas',
            data: dados.despesas,
            backgroundColor: 'rgba(220, 53, 69, 0.7)',
            borderColor: 'rgb(220, 53, 69)',
            borderRadius: { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 },
            borderSkipped: false
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
                    grid: { display: true, color: 'rgba(0,0,0,0.06)' },
                    border: { display: false },
                    ticks: {
                        stepSize: calcularStepSize(maxValorRD),
                        callback: function(value) {
                            return window.formatarMoedaCompacta(value);
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    border: { display: false }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    usePointStyle: false,
                    boxWidth: 10,
                    boxHeight: 10,
                    boxPadding: 4,
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


// ================================================================
// GRÁFICO 4: CATEGORIAS ANUAIS (BARRAS)
// ================================================================

function criarGraficoBarrasCategoriasComFiltros(dadosFinanceiros, ano, filtros) {
    const ctx = document.getElementById('categorias-barras-chart')?.getContext('2d');
    if (!ctx) return;

    const categorias = {};
    const anosParaIterar = ano === 'todos'
        ? Object.keys(dadosFinanceiros).map(Number).filter(Boolean)
        : (dadosFinanceiros[ano] ? [ano] : []);

    anosParaIterar.forEach(anoN => {
        for (let i = 0; i < 12; i++) {
            const dadosMes = dadosFinanceiros[anoN]?.meses?.[i];
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
    });
    
    const categoriasArray = Object.keys(categorias).map(categoria => ({
        categoria,
        valor: categorias[categoria]
    })).sort((a, b) => b.valor - a.valor).slice(0, 10);
    
    const labels = categoriasArray.map(c => c.categoria);
    const valores = categoriasArray.map(c => c.valor);
    const cores = obterCoresParaCategorias(labels);
    const maxValorCatBarras = Math.max(...valores.map(v => Math.abs(v || 0)));

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
                    borderWidth: 1,
                    borderRadius: { topLeft: 0, topRight: 8, bottomLeft: 0, bottomRight: 8 },
                    borderSkipped: false
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { display: true, color: 'rgba(0,0,0,0.06)' },
                        border: { display: false },
                        ticks: {
                            stepSize: calcularStepSize(maxValorCatBarras),
                            callback: function(value) {
                                return window.formatarMoedaCompacta(value);
                            }
                        }
                    },
                    y: {
                        grid: { display: false },
                        border: { display: false },
                        ticks: {
                            autoSkip: false
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        usePointStyle: false,
                        boxWidth: 10,
                        boxHeight: 10,
                        boxPadding: 4,
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
    const anosParaIterar = ano === 'todos'
        ? Object.keys(dadosFinanceiros).map(Number).filter(Boolean)
        : (dadosFinanceiros[ano] ? [ano] : []);

    if (anosParaIterar.length === 0) return;

    if (window.categoriasEmpilhadasChart) {
        window.categoriasEmpilhadasChart.destroy();
    }

    const dadosMensaisPorCategoria = {};
    let todasCategorias = new Set();

    for (let i = 0; i < 12; i++) {
        dadosMensaisPorCategoria[i] = { mes: nomesMeses[i], total: 0 };
    }

    anosParaIterar.forEach(anoN => {
        for (let i = 0; i < 12; i++) {
            const dadosMes = dadosFinanceiros[anoN]?.meses?.[i];
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
    });
    
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
            borderColor: 'rgba(255,255,255,0.6)',
            borderWidth: 2,
            borderRadius: { topLeft: 0, topRight: 4, bottomLeft: 0, bottomRight: 4 },
            borderSkipped: false
        };
    });

    const maxValorCatMensais = Math.max(...dadosParaGrafico.map(d => d.total || 0));

    if (dadosParaGrafico.length > 0 && categoriasParaExibir.length > 0) {
        window.categoriasEmpilhadasChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: nomesMeses,
                datasets: datasets
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true,
                        beginAtZero: true,
                        grid: { display: true, color: 'rgba(0,0,0,0.06)' },
                        border: { display: false },
                        ticks: {
                            stepSize: calcularStepSize(maxValorCatMensais),
                            callback: function(value) {
                                return window.formatarMoedaCompacta(value);
                            }
                        }
                    },
                    y: {
                        stacked: true,
                        grid: { display: false },
                        border: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        usePointStyle: false,
                        boxWidth: 10,
                        boxHeight: 10,
                        boxPadding: 4,
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
// GRÁFICO 6: JUROS × ECONOMIAS
// ================================================================

function criarGraficoJurosEconomias(ano) {
    const ctx = document.getElementById('juros-economias-chart')?.getContext('2d');
    if (!ctx) return;

    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    const dadosMensais = meses.map((_, m) => {
        let jurosMes = 0, economiasMes = 0;
        if (ano === 'todos') {
            const anos = Object.keys(window.dadosFinanceiros || {}).map(Number).filter(Boolean);
            for (const a of anos) {
                const despesas = window.dadosFinanceiros?.[a]?.meses?.[m]?.despesas || [];
                jurosMes += typeof window.calcularTotalJuros === 'function' ? window.calcularTotalJuros(despesas) : 0;
                economiasMes += typeof window.calcularTotalEconomias === 'function' ? window.calcularTotalEconomias(despesas) : 0;
            }
        } else {
            const despesas = window.dadosFinanceiros?.[ano]?.meses?.[m]?.despesas || [];
            jurosMes = typeof window.calcularTotalJuros === 'function' ? window.calcularTotalJuros(despesas) : 0;
            economiasMes = typeof window.calcularTotalEconomias === 'function' ? window.calcularTotalEconomias(despesas) : 0;
        }
        return { juros: jurosMes || 0, economias: economiasMes || 0 };
    });

    const valores = dadosMensais.map(d => d.economias - d.juros);
    const cores = valores.map(v => v >= 0 ? '#10b981' : '#ef4444');

    if (window.jurosEconomiasChart) window.jurosEconomiasChart.destroy();

    // Escala simétrica centrada no zero
    const maxAbs = Math.max(...valores.map(Math.abs), 1);
    const margem = maxAbs * 0.15;

    window.jurosEconomiasChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: meses,
            datasets: [{
                label: 'Economias − Juros',
                data: valores,
                backgroundColor: cores,
                borderRadius: valores.map(v => v >= 0
                    ? { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 }
                    : { topLeft: 0, topRight: 0, bottomLeft: 6, bottomRight: 6 }),
                barPercentage: 0.5,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 16, bottom: 16 } },
            scales: {
                x: {
                    grid: { display: false },
                    border: { display: false }
                },
                y: {
                    min: -(maxAbs + margem),
                    max:   maxAbs + margem,
                    grid: {
                        display: true,
                        color: ctx2 => ctx2.tick?.value === 0 ? '#94a3b8' : '#e5e7eb',
                        lineWidth: ctx2 => ctx2.tick?.value === 0 ? 2 : 1
                    },
                    border: { display: false },
                    ticks: {
                        stepSize: calcularStepSize(maxAbs),
                        callback: function(value) {
                            return window.formatarMoedaCompacta ? window.formatarMoedaCompacta(value) : value;
                        }
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    usePointStyle: false,
                    boxWidth: 10,
                    boxHeight: 10,
                    boxPadding: 4,
                    callbacks: {
                        label: function(context) {
                            const v = context.raw;
                            const formatado = window.formatarMoeda ? window.formatarMoeda(Math.abs(v)) : 'R$ ' + Math.abs(v).toFixed(2);
                            return v >= 0 ? `Saldo positivo: ${formatado}` : `Saldo negativo: ${formatado}`;
                        }
                    }
                }
            }
        }
    });
}
window.criarGraficoJurosEconomias = criarGraficoJurosEconomias;

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

    const maxValorParc = Math.max(...dados.parcelasAPagar.concat(dados.parcelasPagas).map(v => Math.abs(v || 0)));

    window.parcelamentosChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dados.meses,
            datasets: [
                {
                    label: 'Parcelas Pendentes',
                    data: dados.parcelasAPagar,
                    backgroundColor: 'rgba(54, 162, 235, 0.7)',
                    borderColor: 'rgb(54, 162, 235)',
                    borderRadius: { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 },
                    borderSkipped: false
                },
                {
                    label: 'Parcelas Pagas',
                    data: dados.parcelasPagas,
                    backgroundColor: 'rgba(75, 192, 192, 0.9)',
                    borderColor: 'rgb(75, 192, 192)',
                    borderRadius: { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 },
                    borderSkipped: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { display: true, color: 'rgba(0,0,0,0.06)' },
                    border: { display: false },
                    ticks: {
                        stepSize: calcularStepSize(maxValorParc),
                        callback: function(value) {
                            return window.formatarMoedaCompacta(value);
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    border: { display: false }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    usePointStyle: false,
                    boxWidth: 10,
                    boxHeight: 10,
                    boxPadding: 4,
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
    
    const anosParaIterar = ano === 'todos'
        ? Object.keys(dadosFinanceiros).map(Number).filter(Boolean)
        : (dadosFinanceiros[ano] ? [ano] : []);

    if (anosParaIterar.length === 0) {
        return { ...dadosMensais, resumo: resumoGeral };
    }

    anosParaIterar.forEach(anoN => {
        for (let mes = 0; mes < 12; mes++) {
            const dadosMes = dadosFinanceiros[anoN]?.meses?.[mes];
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
    });

    return { ...dadosMensais, resumo: resumoGeral };
}

function atualizarEstatisticasParcelamentos(dados) {
    const porcentagemPagas = dados.totalParcelado > 0 ?
        ((dados.parcelasPagas / dados.totalParcelado) * 100).toFixed(1) : 0;
    const parcelasPendentes = dados.totalParcelado - dados.parcelasPagas;

    const elPendentes = document.getElementById('parcelas-pendentes-valor');
    const elPercentual = document.getElementById('parcelas-pagas-percentual');
    if (elPendentes) elPendentes.textContent = window.formatarMoeda(parcelasPendentes);
    if (elPercentual) elPercentual.textContent = porcentagemPagas + '%';
}

// ================================================================
// GRÁFICO 8: FORMAS DE PAGAMENTO
// ================================================================

function criarGraficoFormaPagamentoComFiltros(dadosFinanceiros, ano, filtros) {
    const ctx = document.getElementById('forma-pagamento-chart')?.getContext('2d');
    if (!ctx) return;
    
    const formasPagamento = { pix: 0, debito: 0, dinheiro: 0, credito: 0 };
    const anosParaIterar = ano === 'todos'
        ? Object.keys(dadosFinanceiros).map(Number).filter(Boolean)
        : (dadosFinanceiros[ano] ? [ano] : []);

    anosParaIterar.forEach(anoN => {
        for (let i = 0; i < 12; i++) {
            const dadosMes = dadosFinanceiros[anoN]?.meses?.[i];
            if (!dadosMes || !dadosMes.despesas) continue;
            const despesasFiltradas = aplicarFiltrosDespesas(dadosMes.despesas, filtros);
            despesasFiltradas.forEach(despesa => {
                const valor = window.obterValorRealDespesa ? window.obterValorRealDespesa(despesa) : (despesa.valor || 0);
                let formaPagamento = despesa.formaPagamento;
                if (!formaPagamento) {
                    formaPagamento = (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito')
                        ? 'credito' : 'debito';
                }
                if (formasPagamento.hasOwnProperty(formaPagamento) && !isNaN(valor)) {
                    formasPagamento[formaPagamento] += valor;
                }
            });
        }
    });
    
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
                        usePointStyle: false,
                        boxWidth: 10,
                        boxHeight: 10,
                        boxPadding: 4,
                        callbacks: {
                            title: () => '',
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


function renderizarGraficoMediaCategorias(ano) {
    const ctx = document.getElementById('media-categorias-chart')?.getContext('2d');
    if (!ctx) return;

    ano = ano || window.anoAtual || new Date().getFullYear();
    const filtroPagamento = document.getElementById('media-cat-pagamento-filter')?.value || 'todas';
    const totaisPorCategoria = {};
    const dadosFinanceiros = window.dadosFinanceiros || {};

    const anosParaIterar = ano === 'todos'
        ? Object.keys(dadosFinanceiros).map(Number).filter(Boolean)
        : (dadosFinanceiros[ano] ? [ano] : []);

    let mesesComDados = 0;

    anosParaIterar.forEach(anoN => {
        for (let i = 0; i < 12; i++) {
            const mes = dadosFinanceiros[anoN]?.meses?.[i];
            if (!mes || !mes.despesas) continue;
            mesesComDados++;
            mes.despesas.forEach(despesa => {
                const valor = window.obterValorRealDespesa ? window.obterValorRealDespesa(despesa) : (despesa.valor || 0);
                const forma = (despesa.formaPagamento || '').toLowerCase();
                const categoria = window.obterCategoriaLimpa ? window.obterCategoriaLimpa(despesa) : (despesa.categoria || 'Sem Categoria');
                if (filtroPagamento !== 'todas' && forma !== filtroPagamento) return;
                if (!isNaN(valor) && valor > 0) {
                    totaisPorCategoria[categoria] = (totaisPorCategoria[categoria] || 0) + valor;
                }
            });
        }
    });

    const divisor = mesesComDados > 0 ? mesesComDados : 12;
    const labels = Object.keys(totaisPorCategoria).sort();
    const valoresMedios = labels.map(cat => totaisPorCategoria[cat] / divisor);
    const cores = obterCoresParaCategorias(labels);
    const maxValorMediaCat = Math.max(...valoresMedios.map(v => Math.abs(v || 0)));

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
                    borderWidth: 1,
                    borderRadius: { topLeft: 0, topRight: 8, bottomLeft: 0, bottomRight: 8 },
                    borderSkipped: false
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        usePointStyle: false,
                        boxWidth: 10,
                        boxHeight: 10,
                        boxPadding: 4,
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
                        grid: { display: true, color: 'rgba(0,0,0,0.06)' },
                        border: { display: false },
                        ticks: {
                            stepSize: calcularStepSize(maxValorMediaCat),
                            callback: function(value) {
                                return window.formatarMoedaCompacta(value);
                            }
                        }
                    },
                    y: {
                        grid: { display: false },
                        border: { display: false },
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

    const anosParaIterar = ano === 'todos'
        ? Object.keys(dadosFinanceiros || {}).map(Number).filter(Boolean)
        : (dadosFinanceiros?.[ano] ? [ano] : []);

    anosParaIterar.forEach(anoN => {
        for (let mes = 0; mes < 12; mes++) {
            const dadosMes = dadosFinanceiros[anoN]?.meses?.[mes];
            if (!dadosMes || !dadosMes.despesas) continue;
            const despesasFiltradas = aplicarFiltrosDespesas(dadosMes.despesas, filtros);
            despesasFiltradas.forEach(despesa => {
                const formaPag = (despesa.formaPagamento || '').toLowerCase();
                if (formaPag !== 'credito' && formaPag !== 'crédito' && !formaPag.includes('cred')) return;
                const cartaoId = despesa.cartao_id || despesa.cartaoId;
                if (cartaoId && usoPorCartao[cartaoId]) {
                    const valor = window.obterValorRealDespesa ? window.obterValorRealDespesa(despesa) : (despesa.valor || 0);
                    usoPorCartao[cartaoId].valor += valor;
                    usoPorCartao[cartaoId].quantidade++;
                }
            });
        }
    });

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
                        usePointStyle: false,
                        boxWidth: 10,
                        boxHeight: 10,
                        boxPadding: 4,
                        callbacks: {
                            title: () => '',
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
    const categorias = window.anoDashboard === 'todos'
        ? obterCategoriasTodasAnos()
        : obterCategorias(window.anoAtual);
    _preencherSelectsComCategorias(categorias);
}

function obterCategoriasTodasAnos() {
    const categorias = new Set();
    const dados = window.dadosFinanceiros || {};
    Object.keys(dados).map(Number).forEach(anoN => {
        const anoData = dados[anoN];
        if (!anoData?.meses) return;
        for (let mes = 0; mes < 12; mes++) {
            const dadosMes = anoData.meses[mes];
            if (!dadosMes?.despesas) continue;
            dadosMes.despesas.forEach(d => {
                const cat = window.obterCategoriaLimpa ? window.obterCategoriaLimpa(d) : (d.categoria || 'Sem categoria');
                categorias.add(cat);
            });
        }
    });
    return Array.from(categorias).sort();
}

function _preencherSelectsComCategorias(categorias) {
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
    const ano = window.anoDashboard === 'todos' ? 'todos' : _anoGraficosAtual();
    criarGraficoTendenciaAnualComFiltros(window.dadosFinanceiros, ano, obterFiltrosDoGrafico('tendencia'));
};

window.filtrarCategoriasAnual = function() {
    const ano = window.anoDashboard === 'todos' ? 'todos' : _anoGraficosAtual();
    criarGraficoBarrasCategoriasComFiltros(window.dadosFinanceiros, ano, obterFiltrosDoGrafico('categorias-anual'));
};

window.filtrarCategoriasMensal = function() {
    const ano = window.anoDashboard === 'todos' ? 'todos' : _anoGraficosAtual();
    criarGraficoCategoriasMensaisComFiltros(window.dadosFinanceiros, ano, obterFiltrosDoGrafico('categorias-mensal'));
};

window.filtrarJuros = function() {
    criarGraficoJurosEconomias(_anoGraficosAtual());
};

window.filtrarParcelamentos = function() {
    const ano = window.anoDashboard === 'todos' ? 'todos' : _anoGraficosAtual();
    criarGraficoParcelamentosComFiltros(window.dadosFinanceiros, ano, obterFiltrosDoGrafico('parcelamentos'));
};

window.filtrarFormaPagamento = function() {
    const ano = window.anoDashboard === 'todos' ? 'todos' : _anoGraficosAtual();
    criarGraficoFormaPagamentoComFiltros(window.dadosFinanceiros, ano, obterFiltrosDoGrafico('forma-pagamento'));
};

// ================================================================
// EXPORTAR FUNÇÕES GLOBAIS
// ================================================================

window.carregarDadosDashboard = carregarDadosDashboard;
window.filtrarBalanco = filtrarBalanco;
window.filtrarBalancoPeriodo = filtrarBalanco;

// ================================================================
// DASHBOARD TEMÁTICO — Sistema de Views por Tema
// ================================================================

function inicializarDashboardTematico() {
    // Defaults globais Chart.js — dark mode elegante
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
    if (Chart.defaults.font) Chart.defaults.font.family = "'Inter', sans-serif";

    // Navegação entre temas
    document.querySelectorAll('.tema-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const tema = this.dataset.tema;
            // Desativa todos
            document.querySelectorAll('.tema-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tema-view').forEach(v => v.classList.remove('active'));
            // Ativa o selecionado
            this.classList.add('active');
            const view = document.getElementById('tema-' + tema);
            if (view) view.classList.add('active');
            // Renderiza gráficos do tema
            renderizarTemaPorNome(tema);
        });
    });

    // Filtro de período
    const btnAno = document.querySelector('.periodo-btn[data-periodo="ano"]');
    const btnTodos = document.querySelector('.periodo-btn[data-periodo="todos"]');
    if (btnAno) btnAno.addEventListener('click', function() {
        document.querySelectorAll('.periodo-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        atualizarDashboardTematico();
    });
    if (btnTodos) btnTodos.addEventListener('click', function() {
        document.querySelectorAll('.periodo-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        atualizarDashboardTematico();
    });

    const filtroAno = document.getElementById('dash-filtro-ano');
    const filtroMes = document.getElementById('dash-filtro-mes');
    if (filtroAno) filtroAno.addEventListener('change', atualizarDashboardTematico);
    if (filtroMes) filtroMes.addEventListener('change', atualizarDashboardTematico);

    // Popula anos no filtro
    popularFiltroAnos();

    // Renderiza tema inicial (saude)
    atualizarDashboardTematico();
    atualizarKpisFixos();
}

function popularFiltroAnos() {
    const filtroAno = document.getElementById('dash-filtro-ano');
    if (!filtroAno || !window.dadosFinanceiros) return;
    const df = window.dadosFinanceiros;
    const anos = Object.keys(df).map(Number).filter(Boolean).sort((a, b) => b - a);
    const anoAtual = new Date().getFullYear();
    filtroAno.innerHTML = anos.map(a =>
        `<option value="${a}" ${a === anoAtual ? 'selected' : ''}>${a}</option>`
    ).join('');
}

function obterFiltroAtivo() {
    const filtroAno = document.getElementById('dash-filtro-ano');
    const filtroMes = document.getElementById('dash-filtro-mes');
    const periodoTodos = document.querySelector('.periodo-btn[data-periodo="todos"]')?.classList.contains('active');
    return {
        ano: filtroAno ? parseInt(filtroAno.value) : new Date().getFullYear(),
        mes: filtroMes && filtroMes.value !== '' ? parseInt(filtroMes.value) : null,
        todos: !!periodoTodos
    };
}

function obterDadosFiltrados() {
    const filtro = obterFiltroAtivo();
    const df = window.dadosFinanceiros || {};
    let despesas = [];
    let receitas = [];

    const anos = Object.keys(df).map(Number).filter(Boolean);
    const anosFiltrados = filtro.todos ? anos : anos.filter(a => a === filtro.ano);

    anosFiltrados.forEach(function(ano) {
        const meses = df[ano]?.meses || [];
        for (let m = 0; m < 12; m++) {
            if (filtro.mes !== null && filtro.mes !== m) continue;
            const dadosMes = meses[m] || {};
            // Receitas (excluir saldo anterior)
            (dadosMes.receitas || []).forEach(function(r) {
                if (!r.saldoAnterior && !r.automatica && !r.descricao?.includes('Saldo Anterior')) {
                    receitas.push({ ...r, ano, mes: m });
                }
            });
            // Despesas
            (dadosMes.despesas || []).forEach(function(d) {
                despesas.push({ ...d, ano, mes: m });
            });
        }
    });

    return { despesas, receitas, filtro };
}

function atualizarKpisFixos() {
    const { despesas, receitas, filtro } = obterDadosFiltrados();

    const totalReceitas = receitas.reduce(function(s, r) { return s + parseFloat(r.valor || 0); }, 0);
    const totalDespesas = despesas.reduce(function(s, d) { return s + parseFloat(d.valor || 0); }, 0);
    const saldoAnual    = totalReceitas - totalDespesas;
    const totalJuros    = despesas.reduce(function(s, d) { return s + parseFloat(d.juros || 0); }, 0);
    const totalEconomias = despesas.reduce(function(s, d) { return s + parseFloat(d.economias || d.desconto || 0); }, 0);

    // Saldo atual: calculado via main.js se disponível, senão usa saldoAnual
    let saldoAtual = saldoAnual;
    if (typeof window.calcularSaldoAtual === 'function') {
        saldoAtual = window.calcularSaldoAtual();
    }

    const fmt = function(v) {
        return typeof window.formatarMoeda === 'function'
            ? window.formatarMoeda(v)
            : 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    };

    const elReceitas  = document.getElementById('dashboard-total-receitas');
    const elDespesas  = document.getElementById('dashboard-total-despesas');
    const elSaldoAno  = document.getElementById('dashboard-saldo-anual');
    const elSaldoAtual = document.getElementById('dashboard-saldo-atual');
    const elJuros     = document.getElementById('dashboard-total-juros');
    const elEconomias = document.getElementById('dashboard-total-economias');

    if (elReceitas)  elReceitas.textContent  = fmt(totalReceitas);
    if (elDespesas)  elDespesas.textContent  = fmt(totalDespesas);
    if (elSaldoAno)  {
        elSaldoAno.textContent = fmt(saldoAnual);
        elSaldoAno.classList.toggle('saldo-negativo', saldoAnual < 0);
    }
    if (elSaldoAtual) {
        elSaldoAtual.textContent = fmt(saldoAtual);
        elSaldoAtual.classList.toggle('saldo-negativo', saldoAtual < 0);
    }
    if (elJuros)     elJuros.textContent     = fmt(totalJuros);
    if (elEconomias) elEconomias.textContent = fmt(totalEconomias);

    // Atualizar rodapé dos cards com rótulo do período
    const label = filtro.todos
        ? 'Todos os anos'
        : (filtro.mes !== null
            ? ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][filtro.mes] + ' ' + filtro.ano
            : 'Ano ' + filtro.ano);
    const rodapes = {
        'dashboard-total-receitas':  'Receitas — ' + label,
        'dashboard-total-despesas':  'Despesas — ' + label,
        'dashboard-saldo-anual':     'Saldo — ' + label,
        'dashboard-total-juros':     'Juros — ' + label,
        'dashboard-total-economias': 'Economias — ' + label,
    };
    document.querySelectorAll('.resumo-cards .card').forEach(function(card) {
        const valueEl  = card.querySelector('.card-value');
        const footerEl = card.querySelector('.card-footer');
        if (!valueEl || !footerEl) return;
        const rodape = rodapes[valueEl.id];
        if (rodape) footerEl.textContent = rodape;
    });
}

function atualizarDashboardTematico() {
    const temaAtivo = document.querySelector('.tema-btn.active')?.dataset.tema || 'saude';
    atualizarKpisFixos();
    renderizarTemaPorNome(temaAtivo);
}

function renderizarTemaPorNome(tema) {
    const mapa = {
        'saude':      renderizarTemaSaude,
        'fluxo':      renderizarTemaFluxo,
        'categorias': renderizarTemaCategorias,
        'pagamento':  renderizarTemaPagamento,
        'divida':     renderizarTemaDivida,
        'anual':      renderizarTemaAnual,
        'analise':    renderizarTemaAnalise,
    };
    if (mapa[tema]) mapa[tema]();
}

// ── HELPERS ──────────────────────────────────────────────────────

const MESES_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function agruparPorMes(itens, campo) {
    const totais = new Array(12).fill(0);
    itens.forEach(function(item) {
        const m = item.mes;
        if (m >= 0 && m <= 11) {
            const val = parseFloat(item[campo] || item.valor || 0);
            if (!isNaN(val)) totais[m] += val;
        }
    });
    return totais;
}

function destruirCanvas(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    if (el._chartInstance) { el._chartInstance.destroy(); el._chartInstance = null; }
    return el;
}

function criarChart(id, config) {
    const el = destruirCanvas(id);
    if (!el) return null;
    const chart = new Chart(el, config);
    el._chartInstance = chart;
    return chart;
}

const CORES = ['#6366f1','#10b981','#f59e0b','#f43f5e','#a855f7','#06b6d4','#f97316','#ec4899','#14b8a6','#84cc16'];

function fmtR(v) { return 'R$ ' + parseFloat(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2}); }

function criarGradiente(canvasId, corHex, alpha1, alpha2) {
    const el = document.getElementById(canvasId);
    if (!el) return corHex;
    const ctx = el.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 300);
    grad.addColorStop(0, corHex + Math.round(alpha1 * 255).toString(16).padStart(2,'0'));
    grad.addColorStop(1, corHex + Math.round(alpha2 * 255).toString(16).padStart(2,'0'));
    return grad;
}

function opcoesEscuras(extra) {
    return Object.assign({
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
        scales: {
            x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
        }
    }, extra || {});
}

function opcoesEscurasSemEixos(extraPlugins) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: Object.assign({ legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12, padding: 12 } } }, extraPlugins || {})
    };
}

// ── TEMA: SAÚDE FINANCEIRA ────────────────────────────────────────
function renderizarTemaSaude() {
    const { despesas, receitas } = obterDadosFiltrados();
    const recPorMes = agruparPorMes(receitas, 'valor');
    const despPorMes = agruparPorMes(despesas, 'valor');
    const saldoPorMes = recPorMes.map((r, i) => r - despPorMes[i]);
    const saldoAcum = [];
    saldoPorMes.reduce((acc, v, i) => { saldoAcum[i] = acc + v; return saldoAcum[i]; }, 0);

    // KPIs
    const totalRec = receitas.reduce((s,r)=>s+parseFloat(r.valor||0),0);
    const totalDesp = despesas.reduce((s,d)=>s+parseFloat(d.valor||0),0);
    const saldo = totalRec - totalDesp;
    const score = totalDesp > 0 ? Math.min(100, Math.round((totalRec/totalDesp)*50)) : 100;
    const el1 = document.getElementById('tk-saude-saldo');
    const el2 = document.getElementById('tk-saude-variacao');
    const el3 = document.getElementById('tk-saude-score');
    if (el1) { el1.textContent = fmtR(saldo); el1.style.color = saldo>=0?'#10b981':'#f43f5e'; }
    if (el2) { el2.textContent = totalRec > 0 ? ((saldo/totalRec*100).toFixed(1)+'%') : '0%'; el2.style.color = saldo>=0?'#10b981':'#f43f5e'; }
    if (el3) { el3.textContent = score + '/100'; el3.style.color = score>=70?'#10b981':score>=40?'#f59e0b':'#f43f5e'; }

    // Gráfico 1: Balanço Mensal — barras agrupadas
    criarChart('tema-saude-balanco', {
        type: 'bar',
        data: {
            labels: MESES_LABELS,
            datasets: [
                { label: 'Receitas', data: recPorMes, backgroundColor: '#10b98166', borderColor: '#10b981', borderWidth: 1.5, borderRadius: 4 },
                { label: 'Despesas', data: despPorMes, backgroundColor: '#f43f5e66', borderColor: '#f43f5e', borderWidth: 1.5, borderRadius: 4 }
            ]
        },
        options: opcoesEscuras({ plugins: { legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } } }, scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { beginAtZero: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } } })
    });

    // Gráfico 2: Saldo Progressivo — área suave sem pontos
    criarChart('tema-saude-progressivo', {
        type: 'line',
        data: {
            labels: MESES_LABELS,
            datasets: [{
                label: 'Saldo Acumulado',
                data: saldoAcum,
                borderColor: '#6366f1',
                backgroundColor: criarGradiente('tema-saude-progressivo', '#6366f1', 0.35, 0.02),
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4,
                borderWidth: 2
            }]
        },
        options: opcoesEscuras({ plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { beginAtZero: false, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } } })
    });

    // Gráfico 3: Entradas vs Saídas — barras horizontais (6 meses mais recentes com dados)
    const mesesComDados = MESES_LABELS.map((l, i) => ({ l, rec: recPorMes[i], desp: despPorMes[i], idx: i }))
        .filter(m => m.rec > 0 || m.desp > 0).slice(-6);
    criarChart('tema-saude-entradas', {
        type: 'bar',
        data: {
            labels: mesesComDados.map(m => m.l),
            datasets: [
                { label: 'Receitas', data: mesesComDados.map(m => m.rec), backgroundColor: '#10b981', borderRadius: 4, barThickness: 14 },
                { label: 'Despesas', data: mesesComDados.map(m => m.desp), backgroundColor: '#f43f5e', borderRadius: 4, barThickness: 14 }
            ]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } } }, scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } } } }
    });
}

// ── TEMA: FLUXO DE CAIXA ─────────────────────────────────────────
function renderizarTemaFluxo() {
    const { despesas, receitas } = obterDadosFiltrados();
    const recPorMes = agruparPorMes(receitas, 'valor');
    const despPorMes = agruparPorMes(despesas, 'valor');

    const totalRec = receitas.reduce((s,r)=>s+parseFloat(r.valor||0),0);
    const totalDesp = despesas.reduce((s,d)=>s+parseFloat(d.valor||0),0);
    const resultado = totalRec - totalDesp;

    const el1 = document.getElementById('tk-fluxo-receitas');
    const el2 = document.getElementById('tk-fluxo-despesas');
    const el3 = document.getElementById('tk-fluxo-resultado');
    if (el1) { el1.textContent = fmtR(totalRec); el1.style.color = '#10b981'; }
    if (el2) { el2.textContent = fmtR(totalDesp); el2.style.color = '#f43f5e'; }
    if (el3) { el3.textContent = fmtR(resultado); el3.style.color = resultado>=0?'#10b981':'#f43f5e'; }

    // Gráfico 1: Área empilhada — receitas e despesas por mês
    criarChart('tema-fluxo-entradas', {
        type: 'line',
        data: {
            labels: MESES_LABELS,
            datasets: [
                { label: 'Receitas', data: recPorMes, borderColor: '#10b981', backgroundColor: criarGradiente('tema-fluxo-entradas','#10b981',0.4,0.02), fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 },
                { label: 'Despesas', data: despPorMes, borderColor: '#f43f5e', backgroundColor: criarGradiente('tema-fluxo-entradas','#f43f5e',0.3,0.02), fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }
            ]
        },
        options: opcoesEscuras({ plugins: { legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } } }, scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { beginAtZero: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } } })
    });

    // Gráfico 2: Line suave dupla — acumulado
    const recAcum = [], despAcum = [];
    recPorMes.reduce((a,v,i)=>{recAcum[i]=a+v;return recAcum[i];},0);
    despPorMes.reduce((a,v,i)=>{despAcum[i]=a+v;return despAcum[i];},0);
    criarChart('tema-fluxo-acumulado', {
        type: 'line',
        data: {
            labels: MESES_LABELS,
            datasets: [
                { label: 'Receitas Acum.', data: recAcum, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.06)', fill: false, tension: 0.4, pointRadius: 0, borderWidth: 2 },
                { label: 'Despesas Acum.', data: despAcum, borderColor: '#f43f5e', backgroundColor: 'rgba(244,63,94,0.06)', fill: false, tension: 0.4, pointRadius: 0, borderWidth: 2 }
            ]
        },
        options: opcoesEscuras({ plugins: { legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } } }, scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } } })
    });

    // Gráfico 3: Donut — receita vs despesa total
    criarChart('tema-fluxo-cobertura', {
        type: 'doughnut',
        data: {
            labels: ['Receitas', 'Despesas'],
            datasets: [{ data: [totalRec, totalDesp], backgroundColor: ['#10b981', '#f43f5e'], borderWidth: 0, hoverOffset: 6 }]
        },
        options: opcoesEscurasSemEixos()
    });
}

// ── TEMA: CATEGORIAS ─────────────────────────────────────────────
function renderizarTemaCategorias() {
    const { despesas } = obterDadosFiltrados();
    const df = window.dadosFinanceiros || {};
    const categorias = df.categorias || [];

    // Agrupa por categoria
    const porCat = {};
    despesas.forEach(function(d) {
        const catId = d.categoria_id;
        const catObj = categorias.find(c => c.id === catId);
        const nome = catObj ? catObj.nome : (d.categoria || 'Outros');
        porCat[nome] = (porCat[nome] || 0) + parseFloat(d.valor || 0);
    });
    const catOrdenadas = Object.entries(porCat).sort((a,b)=>b[1]-a[1]);
    const top5 = catOrdenadas.slice(0,5);
    const total = catOrdenadas.reduce((s,[,v])=>s+v,0);

    const el1 = document.getElementById('tk-cat-maior');
    const el2 = document.getElementById('tk-cat-pct');
    const el3 = document.getElementById('tk-cat-count');
    if (el1) { el1.textContent = top5[0] ? top5[0][0] : '--'; el1.style.color = '#f59e0b'; }
    if (el2) { el2.textContent = top5[0] && total > 0 ? ((top5[0][1]/total*100).toFixed(1)+'%') : '0%'; el2.style.color = '#f59e0b'; }
    if (el3) el3.textContent = catOrdenadas.length;

    // Gráfico 1: DONUT grande — categorias
    if (catOrdenadas.length > 0) {
        const top8 = catOrdenadas.slice(0,8);
        criarChart('tema-cat-anual', {
            type: 'doughnut',
            data: {
                labels: top8.map(([n])=>n),
                datasets: [{ data: top8.map(([,v])=>v), backgroundColor: CORES, borderWidth: 0, hoverOffset: 8 }]
            },
            options: opcoesEscurasSemEixos()
        });
    }

    // Gráfico 2: Line empilhado — top 5 categorias por mês
    const top5nomes = top5.map(([n])=>n);
    const datasets = top5nomes.map((nome, i) => {
        const porMes = new Array(12).fill(0);
        despesas.forEach(function(d) {
            const catObj = categorias.find(c => c.id === d.categoria_id);
            const catNome = catObj ? catObj.nome : (d.categoria || 'Outros');
            if (catNome === nome && d.mes >= 0 && d.mes <= 11) {
                porMes[d.mes] += parseFloat(d.valor || 0);
            }
        });
        return { label: nome, data: porMes, borderColor: CORES[i], backgroundColor: CORES[i]+'22', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0 };
    });
    criarChart('tema-cat-evolucao', {
        type: 'line',
        data: { labels: MESES_LABELS, datasets },
        options: opcoesEscuras({ plugins: { legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } } }, scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { beginAtZero: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } } })
    });

    // Gráfico 3: Barras horizontais — média por categoria
    const mediaCat = catOrdenadas.slice(0,8).map(([nome, tot]) => ({ nome, media: tot/12 }));
    criarChart('tema-cat-media', {
        type: 'bar',
        data: {
            labels: mediaCat.map(c=>c.nome),
            datasets: [{ label: 'Média/Mês', data: mediaCat.map(c=>c.media), backgroundColor: CORES, borderRadius: 4, barThickness: 14 }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } } } }
    });
}

// ── TEMA: PAGAMENTO ──────────────────────────────────────────────
function renderizarTemaPagamento() {
    const { despesas } = obterDadosFiltrados();
    const df = window.dadosFinanceiros || {};
    const cartoes = df.cartoes || [];

    // Agrupa por forma de pagamento
    const porForma = {};
    despesas.forEach(function(d) {
        const f = (d.forma_pagamento || 'outros').toLowerCase();
        porForma[f] = (porForma[f] || 0) + parseFloat(d.valor || 0);
    });

    const totalCredito = (porForma['credito'] || 0) + (porForma['cartao_credito'] || 0);
    const totalDebito = (porForma['debito'] || 0) + (porForma['cartao_debito'] || 0) + (porForma['pix'] || 0) + (porForma['dinheiro'] || 0);
    const totalGeral = totalCredito + totalDebito;

    const el1 = document.getElementById('tk-pgto-credito');
    const el2 = document.getElementById('tk-pgto-debito');
    const el3 = document.getElementById('tk-pgto-pct');
    if (el1) { el1.textContent = fmtR(totalCredito); el1.style.color = '#6366f1'; }
    if (el2) { el2.textContent = fmtR(totalDebito); el2.style.color = '#06b6d4'; }
    if (el3) el3.textContent = totalGeral > 0 ? ((totalCredito/totalGeral*100).toFixed(1)+'%') : '0%';

    // Gráfico 1: Donut — formas de pagamento
    const formasLabels = Object.keys(porForma);
    const formasData = Object.values(porForma);
    if (formasLabels.length > 0) {
        criarChart('tema-pgto-formas', {
            type: 'doughnut',
            data: { labels: formasLabels, datasets: [{ data: formasData, backgroundColor: CORES, borderWidth: 0, hoverOffset: 6 }] },
            options: opcoesEscurasSemEixos()
        });
    }

    // Gráfico 2: Donut — cartões
    const porCartao = {};
    despesas.filter(d => ['credito','cartao_credito'].includes((d.forma_pagamento||'').toLowerCase())).forEach(function(d) {
        const cartaoObj = cartoes.find(c => c.id === d.cartao_id);
        const nome = cartaoObj ? cartaoObj.nome : 'Outros';
        porCartao[nome] = (porCartao[nome] || 0) + parseFloat(d.valor || 0);
    });
    if (Object.keys(porCartao).length > 0) {
        criarChart('tema-pgto-cartoes', {
            type: 'doughnut',
            data: { labels: Object.keys(porCartao), datasets: [{ data: Object.values(porCartao), backgroundColor: CORES, borderWidth: 0, hoverOffset: 6 }] },
            options: opcoesEscurasSemEixos()
        });
    }

    // Gráfico 3: Barras empilhadas — forma por mês
    const formasUnicas = [...new Set(despesas.map(d => d.forma_pagamento || 'outros'))].slice(0,5);
    const datasetsForma = formasUnicas.map((forma, i) => {
        const porMes = new Array(12).fill(0);
        despesas.filter(d=>(d.forma_pagamento||'outros')===forma).forEach(d => {
            if (d.mes>=0&&d.mes<=11) porMes[d.mes]+=parseFloat(d.valor||0);
        });
        return { label: forma, data: porMes, backgroundColor: CORES[i], stack: 'stack', borderRadius: 2 };
    });
    criarChart('tema-pgto-mensal', {
        type: 'bar',
        data: { labels: MESES_LABELS, datasets: datasetsForma },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } } }, scales: { x: { stacked: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { stacked: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } } }
    });
}

// ── TEMA: ENDIVIDAMENTO ──────────────────────────────────────────
function renderizarTemaDivida() {
    const { despesas } = obterDadosFiltrados();
    const parceladas = despesas.filter(d => d.parcelas > 1 || d.parcelado || d.idGrupoParcelamento);
    const juros = despesas.reduce((s,d)=>s+parseFloat(d.juros||0),0);
    const economias = despesas.reduce((s,d)=>s+parseFloat(d.economias||d.desconto||0),0);
    const totalParc = parceladas.reduce((s,d)=>s+parseFloat(d.valor||0),0);

    const el1 = document.getElementById('tk-divida-juros');
    const el2 = document.getElementById('tk-divida-parcelas');
    const el3 = document.getElementById('tk-divida-economias');
    if (el1) { el1.textContent = fmtR(juros); el1.style.color = '#f43f5e'; }
    if (el2) { el2.textContent = fmtR(totalParc); el2.style.color = '#f59e0b'; }
    if (el3) { el3.textContent = fmtR(economias); el3.style.color = '#10b981'; }

    // Gráfico 1: Barras lado a lado — juros × economias por mês
    const jurosPorMes = agruparPorMes(despesas.map(d=>({...d,valor:parseFloat(d.juros||0)})),'valor');
    const ecoMensal = agruparPorMes(despesas.map(d=>({...d,valor:parseFloat(d.economias||d.desconto||0)})),'valor');
    criarChart('tema-divida-juros', {
        type: 'bar',
        data: {
            labels: MESES_LABELS,
            datasets: [
                { label: 'Juros', data: jurosPorMes, backgroundColor: '#f43f5e', borderRadius: 4 },
                { label: 'Economias', data: ecoMensal, backgroundColor: '#10b981', borderRadius: 4 }
            ]
        },
        options: opcoesEscuras({ plugins: { legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } } }, scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { beginAtZero: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } } })
    });

    // Gráfico 2: Área — parcelamentos por mês
    const parcPorMes = agruparPorMes(parceladas, 'valor');
    criarChart('tema-divida-parcelas', {
        type: 'line',
        data: { labels: MESES_LABELS, datasets: [{ label: 'Parcelamentos', data: parcPorMes, borderColor: '#f59e0b', backgroundColor: criarGradiente('tema-divida-parcelas','#f59e0b',0.35,0.02), fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }] },
        options: opcoesEscuras({ plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { beginAtZero: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } } })
    });

    // Gráfico 3: Line — custo acumulado de juros
    const jurosCum = [];
    jurosPorMes.reduce((a,v,i)=>{jurosCum[i]=a+v;return jurosCum[i];},0);
    criarChart('tema-divida-custo', {
        type: 'line',
        data: { labels: MESES_LABELS, datasets: [{ label: 'Juros Acumulados', data: jurosCum, borderColor: '#f43f5e', backgroundColor: criarGradiente('tema-divida-custo','#f43f5e',0.3,0.02), fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }] },
        options: opcoesEscuras({ plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { beginAtZero: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } } })
    });
}

// ── TEMA: DESEMPENHO ANUAL ───────────────────────────────────────
function renderizarTemaAnual() {
    const { despesas, receitas, filtro } = obterDadosFiltrados();
    const recPorMes = agruparPorMes(receitas, 'valor');
    const despPorMes = agruparPorMes(despesas, 'valor');
    const saldoPorMes = recPorMes.map((r,i)=>r-despPorMes[i]);

    const melhorIdx = saldoPorMes.indexOf(Math.max(...saldoPorMes));
    const piorIdx = saldoPorMes.indexOf(Math.min(...saldoPorMes));
    const total = saldoPorMes.reduce((s,v)=>s+v,0);

    const el1 = document.getElementById('tk-anual-melhor');
    const el2 = document.getElementById('tk-anual-pior');
    const el3 = document.getElementById('tk-anual-trend');
    if (el1) { el1.textContent = MESES_LABELS[melhorIdx] || '--'; el1.style.color = '#10b981'; }
    if (el2) { el2.textContent = MESES_LABELS[piorIdx] || '--'; el2.style.color = '#f43f5e'; }
    if (el3) { el3.textContent = total>=0?'↑ Positivo':'↓ Negativo'; el3.style.color = total>=0?'#10b981':'#f43f5e'; }

    // Gráfico 1: Área suave — tendência de saldo
    criarChart('tema-anual-tendencia', {
        type: 'line',
        data: {
            labels: MESES_LABELS,
            datasets: [{ label: 'Saldo', data: saldoPorMes, borderColor: '#6366f1', backgroundColor: criarGradiente('tema-anual-tendencia','#6366f1',0.35,0.02), fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 }]
        },
        options: opcoesEscuras({ plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } } })
    });

    // Gráfico 2: Barras agrupadas — comparação anos (usa obterDadosFiltrados com ano anterior)
    const anoAnt = filtro.ano - 1;
    const df = window.dadosFinanceiros || {};
    // Busca dados do ano anterior diretamente da estrutura correta
    let recAntMes = new Array(12).fill(0);
    let despAntMes = new Array(12).fill(0);
    if (df[anoAnt] && df[anoAnt].meses) {
        for (let m = 0; m < 12; m++) {
            const dadosMes = df[anoAnt].meses[m] || {};
            (dadosMes.receitas || []).forEach(function(r) {
                if (!r.saldoAnterior && !r.automatica && !r.descricao?.includes('Saldo Anterior')) {
                    recAntMes[m] += parseFloat(r.valor || 0);
                }
            });
            (dadosMes.despesas || []).forEach(function(d) {
                despAntMes[m] += parseFloat(d.valor || 0);
            });
        }
    }
    const saldoAnt = recAntMes.map((r,i)=>r-despAntMes[i]);
    criarChart('tema-anual-comparacao', {
        type: 'bar',
        data: {
            labels: MESES_LABELS,
            datasets: [
                { label: filtro.ano.toString(), data: saldoPorMes, backgroundColor: '#6366f1', borderRadius: 4 },
                { label: anoAnt.toString(), data: saldoAnt, backgroundColor: '#475569', borderRadius: 4 }
            ]
        },
        options: opcoesEscuras({ plugins: { legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } } }, scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } } })
    });

    // Gráfico 3: Barras horizontais ordenadas — ranking de meses
    const ranking = saldoPorMes.map((v,i)=>({mes:MESES_LABELS[i],val:v})).sort((a,b)=>b.val-a.val);
    criarChart('tema-anual-ranking', {
        type: 'bar',
        data: {
            labels: ranking.map(r=>r.mes),
            datasets: [{ label: 'Saldo', data: ranking.map(r=>r.val), backgroundColor: ranking.map(r=>r.val>=0?'#10b981':'#f43f5e'), borderRadius: 4, barThickness: 14 }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } } } }
    });
}

// ── TEMA: ANÁLISE DETALHADA ──────────────────────────────────────
function renderizarTemaAnalise() {
    const { despesas, receitas } = obterDadosFiltrados();
    const df = window.dadosFinanceiros || {};
    const categorias = df.categorias || [];

    const despPorMes = agruparPorMes(despesas,'valor');
    const mesesComValor = despPorMes.filter(v=>v>0);
    const mediaMensal = mesesComValor.length > 0 ? mesesComValor.reduce((s,v)=>s+v,0)/mesesComValor.length : 0;
    const max = despPorMes.length > 0 ? Math.max(...despPorMes) : 0;
    const minPositivo = mesesComValor.length > 0 ? Math.min(...mesesComValor) : 0;

    const el1 = document.getElementById('tk-analise-media');
    const el2 = document.getElementById('tk-analise-tipico');
    const el3 = document.getElementById('tk-analise-variacao');
    if (el1) el1.textContent = fmtR(mediaMensal);
    if (el2) el2.textContent = MESES_LABELS[despPorMes.indexOf(despPorMes.slice().sort((a,b)=>Math.abs(a-mediaMensal)-Math.abs(b-mediaMensal))[0])] || '--';
    if (el3) el3.textContent = fmtR(max - minPositivo);

    // Gráfico 1: Barras horizontais — média por categoria
    const porCat = {};
    despesas.forEach(function(d) {
        const catObj = categorias.find(c=>c.id===d.categoria_id);
        const nome = catObj?catObj.nome:(d.categoria||'Outros');
        porCat[nome] = (porCat[nome]||0)+parseFloat(d.valor||0);
    });
    const catArr = Object.entries(porCat).sort((a,b)=>b[1]-a[1]).slice(0,8);
    criarChart('tema-analise-media', {
        type: 'bar',
        data: {
            labels: catArr.map(([n])=>n),
            datasets: [{ label: 'Média/Mês', data: catArr.map(([,v])=>v/12), backgroundColor: CORES, borderRadius: 4, barThickness: 14 }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } } } }
    });

    // Gráfico 2: Barras empilhadas — categorias mensais
    const top5nomes = catArr.slice(0,5).map(([n])=>n);
    const datasets = top5nomes.map((nome,i)=>{
        const porMes = new Array(12).fill(0);
        despesas.forEach(function(d){
            const catObj = categorias.find(c=>c.id===d.categoria_id);
            const catNome = catObj?catObj.nome:(d.categoria||'Outros');
            if(catNome===nome&&d.mes>=0&&d.mes<=11) porMes[d.mes]+=parseFloat(d.valor||0);
        });
        return { label: nome, data: porMes, backgroundColor: CORES[i], stack: 'stack', borderRadius: 2 };
    });
    criarChart('tema-analise-mensal', {
        type: 'bar',
        data: { labels: MESES_LABELS, datasets },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } } }, scales: { x: { stacked: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { stacked: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } } }
    });

    // Gráfico 3: Barras agrupadas — balanço por ano (lê estrutura correta)
    const todosAnos = Object.keys(df).map(Number).filter(Boolean).sort();
    const recAnos = todosAnos.map(function(ano) {
        let s = 0;
        const meses = df[ano]?.meses || [];
        for (let m = 0; m < 12; m++) {
            (meses[m]?.receitas || []).forEach(function(r) {
                if (!r.saldoAnterior && !r.automatica && !r.descricao?.includes('Saldo Anterior')) s += parseFloat(r.valor||0);
            });
        }
        return s;
    });
    const despAnos = todosAnos.map(function(ano) {
        let s = 0;
        const meses = df[ano]?.meses || [];
        for (let m = 0; m < 12; m++) {
            (meses[m]?.despesas || []).forEach(function(d) { s += parseFloat(d.valor||0); });
        }
        return s;
    });
    criarChart('tema-analise-anos', {
        type: 'bar',
        data: {
            labels: todosAnos,
            datasets: [
                { label: 'Receitas', data: recAnos, backgroundColor: '#10b981', borderRadius: 4 },
                { label: 'Despesas', data: despAnos, backgroundColor: '#f43f5e', borderRadius: 4 }
            ]
        },
        options: opcoesEscuras({ plugins: { legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } } }, scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { beginAtZero: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } } })
    });
}

// Inicializa o dashboard temático junto ao evento sistemaFinanceiroReady
window.addEventListener('sistemaFinanceiroReady', function() {
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection) {
        inicializarDashboardTematico();
    }
});

window.inicializarDashboardTematico = inicializarDashboardTematico;
window.atualizarDashboardTematico = atualizarDashboardTematico;