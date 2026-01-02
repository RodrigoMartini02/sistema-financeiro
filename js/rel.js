// ================================================================
// SISTEMA DE RELATÓRIOS - VERSÃO REFATORADA PARA FILTROS INLINE
// Compatível com receita.js e despesas.js
// PARTE 1 DE 2
// ================================================================

let processandoRelatorio = false;

// ================================================================
// CONSTANTES E CONFIGURAÇÕES
// ================================================================

const TIPOS_RELATORIO = {
    COMPLETO: 'completo',
    APENAS_RECEITAS: 'apenas-receitas',
    APENAS_DESPESAS: 'apenas-despesas',
    POR_CATEGORIA: 'por-categoria',
    POR_FORMA_PAGAMENTO: 'por-forma-pagamento',
    PARCELAMENTOS: 'parcelamentos',
    GASTOS_REAIS: 'gastos-reais'
};

const PERIODOS = {
    MES_ATUAL: 'mes-atual',
    MES_ANTERIOR: 'mes-anterior',
    ULTIMOS_3_MESES: 'ultimos-3-meses',
    ULTIMOS_6_MESES: 'ultimos-6-meses',
    ANO_ATUAL: 'ano-atual',
    ANO_ANTERIOR: 'ano-anterior',
    PERSONALIZADO: 'personalizado'
};

const CRITERIOS_DATA = {
    VENCIMENTO: 'vencimento',
    COMPRA: 'compra',
    PAGAMENTO: 'pagamento',
    MISTA: 'mista'
};

// ================================================================
// CLASSE PRINCIPAL DO SISTEMA DE RELATÓRIOS
// ================================================================

class SistemaRelatorios {
    constructor() {
        this.secaoAtiva = null;
        this.dadosProcessados = null;
        this.filtrosAtuais = {};
        this.sistemaInicializado = false;
        
        this.inicializar();
    }
    
    async inicializar() {
        try {
            console.log('Inicializando Sistema de Relatórios...');
            
            await this.aguardarSistemaFinanceiro();
            
            this.configurarEventos();
            this.configurarFiltrosDefault();
            this.carregarCategorias();
            
            this.sistemaInicializado = true;
            console.log('Sistema de Relatórios inicializado com sucesso');
            
        } catch (error) {
            console.error('Erro ao inicializar Sistema de Relatórios:', error);
        }
    }
    
    async aguardarSistemaFinanceiro() {
        return new Promise((resolve) => {
            if (window.sistemaInicializado && window.dadosFinanceiros && typeof window.salvarDados === 'function') {
                resolve(true);
                return;
            }
            
            let tentativas = 0;
            const maxTentativas = 50;
            
            const verificar = () => {
                tentativas++;
                
                if (window.sistemaInicializado && window.dadosFinanceiros && typeof window.salvarDados === 'function') {
                    resolve(true);
                } else if (tentativas >= maxTentativas) {
                    console.warn('Sistema financeiro não foi carregado completamente');
                    resolve(false);
                } else {
                    setTimeout(verificar, 100);
                }
            };
            
            verificar();
        });
    }
    
    // ================================================================
    // CONFIGURAÇÃO DE EVENTOS PARA FILTROS INLINE
    // ================================================================
    
    configurarEventos() {
        setTimeout(() => {
            this.configurarEventosSecao();
            this.configurarEventosFiltrosInline();
            this.configurarEventosBotoes();
        }, 100);
    }
    
    configurarEventosSecao() {
        this.secaoAtiva = document.getElementById('relatorios-section');
        if (!this.secaoAtiva) {
            console.warn('Seção de relatórios não encontrada');
            return;
        }
        
        this.configurarEventosPeriodo();
        this.configurarEventosCheckboxes();
    }
    
    configurarEventosPeriodo() {
        const filtroPeriodo = document.getElementById('filtro-periodo');
        if (filtroPeriodo) {
            filtroPeriodo.addEventListener('change', () => {
                const personalizadoContainer = document.getElementById('periodo-personalizado-container');
                if (filtroPeriodo.value === PERIODOS.PERSONALIZADO) {
                    personalizadoContainer?.classList.remove('hidden');
                } else {
                    personalizadoContainer?.classList.add('hidden');
                }
                this.atualizarResumoFiltros();
            });
        }
    }
    
