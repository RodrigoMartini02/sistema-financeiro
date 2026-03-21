// ================================================================
// PLUGINS GLOBAIS CHART.JS — GRADIENTES + GLOW
// ================================================================

// Plugin 1: Gradientes automáticos em barras (vertical e horizontal)
const gradientBarsPlugin = {
    id: 'gradientBars',
    beforeDatasetDraw(chart, args) {
        const dataset = chart.data.datasets[args.index];
        if (!dataset._gradColors) return;
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        const { top, bottom, left, right } = chartArea;
        const [c1, c2] = dataset._gradColors;
        const isH = chart.options.indexAxis === 'y';
        let grad;
        if (isH) {
            grad = ctx.createLinearGradient(left, 0, right, 0);
        } else {
            grad = ctx.createLinearGradient(0, bottom, 0, top);
        }
        grad.addColorStop(0, c1);
        grad.addColorStop(1, c2);
        dataset.backgroundColor = grad;
    }
};

// Plugin 2: Glow nas linhas — aplica shadow ANTES do draw do Chart.js, remove DEPOIS
// (sem re-desenhar o path — evita linhas duplicadas)
const glowLinesPlugin = {
    id: 'glowLines',
    beforeDatasetDraw(chart, args) {
        const dataset = chart.data.datasets[args.index];
        if (!dataset._glowColor) return;
        const meta = chart.getDatasetMeta(args.index);
        if (!meta || meta.type !== 'line') return;
        chart.ctx.shadowColor = dataset._glowColor;
        chart.ctx.shadowBlur  = dataset._glowBlur || 10;
    },
    afterDatasetDraw(chart, args) {
        const dataset = chart.data.datasets[args.index];
        if (!dataset._glowColor) return;
        const meta = chart.getDatasetMeta(args.index);
        if (!meta || meta.type !== 'line') return;
        chart.ctx.shadowColor = 'transparent';
        chart.ctx.shadowBlur  = 0;
    }
};

// Registrar plugins quando Chart.js estiver disponível
function _registrarPluginsChart() {
    if (typeof Chart === 'undefined') return;
    // Evitar duplo registro
    if (!Chart.registry.plugins.get('gradientBars')) {
        Chart.register(gradientBarsPlugin);
    }
    if (!Chart.registry.plugins.get('glowLines')) {
        Chart.register(glowLinesPlugin);
    }
}
// Tentar registrar agora e também no evento de inicialização
_registrarPluginsChart();
window.addEventListener('sistemaFinanceiroReady', _registrarPluginsChart, { once: true });

// Tooltip externo singleton
function criarOuObterTooltipEl() {
    let el = document.getElementById('dash-tooltip-premium');
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const bg = isLight ? 'rgba(255,255,255,0.97)' : 'rgba(15,23,42,0.96)';
    const textColor = isLight ? '#1e293b' : '#e2e8f0';
    const borderColor = isLight ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.35)';
    if (!el) {
        el = document.createElement('div');
        el.id = 'dash-tooltip-premium';
        document.body.appendChild(el);
    }
    el.style.cssText = [
        'position:fixed',
        'pointer-events:none',
        'z-index:99999',
        'background:' + bg,
        'backdrop-filter:blur(12px)',
        '-webkit-backdrop-filter:blur(12px)',
        'border:1px solid ' + borderColor,
        'border-radius:10px',
        'padding:10px 14px',
        'font-size:12px',
        'color:' + textColor,
        'box-shadow:0 8px 32px rgba(0,0,0,' + (isLight ? '0.18' : '0.5') + ')',
        'min-width:150px',
        'max-width:260px',
        'transition:opacity 0.12s ease',
        'font-family:Inter,system-ui,sans-serif',
        'line-height:1.5'
    ].join(';');
    return el;
}

function tooltipExternoHandler(context) {
    const el = criarOuObterTooltipEl();
    const { chart, tooltip } = context;
    if (tooltip.opacity === 0) {
        el.style.opacity = '0';
        return;
    }
    const pos = chart.canvas.getBoundingClientRect();
    let left = pos.left + window.scrollX + tooltip.caretX + 14;
    let top  = pos.top  + window.scrollY + tooltip.caretY - 10;
    // Evitar sair da tela pela direita
    const elW = 260;
    if (left + elW > window.innerWidth - 10) left = pos.left + window.scrollX + tooltip.caretX - elW - 10;
    el.style.left    = left + 'px';
    el.style.top     = top  + 'px';
    el.style.opacity = '1';

    const title = tooltip.title?.[0] || '';
    const bodyLines = tooltip.body?.map(b => b.lines).flat() || [];
    const colors = tooltip.labelColors || [];

    let html = title
        ? '<div style="font-weight:700;margin-bottom:7px;color:#a5b4fc;font-size:11px;text-transform:uppercase;letter-spacing:0.6px">' + title + '</div>'
        : '';
    bodyLines.forEach(function(line, i) {
        const bg = colors[i]?.backgroundColor || '#6366f1';
        const dotColor = typeof bg === 'string' && bg.startsWith('rgba') ? bg : bg;
        html += '<div style="display:flex;gap:7px;align-items:center;padding:2px 0">' +
            '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + dotColor + ';flex-shrink:0"></span>' +
            '<span>' + line + '</span></div>';
    });
    el.innerHTML = html;
}

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
// UTILITÁRIOS DE ESCALA
// ================================================================

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

function criarGraficoBalancoPorAnos() {
    // canvas balanco-chart removido — função mantida para evitar erros de referência
}

// Funções legadas — canvas balanco-chart removido
function criarGraficoBalancoPorMeses(ano) {}
function criarGraficoBalanco(dados) {}

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
            type: 'pie',
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
                    hoverOffset: 18
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                radius: '75%',
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
                    hoverOffset: 18
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                radius: '75%',
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

// ================================================================
// UTILITÁRIOS DE FILTRO DE DESPESAS
// ================================================================

