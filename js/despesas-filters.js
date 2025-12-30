const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

let filtrosAtivos = {
    categoria: 'todas',
    formaPagamento: 'todas',
    status: 'todas',
    ordenacao: 'original'
};

function inicializarFiltrosDespesas(mes, ano) {
    criarFiltrosCategorias(mes, ano);
    criarFiltrosFormaPagamento(mes, ano);
    criarFiltrosStatus();
    configurarEventosFiltros();
    configurarEventoOrdenacao();
    configurarEventoBotaoLimpar();
}

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
        
        selectCategoria._filterHandler = debounce(function() {
            filtrosAtivos.categoria = this.value;
            aplicarTodosFiltros();
        }, 300);
        
        selectCategoria.addEventListener('change', selectCategoria._filterHandler);
    }
}

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
        
        selectFormaPagamento._filterHandler = debounce(function() {
            filtrosAtivos.formaPagamento = this.value;
            aplicarTodosFiltros();
        }, 300);
        
        selectFormaPagamento.addEventListener('change', selectFormaPagamento._filterHandler);
    }
}

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
        
        selectStatus._filterHandler = debounce(function() {
            filtrosAtivos.status = this.value;
            aplicarTodosFiltros();
        }, 300);
        
        selectStatus.addEventListener('change', selectStatus._filterHandler);
    }
}

function configurarEventosFiltros() {
    const filtros = [
        { id: 'filtro-categoria', propriedade: 'categoria' },
        { id: 'filtro-forma-pagamento-tabela', propriedade: 'formaPagamento' },
        { id: 'filtro-status', propriedade: 'status' }
    ];
    
    filtros.forEach(filtro => {
        const elemento = document.getElementById(filtro.id);
        if (elemento && !elemento._filterConfigured) {
            elemento._filterConfigured = true;
            elemento.addEventListener('change', debounce(function() {
                filtrosAtivos[filtro.propriedade] = this.value;
                aplicarTodosFiltros();
            }, 300));
        }
    });
}

function configurarEventoOrdenacao() {
    const filtroOrdenacao = document.getElementById('filtro-ordenacao-despesas');
    if (filtroOrdenacao && !filtroOrdenacao._sortConfigured) {
        filtroOrdenacao._sortConfigured = true;
        filtroOrdenacao.addEventListener('change', debounce(function() {
            filtrosAtivos.ordenacao = this.value;
            aplicarOrdenacaoDespesas(this.value);
        }, 200));
    }
}

function configurarEventoBotaoLimpar() {
    const btnLimpar = document.getElementById('btn-limpar-filtros');
    if (btnLimpar && !btnLimpar._clearConfigured) {
        btnLimpar._clearConfigured = true;
        btnLimpar.addEventListener('click', function(e) {
            e.preventDefault();
            limparFiltros();
        });
    }
}

function aplicarTodosFiltros() {
    const linhas = document.querySelectorAll('.grid-row.despesa-row');
    
    linhas.forEach(linha => {
        let mostrarLinha = true;
        
        if (filtrosAtivos.categoria !== 'todas') {
            if (!verificarCategoriaDespesa(linha, filtrosAtivos.categoria)) {
                mostrarLinha = false;
            }
        }
        
        if (filtrosAtivos.formaPagamento !== 'todas' && mostrarLinha) {
            if (!verificarFormaPagamentoDespesa(linha, filtrosAtivos.formaPagamento)) {
                mostrarLinha = false;
            }
        }
        
        if (filtrosAtivos.status !== 'todas' && mostrarLinha) {
            if (!verificarStatusDespesa(linha, filtrosAtivos.status)) {
                mostrarLinha = false;
            }
        }
        
        linha.style.display = mostrarLinha ? '' : 'none';
    });
    
    atualizarContadoresFiltro();
    
    if (filtrosAtivos.ordenacao !== 'original') {
        setTimeout(() => aplicarOrdenacaoDespesas(filtrosAtivos.ordenacao), 50);
    }
}

