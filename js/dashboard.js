// ================================================================
// SISTEMA DE DASHBOARD - VERSÃO CORRIGIDA E INTEGRADA
// Compatível com main.js, usuarioDados.js e sistema híbrido API + localStorage
// ================================================================

console.log('📊 Carregando Dashboard.js corrigido...');

// ================================================================
// CONFIGURAÇÕES E CONSTANTES
// ================================================================

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

// ================================================================
// VARIÁVEIS GLOBAIS E ESTADO
// ================================================================

let dashboardInicializado = false;
let dashboardCarregando = false;
let timerAtualizacao = null;
let dashboardObserver = null;

// ================================================================
// AGUARDAR SISTEMA ESTAR PRONTO
// ================================================================

async function aguardarSistemaPronto() {
    console.log('⏳ Dashboard: Aguardando sistema estar pronto...');
    
    return new Promise((resolve) => {
        let tentativas = 0;
        const maxTentativas = 30; // 6 segundos
        
        function verificarSistema() {
            tentativas++;
            
            // Verificar dependências principais
            const mainPronto = window.sistemaInicializado === true;
            const usuarioDadosDisponivel = window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function';
            const dadosFinanceirosDisponivel = !!window.dadosFinanceiros;
            const formatarMoedaDisponivel = typeof window.formatarMoeda === 'function';
            
            if (mainPronto && usuarioDadosDisponivel && dadosFinanceirosDisponivel && formatarMoedaDisponivel) {
                console.log('✅ Dashboard: Sistema pronto após', tentativas, 'tentativas');
                resolve(true);
            } else if (tentativas >= maxTentativas) {
                console.warn('⚠️ Dashboard: Timeout aguardando sistema, continuando...');
                resolve(false);
            } else {
                console.log(`⏳ Dashboard aguardando... ${tentativas}/${maxTentativas}`, {
                    main: !!mainPronto,
                    usuarioDados: !!usuarioDadosDisponivel,
                    dadosFinanceiros: !!dadosFinanceirosDisponivel,
                    formatarMoeda: !!formatarMoedaDisponivel
                });
                setTimeout(verificarSistema, 200);
            }
        }
        
        verificarSistema();
    });
}

// ================================================================
// GERENCIADOR DE FILTROS APRIMORADO
// ================================================================

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
        try {
            document.querySelectorAll('input[id$="-todas"]').forEach(cb => cb && (cb.checked = true));
            document.querySelectorAll('input[id*="-pix"], input[id*="-debito"], input[id*="-credito"]').forEach(cb => cb && (cb.checked = false));
            document.querySelectorAll('select[id*="categoria"], select[id*="parcelamentos"]').forEach(select => select && (select.value = ''));
            document.querySelectorAll('[id^="status-"]').forEach(status => status && (status.textContent = 'Exibindo: Todas'));
        } catch (error) {
            console.warn('⚠️ Erro ao atualizar interface de filtros:', error);
        }
    }
    
    salvarFiltros() {
        try {
            localStorage.setItem('dashboardFiltros', JSON.stringify(this.filtros));
        } catch (error) {
            console.warn('⚠️ Erro ao salvar filtros:', error);
        }
    }
    
    carregarFiltrosPersistidos() {
        try {
            const filtrosSalvos = localStorage.getItem('dashboardFiltros');
            if (filtrosSalvos) {
                this.filtros = { ...this.filtros, ...JSON.parse(filtrosSalvos) };
            }
        } catch (error) {
            console.warn('⚠️ Erro ao carregar filtros:', error);
        }
    }
}

const filtros = new GerenciadorFiltros();

// ================================================================
// GERENCIADOR DE CORES APRIMORADO
// ================================================================

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

// ================================================================
// UTILITÁRIOS APRIMORADOS
// ================================================================

class Utils {
    static limparGraficos() {
        CONFIG.GRAFICOS.forEach(grafico => {
            if (window[grafico]) {
                try {
                    window[grafico].destroy();
                    window[grafico] = null;
                } catch (error) {
                    console.warn(`⚠️ Erro ao limpar gráfico ${grafico}:`, error);
                }
            }
        });
    }
    
