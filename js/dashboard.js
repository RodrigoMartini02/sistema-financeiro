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
        limparGraficos();
        resetarFiltros();
        setTimeout(() => carregarDadosDashboard(window.anoAtual), 100);
    });

    document.getElementById('btn-proximo-ano')?.addEventListener('click', function() {
        window.anoDashboard = null;
        limparGraficos();
        resetarFiltros();
        setTimeout(() => carregarDadosDashboard(window.anoAtual), 100);
    });
}


// ================================================================
// FILTRO DE PERÍODO GLOBAL
// ================================================================

window.anoDashboard = null; // null = usa window.anoAtual

let _filtrosGlobaisInicializados = false;

function inicializarPeriodFilter() {
    if (_filtrosGlobaisInicializados) return;
    _filtrosGlobaisInicializados = true;

    document.getElementById('btn-periodo-atual')?.addEventListener('click', () => aplicarFiltroPeriodo('atual'));
    document.getElementById('btn-periodo-todos')?.addEventListener('click', () => aplicarFiltroPeriodo('todos'));

    document.getElementById('global-tipo-filter')?.addEventListener('change', _reaplicarFiltrosGlobais);
    document.getElementById('global-categoria-filter')?.addEventListener('change', _reaplicarFiltrosGlobais);
    document.getElementById('global-pagamento-filter')?.addEventListener('change', _reaplicarFiltrosGlobais);

    document.getElementById('btn-limpar-filtros-dash')?.addEventListener('click', () => {
        const elTipo  = document.getElementById('global-tipo-filter');
        const elCat   = document.getElementById('global-categoria-filter');
        const elPgto  = document.getElementById('global-pagamento-filter');
        if (elTipo)  elTipo.value  = 'ambos';
        if (elCat)   elCat.value   = '';
        if (elPgto)  elPgto.value  = 'todas';
        aplicarFiltroPeriodo('atual');
    });
}

function obterFiltrosGlobais() {
    return {
        tipo:           document.getElementById('global-tipo-filter')?.value       || 'ambos',
        categoria:      document.getElementById('global-categoria-filter')?.value  || '',
        formaPagamento: document.getElementById('global-pagamento-filter')?.value  || 'todas',
        status: 'todos'
    };
}

function _anoGraficosAtual() {
    if (window.anoDashboard === 'todos') {
        return Object.keys(window.dadosFinanceiros || {}).map(Number).filter(Boolean).sort().pop() || window.anoAtual;
    }
    return window.anoAtual;
}

function _reaplicarFiltrosGlobais() {
    const todos = window.anoDashboard === 'todos';
    const ano = todos ? 'todos' : _anoGraficosAtual();
    const filtros = obterFiltrosGlobais();
    limparGraficos();
    criarGraficoBalanco(null);
    criarGraficoTendenciaAnualComFiltros(window.dadosFinanceiros, ano, filtros);
    if (todos) {
        criarGraficoReceitasDespesasComFiltros(_processarEntradasSaidasAgregadas(filtros), filtros);
    } else {
        const dadosProcessados = processarDadosReais(window.dadosFinanceiros, ano);
        criarGraficoReceitasDespesasComFiltros(dadosProcessados.dadosMensais, filtros);
    }
    criarGraficoBarrasCategoriasComFiltros(window.dadosFinanceiros, ano, filtros);
    criarGraficoCategoriasMensaisComFiltros(window.dadosFinanceiros, ano, filtros);
    criarGraficoJurosEconomias(todos ? 'todos' : _anoGraficosAtual());
    criarGraficoParcelamentosComFiltros(window.dadosFinanceiros, ano, filtros);
    criarGraficoFormaPagamentoComFiltros(window.dadosFinanceiros, ano, filtros);
    renderDistribuicaoCartoes(window.dadosFinanceiros, ano, filtros);
    renderizarGraficoMediaCategorias(ano);
}