function verificarCategoriaDespesa(linha, categoria) {
    const index = obterIndexDespesa(linha);
    
    if (index !== null) {
        const categoriaAtributo = linha.getAttribute('data-categoria');
        if (categoriaAtributo) {
            return categoriaAtributo === categoria;
        }
        
        if (window.dadosFinanceiros?.[window.anoAberto]?.meses?.[window.mesAberto]?.despesas?.[index]) {
            const despesa = window.dadosFinanceiros[window.anoAberto].meses[window.mesAberto].despesas[index];
            const categoriaLimpa = obterCategoriaLimpaStatic(despesa);
            return categoriaLimpa === categoria;
        }
    }
    
    return false;
}

function verificarFormaPagamentoDespesa(linha, formaPagamento) {
    const index = obterIndexDespesa(linha);
    
    if (index !== null) {
        const formaPagamentoAtributo = linha.getAttribute('data-forma-pagamento');
        if (formaPagamentoAtributo) {
            return formaPagamentoAtributo === formaPagamento;
        }
        
        if (window.dadosFinanceiros?.[window.anoAberto]?.meses?.[window.mesAberto]?.despesas?.[index]) {
            const despesa = window.dadosFinanceiros[window.anoAberto].meses[window.mesAberto].despesas[index];
            
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
    }
    
    return false;
}

function verificarStatusDespesa(linha, status) {
    const index = obterIndexDespesa(linha);
    
    if (index !== null) {
        const statusAtributo = linha.getAttribute('data-status');
        
        if (window.dadosFinanceiros?.[window.anoAberto]?.meses?.[window.mesAberto]?.despesas?.[index]) {
            const despesa = window.dadosFinanceiros[window.anoAberto].meses[window.mesAberto].despesas[index];
            
            let statusDespesa = '';
            if (despesa.quitado === true || despesa.pago === true) {
                statusDespesa = 'paga';
            } else if (despesa.status === 'atrasada' || statusAtributo === 'atrasada') {
                statusDespesa = 'atrasada';
            } else {
                statusDespesa = 'em_dia';
            }
            
            if (status === 'pendentes') {
                return statusDespesa === 'em_dia' || statusDespesa === 'atrasada';
            } else if (status === 'pagas') {
                return despesa.quitado === true || despesa.pago === true;
            } else {
                return statusDespesa === status;
            }
        }
    }
    
    return false;
}

function obterIndexDespesa(linha) {
    const checkbox = linha.querySelector('.despesa-checkbox');
    const btnEditar = linha.querySelector('.btn-editar');
    const dataIndex = linha.getAttribute('data-index');
    
    if (dataIndex) {
        return parseInt(dataIndex);
    } else if (checkbox && checkbox.dataset.index) {
        return parseInt(checkbox.dataset.index);
    } else if (btnEditar && btnEditar.dataset.index) {
        return parseInt(btnEditar.dataset.index);
    }
    
    return null;
}

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
                const dataA = a.querySelector('.col-compra')?.textContent || '';
                const dataB = b.querySelector('.col-compra')?.textContent || '';
                const resultado = compararDatas(dataA, dataB);
                return tipoOrdenacao.includes('desc') ? -resultado : resultado;
            }
            if (tipoOrdenacao.includes('vencimento')) {
                const dataA = a.querySelector('.col-vencimento')?.textContent || '';
                const dataB = b.querySelector('.col-vencimento')?.textContent || '';
                const resultado = compararDatas(dataA, dataB);
                return tipoOrdenacao.includes('desc') ? -resultado : resultado;
            }
            if (tipoOrdenacao.includes('valor')) {
                const valorA = obterValorDaColuna(a);
                const valorB = obterValorDaColuna(b);
                const resultado = valorA - valorB;
                return tipoOrdenacao.includes('desc') ? -resultado : resultado;
            }
            if (tipoOrdenacao.includes('descricao')) {
                const descA = a.querySelector('.col-descricao')?.textContent?.toLowerCase() || '';
                const descB = b.querySelector('.col-descricao')?.textContent?.toLowerCase() || '';
                const resultado = descA.localeCompare(descB);
                return tipoOrdenacao.includes('desc') ? -resultado : resultado;
            }
            if (tipoOrdenacao.includes('status')) {
                const statusA = obterStatusOrdenacao(a);
                const statusB = obterStatusOrdenacao(b);
                const resultado = statusA - statusB;
                return tipoOrdenacao.includes('desc') ? -resultado : resultado;
            }
            return 0;
        });
    }
    
    linhas.forEach(linha => listaDespesas.appendChild(linha));
    
    if (window.DespesasCore) {
        window.DespesasCore.sincronizarIndicesDespesas();
    }
}