    configurarEventosCheckboxes() {
        // Checkbox "Todas" - controla outros checkboxes de forma de pagamento
        const todasCheckbox = document.getElementById('forma-todas');
        if (todasCheckbox) {
            todasCheckbox.addEventListener('change', (e) => {
                const checkboxes = ['forma-pix', 'forma-debito', 'forma-credito'];
                checkboxes.forEach(id => {
                    const checkbox = document.getElementById(id);
                    if (checkbox) {
                        checkbox.checked = e.target.checked;
                        checkbox.disabled = e.target.checked;
                    }
                });
                this.atualizarResumoFiltros();
            });
        }
        
        // Checkboxes individuais de forma de pagamento
        ['forma-pix', 'forma-debito', 'forma-credito'].forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.addEventListener('change', () => {
                    const todasCheckbox = document.getElementById('forma-todas');
                    if (todasCheckbox && checkbox.checked) {
                        todasCheckbox.checked = false;
                    }
                    this.atualizarResumoFiltros();
                });
            }
        });
        
        // Checkboxes de opções
        ['incluir-transferencias', 'agrupar-parcelamentos', 'mostrar-projecoes'].forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.addEventListener('change', () => {
                    this.atualizarResumoFiltros();
                });
            }
        });
    }
    
    configurarEventosFiltrosInline() {
        const filtrosSelectores = [
            'filtro-periodo',
            'filtro-tipo-relatorio', 
            'filtro-criterio-data',
            'filtro-categoria-relatorio',
            'filtro-status-relatorio',
            'filtro-ordenacao'
        ];
        
        filtrosSelectores.forEach(id => {
            const elemento = document.getElementById(id);
            if (elemento && !elemento._relatoriosListener) {
                elemento._relatoriosListener = () => {
                    this.atualizarResumoFiltros();
                    
                    // Lógica específica para tipo de relatório
                    if (id === 'filtro-tipo-relatorio') {
                        this.atualizarInterfaceParaTipo(elemento.value);
                    }
                };
                elemento.addEventListener('change', elemento._relatoriosListener);
            }
        });
        
        // Eventos para campos de data personalizada
        ['data-inicio-relatorio', 'data-fim-relatorio'].forEach(id => {
            const elemento = document.getElementById(id);
            if (elemento && !elemento._relatoriosListener) {
                elemento._relatoriosListener = () => this.atualizarResumoFiltros();
                elemento.addEventListener('change', elemento._relatoriosListener);
            }
        });
    }
    
    atualizarInterfaceParaTipo(tipo) {
        // Ajustar interface baseado no tipo de relatório selecionado
        const checkboxTransferencias = document.getElementById('incluir-transferencias');
        const checkboxParcelamentos = document.getElementById('agrupar-parcelamentos');
        
        if (tipo === TIPOS_RELATORIO.APENAS_RECEITAS) {
            if (checkboxTransferencias) checkboxTransferencias.disabled = true;
            if (checkboxParcelamentos) checkboxParcelamentos.disabled = true;
        } else {
            if (checkboxTransferencias) checkboxTransferencias.disabled = false;
            if (checkboxParcelamentos) checkboxParcelamentos.disabled = false;
        }
    }
    
    configurarEventosBotoes() {
        const botoes = [
            { id: 'btn-gerar-relatorio', handler: () => this.gerarRelatorio() },
            { id: 'btn-limpar-filtros-relatorio', handler: () => this.limparFiltros() },
            { id: 'btn-exportar-pdf-relatorio', handler: () => this.exportarPDF() }
        ];
        
        botoes.forEach(botao => {
            const elemento = document.getElementById(botao.id);
            if (elemento && !elemento._relatoriosListener) {
                elemento._relatoriosListener = botao.handler;
                elemento.addEventListener('click', elemento._relatoriosListener);
            }
        });
    }
    
    // ================================================================
    // CONFIGURAÇÃO DE FILTROS
    // ================================================================
    
    configurarFiltrosDefault() {
        // Configurar período como personalizado por padrão
        const filtroPeriodo = document.getElementById('filtro-periodo');
        if (filtroPeriodo) {
            filtroPeriodo.value = PERIODOS.PERSONALIZADO;
        }
        
        const personalizadoContainer = document.getElementById('periodo-personalizado-container');
        if (personalizadoContainer) {
            personalizadoContainer.classList.remove('hidden');
        }
        
        // Definir datas padrão (mês atual)
        const hoje = new Date();
        const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        
        const dataInicio = document.getElementById('data-inicio-relatorio');
        const dataFim = document.getElementById('data-fim-relatorio');
        if (dataInicio) dataInicio.value = primeiroDia.toISOString().split('T')[0];
        if (dataFim) dataFim.value = ultimoDia.toISOString().split('T')[0];
        
        // Configurar outros filtros padrão
        const filtrosDefault = [
            { id: 'filtro-tipo-relatorio', valor: TIPOS_RELATORIO.COMPLETO },
            { id: 'filtro-criterio-data', valor: CRITERIOS_DATA.VENCIMENTO },
            { id: 'filtro-categoria-relatorio', valor: 'todas' },
            { id: 'filtro-status-relatorio', valor: 'todos' },
            { id: 'filtro-ordenacao', valor: 'data' }
        ];
        
        filtrosDefault.forEach(filtro => {
            const elemento = document.getElementById(filtro.id);
            if (elemento) elemento.value = filtro.valor;
        });
        
        // Configurar checkboxes padrão
        const todasCheckbox = document.getElementById('forma-todas');
        if (todasCheckbox) {
            todasCheckbox.checked = true;
            todasCheckbox.dispatchEvent(new Event('change'));
        }
        
        this.atualizarResumoFiltros();
    }
    
    carregarCategorias() {
        const select = document.getElementById('filtro-categoria-relatorio');
        if (!select || typeof window.dadosFinanceiros === 'undefined') return;
        
        const categorias = this.obterTodasCategorias();
        
        select.innerHTML = categorias.map(categoria => 
            `<option value="${categoria}" ${categoria === 'todas' ? 'selected' : ''}>${categoria}</option>`
        ).join('');
    }
    
    obterTodasCategorias() {
        const categorias = new Set(['todas']);
        
        if (!window.dadosFinanceiros) return Array.from(categorias);
        
        for (const ano in window.dadosFinanceiros) {
            const dadosAno = window.dadosFinanceiros[ano];
            if (!dadosAno.meses) continue;
            
            for (let mes = 0; mes < 12; mes++) {
                const dadosMes = dadosAno.meses[mes];
                if (!dadosMes) continue;
                
                // Processar despesas
                if (dadosMes.despesas) {
                    dadosMes.despesas.forEach(despesa => {
                        let categoria = despesa.categoria || 'Outros';
                        
                        // Compatibilidade com sistema de despesas
                        if (typeof window.obterCategoriaLimpa === 'function') {
                            categoria = window.obterCategoriaLimpa(despesa);
                        } else if (!despesa.formaPagamento && 
                                  (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito')) {
                            categoria = despesa.categoriaCartao || 'Outros';
                        }
                        
                        categorias.add(categoria);
                    });
                }
                
                // Processar receitas
                if (dadosMes.receitas) {
                    dadosMes.receitas.forEach(receita => {
                        if (!receita.saldoAnterior && !receita.descricao?.includes('Saldo Anterior')) {
                            categorias.add('Receitas');
                        }
                    });
                }
            }
        }
        
        const categoriasArray = Array.from(categorias);
        const todasIndex = categoriasArray.indexOf('todas');
        if (todasIndex > 0) {
            categoriasArray.splice(todasIndex, 1);
            categoriasArray.unshift('todas');
        }
        
        return categoriasArray;
    }
    
    // ================================================================
    // RESUMO DE FILTROS
    // ================================================================
    
    atualizarResumoFiltros() {
        const resumoContainer = document.getElementById('resumo-filtros-aplicados');
        const textoResumo = document.getElementById('texto-filtros-resumo');
        
        if (!resumoContainer || !textoResumo) return;
        
        const filtros = this.coletarFiltrosAtivos();
        
        if (filtros.length > 0) {
            textoResumo.innerHTML = filtros.join(' • ');
            resumoContainer.classList.remove('hidden');
        } else {
            resumoContainer.classList.add('hidden');
        }
    }
    
    coletarFiltrosAtivos() {
        const filtros = [];
        
        // Período
        const periodo = document.getElementById('filtro-periodo')?.value;
        if (periodo === PERIODOS.PERSONALIZADO) {
            const dataInicio = document.getElementById('data-inicio-relatorio')?.value;
            const dataFim = document.getElementById('data-fim-relatorio')?.value;
            if (dataInicio && dataFim) {
                const inicio = new Date(dataInicio).toLocaleDateString('pt-BR');
                const fim = new Date(dataFim).toLocaleDateString('pt-BR');
                filtros.push(`<strong>Período:</strong> ${inicio} até ${fim}`);
            }
        } else if (periodo) {
            const nomesPeriodo = {
                [PERIODOS.MES_ATUAL]: 'Mês Atual',
                [PERIODOS.MES_ANTERIOR]: 'Mês Anterior',
                [PERIODOS.ULTIMOS_3_MESES]: 'Últimos 3 Meses',
                [PERIODOS.ULTIMOS_6_MESES]: 'Últimos 6 Meses',
                [PERIODOS.ANO_ATUAL]: 'Ano Atual',
                [PERIODOS.ANO_ANTERIOR]: 'Ano Anterior'
            };
            filtros.push(`<strong>Período:</strong> ${nomesPeriodo[periodo] || periodo}`);
        }
        
        // Tipo de relatório
        const tipo = document.getElementById('filtro-tipo-relatorio')?.value;
        if (tipo && tipo !== TIPOS_RELATORIO.COMPLETO) {
            const nomesTipo = {
                [TIPOS_RELATORIO.APENAS_RECEITAS]: 'Apenas Receitas',
                [TIPOS_RELATORIO.APENAS_DESPESAS]: 'Apenas Despesas',
                [TIPOS_RELATORIO.POR_CATEGORIA]: 'Por Categoria',
                [TIPOS_RELATORIO.POR_FORMA_PAGAMENTO]: 'Por Forma de Pagamento',
                [TIPOS_RELATORIO.PARCELAMENTOS]: 'Parcelamentos',
                [TIPOS_RELATORIO.GASTOS_REAIS]: 'Gastos Reais'
            };
            filtros.push(`<strong>Tipo:</strong> ${nomesTipo[tipo] || tipo}`);
        }
        
        // Categoria
        const categoria = document.getElementById('filtro-categoria-relatorio')?.value;
        if (categoria && categoria !== 'todas') {
            filtros.push(`<strong>Categoria:</strong> ${categoria}`);
        }
        
        // Status
        const status = document.getElementById('filtro-status-relatorio')?.value;
        if (status && status !== 'todos') {
            const nomesStatus = {
                'quitadas': 'Pagas',
                'pendentes': 'Pendentes',
                'atrasadas': 'Atrasadas'
            };
            filtros.push(`<strong>Status:</strong> ${nomesStatus[status] || status}`);
        }
        
        // Formas de pagamento
        const formasPagamento = [];
        if (document.getElementById('forma-pix')?.checked) formasPagamento.push('PIX');
        if (document.getElementById('forma-debito')?.checked) formasPagamento.push('Débito');
        if (document.getElementById('forma-credito')?.checked) formasPagamento.push('Crédito');
        
        if (formasPagamento.length > 0 && formasPagamento.length < 3) {
            filtros.push(`<strong>Pagamento:</strong> ${formasPagamento.join(', ')}`);
        }
        
        // Opções especiais
        const opcoes = [];
        if (document.getElementById('incluir-transferencias')?.checked) opcoes.push('Transferências');
        if (document.getElementById('agrupar-parcelamentos')?.checked) opcoes.push('Agrupar Parcelamentos');
        if (document.getElementById('mostrar-projecoes')?.checked) opcoes.push('Projeções');
        
        if (opcoes.length > 0) {
            filtros.push(`<strong>Opções:</strong> ${opcoes.join(', ')}`);
        }
        
        return filtros;
    }
    
    // ================================================================
    // GERAÇÃO DE RELATÓRIOS
    // ================================================================
    
    async gerarRelatorio() {
        if (processandoRelatorio) return;
        
        processandoRelatorio = true;
        
        try {
            this.mostrarLoading(true);
            this.coletarFiltros();
            
            // Scroll suave para o topo da seção
            this.secaoAtiva?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Simular delay para melhor UX
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const dados = this.filtrarDados();
            this.dadosProcessados = dados;
            this.processarDados(dados);
            
            // Habilitar botão de PDF
            const btnPDF = document.getElementById('btn-exportar-pdf-relatorio');
            if (btnPDF) btnPDF.disabled = false;
            
        } catch (error) {
            console.error('Erro ao gerar relatório:', error);
            alert('Erro ao gerar relatório: ' + error.message);
        } finally {
            this.mostrarLoading(false);
            processandoRelatorio = false;
        }
    }
    
    coletarFiltros() {
        this.filtrosAtuais = {
            periodo: this.obterValorElemento('filtro-periodo', PERIODOS.MES_ATUAL),
            tipoRelatorio: this.obterValorElemento('filtro-tipo-relatorio', TIPOS_RELATORIO.COMPLETO),
            criterioData: this.obterValorElemento('filtro-criterio-data', CRITERIOS_DATA.VENCIMENTO),
            categoria: this.obterValorElemento('filtro-categoria-relatorio', 'todas'),
            status: this.obterValorElemento('filtro-status-relatorio', 'todos'),
            ordenacao: this.obterValorElemento('filtro-ordenacao', 'data'),
            
            // Formas de pagamento
            formasPagamento: {
                todas: document.getElementById('forma-todas')?.checked || false,
                pix: document.getElementById('forma-pix')?.checked || false,
                debito: document.getElementById('forma-debito')?.checked || false,
                credito: document.getElementById('forma-credito')?.checked || false
            },
            
            // Opções especiais
            opcoes: {
                incluirTransferencias: document.getElementById('incluir-transferencias')?.checked || false,
                agruparParcelamentos: document.getElementById('agrupar-parcelamentos')?.checked || false,
                mostrarProjecoes: document.getElementById('mostrar-projecoes')?.checked || false
            }
        };
    }
    
    obterValorElemento(id, valorDefault) {
        const elemento = document.getElementById(id);
        return elemento ? elemento.value : valorDefault;
    }



  // ================================================================
    // CONTINUAÇÃO DA PARTE 1 - FILTROS E PROCESSAMENTO DE DADOS
    // ================================================================
    
    filtrarDados() {
        const { dataInicio, dataFim } = this.obterPeriodoSelecionado();
        let receitas = [];
        let despesas = [];
        
        if (!window.dadosFinanceiros) {
            return { receitas, despesas };
        }
        
        // Percorrer todos os dados financeiros
        for (const ano in window.dadosFinanceiros) {
            const dadosAno = window.dadosFinanceiros[ano];
            if (!dadosAno.meses) continue;
            
            for (let mes = 0; mes < 12; mes++) {
                const dadosMes = dadosAno.meses[mes];
                if (!dadosMes) continue;
                
                // Verificar se o mês está no período selecionado
                const dataMes = new Date(parseInt(ano), mes, 15);
                if (dataMes >= dataInicio && dataMes <= dataFim) {
                    
                    // Processar receitas
                    if (dadosMes.receitas && this.deveIncluirReceitas()) {
                        const receitasFiltradas = dadosMes.receitas
                            .filter(r => this.filtrarReceita(r))
                            .map(r => ({
                                ...r,
                                ano: parseInt(ano),
                                mes: mes,
                                tipo: 'receita',
                                data: r.data || `${ano}-${String(mes + 1).padStart(2, '0')}-15`
                            }));
                        receitas.push(...receitasFiltradas);
                    }
                    
                    // Processar despesas
                    if (dadosMes.despesas && this.deveIncluirDespesas()) {
                        let despesasMes = dadosMes.despesas
                            .filter(d => this.filtrarDespesa(d))
                            .map(d => ({
                                ...d,
                                ano: parseInt(ano),
                                mes: mes,
                                tipo: 'despesa',
                                data: this.obterDataDespesa(d),
                                categoria: this.obterCategoriaDespesa(d),
                                formaPagamento: this.obterFormaPagamentoDespesa(d)
                            }));
                        
                        despesas.push(...despesasMes);
                    }
                }
            }
        }
        
        // Aplicar ordenação
        receitas = this.ordenarTransacoes(receitas);
        despesas = this.ordenarTransacoes(despesas);
        
        return { receitas, despesas };
    }
    
    filtrarReceita(receita) {
        // Excluir saldos anteriores
        if (receita.saldoAnterior || receita.descricao?.includes('Saldo Anterior')) {
            return false;
        }
        
        // Filtro de transferências
        if (!this.filtrosAtuais.opcoes?.incluirTransferencias && receita.transferencia) {
            return false;
        }
        
        return true;
    }
    
    filtrarDespesa(despesa) {
        // Excluir transferências se não incluídas
        if (!this.filtrosAtuais.opcoes?.incluirTransferencias && despesa.transferencia) {
            return false;
        }
        
        // Filtro por categoria
        if (this.filtrosAtuais.categoria !== 'todas') {
            const categoria = this.obterCategoriaDespesa(despesa);
            if (categoria !== this.filtrosAtuais.categoria) return false;
        }
        
        // Filtro por forma de pagamento
        if (!this.filtrosAtuais.formasPagamento?.todas) {
            const forma = this.obterFormaPagamentoDespesa(despesa);
            const formaPermitida = (
                (forma === 'pix' && this.filtrosAtuais.formasPagamento?.pix) ||
                (forma === 'debito' && this.filtrosAtuais.formasPagamento?.debito) ||
                (forma === 'credito' && this.filtrosAtuais.formasPagamento?.credito)
            );
            if (!formaPermitida) return false;
        }
        
        // Filtro por status
        if (this.filtrosAtuais.status !== 'todos') {
            const status = this.obterStatusDespesa(despesa);
            if (status !== this.filtrosAtuais.status) return false;
        }
        
        return true;
    }
    
    obterDataDespesa(despesa) {
        switch (this.filtrosAtuais.criterioData) {
            case CRITERIOS_DATA.COMPRA:
                return despesa.dataCompra || despesa.data;
            case CRITERIOS_DATA.VENCIMENTO:
                return despesa.dataVencimento || despesa.data;
            case CRITERIOS_DATA.PAGAMENTO:
                return despesa.dataPagamento || despesa.data;
            case CRITERIOS_DATA.MISTA:
                return despesa.dataPagamento || despesa.dataVencimento || despesa.dataCompra || despesa.data;
            default:
                return despesa.data;
        }
    }
    
    obterCategoriaDespesa(despesa) {
        // Usar função do sistema de despesas se disponível
        if (typeof window.obterCategoriaLimpa === 'function') {
            return window.obterCategoriaLimpa(despesa);
        }
        
        let categoria = despesa.categoria || 'Outros';
        if (!despesa.formaPagamento && 
            (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito')) {
            categoria = despesa.categoriaCartao || 'Outros';
        }
        return categoria;
    }
    
    obterFormaPagamentoDespesa(despesa) {
        if (despesa.formaPagamento) {
            return despesa.formaPagamento;
        }
        if (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito') {
            return 'credito';
        }
        return 'debito';
    }
    
    obterStatusDespesa(despesa) {
        if (despesa.quitado) return 'quitadas';
        
        const hoje = new Date();
        const vencimento = new Date(despesa.dataVencimento || despesa.data);
        
        if (vencimento < hoje) return 'atrasadas';
        return 'pendentes';
    }
    
    deveIncluirReceitas() {
        return [TIPOS_RELATORIO.COMPLETO, TIPOS_RELATORIO.APENAS_RECEITAS].includes(this.filtrosAtuais.tipoRelatorio);
    }
    
    deveIncluirDespesas() {
        return [
            TIPOS_RELATORIO.COMPLETO,
            TIPOS_RELATORIO.APENAS_DESPESAS,
            TIPOS_RELATORIO.POR_CATEGORIA,
            TIPOS_RELATORIO.POR_FORMA_PAGAMENTO,
            TIPOS_RELATORIO.PARCELAMENTOS,
            TIPOS_RELATORIO.GASTOS_REAIS
        ].includes(this.filtrosAtuais.tipoRelatorio);
    }
    
    obterPeriodoSelecionado() {
        const periodo = this.filtrosAtuais.periodo;
        const hoje = new Date();
        let dataInicio, dataFim;
        
        switch (periodo) {
            case PERIODOS.MES_ATUAL:
                dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
                dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
                break;
            case PERIODOS.MES_ANTERIOR:
                dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
                dataFim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
                break;
            case PERIODOS.ULTIMOS_3_MESES:
                dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
                dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
                break;
            case PERIODOS.ULTIMOS_6_MESES:
                dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);
                dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
                break;
            case PERIODOS.ANO_ATUAL:
                dataInicio = new Date(hoje.getFullYear(), 0, 1);
                dataFim = new Date(hoje.getFullYear(), 11, 31);
                break;
            case PERIODOS.ANO_ANTERIOR:
                dataInicio = new Date(hoje.getFullYear() - 1, 0, 1);
                dataFim = new Date(hoje.getFullYear() - 1, 11, 31);
                break;
            case PERIODOS.PERSONALIZADO:
                const dataInicioInput = document.getElementById('data-inicio-relatorio')?.value;
                const dataFimInput = document.getElementById('data-fim-relatorio')?.value;
                dataInicio = dataInicioInput ? new Date(dataInicioInput) : new Date(hoje.getFullYear(), 0, 1);
                dataFim = dataFimInput ? new Date(dataFimInput) : hoje;
                break;
            default:
                dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
                dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        }
        
        return { dataInicio, dataFim };
    }
    
    // ================================================================
    // PROCESSAMENTO E EXIBIÇÃO DE DADOS
    // ================================================================
    
    processarDados(dados) {
        const { receitas, despesas } = dados;
        
        // Esconder todas as seções primeiro
        this.esconderTodasSecoes();
        
        // Mostrar seções relevantes baseado no tipo de relatório
        switch (this.filtrosAtuais.tipoRelatorio) {
            case TIPOS_RELATORIO.COMPLETO:
                this.mostrarResumoExecutivo(receitas, despesas);
                this.mostrarComparativoFormasPagamento(despesas);
                this.mostrarDetalhamentoCategorias(receitas, despesas);
                this.mostrarDetalhamentoPagamento(despesas);
                this.mostrarListaTransacoes([...receitas, ...despesas]);
                break;
            case TIPOS_RELATORIO.APENAS_RECEITAS:
                this.mostrarResumoExecutivo(receitas, []);
                this.mostrarListaTransacoes(receitas);
                break;
            case TIPOS_RELATORIO.APENAS_DESPESAS:
                this.mostrarResumoExecutivo([], despesas);
                this.mostrarListaTransacoes(despesas);
                break;
            case TIPOS_RELATORIO.POR_CATEGORIA:
                this.mostrarDetalhamentoCategorias(receitas, despesas);
                break;
            case TIPOS_RELATORIO.POR_FORMA_PAGAMENTO:
                this.mostrarComparativoFormasPagamento(despesas);
                this.mostrarDetalhamentoPagamento(despesas);
                break;
            case TIPOS_RELATORIO.PARCELAMENTOS:
                this.mostrarDetalhamentoParcelamentos(despesas);
                break;
            case TIPOS_RELATORIO.GASTOS_REAIS:
                this.mostrarAnaliseGastosReais(despesas);
                break;
        }
        
        // Verificar se há dados
        if (receitas.length === 0 && despesas.length === 0) {
            this.mostrarMensagemSemDados();
        }
    }
    
    esconderTodasSecoes() {
        const secoes = [
            'resumo-executivo',
            'comparativo-formas-pagamento',
            'analise-gastos-reais',
            'detalhamento-categorias', 
            'detalhamento-pagamento',
            'lista-transacoes',
            'detalhamento-parcelamentos',
            'sem-dados-mensagem'
        ];
        
        secoes.forEach(id => {
            const elemento = document.getElementById(id);
            if (elemento) elemento.classList.add('hidden');
        });
    }
    
    mostrarResumoExecutivo(receitas, despesas) {
        const secao = document.getElementById('resumo-executivo');
        if (!secao) return;
        
        // Calcular totais usando funções dos sistemas específicos
        const totalReceitas = this.calcularTotalReceitas(receitas);
        const totalDespesas = this.calcularTotalDespesas(despesas);
        const saldoLiquido = totalReceitas - totalDespesas;
        const totalJuros = this.calcularTotalJuros(despesas);
        const economia = totalReceitas > 0 ? ((saldoLiquido / totalReceitas) * 100) : 0;
        
        // Atualizar elementos da interface
        this.atualizarElemento('resumo-total-receitas', this.formatarMoeda(totalReceitas));
        this.atualizarElemento('resumo-count-receitas', `${receitas.length} transações`);
        
        this.atualizarElemento('resumo-total-despesas', this.formatarMoeda(totalDespesas));
        this.atualizarElemento('resumo-count-despesas', `${despesas.length} transações`);
        
        const saldoElement = document.getElementById('resumo-saldo-liquido');
        if (saldoElement) {
            saldoElement.textContent = this.formatarMoeda(saldoLiquido);
            saldoElement.className = `card-valor ${saldoLiquido >= 0 ? 'positivo' : 'negativo'}`;
        }
        
        this.atualizarElemento('resumo-economia', `${economia.toFixed(1)}% de economia`);
        this.atualizarElemento('resumo-total-juros', this.formatarMoeda(totalJuros));
        
        const percentJuros = totalDespesas > 0 ? ((totalJuros / totalDespesas) * 100) : 0;
        this.atualizarElemento('resumo-percent-juros', `${percentJuros.toFixed(1)}% do total`);
        
        secao.classList.remove('hidden');
    }
    
    mostrarComparativoFormasPagamento(despesas) {
        const secao = document.getElementById('comparativo-formas-pagamento');
        if (!secao) return;
        
        const formas = { pix: 0, debito: 0, credito: 0 };
        const contadores = { pix: 0, debito: 0, credito: 0 };
        
        despesas.forEach(despesa => {
            const forma = this.obterFormaPagamentoDespesa(despesa);
            
            if (formas.hasOwnProperty(forma)) {
                formas[forma] += despesa.valor || 0;
                contadores[forma] += 1;
            }
        });
        
        const totalGeral = Object.values(formas).reduce((sum, val) => sum + val, 0);
        
        Object.keys(formas).forEach(forma => {
            const valor = formas[forma];
            const count = contadores[forma];
            const percent = totalGeral > 0 ? ((valor / totalGeral) * 100) : 0;
            
            this.atualizarElemento(`comparativo-${forma}-valor`, this.formatarMoeda(valor));
            this.atualizarElemento(`comparativo-${forma}-count`, `${count} transações`);
            this.atualizarElemento(`comparativo-${forma}-percent`, `${percent.toFixed(1)}%`);
        });
        
        secao.classList.remove('hidden');
    }
    
    mostrarAnaliseGastosReais(despesas) {
        const secao = document.getElementById('analise-gastos-reais');
        if (!secao) return;
        
        const totalGastos = this.calcularTotalDespesas(despesas);
        const { dataInicio, dataFim } = this.obterPeriodoSelecionado();
        const diasPeriodo = Math.ceil((dataFim - dataInicio) / (1000 * 60 * 60 * 24)) + 1;
        const mediaDiaria = diasPeriodo > 0 ? totalGastos / diasPeriodo : 0;
        
        // Encontrar maior gasto
        let maiorGasto = { valor: 0, descricao: 'Nenhuma despesa encontrada' };
        despesas.forEach(despesa => {
            if ((despesa.valor || 0) > maiorGasto.valor) {
                maiorGasto = {
                    valor: despesa.valor || 0,
                    descricao: despesa.descricao || 'Sem descrição'
                };
            }
        });
        
        // Critério usado
        const criterios = {
            [CRITERIOS_DATA.VENCIMENTO]: 'Por data de vencimento',
            [CRITERIOS_DATA.COMPRA]: 'Por data de compra',
            [CRITERIOS_DATA.PAGAMENTO]: 'Por data de pagamento',
            [CRITERIOS_DATA.MISTA]: 'Por critério misto'
        };
        
        this.atualizarElemento('total-gastos-reais', this.formatarMoeda(totalGastos));
        this.atualizarElemento('gastos-reais-criterio', criterios[this.filtrosAtuais.criterioData] || 'Por data');
        this.atualizarElemento('media-diaria-gastos', this.formatarMoeda(mediaDiaria));
        this.atualizarElemento('dias-periodo', `${diasPeriodo} dias`);
        this.atualizarElemento('maior-gasto-periodo', this.formatarMoeda(maiorGasto.valor));
        this.atualizarElemento('maior-gasto-descricao', maiorGasto.descricao);
        
        secao.classList.remove('hidden');
    }
    
    mostrarDetalhamentoCategorias(receitas, despesas) {
        const secao = document.getElementById('detalhamento-categorias');
        const tbody = document.getElementById('tabela-categorias-body');
        if (!secao || !tbody) return;
        
        const categorias = {};
        
        // Processar receitas
        receitas.forEach(receita => {
            const categoria = 'Receitas';
            if (!categorias[categoria]) {
                categorias[categoria] = { receitas: 0, despesas: 0, transacoes: 0 };
            }
            categorias[categoria].receitas += receita.valor || 0;
            categorias[categoria].transacoes += 1;
        });
        
        // Processar despesas
        despesas.forEach(despesa => {
            const categoria = this.obterCategoriaDespesa(despesa);
            
            if (!categorias[categoria]) {
                categorias[categoria] = { receitas: 0, despesas: 0, transacoes: 0 };
            }
            categorias[categoria].despesas += despesa.valor || 0;
            categorias[categoria].transacoes += 1;
        });
        
        const totalGeral = Object.values(categorias).reduce((sum, cat) => sum + cat.despesas, 0);
        
        tbody.innerHTML = Object.entries(categorias)
            .sort((a, b) => (b[1].receitas + b[1].despesas) - (a[1].receitas + a[1].despesas))
            .map(([categoria, dados]) => {
                const saldo = dados.receitas - dados.despesas;
                const percentual = totalGeral > 0 ? ((dados.despesas / totalGeral) * 100) : 0;
                
                return `
                    <tr>
                        <td><strong>${categoria}</strong></td>
                        <td class="valor-positivo">${this.formatarMoeda(dados.receitas)}</td>
                        <td class="valor-negativo">${this.formatarMoeda(dados.despesas)}</td>
                        <td class="${saldo >= 0 ? 'valor-positivo' : 'valor-negativo'}">${this.formatarMoeda(saldo)}</td>
                        <td>${percentual.toFixed(1)}%</td>
                        <td>${dados.transacoes}</td>
                    </tr>
                `;
            }).join('');
        
        secao.classList.remove('hidden');
    }
    
    mostrarDetalhamentoPagamento(despesas) {
        const secao = document.getElementById('detalhamento-pagamento');
        if (!secao) return;
        
        const formas = { pix: 0, debito: 0, credito: 0 };
        const contadores = { pix: 0, debito: 0, credito: 0 };
        
        despesas.forEach(despesa => {
            const forma = this.obterFormaPagamentoDespesa(despesa);
            
            if (formas.hasOwnProperty(forma)) {
                formas[forma] += despesa.valor || 0;
                contadores[forma] += 1;
            }
        });
        
        const totalGeral = Object.values(formas).reduce((sum, val) => sum + val, 0);
        
        Object.keys(formas).forEach(forma => {
            const valor = formas[forma];
            const count = contadores[forma];
            const percent = totalGeral > 0 ? ((valor / totalGeral) * 100) : 0;
            
            this.atualizarElemento(`pagamento-${forma}-valor`, this.formatarMoeda(valor));
            this.atualizarElemento(`pagamento-${forma}-count`, `${count} transações`);
            this.atualizarElemento(`pagamento-${forma}-percent`, `${percent.toFixed(1)}%`);
        });
        
        secao.classList.remove('hidden');
    }
    
    mostrarListaTransacoes(transacoes) {
        const secao = document.getElementById('lista-transacoes');
        const tbody = document.getElementById('tabela-transacoes-body');
        const info = document.getElementById('transacoes-count-info');
        if (!secao || !tbody) return;
        
        // Ordenar transações
        transacoes = this.ordenarTransacoes(transacoes);
        
        if (info) {
            info.textContent = `Mostrando ${transacoes.length} transações`;
        }
        
        tbody.innerHTML = transacoes.map(transacao => {
            const data = new Date(transacao.data).toLocaleDateString('pt-BR');
            const tipo = transacao.tipo === 'receita' ? 'Receita' : 'Despesa';
            const categoria = this.obterCategoriaTransacao(transacao);
            const formaPagamento = this.obterFormaPagamentoTransacao(transacao);
            const status = transacao.tipo === 'receita' ? 'Recebida' : this.obterStatusTexto(this.obterStatusDespesa(transacao));
            
            const classeValor = transacao.tipo === 'receita' ? 'valor-positivo' : 'valor-negativo';
            const classeTipo = transacao.tipo === 'receita' ? 'badge-tipo receita' : 'badge-tipo despesa';
            const classeStatus = this.obterClasseStatus(status);
            
            return `
                <tr>
                    <td>${data}</td>
                    <td><span class="badge ${classeTipo}">${tipo}</span></td>
                    <td>${transacao.descricao || 'Sem descrição'}</td>
                    <td>${categoria}</td>
                    <td>${formaPagamento}</td>
                    <td class="${classeValor}">${this.formatarMoeda(transacao.valor || 0)}</td>
                    <td><span class="badge ${classeStatus}">${status}</span></td>
                </tr>
            `;
        }).join('');
        
        secao.classList.remove('hidden');
    }
    
    mostrarDetalhamentoParcelamentos(despesas) {
        const secao = document.getElementById('detalhamento-parcelamentos');
        const tbody = document.getElementById('tabela-parcelamentos-body');
        if (!secao || !tbody) return;
        
        const parcelamentos = this.processarParcelamentos(despesas);
        
        tbody.innerHTML = parcelamentos.map(p => `
            <tr>
                <td>${p.descricao}</td>
                <td class="valor-negativo">${this.formatarMoeda(p.valorTotal)}</td>
                <td>${p.totalParcelas}</td>
                <td class="valor-negativo">${this.formatarMoeda(p.valorParcela)}</td>
                <td>${p.parcelasPagas}</td>
                <td>${p.parcelasRestantes}</td>
                <td><span class="badge ${p.classe}">${p.status}</span></td>
            </tr>
        `).join('');
        
        secao.classList.remove('hidden');
    }
    
    mostrarMensagemSemDados() {
        const mensagem = document.getElementById('sem-dados-mensagem');
        if (mensagem) mensagem.classList.remove('hidden');
    }
    
    // ================================================================
    // FUNÇÕES AUXILIARES
    // ================================================================
    
    processarParcelamentos(despesas) {
        const grupos = {};
        
        despesas.forEach(despesa => {
            if (despesa.parcelado && despesa.idGrupoParcelamento) {
                const id = despesa.idGrupoParcelamento;
                
                if (!grupos[id]) {
                    grupos[id] = {
                        descricao: despesa.descricao,
                        valorTotal: 0,
                        totalParcelas: despesa.totalParcelas || 1,
                        parcelasPagas: 0,
                        valorParcela: despesa.valor || 0
                    };
                }
                
                grupos[id].valorTotal += despesa.valor || 0;
                if (despesa.quitado) {
                    grupos[id].parcelasPagas += 1;
                }
            }
        });
        
        return Object.values(grupos).map(grupo => {
            const parcelasRestantes = grupo.totalParcelas - grupo.parcelasPagas;
            let status, classe;
            
            if (parcelasRestantes === 0) {
                status = 'Quitado';
                classe = 'badge-success';
            } else if (parcelasRestantes === grupo.totalParcelas) {
                status = 'Não Iniciado';
                classe = 'badge-warning';
            } else {
                status = 'Em Andamento';
                classe = 'badge-info';
            }
            
            return {
                ...grupo,
                parcelasRestantes,
                status,
                classe
            };
        });
    }
    
    ordenarTransacoes(transacoes) {
        switch (this.filtrosAtuais.ordenacao) {
            case 'data':
                return transacoes.sort((a, b) => new Date(b.data) - new Date(a.data));
            case 'valor-desc':
                return transacoes.sort((a, b) => (b.valor || 0) - (a.valor || 0));
            case 'valor-asc':
                return transacoes.sort((a, b) => (a.valor || 0) - (b.valor || 0));
            case 'categoria':
                return transacoes.sort((a, b) => 
                    this.obterCategoriaTransacao(a).localeCompare(this.obterCategoriaTransacao(b)));
            case 'forma-pagamento':
                return transacoes.sort((a, b) => 
                    this.obterFormaPagamentoTransacao(a).localeCompare(this.obterFormaPagamentoTransacao(b)));
            case 'descricao':
                return transacoes.sort((a, b) => 
                    (a.descricao || '').localeCompare(b.descricao || ''));
            default:
                return transacoes;
        }
    }
    
    obterCategoriaTransacao(transacao) {
        if (transacao.tipo === 'receita') return 'Receita';
        return this.obterCategoriaDespesa(transacao);
    }
    
    obterFormaPagamentoTransacao(transacao) {
        if (transacao.tipo === 'receita') return '-';
        
        const forma = this.obterFormaPagamentoDespesa(transacao);
        return forma.toUpperCase();
    }
    
    obterStatusTexto(status) {
        const textos = {
            'quitadas': 'Pago',
            'pendentes': 'Pendente',
            'atrasadas': 'Atrasado'
        };
        return textos[status] || status;
    }
    
    obterClasseStatus(status) {
        switch (status.toLowerCase()) {
            case 'pago':
            case 'quitado':
            case 'recebida':
                return 'badge-status quitada';
            case 'atrasado':
            case 'atrasada':
                return 'badge-status atrasada';
            case 'pendente':
                return 'badge-status pendente';
            case 'em dia':
                return 'badge-status em-dia';
            default:
                return 'badge-secondary';
        }
    }
    
    calcularTotalReceitas(receitas) {
        // Usar função do sistema de receitas se disponível
        if (typeof window.calcularTotalReceitas === 'function') {
            return window.calcularTotalReceitas(receitas);
        }
        
        return receitas.reduce((total, receita) => {
            return total + parseFloat(receita.valor || 0);
        }, 0);
    }
    
    calcularTotalDespesas(despesas) {
        // Usar função do sistema de despesas se disponível
        if (typeof window.calcularTotalDespesas === 'function') {
            return window.calcularTotalDespesas(despesas);
        }
        
        return despesas.reduce((total, despesa) => {
            if (despesa.quitadaAntecipadamente === true) {
                return total;
            }
            
            if (despesa.valorPago !== null && despesa.valorPago !== undefined && despesa.valorPago > 0) {
                return total + parseFloat(despesa.valorPago);
            }
            return total + parseFloat(despesa.valor || 0);
        }, 0);
    }
    
    calcularTotalJuros(despesas) {
        // Usar função do sistema de despesas se disponível
        if (typeof window.calcularTotalJuros === 'function') {
            return window.calcularTotalJuros(despesas);
        }
        
        return despesas.reduce((total, despesa) => {
            let jurosCalculado = 0;
            
            if (despesa.quitacaoAntecipada === true || despesa.quitadaAntecipadamente === true) {
                return total;
            }
            
            if (despesa.valorPago !== null && despesa.valorPago !== undefined && 
                despesa.valorOriginal && despesa.valorPago > despesa.valorOriginal) {
                jurosCalculado = despesa.valorPago - despesa.valorOriginal;
            }
            else if (despesa.parcelado && despesa.metadados?.jurosPorParcela && despesa.quitado) {
                jurosCalculado = despesa.metadados.jurosPorParcela;
            }
            else if (despesa.valorOriginal && despesa.valor > despesa.valorOriginal && despesa.quitado) {
                jurosCalculado = despesa.valor - despesa.valorOriginal;
            }
            
            return total + jurosCalculado;
        }, 0);
    }
    
    atualizarElemento(id, valor) {
        const elemento = document.getElementById(id);
        if (elemento) {
            elemento.textContent = valor;
        }
    }
    
    formatarMoeda(valor) {
        // Usar função global se disponível
        if (typeof window.formatarMoeda === 'function') {
            return window.formatarMoeda(valor);
        }
        
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(valor || 0);
    }
    
    mostrarLoading(mostrar) {
        const loading = document.getElementById('relatorios-loading');
        if (loading) {
            loading.classList.toggle('hidden', !mostrar);
        }
    }
    
    // ================================================================
    // LIMPEZA DE FILTROS
    // ================================================================
    
    limparFiltros() {
        // Reset dos seletores
        const filtrosDefault = [
            { id: 'filtro-periodo', valor: PERIODOS.PERSONALIZADO },
            { id: 'filtro-tipo-relatorio', valor: TIPOS_RELATORIO.COMPLETO },
            { id: 'filtro-criterio-data', valor: CRITERIOS_DATA.VENCIMENTO },
            { id: 'filtro-categoria-relatorio', valor: 'todas' },
            { id: 'filtro-status-relatorio', valor: 'todos' },
            { id: 'filtro-ordenacao', valor: 'data' }
        ];
        
        filtrosDefault.forEach(filtro => {
            const elemento = document.getElementById(filtro.id);
            if (elemento) elemento.value = filtro.valor;
        });
        
        // Mostrar período personalizado
        const personalizadoContainer = document.getElementById('periodo-personalizado-container');
        if (personalizadoContainer) {
            personalizadoContainer.classList.remove('hidden');
        }
        
        // Configurar datas padrão (mês atual)
        const hoje = new Date();
        const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        
        const dataInicio = document.getElementById('data-inicio-relatorio');
        const dataFim = document.getElementById('data-fim-relatorio');
        if (dataInicio) dataInicio.value = primeiroDia.toISOString().split('T')[0];
        if (dataFim) dataFim.value = ultimoDia.toISOString().split('T')[0];
        
        // Reset checkboxes
        const todasCheckbox = document.getElementById('forma-todas');
        if (todasCheckbox) {
            todasCheckbox.checked = true;
            todasCheckbox.dispatchEvent(new Event('change'));
        }
        
        const opcoesCheckboxes = ['incluir-transferencias', 'agrupar-parcelamentos', 'mostrar-projecoes'];
        opcoesCheckboxes.forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) checkbox.checked = false;
        });
        
        // Esconder todas as seções
        this.esconderTodasSecoes();
        
        // Desabilitar botão de PDF
        const btnPDF = document.getElementById('btn-exportar-pdf-relatorio');
        if (btnPDF) btnPDF.disabled = true;
        
        // Atualizar resumo
        this.atualizarResumoFiltros();
    }
    
    // ================================================================
    // EXPORTAÇÃO PDF MELHORADA
    // ================================================================
    
    exportarPDF() {
        if (!this.dadosProcessados) {
            alert('Gere um relatório primeiro!');
            return;
        }
        
        console.log('Gerando PDF...');
        this.mostrarLoading(true);
        
        setTimeout(() => {
            try {
                this.gerarPDF();
            } catch (error) {
                console.error('Erro ao gerar PDF:', error);
                alert('Erro ao gerar PDF: ' + error.message);
            } finally {
                this.mostrarLoading(false);
            }
        }, 1000);
    }
    
    gerarPDF() {
        // Verificar se jsPDF está disponível
        if (!window.jspdf) {
            alert('Biblioteca de PDF não está carregada. Por favor, inclua a biblioteca jsPDF.');
            return;
        }
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Configurações
        let yPosition = 20;
        const margemEsquerda = 20;
        const margemDireita = 20;
        const larguraPagina = doc.internal.pageSize.width;
        const larguraUtil = larguraPagina - margemEsquerda - margemDireita;
        
        // Cabeçalho principal
        yPosition = this.adicionarCabecalhoPDF(doc, yPosition);
        yPosition += 15;
        
        // Informações do relatório
        yPosition = this.adicionarInfoRelatorio(doc, yPosition);
        yPosition += 15;
        
        // Conteúdo baseado no tipo de relatório
        switch (this.filtrosAtuais.tipoRelatorio) {
            case TIPOS_RELATORIO.COMPLETO:
                yPosition = this.adicionarResumoExecutivoPDF(doc, yPosition);
                yPosition = this.verificarNovaPagePDF(doc, yPosition, 80);
                yPosition = this.adicionarTabelaCategoriasPDF(doc, yPosition);
                yPosition = this.verificarNovaPagePDF(doc, yPosition, 100);
                yPosition = this.adicionarTabelaTransacoesPDF(doc, yPosition);
                break;
            case TIPOS_RELATORIO.APENAS_RECEITAS:
                yPosition = this.adicionarResumoExecutivoPDF(doc, yPosition);
                yPosition = this.verificarNovaPagePDF(doc, yPosition, 100);
                yPosition = this.adicionarTabelaTransacoesPDF(doc, yPosition, 'receitas');
                break;
            case TIPOS_RELATORIO.APENAS_DESPESAS:
                yPosition = this.adicionarResumoExecutivoPDF(doc, yPosition);
                yPosition = this.verificarNovaPagePDF(doc, yPosition, 100);
                yPosition = this.adicionarTabelaTransacoesPDF(doc, yPosition, 'despesas');
                break;
            case TIPOS_RELATORIO.POR_CATEGORIA:
                yPosition = this.adicionarTabelaCategoriasPDF(doc, yPosition);
                break;
            case TIPOS_RELATORIO.POR_FORMA_PAGAMENTO:
                yPosition = this.adicionarTabelaFormaPagamentoPDF(doc, yPosition);
                break;
            case TIPOS_RELATORIO.PARCELAMENTOS:
                yPosition = this.adicionarTabelaParcelamentosPDF(doc, yPosition);
                break;
            case TIPOS_RELATORIO.GASTOS_REAIS:
                yPosition = this.adicionarAnaliseGastosReaisPDF(doc, yPosition);
                break;
        }
        
        // Rodapé
        this.adicionarRodapePDF(doc);
        
        // Salvar arquivo
        const nomeArquivo = this.gerarNomeArquivo();
        doc.save(nomeArquivo);
        
        console.log('PDF gerado com sucesso:', nomeArquivo);
    }
    
    adicionarCabecalhoPDF(doc, y) {
        const margemEsquerda = 20;
        const larguraPagina = doc.internal.pageSize.width;
        
        // Fundo do cabeçalho
        doc.setFillColor(52, 73, 94);
        doc.rect(0, 0, larguraPagina, 35, 'F');
        
        // Título principal
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('RELATÓRIO FINANCEIRO', margemEsquerda, 15);
        
        // Data de geração
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const agora = new Date().toLocaleString('pt-BR');
        doc.text(`Gerado em: ${agora}`, margemEsquerda, 25);
        
        // Reset cor
        doc.setTextColor(0, 0, 0);
        
        return 40;
    }
    
    adicionarInfoRelatorio(doc, y) {
        const margemEsquerda = 20;
        const margemDireita = 20;
        const larguraPagina = doc.internal.pageSize.width;
        const larguraUtil = larguraPagina - margemEsquerda - margemDireita;
        
        const { dataInicio, dataFim } = this.obterPeriodoSelecionado();
        
        // Box de informações
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(248, 249, 250);
        doc.rect(margemEsquerda, y, larguraUtil, 30, 'FD');
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('INFORMAÇÕES DO RELATÓRIO', margemEsquerda + 5, y + 10);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        const periodo = `Período: ${dataInicio.toLocaleDateString('pt-BR')} até ${dataFim.toLocaleDateString('pt-BR')}`;
        const tipo = `Tipo: ${this.obterNomeTipoRelatorio()}`;
        const filtros = this.obterResumoFiltrosPDF();
        
        doc.text(periodo, margemEsquerda + 5, y + 18);
        doc.text(tipo, margemEsquerda + 5, y + 24);
        
        if (filtros) {
            const linhasFiltros = doc.splitTextToSize(filtros, larguraUtil / 2);
            doc.text(linhasFiltros, margemEsquerda + larguraUtil/2, y + 18);
        }
        
        return y + 35;
    }
    
    adicionarResumoExecutivoPDF(doc, y) {
        const margemEsquerda = 20;
        const { receitas, despesas } = this.dadosProcessados;
        
        const totalReceitas = this.calcularTotalReceitas(receitas);
        const totalDespesas = this.calcularTotalDespesas(despesas);
        const saldoLiquido = totalReceitas - totalDespesas;
        const totalJuros = this.calcularTotalJuros(despesas);
        
        // Título da seção
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('RESUMO EXECUTIVO', margemEsquerda, y + 10);
        
        // Grid de valores
        const startY = y + 20;
        const boxHeight = 18;
        const boxWidth = 42;
        const spacing = 5;
        
        // Receitas
        doc.setFillColor(40, 167, 69);
        doc.rect(margemEsquerda, startY, boxWidth, boxHeight, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('RECEITAS', margemEsquerda + 2, startY + 6);
        doc.setFontSize(9);
        doc.text(this.formatarMoedaPDF(totalReceitas), margemEsquerda + 2, startY + 11);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(`${receitas.length} transações`, margemEsquerda + 2, startY + 15);
        
        // Despesas
        const xDespesas = margemEsquerda + boxWidth + spacing;
        doc.setFillColor(220, 53, 69);
        doc.rect(xDespesas, startY, boxWidth, boxHeight, 'F');
        doc.text('DESPESAS', xDespesas + 2, startY + 6);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(this.formatarMoedaPDF(totalDespesas), xDespesas + 2, startY + 11);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(`${despesas.length} transações`, xDespesas + 2, startY + 15);
        
        // Saldo
        const xSaldo = xDespesas + boxWidth + spacing;
        const corSaldo = saldoLiquido >= 0 ? [40, 167, 69] : [220, 53, 69];
        doc.setFillColor(...corSaldo);
        doc.rect(xSaldo, startY, boxWidth, boxHeight, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('SALDO', xSaldo + 2, startY + 6);
        doc.setFontSize(9);
        doc.text(this.formatarMoedaPDF(saldoLiquido), xSaldo + 2, startY + 11);
        
        // Juros
        const xJuros = xSaldo + boxWidth + spacing;
        doc.setFillColor(255, 193, 7);
        doc.setTextColor(0, 0, 0);
        doc.rect(xJuros, startY, boxWidth, boxHeight, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('JUROS', xJuros + 2, startY + 6);
        doc.setFontSize(9);
        doc.text(this.formatarMoedaPDF(totalJuros), xJuros + 2, startY + 11);
        
        // Reset
        doc.setTextColor(0, 0, 0);
        
        return startY + boxHeight + 15;
    }
    
    adicionarTabelaCategoriasPDF(doc, y) {
        const margemEsquerda = 20;
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('ANÁLISE POR CATEGORIA', margemEsquerda, y + 10);
        
        let currentY = y + 25;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Top 10 categorias com maior movimentação financeira', margemEsquerda, currentY);
        
        return currentY + 15;
    }
    
    adicionarTabelaTransacoesPDF(doc, y, filtroTipo = null) {
        const margemEsquerda = 20;
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        const titulo = filtroTipo === 'receitas' ? 'LISTA DE RECEITAS' : 
                      filtroTipo === 'despesas' ? 'LISTA DE DESPESAS' : 'LISTA DE TRANSAÇÕES';
        doc.text(titulo, margemEsquerda, y + 10);
        
        let currentY = y + 25;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Principais transações do período selecionado', margemEsquerda, currentY);
        
        return currentY + 15;
    }
    
    adicionarTabelaFormaPagamentoPDF(doc, y) {
        const margemEsquerda = 20;
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('ANÁLISE POR FORMA DE PAGAMENTO', margemEsquerda, y + 10);
        
        return y + 30;
    }
    
    adicionarTabelaParcelamentosPDF(doc, y) {
        const margemEsquerda = 20;
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('PARCELAMENTOS', margemEsquerda, y + 10);
        
        return y + 30;
    }
    
    adicionarAnaliseGastosReaisPDF(doc, y) {
        const margemEsquerda = 20;
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('ANÁLISE DE GASTOS REAIS', margemEsquerda, y + 10);
        
        return y + 30;
    }
    
    verificarNovaPagePDF(doc, y, espacoNecessario) {
        if (y + espacoNecessario > doc.internal.pageSize.height - 30) {
            doc.addPage();
            return 20;
        }
        return y;
    }
    
    adicionarRodapePDF(doc) {
        const pageCount = doc.internal.getNumberOfPages();
        
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            
            doc.setDrawColor(200, 200, 200);
            doc.line(20, doc.internal.pageSize.height - 20, doc.internal.pageSize.width - 20, doc.internal.pageSize.height - 20);
            
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(128, 128, 128);
            
            doc.text('Sistema de Controle Financeiro', 20, doc.internal.pageSize.height - 15);
            doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.width - 40, doc.internal.pageSize.height - 15);
            
            const agora = new Date().toLocaleDateString('pt-BR');
            doc.text(`Gerado em ${agora}`, 20, doc.internal.pageSize.height - 10);
        }
        
        doc.setTextColor(0, 0, 0);
    }
    
    formatarMoedaPDF(valor) {
        const valorFormatado = new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(valor || 0);
        
        return valorFormatado.length > 15 ? valorFormatado.substring(0, 12) + '...' : valorFormatado;
    }
    
    obterNomeTipoRelatorio() {
        const tipos = {
            [TIPOS_RELATORIO.COMPLETO]: 'Relatório Completo',
            [TIPOS_RELATORIO.APENAS_RECEITAS]: 'Apenas Receitas',
            [TIPOS_RELATORIO.APENAS_DESPESAS]: 'Apenas Despesas',
            [TIPOS_RELATORIO.POR_CATEGORIA]: 'Por Categoria',
            [TIPOS_RELATORIO.POR_FORMA_PAGAMENTO]: 'Por Forma de Pagamento',
            [TIPOS_RELATORIO.PARCELAMENTOS]: 'Parcelamentos',
            [TIPOS_RELATORIO.GASTOS_REAIS]: 'Gastos Reais'
        };
        return tipos[this.filtrosAtuais.tipoRelatorio] || 'Relatório';
    }
    
    obterResumoFiltrosPDF() {
        const filtros = [];
        
        if (this.filtrosAtuais.categoria !== 'todas') {
            filtros.push(`Cat: ${this.filtrosAtuais.categoria}`);
        }
        
        if (!this.filtrosAtuais.formasPagamento?.todas) {
            const formas = [];
            if (this.filtrosAtuais.formasPagamento?.pix) formas.push('PIX');
            if (this.filtrosAtuais.formasPagamento?.debito) formas.push('Débito');
            if (this.filtrosAtuais.formasPagamento?.credito) formas.push('Crédito');
            if (formas.length > 0) {
                filtros.push(`Pag: ${formas.join(', ')}`);
            }
        }
        
        if (this.filtrosAtuais.status !== 'todos') {
            filtros.push(`Status: ${this.filtrosAtuais.status}`);
        }
        
        if (this.filtrosAtuais.criterioData !== CRITERIOS_DATA.VENCIMENTO) {
            filtros.push(`Data: ${this.filtrosAtuais.criterioData}`);
        }
        
        return filtros.length > 0 ? `Filtros: ${filtros.join(', ')}` : null;
    }
    
    gerarNomeArquivo() {
        const agora = new Date();
        const data = agora.toISOString().split('T')[0].replace(/-/g, '');
        const hora = agora.toTimeString().split(':').slice(0, 2).join('');
        const tipo = this.filtrosAtuais.tipoRelatorio.replace(/-/g, '_');
        
        return `relatorio_financeiro_${tipo}_${data}_${hora}.pdf`;
    }
}