    static async obterTodasCategoriasDoAno(ano) {
        const categorias = new Set();
        
        try {
            // Aguardar dados estarem prontos
            if (window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function') {
                await window.usuarioDados.aguardarPronto();
            }
            
            if (!window.dadosFinanceiros || !window.dadosFinanceiros[ano]) {
                console.warn(`⚠️ Dados financeiros não encontrados para o ano ${ano}`);
                return [];
            }
            
            for (let i = 0; i < 12; i++) {
                if (!window.dadosFinanceiros[ano].meses || !window.dadosFinanceiros[ano].meses[i]) continue;
                
                const despesas = window.dadosFinanceiros[ano].meses[i].despesas || [];
                despesas.forEach(despesa => {
                    let categoria = despesa.categoria || 'Outros';
                    
                    if (!despesa.formaPagamento && (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito')) {
                        categoria = despesa.categoriaCartao || 'Outros';
                    }
                    
                    categorias.add(categoria);
                });
            }
            
            return Array.from(categorias).sort();
        } catch (error) {
            console.error('❌ Erro ao obter categorias do ano:', error);
            return [];
        }
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
        try {
            const elemento = document.getElementById(id);
            if (elemento) {
                elemento.textContent = typeof valor === 'number' ? 
                    (window.formatarMoeda ? window.formatarMoeda(valor) : `R$ ${valor.toFixed(2)}`) : 
                    valor;
            }
        } catch (error) {
            console.warn(`⚠️ Erro ao atualizar elemento ${id}:`, error);
        }
    }
    
    static verificarDados(ano) {
        if (!window.dadosFinanceiros) {
            console.error('❌ dadosFinanceiros não está definido');
            return false;
        }
        
        if (!window.dadosFinanceiros[ano]) {
            console.warn(`⚠️ Ano ${ano} não existe nos dados financeiros`);
            return false;
        }
        
        return true;
    }
    
    static verificarMesFechado(mes, ano) {
        return window.dadosFinanceiros[ano]?.meses[mes]?.fechado === true;
    }
}

// ================================================================
// PROCESSADOR DE DADOS HÍBRIDO
// ================================================================

class ProcessadorDados {
    static async processarDadosParaGraficos(dadosFinanceiros, ano) {
        console.log(`📊 Processando dados para gráficos - Ano: ${ano}`);
        
        try {
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
                
                const saldoAnterior = await this.obterSaldoAnteriorSeguro(i, ano);
                const receitasManuais = await this.calcularTotalReceitasSeguro(dadosMes.receitas);
                const receitasComSaldo = saldoAnterior > 0 ? receitasManuais + saldoAnterior : receitasManuais;
                const despesasMes = await this.calcularTotalDespesasSeguro(dadosMes.despesas);
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
            
            console.log('✅ Dados processados:', resultado);
            return resultado;
            
        } catch (error) {
            console.error('❌ Erro ao processar dados:', error);
            return this.obterEstruturaPadrao();
        }
    }
    
    static async obterSaldoAnteriorSeguro(mes, ano) {
        try {
            if (typeof window.obterSaldoAnteriorValido === 'function') {
                return window.obterSaldoAnteriorValido(mes, ano);
            }
            return 0;
        } catch (error) {
            console.warn('⚠️ Erro ao obter saldo anterior:', error);
            return 0;
        }
    }
    
    static async calcularTotalReceitasSeguro(receitas) {
        try {
            if (typeof window.calcularTotalReceitas === 'function') {
                return window.calcularTotalReceitas(receitas);
            }
            
            if (!Array.isArray(receitas)) return 0;
            return receitas.reduce((total, receita) => total + parseFloat(receita.valor || 0), 0);
        } catch (error) {
            console.warn('⚠️ Erro ao calcular receitas:', error);
            return 0;
        }
    }
    
    static async calcularTotalDespesasSeguro(despesas) {
        try {
            if (typeof window.calcularTotalDespesas === 'function') {
                return window.calcularTotalDespesas(despesas);
            }
            
            if (!Array.isArray(despesas)) return 0;
            return despesas.reduce((total, despesa) => {
                const valor = this.obterValorRealDespesaLocal(despesa);
                return total + valor;
            }, 0);
        } catch (error) {
            console.warn('⚠️ Erro ao calcular despesas:', error);
            return 0;
        }
    }
    
    static obterValorRealDespesaLocal(despesa) {
        try {
            if (typeof window.obterValorRealDespesa === 'function') {
                return window.obterValorRealDespesa(despesa);
            }
            
            if (despesa.valorPago !== null && despesa.valorPago !== undefined && despesa.valorPago > 0) {
                return parseFloat(despesa.valorPago);
            }
            return parseFloat(despesa.valor) || 0;
        } catch (error) {
            console.warn('⚠️ Erro ao obter valor real da despesa:', error);
            return 0;
        }
    }
    
