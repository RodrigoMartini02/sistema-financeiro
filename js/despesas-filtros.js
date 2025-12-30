// ================================================================
// SISTEMA DE FILTROS E ORDENAÇÃO DE DESPESAS
// ================================================================
// DEPENDÊNCIAS: config.js, utils.js, despesas.js (funções base)
// Módulo extraído de despesas.js na Fase 2 da refatoração
// ================================================================

// ================================================================
// FILTROS DE CATEGORIAS
// ================================================================

/**
 * Cria filtro de categorias dinâmico
 * @param {number} mes - Mês
 * @param {number} ano - Ano
 */
function criarFiltrosCategorias(mes, ano) {
    const categorias = obterCategoriasDoMes(mes, ano);
    const selectCategoria = document.getElementById('filtro-categoria');

    if (selectCategoria) {
        limparSelect(selectCategoria);
        adicionarOpcaoSelect(selectCategoria, 'todas', 'Todas as Categorias');

        categorias.forEach(categoria => {
            adicionarOpcaoSelect(selectCategoria, categoria, categoria);
        });

        selectCategoria.removeEventListener('change', selectCategoria._filterHandler);

        selectCategoria._filterHandler = function() {
            filtrarDespesasPorCategoria(this.value);
        };
        selectCategoria.addEventListener('change', selectCategoria._filterHandler);
    }
}

/**
 * Obtém categorias únicas do mês
 * @param {number} mes - Mês
 * @param {number} ano - Ano
 * @returns {Array<string>} Lista de categorias
 */
function obterCategoriasDoMes(mes, ano) {
    if (!dadosFinanceiros[ano] || !dadosFinanceiros[ano].meses[mes]) {
        return [];
    }

    const categorias = new Set();
    const despesas = dadosFinanceiros[ano].meses[mes].despesas || [];

    despesas.forEach(despesa => {
        let categoria = despesa.categoria || 'Sem categoria';
        categorias.add(categoria);
    });

    return Array.from(categorias).sort();
}

// ================================================================
// FILTROS DE FORMA DE PAGAMENTO
// ================================================================

/**
 * Cria filtro de formas de pagamento
 * @param {number} mes - Mês
 * @param {number} ano - Ano
 */
function criarFiltrosFormaPagamento(mes, ano) {
    const selectFormaPagamento = document.getElementById('filtro-forma-pagamento-tabela');

    if (selectFormaPagamento) {
        limparSelect(selectFormaPagamento);

        const opcoes = [
            { value: 'todas', text: 'Forma Pagamento' },
            { value: 'pix', text: 'PIX' },
            { value: 'debito', text: 'Débito' },
            { value: 'credito', text: 'Crédito' }
        ];

        opcoes.forEach(opcao => {
            adicionarOpcaoSelect(selectFormaPagamento, opcao.value, opcao.text);
        });

        selectFormaPagamento.removeEventListener('change', selectFormaPagamento._filterHandler);

        selectFormaPagamento._filterHandler = function() {
            filtrarDespesasPorFormaPagamento(this.value);
        };
        selectFormaPagamento.addEventListener('change', selectFormaPagamento._filterHandler);
    }
}

// ================================================================
// FILTROS DE STATUS
// ================================================================

/**
 * Cria filtro de status
 */
function criarFiltrosStatus() {
    const selectStatus = document.getElementById('filtro-status');

    if (selectStatus) {
        limparSelect(selectStatus);

        const opcoes = [
            { value: 'todas', text: 'Todos os Status' },
            { value: 'pendentes', text: 'Pendentes' },
            { value: 'em_dia', text: 'Em dia' },
            { value: 'atrasada', text: 'Atrasadas' },
            { value: 'pagas', text: 'Pagas' }
        ];

        opcoes.forEach(opcao => {
            adicionarOpcaoSelect(selectStatus, opcao.value, opcao.text);
        });

        selectStatus.removeEventListener('change', selectStatus._filterHandler);

        selectStatus._filterHandler = function() {
            filtrarDespesasPorStatus(this.value);
        };
        selectStatus.addEventListener('change', selectStatus._filterHandler);
    }
}

// ================================================================
// FUNÇÕES DE FILTRO
// ================================================================

/**
 * Filtra despesas por categoria
 * @param {string} categoria - Categoria selecionada
 */
function filtrarDespesasPorCategoria(categoria) {
    aplicarTodosFiltros();
}

/**
 * Filtra despesas por forma de pagamento
 * @param {string} formaPagamento - Forma de pagamento selecionada
 */
function filtrarDespesasPorFormaPagamento(formaPagamento) {
    aplicarTodosFiltros();
}

/**
 * Filtra despesas por status
 * @param {string} status - Status selecionado
 */
function filtrarDespesasPorStatus(status) {
    aplicarTodosFiltros();
}

// ================================================================
// VERIFICAÇÕES DE FILTRO
// ================================================================

/**
 * Verifica se despesa corresponde à categoria
 * @param {HTMLElement} linha - Linha da tabela
 * @param {string} categoria - Categoria para verificar
 * @returns {boolean} True se corresponde
 */