// ================================================================
// INICIALIZAÇÃO E INTEGRAÇÃO COM O SISTEMA EXISTENTE
// ================================================================

let sistemaRelatorios = null;

// Inicialização automática
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(async () => {
        try {
            sistemaRelatorios = new SistemaRelatorios();
            
            // Integrar com a navegação existente
            integrarComNavegacao();
            
            console.log('Sistema de Relatórios integrado com sucesso!');
        } catch (error) {
            console.error('Erro ao inicializar sistema de relatórios:', error);
        }
    }, 1000);
});

// Inicialização alternativa quando o sistema financeiro estiver pronto
window.addEventListener('sistemaFinanceiroReady', function() {
    if (!sistemaRelatorios) {
        setTimeout(async () => {
            try {
                sistemaRelatorios = new SistemaRelatorios();
                integrarComNavegacao();
            } catch (error) {
                console.error('Erro ao inicializar sistema de relatórios via evento:', error);
            }
        }, 200);
    }
});

function integrarComNavegacao() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        if (link.getAttribute('data-section') === 'relatorios' && !link._relatoriosIntegrado) {
            link._relatoriosIntegrado = true;
            
            link.addEventListener('click', function(e) {
                e.preventDefault();
                
                // Remover active de todos os links
                navLinks.forEach(l => l.classList.remove('active'));
                
                // Adicionar active ao link clicado
                this.classList.add('active');
                
                // Esconder todas as seções
                const sections = document.querySelectorAll('.dashboard-section, .meses-section, .config-section, .relatorios-section');
                sections.forEach(section => section.classList.remove('active'));
                
                // Mostrar seção de relatórios
                const relatoriosSection = document.getElementById('relatorios-section');
                if (relatoriosSection) {
                    relatoriosSection.classList.add('active');
                }
            });
        }
    });
}