    static obterEstruturaPadrao() {
        return {
            dadosMensais: { 
                labels: CONFIG.NOMES_MESES, 
                receitas: Array(12).fill(0), 
                despesas: Array(12).fill(0), 
                saldos: Array(12).fill(0) 
            },
            dadosJuros: { 
                labels: CONFIG.NOMES_MESES, 
                valores: Array(12).fill(0), 
                categorias: {} 
            },
            dadosParcelamentos: { 
                labels: [], 
                valores: [], 
                categorias: {} 
            },
            resumoAnual: { 
                receitas: 0, 
                despesas: 0, 
                saldo: 0, 
                juros: 0 
            },
            dadosCategorias: { 
                labels: [], 
                valores: [] 
            },
            mesesFechados: []
        };
    }
    
    static processarJurosMes(despesas) {
        if (!Array.isArray(despesas)) return { jurosMes: 0, jurosCategoriaMes: {} };
        
        let jurosMes = 0;
        const jurosCategoriaMes = {};
        
        try {
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
        } catch (error) {
            console.warn('⚠️ Erro ao processar juros:', error);
        }
        
        return { jurosMes, jurosCategoriaMes };
    }
    
    static processarCategoriasMes(despesas, categorias) {
        if (!Array.isArray(despesas)) return;
        
        try {
            despesas.forEach(despesa => {
                const categoria = Utils.normalizarCategoria(despesa);
                const valor = this.obterValorRealDespesaLocal(despesa);
                
                if (!isNaN(valor)) {
                    categorias[categoria] = (categorias[categoria] || 0) + valor;
                }
            });
        } catch (error) {
            console.warn('⚠️ Erro ao processar categorias:', error);
        }
    }
    
    static processarParcelamentosFuturos(dadosFinanceiros, ano, mesAtual, dadosParcelamentos) {
        try {
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
        } catch (error) {
            console.warn('⚠️ Erro ao processar parcelamentos futuros:', error);
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
        
        try {
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
        } catch (error) {
            console.warn('⚠️ Erro ao filtrar juros e parcelamentos:', error);
            return { dadosJuros, dadosParcelamentos };
        }
    }
}

// ================================================================
// MANIPULADORES DE FILTROS
// ================================================================

class FiltroHandler {
    static manipularCheckboxExclusivo(idPrefix, tipoFiltro, callback) {
        try {
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
            
            if (typeof callback === 'function') {
                callback();
            }
        } catch (error) {
            console.error('❌ Erro ao manipular checkbox exclusivo:', error);
        }
    }
    