function aplicarFiltrosDespesas(despesas, filtros) {
    if (!filtros) return despesas;
    return despesas.filter(function(despesa) {
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
                forma = (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito')
                    ? 'credito' : 'debito';
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
    const categoria = document.getElementById(prefixo + '-categoria-filter')?.value || '';
    const formaPagamento = document.getElementById(prefixo + '-pagamento-filter')?.value || 'todas';
    const status = document.getElementById(prefixo + '-status-filter')?.value || 'todos';
    const tipo = document.getElementById(prefixo + '-tipo-filter')?.value || 'ambos';
    return { categoria, formaPagamento, status, tipo };
}

function _anoGraficosAtual() {
    return window.anoDashboard || window.anoAtual || new Date().getFullYear();
}

// ================================================================
// EXPORTAR FUNÇÕES GLOBAIS
// ================================================================

window.carregarDadosDashboard = carregarDadosDashboard;

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
// DASHBOARD TEMÁTICO — Sistema de Views por Tema
// ================================================================

function inicializarDashboardTematico() {
    // Defaults globais Chart.js — dark mode elegante
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
    if (Chart.defaults.font) Chart.defaults.font.family = "'Inter', sans-serif";

    // Garantir registro dos plugins visuais
    _registrarPluginsChart();

    // Navegação entre temas
    document.querySelectorAll('.tema-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const tema = this.dataset.tema;
            // Cancelar animação liquid fill ao trocar de aba
            if (window._liquidFillAnimFrame) {
                cancelAnimationFrame(window._liquidFillAnimFrame);
                window._liquidFillAnimFrame = null;
            }
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

    const filtroMes = document.getElementById('dash-filtro-mes');
    if (filtroMes) filtroMes.addEventListener('change', atualizarDashboardTematico);

    // Renderiza tema inicial (saude)
    atualizarDashboardTematico();
    atualizarKpisFixos();
}


function obterFiltroAtivo() {
    const filtroMes = document.getElementById('dash-filtro-mes');
    const periodoTodos = document.querySelector('.periodo-btn[data-periodo="todos"]')?.classList.contains('active');
    return {
        ano: window.anoAtual || new Date().getFullYear(),
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
    // Atualizar KPI de Metas/Objetivos no tema Saúde
    const elObj = document.getElementById('tk-saude-objetivos');
    if (!elObj) return;
    if (typeof window.carregarObjetivos !== 'function') {
        elObj.textContent = 'Crie sua primeira Meta';
        elObj.style.color = '#94a3b8';
        return;
    }
    window.carregarObjetivos().then(function(objetivos) {
        const ativos = objetivos.filter(o => !o.objetivo_atingido);
        if (ativos.length === 0) {
            elObj.textContent = 'Crie sua primeira Meta';
            elObj.style.color = '#94a3b8';
            elObj.style.fontSize = '13px';
            return;
        }
        // Encontrar o mais próximo de ser atingido
        const maisProximo = ativos.sort((a, b) => parseFloat(b.progresso) - parseFloat(a.progresso))[0];
        const progresso = parseFloat(maisProximo.progresso) || 0;
        elObj.innerHTML = ativos.length + ' ativo' + (ativos.length > 1 ? 's' : '') +
            '<br><small style="font-size:11px;font-weight:400;color:#94a3b8">' +
            (maisProximo.observacoes || 'Meta') + ': ' + progresso.toFixed(1) + '%</small>';
        elObj.style.color = progresso >= 75 ? '#10b981' : '#f59e0b';
        elObj.style.fontSize = '16px';
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
        'metas':      renderizarTemaMetas,
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

const CORES = [
    '#6366f1', // índigo
    '#10b981', // esmeralda
    '#f59e0b', // âmbar
    '#06b6d4', // ciano
    '#a855f7', // roxo
    '#f43f5e', // rosa
    '#14b8a6', // teal
    '#fb923c', // laranja
    '#84cc16', // lima
    '#3b82f6', // azul
];

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

function opcoesBarraH() {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const tickColor = isDark ? '#94a3b8' : '#64748b';
    const labelColor = isDark ? '#cbd5e1' : '#334155';
    const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
    return {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: function(ctx) {
                        return ' R$ ' + parseFloat(ctx.parsed.x || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    }
                }
            }
        },
        datasets: { bar: { maxBarThickness: 20, barPercentage: 0.85, categoryPercentage: 0.9 } },
        scales: {
            x: {
                ticks: { color: tickColor, font: { size: 10 }, callback: function(v) { return 'R$' + (v >= 1000 ? (v/1000).toFixed(1)+'k' : v); } },
                grid: { color: gridColor }
            },
            y: {
                ticks: { color: labelColor, font: { size: 11 } },
                grid: { display: false }
            }
        }
    };
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

function opcoesDonut() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        radius: '88%',
        animation: { animateRotate: true, animateScale: true, duration: 700 },
        plugins: {
            legend: {
                display: true,
                position: 'bottom',
                labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 10, padding: 10 }
            },
            tooltip: {
                callbacks: {
                    label: function(ctx) {
                        const total = ctx.dataset.data.reduce((a,b) => a+b, 0);
                        const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                        return ` ${ctx.label}: ${pct}%`;
                    }
                }
            }
        }
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

    // Gráfico 1: Balanço Mensal — barras agrupadas com gradientes
    criarChart('tema-saude-balanco', {
        type: 'bar',
        data: {
            labels: MESES_LABELS,
            datasets: [
                {
                    label: 'Receitas',
                    data: recPorMes,
                    backgroundColor: '#10b98166',
                    borderColor: '#10b981',
                    borderWidth: 1.5,
                    borderRadius: 4,
                    _gradColors: ['#10b981', '#34d399']
                },
                {
                    label: 'Despesas',
                    data: despPorMes,
                    backgroundColor: '#f43f5e66',
                    borderColor: '#f43f5e',
                    borderWidth: 1.5,
                    borderRadius: 4,
                    _gradColors: ['#f43f5e', '#fb7185']
                }
            ]
        },
        options: Object.assign(opcoesEscuras({
            plugins: {
                legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } },
                tooltip: { enabled: false, external: tooltipExternoHandler }
            },
            animation: { duration: 900, easing: 'easeOutQuart', delay: function(ctx) { return ctx.dataIndex * 55; } },
            scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { beginAtZero: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } }
        }))
    });

    // Gráfico 2: Saldo Progressivo — área suave com glow
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
                pointHoverRadius: 5,
                borderWidth: 2.5,
                _glowColor: '#6366f1',
                _glowBlur: 12
            }]
        },
        options: opcoesEscuras({
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false, external: tooltipExternoHandler }
            },
            animation: { duration: 900, easing: 'easeOutQuart' },
            scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { beginAtZero: false, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } }
        })
    });

    // Gráfico 3: Fluxo do Mês — waterfall: saldo inicial → receitas (sobe) → categorias (desce) → saldo final
    (function() {
        const filtro = obterFiltroAtivo();
        const df = window.dadosFinanceiros || {};
        const ano = filtro.ano;
        const mes = filtro.mes !== null ? filtro.mes : (window.mesAtual !== undefined ? window.mesAtual : new Date().getMonth());
        const dadosMes = df[ano]?.meses?.[mes] || {};
        const saldoAnterior = window.obterSaldoAnterior ? window.obterSaldoAnterior(mes, ano) : 0;

        // Agrupar despesas por categoria
        const porCat = {};
        (dadosMes.despesas || []).forEach(function(d) {
            const catObj = (df.categorias || []).find(c => c.id === d.categoria_id);
            const nome = catObj ? catObj.nome : (d.categoria || 'Outros');
            const valor = window.obterValorRealDespesa ? window.obterValorRealDespesa(d) : parseFloat(d.valor || 0);
            if (!isNaN(valor) && valor > 0) porCat[nome] = (porCat[nome] || 0) + valor;
        });

        // Receitas do mês
        const receitasMes = (dadosMes.receitas || []).reduce(function(s, r) {
            if (r.saldoAnterior || r.automatica || (r.descricao && r.descricao.includes('Saldo Anterior'))) return s;
            return s + parseFloat(r.valor || 0);
        }, 0);

        // Construir labels e dados de waterfall
        const wfLabels = ['Saldo Inicial', 'Receitas'];
        const catEntradas = Object.keys(porCat).sort((a, b) => porCat[b] - porCat[a]);
        catEntradas.forEach(c => wfLabels.push(c));
        wfLabels.push('Saldo Final');

        // Para waterfall com barras flutuantes: [base, valor]
        // Saldo inicial: barra de 0 até saldoAnterior
        // Receitas: barra de saldoAnterior até saldoAnterior+receitas
        // Cada categoria: desce
        // Saldo final: barra de 0 até saldoFinal
        const wfData = [];
        const wfColors = [];
        let acum = saldoAnterior;

        // Saldo inicial
        wfData.push({ x: wfLabels[0], y: [0, saldoAnterior] });
        wfColors.push('#6366f1');

        // Receitas
        const novoAcum = acum + receitasMes;
        wfData.push({ x: 'Receitas', y: [acum, novoAcum] });
        wfColors.push('#10b981');
        acum = novoAcum;

        // Categorias de despesa (cada uma desce)
        catEntradas.forEach(function(cat) {
            const anterior = acum;
            acum = acum - porCat[cat];
            wfData.push({ x: cat, y: [acum, anterior] });
            wfColors.push('#f43f5e');
        });

        // Saldo final
        wfData.push({ x: 'Saldo Final', y: [0, acum] });
        wfColors.push(acum >= 0 ? '#10b981' : '#f43f5e');

        criarChart('tema-saude-entradas', {
            type: 'bar',
            data: {
                labels: wfLabels,
                datasets: [{
                    label: 'Fluxo',
                    data: wfData.map(d => d.y[1] - d.y[0]),
                    backgroundColor: wfColors,
                    borderRadius: 4,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 900, easing: 'easeOutQuart', delay: function(ctx) { return ctx.dataIndex * 60; } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: false,
                        external: function(context) {
                            const el = criarOuObterTooltipEl();
                            const { chart, tooltip } = context;
                            if (tooltip.opacity === 0) { el.style.opacity = '0'; return; }
                            const pos = chart.canvas.getBoundingClientRect();
                            const left = pos.left + window.scrollX + tooltip.caretX + 14;
                            const top  = pos.top  + window.scrollY + tooltip.caretY - 10;
                            el.style.left = left + 'px';
                            el.style.top  = top  + 'px';
                            el.style.opacity = '1';
                            const title = tooltip.title?.[0] || '';
                            const lines = tooltip.body?.map(b => b.lines).flat() || [];
                            const colors = tooltip.labelColors || [];
                            let html = title ? '<div style="font-weight:700;margin-bottom:7px;color:#a5b4fc;font-size:11px;text-transform:uppercase;letter-spacing:0.6px">' + title + '</div>' : '';
                            lines.forEach(function(line, i) {
                                const dotBg = colors[i]?.backgroundColor || '#6366f1';
                                html += '<div style="display:flex;gap:7px;align-items:center;padding:2px 0"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + dotBg + ';flex-shrink:0"></span><span>' + line + '</span></div>';
                            });
                            el.innerHTML = html;
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8', font: { size: 10 }, maxRotation: 35 }, grid: { display: false }, border: { display: false } },
                    y: { ticks: { color: '#94a3b8', font: { size: 10 }, callback: function(v) { return v >= 1000 ? 'R$'+(v/1000).toFixed(0)+'k' : 'R$'+v; } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } }
                }
            }
        });
    })();
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

    // Gráfico 1: Área empilhada — receitas e despesas por mês com glow
    criarChart('tema-fluxo-entradas', {
        type: 'line',
        data: {
            labels: MESES_LABELS,
            datasets: [
                {
                    label: 'Receitas',
                    data: recPorMes,
                    borderColor: '#10b981',
                    backgroundColor: criarGradiente('tema-fluxo-entradas','#10b981',0.4,0.02),
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    borderWidth: 2.5,
                    _glowColor: '#10b981',
                    _glowBlur: 10
                },
                {
                    label: 'Despesas',
                    data: despPorMes,
                    borderColor: '#f43f5e',
                    backgroundColor: criarGradiente('tema-fluxo-entradas','#f43f5e',0.3,0.02),
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    borderWidth: 2.5,
                    _glowColor: '#f43f5e',
                    _glowBlur: 10
                }
            ]
        },
        options: opcoesEscuras({
            plugins: {
                legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } },
                tooltip: { enabled: false, external: tooltipExternoHandler }
            },
            animation: { duration: 900, easing: 'easeOutQuart' },
            scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { beginAtZero: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } }
        })
    });

    // Gráfico 2: Taxa de Poupança — ((receita - despesa) / receita) * 100 por mês, filtra meses sem dados
    (function() {
        const mesesValidos = MESES_LABELS.reduce(function(acc, label, i) {
            if (recPorMes[i] > 0 || despPorMes[i] > 0) acc.push(i);
            return acc;
        }, []);
        const labelsTaxa = mesesValidos.map(i => MESES_LABELS[i]);
        const taxas = mesesValidos.map(function(i) {
            const rec = recPorMes[i];
            const desp = despPorMes[i];
            if (rec <= 0) return 0;
            return ((rec - desp) / rec) * 100;
        });
        const coresTaxa = taxas.map(v => v >= 0 ? 'rgba(16,185,129,0.75)' : 'rgba(244,63,94,0.75)');
        const borderTaxa = taxas.map(v => v >= 0 ? '#10b981' : '#f43f5e');
        criarChart('tema-fluxo-acumulado', {
            type: 'line',
            data: {
                labels: labelsTaxa,
                datasets: [{
                    label: 'Taxa de Poupança (%)',
                    data: taxas,
                    borderColor: function(ctx) {
                        return taxas[ctx.dataIndex] >= 0 ? '#10b981' : '#f43f5e';
                    },
                    backgroundColor: criarGradiente('tema-fluxo-acumulado', '#10b981', 0.35, 0.03),
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: borderTaxa,
                    borderWidth: 2.5,
                    _glowColor: '#10b981',
                    _glowBlur: 10,
                    segment: {
                        borderColor: function(ctx) {
                            return ctx.p0.parsed.y >= 0 && ctx.p1.parsed.y >= 0 ? '#10b981' : '#f43f5e';
                        }
                    }
                }]
            },
            options: opcoesEscuras({
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false, external: tooltipExternoHandler }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: {
                        ticks: { color: '#94a3b8', font: { size: 11 }, callback: function(v) { return v.toFixed(0) + '%'; } },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    }
                }
            })
        });
    })();

    // Gráfico 3: Pizza — receita vs despesa total
    criarChart('tema-fluxo-cobertura', {
        type: 'pie',
        data: {
            labels: ['Receitas', 'Despesas'],
            datasets: [{ data: [totalRec, totalDesp], backgroundColor: ['#10b981', '#f43f5e'], borderWidth: 0, hoverOffset: 18 }]
        },
        options: opcoesDonut()
    });
}