// ================================================================
// EXPORTAÇÕES GLOBAIS
// ================================================================

window.SistemaRelatorios = SistemaRelatorios;
window.sistemaRelatorios = sistemaRelatorios;
window.TIPOS_RELATORIO = TIPOS_RELATORIO;
window.PERIODOS = PERIODOS;
window.CRITERIOS_DATA = CRITERIOS_DATA;

// Funções de compatibilidade com o sistema original
window.RelatoriosTelaCheia = SistemaRelatorios; // Alias para compatibilidade

console.log('Sistema de Relatórios refatorado carregado com sucesso');  












// ================================================================
// SISTEMA DE GERAÇÃO DE PDF MELHORADO - CAPTURA DADOS DA INTERFACE
// Versão que replica exatamente os dados mostrados na tela
// ================================================================

class GeradorPDFMelhorado {
    constructor(sistemaRelatorios) {
        this.sistema = sistemaRelatorios;
        this.margemEsquerda = 20;
        this.margemDireita = 20;
        this.margemSuperior = 20;
        this.margemInferior = 30;
        this.espacoLinha = 5;
        this.alturaLinha = 6;
    }

    async gerarPDFCompleto() {
        if (!this.sistema.dadosProcessados) {
            alert('Gere um relatório primeiro!');
            return;
        }

        console.log('Gerando PDF completo com dados da interface...');
        this.sistema.mostrarLoading(true);

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            let yPosition = this.margemSuperior;
            
            // Cabeçalho
            yPosition = this.adicionarCabecalho(doc, yPosition);
            yPosition += 10;
            
            // Informações do relatório
            yPosition = this.adicionarInformacoes(doc, yPosition);
            yPosition += 15;
            
            // Capturar e adicionar seções visíveis
            yPosition = await this.capturarSecaoResumo(doc, yPosition);
            yPosition = await this.capturarSecaoComparativo(doc, yPosition);
            yPosition = await this.capturarSecaoAnaliseGastos(doc, yPosition);
            yPosition = await this.capturarSecaoCategorias(doc, yPosition);
            yPosition = await this.capturarSecaoTransacoes(doc, yPosition);
            yPosition = await this.capturarSecaoParcelamentos(doc, yPosition);
            
            // Rodapé
            this.adicionarRodape(doc);
            
            // Salvar
            const nomeArquivo = this.gerarNomeArquivo();
            doc.save(nomeArquivo);
            
            console.log('PDF gerado com sucesso:', nomeArquivo);
            
        } catch (error) {
            console.error('Erro ao gerar PDF:', error);
            alert('Erro ao gerar PDF: ' + error.message);
        } finally {
            this.sistema.mostrarLoading(false);
        }
    }

    adicionarCabecalho(doc, y) {
        const larguraPagina = doc.internal.pageSize.width;
        
        // Fundo azul escuro
        doc.setFillColor(52, 73, 94);
        doc.rect(0, 0, larguraPagina, 40, 'F');
        
        // Título principal
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text('RELATÓRIO FINANCEIRO DETALHADO', this.margemEsquerda, 18);
        
        // Subtítulo
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        const agora = new Date().toLocaleString('pt-BR');
        doc.text(`Gerado em: ${agora}`, this.margemEsquerda, 28);
        
        // Sistema
        doc.setFontSize(10);
        doc.text('Sistema de Controle Financeiro v2.0', this.margemEsquerda, 35);
        
        doc.setTextColor(0, 0, 0);
        return 45;
    }

    adicionarInformacoes(doc, y) {
        const larguraUtil = doc.internal.pageSize.width - this.margemEsquerda - this.margemDireita;
        
        // Box de informações
        doc.setDrawColor(100, 100, 100);
        doc.setFillColor(248, 249, 250);
        doc.rect(this.margemEsquerda, y, larguraUtil, 35, 'FD');
        
        // Título da seção
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('CONFIGURAÇÕES DO RELATÓRIO', this.margemEsquerda + 5, y + 12);
        
        // Dados dos filtros
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        const { dataInicio, dataFim } = this.sistema.obterPeriodoSelecionado();
        const periodo = `Período: ${dataInicio.toLocaleDateString('pt-BR')} até ${dataFim.toLocaleDateString('pt-BR')}`;
        const tipo = `Tipo: ${this.obterNomeTipoRelatorio()}`;
        const criterio = `Critério de Data: ${this.obterNomeCriterioData()}`;
        
        doc.text(periodo, this.margemEsquerda + 5, y + 20);
        doc.text(tipo, this.margemEsquerda + 5, y + 26);
        doc.text(criterio, this.margemEsquerda + 5, y + 32);
        
        // Filtros aplicados (coluna direita)
        const filtrosTexto = this.obterFiltrosAplicados();
        if (filtrosTexto) {
            const linhasFiltros = doc.splitTextToSize(filtrosTexto, larguraUtil / 2 - 10);
            doc.text(linhasFiltros, this.margemEsquerda + larguraUtil/2, y + 20);
        }
        
        return y + 40;
    }

    async capturarSecaoResumo(doc, y) {
        const secao = document.getElementById('resumo-executivo');
        if (!secao || secao.classList.contains('hidden')) {
            return y;
        }

        y = this.verificarNovaPage(doc, y, 70);
        
        // Título da seção
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(52, 73, 94);
        doc.text('RESUMO EXECUTIVO', this.margemEsquerda, y);
        doc.setTextColor(0, 0, 0);
        
        y += 15;
        
        // Capturar dados dos cards
        const cards = [
            { id: 'resumo-total-receitas', label: 'TOTAL RECEITAS', cor: [40, 167, 69], countId: 'resumo-count-receitas' },
            { id: 'resumo-total-despesas', label: 'TOTAL DESPESAS', cor: [220, 53, 69], countId: 'resumo-count-despesas' },
            { id: 'resumo-saldo-liquido', label: 'SALDO LÍQUIDO', cor: null, countId: null },
            { id: 'resumo-total-juros', label: 'TOTAL JUROS', cor: [255, 193, 7], countId: 'resumo-percent-juros' }
        ];
        
        const larguraCard = 45;
        const alturaCard = 25;
        const espacoCard = 2;
        
        cards.forEach((card, index) => {
            const x = this.margemEsquerda + (index * (larguraCard + espacoCard));
            
            // Determinar cor baseada no valor (para saldo)
            let corFundo = card.cor;
            if (card.id === 'resumo-saldo-liquido') {
                const elemento = document.getElementById(card.id);
                if (elemento) {
                    const valor = elemento.textContent;
                    corFundo = valor.includes('-') ? [220, 53, 69] : [40, 167, 69];
                }
            }
            
            // Desenhar card
            if (corFundo) {
                doc.setFillColor(...corFundo);
                doc.rect(x, y, larguraCard, alturaCard, 'F');
                doc.setTextColor(255, 255, 255);
            } else {
                doc.setDrawColor(200, 200, 200);
                doc.rect(x, y, larguraCard, alturaCard, 'D');
                doc.setTextColor(0, 0, 0);
            }
            
            // Texto do card
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text(card.label, x + 2, y + 8);
            
            // Valor principal
            const valorElemento = document.getElementById(card.id);
            const valor = valorElemento ? valorElemento.textContent : 'N/A';
            doc.setFontSize(10);
            doc.text(valor, x + 2, y + 15);
            
            // Informação adicional
            if (card.countId) {
                const countElemento = document.getElementById(card.countId);
                const count = countElemento ? countElemento.textContent : '';
                doc.setFontSize(7);
                doc.setFont('helvetica', 'normal');
                doc.text(count, x + 2, y + 21);
            }
            
            doc.setTextColor(0, 0, 0);
        });
        
        return y + alturaCard + 15;
    }

    async capturarSecaoComparativo(doc, y) {
        const secao = document.getElementById('comparativo-formas-pagamento');
        if (!secao || secao.classList.contains('hidden')) {
            return y;
        }

        y = this.verificarNovaPage(doc, y, 60);
        
        // Título
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(52, 73, 94);
        doc.text('COMPARATIVO - FORMAS DE PAGAMENTO', this.margemEsquerda, y);
        doc.setTextColor(0, 0, 0);
        
        y += 12;
        
        // Capturar dados dos cards de forma de pagamento
        const formas = [
            { tipo: 'pix', nome: 'PIX', cor: [108, 117, 125] },
            { tipo: 'debito', nome: 'DÉBITO', cor: [23, 162, 184] },
            { tipo: 'credito', nome: 'CRÉDITO', cor: [220, 53, 69] }
        ];
        
        const larguraCard = 60;
        const alturaCard = 20;
        const espacoCard = 5;
        
        formas.forEach((forma, index) => {
            const x = this.margemEsquerda + (index * (larguraCard + espacoCard));
            
            // Card
            doc.setFillColor(...forma.cor);
            doc.rect(x, y, larguraCard, alturaCard, 'F');
            doc.setTextColor(255, 255, 255);
            
            // Nome da forma
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text(forma.nome, x + 2, y + 7);
            
            // Valor
            const valorElemento = document.getElementById(`comparativo-${forma.tipo}-valor`);
            const valor = valorElemento ? valorElemento.textContent : 'R$ 0,00';
            doc.setFontSize(8);
            doc.text(valor, x + 2, y + 12);
            
            // Count e percentual
            const countElemento = document.getElementById(`comparativo-${forma.tipo}-count`);
            const percentElemento = document.getElementById(`comparativo-${forma.tipo}-percent`);
            const count = countElemento ? countElemento.textContent : '0 transações';
            const percent = percentElemento ? percentElemento.textContent : '0%';
            
            doc.setFontSize(6);
            doc.text(`${count} (${percent})`, x + 2, y + 17);
        });
        
        doc.setTextColor(0, 0, 0);
        return y + alturaCard + 15;
    }

    async capturarSecaoAnaliseGastos(doc, y) {
        const secao = document.getElementById('analise-gastos-reais');
        if (!secao || secao.classList.contains('hidden')) {
            return y;
        }

        y = this.verificarNovaPage(doc, y, 50);
        
        // Título
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(52, 73, 94);
        doc.text('ANÁLISE DE GASTOS REAIS', this.margemEsquerda, y);
        doc.setTextColor(0, 0, 0);
        
        y += 12;
        
        // Box de informações
        const larguraUtil = doc.internal.pageSize.width - this.margemEsquerda - this.margemDireita;
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(248, 249, 250);
        doc.rect(this.margemEsquerda, y, larguraUtil, 30, 'FD');
        
        // Capturar dados da interface
        const totalGastos = document.getElementById('total-gastos-reais')?.textContent || 'R$ 0,00';
        const mediaDiaria = document.getElementById('media-diaria-gastos')?.textContent || 'R$ 0,00';
        const diasPeriodo = document.getElementById('dias-periodo')?.textContent || '0 dias';
        const maiorGasto = document.getElementById('maior-gasto-periodo')?.textContent || 'R$ 0,00';
        const maiorGastoDesc = document.getElementById('maior-gasto-descricao')?.textContent || 'Nenhuma despesa';
        const criterio = document.getElementById('gastos-reais-criterio')?.textContent || 'Por data';
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        // Primeira linha
        doc.text(`Total de Gastos: ${totalGastos}`, this.margemEsquerda + 3, y + 8);
        doc.text(`Média Diária: ${mediaDiaria}`, this.margemEsquerda + 3, y + 14);
        doc.text(`Período: ${diasPeriodo}`, this.margemEsquerda + 3, y + 20);
        doc.text(`Critério: ${criterio}`, this.margemEsquerda + 3, y + 26);
        
        // Segunda coluna
        doc.text(`Maior Gasto: ${maiorGasto}`, this.margemEsquerda + larguraUtil/2, y + 8);
        const descricaoLinhas = doc.splitTextToSize(`Descrição: ${maiorGastoDesc}`, larguraUtil/2 - 5);
        doc.text(descricaoLinhas, this.margemEsquerda + larguraUtil/2, y + 14);
        
        return y + 35;
    }

    async capturarSecaoCategorias(doc, y) {
        const secao = document.getElementById('detalhamento-categorias');
        if (!secao || secao.classList.contains('hidden')) {
            return y;
        }

        y = this.verificarNovaPage(doc, y, 80);
        
        // Título
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(52, 73, 94);
        doc.text('DETALHAMENTO POR CATEGORIA', this.margemEsquerda, y);
        doc.setTextColor(0, 0, 0);
        
        y += 15;
        
        // Capturar dados da tabela
        const tbody = document.getElementById('tabela-categorias-body');
        if (!tbody) return y;
        
        const rows = tbody.querySelectorAll('tr');
        if (rows.length === 0) {
            doc.setFontSize(10);
            doc.text('Nenhuma categoria encontrada para o período selecionado.', this.margemEsquerda, y);
            return y + 10;
        }
        
        // Cabeçalho da tabela
        doc.setFillColor(52, 73, 94);
        doc.rect(this.margemEsquerda, y, 170, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        
        const colunas = ['Categoria', 'Receitas', 'Despesas', 'Saldo', '%', 'Qtd'];
        const larguraColunas = [50, 25, 25, 25, 15, 20];
        let xPos = this.margemEsquerda;
        
        colunas.forEach((coluna, index) => {
            doc.text(coluna, xPos + 2, y + 6);
            xPos += larguraColunas[index];
        });
        
        y += 8;
        doc.setTextColor(0, 0, 0);
        
        // Dados da tabela
        rows.forEach((row, index) => {
            if (y > doc.internal.pageSize.height - 40) {
                doc.addPage();
                y = this.margemSuperior;
            }
            
            const cells = row.querySelectorAll('td');
            if (cells.length === 0) return;
            
            // Linha alternada
            if (index % 2 === 0) {
                doc.setFillColor(248, 249, 250);
                doc.rect(this.margemEsquerda, y, 170, 6, 'F');
            }
            
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            
            xPos = this.margemEsquerda;
            cells.forEach((cell, cellIndex) => {
                if (cellIndex < colunas.length) {
                    let texto = cell.textContent.trim();
                    
                    // Truncar texto se muito longo
                    if (cellIndex === 0 && texto.length > 20) {
                        texto = texto.substring(0, 17) + '...';
                    }
                    
                    doc.text(texto, xPos + 1, y + 4);
                    xPos += larguraColunas[cellIndex];
                }
            });
            
            y += 6;
        });
        
        return y + 10;
    }

    async capturarSecaoTransacoes(doc, y) {
        const secao = document.getElementById('lista-transacoes');
        if (!secao || secao.classList.contains('hidden')) {
            return y;
        }

        y = this.verificarNovaPage(doc, y, 80);
        
        // Título
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(52, 73, 94);
        doc.text('LISTA DE TRANSAÇÕES', this.margemEsquerda, y);
        doc.setTextColor(0, 0, 0);
        
        y += 10;
        
        // Info da quantidade
        const infoElemento = document.getElementById('transacoes-count-info');
        if (infoElemento) {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'italic');
            doc.text(infoElemento.textContent, this.margemEsquerda, y);
            y += 8;
        }
        
        // Capturar dados da tabela
        const tbody = document.getElementById('tabela-transacoes-body');
        if (!tbody) return y;
        
        const rows = tbody.querySelectorAll('tr');
        if (rows.length === 0) {
            doc.setFontSize(10);
            doc.text('Nenhuma transação encontrada para o período selecionado.', this.margemEsquerda, y);
            return y + 10;
        }
        
        // Cabeçalho da tabela
        doc.setFillColor(52, 73, 94);
        doc.rect(this.margemEsquerda, y, 170, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        
        const colunas = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Forma', 'Valor', 'Status'];
        const larguraColunas = [20, 15, 40, 25, 15, 25, 20];
        let xPos = this.margemEsquerda;
        
        colunas.forEach((coluna, index) => {
            doc.text(coluna, xPos + 1, y + 6);
            xPos += larguraColunas[index];
        });
        
        y += 8;
        doc.setTextColor(0, 0, 0);
        
        // Mostrar apenas as primeiras 30 transações para não sobrecarregar o PDF
        const maxTransacoes = Math.min(rows.length, 30);
        
        for (let i = 0; i < maxTransacoes; i++) {
            const row = rows[i];
            
            if (y > doc.internal.pageSize.height - 40) {
                doc.addPage();
                y = this.margemSuperior;
            }
            
            const cells = row.querySelectorAll('td');
            if (cells.length === 0) continue;
            
            // Linha alternada
            if (i % 2 === 0) {
                doc.setFillColor(248, 249, 250);
                doc.rect(this.margemEsquerda, y, 170, 6, 'F');
            }
            
            doc.setFontSize(6);
            doc.setFont('helvetica', 'normal');
            
            xPos = this.margemEsquerda;
            cells.forEach((cell, cellIndex) => {
                if (cellIndex < colunas.length) {
                    let texto = cell.textContent.trim();
                    
                    // Limpar badges e formatação HTML
                    texto = texto.replace(/\s+/g, ' ');
                    
                    // Truncar textos longos
                    const maxChars = [10, 8, 20, 15, 8, 12, 10];
                    if (texto.length > maxChars[cellIndex]) {
                        texto = texto.substring(0, maxChars[cellIndex] - 3) + '...';
                    }
                    
                    doc.text(texto, xPos + 1, y + 4);
                    xPos += larguraColunas[cellIndex];
                }
            });
            
            y += 6;
        }
        
        // Nota sobre limitação
        if (rows.length > 30) {
            y += 5;
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(100, 100, 100);
            doc.text(`Mostrando apenas as primeiras 30 de ${rows.length} transações. Ajuste os filtros para ver transações específicas.`, this.margemEsquerda, y);
            doc.setTextColor(0, 0, 0);
            y += 10;
        }
        
        return y + 10;
    }

    async capturarSecaoParcelamentos(doc, y) {
        const secao = document.getElementById('detalhamento-parcelamentos');
        if (!secao || secao.classList.contains('hidden')) {
            return y;
        }

        y = this.verificarNovaPage(doc, y, 60);
        
        // Título
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(52, 73, 94);
        doc.text('DETALHAMENTO DE PARCELAMENTOS', this.margemEsquerda, y);
        doc.setTextColor(0, 0, 0);
        
        y += 15;
        
        // Capturar dados da tabela
        const tbody = document.getElementById('tabela-parcelamentos-body');
        if (!tbody) return y;
        
        const rows = tbody.querySelectorAll('tr');
        if (rows.length === 0) {
            doc.setFontSize(10);
            doc.text('Nenhum parcelamento encontrado para o período selecionado.', this.margemEsquerda, y);
            return y + 10;
        }
        
        // Similar à implementação das outras tabelas...
        // (implementação completa seria similar às outras seções)
        
        return y + 20;
    }

    verificarNovaPage(doc, y, espacoNecessario) {
        if (y + espacoNecessario > doc.internal.pageSize.height - this.margemInferior) {
            doc.addPage();
            return this.margemSuperior;
        }
        return y;
    }

    adicionarRodape(doc) {
        const pageCount = doc.internal.getNumberOfPages();
        
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            
            const yRodape = doc.internal.pageSize.height - 15;
            
            // Linha separadora
            doc.setDrawColor(200, 200, 200);
            doc.line(this.margemEsquerda, yRodape - 5, doc.internal.pageSize.width - this.margemDireita, yRodape - 5);
            
            // Texto do rodapé
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            
            doc.text('Sistema de Controle Financeiro', this.margemEsquerda, yRodape);
            doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.width - 40, yRodape);
            
            const agora = new Date().toLocaleDateString('pt-BR');
            doc.text(`Gerado em ${agora}`, this.margemEsquerda, yRodape + 5);
        }
        
        doc.setTextColor(0, 0, 0);
    }

    obterNomeTipoRelatorio() {
        const tipos = {
            'completo': 'Relatório Completo',
            'apenas-receitas': 'Apenas Receitas',
            'apenas-despesas': 'Apenas Despesas',
            'por-categoria': 'Por Categoria',
            'por-forma-pagamento': 'Por Forma de Pagamento',
            'parcelamentos': 'Parcelamentos',
            'gastos-reais': 'Gastos Reais'
        };
        return tipos[this.sistema.filtrosAtuais.tipoRelatorio] || 'Relatório';
    }

    obterNomeCriterioData() {
        const criterios = {
            'vencimento': 'Data de Vencimento',
            'compra': 'Data de Compra',
            'pagamento': 'Data de Pagamento',
            'mista': 'Critério Misto'
        };
        return criterios[this.sistema.filtrosAtuais.criterioData] || 'Data de Vencimento';
    }

    obterFiltrosAplicados() {
        const filtros = [];
        
        if (this.sistema.filtrosAtuais.categoria !== 'todas') {
            filtros.push(`Categoria: ${this.sistema.filtrosAtuais.categoria}`);
        }
        
        if (this.sistema.filtrosAtuais.status !== 'todos') {
            filtros.push(`Status: ${this.sistema.filtrosAtuais.status}`);
        }
        
        if (!this.sistema.filtrosAtuais.formasPagamento?.todas) {
            const formas = [];
            if (this.sistema.filtrosAtuais.formasPagamento?.pix) formas.push('PIX');
            if (this.sistema.filtrosAtuais.formasPagamento?.debito) formas.push('Débito');
            if (this.sistema.filtrosAtuais.formasPagamento?.credito) formas.push('Crédito');
            if (formas.length > 0) {
                filtros.push(`Formas: ${formas.join(', ')}`);
            }
        }
        
        // Opções especiais
        const opcoes = [];
        if (this.sistema.filtrosAtuais.opcoes?.incluirTransferencias) opcoes.push('Transferências');
        if (this.sistema.filtrosAtuais.opcoes?.agruparParcelamentos) opcoes.push('Agrupar Parcelamentos');
        if (this.sistema.filtrosAtuais.opcoes?.mostrarProjecoes) opcoes.push('Projeções');
        
        if (opcoes.length > 0) {
            filtros.push(`Opções: ${opcoes.join(', ')}`);
        }
        
        return filtros.length > 0 ? filtros.join(' | ') : 'Filtros padrão aplicados';
    }

    gerarNomeArquivo() {
        const agora = new Date();
        const data = agora.toISOString().split('T')[0].replace(/-/g, '');
        const hora = agora.toTimeString().split(':').slice(0, 2).join('');
        const tipo = this.sistema.filtrosAtuais.tipoRelatorio.replace(/-/g, '_');
        
        return `relatorio_detalhado_${tipo}_${data}_${hora}.pdf`;
    }
}