function obterValorDaColuna(linha) {
    const celulaValor = linha.querySelector('.col-valor');
    if (!celulaValor) return 0;
    
    let textoValor = celulaValor.textContent || '0';
    
    const valorComJuros = celulaValor.querySelector('.valor-juros');
    if (valorComJuros) {
        textoValor = valorComJuros.textContent || '0';
    }
    
    const valorNumerico = textoValor
        .replace(/[R$\s]/g, '')
        .replace(/\./g, '')
        .replace(',', '.');
    
    return parseFloat(valorNumerico) || 0;
}

function obterStatusOrdenacao(linha) {
    if (linha.classList.contains('despesa-quitada')) return 4;
    if (linha.classList.contains('despesa-atrasada')) return 1;
    if (linha.classList.contains('despesa-em-dia')) return 2;
    return 3;
}

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

function limparFiltros() {
    filtrosAtivos = {
        categoria: 'todas',
        formaPagamento: 'todas',
        status: 'todas',
        ordenacao: 'original'
    };
    
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
        const formatarMoeda = window.formatarMoeda || ((valor) => {
            const num = parseFloat(valor || 0);
            return `R$ ${num.toFixed(2).replace('.', ',')}`;
        });
        
        contadorFiltro.textContent = `${linhasVisiveis.length} de ${totalLinhas} despesas (${formatarMoeda(valorTotalVisivel)})`;
    }
    
    setTimeout(() => {
        if (typeof atualizarTodosContadoresAnexosDespesas === 'function') {
            atualizarTodosContadoresAnexosDespesas();
        }
    }, 50);
}

function calcularValorDespesaLinha(linha) {
    const index = obterIndexDespesa(linha);
    
    if (index !== null && window.dadosFinanceiros?.[window.anoAberto]?.meses?.[window.mesAberto]?.despesas?.[index]) {
        const despesa = window.dadosFinanceiros[window.anoAberto].meses[window.mesAberto].despesas[index];
        return obterValorRealDespesaStatic(despesa);
    }
    
    const valorCell = linha.querySelector('.col-valor');
    if (valorCell) {
        return obterValorDaColuna(linha);
    }
    
    return 0;
}

function obterCategoriasDoMes(mes, ano) {
    const categorias = new Set();
    
    if (window.dadosFinanceiros?.[ano]?.meses?.[mes]?.despesas) {
        const despesas = window.dadosFinanceiros[ano].meses[mes].despesas;
        
        despesas.forEach(despesa => {
            let categoria = despesa.categoria || 'Sem categoria';
            categorias.add(categoria);
        });
    } else {
        const linhas = document.querySelectorAll('.grid-row.despesa-row');
        linhas.forEach(linha => {
            const celulaCategoria = linha.querySelector('.col-categoria');
            if (celulaCategoria && celulaCategoria.textContent) {
                categorias.add(celulaCategoria.textContent.trim());
            }
        });
    }
    
    return Array.from(categorias).sort();
}

function limparSelect(select) {
    while (select.firstChild) {
        select.removeChild(select.firstChild);
    }
}

function adicionarOpcaoSelect(select, value, text) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
}

function calcularTotalDespesas(despesas) {
    if (!Array.isArray(despesas)) return 0;
    
    return despesas.reduce((total, despesa) => {
        if (despesa.quitadaAntecipadamente === true || despesa.transferidaParaProximoMes === true) {
            return total;
        }
        
        if (despesa.valorPago !== null && despesa.valorPago !== undefined && despesa.valorPago > 0) {
            return total + parseFloat(despesa.valorPago);
        }
        return total + parseFloat(despesa.valor || 0);
    }, 0);
}