// ================================================================
// TREEMAP — canvas 2D puro com squarify simplificado
// ================================================================

function desenharTreemap(canvasId, dados) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !dados || dados.length === 0) return;
    const W = canvas.offsetWidth || canvas.parentElement?.offsetWidth || 400;
    const H = canvas.offsetHeight || canvas.parentElement?.offsetHeight || 300;
    if (W < 10 || H < 10) return;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const totalReal = dados.reduce(function(s, d) { return s + Math.abs(d.value); }, 0);
    if (totalReal === 0) return;

    // Normalização sqrt — reduz domínio de categorias grandes, dá mais espaço às pequenas
    const dadosNorm = dados.map(function(d) {
        return Object.assign({}, d, { realValue: d.value, value: Math.sqrt(Math.abs(d.value)) });
    });
    const total = dadosNorm.reduce(function(s, d) { return s + d.value; }, 0);
    const dados_ = dadosNorm; // alias para uso interno

    ctx.clearRect(0, 0, W, H);

    // Algoritmo squarify — divide em linhas/colunas por área
    function squarify(items, x, y, w, h) {
        if (items.length === 0) return;
        const totalVal = items.reduce(function(s, d) { return s + d.value; }, 0);
        const areaTotal = w * h;

        // Decidir orientação pela dimensão maior
        const horizontal = w >= h;
        let cursor = horizontal ? x : y;
        let remaining = [...items];

        while (remaining.length > 0) {
            const rowItems = [];
            let rowVal = 0;
            const availLen = horizontal ? (w - (cursor - x)) : (h - (cursor - y));
            const crossLen  = horizontal ? h : w;

            for (let i = 0; i < remaining.length; i++) {
                rowItems.push(remaining[i]);
                rowVal += remaining[i].value;
                const rowPct = rowVal / totalVal;
                const rowLen = (areaTotal > 0) ? (rowVal / total) * (horizontal ? W : H) : 0;
                const rowThickness = (horizontal ? w : h) * (rowVal / totalVal);

                // Verificar razão de aspecto: manter próximo de 1
                const bestAspect = rowItems.reduce(function(worst, item) {
                    const areaPct = item.value / totalVal;
                    const rectW = horizontal ? rowThickness : (areaPct / (rowVal / totalVal)) * crossLen;
                    const rectH = horizontal ? (areaPct / (rowVal / totalVal)) * crossLen : rowThickness;
                    const asp = Math.max(rectW, rectH) / Math.min(rectW || 1, rectH || 1);
                    return Math.max(worst, asp);
                }, 0);

                // Se adicionar o próximo piorar, parar aqui
                if (i > 0 && remaining[i + 1]) {
                    const testItems = [...rowItems, remaining[i + 1]];
                    const testVal = rowVal + remaining[i + 1].value;
                    const testThickness = (horizontal ? w : h) * (testVal / totalVal);
                    const testAspect = testItems.reduce(function(worst, item) {
                        const areaPct = item.value / totalVal;
                        const rectW = horizontal ? testThickness : (areaPct / (testVal / totalVal)) * crossLen;
                        const rectH = horizontal ? (areaPct / (testVal / totalVal)) * crossLen : testThickness;
                        const asp = Math.max(rectW, rectH) / Math.min(rectW || 1, rectH || 1);
                        return Math.max(worst, asp);
                    }, 0);
                    if (testAspect > bestAspect && rowItems.length >= 1) break;
                }
            }

            // Renderizar a linha atual
            const rowThickness = (horizontal ? w : h) * (rowVal / totalVal);
            let subCursor = horizontal ? y : x;
            rowItems.forEach(function(item) {
                const itemPct = item.value / rowVal;
                const itemLen = (horizontal ? h : w) * itemPct;
                let rx, ry, rw, rh;
                if (horizontal) {
                    rx = cursor; ry = subCursor; rw = rowThickness; rh = itemLen;
                } else {
                    rx = subCursor; ry = cursor; rw = itemLen; rh = rowThickness;
                }

                // Gradiente
                const grad = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh);
                grad.addColorStop(0, item.color + 'ee');
                grad.addColorStop(1, item.color + '88');
                ctx.fillStyle = grad;

                const pad = 2;
                const radius = 5;
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(rx + pad, ry + pad, rw - pad * 2, rh - pad * 2, radius);
                } else {
                    ctx.rect(rx + pad, ry + pad, rw - pad * 2, rh - pad * 2);
                }
                ctx.fill();

                // Label
                const fw = rw - pad * 2;
                const fh = rh - pad * 2;
                if (fw > 36 && fh > 22) {
                    ctx.save();
                    ctx.beginPath();
                    if (ctx.roundRect) {
                        ctx.roundRect(rx + pad, ry + pad, fw, fh, radius);
                    } else {
                        ctx.rect(rx + pad, ry + pad, fw, fh);
                    }
                    ctx.clip();

                    const pct = ((item.realValue / totalReal) * 100).toFixed(1);
                    ctx.fillStyle = 'rgba(255,255,255,0.95)';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const cx2 = rx + pad + fw / 2;
                    const cy2 = ry + pad + fh / 2;

                    if (fh > 44) {
                        ctx.font = 'bold ' + Math.min(13, Math.floor(fw / 6)) + 'px Inter,sans-serif';
                        const label = item.label.length > 14 ? item.label.slice(0, 12) + '…' : item.label;
                        ctx.fillText(label, cx2, cy2 - 9);
                        ctx.font = Math.min(11, Math.floor(fw / 7)) + 'px Inter,sans-serif';
                        ctx.fillStyle = 'rgba(255,255,255,0.8)';
                        ctx.fillText(pct + '%', cx2, cy2 + 9);
                    } else {
                        ctx.font = 'bold ' + Math.min(11, Math.floor(fw / 6)) + 'px Inter,sans-serif';
                        const label = item.label.length > 10 ? item.label.slice(0, 8) + '…' : item.label;
                        ctx.fillText(label + ' ' + pct + '%', cx2, cy2);
                    }
                    ctx.restore();
                }

                subCursor += itemLen;
                item._rect = { x: rx + pad, y: ry + pad, w: rw - pad * 2, h: rh - pad * 2 };
            });

            cursor += rowThickness;
            remaining = remaining.slice(rowItems.length);
        }
    }

    const sorted = [...dados_].sort(function(a, b) { return b.value - a.value; });
    squarify(sorted, 0, 0, W, H);

    // Hover interativo
    canvas._treemapData = sorted;
    canvas.onmousemove = function(e) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const hit = sorted.find(function(d) {
            if (!d._rect) return false;
            return mx >= d._rect.x && mx <= d._rect.x + d._rect.w && my >= d._rect.y && my <= d._rect.y + d._rect.h;
        });
        const el = criarOuObterTooltipEl();
        if (hit) {
            const pct = ((hit.realValue / totalReal) * 100).toFixed(1);
            el.style.opacity = '1';
            el.style.left = (e.clientX + 14) + 'px';
            el.style.top  = (e.clientY - 10) + 'px';
            el.innerHTML = '<div style="font-weight:700;margin-bottom:6px;color:#a5b4fc;font-size:11px;text-transform:uppercase;letter-spacing:0.6px">' + hit.label + '</div>' +
                '<div style="display:flex;gap:7px;align-items:center"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + hit.color + ';flex-shrink:0"></span>' +
                fmtR(hit.realValue) + ' (' + pct + '%)</div>';
            canvas.style.cursor = 'crosshair';
        } else {
            el.style.opacity = '0';
            canvas.style.cursor = '';
        }
    };
    canvas.onmouseleave = function() {
        const el = document.getElementById('dash-tooltip-premium');
        if (el) el.style.opacity = '0';
        canvas.style.cursor = '';
    };
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

    // Gráfico 1: Treemap — todas as categorias (canvas 2D puro)
    if (catOrdenadas.length > 0) {
        // Destruir chart Chart.js anterior se existir
        const canvasTreemap = document.getElementById('tema-cat-anual');
        if (canvasTreemap && canvasTreemap._chartInstance) {
            canvasTreemap._chartInstance.destroy();
            canvasTreemap._chartInstance = null;
        }
        const dadosTreemap = catOrdenadas.map(function([nome, valor], i) {
            return { label: nome, value: valor, color: CORES[i % CORES.length] };
        });
        // Dar um frame para o card ter dimensões definitivas
        requestAnimationFrame(function() {
            desenharTreemap('tema-cat-anual', dadosTreemap);
            // ResizeObserver para redesenhar se o card mudar de tamanho
            if (canvasTreemap && !canvasTreemap._treemapObserver) {
                const card = canvasTreemap.closest('.tema-chart-card');
                if (card && typeof ResizeObserver !== 'undefined') {
                    canvasTreemap._treemapObserver = new ResizeObserver(function() {
                        desenharTreemap('tema-cat-anual', dadosTreemap);
                    });
                    canvasTreemap._treemapObserver.observe(card);
                }
            }
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
        return {
            label: nome,
            data: porMes,
            borderColor: CORES[i],
            backgroundColor: CORES[i]+'22',
            borderWidth: 2.5,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 5,
            _glowColor: CORES[i],
            _glowBlur: 8
        };
    });
    criarChart('tema-cat-evolucao', {
        type: 'line',
        data: { labels: MESES_LABELS, datasets },
        options: opcoesEscuras({
            plugins: {
                legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } },
                tooltip: { enabled: false, external: tooltipExternoHandler }
            },
            animation: { duration: 900, easing: 'easeOutQuart' },
            scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { beginAtZero: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } }
        })
    });

    // Gráfico 3: Barras horizontais — média por categoria (todas) com gradiente
    const mediaCat = catOrdenadas.map(([nome, tot]) => ({ nome, media: tot/12 }));
    criarChart('tema-cat-media', {
        type: 'bar',
        data: {
            labels: mediaCat.map(c=>c.nome),
            datasets: [{
                label: 'Média/Mês',
                data: mediaCat.map(c=>c.media),
                backgroundColor: mediaCat.map((_,i)=>CORES[i%CORES.length]),
                borderRadius: 4,
                _gradColors: ['#f43f5e', '#fb7185']
            }]
        },
        options: Object.assign({}, opcoesBarraH(), {
            animation: { duration: 900, easing: 'easeOutQuart', delay: function(ctx) { return ctx.dataIndex * 40; } },
            plugins: Object.assign({}, opcoesBarraH().plugins, {
                tooltip: { enabled: false, external: tooltipExternoHandler }
            })
        })
    });
}