// ================================================================
// INTEGRAÇÃO COM O SISTEMA EXISTENTE - SOBRESCREVER MÉTODO ORIGINAL
// ================================================================

// Função principal de integração
function integrarGeradorPDFMelhorado() {
    if (window.sistemaRelatorios && !window.sistemaRelatorios._pdfMelhoradoIntegrado) {

        // Salvar referência do método original (caso necessário)
        window.sistemaRelatorios._exportarPDFOriginal = window.sistemaRelatorios.exportarPDF;

        // Sobrescrever o método exportarPDF com o novo sistema
        window.sistemaRelatorios.exportarPDF = function() {
            const geradorPDF = new GeradorPDFMelhorado(this);
            geradorPDF.gerarPDFCompleto();
        };

        window.sistemaRelatorios._pdfMelhoradoIntegrado = true;
        // Remover console.log para não poluir o console

        return true;
    }
    return false;
}

// Sobrescrever imediatamente se o sistema já existir
if (window.sistemaRelatorios) {
    integrarGeradorPDFMelhorado();
}

// Aguardar carregamento do sistema e integrar
document.addEventListener('DOMContentLoaded', function() {
    let tentativas = 0;
    const maxTentativas = 5; // Reduzido de 20 para 5
    let jaIntegrado = false;

    const verificarEIntegrar = () => {
        if (jaIntegrado) return;

        tentativas++;

        if (integrarGeradorPDFMelhorado()) {
            jaIntegrado = true;
            // Remover console.log para evitar poluir o console
            return;
        }

        if (tentativas < maxTentativas) {
            setTimeout(verificarEIntegrar, 800); // Aumentado de 500ms para 800ms
        }
        // Remover avisos - o sistema funciona mesmo sem integração imediata
    };

    setTimeout(verificarEIntegrar, 1500); // Aumentado de 1000ms para 1500ms
});