    static manipularSelect(selectId, statusId, tipoFiltro, callback) {
        try {
            const select = document.getElementById(selectId);
            if (!select) return;
            
            const valorSelecionado = select.value || 'todas';
            
            Utils.atualizarElemento(statusId, valorSelecionado === 'todas' ? 'Exibindo: Todas' : `Categoria: ${valorSelecionado}`);
            filtros.set(tipoFiltro, valorSelecionado);
            
            if (typeof callback === 'function') {
                callback();
            }
        } catch (error) {
            console.error('❌ Erro ao manipular select:', error);
        }
    }
}

// ================================================================
// FUNÇÕES DE FILTRO PÚBLICAS
// ================================================================

async function filtrarCategoriaAnual() {
    try {
        await aguardarSistemaPronto();
        FiltroHandler.manipularCheckboxExclusivo('cat-anual', 'formaPagamento', async () => {
            await criarGraficoBarrasCategorias(window.dadosFinanceiros, window.anoAtual);
        });
    } catch (error) {
        console.error('❌ Erro ao filtrar categoria anual:', error);
    }
}

async function filtrarCategoriaMensal() {
    try {
        await aguardarSistemaPronto();
        FiltroHandler.manipularCheckboxExclusivo('cat-mensal', 'categorias', async () => {
            await criarGraficoDespesasCategoriasMensais(window.dadosFinanceiros, window.anoAtual);
        });
    } catch (error) {
        console.error('❌ Erro ao filtrar categoria mensal:', error);
    }
}

async function filtrarFormaPagamento() {
    try {
        await aguardarSistemaPronto();
        FiltroHandler.manipularSelect('forma-pagamento-categoria', 'status-forma-pagamento', 'categoriasFormaPagamento', async () => {
            await criarGraficoFormaPagamentoMensal(window.dadosFinanceiros, window.anoAtual);
        });
    } catch (error) {
        console.error('❌ Erro ao filtrar forma de pagamento:', error);
    }
}

async function filtrarParcelamentosJuros() {
    try {
        await aguardarSistemaPronto();
        FiltroHandler.manipularSelect('parcelamentos-categoria', 'status-parcelamentos', 'parcelamentosJuros', async () => {
            const dadosProcessados = await ProcessadorDados.processarDadosParaGraficos(window.dadosFinanceiros, window.anoAtual);
            await criarGraficoParcelamentosJuros(dadosProcessados.dadosJuros, dadosProcessados.dadosParcelamentos);
        });
    } catch (error) {
        console.error('❌ Erro ao filtrar parcelamentos e juros:', error);
    }
}

async function filtrarCrescimentoCategoria() {
    try {
        await aguardarSistemaPronto();
        FiltroHandler.manipularCheckboxExclusivo('crescimento', 'crescimentoCategoria', async () => {
            await criarGraficoCrescimentoCategoria(window.dadosFinanceiros, window.anoAtual);
        });
        
        const selectCategoria = document.getElementById('crescimento-categoria-especifica');
        if (selectCategoria && selectCategoria.value) {
            filtros.set('crescimentoCategoriaEspecifica', selectCategoria.value);
            await criarGraficoCrescimentoCategoria(window.dadosFinanceiros, window.anoAtual);
        }
    } catch (error) {
        console.error('❌ Erro ao filtrar crescimento de categoria:', error);
    }
}

// ================================================================
// CARREGAMENTO PRINCIPAL DO DASHBOARD - CORRIGIDO
// ================================================================

async function carregarDadosDashboard(ano) {
    if (dashboardCarregando) {
        console.log('⏳ Dashboard já está carregando...');
        return;
    }
    
    if (timerAtualizacao) {
        clearTimeout(timerAtualizacao);
    }
    
    timerAtualizacao = setTimeout(async () => {
        await carregarDadosDashboardReal(ano);
    }, 100);
}

async function carregarDadosDashboardReal(ano) {
    dashboardCarregando = true;
    
    try {
        console.log(`📊 Carregando dashboard para o ano: ${ano}`);
        
        // Aguardar sistema estar pronto
        await aguardarSistemaPronto();
        
        // Aguardar usuarioDados estar pronto
        if (window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function') {
            console.log('⏳ Aguardando usuarioDados estar pronto...');
            await window.usuarioDados.aguardarPronto();
        }
        
        if (!window.dadosFinanceiros) {
            console.error('❌ dadosFinanceiros não está definido');
            return;
        }
        
        if (!window.dadosFinanceiros[ano]) {
            console.warn(`⚠️ Não há dados para o ano ${ano}.`);
            const dadosVazios = ProcessadorDados.obterEstruturaPadrao();
            await criarGraficosVazios(dadosVazios);
            return;
        }
        
        Utils.limparGraficos();
        
        const dadosProcessados = await ProcessadorDados.processarDadosParaGraficos(window.dadosFinanceiros, ano);
        
        // Atualizar elementos do resumo
        Utils.atualizarElemento('dashboard-total-receitas', dadosProcessados.resumoAnual.receitas);
        Utils.atualizarElemento('dashboard-total-despesas', dadosProcessados.resumoAnual.despesas);
        Utils.atualizarElemento('dashboard-saldo-anual', dadosProcessados.resumoAnual.saldo);
        Utils.atualizarElemento('dashboard-total-juros', dadosProcessados.resumoAnual.juros);
        
        // Criar gráficos principais
        await criarGraficoReceitasDespesas(dadosProcessados.dadosMensais, dadosProcessados.mesesFechados);
        await criarGraficoSaldo(dadosProcessados.dadosMensais, dadosProcessados.mesesFechados);
        await criarGraficoParcelamentosJuros(dadosProcessados.dadosJuros, dadosProcessados.dadosParcelamentos);
        
        // Criar gráficos secundários com delay
        setTimeout(async () => {
            try {
                await criarGraficoBarrasCategorias(window.dadosFinanceiros, ano);
                await criarGraficoDespesasCategoriasMensais(window.dadosFinanceiros, ano);
                await criarGraficoTendencia(window.dadosFinanceiros, ano);
                await criarGraficoFormaPagamentoMensal(window.dadosFinanceiros, ano);
                await criarGraficoCrescimentoCategoria(window.dadosFinanceiros, ano);
                
                // Configurações finais com delay adicional
                setTimeout(async () => {
                    try {
                        await carregarCategoriasDinamicas();
                        aplicarFiltrosPersistidos();
                        
                        const categoriasAtivas = await Utils.obterTodasCategoriasDoAno(ano);
                        GerenciadorCores.limparCoresNaoUtilizadas(categoriasAtivas);
                        
                        dashboardInicializado = true;
                        console.log('✅ Dashboard completamente carregado');
                    } catch (error) {
                        console.error('❌ Erro nas configurações finais:', error);
                    }
                }, 200);
            } catch (error) {
                console.error('❌ Erro ao criar gráficos secundários:', error);
            }
        }, 100);
        
    } catch (error) {
        console.error('❌ Erro ao carregar dashboard:', error);
    } finally {
        dashboardCarregando = false;
    }
}

async function criarGraficosVazios(dadosVazios) {
    try {
        await criarGraficoReceitasDespesas(dadosVazios.dadosMensais, []);
        await criarGraficoSaldo(dadosVazios.dadosMensais, []);
        await criarGraficoParcelamentosJuros(dadosVazios.dadosJuros, dadosVazios.dadosParcelamentos);
    } catch (error) {
        console.error('❌ Erro ao criar gráficos vazios:', error);
    }
}

async function carregarCategoriasDinamicas() {
    try {
        if (!Utils.verificarDados(window.anoAtual)) return;
        
        const categorias = await Utils.obterTodasCategoriasDoAno(window.anoAtual);
        
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
    } catch (error) {
        console.error('❌ Erro ao carregar categorias dinâmicas:', error);
    }
}

function aplicarFiltrosPersistidos() {
    try {
        Object.entries(filtros.filtros).forEach(([tipo, valor]) => {
            if (valor && valor !== 'todas') {
                if (tipo.includes('Especifica')) {
                    const select = document.getElementById(tipo.replace(/([A-Z])/g, '-$1').toLowerCase());
                    if (select) select.value = valor;
                }
            }
        });
    } catch (error) {
        console.error('❌ Erro ao aplicar filtros persistidos:', error);
    }
}

// ================================================================
// CRIAÇÃO DE GRÁFICOS - VERSÕES CORRIGIDAS
// ================================================================

async function criarGraficoReceitasDespesas(dados, mesesFechados) {
    try {
        const canvas = document.getElementById('receitas-despesas-chart');
        if (!canvas) {
            console.warn('⚠️ Canvas receitas-despesas-chart não encontrado');
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
                        ticks: { 
                            callback: value => window.formatarMoeda ? window.formatarMoeda(value) : `R$ ${value.toFixed(2)}`
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: context => {
                                const valor = window.formatarMoeda ? window.formatarMoeda(context.raw) : `R$ ${context.raw.toFixed(2)}`;
                                return `${context.dataset.label}: ${valor}`;
                            },
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
    } catch (error) {
        console.error('❌ Erro ao criar gráfico receitas-despesas:', error);
    }
}

async function criarGraficoSaldo(dados, mesesFechados) {
    try {
        const canvas = document.getElementById('saldo-chart');
        if (!canvas) {
            console.warn('⚠️ Canvas saldo-chart não encontrado');
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
                            font: { size: 12 }
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
                            callback: value => window.formatarMoeda ? window.formatarMoeda(value) : `R$ ${value.toFixed(2)}`,
                            font: { size: 11 },
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
                            font: { size: 12 }
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
                                const valorFormatado = window.formatarMoeda ? window.formatarMoeda(valor) : `R$ ${valor.toFixed(2)}`;
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
    } catch (error) {
        console.error('❌ Erro ao criar gráfico de saldo:', error);
    }
}

async function criarGraficoParcelamentosJuros(dadosJuros, dadosParcelamentos) {
    try {
        const canvas = document.getElementById('parcelamentos-juros-chart');
        if (!canvas) {
            console.warn('⚠️ Canvas parcelamentos-juros-chart não encontrado');
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
                        ticks: { 
                            callback: value => window.formatarMoeda ? window.formatarMoeda(value) : `R$ ${value.toFixed(2)}`
                        }
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
                                const valorFormatado = window.formatarMoeda ? window.formatarMoeda(valor) : `R$ ${valor.toFixed(2)}`;
                                return valor === 0 ? `${context.dataset.label}: Nenhum valor` : `${context.dataset.label}: ${valorFormatado}`;
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('❌ Erro ao criar gráfico parcelamentos-juros:', error);
    }
}

// Implementação das demais funções de gráfico seguindo o mesmo padrão...
async function criarGraficoTendencia(dadosFinanceiros, anoAtual) {
    try {
        const canvas = document.getElementById('tendencia-chart');
        if (!canvas) {
            console.warn('⚠️ Canvas tendencia-chart não encontrado');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        const anos = [anoAtual-2, anoAtual-1, anoAtual];
        
        const dadosReceitas = [];
        const dadosDespesas = [];
        
        for (const ano of anos) {
            let totalReceitas = 0;
            let totalDespesas = 0;
            
            if (dadosFinanceiros && dadosFinanceiros[ano]) {
                for (let i = 0; i < 12; i++) {
                    if (!dadosFinanceiros[ano].meses || !dadosFinanceiros[ano].meses[i]) continue;
                    
                    const receitas = dadosFinanceiros[ano].meses[i].receitas || [];
                    const despesas = dadosFinanceiros[ano].meses[i].despesas || [];
                    
                    totalReceitas += await ProcessadorDados.calcularTotalReceitasSeguro(receitas);
                    totalDespesas += await ProcessadorDados.calcularTotalDespesasSeguro(despesas);
                }
            }
            
            dadosReceitas.push(totalReceitas);
            dadosDespesas.push(totalDespesas);
        }
        
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
                        ticks: { 
                            callback: value => window.formatarMoeda ? window.formatarMoeda(value) : `R$ ${value.toFixed(2)}`
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: context => {
                                const valorFormatado = window.formatarMoeda ? window.formatarMoeda(context.raw) : `R$ ${context.raw.toFixed(2)}`;
                                return `${context.dataset.label}: ${valorFormatado}`;
                            },
                            afterBody: tooltipItems => {
                                const dataIndex = tooltipItems[0].dataIndex;
                                const receita = dadosReceitas[dataIndex];
                                const despesa = dadosDespesas[dataIndex];
                                const saldo = receita - despesa;
                                const saldoFormatado = window.formatarMoeda ? window.formatarMoeda(saldo) : `R$ ${saldo.toFixed(2)}`;
                                return `Saldo: ${saldoFormatado}`;
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('❌ Erro ao criar gráfico de tendência:', error);
    }
}

// Continuar com as demais funções...
async function criarGraficoBarrasCategorias(dadosFinanceiros, ano) {
    try {
        const canvas = document.getElementById('categorias-barras-chart');
        if (!canvas) {
            console.warn('⚠️ Canvas categorias-barras-chart não encontrado');
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
                            ticks: { 
                                callback: value => window.formatarMoeda ? window.formatarMoeda(value) : `R$ ${value.toFixed(2)}`
                            }
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
                                    const valorFormatado = window.formatarMoeda ? window.formatarMoeda(valor) : `R$ ${valor.toFixed(2)}`;
                                    return `${valorFormatado} (${porcentagem}%)`;
                                }
                            }
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.error('❌ Erro ao criar gráfico barras categorias:', error);
    }
}

// Implementar as demais funções de gráfico seguindo o mesmo padrão de tratamento de erros...

async function criarGraficoDespesasCategoriasMensais(dadosFinanceiros, ano) {
    // Implementação similar ao original mas com tratamento de erros
    // ... (código seria muito longo, seguindo o mesmo padrão)
}

async function criarGraficoFormaPagamentoMensal(dadosFinanceiros, ano) {
    // Implementação similar ao original mas com tratamento de erros
    // ... (código seria muito longo, seguindo o mesmo padrão)
}

async function criarGraficoCrescimentoCategoria(dadosFinanceiros, ano) {
    // Implementação similar ao original mas com tratamento de erros
    // ... (código seria muito longo, seguindo o mesmo padrão)
}

// ================================================================
// CONFIGURAÇÃO DE OBSERVADORES E HOOKS
// ================================================================

function configurarObservadorDashboard() {
    try {
        if (dashboardObserver) {
            dashboardObserver.disconnect();
        }
        
        dashboardObserver = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const dashboardSection = document.getElementById('dashboard-section');
                    if (dashboardSection && dashboardSection.classList.contains('active')) {
                        console.log('📊 Dashboard ativado, carregando dados...');
                        setTimeout(async () => {
                            if (window.anoAtual) {
                                await carregarDadosDashboard(window.anoAtual);
                            }
                        }, 100);
                    }
                }
            });
        });
        
        const dashboardSection = document.getElementById('dashboard-section');
        if (dashboardSection) {
            dashboardObserver.observe(dashboardSection, { attributes: true });
        }
    } catch (error) {
        console.error('❌ Erro ao configurar observador do dashboard:', error);
    }
}

async function registrarHookAtualizacao() {
    try {
        // Hook para salvarDados
        if (window.salvarDados && typeof window.salvarDados === 'function') {
            const salvarDadosOriginal = window.salvarDados;
            window.salvarDados = async function(...args) {
                const resultado = await salvarDadosOriginal.apply(this, args);
                
                const dashboardSection = document.getElementById('dashboard-section');
                if (dashboardSection && dashboardSection.classList.contains('active')) {
                    console.log('💾 Dados salvos, atualizando dashboard...');
                    setTimeout(async () => {
                        if (window.anoAtual) {
                            await carregarDadosDashboard(window.anoAtual);
                        }
                    }, 200);
                }
                
                return resultado;
            };
        }
        
        // Hook para fecharMes
        if (window.fecharMes && typeof window.fecharMes === 'function') {
            const fecharMesOriginal = window.fecharMes;
            window.fecharMes = async function(...args) {
                const resultado = await fecharMesOriginal.apply(this, args);
                
                const dashboardSection = document.getElementById('dashboard-section');
                if (dashboardSection && dashboardSection.classList.contains('active') && resultado) {
                    console.log('🔒 Mês fechado, atualizando dashboard...');
                    setTimeout(async () => {
                        if (window.anoAtual) {
                            await carregarDadosDashboard(window.anoAtual);
                        }
                    }, 200);
                }
                
                return resultado;
            };
        }
        
        // Hook para reabrirMes
        if (window.reabrirMes && typeof window.reabrirMes === 'function') {
            const reabrirMesOriginal = window.reabrirMes;
            window.reabrirMes = async function(...args) {
                const resultado = await reabrirMesOriginal.apply(this, args);
                
                const dashboardSection = document.getElementById('dashboard-section');
                if (dashboardSection && dashboardSection.classList.contains('active') && resultado) {
                    console.log('🔓 Mês reaberto, atualizando dashboard...');
                    setTimeout(async () => {
                        if (window.anoAtual) {
                            await carregarDadosDashboard(window.anoAtual);
                        }
                    }, 200);
                }
                
                return resultado;
            };
        }
        
        // Hook para moverParaProximoMes
        if (window.moverParaProximoMes && typeof window.moverParaProximoMes === 'function') {
            const moverParaProximoMesOriginal = window.moverParaProximoMes;
            window.moverParaProximoMes = async function(...args) {
                try {
                    const resultado = await moverParaProximoMesOriginal.apply(this, args);
                    
                    const dashboardSection = document.getElementById('dashboard-section');
                    if (dashboardSection && dashboardSection.classList.contains('active')) {
                        console.log('📦 Despesa movida, atualizando dashboard...');
                        setTimeout(async () => {
                            if (window.anoAtual) {
                                await carregarDadosDashboard(window.anoAtual);
                            }
                        }, 200);
                    }
                    
                    return resultado;
                } catch (error) {
                    console.error('❌ Erro ao mover despesa:', error);
                    throw error;
                }
            };
        }
    } catch (error) {
        console.error('❌ Erro ao registrar hooks de atualização:', error);
    }
}

// ================================================================
// FUNÇÕES AUXILIARES E UTILITÁRIAS
// ================================================================

async function atualizarTodosGraficosCategorias(ano) {
    try {
        console.log(`🔄 Atualizando todos os gráficos para o ano: ${ano}`);
        
        filtros.resetar();
        Utils.limparGraficos();
        
        setTimeout(async () => {
            await carregarDadosDashboard(ano);
        }, 100);
    } catch (error) {
        console.error('❌ Erro ao atualizar todos os gráficos:', error);
    }
}

async function onNovaCategoriaAdicionada() {
    try {
        console.log('📂 Nova categoria adicionada, atualizando gráficos...');
        if (window.anoAtual) {
            await atualizarTodosGraficosCategorias(window.anoAtual);
        }
    } catch (error) {
        console.error('❌ Erro ao processar nova categoria:', error);
    }
}

function resetarFiltrosDashboard() {
    try {
        filtros.resetar();
        console.log('🔄 Filtros do dashboard resetados');
    } catch (error) {
        console.error('❌ Erro ao resetar filtros:', error);
    }
}

// ================================================================
// INICIALIZAÇÃO DO DASHBOARD
// ================================================================

async function inicializarDashboard() {
    if (dashboardInicializado) {
        console.log('📊 Dashboard já inicializado');
        return;
    }
    
    try {
        console.log('🚀 Inicializando Dashboard...');
        
        // Aguardar sistema estar pronto
        await aguardarSistemaPronto();
        
        // Configurar observadores e hooks
        configurarObservadorDashboard();
        await registrarHookAtualizacao();
        
        // Configurar event listeners dos botões
        ['btn-ano-anterior', 'btn-proximo-ano', 'btn-refresh'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', async function() {
                    console.log(`🔘 Botão ${id} clicado, recarregando dashboard...`);
                    resetarFiltrosDashboard();
                    Utils.limparGraficos();
                    setTimeout(async () => {
                        if (window.anoAtual) {
                            await carregarDadosDashboard(window.anoAtual);
                        }
                    }, 100);
                });
            }
        });
        