// ── TEMA: PAGAMENTO ──────────────────────────────────────────────
function renderizarTemaPagamento() {
    const { despesas } = obterDadosFiltrados();
    const cartoes = window.cartoesUsuario || [];

    // Agrupa por forma de pagamento
    const porForma = {};
    despesas.forEach(function(d) {
        const f = (d.formaPagamento || d.forma_pagamento || 'outros').toLowerCase();
        porForma[f] = (porForma[f] || 0) + parseFloat(d.valor || 0);
    });

    const totalCredito = (porForma['credito'] || 0) + (porForma['cartao_credito'] || 0) + (porForma['cartão de crédito'] || 0) + (porForma['cartao de credito'] || 0);
    const totalDebito = (porForma['debito'] || 0) + (porForma['débito'] || 0) + (porForma['cartao_debito'] || 0) + (porForma['pix'] || 0) + (porForma['dinheiro'] || 0);
    const totalGeral = totalCredito + totalDebito;

    const el1 = document.getElementById('tk-pgto-credito');
    const el2 = document.getElementById('tk-pgto-debito');
    const el3 = document.getElementById('tk-pgto-pct');
    if (el1) { el1.textContent = fmtR(totalCredito); el1.style.color = '#6366f1'; }
    if (el2) { el2.textContent = fmtR(totalDebito); el2.style.color = '#06b6d4'; }
    if (el3) el3.textContent = totalGeral > 0 ? ((totalCredito/totalGeral*100).toFixed(1)+'%') : '0%';

    // Gráfico 1: Pizza — formas de pagamento
    const formasLabels = Object.keys(porForma);
    const formasData = Object.values(porForma);
    if (formasLabels.length > 0) {
        criarChart('tema-pgto-formas', {
            type: 'pie',
            data: { labels: formasLabels, datasets: [{ data: formasData, backgroundColor: CORES, borderWidth: 0, hoverOffset: 18 }] },
            options: opcoesDonut()
        });
    }

    // Gráfico 2: Pizza — cartões
    const porCartao = {};
    despesas.filter(d => ['credito','cartao_credito','cartão de crédito','cartao de credito'].includes((d.formaPagamento||d.forma_pagamento||'').toLowerCase())).forEach(function(d) {
        const cartaoObj = cartoes.find(c => c.id === d.cartao_id);
        const nome = cartaoObj ? cartaoObj.nome : 'Outros';
        porCartao[nome] = (porCartao[nome] || 0) + parseFloat(d.valor || 0);
    });
    if (Object.keys(porCartao).length > 0) {
        criarChart('tema-pgto-cartoes', {
            type: 'pie',
            data: { labels: Object.keys(porCartao), datasets: [{ data: Object.values(porCartao), backgroundColor: CORES, borderWidth: 0, hoverOffset: 18 }] },
            options: opcoesDonut()
        });
    }

    // Gráfico 3: Barras empilhadas 100% — proporção de forma por mês
    const formasUnicas = [...new Set(despesas.map(d => (d.formaPagamento || d.forma_pagamento || 'outros').toLowerCase()))];
    const dadosBrutosForma = formasUnicas.map((forma, i) => {
        const porMes = new Array(12).fill(0);
        despesas.filter(d=>(d.formaPagamento||d.forma_pagamento||'outros').toLowerCase()===forma).forEach(d => {
            if (d.mes>=0&&d.mes<=11) porMes[d.mes]+=parseFloat(d.valor||0);
        });
        return { forma, porMes, cor: CORES[i % CORES.length] };
    });
    const totaisMensaisForma = new Array(12).fill(0).map((_, m) => dadosBrutosForma.reduce((s, d) => s + d.porMes[m], 0));
    const datasetsForma = dadosBrutosForma.map(({ forma, porMes, cor }) => ({
        label: forma.charAt(0).toUpperCase() + forma.slice(1),
        data: porMes.map((v, m) => totaisMensaisForma[m] > 0 ? parseFloat(((v / totaisMensaisForma[m]) * 100).toFixed(1)) : 0),
        backgroundColor: cor,
        stack: 'stack',
        borderRadius: 2,
        _valorBruto: porMes
    }));
    criarChart('tema-pgto-mensal', {
        type: 'bar',
        data: { labels: MESES_LABELS, datasets: datasetsForma },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const bruto = ctx.dataset._valorBruto?.[ctx.dataIndex] ?? null;
                            const pct = ctx.raw.toFixed(1) + '%';
                            return bruto !== null ? ' ' + ctx.dataset.label + ': ' + fmtR(bruto) + ' (' + pct + ')' : ' ' + ctx.dataset.label + ': ' + pct;
                        }
                    }
                }
            },
            scales: {
                x: { stacked: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y: { stacked: true, max: 100, ticks: { color: '#94a3b8', font: { size: 11 }, callback: function(v) { return v + '%'; } }, grid: { color: 'rgba(255,255,255,0.04)' } }
            }
        }
    });
}