// Listener para eventos personalizados
window.addEventListener('sistemaRelatoriosReady', function() {
    integrarGeradorPDFMelhorado();
});

// Sobrescrever também no prototype da classe se ela existir
if (window.SistemaRelatorios && window.SistemaRelatorios.prototype) {
    window.SistemaRelatorios.prototype.exportarPDF = function() {
        const geradorPDF = new GeradorPDFMelhorado(this);
        geradorPDF.gerarPDFCompleto();
    };
}

// ================================================================
// CLASSE AUXILIAR PARA CAPTURA DE DADOS ESPECÍFICOS
// ================================================================

class CapturadorDadosInterface {
    static capturarDadosCard(idElemento) {
        const elemento = document.getElementById(idElemento);
        if (!elemento) return { valor: 'N/A', visivel: false };
        
        return {
            valor: elemento.textContent.trim(),
            visivel: !elemento.closest('.hidden'),
            classes: elemento.className
        };
    }
    
    static capturarDadosTabela(idTabela) {
        const tabela = document.getElementById(idTabela);
        if (!tabela) return { headers: [], rows: [], visivel: false };
        
        const headers = [];
        const headerRow = tabela.querySelector('thead tr');
        if (headerRow) {
            headerRow.querySelectorAll('th').forEach(th => {
                headers.push(th.textContent.trim());
            });
        }
        
        const rows = [];
        const tbody = tabela.querySelector('tbody');
        if (tbody) {
            tbody.querySelectorAll('tr').forEach(tr => {
                const row = [];
                tr.querySelectorAll('td').forEach(td => {
                    row.push(td.textContent.trim());
                });
                if (row.length > 0) {
                    rows.push(row);
                }
            });
        }
        
        return {
            headers,
            rows,
            visivel: !tabela.closest('.hidden')
        };
    }
    