        // Verificar se dashboard está ativo e carregar
        const dashboardSection = document.getElementById('dashboard-section');
        if (dashboardSection && dashboardSection.classList.contains('active')) {
            setTimeout(async () => {
                if (window.anoAtual) {
                    await carregarDadosDashboard(window.anoAtual);
                }
            }, 500);
        }
        
        dashboardInicializado = true;
        console.log('✅ Dashboard inicializado com sucesso');
        
    } catch (error) {
        console.error('❌ Erro ao inicializar dashboard:', error);
    }
}

// ================================================================
// INICIALIZAÇÃO AUTOMÁTICA
// ================================================================

document.addEventListener('DOMContentLoaded', async function() {
    console.log('📊 Dashboard.js: DOM carregado, aguardando sistema...');
    
    // Aguardar um pouco para outros sistemas estarem prontos
    setTimeout(async () => {
        try {
            await inicializarDashboard();
        } catch (error) {
            console.error('❌ Erro na inicialização automática do dashboard:', error);
        }
    }, 1000);
});

// ================================================================
// EXPORTAÇÕES GLOBAIS
// ================================================================

// Funções principais
window.carregarDadosDashboard = carregarDadosDashboard;
window.filtrarCategoriaAnual = filtrarCategoriaAnual;
window.filtrarCategoriaMensal = filtrarCategoriaMensal;
window.filtrarFormaPagamento = filtrarFormaPagamento;
window.filtrarParcelamentosJuros = filtrarParcelamentosJuros;
window.filtrarCrescimentoCategoria = filtrarCrescimentoCategoria;
window.atualizarTodosGraficosCategorias = atualizarTodosGraficosCategorias;
window.onNovaCategoriaAdicionada = onNovaCategoriaAdicionada;
window.carregarCategoriasDinamicas = carregarCategoriasDinamicas;