// ── TEMA: ENDIVIDAMENTO ──────────────────────────────────────────
function renderizarTemaDivida() {
    const { despesas, filtro } = obterDadosFiltrados();
    const parceladas = despesas.filter(d => d.parcelas > 1 || d.parcelado || d.idGrupoParcelamento);
    const totalParc = parceladas.reduce((s,d)=>s+parseFloat(d.valor||0),0);

    // Juros e economias calculados via funções corretas (campos não existem direto no objeto)
    const calcJuros = window.calcularTotalJuros || (() => 0);
    const calcEco = window.calcularTotalEconomias || (() => 0);

    // Agrupar despesas por mês para calcular juros/economias mensais
    const df = window.dadosFinanceiros || {};
    const anos = Object.keys(df).map(Number).filter(Boolean);
    const anosFiltrados = filtro.todos ? anos : anos.filter(a => a === filtro.ano);
    const jurosPorMes = new Array(12).fill(0);
    const ecoMensal = new Array(12).fill(0);
    anosFiltrados.forEach(ano => {
        const meses = df[ano]?.meses || [];
        for (let m = 0; m < 12; m++) {
            if (filtro.mes !== null && filtro.mes !== m) continue;
            const desp = meses[m]?.despesas || [];
            jurosPorMes[m] += calcJuros(desp);
            ecoMensal[m] += calcEco(desp);
        }
    });

    const juros = jurosPorMes.reduce((s,v)=>s+v,0);
    const economias = ecoMensal.reduce((s,v)=>s+v,0);

    const el1 = document.getElementById('tk-divida-juros');
    const el2 = document.getElementById('tk-divida-parcelas');
    const el3 = document.getElementById('tk-divida-economias');
    if (el1) { el1.textContent = fmtR(juros); el1.style.color = '#f43f5e'; }
    if (el2) { el2.textContent = fmtR(totalParc); el2.style.color = '#f59e0b'; }
    if (el3) { el3.textContent = fmtR(economias); el3.style.color = '#10b981'; }
    criarChart('tema-divida-juros', {
        type: 'bar',
        data: {
            labels: MESES_LABELS,
            datasets: [
                { label: 'Juros', data: jurosPorMes, backgroundColor: '#f43f5e', borderRadius: 4, _gradColors: ['#f43f5e', '#fb7185'] },
                { label: 'Economias', data: ecoMensal, backgroundColor: '#10b981', borderRadius: 4, _gradColors: ['#10b981', '#34d399'] }
            ]
        },
        options: opcoesEscuras({
            plugins: {
                legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } },
                tooltip: { enabled: false, external: tooltipExternoHandler }
            },
            animation: { duration: 900, easing: 'easeOutQuart', delay: function(ctx) { return ctx.dataIndex * 55; } },
            scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { beginAtZero: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } }
        })
    });

    // Gráfico 2: Área — parcelamentos por mês com glow
    const parcPorMes = agruparPorMes(parceladas, 'valor');
    criarChart('tema-divida-parcelas', {
        type: 'line',
        data: { labels: MESES_LABELS, datasets: [{ label: 'Parcelamentos', data: parcPorMes, borderColor: '#f59e0b', backgroundColor: criarGradiente('tema-divida-parcelas','#f59e0b',0.35,0.02), fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2.5, _glowColor: '#f59e0b', _glowBlur: 10 }] },
        options: opcoesEscuras({
            plugins: { legend: { display: false }, tooltip: { enabled: false, external: tooltipExternoHandler } },
            animation: { duration: 900, easing: 'easeOutQuart' },
            scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { beginAtZero: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } }
        })
    });

    // Gráfico 3: Line — custo acumulado de juros com glow
    const jurosCum = [];
    jurosPorMes.reduce((a,v,i)=>{jurosCum[i]=a+v;return jurosCum[i];},0);
    criarChart('tema-divida-custo', {
        type: 'line',
        data: { labels: MESES_LABELS, datasets: [{ label: 'Juros Acumulados', data: jurosCum, borderColor: '#f43f5e', backgroundColor: criarGradiente('tema-divida-custo','#f43f5e',0.3,0.02), fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2.5, _glowColor: '#f43f5e', _glowBlur: 12 }] },
        options: opcoesEscuras({
            plugins: { legend: { display: false }, tooltip: { enabled: false, external: tooltipExternoHandler } },
            animation: { duration: 900, easing: 'easeOutQuart' },
            scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { beginAtZero: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } }
        })
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

    // Gráfico 1: Intensidade de Gastos — heatmap via barras horizontais com gradiente verde→vermelho
    (function() {
        const maxDesp = Math.max(...despPorMes, 1);
        function interpolarCor(valor, maximo) {
            // verde (#10b981) → amarelo (#f59e0b) → vermelho (#f43f5e)
            const t = Math.min(valor / maximo, 1);
            if (t < 0.5) {
                const f = t * 2;
                return 'rgba(' + Math.round(16 + f * (245 - 16)) + ',' + Math.round(185 + f * (158 - 185)) + ',' + Math.round(129 + f * (11 - 129)) + ',0.85)';
            } else {
                const f = (t - 0.5) * 2;
                return 'rgba(' + Math.round(245 + f * (244 - 245)) + ',' + Math.round(158 + f * (63 - 158)) + ',' + Math.round(11 + f * (94 - 11)) + ',0.85)';
            }
        }
        const coresHeat = despPorMes.map(v => interpolarCor(v, maxDesp));
        criarChart('tema-anual-tendencia', {
            type: 'bar',
            data: {
                labels: MESES_LABELS,
                datasets: [{
                    label: 'Despesas',
                    data: despPorMes,
                    backgroundColor: coresHeat,
                    borderRadius: { topLeft: 0, topRight: 6, bottomLeft: 0, bottomRight: 6 },
                    borderSkipped: false,
                    barThickness: 14
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
                            label: function(ctx) {
                                const v = ctx.parsed.x;
                                const pct = maxDesp > 0 ? ((v / maxDesp) * 100).toFixed(1) : '0';
                                return ' ' + fmtR(v) + ' (' + pct + '% do maior mês)';
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8', font: { size: 10 }, callback: function(v) { return v >= 1000 ? 'R$'+(v/1000).toFixed(0)+'k' : 'R$'+v; } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } },
                    y: { ticks: { color: '#cbd5e1', font: { size: 11 } }, grid: { display: false }, border: { display: false } }
                }
            }
        });
    })();

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
        type: 'line',
        data: {
            labels: MESES_LABELS,
            datasets: [
                {
                    label: filtro.ano.toString(),
                    data: saldoPorMes,
                    borderColor: '#6366f1',
                    backgroundColor: criarGradiente('tema-anual-comparacao', '#6366f1', 0.22, 0.01),
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#6366f1',
                    pointBorderColor: '#0f172a',
                    pointBorderWidth: 2,
                    borderWidth: 2.5,
                    _glowColor: '#6366f1',
                    _glowBlur: 8
                },
                {
                    label: anoAnt.toString(),
                    data: saldoAnt,
                    borderColor: '#94a3b8',
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: '#94a3b8',
                    pointBorderColor: '#0f172a',
                    pointBorderWidth: 2,
                    borderWidth: 2,
                    borderDash: [5, 4]
                }
            ]
        },
        options: opcoesEscuras({
            plugins: {
                legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } },
                tooltip: { enabled: false, external: tooltipExternoHandler }
            },
            animation: { duration: 900, easing: 'easeOutQuart' },
            scales: {
                x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y: { ticks: { color: '#94a3b8', font: { size: 11 }, callback: function(v) { return window.formatarMoedaCompacta ? window.formatarMoedaCompacta(v) : v; } }, grid: { color: 'rgba(255,255,255,0.04)' } }
            }
        })
    });

    // Gráfico 3: Barras horizontais ordenadas — ranking de meses
    const ranking = saldoPorMes.map((v,i)=>({mes:MESES_LABELS[i],val:v})).sort((a,b)=>b.val-a.val);
    const maxAbs = Math.max(...ranking.map(r => Math.abs(r.val)), 1);
    criarChart('tema-anual-ranking', {
        type: 'bar',
        data: {
            labels: ranking.map(r=>r.mes),
            datasets: [{
                label: 'Saldo',
                data: ranking.map(r=>r.val),
                backgroundColor: ranking.map(function(r) {
                    const intensity = Math.abs(r.val) / maxAbs;
                    const alpha = 0.3 + intensity * 0.7;
                    return r.val >= 0
                        ? 'rgba(16, 185, 129, ' + alpha + ')'
                        : 'rgba(244, 63, 94, ' + alpha + ')';
                }),
                borderRadius: 4,
                barThickness: 18
            }]
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

    // Gráfico 1: Peso das Categorias — barras horizontais com valor total anual ordenado por peso
    const porCat = {};
    // Usar todos os anos disponíveis da estrutura dadosFinanceiros para calcular total anual
    const todosAnosAnalise = Object.keys(df).map(Number).filter(Boolean);
    todosAnosAnalise.forEach(function(anoN) {
        const mesesAno = df[anoN]?.meses || [];
        for (let m = 0; m < 12; m++) {
            (mesesAno[m]?.despesas || []).forEach(function(d) {
                const catObj = categorias.find(c => c.id === d.categoria_id);
                const nome = catObj ? catObj.nome : (d.categoria || 'Outros');
                const valor = window.obterValorRealDespesa ? window.obterValorRealDespesa(d) : parseFloat(d.valor || 0);
                if (!isNaN(valor) && valor > 0) porCat[nome] = (porCat[nome] || 0) + valor;
            });
        }
    });
    const catArrPeso = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
    const totalAnualPeso = catArrPeso.reduce((s, [, v]) => s + v, 0);
    const maxPeso = catArrPeso.length > 0 ? catArrPeso[0][1] : 1;
    criarChart('tema-analise-media', {
        type: 'bar',
        data: {
            labels: catArrPeso.map(([n]) => n),
            datasets: [{
                label: 'Total Anual',
                data: catArrPeso.map(([, v]) => v),
                backgroundColor: catArrPeso.map((_, i) => CORES[i % CORES.length]),
                borderRadius: { topLeft: 0, topRight: 6, bottomLeft: 0, bottomRight: 6 },
                borderSkipped: false,
                barPercentage: 0.9
            }]
        },
        options: Object.assign({}, opcoesBarraH(), {
            animation: { duration: 900, easing: 'easeOutQuart', delay: function(ctx) { return ctx.dataIndex * 40; } },
            plugins: Object.assign({}, opcoesBarraH().plugins, {
                tooltip: {
                    enabled: false,
                    external: function(context) {
                        const el = criarOuObterTooltipEl();
                        const { chart, tooltip } = context;
                        if (tooltip.opacity === 0) { el.style.opacity = '0'; return; }
                        const pos = chart.canvas.getBoundingClientRect();
                        el.style.left = (pos.left + window.scrollX + tooltip.caretX + 14) + 'px';
                        el.style.top  = (pos.top  + window.scrollY + tooltip.caretY - 10) + 'px';
                        el.style.opacity = '1';
                        const title = tooltip.title?.[0] || '';
                        const lines = tooltip.body?.map(b => b.lines).flat() || [];
                        const colors = tooltip.labelColors || [];
                        let html = title ? '<div style="font-weight:700;margin-bottom:7px;color:#a5b4fc;font-size:11px;text-transform:uppercase;letter-spacing:0.6px">' + title + '</div>' : '';
                        lines.forEach(function(line, i) {
                            const v = tooltip.dataPoints?.[i]?.parsed?.x || 0;
                            const pct = totalAnualPeso > 0 ? ((v / totalAnualPeso) * 100).toFixed(1) : '0';
                            const dotBg = colors[i]?.backgroundColor || '#6366f1';
                            html += '<div style="display:flex;gap:7px;align-items:center;padding:2px 0"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + dotBg + ';flex-shrink:0"></span><span>' + fmtR(v) + ' <span style="color:#94a3b8;font-size:10px">(' + pct + '%)</span></span></div>';
                        });
                        el.innerHTML = html;
                    }
                }
            })
        })
    });

    // Gráfico 2: Barras empilhadas — todas as categorias por mês (sem legenda)
    const datasetsEmpilhado = catArrPeso.map(([nome],i)=>{
        const porMes = new Array(12).fill(0);
        despesas.forEach(function(d){
            const catObj = categorias.find(c=>c.id===d.categoria_id);
            const catNome = catObj?catObj.nome:(d.categoria||'Outros');
            if(catNome===nome&&d.mes>=0&&d.mes<=11) porMes[d.mes]+=parseFloat(d.valor||0);
        });
        return { label: nome, data: porMes, backgroundColor: CORES[i%CORES.length], stack: 'stack', borderRadius: 2 };
    });
    // Filtra apenas meses com dados reais
    const mesesComMovimento = MESES_LABELS.map((l,i)=>({l,i})).filter(({i})=>datasetsEmpilhado.some(d=>d.data[i]>0));
    const labelsEmpilhado = mesesComMovimento.map(m=>m.l);
    const datasetsEmpilhadoFiltrado = datasetsEmpilhado.map(d=>({...d, data: mesesComMovimento.map(m=>d.data[m.i])}));
    criarChart('tema-analise-mensal', {
        type: 'bar',
        data: { labels: labelsEmpilhado, datasets: datasetsEmpilhadoFiltrado },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: function(ctx) { return ' ' + ctx.dataset.label + ': R$ ' + parseFloat(ctx.parsed.y||0).toLocaleString('pt-BR',{minimumFractionDigits:2}); } } }
            },
            scales: {
                x: { stacked: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } },
                y: { stacked: true, ticks: { color: '#94a3b8', font: { size: 10 }, callback: function(v){ return v>=1000?'R$'+(v/1000).toFixed(0)+'k':'R$'+v; } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } }
            }
        }
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
                { label: 'Receitas', data: recAnos, backgroundColor: '#10b981', borderRadius: 4, _gradColors: ['#10b981', '#34d399'] },
                { label: 'Despesas', data: despAnos, backgroundColor: '#f43f5e', borderRadius: 4, _gradColors: ['#f43f5e', '#fb7185'] }
            ]
        },
        options: opcoesEscuras({
            plugins: {
                legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } },
                tooltip: { enabled: false, external: tooltipExternoHandler }
            },
            animation: { duration: 900, easing: 'easeOutQuart', delay: function(ctx) { return ctx.dataIndex * 80; } },
            scales: { x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { beginAtZero: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } } }
        })
    });
}