function verificarCategoriaDespesa(linha, categoria) {
    const index = obterIndexDespesa(linha);

    if (index !== null && dadosFinanceiros[anoAberto]?.meses[mesAberto]?.despesas?.[index]) {
        const despesa = dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index];
        const categoriaLimpa = obterCategoriaLimpa(despesa);
        return categoriaLimpa === categoria;
    }

    return false;
}

/**
 * Verifica se despesa corresponde à forma de pagamento
 * @param {HTMLElement} linha - Linha da tabela
 * @param {string} formaPagamento - Forma de pagamento para verificar
 * @returns {boolean} True se corresponde
 */
function verificarFormaPagamentoDespesa(linha, formaPagamento) {
    const index = obterIndexDespesa(linha);

    if (index !== null && dadosFinanceiros[anoAberto]?.meses[mesAberto]?.despesas?.[index]) {
        const despesa = dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index];

        if (despesa.formaPagamento) {
            return despesa.formaPagamento === formaPagamento;
        } else {
            if (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito') {
                return formaPagamento === 'credito';
            } else {
                return formaPagamento === 'debito';
            }
        }
    }

    return false;
}

/**
 * Verifica se despesa corresponde ao status
 * @param {HTMLElement} linha - Linha da tabela
 * @param {string} status - Status para verificar
 * @returns {boolean} True se corresponde
 */
function verificarStatusDespesa(linha, status) {
    const index = obterIndexDespesa(linha);

    if (index !== null && dadosFinanceiros[anoAberto]?.meses[mesAberto]?.despesas?.[index]) {
        const despesa = dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index];

        let statusDespesa = '';
        if (despesa.quitado === true) {
            statusDespesa = 'paga';
        } else if (despesa.status === 'atrasada') {
            statusDespesa = 'atrasada';
        } else {
            statusDespesa = 'em_dia';
        }

        if (status === 'pendentes') {
            return statusDespesa === 'em_dia' || statusDespesa === 'atrasada';
        } else if (status === 'pagas') {
            return despesa.quitado === true;
        } else {
            return statusDespesa === status;
        }
    }

    return false;
}

/**
 * Obtém índice da despesa a partir da linha
 * @param {HTMLElement} linha - Linha da tabela
 * @returns {number|null} Índice da despesa ou null
 */
function obterIndexDespesa(linha) {
    const checkbox = linha.querySelector('.despesa-checkbox');
    const btnEditar = linha.querySelector('.btn-editar');

    if (checkbox && checkbox.dataset.index) {
        return parseInt(checkbox.dataset.index);
    } else if (btnEditar && btnEditar.dataset.index) {
        return parseInt(btnEditar.dataset.index);
    }

    return null;
}

// ================================================================
// LIMPEZA DE FILTROS
// ================================================================

/**
 * Limpa todos os filtros e ordenação
 */
function limparFiltros() {
    const filtros = [
        'filtro-categoria',
        'filtro-status',
        'filtro-forma-pagamento-tabela',
        'filtro-ordenacao-despesas'
    ];

    filtros.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            if (id === 'filtro-ordenacao-despesas') {
                select.value = 'original';
            } else {
                select.value = 'todas';
            }
        }
    });

    aplicarTodosFiltros();
    aplicarOrdenacaoDespesas('original');
}

// ================================================================
// ORDENAÇÃO
// ================================================================

/**
 * Configura event listener de ordenação
 */
function configurarEventoOrdenacao() {
    const filtroOrdenacao = document.getElementById('filtro-ordenacao-despesas');
    if (filtroOrdenacao) {
        filtroOrdenacao.addEventListener('change', function() {
            aplicarOrdenacaoDespesas(this.value);
        });
    }
}

/**
 * Configura event listener do botão limpar
 */
function configurarEventoBotaoLimpar() {
    const btnLimpar = document.getElementById('btn-limpar-filtros');
    if (btnLimpar) {
        btnLimpar.addEventListener('click', function(e) {
            e.preventDefault();
            limparFiltros();
        });
    }
}

/**
 * Aplica ordenação nas despesas
 * @param {string} tipoOrdenacao - Tipo de ordenação
 */
function aplicarOrdenacaoDespesas(tipoOrdenacao) {
    const listaDespesas = document.getElementById('lista-despesas');
    if (!listaDespesas) return;

    const linhas = Array.from(listaDespesas.querySelectorAll('.grid-row.despesa-row'));

    if (tipoOrdenacao === 'original') {
        linhas.sort((a, b) => {
            const indexA = parseInt(a.getAttribute('data-index')) || 0;
            const indexB = parseInt(b.getAttribute('data-index')) || 0;
            return indexA - indexB;
        });
    } else {
        linhas.sort((a, b) => {
            if (tipoOrdenacao.includes('compra')) {
                const dataA = a.querySelector('.col-compra').textContent;
                const dataB = b.querySelector('.col-compra').textContent;
                const resultado = compararDatas(dataA, dataB);
                return tipoOrdenacao.includes('desc') ? -resultado : resultado;
            }
            if (tipoOrdenacao.includes('vencimento')) {
                const dataA = a.querySelector('.col-vencimento').textContent;
                const dataB = b.querySelector('.col-vencimento').textContent;
                const resultado = compararDatas(dataA, dataB);
                return tipoOrdenacao.includes('desc') ? -resultado : resultado;
            }
            if (tipoOrdenacao.includes('valor')) {
                const valorA = obterValorDaColuna(a);
                const valorB = obterValorDaColuna(b);
                const resultado = valorA - valorB;
                return tipoOrdenacao.includes('desc') ? -resultado : resultado;
            }
            return 0;
        });
    }

    linhas.forEach(linha => listaDespesas.appendChild(linha));
    sincronizarIndicesDespesas();
}

