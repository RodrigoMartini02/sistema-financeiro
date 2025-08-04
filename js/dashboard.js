const CONFIG = {
    CORES_DISPONIVEIS: [
        'rgba(255, 99, 132, 0.7)', 'rgba(54, 162, 235, 0.7)', 'rgba(255, 206, 86, 0.7)',
        'rgba(75, 192, 192, 0.7)', 'rgba(153, 102, 255, 0.7)', 'rgba(255, 159, 64, 0.7)',
        'rgba(220, 53, 69, 0.7)', 'rgba(83, 102, 255, 0.7)', 'rgba(199, 199, 199, 0.7)',
        'rgba(50, 205, 50, 0.7)', 'rgba(255, 20, 147, 0.7)', 'rgba(0, 191, 255, 0.7)',
        'rgba(255, 140, 0, 0.7)', 'rgba(138, 43, 226, 0.7)', 'rgba(34, 139, 34, 0.7)',
        'rgba(220, 20, 60, 0.7)', 'rgba(65, 105, 225, 0.7)', 'rgba(72, 209, 204, 0.7)',
        'rgba(255, 69, 0, 0.7)', 'rgba(72, 61, 139, 0.7)', 'rgba(205, 92, 92, 0.7)',
        'rgba(60, 179, 113, 0.7)', 'rgba(123, 104, 238, 0.7)', 'rgba(250, 128, 114, 0.7)',
        'rgba(147, 112, 219, 0.7)', 'rgba(64, 224, 208, 0.7)', 'rgba(218, 165, 32, 0.7)',
        'rgba(176, 196, 222, 0.7)', 'rgba(221, 160, 221, 0.7)', 'rgba(240, 230, 140, 0.7)',
        'rgba(255, 182, 193, 0.7)', 'rgba(173, 216, 230, 0.7)', 'rgba(152, 251, 152, 0.7)'
    ],
    
    CORES_FORMA_PAGAMENTO: {
        pix: 'rgba(22, 160, 133, 0.7)',
        debito: 'rgba(52, 152, 219, 0.7)',
        credito: 'rgba(231, 76, 60, 0.7)'
    },
    
    NOMES_MESES: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
    
    GRAFICOS: [
        'receitasDespesasChart', 'saldoChart', 'parcelamentosJurosChart',
        'categoriasBarrasChart', 'topCategoriasChart', 'tendenciaChart', 
        'formaPagamentoMensalChart', 'crescimentoCategoriaChart'
    ]
};

class GerenciadorFiltros {
    constructor() {
        this.filtros = {
            categorias: 'todas',
            formaPagamento: 'todas',
            categoriasFormaPagamento: 'todas',
            parcelamentosJuros: 'todas',
            crescimentoCategoria: 'todas',
            crescimentoCategoriaEspecifica: ''
        };
        this.carregarFiltrosPersistidos();
    }
    
    get(tipo) {
        return this.filtros[tipo];
    }
    
    set(tipo, valor) {
        this.filtros[tipo] = valor;
        this.salvarFiltros();
    }
    
    resetar() {
        Object.keys(this.filtros).forEach(key => {
            this.filtros[key] = key.includes('Especifica') ? '' : 'todas';
        });
        this.atualizarInterface();
        this.salvarFiltros();
    }
    
    atualizarInterface() {
        document.querySelectorAll('input[id$="-todas"]').forEach(cb => cb && (cb.checked = true));
        document.querySelectorAll('input[id*="-pix"], input[id*="-debito"], input[id*="-credito"]').forEach(cb => cb && (cb.checked = false));
        document.querySelectorAll('select[id*="categoria"], select[id*="parcelamentos"]').forEach(select => select && (select.value = ''));
        document.querySelectorAll('[id^="status-"]').forEach(status => status && (status.textContent = 'Exibindo: Todas'));
    }
    
    salvarFiltros() {
        try {
            localStorage.setItem('dashboardFiltros', JSON.stringify(this.filtros));
        } catch (error) {
            console.warn('Erro ao salvar filtros:', error);
        }
    }
    
    carregarFiltrosPersistidos() {
        try {
            const filtrosSalvos = localStorage.getItem('dashboardFiltros');
            if (filtrosSalvos) {
                this.filtros = { ...this.filtros, ...JSON.parse(filtrosSalvos) };
            }
        } catch (error) {
            console.warn('Erro ao carregar filtros:', error);
        }
    }
}

const filtros = new GerenciadorFiltros();

class GerenciadorCores {
    static carregarSalvas() {
        try {
            const cores = localStorage.getItem('coresCategorias');
            return cores ? JSON.parse(cores) : {};
        } catch (error) {
            console.warn('⚠️ Erro ao carregar cores:', error);
            return {};
        }
    }
    
    static salvar(cores) {
        try {
            localStorage.setItem('coresCategorias', JSON.stringify(cores));
        } catch (error) {
            console.warn('⚠️ Erro ao salvar cores:', error);
        }
    }
    
    static obterCorCategoria(categoria) {
        categoria = categoria.trim();
        if (categoria === 'Cartão') categoria = 'Cartão de Crédito';
        
        const coresSalvas = this.carregarSalvas();
        
        if (coresSalvas[categoria]) {
            return coresSalvas[categoria];
        }
        
        const coresEmUso = Object.values(coresSalvas);
        const corDisponivel = CONFIG.CORES_DISPONIVEIS.find(cor => !coresEmUso.includes(cor));
        
        const novaCor = corDisponivel || CONFIG.CORES_DISPONIVEIS[
            Object.keys(coresSalvas).length % CONFIG.CORES_DISPONIVEIS.length
        ];
        
        coresSalvas[categoria] = novaCor;
        this.salvar(coresSalvas);
        
        return novaCor;
    }
    
    static obterCoresParaCategorias(categorias) {
        return categorias.map(categoria => this.obterCorCategoria(categoria));
    }
    
    static limparCoresNaoUtilizadas(categoriasAtivas) {
        const coresSalvas = this.carregarSalvas();
        const novasCores = {};
        
        categoriasAtivas.forEach(categoria => {
            if (coresSalvas[categoria]) {
                novasCores[categoria] = coresSalvas[categoria];
            }
        });
        
        this.salvar(novasCores);
    }
}

class Utils {
    static limparGraficos() {
        CONFIG.GRAFICOS.forEach(grafico => {
            if (window[grafico]) {
                window[grafico].destroy();
                window[grafico] = null;
            }
        });
    }
    