// ── TEMA: METAS / OBJETIVOS ──────────────────────────────────────
async function renderizarTemaMetas() {
    // KPI placeholders enquanto carrega
    const elTotal  = document.getElementById('tk-metas-total');
    const elProx   = document.getElementById('tk-metas-proximo');
    const elMedia  = document.getElementById('tk-metas-media');
    if (elTotal)  elTotal.textContent  = '…';
    if (elProx)   elProx.textContent   = '…';
    if (elMedia)  elMedia.textContent  = '…';

    // Garantir que o cache de reservas está carregado
    if ((!window.reservasCache || window.reservasCache.length === 0) && typeof window.carregarReservasAPI === 'function') {
        try { await window.carregarReservasAPI(); } catch(e) {}
    }

    const calcValorAtual = function(reservaId) {
        const movs = window.movimentacoesReservasCache || [];
        return movs.filter(m => m.reserva_id === reservaId)
            .reduce((acc, m) => m.tipo === 'entrada' ? acc + parseFloat(m.valor) : acc - parseFloat(m.valor), 0);
    };

    const todasReservas = (window.reservasCache || []);
    const reservasSimples = todasReservas.filter(r => r.tipo_reserva !== 'objetivo');
    let objetivos = todasReservas
        .filter(r => r.tipo_reserva === 'objetivo' && parseFloat(r.objetivo_valor) > 0)
        .map(r => {
            const valorAtual = calcValorAtual(r.id) || parseFloat(r.valor) || 0;
            const progresso = parseFloat(r.objetivo_valor) > 0
                ? Math.min((valorAtual / parseFloat(r.objetivo_valor)) * 100, 100)
                : 0;
            return { ...r, valorAtual, progresso: parseFloat(progresso.toFixed(1)) };
        });

    const ativos = objetivos.filter(o => !o.objetivo_atingido);

    // ── KPIs atualizados ────────────────────────────────────────
    if (elTotal) {
        const nObj = ativos.length;
        const nRes = reservasSimples.length;
        elTotal.innerHTML = nObj + ' obj' + (nObj !== 1 ? 's' : '') + ' + ' + nRes + ' res.';
        elTotal.style.color = '#6366f1';
    }
    if (elProx) {
        if (ativos.length > 0) {
            const maisProximo = [...ativos].sort((a, b) => parseFloat(b.progresso || 0) - parseFloat(a.progresso || 0))[0];
            const prog = parseFloat(maisProximo.progresso || 0);
            elProx.innerHTML = (maisProximo.observacoes || 'Meta') + '<br><small style="font-size:11px;font-weight:400;color:#94a3b8">' + prog.toFixed(1) + '%</small>';
            elProx.style.color = prog >= 75 ? '#10b981' : prog >= 40 ? '#f59e0b' : '#f43f5e';
        } else {
            elProx.textContent = '--';
            elProx.style.color = '#94a3b8';
        }
    }
    if (elMedia) {
        // Média de progresso dos objetivos ativos
        if (ativos.length > 0) {
            const mediaProgresso = ativos.reduce((s, o) => s + parseFloat(o.progresso || 0), 0) / ativos.length;
            elMedia.textContent = mediaProgresso.toFixed(1) + '% concluído (média)';
        } else {
            const nRes = reservasSimples.length;
            elMedia.textContent = nRes + ' reserva' + (nRes !== 1 ? 's' : '') + ' ativa' + (nRes !== 1 ? 's' : '');
        }
        elMedia.style.color = '#10b981';
    }

    // Usa overlay em vez de substituir innerHTML (preserva os <canvas>)
    const setEmptyOverlay = function(canvasId, show, msg) {
        const el = document.getElementById(canvasId);
        if (!el) return;
        const card = el.closest('.tema-chart-card');
        if (!card) return;
        let overlay = card.querySelector('.obj-sem-dados-overlay');
        if (show) {
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'obj-sem-dados obj-sem-dados-overlay';
                overlay.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:2;background:inherit;border-radius:inherit';
                overlay.innerHTML = '<i class="fas fa-bullseye" style="font-size:2rem;opacity:0.3;margin-bottom:8px"></i><p style="margin:0;font-size:13px;text-align:center">' + (msg || 'Nenhum dado disponível.') + '</p>';
                card.style.position = 'relative';
                card.appendChild(overlay);
            }
            el.style.display = 'none';
        } else {
            if (overlay) overlay.remove();
            el.style.display = '';
        }
    };

    // ── Gráfico 1: Liquid Fill — Progresso por Objetivo ──────────
    (function() {
        const canvas = document.getElementById('tema-metas-progresso');
        if (!canvas) return;

        // Cancelar animação anterior se existir
        if (window._liquidFillAnimFrame) {
            cancelAnimationFrame(window._liquidFillAnimFrame);
            window._liquidFillAnimFrame = null;
        }

        if (ativos.length === 0) {
            setEmptyOverlay('tema-metas-progresso', true, 'Nenhum objetivo cadastrado.<br>Crie em <strong>Metas ↗</strong>');
            return;
        }
        setEmptyOverlay('tema-metas-progresso', false);

        const card = canvas.closest('.tema-chart-card');
        if (!card) return;

        // Remover container antigo se existir
        const antigo = card.querySelector('.liquid-fill-container');
        if (antigo) antigo.remove();
        canvas.style.display = 'none';

        // Criar container de liquid fills
        const container = document.createElement('div');
        container.className = 'liquid-fill-container';
        card.appendChild(container);

        // Garantir position relative no card
        card.style.position = 'relative';

        const corPorPct = function(p) {
            if (p >= 75) return '#10b981';
            if (p >= 40) return '#f59e0b';
            return '#f43f5e';
        };

        // Criar um canvas liquid fill por objetivo (máximo 6 para não poluir)
        const objetivosExibir = ativos.slice(0, 6);
        const canvases = [];

        objetivosExibir.forEach(function(obj, idx) {
            const item = document.createElement('div');
            item.className = 'liquid-fill-item';

            const c = document.createElement('canvas');
            c.width = 160;
            c.height = 160;
            c.className = 'liquid-fill-canvas';
            item.appendChild(c);

            const lbl = document.createElement('div');
            lbl.className = 'liquid-fill-label';
            lbl.textContent = obj.observacoes || ('Objetivo ' + obj.id);
            item.appendChild(lbl);

            const sub = document.createElement('div');
            sub.className = 'liquid-fill-sub';
            sub.textContent = obj.progresso.toFixed(1) + '% de ' + fmtR(obj.objetivo_valor);
            item.appendChild(sub);

            container.appendChild(item);
            canvases.push({ canvas: c, pct: obj.progresso, cor: corPorPct(obj.progresso), label: obj.observacoes || ('Obj ' + (idx+1)) });
        });

        // Fases independentes por canvas
        const fases = canvases.map(() => Math.random() * Math.PI * 2);

        function frame() {
            canvases.forEach(function(item, i) {
                fases[i] += 0.04;
                const ctx = item.canvas.getContext('2d');
                const W = item.canvas.width;
                const H = item.canvas.height;
                const cx = W / 2, cy = H / 2;
                const r = Math.min(W, H) * 0.42;
                const pct = Math.max(0, Math.min(100, item.pct));

                ctx.clearRect(0, 0, W, H);

                // Fundo do círculo (track)
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(148,163,184,0.10)';
                ctx.fill();

                const fillY = cy + r - (pct / 100) * 2 * r;
                const amplitude = 6 * (1 - pct / 100);

                // Clip ao círculo
                ctx.save();
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.clip();

                // Onda traseira (mais clara)
                ctx.beginPath();
                ctx.moveTo(cx - r, fillY + amplitude);
                for (let x = cx - r; x <= cx + r; x++) {
                    const wave = Math.sin((x - cx) * 0.05 + fases[i] - 0.8) * amplitude;
                    ctx.lineTo(x, fillY + wave + amplitude * 0.4);
                }
                ctx.lineTo(cx + r, H);
                ctx.lineTo(cx - r, H);
                ctx.closePath();
                ctx.fillStyle = item.cor + '55';
                ctx.fill();

                // Onda frontal (mais intensa)
                ctx.beginPath();
                ctx.moveTo(cx - r, fillY);
                for (let x = cx - r; x <= cx + r; x++) {
                    const wave = Math.sin((x - cx) * 0.05 + fases[i]) * amplitude;
                    ctx.lineTo(x, fillY + wave);
                }
                ctx.lineTo(cx + r, H);
                ctx.lineTo(cx - r, H);
                ctx.closePath();
                ctx.fillStyle = item.cor + 'CC';
                ctx.fill();

                ctx.restore();

                // Borda do círculo
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.strokeStyle = item.cor;
                ctx.lineWidth = 2.5;
                ctx.stroke();

                // Texto %
                ctx.fillStyle = pct > 52 ? '#fff' : item.cor;
                ctx.font = 'bold ' + Math.round(r * 0.38) + 'px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(Math.round(pct) + '%', cx, cy);
            });

            window._liquidFillAnimFrame = requestAnimationFrame(frame);
        }
        frame();
    })();

    // ── Gráfico 2: Evolução real das reservas no tempo ────────────
    (function() {
        const movs = window.movimentacoesReservasCache || [];

        if (movs.length === 0) {
            setEmptyOverlay('tema-metas-projecao', true, 'Sem movimentações de reservas registradas.');
            return;
        }
        setEmptyOverlay('tema-metas-projecao', false);

        // Agrupar movimentações por mês/ano, calcular saldo acumulado
        const porMes = {};
        movs.forEach(function(m) {
            const d = new Date(m.data_hora || m.created_at || Date.now());
            if (isNaN(d.getTime())) return;
            // Chave sortável: YYYY-MM
            const chave = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
            const val = parseFloat(m.valor || 0);
            porMes[chave] = (porMes[chave] || 0) + (m.tipo === 'entrada' ? val : -val);
        });

        // Ordenar meses
        const chavesOrdenadas = Object.keys(porMes).sort();

        // Calcular acumulado
        let acum = 0;
        const labelsEvo = [];
        const valoresAcum = [];
        const variacoes = [];

        chavesOrdenadas.forEach(function(chave) {
            const anterior = acum;
            acum += porMes[chave];
            const partes = chave.split('-');
            const ano = parseInt(partes[0]);
            const mes = parseInt(partes[1]) - 1;
            const nomesMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
            labelsEvo.push(nomesMes[mes] + '/' + String(ano).slice(-2));
            valoresAcum.push(Math.max(0, acum));
            variacoes.push(porMes[chave]);
        });

        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        const canvasEl = document.getElementById('tema-metas-projecao');
        if (!canvasEl) return;
        const ctx2 = canvasEl.getContext('2d');
        const gradVerde = ctx2.createLinearGradient(0, 0, 0, 260);
        gradVerde.addColorStop(0, 'rgba(16,185,129,0.35)');
        gradVerde.addColorStop(1, 'rgba(16,185,129,0.02)');

        criarChart('tema-metas-projecao', {
            type: 'line',
            data: {
                labels: labelsEvo,
                datasets: [{
                    label: 'Total acumulado',
                    data: valoresAcum,
                    borderColor: '#10b981',
                    backgroundColor: gradVerde,
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.4,
                    pointRadius: labelsEvo.length <= 12 ? 4 : 2,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#10b981',
                    pointBorderColor: isDark ? '#1e293b' : '#fff',
                    pointBorderWidth: 2,
                    _glowColor: '#10b981',
                    _glowBlur: 12
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 700 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: function(items) { return labelsEvo[items[0].dataIndex]; },
                            label: function(ctx) {
                                const i = ctx.dataIndex;
                                const var_ = variacoes[i];
                                const linhas = ['  Total: ' + fmtR(valoresAcum[i])];
                                if (var_ >= 0) {
                                    linhas.push('  Entrada: +' + fmtR(var_));
                                } else {
                                    linhas.push('  Saída: ' + fmtR(var_));
                                }
                                return linhas;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#94a3b8',
                            font: { size: 10 },
                            maxRotation: 45,
                            maxTicksLimit: 12
                        },
                        grid: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' }
                    },
                    y: {
                        ticks: {
                            color: '#94a3b8',
                            font: { size: 10 },
                            callback: function(v) {
                                if (v >= 1000000) return 'R$' + (v / 1000000).toFixed(1) + 'M';
                                if (v >= 1000) return 'R$' + (v / 1000).toFixed(0) + 'k';
                                return 'R$' + v.toFixed(0);
                            }
                        },
                        grid: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' }
                    }
                }
            }
        });
    })();

    // ── Gráfico 3: Distribuição entre todas as reservas (pizza) ───
    (function() {
        const todasComValor = todasReservas.map(function(r) {
            const val = Math.max(0, calcValorAtual(r.id) || parseFloat(r.valor) || 0);
            return { ...r, valorAtual: val };
        }).filter(r => r.valorAtual > 0);

        if (todasComValor.length === 0) {
            setEmptyOverlay('tema-metas-historico', true, 'Nenhuma reserva com saldo positivo.');
            return;
        }
        setEmptyOverlay('tema-metas-historico', false);

        const totalGeral = todasComValor.reduce((s, r) => s + r.valorAtual, 0);

        const labelsHist = todasComValor.map(r => r.observacoes || ('Reserva ' + r.id));

        // Cores: objetivos em paleta indigo/roxo, reservas simples em azul/ciano
        const CORES_OBJ = ['#6366f1','#8b5cf6','#a855f7','#c084fc','#e879f9','#d946ef'];
        const CORES_RES = ['#06b6d4','#0ea5e9','#3b82f6','#38bdf8','#7dd3fc','#60a5fa'];
        let idxObj = 0, idxRes = 0;
        const coresDist = todasComValor.map(function(r) {
            if (r.tipo_reserva === 'objetivo') return CORES_OBJ[idxObj++ % CORES_OBJ.length];
            return CORES_RES[idxRes++ % CORES_RES.length];
        });

        const labelsLegenda = todasComValor.map(function(r, i) {
            const pct = totalGeral > 0 ? ((r.valorAtual / totalGeral) * 100).toFixed(1) : '0.0';
            return labelsHist[i] + ' (' + pct + '%)';
        });

        criarChart('tema-metas-historico', {
            type: 'pie',
            data: {
                labels: labelsLegenda,
                datasets: [{
                    data: todasComValor.map(r => r.valorAtual),
                    backgroundColor: coresDist,
                    borderColor: 'transparent',
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                radius: '75%',
                animation: { animateRotate: true, animateScale: true, duration: 700 },
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12, padding: 10 }
                    },
                    tooltip: {
                        callbacks: {
                            title: function(items) { return labelsHist[items[0].dataIndex]; },
                            label: function(ctx) {
                                const i = ctx.dataIndex;
                                const r = todasComValor[i];
                                const pct = totalGeral > 0 ? ((r.valorAtual / totalGeral) * 100).toFixed(1) : '0.0';
                                const tipo = r.tipo_reserva === 'objetivo' ? 'Objetivo' : 'Reserva';
                                const linhas = [
                                    '  Tipo: ' + tipo,
                                    '  % do total: ' + pct + '%'
                                ];
                                if (r.tipo_reserva === 'objetivo' && r.objetivo_valor) {
                                    const progObj = parseFloat(r.objetivo_valor) > 0
                                        ? ((r.valorAtual / parseFloat(r.objetivo_valor)) * 100).toFixed(1) : '0.0';
                                    linhas.push('  Progresso: ' + progObj + '% da meta');
                                }
                                return linhas;
                            }
                        }
                    }
                }
            }
        });
    })();

    // ── Gráfico 4: Projeção de Crescimento baseada na média real ──
    (async function() {
        // 1. Calcular média mensal líquida (entradas − saídas por mês)
        const movs = window.movimentacoesReservasCache || [];
        let mediaReal = 0;
        if (movs.length > 0) {
            const porMes = {};
            movs.forEach(function(m) {
                const d = new Date(m.data_hora || m.created_at || Date.now());
                const chave = `${d.getFullYear()}-${String(d.getMonth()).padStart(2,'0')}`;
                const val = parseFloat(m.valor || 0);
                porMes[chave] = (porMes[chave] || 0) + (m.tipo === 'entrada' ? val : -val);
            });
            // Considerar apenas meses com saldo líquido positivo para a projeção
            const mesesPositivos = Object.values(porMes).filter(v => v > 0);
            if (mesesPositivos.length > 0) {
                mediaReal = mesesPositivos.reduce((s, v) => s + v, 0) / mesesPositivos.length;
            }
        }

        // Atualizar badge e input oculto com a média
        const mediaBadge = document.getElementById('proj-media-badge');
        const projAporte = document.getElementById('proj-aporte');
        const fmt = window.formatarMoeda || (v => 'R$ ' + parseFloat(v).toLocaleString('pt-BR', {minimumFractionDigits:2}));
        if (mediaBadge) mediaBadge.textContent = mediaReal > 0 ? fmt(mediaReal) + '/mês' : 'Sem histórico';
        if (projAporte) projAporte.value = mediaReal > 0 ? mediaReal.toFixed(2) : 500;

        // 2. Buscar Selic da API (informativo)
        try {
            const token = sessionStorage.getItem('token') || localStorage.getItem('token');
            const baseUrl = window.API_URL || '';
            const resp = await fetch(`${baseUrl}/financeiro/selic`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            if (resp.ok) {
                const data = await resp.json();
                const inputTaxa = document.getElementById('proj-taxa');
                const badge = document.getElementById('proj-taxa-label');
                if (inputTaxa && data.taxa_mensal) {
                    inputTaxa.value = data.taxa_mensal.toFixed(2);
                }
                if (badge && data.taxa_anual) {
                    badge.textContent = `${data.taxa_anual.toFixed(2)}% a.a.`;
                }
            }
        } catch(e) {
            const badge = document.getElementById('proj-taxa-label');
            if (badge) badge.textContent = '14,75% a.a.';
        }

        window.simularProjecao();
    })();
}