/**
 * Extrai valor numérico da coluna
 * @param {HTMLElement} linha - Linha da tabela
 * @returns {number} Valor numérico
 */
function obterValorDaColuna(linha) {
    const celulaValor = linha.querySelector('.col-valor');
    if (!celulaValor) return 0;

    let textoValor = celulaValor.textContent || '0';

    const valorComJuros = celulaValor.querySelector('.valor-juros');
    if (valorComJuros) {
        textoValor = valorComJuros.textContent || '0';
    }

    const valorNumerico = textoValor
        .replace(/[R$\s.,]/g, '')
        .replace(/(\d+)(\d{2})$/, '$1.$2');

    return parseFloat(valorNumerico) || 0;
}

/**
 * Compara duas datas em formato DD/MM/YYYY
 * @param {string} dataA - Data A
 * @param {string} dataB - Data B
 * @returns {number} Resultado da comparação
 */
function compararDatas(dataA, dataB) {
    const parseData = (dataStr) => {
        if (!dataStr || dataStr === '-') return new Date(0);
        const partes = dataStr.split('/');
        if (partes.length === 3) {
            return new Date(partes[2], partes[1] - 1, partes[0]);
        }
        return new Date(dataStr);
    };

    const dateA = parseData(dataA);
    const dateB = parseData(dataB);
    return dateA.getTime() - dateB.getTime();
}

// ================================================================
// CONTADORES
// ================================================================

/**
 * Atualiza contadores de filtro
 */
function atualizarContadoresFiltro() {
   const linhasVisiveis = document.querySelectorAll('.grid-row.despesa-row:not([style*="display: none"])');
   const totalLinhas = document.querySelectorAll('.grid-row.despesa-row').length;

   let valorTotalVisivel = 0;

   linhasVisiveis.forEach(linha => {
       const valorDespesa = calcularValorDespesaLinha(linha);
       valorTotalVisivel += valorDespesa;
   });

   const contadorFiltro = document.getElementById('contador-filtro');
   if (contadorFiltro) {
       contadorFiltro.textContent = `${linhasVisiveis.length} de ${totalLinhas} despesas (${formatarMoeda(valorTotalVisivel)})`;
   }

   setTimeout(() => {
       if (typeof atualizarTodosContadoresAnexosDespesas === 'function') {
           atualizarTodosContadoresAnexosDespesas();
       }
   }, 50);
}

/**
 * Calcula valor da despesa a partir da linha
 * @param {HTMLElement} linha - Linha da tabela
 * @returns {number} Valor da despesa
 */
function calcularValorDespesaLinha(linha) {
    const index = obterIndexDespesa(linha);

    if (index !== null && dadosFinanceiros[anoAberto]?.meses[mesAberto]?.despesas?.[index]) {
        const despesa = dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index];
        return obterValorRealDespesa(despesa);
    }

    return 0;
}

// ================================================================
// UTILITÁRIOS DE SELECT
// ================================================================

/**
 * Limpa todas as opções de um select
 * @param {HTMLSelectElement} select - Elemento select
 */
function limparSelect(select) {
    while (select.firstChild) {
        select.removeChild(select.firstChild);
    }
}

/**
 * Adiciona opção a um select
 * @param {HTMLSelectElement} select - Elemento select
 * @param {string} value - Valor da opção
 * @param {string} text - Texto da opção
 */
function adicionarOpcaoSelect(select, value, text) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
}

// ================================================================
// EXPORTAÇÕES PARA WINDOW (COMPATIBILIDADE)
// ================================================================

window.criarFiltrosCategorias = criarFiltrosCategorias;
window.criarFiltrosFormaPagamento = criarFiltrosFormaPagamento;
window.criarFiltrosStatus = criarFiltrosStatus;
window.filtrarDespesasPorCategoria = filtrarDespesasPorCategoria;
window.filtrarDespesasPorFormaPagamento = filtrarDespesasPorFormaPagamento;
window.filtrarDespesasPorStatus = filtrarDespesasPorStatus;
window.limparFiltros = limparFiltros;
window.aplicarOrdenacaoDespesas = aplicarOrdenacaoDespesas;
window.atualizarContadoresFiltro = atualizarContadoresFiltro;

// Log de carregamento
if (window.ENVIRONMENT === 'development') {
    console.log('✅ Módulo despesas-filtros.js carregado');
}