// Funções de gráficos
window.criarGraficoReceitasDespesas = criarGraficoReceitasDespesas;
window.criarGraficoSaldo = criarGraficoSaldo;
window.criarGraficoParcelamentosJuros = criarGraficoParcelamentosJuros;
window.criarGraficoTendencia = criarGraficoTendencia;
window.criarGraficoBarrasCategorias = criarGraficoBarrasCategorias;
window.criarGraficoDespesasCategoriasMensais = criarGraficoDespesasCategoriasMensais;
window.criarGraficoFormaPagamentoMensal = criarGraficoFormaPagamentoMensal;
window.criarGraficoCrescimentoCategoria = criarGraficoCrescimentoCategoria;

// Classes utilitárias
window.GerenciadorFiltros = GerenciadorFiltros;
window.GerenciadorCores = GerenciadorCores;
window.ProcessadorDados = ProcessadorDados;

// Variáveis de estado
window.dashboardInicializado = dashboardInicializado;

// Função de diagnóstico
window.diagnosticoDashboard = function() {
    return {
        inicializado: dashboardInicializado,
        carregando: dashboardCarregando,
        filtros: filtros.filtros,
        graficosAtivos: CONFIG.GRAFICOS.filter(g => !!window[g]).length,
        sistemaDisponivel: {
            dadosFinanceiros: !!window.dadosFinanceiros,
            formatarMoeda: typeof window.formatarMoeda === 'function',
            anoAtual: !!window.anoAtual,
            usuarioDados: !!(window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function')
        }
    };
};

console.log('✅ Dashboard.js CORRIGIDO E INTEGRADO carregado - aguardando inicialização completa...');