    static obterTodasCategoriasDoAno(ano) {
        const categorias = new Set();
        
        if (!dadosFinanceiros || !dadosFinanceiros[ano]) {
            console.warn(`Dados financeiros não encontrados para o ano ${ano}`);
            return [];
        }
        
        for (let i = 0; i < 12; i++) {
            if (!dadosFinanceiros[ano].meses || !dadosFinanceiros[ano].meses[i]) continue;
            
            const despesas = dadosFinanceiros[ano].meses[i].despesas || [];
            despesas.forEach(despesa => {
                let categoria = despesa.categoria || 'Outros';
                
                if (!despesa.formaPagamento && (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito')) {
                    categoria = despesa.categoriaCartao || 'Outros';
                }
                
                categorias.add(categoria);
            });
        }
        
        return Array.from(categorias).sort();
    }
    
    static normalizarCategoria(despesa) {
        let categoria = despesa.categoria || 'Outros';
        
        if (!despesa.formaPagamento && (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito')) {
            categoria = despesa.categoriaCartao || 'Outros';
        }
        
        return categoria.trim() === 'Cartão' ? 'Cartão de Crédito' : categoria;
    }
    
    static normalizarFormaPagamento(despesa) {
        let formaPagamento = despesa.formaPagamento;
        
        if (!formaPagamento) {
            formaPagamento = (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito') ? 'credito' : 'debito';
        }
        
        return formaPagamento;
    }
    
    static atualizarElemento(id, valor) {
        const elemento = document.getElementById(id);
        if (elemento) {
            elemento.textContent = typeof valor === 'number' ? formatarMoeda(valor) : valor;
        }
    }
    
    static verificarDados(ano) {
        if (!dadosFinanceiros) {
            console.error('dadosFinanceiros não está definido');
            return false;
        }
        
        if (!dadosFinanceiros[ano]) {
            console.warn(`Ano ${ano} não existe nos dados financeiros`);
            return false;
        }
        
        return true;
    }
    
    static verificarMesFechado(mes, ano) {
        return dadosFinanceiros[ano]?.meses[mes]?.fechado === true;
    }
}

class FiltroHandler {
    static manipularCheckboxExclusivo(idPrefix, tipoFiltro, callback) {
        const checkboxes = document.querySelectorAll(`#dashboard-section input[type="checkbox"][id^="${idPrefix}-"]`);
        const statusId = idPrefix.replace('cat-', 'status-cat-').replace('anual', 'anual').replace('mensal', 'mensal');
        
        let novoFiltro = 'todas';
        checkboxes.forEach(checkbox => {
            if (checkbox.checked && checkbox.id !== `${idPrefix}-todas`) {
                novoFiltro = checkbox.id.replace(`${idPrefix}-`, '');
            }
        });
        
        if (novoFiltro !== 'todas') {
            checkboxes.forEach(checkbox => {
                checkbox.checked = checkbox.id === `${idPrefix}-${novoFiltro}`;
            });
        } else {
            const todasCheckbox = document.getElementById(`${idPrefix}-todas`);
            if (todasCheckbox?.checked) {
                checkboxes.forEach(checkbox => {
                    checkbox.checked = checkbox.id === `${idPrefix}-todas`;
                });
            }
        }
        
        const algumMarcado = Array.from(checkboxes).some(cb => cb.checked);
        if (!algumMarcado) {
            const todasCheckbox = document.getElementById(`${idPrefix}-todas`);
            if (todasCheckbox) {
                todasCheckbox.checked = true;
                novoFiltro = 'todas';
            }
        }
        
        Utils.atualizarElemento(statusId, novoFiltro === 'todas' ? 'Exibindo: Todas' : `Exibindo: ${novoFiltro.toUpperCase()}`);
        filtros.set(tipoFiltro, novoFiltro);
        callback();
    }
    
    static manipularSelect(selectId, statusId, tipoFiltro, callback) {
        const select = document.getElementById(selectId);
        if (!select) return;
        
        const valorSelecionado = select.value || 'todas';
        
        Utils.atualizarElemento(statusId, valorSelecionado === 'todas' ? 'Exibindo: Todas' : `Categoria: ${valorSelecionado}`);
        filtros.set(tipoFiltro, valorSelecionado);
        callback();
    }
}

class ProcessadorDados {
    static processarDadosParaGraficos(dadosFinanceiros, ano) {
        console.log(`Processando dados para gráficos - Ano: ${ano}`);
        
        if (!Utils.verificarDados(ano)) {
            return this.obterEstruturaPadrao();
        }
        
        const resultado = {
            dadosMensais: { labels: CONFIG.NOMES_MESES, receitas: [], despesas: [], saldos: [] },
            dadosJuros: { labels: CONFIG.NOMES_MESES, valores: [], categorias: {} },
            dadosParcelamentos: { labels: [], valores: [], categorias: {} },
            resumoAnual: { receitas: 0, despesas: 0, saldo: 0, juros: 0 },
            mesesFechados: []
        };
        
        const categorias = {};
        
        for (let i = 0; i < 12; i++) {
            const dadosMes = dadosFinanceiros[ano]?.meses?.[i] || { receitas: [], despesas: [] };
            const mesFechado = dadosMes.fechado === true;
            
            if (mesFechado) {
                resultado.mesesFechados.push(i);
            }
            
            const saldoAnterior = typeof window.obterSaldoAnteriorValido === 'function' ? 
                window.obterSaldoAnteriorValido(i, ano) : 0;
            
            const receitasManuais = this.calcularTotalReceitasSeguro(dadosMes.receitas);
            const receitasComSaldo = saldoAnterior > 0 ? receitasManuais + saldoAnterior : receitasManuais;
            const despesasMes = this.calcularTotalDespesasSeguro(dadosMes.despesas);
            const saldoMes = receitasComSaldo - despesasMes;
            
            resultado.dadosMensais.receitas.push(receitasComSaldo);
            resultado.dadosMensais.despesas.push(despesasMes);
            resultado.dadosMensais.saldos.push(saldoMes);
            
            resultado.resumoAnual.receitas += receitasManuais;
            resultado.resumoAnual.despesas += despesasMes;
            
            const { jurosMes, jurosCategoriaMes } = this.processarJurosMes(dadosMes.despesas);
            resultado.dadosJuros.valores.push(jurosMes);
            resultado.dadosJuros.categorias[CONFIG.NOMES_MESES[i]] = jurosCategoriaMes;
            resultado.resumoAnual.juros += jurosMes;
            
            this.processarCategoriasMes(dadosMes.despesas, categorias);
            
            if (i === new Date().getMonth()) {
                this.processarParcelamentosFuturos(dadosFinanceiros, ano, i, resultado.dadosParcelamentos);
            }
        }
        
        resultado.resumoAnual.saldo = resultado.resumoAnual.receitas - resultado.resumoAnual.despesas;
        resultado.dadosCategorias = { labels: Object.keys(categorias), valores: Object.values(categorias) };
        
        console.log('Dados processados:', resultado);
        return resultado;
    }
    
    static calcularTotalReceitasSeguro(receitas) {
        if (typeof window.calcularTotalReceitas === 'function') {
            return window.calcularTotalReceitas(receitas);
        }
        
        if (!Array.isArray(receitas)) return 0;
        return receitas.reduce((total, receita) => total + parseFloat(receita.valor || 0), 0);
    }
    
    static calcularTotalDespesasSeguro(despesas) {
        if (typeof window.calcularTotalDespesas === 'function') {
            return window.calcularTotalDespesas(despesas);
        }
        
        if (!Array.isArray(despesas)) return 0;
        return despesas.reduce((total, despesa) => {
            const valor = this.obterValorRealDespesaLocal(despesa);
            return total + valor;
        }, 0);
    }
    
    static obterValorRealDespesaLocal(despesa) {
        if (despesa.valorPago !== null && despesa.valorPago !== undefined && despesa.valorPago > 0) {
            return parseFloat(despesa.valorPago);
        }
        return parseFloat(despesa.valor) || 0;
    }
    
    static obterEstruturaPadrao() {
        return {
            dadosMensais: { labels: CONFIG.NOMES_MESES, receitas: Array(12).fill(0), despesas: Array(12).fill(0), saldos: Array(12).fill(0) },
            dadosJuros: { labels: CONFIG.NOMES_MESES, valores: Array(12).fill(0), categorias: {} },
            dadosParcelamentos: { labels: [], valores: [], categorias: {} },
            resumoAnual: { receitas: 0, despesas: 0, saldo: 0, juros: 0 },
            dadosCategorias: { labels: [], valores: [] },
            mesesFechados: []
        };
    }
    
    static processarJurosMes(despesas) {
        if (!Array.isArray(despesas)) return { jurosMes: 0, jurosCategoriaMes: {} };
        
        let jurosMes = 0;
        const jurosCategoriaMes = {};
        
        despesas.forEach(despesa => {
            const categoria = Utils.normalizarCategoria(despesa);
            let juros = 0;
            
            if (despesa.juros && parseFloat(despesa.juros) > 0) {
                juros = parseFloat(despesa.juros);
            }
            else if (despesa.valorPago && despesa.valor && despesa.valorPago > despesa.valor) {
                juros = despesa.valorPago - despesa.valor;
            }
            else if (despesa.parcelado && despesa.metadados) {
                if (despesa.metadados.jurosPorParcela) {
                    juros = despesa.metadados.jurosPorParcela;
                } else if (despesa.metadados.totalJuros && despesa.totalParcelas) {
                    juros = despesa.metadados.totalJuros / despesa.totalParcelas;
                }
            }
            else if (despesa.valorTotalComJuros && despesa.valorOriginal) {
                const totalJuros = despesa.valorTotalComJuros - (despesa.valorOriginal * (despesa.totalParcelas || 1));
                if (totalJuros > 0 && despesa.totalParcelas) {
                    juros = totalJuros / despesa.totalParcelas;
                }
            }
            
            if (juros > 0) {
                jurosMes += juros;
                jurosCategoriaMes[categoria] = (jurosCategoriaMes[categoria] || 0) + juros;
            }
        });
        
        return { jurosMes, jurosCategoriaMes };
    }
    
    static processarCategoriasMes(despesas, categorias) {
        if (!Array.isArray(despesas)) return;
        
        despesas.forEach(despesa => {
            const categoria = Utils.normalizarCategoria(despesa);
            const valor = this.obterValorRealDespesaLocal(despesa);
            
            if (!isNaN(valor)) {
                categorias[categoria] = (categorias[categoria] || 0) + valor;
            }
        });
    }
    
    static processarParcelamentosFuturos(dadosFinanceiros, ano, mesAtual, dadosParcelamentos) {
        for (let i = 0; i < 6; i++) {
            const mes = (mesAtual + i) % 12;
            const anoParaVerificar = ano + Math.floor((mesAtual + i) / 12);
            
            dadosParcelamentos.labels.push(CONFIG.NOMES_MESES[mes]);
            
            let valorParcelado = 0;
            const categoriasMes = {};
            
            if (dadosFinanceiros[anoParaVerificar]?.meses?.[mes]) {
                const despesas = dadosFinanceiros[anoParaVerificar].meses[mes].despesas || [];
                despesas.forEach(despesa => {
                    if (despesa.parcelado && !despesa.quitado) {
                        const categoria = Utils.normalizarCategoria(despesa);
                        const valor = parseFloat(despesa.valor || 0);
                        
                        valorParcelado += valor;
                        categoriasMes[categoria] = (categoriasMes[categoria] || 0) + valor;
                    }
                });
            }
            
            dadosParcelamentos.valores.push(valorParcelado);
            dadosParcelamentos.categorias[CONFIG.NOMES_MESES[mes]] = categoriasMes;
        }
    }
    
    static filtrarDespesasPorFormaPagamento(despesas, filtroAtivo) {
        if (!Array.isArray(despesas) || filtroAtivo === 'todas') return despesas;
        
        return despesas.filter(despesa => {
            const formaPagamento = Utils.normalizarFormaPagamento(despesa);
            return formaPagamento === filtroAtivo;
        });
    }
    
    static filtrarDespesasPorCategoria(despesas, filtroAtivo) {
        if (!Array.isArray(despesas) || filtroAtivo === 'todas') return despesas;
        
        return despesas.filter(despesa => {
            const categoria = Utils.normalizarCategoria(despesa);
            return categoria === filtroAtivo;
        });
    }
    
    static filtrarJurosEParcelamentosPorCategoria(dadosJuros, dadosParcelamentos, categoriaFiltro) {
        if (categoriaFiltro === 'todas') {
            return { dadosJuros, dadosParcelamentos };
        }
        
        const jurosFiltrados = {
            labels: dadosJuros.labels,
            valores: dadosJuros.labels.map(mes => {
                const categoriasDoMes = dadosJuros.categorias[mes] || {};
                return categoriasDoMes[categoriaFiltro] || 0;
            }),
            categorias: dadosJuros.categorias
        };
        
        const parcelamentosFiltrados = {
            labels: dadosParcelamentos.labels,
            valores: dadosParcelamentos.labels.map(mes => {
                const categoriasDoMes = dadosParcelamentos.categorias[mes] || {};
                return categoriasDoMes[categoriaFiltro] || 0;
            }),
            categorias: dadosParcelamentos.categorias
        };
        
        return { 
            dadosJuros: jurosFiltrados, 
            dadosParcelamentos: parcelamentosFiltrados 
        };
    }
}

function filtrarCategoriaAnual() {
    FiltroHandler.manipularCheckboxExclusivo('cat-anual', 'formaPagamento', () => {
        criarGraficoBarrasCategorias(dadosFinanceiros, anoAtual);
    });
}

function filtrarCategoriaMensal() {
    FiltroHandler.manipularCheckboxExclusivo('cat-mensal', 'categorias', () => {
        criarGraficoDespesasCategoriasMensais(dadosFinanceiros, anoAtual);
    });
}

function filtrarFormaPagamento() {
    FiltroHandler.manipularSelect('forma-pagamento-categoria', 'status-forma-pagamento', 'categoriasFormaPagamento', () => {
        criarGraficoFormaPagamentoMensal(dadosFinanceiros, anoAtual);
    });
}

function filtrarParcelamentosJuros() {
    FiltroHandler.manipularSelect('parcelamentos-categoria', 'status-parcelamentos', 'parcelamentosJuros', () => {
        const dadosProcessados = ProcessadorDados.processarDadosParaGraficos(dadosFinanceiros, anoAtual);
        criarGraficoParcelamentosJuros(dadosProcessados.dadosJuros, dadosProcessados.dadosParcelamentos);
    });
}

function filtrarCrescimentoCategoria() {
    FiltroHandler.manipularCheckboxExclusivo('crescimento', 'crescimentoCategoria', () => {
        criarGraficoCrescimentoCategoria(dadosFinanceiros, anoAtual);
    });
    
    const selectCategoria = document.getElementById('crescimento-categoria-especifica');
    if (selectCategoria && selectCategoria.value) {
        filtros.set('crescimentoCategoriaEspecifica', selectCategoria.value);
        criarGraficoCrescimentoCategoria(dadosFinanceiros, anoAtual);
    }
}

let timerAtualizacao = null;

async function carregarDadosDashboard(ano) {
    // ✅ ADICIONAR INTEGRAÇÃO COM API NO INÍCIO:
    if (window.useAPI && window.sistemaAdapter) {
        try {
            console.log('Carregando dashboard via API...');
            const dashboardData = await window.sistemaAdapter.getDashboardData(ano);
            if (dashboardData) {
                // Atualizar elementos da interface
                Utils.atualizarElemento('dashboard-total-receitas', dashboardData.resumoAnual.receitas);
                Utils.atualizarElemento('dashboard-total-despesas', dashboardData.resumoAnual.despesas);
                Utils.atualizarElemento('dashboard-saldo-anual', dashboardData.resumoAnual.saldo);
                Utils.atualizarElemento('dashboard-total-juros', dashboardData.resumoAnual.juros || 0);
                
                // Criar gráficos com dados da API
                Utils.limparGraficos();
                criarGraficoReceitasDespesas(dashboardData.dadosMensais, dashboardData.mesesFechados || []);
                criarGraficoSaldo(dashboardData.dadosMensais, dashboardData.mesesFechados || []);
                criarGraficoParcelamentosJuros(dashboardData.dadosJuros, dashboardData.dadosParcelamentos);
                
                setTimeout(() => {
                    if (dashboardData.dadosCategorias) {
                        // Usar dados de categorias da API se disponível
                        criarGraficosComDadosAPI(dashboardData, ano);
                    } else {
                        // Fallback para gráficos locais
                        criarGraficosLocais(ano);
                    }
                }, 100);
                
                return;
            }
        } catch (error) {
            console.error('Erro ao carregar dashboard da API:', error);
            // Continuar com fallback localStorage
        }
    }
    
    // ============ CÓDIGO LOCALSTORAGE ORIGINAL (não mexer) ============
    if (timerAtualizacao) {
        clearTimeout(timerAtualizacao);
    }
    
    timerAtualizacao = setTimeout(() => {
        carregarDadosDashboardReal(ano);
    }, 100);
}

// ✅ ADICIONAR ESTAS FUNÇÕES AUXILIARES:
function criarGraficosComDadosAPI(dashboardData, ano) {
    console.log('Criando gráficos com dados da API');
    
    // Usar dados da API para categorias se disponível
    if (dashboardData.dadosCategorias) {
        criarGraficoBarrasCategoriasAPI(dashboardData.dadosCategorias);
    }
    
    // Continuar com gráficos que precisam de processamento local
    criarGraficosLocais(ano);
}

function criarGraficosLocais(ano) {
    criarGraficoBarrasCategorias(dadosFinanceiros, ano);
    criarGraficoDespesasCategoriasMensais(dadosFinanceiros, ano);
    criarGraficoTendencia(dadosFinanceiros, ano);
    criarGraficoFormaPagamentoMensal(dadosFinanceiros, ano);
    criarGraficoCrescimentoCategoria(dadosFinanceiros, ano);
    
    setTimeout(() => {
        carregarCategoriasDinamicas();
        aplicarFiltrosPersistidos();
        
        const categoriasAtivas = Utils.obterTodasCategoriasDoAno(ano);
        GerenciadorCores.limparCoresNaoUtilizadas(categoriasAtivas);
    }, 200);
}

function criarGraficoBarrasCategoriasAPI(dadosCategorias) {
    const canvas = document.getElementById('categorias-barras-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (window.categoriasBarrasChart) {
        window.categoriasBarrasChart.destroy();
    }
    
    if (dadosCategorias.labels && dadosCategorias.labels.length > 0) {
        const cores = GerenciadorCores.obterCoresParaCategorias(dadosCategorias.labels);
        
        window.categoriasBarrasChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dadosCategorias.labels,
                datasets: [{
                    label: 'Despesas por Categoria',
                    data: dadosCategorias.valores,
                    backgroundColor: cores,
                    borderColor: cores.map(cor => cor.replace('0.7', '1')),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: value => formatarMoeda(value) }
                    },
                    x: {
                        ticks: { maxRotation: 45, minRotation: 0 }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: context => {
                                const valor = context.raw;
                                const total = dadosCategorias.valores.reduce((sum, val) => sum + val, 0);
                                const porcentagem = ((valor / total) * 100).toFixed(1);
                                return `${formatarMoeda(valor)} (${porcentagem}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
}

function criarGraficosVazios(dadosVazios) {
    criarGraficoReceitasDespesas(dadosVazios.dadosMensais, []);
    criarGraficoSaldo(dadosVazios.dadosMensais, []);
    criarGraficoParcelamentosJuros(dadosVazios.dadosJuros, dadosVazios.dadosParcelamentos);
}

function carregarCategoriasDinamicas() {
    if (!Utils.verificarDados(anoAtual)) return;
    
    const categorias = Utils.obterTodasCategoriasDoAno(anoAtual);
    
    ['forma-pagamento-categoria', 'parcelamentos-categoria', 'crescimento-categoria-especifica'].forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select && categorias) {
            select.innerHTML = '<option value="">Todas as categorias</option>';
            categorias.forEach(categoria => {
                const option = document.createElement('option');
                option.value = categoria;
                option.textContent = categoria;
                select.appendChild(option);
            });
        }
    });
}

function aplicarFiltrosPersistidos() {
    Object.entries(filtros.filtros).forEach(([tipo, valor]) => {
        if (valor && valor !== 'todas') {
            if (tipo.includes('Especifica')) {
                const select = document.getElementById(tipo.replace(/([A-Z])/g, '-$1').toLowerCase());
                if (select) select.value = valor;
            }
        }
    });
}

function criarGraficoReceitasDespesas(dados, mesesFechados) {
    const canvas = document.getElementById('receitas-despesas-chart');
    if (!canvas) {
        console.warn('Canvas receitas-despesas-chart não encontrado');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    if (window.receitasDespesasChart) {
        window.receitasDespesasChart.data.labels = dados.labels;
        window.receitasDespesasChart.data.datasets[0].data = dados.receitas;
        window.receitasDespesasChart.data.datasets[1].data = dados.despesas;
        window.receitasDespesasChart.update();
        return;
    }
    
    window.receitasDespesasChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dados.labels,
            datasets: [
                {
                    label: 'Receitas',
                    data: dados.receitas,
                    backgroundColor: 'rgba(40, 167, 69, 0.7)',
                    borderColor: 'rgb(40, 167, 69)',
                    borderWidth: 1
                },
                {
                    label: 'Despesas',
                    data: dados.despesas,
                    backgroundColor: 'rgba(220, 53, 69, 0.7)',
                    borderColor: 'rgb(220, 53, 69)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: value => formatarMoeda(value) }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: context => `${context.dataset.label}: ${formatarMoeda(context.raw)}`,
                        afterLabel: context => {
                            const mesIndex = context.dataIndex;
                            if (mesesFechados.includes(mesIndex)) {
                                return '🔒 Mês Fechado';
                            }
                            return '';
                        }
                    }
                }
            }
        }
    });
}

function criarGraficoSaldo(dados, mesesFechados) {
    const canvas = document.getElementById('saldo-chart');
    if (!canvas) {
        console.warn('Canvas saldo-chart não encontrado');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    const valores = dados.saldos.filter(valor => valor !== null && valor !== undefined && !isNaN(valor));
    let minValue = Math.min(...valores);
    let maxValue = Math.max(...valores);
    
    const range = maxValue - minValue;
    let margin = range * 0.2;
    
    if (range === 0) {
        const absValue = Math.abs(minValue);
        margin = absValue > 0 ? absValue * 0.2 : 1000;
    }
    
    minValue = minValue - margin;
    maxValue = maxValue + margin;
    
    if (window.saldoChart) {
        window.saldoChart.data.labels = dados.labels;
        window.saldoChart.data.datasets[0].data = dados.saldos;
        window.saldoChart.options.scales.y.min = minValue;
        window.saldoChart.options.scales.y.max = maxValue;
        window.saldoChart.update();
        return;
    }
    
    window.saldoChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dados.labels,
            datasets: [{
                label: 'Saldo Mensal',
                data: dados.saldos,
                backgroundColor: 'rgba(0, 123, 255, 0.1)',
                borderColor: 'rgb(0, 123, 255)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 5,
                pointHoverRadius: 7,
                pointBackgroundColor: 'rgb(0, 123, 255)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: true,
                        color: 'rgba(0, 0, 0, 0.1)'
                    },
                    ticks: {
                        font: {
                            size: 12
                        }
                    }
                },
                y: {
                    display: true,
                    min: minValue,
                    max: maxValue,
                    grid: {
                        display: true,
                        color: 'rgba(0, 0, 0, 0.1)'
                    },
                    ticks: {
                        callback: value => formatarMoeda(value),
                        font: {
                            size: 11
                        },
                        maxTicksLimit: 8
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgb(0, 123, 255)',
                    borderWidth: 1,
                    cornerRadius: 6,
                    displayColors: false,
                    callbacks: {
                        title: context => `${context[0].label}`,
                        label: context => {
                            const valor = context.raw;
                            const valorFormatado = formatarMoeda(valor);
                            return `Saldo: ${valorFormatado}`;
                        },
                        afterLabel: context => {
                            const valor = context.raw;
                            const mesIndex = context.dataIndex;
                            let status = valor >= 0 ? '📈 Saldo positivo' : '📉 Saldo negativo';
                            
                            if (mesesFechados.includes(mesIndex)) {
                                status += '\n🔒 Mês Fechado';
                            }
                            
                            return status;
                        }
                    }
                }
            },
            elements: {
                line: {
                    borderJoinStyle: 'round'
                }
            }
        }
    });
}

function criarGraficoParcelamentosJuros(dadosJuros, dadosParcelamentos) {
    const canvas = document.getElementById('parcelamentos-juros-chart');
    if (!canvas) {
        console.warn('Canvas parcelamentos-juros-chart não encontrado');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    if (window.parcelamentosJurosChart) {
        window.parcelamentosJurosChart.destroy();
    }
    
    const categoriaFiltro = filtros.get('parcelamentosJuros');
    const dadosFiltrados = ProcessadorDados.filtrarJurosEParcelamentosPorCategoria(
        dadosJuros, 
        dadosParcelamentos, 
        categoriaFiltro
    );
    
    const parcelamentosFuturos = Array(12).fill(0);
    const mesAtual = new Date().getMonth();
    
    dadosFiltrados.dadosParcelamentos.valores.forEach((valor, index) => {
        const mesIndex = (mesAtual + index) % 12;
        parcelamentosFuturos[mesIndex] = valor;
    });
    
    const tituloGrafico = categoriaFiltro === 'todas' ? 
        'Juros Pagos e Parcelamentos Futuros' : 
        `Juros e Parcelamentos - ${categoriaFiltro}`;
    
    window.parcelamentosJurosChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dadosFiltrados.dadosJuros.labels,
            datasets: [
                {
                    label: 'Juros Pagos',
                    data: dadosFiltrados.dadosJuros.valores,
                    backgroundColor: 'rgba(253, 126, 20, 0.7)',
                    borderColor: 'rgb(253, 126, 20)',
                    borderWidth: 1
                },
                {
                    label: 'Parcelamentos Futuros',
                    data: parcelamentosFuturos,
                    backgroundColor: 'rgba(108, 117, 125, 0.7)',
                    borderColor: 'rgb(108, 117, 125)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: value => formatarMoeda(value) }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { usePointStyle: true, padding: 20 }
                },
                tooltip: {
                    callbacks: {
                        title: tooltipItems => {
                            const mes = tooltipItems[0].label;
                            return categoriaFiltro === 'todas' ? mes : `${mes} - ${categoriaFiltro}`;
                        },
                        label: context => {
                            const valor = context.raw;
                            const valorFormatado = formatarMoeda(valor);
                            return valor === 0 ? `${context.dataset.label}: Nenhum valor` : `${context.dataset.label}: ${valorFormatado}`;
                        }
                    }
                }
            }
        }
    });
}

function criarGraficoTendencia(dadosFinanceiros, anoAtual) {
    const canvas = document.getElementById('tendencia-chart');
    if (!canvas) {
        console.warn('Canvas tendencia-chart não encontrado');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const anos = [anoAtual-2, anoAtual-1, anoAtual];
    
    const dadosReceitas = [];
    const dadosDespesas = [];
    
    anos.forEach(ano => {
        let totalReceitas = 0;
        let totalDespesas = 0;
        
        if (dadosFinanceiros && dadosFinanceiros[ano]) {
            for (let i = 0; i < 12; i++) {
                if (!dadosFinanceiros[ano].meses || !dadosFinanceiros[ano].meses[i]) continue;
                
                const receitas = dadosFinanceiros[ano].meses[i].receitas || [];
                const despesas = dadosFinanceiros[ano].meses[i].despesas || [];
                
                totalReceitas += ProcessadorDados.calcularTotalReceitasSeguro(receitas);
                totalDespesas += ProcessadorDados.calcularTotalDespesasSeguro(despesas);
            }
        }
        
        dadosReceitas.push(totalReceitas);
        dadosDespesas.push(totalDespesas);
    });
    
    if (window.tendenciaChart) {
        window.tendenciaChart.destroy();
    }
    
    window.tendenciaChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: anos.map(ano => ano.toString()),
            datasets: [
                {
                    label: 'Receitas Totais',
                    data: dadosReceitas,
                    backgroundColor: 'rgba(40, 167, 69, 0.7)',
                    borderColor: 'rgb(40, 167, 69)',
                    borderWidth: 1
                },
                {
                    label: 'Despesas Totais',
                    data: dadosDespesas,
                    backgroundColor: 'rgba(220, 53, 69, 0.7)',
                    borderColor: 'rgb(220, 53, 69)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: value => formatarMoeda(value) }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: context => {
                            const valorFormatado = formatarMoeda(context.raw);
                            return `${context.dataset.label}: ${valorFormatado}`;
                        },
                        afterBody: tooltipItems => {
                            const dataIndex = tooltipItems[0].dataIndex;
                            const receita = dadosReceitas[dataIndex];
                            const despesa = dadosDespesas[dataIndex];
                            const saldo = receita - despesa;
                            const saldoFormatado = formatarMoeda(saldo);
                            return `Saldo: ${saldoFormatado}`;
                        }
                    }
                }
            }
        }
    });
}

function criarGraficoBarrasCategorias(dadosFinanceiros, ano) {
    const canvas = document.getElementById('categorias-barras-chart');
    if (!canvas) {
        console.warn('Canvas categorias-barras-chart não encontrado');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const categorias = {};
    
    if (!Utils.verificarDados(ano)) {
        if (window.categoriasBarrasChart) {
            window.categoriasBarrasChart.destroy();
            window.categoriasBarrasChart = null;
        }
        return;
    }
    
    for (let i = 0; i < 12; i++) {
        if (!dadosFinanceiros[ano].meses || !dadosFinanceiros[ano].meses[i]) continue;
        
        const despesas = dadosFinanceiros[ano].meses[i].despesas || [];
        const despesasFiltradas = ProcessadorDados.filtrarDespesasPorFormaPagamento(
            despesas, 
            filtros.get('formaPagamento')
        );
        
        despesasFiltradas.forEach(despesa => {
            const categoria = Utils.normalizarCategoria(despesa);
            const valor = ProcessadorDados.obterValorRealDespesaLocal(despesa);
            
            if (!isNaN(valor)) {
                categorias[categoria] = (categorias[categoria] || 0) + valor;
            }
        });
    }
    
    const categoriasArray = Object.entries(categorias)
        .map(([categoria, valor]) => ({ categoria, valor }))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 10);
    
    if (window.categoriasBarrasChart) {
        window.categoriasBarrasChart.destroy();
    }
    
    if (categoriasArray.length > 0) {
        const labels = categoriasArray.map(c => c.categoria);
        const valores = categoriasArray.map(c => c.valor);
        const cores = GerenciadorCores.obterCoresParaCategorias(labels);
        
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
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: value => formatarMoeda(value) }
                    },
                    x: {
                        ticks: { maxRotation: 45, minRotation: 0 }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: context => {
                                const valor = context.raw;
                                const total = valores.reduce((sum, val) => sum + val, 0);
                                const porcentagem = ((valor / total) * 100).toFixed(1);
                                const valorFormatado = formatarMoeda(valor);
                                return `${valorFormatado} (${porcentagem}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
}

function criarGraficoDespesasCategoriasMensais(dadosFinanceiros, ano) {
    const canvas = document.getElementById('top-categorias-chart');
    if (!canvas) {
        console.warn('Canvas top-categorias-chart não encontrado');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    if (!Utils.verificarDados(ano)) {
        if (window.topCategoriasChart) {
            window.topCategoriasChart.destroy();
            window.topCategoriasChart = null;
        }
        return;
    }
    
    if (window.topCategoriasChart) {
        window.topCategoriasChart.destroy();
        window.topCategoriasChart = null;
    }
    
    const dadosMensaisPorCategoria = {};
    const todasCategorias = new Set();
    
    for (let i = 0; i < 12; i++) {
        if (!dadosFinanceiros[ano].meses || !dadosFinanceiros[ano].meses[i]) continue;
        
        dadosMensaisPorCategoria[i] = { mes: CONFIG.NOMES_MESES[i], total: 0 };
        
        const despesas = dadosFinanceiros[ano].meses[i].despesas || [];
        const despesasFiltradas = ProcessadorDados.filtrarDespesasPorFormaPagamento(
            despesas, 
            filtros.get('categorias')
        );
        
        despesasFiltradas.forEach(despesa => {
            const categoria = Utils.normalizarCategoria(despesa);
            const valor = ProcessadorDados.obterValorRealDespesaLocal(despesa);
            
            if (!isNaN(valor)) {
                todasCategorias.add(categoria);
                dadosMensaisPorCategoria[i][categoria] = (dadosMensaisPorCategoria[i][categoria] || 0) + valor;
                dadosMensaisPorCategoria[i].total += valor;
            }
        });
    }
    
    const categorias = Array.from(todasCategorias);
    let categoriasParaExibir = categorias;
    
    if (categorias.length > 12) {
        const totalPorCategoria = {};
        
        categorias.forEach(categoria => {
            totalPorCategoria[categoria] = 0;
            for (let i = 0; i < 12; i++) {
                if (dadosMensaisPorCategoria[i]?.[categoria]) {
                    totalPorCategoria[categoria] += dadosMensaisPorCategoria[i][categoria];
                }
            }
        });
        
        const categoriasOrdenadas = Object.entries(totalPorCategoria)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([categoria]) => categoria);
        
        categoriasParaExibir = [...categoriasOrdenadas, "Outros"];
        
        for (let i = 0; i < 12; i++) {
            if (!dadosMensaisPorCategoria[i]) continue;
            
            let outrosValor = 0;
            categorias.forEach(categoria => {
                if (!categoriasOrdenadas.includes(categoria) && dadosMensaisPorCategoria[i][categoria]) {
                    outrosValor += dadosMensaisPorCategoria[i][categoria];
                    delete dadosMensaisPorCategoria[i][categoria];
                }
            });
            
            if (outrosValor > 0) {
                dadosMensaisPorCategoria[i]["Outros"] = outrosValor;
            }
        }
    }
    
    const dadosParaGrafico = Object.values(dadosMensaisPorCategoria);
    
    if (dadosParaGrafico.length > 0 && categoriasParaExibir.length > 0) {
        const datasets = categoriasParaExibir.map(categoria => ({
            label: categoria,
            data: dadosParaGrafico.map(dadosMes => dadosMes[categoria] || 0),
            backgroundColor: GerenciadorCores.obterCorCategoria(categoria),
            borderColor: GerenciadorCores.obterCorCategoria(categoria).replace('0.7', '1'),
            borderWidth: 1
        }));
        
        window.topCategoriasChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: CONFIG.NOMES_MESES,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { stacked: true },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: { callback: value => formatarMoeda(value) }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: context => {
                                const valor = context.raw;
                                const categoria = context.dataset.label;
                                const mesIndex = context.dataIndex;
                                const totalMes = dadosParaGrafico[mesIndex].total;
                                const porcentagem = totalMes > 0 ? ((valor / totalMes) * 100).toFixed(1) : 0;
                                const valorFormatado = formatarMoeda(valor);
                                
                                return `${categoria}: ${valorFormatado} (${porcentagem}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
}

function criarGraficoFormaPagamentoMensal(dadosFinanceiros, ano) {
    const canvas = document.getElementById('forma-pagamento-mensal-chart');
    if (!canvas) {
        console.warn('Canvas forma-pagamento-mensal-chart não encontrado');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const dadosMensais = { pix: Array(12).fill(0), debito: Array(12).fill(0), credito: Array(12).fill(0) };
    
    if (!Utils.verificarDados(ano)) {
        if (window.formaPagamentoMensalChart) {
            window.formaPagamentoMensalChart.destroy();
            window.formaPagamentoMensalChart = null;
        }
        return;
    }
    
    for (let i = 0; i < 12; i++) {
        if (!dadosFinanceiros[ano].meses || !dadosFinanceiros[ano].meses[i]) continue;
        
        const despesas = dadosFinanceiros[ano].meses[i].despesas || [];
        const despesasFiltradas = ProcessadorDados.filtrarDespesasPorCategoria(
            despesas, 
            filtros.get('categoriasFormaPagamento')
        );
        
        despesasFiltradas.forEach(despesa => {
            const formaPagamento = Utils.normalizarFormaPagamento(despesa);
            const valor = ProcessadorDados.obterValorRealDespesaLocal(despesa);
            
            if (!isNaN(valor) && dadosMensais[formaPagamento]) {
                dadosMensais[formaPagamento][i] += valor;
            }
        });
    }
    
    if (window.formaPagamentoMensalChart) {
        window.formaPagamentoMensalChart.destroy();
    }
    
    window.formaPagamentoMensalChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: CONFIG.NOMES_MESES,
            datasets: [
                {
                    label: 'PIX',
                    data: dadosMensais.pix,
                    backgroundColor: CONFIG.CORES_FORMA_PAGAMENTO.pix,
                    borderColor: CONFIG.CORES_FORMA_PAGAMENTO.pix.replace('0.7', '1'),
                    borderWidth: 1
                },
                {
                    label: 'Débito',
                    data: dadosMensais.debito,
                    backgroundColor: CONFIG.CORES_FORMA_PAGAMENTO.debito,
                    borderColor: CONFIG.CORES_FORMA_PAGAMENTO.debito.replace('0.7', '1'),
                    borderWidth: 1
                },
                {
                    label: 'Crédito',
                    data: dadosMensais.credito,
                    backgroundColor: CONFIG.CORES_FORMA_PAGAMENTO.credito,
                    borderColor: CONFIG.CORES_FORMA_PAGAMENTO.credito.replace('0.7', '1'),
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: false },
                y: {
                    beginAtZero: true,
                    stacked: false,
                    ticks: { callback: value => formatarMoeda(value) }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { usePointStyle: true, padding: 20 }
                },
                tooltip: {
                    callbacks: {
                        label: context => {
                            const valorFormatado = formatarMoeda(context.raw);
                            return `${context.dataset.label}: ${valorFormatado}`;
                        }
                    }
                }
            }
        }
    });
}

function criarGraficoCrescimentoCategoria(dadosFinanceiros, ano) {
    const canvas = document.getElementById('crescimento-categoria-chart');
    if (!canvas) {
        console.warn('Canvas crescimento-categoria-chart não encontrado');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    if (!Utils.verificarDados(ano)) {
        if (window.crescimentoCategoriaChart) {
            window.crescimentoCategoriaChart.destroy();
            window.crescimentoCategoriaChart = null;
        }
        return;
    }
    
    if (window.crescimentoCategoriaChart) {
        window.crescimentoCategoriaChart.destroy();
        window.crescimentoCategoriaChart = null;
    }
    
    const dadosCrescimento = calcularCrescimentoPorCategoria(dadosFinanceiros, ano);
    
    if (!dadosCrescimento || Object.keys(dadosCrescimento).length === 0) {
        return;
    }
    
    const dadosFiltrados = aplicarFiltrosCrescimento(dadosCrescimento);
    
    if (dadosFiltrados.categorias.length === 0) {
        return;
    }
    
    const datasets = dadosFiltrados.categorias.map(categoria => {
        const cor = GerenciadorCores.obterCorCategoria(categoria);
        return {
            label: categoria,
            data: dadosFiltrados.dados[categoria],
            borderColor: cor.replace('0.7', '1'),
            backgroundColor: cor.replace('0.7', '0.1'),
            borderWidth: 2,
            fill: false,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: cor.replace('0.7', '1'),
            pointBorderColor: '#fff',
            pointBorderWidth: 2
        };
    });
    
    window.crescimentoCategoriaChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dadosFiltrados.meses,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: true,
                        color: 'rgba(0, 0, 0, 0.1)'
                    },
                    ticks: {
                        font: { size: 11 }
                    }
                },
                y: {
                    display: true,
                    grid: {
                        display: true,
                        color: 'rgba(0, 0, 0, 0.1)'
                    },
                    ticks: {
                        callback: function(value) {
                            return value >= 0 ? `+${value.toFixed(0)}%` : `${value.toFixed(0)}%`;
                        },
                        font: { size: 11 }
                    },
                    borderColor: 'rgba(0, 0, 0, 0.3)',
                    borderWidth: 1
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        font: { size: 11 },
                        filter: function(legendItem, chartData) {
                            return chartData.datasets.indexOf(legendItem) < 8;
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(67, 97, 238, 0.8)',
                    borderWidth: 1,
                    cornerRadius: 6,
                    callbacks: {
                        title: function(context) {
                            return `Crescimento - ${context[0].label}`;
                        },
                        label: function(context) {
                            const categoria = context.dataset.label;
                            const valor = context.raw;
                            const sinal = valor >= 0 ? '+' : '';
                            const emoji = valor >= 0 ? '📈' : '📉';
                            return `${emoji} ${categoria}: ${sinal}${valor.toFixed(1)}%`;
                        },
                        afterBody: function(context) {
                            const mesIndex = context[0].dataIndex;
                            if (mesIndex > 0) {
                                const mesAnterior = dadosFiltrados.meses[mesIndex - 1];
                                return `vs ${mesAnterior}`;
                            }
                            return '';
                        }
                    }
                }
            },
            elements: {
                line: {
                    borderJoinStyle: 'round'
                }
            }
        }
    });
}

function calcularCrescimentoPorCategoria(dadosFinanceiros, ano) {
    const dadosMensaisPorCategoria = {};
    const todasCategorias = new Set();
    
    for (let i = 0; i < 12; i++) {
        if (!dadosFinanceiros[ano]?.meses?.[i]) continue;
        
        const despesas = dadosFinanceiros[ano].meses[i].despesas || [];
        
        despesas.forEach(despesa => {
            const categoria = Utils.normalizarCategoria(despesa);
            const valor = ProcessadorDados.obterValorRealDespesaLocal(despesa);
            
            if (!isNaN(valor)) {
                todasCategorias.add(categoria);
                
                if (!dadosMensaisPorCategoria[categoria]) {
                    dadosMensaisPorCategoria[categoria] = Array(12).fill(0);
                }
                
                dadosMensaisPorCategoria[categoria][i] += valor;
            }
        });
    }
    
    const crescimentoPorCategoria = {};
    
    Array.from(todasCategorias).forEach(categoria => {
        const valoresMensais = dadosMensaisPorCategoria[categoria] || Array(12).fill(0);
        const crescimentos = [];
        
        for (let i = 1; i < 12; i++) {
            const mesAtual = valoresMensais[i];
            const mesAnterior = valoresMensais[i - 1];
            
            let crescimento = 0;
            
            if (mesAnterior > 0) {
                crescimento = ((mesAtual - mesAnterior) / mesAnterior) * 100;
            } else if (mesAtual > 0) {
                crescimento = 100;
            }
            
            crescimento = Math.max(-100, Math.min(500, crescimento));
            
            crescimentos.push(crescimento);
        }
        
        const totalGastos = valoresMensais.reduce((sum, val) => sum + val, 0);
        if (totalGastos > 0) {
            crescimentoPorCategoria[categoria] = crescimentos;
        }
    });
    
    return crescimentoPorCategoria;
}

function aplicarFiltrosCrescimento(dadosCrescimento) {
    const filtroAtivo = filtros.get('crescimentoCategoria') || 'todas';
    const categoriaEspecifica = document.getElementById('crescimento-categoria-especifica')?.value;
    
    let categorias = Object.keys(dadosCrescimento);
    
    if (categoriaEspecifica && categoriaEspecifica !== '') {
        categorias = [categoriaEspecifica].filter(cat => dadosCrescimento[cat]);
    } else {
        switch (filtroAtivo) {
            case 'top5':
                const crescimentoMedio = categorias.map(categoria => {
                    const crescimentos = dadosCrescimento[categoria];
                    const media = crescimentos.reduce((sum, val) => sum + val, 0) / crescimentos.length;
                    return { categoria, media };
                }).sort((a, b) => b.media - a.media);
                
                categorias = crescimentoMedio.slice(0, 5).map(item => item.categoria);
                break;
                
            case 'positivo':
                categorias = categorias.filter(categoria => {
                    const crescimentos = dadosCrescimento[categoria];
                    const media = crescimentos.reduce((sum, val) => sum + val, 0) / crescimentos.length;
                    return media > 0;
                });
                break;
                
            case 'todas':
            default:
                if (categorias.length > 10) {
                    const variacao = categorias.map(categoria => {
                        const crescimentos = dadosCrescimento[categoria];
                        const max = Math.max(...crescimentos);
                        const min = Math.min(...crescimentos);
                        return { categoria, variacao: max - min };
                    }).sort((a, b) => b.variacao - a.variacao);
                    
                    categorias = variacao.slice(0, 10).map(item => item.categoria);
                }
                break;
        }
    }
    
    const dados = {};
    categorias.forEach(categoria => {
        dados[categoria] = dadosCrescimento[categoria];
    });
    
    const meses = CONFIG.NOMES_MESES.slice(1);
    
    return {
        categorias: categorias,
        dados: dados,
        meses: meses
    };
}

function atualizarTodosGraficosCategorias(ano) {
    console.log(`Atualizando todos os gráficos para o ano: ${ano}`);
    
    filtros.resetar();
    
    Utils.limparGraficos();
    
    setTimeout(() => {
        carregarDadosDashboard(ano);
    }, 100);
}

function onNovaCategoriaAdicionada() {
    console.log('Nova categoria adicionada, atualizando gráficos...');
    atualizarTodosGraficosCategorias(anoAtual);
}

let dashboardObserver = null;

function configurarObservadorDashboard() {
    if (dashboardObserver) {
        dashboardObserver.disconnect();
    }
    
    dashboardObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const dashboardSection = document.getElementById('dashboard-section');
                if (dashboardSection && dashboardSection.classList.contains('active')) {
                    console.log('Dashboard ativado, carregando dados...');
                    setTimeout(() => carregarDadosDashboard(anoAtual), 100);
                }
            }
        });
    });
    
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection) {
        dashboardObserver.observe(dashboardSection, { attributes: true });
    }
}

function registrarHookAtualizacao() {
    const salvarDadosOriginal = window.salvarDados;
    if (salvarDadosOriginal) {
        window.salvarDados = function(...args) {
            const resultado = salvarDadosOriginal.apply(this, args);
            
            const dashboardSection = document.getElementById('dashboard-section');
            if (dashboardSection && dashboardSection.classList.contains('active')) {
                console.log('Dados salvos, atualizando dashboard...');
                setTimeout(() => carregarDadosDashboard(anoAtual), 200);
            }
            
            return resultado;
        };
    }
    
    if (window.fecharMes) {
        const fecharMesOriginal = window.fecharMes;
        window.fecharMes = function(...args) {
            const resultado = fecharMesOriginal.apply(this, args);
            
            const dashboardSection = document.getElementById('dashboard-section');
            if (dashboardSection && dashboardSection.classList.contains('active') && resultado) {
                console.log('Mês fechado, atualizando dashboard...');
                setTimeout(() => carregarDadosDashboard(anoAtual), 200);
            }
            
            return resultado;
        };
    }
    
    if (window.reabrirMes) {
        const reabrirMesOriginal = window.reabrirMes;
        window.reabrirMes = function(...args) {
            const resultado = reabrirMesOriginal.apply(this, args);
            
            const dashboardSection = document.getElementById('dashboard-section');
            if (dashboardSection && dashboardSection.classList.contains('active') && resultado) {
                console.log('Mês reaberto, atualizando dashboard...');
                setTimeout(() => carregarDadosDashboard(anoAtual), 200);
            }
            
            return resultado;
        };
    }
    
    if (window.moverParaProximoMes) {
        const moverParaProximoMesOriginal = window.moverParaProximoMes;
        window.moverParaProximoMes = function(...args) {
            try {
                moverParaProximoMesOriginal.apply(this, args);
                
                const dashboardSection = document.getElementById('dashboard-section');
                if (dashboardSection && dashboardSection.classList.contains('active')) {
                    console.log('Despesa movida, atualizando dashboard...');
                    setTimeout(() => carregarDadosDashboard(anoAtual), 200);
                }
            } catch (error) {
                console.error('Erro ao mover despesa:', error);
            }
        };
    }
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard: DOM carregado, configurando...');
    
    configurarObservadorDashboard();
    registrarHookAtualizacao();
    
    ['btn-ano-anterior', 'btn-proximo-ano', 'btn-refresh'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', function() {
                console.log(`Botão ${id} clicado, limpando e recarregando gráficos...`);
                filtros.resetar();
                Utils.limparGraficos();
                setTimeout(() => carregarDadosDashboard(anoAtual), 100);
            });
        }
    });
    
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection && dashboardSection.classList.contains('active')) {
        setTimeout(() => {
            if (typeof anoAtual !== 'undefined') {
                carregarDadosDashboard(anoAtual);
            }
        }, 500);
    }
});

window.filtrarCategoriaAnual = filtrarCategoriaAnual;
window.filtrarCategoriaMensal = filtrarCategoriaMensal;
window.filtrarFormaPagamento = filtrarFormaPagamento;
window.filtrarParcelamentosJuros = filtrarParcelamentosJuros;
window.filtrarCrescimentoCategoria = filtrarCrescimentoCategoria;
window.atualizarTodosGraficosCategorias = atualizarTodosGraficosCategorias;
window.onNovaCategoriaAdicionada = onNovaCategoriaAdicionada;
window.carregarDadosDashboard = carregarDadosDashboard;
window.carregarCategoriasDinamicas = carregarCategoriasDinamicas;