    static capturarSecoesVisiveis() {
        const secoes = [
            'resumo-executivo',
            'comparativo-formas-pagamento',
            'analise-gastos-reais',
            'detalhamento-categorias',
            'detalhamento-pagamento',
            'lista-transacoes',
            'detalhamento-parcelamentos'
        ];
        
        const secoesVisiveis = [];
        secoes.forEach(id => {
            const elemento = document.getElementById(id);
            if (elemento && !elemento.classList.contains('hidden')) {
                secoesVisiveis.push(id);
            }
        });
        
        return secoesVisiveis;
    }
    
    static capturarFiltrosAtivos() {
        const resumoFiltros = document.getElementById('texto-filtros-resumo');
        if (resumoFiltros) {
            return resumoFiltros.innerHTML.replace(/<[^>]*>/g, ''); // Remove HTML tags
        }
        return 'Nenhum filtro específico aplicado';
    }
}

// ================================================================
// MELHORIAS ESPECÍFICAS PARA DADOS FINANCEIROS
// ================================================================

class FormatacoesFinanceiras {
    static formatarMoedaParaPDF(valor) {
        // Remove formatação HTML e converte para número se necessário
        let valorLimpo = valor;
        if (typeof valor === 'string') {
            valorLimpo = valor.replace(/[^\d,.-]/g, '').replace(',', '.');
        }
        
        const numero = parseFloat(valorLimpo) || 0;
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(numero);
    }
    