function calcularTotalJuros(despesas) {
    if (!Array.isArray(despesas)) return 0;
    
    return despesas.reduce((total, despesa) => {
        let jurosCalculado = 0;
        
        if (despesa.quitacaoAntecipada === true || despesa.quitadaAntecipadamente === true || despesa.transferidaParaProximoMes === true) {
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

function calcularTotalEconomias(despesas) {
    if (!Array.isArray(despesas)) return 0;
    
    return despesas.reduce((total, despesa) => {
        let economiaCalculada = 0;
        
        if (despesa.transferidaParaProximoMes === true) {
            return total;
        }
        
        if (despesa.valorTotalComJuros !== null && 
            despesa.valorTotalComJuros !== undefined && 
            despesa.valorOriginal && 
            despesa.valorTotalComJuros < despesa.valorOriginal) {
            
            economiaCalculada += despesa.valorOriginal - despesa.valorTotalComJuros;
        }
        
        if (despesa.quitado === true && 
            despesa.valorPago !== null && 
            despesa.valorPago !== undefined) {
            
            let valorDevido = despesa.valor || 0;
            
            if (despesa.valorOriginal) {
                valorDevido = despesa.valorOriginal;
            }
            
            if (despesa.valorTotalComJuros) {
                valorDevido = despesa.valorTotalComJuros;
            }
            
            if (despesa.parcelado && despesa.metadados?.valorPorParcela) {
                valorDevido = despesa.metadados.valorPorParcela;
            }
            
            if (despesa.valorPago < valorDevido) {
                economiaCalculada += valorDevido - despesa.valorPago;
            }
        }
        
        return total + economiaCalculada;
    }, 0);
}

function calcularEstatisticasGerais(despesas) {
    if (!Array.isArray(despesas)) {
        return {
            total: 0,
            totalJuros: 0,
            totalEconomias: 0,
            totalPagas: 0,
            totalPendentes: 0,
            quantidadePagas: 0,
            quantidadePendentes: 0,
            percentualPago: 0
        };
    }
    
    const despesasValidas = despesas.filter(d => !d.transferidaParaProximoMes);
    
    const total = calcularTotalDespesas(despesasValidas);
    const totalJuros = calcularTotalJuros(despesasValidas);
    const totalEconomias = calcularTotalEconomias(despesasValidas);
    
    const pagas = despesasValidas.filter(d => d.quitado === true || d.pago === true);
    const pendentes = despesasValidas.filter(d => !(d.quitado === true || d.pago === true));
    
    const totalPagas = pagas.reduce((sum, d) => sum + obterValorRealDespesaStatic(d), 0);
    const totalPendentes = pendentes.reduce((sum, d) => sum + obterValorRealDespesaStatic(d), 0);
    
    const percentualPago = despesasValidas.length > 0 ? (pagas.length / despesasValidas.length) * 100 : 0;
    
    return {
        total,
        totalJuros,
        totalEconomias,
        totalPagas,
        totalPendentes,
        quantidadePagas: pagas.length,
        quantidadePendentes: pendentes.length,
        quantidadeTotal: despesasValidas.length,
        percentualPago
    };
}

function obterValorRealDespesaStatic(despesa) {
    if (despesa.valorPago !== null && despesa.valorPago !== undefined && despesa.valorPago > 0) {
        return parseFloat(despesa.valorPago);
    }
    return parseFloat(despesa.valor) || 0;
}

function obterCategoriaLimpaStatic(despesa) {
    let categoria = despesa.categoria || 'Sem categoria';
    
    if (!despesa.formaPagamento && (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito')) {
        if (despesa.categoriaCartao) {
            categoria = despesa.categoriaCartao;
        } else {
            categoria = 'Outros';
        }
    }
    
    return categoria;
}

function atualizarContadorAnexosDespesa(index, quantidade) {
    const btnAnexos = document.querySelector(`.btn-anexos[data-index="${index}"]`);
    
    if (btnAnexos) {
        const contador = btnAnexos.querySelector('.contador-anexos');
        if (contador) {
            contador.textContent = quantidade;
            
            if (quantidade > 0) {
                btnAnexos.classList.add('tem-anexos');
                btnAnexos.title = `${quantidade} anexo(s) - Clique para visualizar`;
            } else {
                btnAnexos.classList.remove('tem-anexos');
                btnAnexos.title = 'Sem anexos';
            }
        }
    }
}

function atualizarTodosContadoresAnexosDespesas() {
    if (!window.dadosFinanceiros || window.mesAberto === null || window.anoAberto === null) {
        return;
    }
    
    const dadosMes = window.dadosFinanceiros?.[window.anoAberto]?.meses?.[window.mesAberto];
    if (!dadosMes || !dadosMes.despesas) return;
    
    dadosMes.despesas.forEach((despesa, index) => {
        if (!despesa.transferidaParaProximoMes) {
            const quantidade = despesa.anexos ? despesa.anexos.length : 0;
            atualizarContadorAnexosDespesa(index, quantidade);
        }
    });
}

async function abrirModalVisualizarAnexosDespesa(index) {
    try {
        if (!window.dadosFinanceiros?.[window.anoAberto]?.meses?.[window.mesAberto]?.despesas?.[index]) {
            alert('Despesa não encontrada');
            return;
        }
        
        const despesa = window.dadosFinanceiros[window.anoAberto].meses[window.mesAberto].despesas[index];
        const anexos = despesa.anexos || [];
        
        if (anexos.length === 0) {
            alert('Esta despesa não possui anexos');
            return;
        }
        
        const modal = document.getElementById('modal-visualizar-anexos-despesa');
        if (!modal) {
            alert('Modal de visualização não encontrado');
            return;
        }
        
        const titulo = modal.querySelector('.modal-title');
        if (titulo) {
            titulo.textContent = `Anexos da Despesa: ${despesa.descricao}`;
        }
        
        const lista = modal.querySelector('.lista-anexos');
        if (lista) {
            lista.innerHTML = '';
            
            anexos.forEach((anexo, anexoIndex) => {
                const item = document.createElement('div');
                item.className = 'anexo-item';
                
                const nome = document.createElement('span');
                nome.textContent = anexo.nome || `Anexo ${anexoIndex + 1}`;
                nome.className = 'anexo-nome';
                
                const acoes = document.createElement('div');
                acoes.className = 'anexo-acoes';
                
                const btnVisualizar = document.createElement('button');
                btnVisualizar.textContent = 'Ver';
                btnVisualizar.className = 'btn btn-small';
                btnVisualizar.onclick = () => {
                    if (anexo.url) {
                        window.open(anexo.url, '_blank');
                    } else {
                        alert('URL do anexo não disponível');
                    }
                };
                
                const btnRemover = document.createElement('button');
                btnRemover.textContent = 'Remover';
                btnRemover.className = 'btn btn-small btn-danger';
                btnRemover.onclick = () => {
                    if (confirm('Remover este anexo?')) {
                        despesa.anexos.splice(anexoIndex, 1);
                        atualizarContadorAnexosDespesa(index, despesa.anexos.length);
                        abrirModalVisualizarAnexosDespesa(index);
                        
                        if (typeof window.salvarDados === 'function') {
                            window.salvarDados();
                        }
                    }
                };
                
                acoes.appendChild(btnVisualizar);
                acoes.appendChild(btnRemover);
                
                item.appendChild(nome);
                item.appendChild(acoes);
                lista.appendChild(item);
            });
        }
        
        modal.style.display = 'block';
        
    } catch (error) {
        alert('Erro ao abrir anexos: ' + error.message);
    }
}

function calcularResumoFinanceiroMes(mes, ano) {
    if (!window.dadosFinanceiros?.[ano]?.meses?.[mes]) {
        return {
            despesas: { total: 0, pagas: 0, pendentes: 0 },
            receitas: { total: 0 },
            saldo: 0,
            percentualGasto: 0
        };
    }
    
    const dadosMes = window.dadosFinanceiros[ano].meses[mes];
    const despesas = dadosMes.despesas || [];
    const receitas = dadosMes.receitas || [];
    
    const estatisticasDespesas = calcularEstatisticasGerais(despesas);
    const totalReceitas = receitas.reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
    const saldo = totalReceitas - estatisticasDespesas.total;
    const percentualGasto = totalReceitas > 0 ? (estatisticasDespesas.total / totalReceitas) * 100 : 0;
    
    return {
        despesas: {
            total: estatisticasDespesas.total,
            pagas: estatisticasDespesas.totalPagas,
            pendentes: estatisticasDespesas.totalPendentes,
            quantidade: estatisticasDespesas.quantidadeTotal,
            quantidadePagas: estatisticasDespesas.quantidadePagas,
            quantidadePendentes: estatisticasDespesas.quantidadePendentes
        },
        receitas: {
            total: totalReceitas,
            quantidade: receitas.length
        },
        saldo: saldo,
        percentualGasto: percentualGasto,
        juros: estatisticasDespesas.totalJuros,
        economias: estatisticasDespesas.totalEconomias
    };
}

function exportarDespesasFiltradas() {
    const linhasVisiveis = document.querySelectorAll('.grid-row.despesa-row:not([style*="display: none"])');
    
    if (linhasVisiveis.length === 0) {
        alert('Nenhuma despesa visível para exportar');
        return;
    }
    
    const dadosExport = [];
    
    linhasVisiveis.forEach(linha => {
        const descricao = linha.querySelector('.col-descricao')?.textContent || '';
        const categoria = linha.querySelector('.col-categoria')?.textContent || '';
        const valor = linha.querySelector('.col-valor')?.textContent || '';
        const dataCompra = linha.querySelector('.col-compra')?.textContent || '';
        const dataVencimento = linha.querySelector('.col-vencimento')?.textContent || '';
        const status = linha.querySelector('.badge-status')?.textContent || '';
        const formaPagamento = linha.querySelector('.badge-pagamento')?.textContent || '';
        
        dadosExport.push({
            Descrição: descricao,
            Categoria: categoria,
            Valor: valor,
            'Data Compra': dataCompra,
            'Data Vencimento': dataVencimento,
            Status: status,
            'Forma Pagamento': formaPagamento
        });
    });
    
    const csv = converterParaCSV(dadosExport);
    const dataAtual = new Date().toISOString().split('T')[0];
    downloadCSV(csv, `despesas-filtradas-${dataAtual}.csv`);
}

function converterParaCSV(dados) {
    if (dados.length === 0) return '';
    
    const cabecalhos = Object.keys(dados[0]);
    const csvCabecalhos = cabecalhos.join(';');
    
    const csvLinhas = dados.map(linha => {
        return cabecalhos.map(cabecalho => {
            let valor = linha[cabecalho] || '';
            if (valor.includes(';') || valor.includes('"') || valor.includes('\n')) {
                valor = `"${valor.replace(/"/g, '""')}"`;
            }
            return valor;
        }).join(';');
    });
    
    return csvCabecalhos + '\n' + csvLinhas.join('\n');
}

function downloadCSV(csvContent, fileName) {
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

function filtrarDespesasPorCategoria(categoria) {
    filtrosAtivos.categoria = categoria;
    aplicarTodosFiltros();
}

function filtrarDespesasPorFormaPagamento(formaPagamento) {
    filtrosAtivos.formaPagamento = formaPagamento;
    aplicarTodosFiltros();
}

function filtrarDespesasPorStatus(status) {
    filtrosAtivos.status = status;
    aplicarTodosFiltros();
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        if (window.mesAberto !== null && window.anoAberto !== null) {
            inicializarFiltrosDespesas(window.mesAberto, window.anoAberto);
        }
    }, 500);
});

window.DespesasFilters = {
    inicializarFiltrosDespesas,
    aplicarTodosFiltros,
    limparFiltros,
    aplicarOrdenacaoDespesas,
    atualizarContadoresFiltro,
    calcularTotalDespesas,
    calcularTotalJuros,
    calcularTotalEconomias,
    calcularEstatisticasGerais,
    calcularResumoFinanceiroMes,
    obterValorRealDespesaStatic,
    obterCategoriaLimpaStatic,
    atualizarContadorAnexosDespesa,
    atualizarTodosContadoresAnexosDespesas,
    abrirModalVisualizarAnexosDespesa,
    exportarDespesasFiltradas,
    filtrarDespesasPorCategoria,
    filtrarDespesasPorFormaPagamento,
    filtrarDespesasPorStatus,
    criarFiltrosCategorias,
    criarFiltrosFormaPagamento,
    criarFiltrosStatus,
    obterCategoriasDoMes
};

console.log('DespesasFilters carregado com sucesso');