// ── Função global: simularProjecao ───────────────────────────────
window.simularProjecao = function simularProjecao() {
    const aporte = parseFloat(document.getElementById('proj-aporte')?.value) || 0;
    if (aporte <= 0) return;
    const slider = document.getElementById('proj-anos');
    const anos   = parseInt(slider?.value) || 10;
    const taxa   = parseFloat(document.getElementById('proj-taxa')?.value)  || 1.17;

    // Atualizar gradiente do slider dinamicamente
    if (slider) {
        const pct = ((anos - 1) / 49 * 100).toFixed(1) + '%';
        slider.style.setProperty('--prog', pct);
    }

    const totalMeses = anos * 12;
    const semJuros      = [];
    const comSelic      = [];
    const comSelicMais2 = [];

    // taxa+2% ao ano → em mensal: adicionar 2/12 pontos percentuais
    const taxaPlus = taxa + (2 / 12);

    let acumSelic = 0;
    let acumPlus  = 0;

    for (let i = 0; i < totalMeses; i++) {
        semJuros.push(aporte * (i + 1));
        acumSelic = acumSelic * (1 + taxa / 100) + aporte;
        acumPlus  = acumPlus  * (1 + taxaPlus / 100) + aporte;
        comSelic.push(acumSelic);
        comSelicMais2.push(acumPlus);
    }

    // Labels: apenas o rótulo do mês de janeiro de cada ano (Jan/26, Jan/27…)
    const hoje = new Date();
    const anoBase = hoje.getFullYear();
    const mesBase = hoje.getMonth(); // 0-based
    const labels = [];
    for (let i = 0; i < totalMeses; i++) {
        const m = (mesBase + i) % 12;
        const a = anoBase + Math.floor((mesBase + i) / 12);
        if (m === 0 || i === 0) {
            labels.push(`Jan/${String(a).slice(-2)}`);
        } else {
            labels.push('');
        }
    }

    // Formatar eixo Y de forma legível
    function fmtYAxis(v) {
        if (v >= 1_000_000) return 'R$ ' + (v / 1_000_000).toFixed(1).replace('.', ',') + 'M';
        if (v >= 1_000)     return 'R$ ' + (v / 1_000).toFixed(0) + 'k';
        return 'R$ ' + v.toFixed(0);
    }

    // Destruir chart anterior se existir
    if (window.chartProjecaoCrescimento) {
        window.chartProjecaoCrescimento.destroy();
        window.chartProjecaoCrescimento = null;
    }

    const canvas = document.getElementById('tema-metas-crescimento');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Gradientes
    const gradCinza  = ctx.createLinearGradient(0, 0, 0, 260);
    gradCinza.addColorStop(0, 'rgba(148,163,184,0.25)');
    gradCinza.addColorStop(1, 'rgba(148,163,184,0.02)');

    const gradVerde  = ctx.createLinearGradient(0, 0, 0, 260);
    gradVerde.addColorStop(0, 'rgba(16,185,129,0.25)');
    gradVerde.addColorStop(1, 'rgba(16,185,129,0.02)');

    const gradAzul   = ctx.createLinearGradient(0, 0, 0, 260);
    gradAzul.addColorStop(0, 'rgba(99,102,241,0.25)');
    gradAzul.addColorStop(1, 'rgba(99,102,241,0.02)');

    window.chartProjecaoCrescimento = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Sem rendimento',
                    data: semJuros,
                    borderColor: '#94a3b8',
                    backgroundColor: gradCinza,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 4
                },
                {
                    label: 'Com Selic',
                    data: comSelic,
                    borderColor: '#10b981',
                    backgroundColor: gradVerde,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 4
                },
                {
                    label: 'Com Selic+2%',
                    data: comSelicMais2,
                    borderColor: '#6366f1',
                    backgroundColor: gradAzul,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 }
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const v = ctx.parsed.y;
                            const fmt = v >= 1_000_000
                                ? 'R$ ' + (v / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'M'
                                : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                            return ` ${ctx.dataset.label}: ${fmt}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#94a3b8',
                        font: { size: 10 },
                        maxRotation: 0,
                        autoSkip: false
                    },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                },
                y: {
                    ticks: {
                        color: '#94a3b8',
                        font: { size: 10 },
                        callback: function(v) { return fmtYAxis(v); }
                    },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                }
            }
        }
    });
};

// Inicializa o dashboard temático junto ao evento sistemaFinanceiroReady
window.addEventListener('sistemaFinanceiroReady', function() {
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection) {
        inicializarDashboardTematico();
    }
});

window.inicializarDashboardTematico = inicializarDashboardTematico;
window.atualizarDashboardTematico = atualizarDashboardTematico;