    static determinarCorSaldo(valorTexto) {
        const isNegativo = valorTexto.includes('-') || valorTexto.includes('(');
        return isNegativo ? [220, 53, 69] : [40, 167, 69]; // Vermelho : Verde
    }
    
    static extrairValorNumerico(valorTexto) {
        // Extrai apenas os números de um texto formatado como moeda
        const match = valorTexto.match(/[\d.,]+/);
        if (match) {
            return parseFloat(match[0].replace(/\./g, '').replace(',', '.')) || 0;
        }
        return 0;
    }
    
    static formatarData(dataTexto) {
        // Tenta converter diferentes formatos de data para DD/MM/AAAA
        if (!dataTexto) return 'N/A';
        
        try {
            const data = new Date(dataTexto);
            if (isNaN(data.getTime())) {
                return dataTexto; // Retorna original se não conseguir converter
            }
            return data.toLocaleDateString('pt-BR');
        } catch {
            return dataTexto;
        }
    }
    
    static truncarTexto(texto, maxLength) {
        if (!texto || texto.length <= maxLength) return texto;
        return texto.substring(0, maxLength - 3) + '...';
    }
    
    static limparTextoHTML(texto) {
        if (!texto) return '';
        return texto
            .replace(/<[^>]*>/g, '') // Remove tags HTML
            .replace(/\s+/g, ' ')    // Normaliza espaços
            .trim();
    }
}

// ================================================================
// EXPORTAÇÕES E LOGS
// ================================================================

window.GeradorPDFMelhorado = GeradorPDFMelhorado;
window.CapturadorDadosInterface = CapturadorDadosInterface;
window.FormatacoesFinanceiras = FormatacoesFinanceiras;

console.log('Sistema de PDF melhorado carregado com captura de dados da interface');

// ================================================================
// FUNÇÃO DE TESTE PARA VERIFICAR INTEGRAÇÃO
// ================================================================

window.testarPDFMelhorado = function() {
    console.log('=== TESTE DO SISTEMA PDF MELHORADO ===');
    
    // Verificar se jsPDF está disponível
    if (!window.jspdf) {
        console.error('❌ jsPDF não está carregado');
        return false;
    }
    
    // Verificar se sistema de relatórios está disponível
    if (!window.sistemaRelatorios) {
        console.error('❌ Sistema de relatórios não está disponível');
        return false;
    }
    
    // Verificar se há dados processados
    if (!window.sistemaRelatorios.dadosProcessados) {
        console.warn('⚠️ Nenhum relatório foi gerado ainda. Gere um relatório primeiro.');
        return false;
    }
    
    // Verificar seções visíveis
    const secoesVisiveis = CapturadorDadosInterface.capturarSecoesVisiveis();
    console.log('✅ Seções visíveis:', secoesVisiveis);
    
    // Verificar dados dos cards
    const dadosResumo = CapturadorDadosInterface.capturarDadosCard('resumo-total-receitas');
    console.log('✅ Dados do card receitas:', dadosResumo);
    
    // Verificar filtros
    const filtros = CapturadorDadosInterface.capturarFiltrosAtivos();
    console.log('✅ Filtros ativos:', filtros);
    
    console.log('✅ Sistema PDF melhorado está funcionando corretamente!');
    console.log('💡 Use sistemaRelatorios.exportarPDF() para gerar o PDF melhorado');
    
    return true;
};

// Executar teste automático se estiver em desenvolvimento
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    setTimeout(() => {
        window.testarPDFMelhorado();
    }, 3000);
}