function _processarEntradasSaidasAgregadas(filtros) {
    const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const receitas = Array(12).fill(0);
    const despesas = Array(12).fill(0);
    const dados = window.dadosFinanceiros || {};
    Object.keys(dados).map(Number).forEach(anoN => {
        const anoData = dados[anoN];
        if (!anoData?.meses) return;
        for (let m = 0; m < 12; m++) {
            const mes = anoData.meses[m];
            if (!mes) continue;
            receitas[m] += (mes.receitas || []).reduce((s, r) => {
                if (r.saldoAnterior || r.descricao?.includes('Saldo Anterior') || r.automatica) return s;
                return s + (r.valor || 0);
            }, 0);
            const despFilt = aplicarFiltrosDespesas(mes.despesas || [], filtros);
            despesas[m] += window.calcularTotalDespesas ? window.calcularTotalDespesas(despFilt) : 0;
        }
    });
    return { labels: nomesMeses, receitas, despesas };
}

function aplicarFiltroPeriodo(valor) {
    window.anoDashboard = valor === 'todos' ? 'todos' : null;

    // Atualizar estado visual dos botões
    document.getElementById('btn-periodo-atual')?.classList.toggle('active', valor !== 'todos');
    document.getElementById('btn-periodo-todos')?.classList.toggle('active', valor === 'todos');

    // Atualizar cards de resumo
    if (typeof window.carregarDadosDashboardLocal === 'function') {
        window.carregarDadosDashboardLocal(window.anoDashboard ?? window.anoAtual);
    }

    // Atualizar rótulo dos cards
    _atualizarRodapeCards(valor);

    // Recarregar gráficos com filtros atuais
    _reaplicarFiltrosGlobais();
}

function _atualizarRodapeCards(valor) {
    const label = valor === 'todos' ? 'Todos os anos' : `Ano ${window.anoAtual}`;
    const mapeamento = {
        'dashboard-total-receitas': 'Receitas — ' + label,
        'dashboard-total-despesas': 'Despesas — ' + label,
        'dashboard-saldo-anual': 'Saldo — ' + label,
        'dashboard-total-juros': 'Juros — ' + label,
        'dashboard-total-economias': 'Economias — ' + label,
    };
    document.querySelectorAll('.resumo-cards .card').forEach(card => {
        const valueEl = card.querySelector('.card-value');
        const footerEl = card.querySelector('.card-footer');
        if (!valueEl || !footerEl) return;
        const id = valueEl.id;
        if (mapeamento[id]) footerEl.textContent = mapeamento[id];
    });
}

function resetarFiltros() {
    // Resetar filtros globais
    const tipoFilter = document.getElementById('global-tipo-filter');
    const catFilter  = document.getElementById('global-categoria-filter');
    const pagFilter  = document.getElementById('global-pagamento-filter');
    if (tipoFilter) tipoFilter.value = 'ambos';
    if (catFilter)  catFilter.value  = '';
    if (pagFilter)  pagFilter.value  = 'todas';

    // Resetar período para ano atual
    window.anoDashboard = null;
    document.getElementById('btn-periodo-atual')?.classList.add('active');
    document.getElementById('btn-periodo-todos')?.classList.remove('active');

}

