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
}



// ================================================================
// FUNÇÃO MAXIMIZAR
// ================================================================


let graficoZoomInstance = null;

document.addEventListener('click', function(e) {
    if (e.target.classList.contains('btn-expandir')) {
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

function carregarDadosDashboard(ano) {
    if (!window.dadosFinanceiros[ano]) {
        return;
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
    
    let totalReceitas = 0;
    let totalDespesas = 0;
    let totalJuros = 0;
    let totalEconomias = 0;
    
    for (let i = 0; i < 12; i++) {
        const dadosMes = dadosFinanceiros[ano]?.meses[i] || { receitas: [], despesas: [] };
        
        const saldoInfo = window.calcularSaldoMes ? window.calcularSaldoMes(i, ano) : 
                         { receitas: 0, despesas: 0, saldoFinal: 0 };
        
        const receitasMes = saldoInfo.receitas || 0;
        const despesasMes = window.calcularTotalDespesas ? window.calcularTotalDespesas(dadosMes.despesas || []) : 0;
        const jurosMes = window.calcularTotalJuros ? window.calcularTotalJuros(dadosMes.despesas || []) : 0;
        const economiasMes = window.calcularTotalEconomias ? window.calcularTotalEconomias(dadosMes.despesas || []) : 0;
        
        totalReceitas += receitasMes;
        totalDespesas += despesasMes;
        totalJuros += jurosMes;
        totalEconomias += economiasMes;
        
        dadosMensais.receitas.push(receitasMes);
        dadosMensais.despesas.push(despesasMes);
        dadosMensais.saldos.push(saldoInfo.saldoFinal || 0);
    }
    
    const resumoAnual = {
        receitas: totalReceitas,
        despesas: totalDespesas,
        saldo: totalReceitas - totalDespesas,
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
// GRÁFICO 1: BALANÇO MENSAL (SEM FILTROS)
// ================================================================

function criarGraficoBalanco(dados) {
    const ctx = document.getElementById('balanco-chart')?.getContext('2d');
    if (!ctx) return;
    
    if (window.balancoChart) {
        window.balancoChart.destroy();
    }
    
    const balancoMensal = [];
    const reservasAcumuladas = [];
    
    let totalReservasAcumulado = 0;
    
    for (const anoKey in window.dadosFinanceiros) {
        if (anoKey === 'versao') continue;
        const ano = parseInt(anoKey);
        
        if (ano < window.anoAtual) {
            const dadosAno = window.dadosFinanceiros[anoKey];
            if (!dadosAno || !dadosAno.meses) continue;
            
            for (let m = 0; m < 12; m++) {
                const reservas = dadosAno.meses[m]?.reservas || [];
                totalReservasAcumulado += reservas.reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
            }
        }
    }
    
    for (let i = 0; i < dados.receitas.length; i++) {
        const dadosMes = window.dadosFinanceiros[window.anoAtual]?.meses[i];
        const reservasMes = (dadosMes?.reservas || []).reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
        
        totalReservasAcumulado += reservasMes;
        
        const variacao = dados.receitas[i] - dados.despesas[i] - reservasMes;
        balancoMensal.push(variacao);
        reservasAcumuladas.push(totalReservasAcumulado);
    }
    
    const datasets = [
        {
            label: 'Saldo em Conta',
            data: dados.saldos,
            backgroundColor: 'rgba(0, 123, 255, 0.1)',
            borderColor: 'rgb(0, 123, 255)',
            fill: true,
            tension: 0.4,
            order: 2
        },
        {
            label: 'Balanço Mensal',
            data: balancoMensal,
            backgroundColor: 'rgba(40, 167, 69, 0.1)',
            borderColor: 'rgb(40, 167, 69)',
            fill: true,
            tension: 0.4,
            order: 1
        }
    ];
    
    if (window.mostrarReservas !== false) {
        datasets.push({
            label: 'Reservas Acumuladas',
            data: reservasAcumuladas,
            backgroundColor: 'rgba(147, 51, 234, 0.1)',
            borderColor: 'rgb(147, 51, 234)',
            fill: true,
            tension: 0.4,
            order: 3,
            hidden: true
        });
    }
    
    window.balancoChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dados.labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    ticks: {
                        callback: function(value) {
                            return window.formatarMoeda(value);
                        }
                    }
                }
            },
            plugins: {
                legend: { 
                    display: true,
                    position: 'top',
                    onClick: function(e, legendItem) {
                        const index = legendItem.datasetIndex;
                        const chart = this.chart;
                        const isVisible = chart.isDatasetVisible(index);
                        chart.setDatasetVisibility(index, !isVisible);
                        chart.update();
                    }
                },
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
        let totalReceitasReais = 0;
        let totalDespesas = 0;
        
        if (dadosFinanceiros[ano]) {
            for (let i = 0; i < 12; i++) {
                const dadosMes = dadosFinanceiros[ano].meses[i];
                if (!dadosMes) continue;
                
                const despesasFiltradas = aplicarFiltrosDespesas(dadosMes.despesas || [], filtros);
                
                const receitasReaisMes = (dadosMes.receitas || []).reduce((sum, r) => {
                    if (r.saldoAnterior === true || 
                        r.descricao?.includes('Saldo Anterior') ||
                        r.automatica === true) {
                        return sum;
                    }
                    return sum + (r.valor || 0);
                }, 0);
                
                totalReceitasReais += receitasReaisMes;
                totalDespesas += window.calcularTotalDespesas ? 
                                window.calcularTotalDespesas(despesasFiltradas) : 0;
            }
        }
        
        dadosReceitas.push(totalReceitasReais);
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
            let jurosValor = 0;
            
            if (despesa.quitacaoAntecipada === true || despesa.quitadaAntecipadamente === true) {
                jurosValor = 0;
            }
            else if (despesa.valorPago !== null && despesa.valorPago !== undefined && 
                     despesa.valorPago > despesa.valor) {
                jurosValor = despesa.valorPago - despesa.valor;
            }
            else if (despesa.metadados && despesa.metadados.jurosPorParcela) {
                jurosValor = despesa.metadados.jurosPorParcela;
            }
            else if (despesa.valorOriginal && despesa.valor > despesa.valorOriginal) {
                jurosValor = despesa.valor - despesa.valorOriginal;
            }
            
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
    
    const formasPagamento = { pix: 0, debito: 0, credito: 0 };
    
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
    
    const valores = [formasPagamento.pix, formasPagamento.debito, formasPagamento.credito];
    
    if (window.formaPagamentoChart) {
        window.formaPagamentoChart.destroy();
    }
    
    if (valores.some(v => v > 0)) {
        window.formaPagamentoChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['PIX', 'Débito', 'Crédito'],
                datasets: [{
                    data: valores,
                    backgroundColor: [
                        'rgba(0, 212, 170, 0.7)',
                        'rgba(59, 130, 246, 0.7)',
                        'rgba(245, 158, 11, 0.7)'
                    ],
                    borderColor: [
                        'rgb(0, 212, 170)',
                        'rgb(59, 130, 246)',
                        'rgb(245, 158, 11)'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
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