function limparGraficos() {
    [
        'balancoChart',
        'tendenciaChart',
        'receitasDespesasChart',
        'categoriasBarrasChart',
        'categoriasEmpilhadasChart',
        'jurosEconomiasChart',
        'parcelamentosChart',
        'formaPagamentoChart',
        'chartDistribuicaoCartoes',
        'mediaCategoriasChart'
    ].forEach(nome => {
        if (window[nome]) {
            window[nome].destroy();
            window[nome] = null;
        }
    });
}



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

        const dadosProcessados = processarDadosReais(window.dadosFinanceiros, ano);

        // Cards são atualizados pelo main.js (carregarDadosDashboardLocal) - fonte única de verdade
        if (typeof window.carregarDadosDashboardLocal === 'function') {
            window.carregarDadosDashboardLocal(window.anoDashboard ?? ano);
        }
        preencherSelectCategorias();
        inicializarPeriodFilter();

        const filtros = obterFiltrosGlobais();

        criarGraficoBalanco(dadosProcessados.dadosMensais);
        criarGraficoTendenciaAnualComFiltros(window.dadosFinanceiros, ano, filtros);
        criarGraficoReceitasDespesasComFiltros(dadosProcessados.dadosMensais, filtros);
        criarGraficoBarrasCategoriasComFiltros(window.dadosFinanceiros, ano, filtros);
        criarGraficoCategoriasMensaisComFiltros(window.dadosFinanceiros, ano, filtros);
        criarGraficoJurosEconomias(ano);
        criarGraficoParcelamentosComFiltros(window.dadosFinanceiros, ano, filtros);
        criarGraficoFormaPagamentoComFiltros(window.dadosFinanceiros, ano, filtros);
        renderDistribuicaoCartoes(window.dadosFinanceiros, ano, filtros);
        renderizarGraficoMediaCategorias(ano);
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
                    stepSize: 5000,
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
    opcoesBalanco.scales.y.grid.color = ctx2 => ctx2.tick?.value === 0 ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.06)';
    opcoesBalanco.scales.y.grid.lineWidth = ctx2 => ctx2.tick?.value === 0 ? 2 : 1;
    opcoesBalanco.plugins.legend.display = false;
    opcoesBalanco.layout = { padding: { top: 16, bottom: 16 } };

    const datasetBalancoAnos = {
        ...criarDatasetBarra(BALANCO_DATASETS_CONFIG.balanco, balancos),
        backgroundColor: coresBalanco,
        borderColor: coresBalanco.map(c => c.replace('0.7)', '1)'))
    };

    window.balancoChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: anos.map(a => a.toString()),
            datasets: [datasetBalancoAnos]
        },
        options: opcoesBalanco
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
    opcoesBalanco.scales.y.grid.color = ctx2 => ctx2.tick?.value === 0 ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.06)';
    opcoesBalanco.scales.y.grid.lineWidth = ctx2 => ctx2.tick?.value === 0 ? 2 : 1;
    opcoesBalanco.plugins.legend.display = false;
    opcoesBalanco.layout = { padding: { top: 16, bottom: 16 } };

    const datasetBalancoMeses = {
        ...criarDatasetBarra(BALANCO_DATASETS_CONFIG.balanco, balancos),
        backgroundColor: coresBalanco,
        borderColor: coresBalanco.map(c => c.replace('0.7)', '1)'))
    };

    window.balancoChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: meses,
            datasets: [datasetBalancoMeses]
        },
        options: opcoesBalanco
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
            borderRadius: 8,
            borderSkipped: false
        });
    }

    if (filtros.tipo === 'ambos' || filtros.tipo === 'despesas') {
        datasets.push({
            label: 'Despesas Totais',
            data: dadosDespesas,
            backgroundColor: 'rgba(220, 53, 69, 0.7)',
            borderColor: 'rgb(220, 53, 69)',
            borderRadius: 8,
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
            borderRadius: 8,
            borderSkipped: false
        });
    }

    if (filtros.tipo === 'ambos' || filtros.tipo === 'despesas') {
        datasets.push({
            label: 'Despesas',
            data: dados.despesas,
            backgroundColor: 'rgba(220, 53, 69, 0.7)',
            borderColor: 'rgb(220, 53, 69)',
            borderRadius: 8,
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
                    borderRadius: 8,
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
            borderRadius: 10,
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
                borderRadius: 6,
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
                        color: ctx2 => ctx2.tick?.value === 0 ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.06)',
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
                    borderRadius: 8,
                    borderSkipped: false
                },
                {
                    label: 'Parcelas Pagas',
                    data: dados.parcelasPagas,
                    backgroundColor: 'rgba(75, 192, 192, 0.9)',
                    borderColor: 'rgb(75, 192, 192)',
                    borderRadius: 8,
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
                    borderRadius: 8,
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