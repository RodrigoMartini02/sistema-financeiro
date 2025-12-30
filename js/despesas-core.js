window.API_URL = 'https://sistema-financeiro-backend-o199.onrender.com/api';

function getToken() {
    return sessionStorage.getItem('token');
}

class DespesasCache {
    constructor() {
        this.cache = new Map();
        this.timeout = 5 * 60 * 1000;
    }
    
    get(key) {
        const item = this.cache.get(key);
        if (!item || Date.now() - item.timestamp > this.timeout) {
            this.cache.delete(key);
            return null;
        }
        return item.data;
    }
    
    set(key, data) {
        this.cache.set(key, { data, timestamp: Date.now() });
    }
    
    invalidate(pattern) {
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
            }
        }
    }
    
    clear() {
        this.cache.clear();
    }
}

const despesasCache = new DespesasCache();
let processandoDespesa = false;
let carregandoDados = false;
let ultimoCarregamento = 0;

const ERROS = {
    DESPESA_NAO_ENCONTRADA: 'A despesa solicitada não foi encontrada',
    ESTRUTURA_DADOS_INVALIDA: 'A estrutura de dados do mês/ano é inválida',
    MODAL_NAO_ENCONTRADO: 'Modal não encontrado'
};

const formatarMoeda = window.formatarMoeda || ((valor) => {
    const num = parseFloat(valor || 0);
    return `R$ ${num.toFixed(2).replace('.', ',')}`;
});

const formatarData = window.formatarData || ((data) => {
    if (!data) return '';
    const d = new Date(data);
    return d.toLocaleDateString('pt-BR');
});

const gerarId = window.gerarId || (() => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
});

function garantirEstruturaDados(ano, mes) {
    if (!window.dadosFinanceiros) {
        window.dadosFinanceiros = {};
    }
    
    if (!window.dadosFinanceiros[ano]) {
        window.dadosFinanceiros[ano] = { meses: {} };
    }
    
    if (!window.dadosFinanceiros[ano].meses[mes]) {
        window.dadosFinanceiros[ano].meses[mes] = {
            despesas: [],
            receitas: [],
            fechado: false
        };
    }
    
    if (!Array.isArray(window.dadosFinanceiros[ano].meses[mes].despesas)) {
        window.dadosFinanceiros[ano].meses[mes].despesas = [];
    }
}

function aguardarSistemaReady() {
    return new Promise((resolve) => {
        let tentativas = 0;
        const verificar = () => {
            tentativas++;
            if (tentativas >= 50) {
                resolve(true);
            } else {
                setTimeout(verificar, 100);
            }
        };
        verificar();
    });
}

function inicializarTabelaDespesasGrid() {
    const tabDespesas = document.getElementById('tab-despesas');
    if (!tabDespesas) return false;
    
    const template = document.getElementById('template-estrutura-despesas-grid');
    if (!template) return false;
    
    const clone = template.content.cloneNode(true);
    tabDespesas.innerHTML = '';
    tabDespesas.appendChild(clone);
    
    configurarEventosGrid();
    return true;
}

function configurarEventosGrid() {
    const checkboxTodas = document.getElementById('select-all-despesas');
    if (checkboxTodas) {
        checkboxTodas.addEventListener('change', function() {
            const todasCheckboxes = document.querySelectorAll('.despesa-checkbox');
            todasCheckboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
            atualizarBotaoLote();
        });
    }
    
    document.addEventListener('change', function(e) {
        if (e.target && e.target.classList.contains('despesa-checkbox')) {
            atualizarBotaoLote();
        }
    });
}

async function buscarEExibirDespesas(mes, ano) {
    const agora = Date.now();
    if (agora - ultimoCarregamento < 1000 || carregandoDados) return [];
    
    carregandoDados = true;
    ultimoCarregamento = agora;
    
    try {
        const cacheKey = `despesas_${mes}_${ano}`;
        const despesasCache = window.despesasCache?.get(cacheKey);
        
        if (despesasCache) {
            renderizarDespesas(despesasCache, mes, ano, false);
            return despesasCache;
        }
        
        const token = getToken();
        if (!token) throw new Error('Usuário não autenticado');
        
        const response = await fetch(`${API_URL}/despesas?mes=${mes}&ano=${ano}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Erro ao buscar despesas');
        
        const despesasFormatadas = data.data.map(d => ({
            id: d.id,
            descricao: d.descricao,
            categoria: d.categoria_nome || 'Outros',
            formaPagamento: d.forma_pagamento,
            numeroCartao: d.cartao_id,
            valor: parseFloat(d.valor),
            dataVencimento: d.data_vencimento,
            dataCompra: d.data_compra,
            dataPagamento: d.data_pagamento,
            mes: d.mes,
            ano: d.ano,
            parcelado: d.parcelado,
            totalParcelas: d.numero_parcelas,
            parcelaAtual: d.parcela_atual,
            parcela: d.parcelado ? `${d.parcela_atual}/${d.numero_parcelas}` : null,
            pago: d.pago,
            quitado: d.pago,
            observacoes: d.observacoes,
            anexos: [],
            status: d.pago ? 'quitada' : (new Date(d.data_vencimento) < new Date() ? 'atrasada' : 'em_dia')
        }));
        
        if (window.despesasCache) {
            window.despesasCache.set(cacheKey, despesasFormatadas);
        }
        
        renderizarDespesas(despesasFormatadas, mes, ano, false);
        return despesasFormatadas;
        
    } catch (error) {
        alert('Erro ao carregar despesas: ' + error.message);
        return [];
    } finally {
        carregandoDados = false;
    }
}

function renderizarDespesas(despesas, mes, ano, fechado) {
    if (!document.getElementById('despesas-grid-container')) {
        inicializarTabelaDespesasGrid();
    }
    
    const listaDespesas = document.getElementById('lista-despesas');
    if (!listaDespesas) return;
    
    listaDespesas.innerHTML = '';
    
    if (Array.isArray(despesas) && despesas.length > 0) {
        atualizarStatusDespesas(despesas);
        const despesasParaExibir = despesas.filter(d => !d.transferidaParaProximoMes);
        
        despesasParaExibir.forEach((despesa, index) => {
            const divRow = criarLinhaDespesaGrid(despesa, index, fechado, mes, ano);
            if (divRow) listaDespesas.appendChild(divRow);
        });
    }
    
    if (!fechado) {
        configurarEventosDespesas(listaDespesas, mes, ano);
    }
    
    atualizarBotaoLote();
    
    setTimeout(() => {
        sincronizarIndicesDespesas();
    }, 100);
}

function criarLinhaDespesaGrid(despesa, index, fechado, mes, ano) {
    const template = document.getElementById('template-linha-despesa-grid');
    if (!template) return null;
    
    const clone = template.content.cloneNode(true);
    const div = clone.querySelector('.grid-row');
    
    if (despesa.status === 'em_dia') div.classList.add('despesa-em-dia');
    else if (despesa.status === 'atrasada') div.classList.add('despesa-atrasada');
    else if (despesa.status === 'quitada' || despesa.quitado) div.classList.add('despesa-quitada');
    
    if (fechado) div.classList.add('transacao-fechada');
    
    div.setAttribute('data-status', despesa.status || 'pendente');
    div.setAttribute('data-categoria', despesa.categoria || '');
    div.setAttribute('data-forma-pagamento', despesa.formaPagamento || '');
    div.setAttribute('data-index', index);
    div.setAttribute('data-despesa-id', despesa.id || '');
    div.setAttribute('data-anexos-count', despesa.anexos ? despesa.anexos.length : 0);
    
    preencherCelulasGrid(clone, despesa, index, fechado, mes, ano);
    
    return clone;
}

function preencherCelulasGrid(clone, despesa, index, fechado, mes, ano) {
    preencherCelulaCheckbox(clone, despesa, index, fechado);
    preencherCelulaDescricao(clone, despesa);
    preencherCelulaCategoria(clone, despesa);
    preencherCelulaFormaPagamento(clone, despesa);
    preencherCelulaValor(clone, despesa);
    preencherCelulaParcela(clone, despesa);
    preencherCelulaValorPago(clone, despesa);
    preencherCelulaStatus(clone, despesa);
    preencherCelulaDatas(clone, despesa);
    preencherCelulaDataPagamento(clone, despesa);
    preencherCelulaAcoes(clone, despesa, index, fechado);
    preencherCelulaAnexos(clone, despesa, index, fechado);
}

function preencherCelulaCheckbox(clone, despesa, index, fechado) {
    const celulaCheckbox = clone.querySelector('.col-checkbox');
    if (!fechado && !despesa.quitado) {
        const template = document.getElementById('template-celula-checkbox-despesa');
        if (template) {
            const checkboxClone = template.content.cloneNode(true);
            const checkbox = checkboxClone.querySelector('.despesa-checkbox');
            checkbox.setAttribute('data-index', index);
            celulaCheckbox.appendChild(checkboxClone);
        }
    }
}

function preencherCelulaDescricao(clone, despesa) {
    const celulaDescricao = clone.querySelector('.col-descricao');
    celulaDescricao.textContent = despesa.descricao || 'Sem descrição';
    celulaDescricao.title = despesa.descricao || 'Sem descrição';
}

function preencherCelulaCategoria(clone, despesa) {
    const celulaCategoria = clone.querySelector('.col-categoria');
    const categoria = obterCategoriaLimpa(despesa);
    celulaCategoria.textContent = categoria;
    celulaCategoria.title = categoria;
}

function preencherCelulaFormaPagamento(clone, despesa) {
    const celulaFormaPagamento = clone.querySelector('.col-forma-pagamento');
    const template = document.getElementById('template-badge-forma-pagamento-despesa');
    if (template) {
        const badgeClone = template.content.cloneNode(true);
        const badge = badgeClone.querySelector('.badge-pagamento');
        const formaPag = despesa.formaPagamento || 'debito';
        badge.className = `badge-pagamento ${formaPag}`;
        badge.textContent = formaPag.toUpperCase();
        celulaFormaPagamento.appendChild(badgeClone);
    }
}

function preencherCelulaValor(clone, despesa) {
    const celulaValor = clone.querySelector('.col-valor');
    const temJuros = despesa.metadados && despesa.metadados.jurosPorParcela > 0;
    
    if (temJuros) {
        const template = document.getElementById('template-valor-com-juros');
        if (template) {
            const valorClone = template.content.cloneNode(true);
            const valorOriginal = despesa.valorOriginal || (despesa.metadados.valorOriginalTotal / despesa.totalParcelas);
            
            valorClone.querySelector('.valor-original').textContent = formatarMoeda(valorOriginal);
            valorClone.querySelector('.valor-juros').textContent = formatarMoeda(despesa.valor || 0);
            
            celulaValor.appendChild(valorClone);
        }
    } else {
        celulaValor.textContent = formatarMoeda(despesa.valor || 0);
    }
}

function preencherCelulaParcela(clone, despesa) {
    const celulaParcela = clone.querySelector('.col-parcela');
    celulaParcela.textContent = despesa.parcela || '-';
}

function preencherCelulaValorPago(clone, despesa) {
    const celulaValorPago = clone.querySelector('.col-valor-pago');
    celulaValorPago.textContent = despesa.valorPago ? formatarMoeda(despesa.valorPago) : '-';
}

function preencherCelulaStatus(clone, despesa) {
    const celulaStatus = clone.querySelector('.col-status');
    const template = document.getElementById('template-badge-status-despesa');
    if (template) {
        const statusClone = template.content.cloneNode(true);
        const badge = statusClone.querySelector('.badge-status');
        badge.className = `badge-status ${obterClasseStatus(despesa)}`;
        badge.textContent = criarBadgeStatus(despesa);
        celulaStatus.appendChild(statusClone);
    }
}

function preencherCelulaDatas(clone, despesa) {
    const { dataCompraExibir, dataVencimentoExibir } = obterDatasExibicao(despesa);
    
    const celulaCompra = clone.querySelector('.col-compra');
    celulaCompra.textContent = dataCompraExibir || '-';
    
    const celulaVencimento = clone.querySelector('.col-vencimento');
    celulaVencimento.textContent = dataVencimentoExibir || '-';
}

function preencherCelulaDataPagamento(clone, despesa) {
    const celulaDataPagamento = clone.querySelector('.col-data-pagamento');
    if (celulaDataPagamento) {
        if (despesa.dataPagamento && despesa.quitado) {
            celulaDataPagamento.textContent = formatarData(despesa.dataPagamento);
            celulaDataPagamento.title = `Pago em: ${formatarData(despesa.dataPagamento)}`;
        } else {
            celulaDataPagamento.textContent = '-';
            celulaDataPagamento.title = 'Não pago';
        }
    }
}

function preencherCelulaAcoes(clone, despesa, index, fechado) {
    const celulaAcoes = clone.querySelector('.col-acoes');
    const template = document.getElementById('template-botoes-acao-despesa');
    if (template) {
        const botoesClone = template.content.cloneNode(true);
        configurarBotoesAcaoTemplate(botoesClone, despesa, index, fechado);
        celulaAcoes.appendChild(botoesClone);
    }
}

function preencherCelulaAnexos(clone, despesa, index, fechado) {
    const celulaAnexos = clone.querySelector('.col-anexos');
    if (!celulaAnexos) return;
    
    const quantidadeAnexos = despesa.anexos ? despesa.anexos.length : 0;
    
    if (quantidadeAnexos > 0) {
        const template = document.getElementById('template-botao-anexos-com-anexos');
        if (template) {
            const templateClone = template.content.cloneNode(true);
            const botaoAnexos = templateClone.querySelector('.btn-anexos');
            
            if (botaoAnexos) {
                botaoAnexos.setAttribute('data-index', index);
                botaoAnexos.setAttribute('title', `Ver ${quantidadeAnexos} anexo(s)`);
                
                const contador = botaoAnexos.querySelector('.contador-anexos');
                if (contador) {
                    contador.textContent = quantidadeAnexos;
                }
            }
            
            celulaAnexos.innerHTML = '';
            celulaAnexos.appendChild(templateClone);
        }
    } else {
        const template = document.getElementById('template-botao-anexos-sem-anexos');
        if (template) {
            const templateClone = template.content.cloneNode(true);
            const botaoAnexos = templateClone.querySelector('.btn-anexos');
            
            if (botaoAnexos) {
                botaoAnexos.setAttribute('data-index', index);
            }
            
            celulaAnexos.innerHTML = '';
            celulaAnexos.appendChild(templateClone);
        }
    }
}

function configurarBotoesAcaoTemplate(clone, despesa, index, fechado) {
    const btnEditar = clone.querySelector('.btn-editar');
    const btnExcluir = clone.querySelector('.btn-excluir');
    const btnPagar = clone.querySelector('.btn-pagar');
    const btnMover = clone.querySelector('.btn-mover');
    
    if (btnEditar) {
        btnEditar.setAttribute('data-index', index);
        if (fechado) btnEditar.style.display = 'none';
    }
    
    if (btnExcluir) {
        btnExcluir.setAttribute('data-index', index);
        if (fechado) btnExcluir.style.display = 'none';
    }
    
    if (btnPagar) {
        btnPagar.setAttribute('data-index', index);
        if (fechado || despesa.quitado) btnPagar.style.display = 'none';
    }
    
    if (btnMover) {
        btnMover.setAttribute('data-index', index);
        if (fechado || despesa.quitado) btnMover.style.display = 'none';
    }
}

function configurarEventosDespesas(container, mes, ano) {
    if (!container) return;
    
    if (container._despesasListener) {
        container.removeEventListener('click', container._despesasListener);
    }
    
    container._despesasListener = async (e) => {
        const btn = e.target.closest('.btn');
        if (!btn) return;
        
        e.stopPropagation();
        e.preventDefault();
        
        const index = parseInt(btn.dataset.index);
        if (isNaN(index)) return;
        
        try {
            if (btn.classList.contains('btn-editar')) {
                if (window.DespesasActions) {
                    await window.DespesasActions.editarDespesa(index, mes, ano);
                } else {
                    await editarDespesa(index, mes, ano);
                }
            } else if (btn.classList.contains('btn-excluir')) {
                if (window.DespesasActions) {
                    await window.DespesasActions.excluirDespesa(index, mes, ano);
                }
            } else if (btn.classList.contains('btn-pagar')) {
                if (window.DespesasActions) {
                    await window.DespesasActions.abrirModalPagamento(index, mes, ano);
                }
            } else if (btn.classList.contains('btn-mover')) {
                if (window.DespesasActions) {
                    await window.DespesasActions.moverParaProximoMes(index, mes, ano);
                }
            } else if (btn.classList.contains('btn-anexos')) {
                if (window.abrirModalVisualizarAnexosDespesa) {
                    await window.abrirModalVisualizarAnexosDespesa(index);
                }
            }
        } catch (error) {
            alert('Erro ao processar ação: ' + error.message);
        }
    };
    
    container.addEventListener('click', container._despesasListener);
}

function sincronizarIndicesDespesas() {
    const linhasDespesas = document.querySelectorAll('.grid-row.despesa-row');
    
    linhasDespesas.forEach((linha, novoIndex) => {
        linha.setAttribute('data-index', novoIndex);
        
        const botoes = linha.querySelectorAll('[data-index]');
        botoes.forEach(botao => {
            botao.setAttribute('data-index', novoIndex);
        });
        
        const checkbox = linha.querySelector('.despesa-checkbox');
        if (checkbox) {
            checkbox.setAttribute('data-index', novoIndex);
        }
        
        const btnAnexos = linha.querySelector('.btn-anexos');
        if (btnAnexos) {
            btnAnexos.setAttribute('data-index', novoIndex);
        }
    });
}

function atualizarStatusDespesas(despesas) {
    if (!Array.isArray(despesas)) return;
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    despesas.forEach(despesa => {
        if (despesa.quitado === true) {
            return;
        }
        
        const dataVencimento = despesa.dataVencimento ? new Date(despesa.dataVencimento) : 
                              (despesa.data ? new Date(despesa.data) : new Date());
        dataVencimento.setHours(0, 0, 0, 0);
        
        if (dataVencimento < hoje) {
            despesa.status = 'atrasada';
        } else {
            despesa.status = 'em_dia';
        }
    });
}

function obterCategoriaLimpa(despesa) {
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

function criarBadgeStatus(despesa) {
    if (despesa.quitadaAntecipadamente === true) {
        return 'Quitada';
    } else if (despesa.quitado === true) {
        return 'Paga';
    } else if (despesa.status === 'atrasada') {
        return 'Atrasada';
    } else if (despesa.status === 'em_dia') {
        return 'Em Dia';
    } else {
        return 'Pendente';
    }
}

function obterClasseStatus(despesa) {
    if (despesa.quitadaAntecipadamente === true) {
        return 'badge-quitada-antecipada';
    } else if (despesa.quitado === true) {
        return 'badge-quitada';
    } else if (despesa.status === 'atrasada') {
        return 'badge-atrasada';
    } else if (despesa.status === 'em_dia') {
        return 'badge-em-dia';
    } else {
        return 'badge-pendente';
    }
}

function obterDatasExibicao(despesa) {
    let dataCompraExibir = despesa.dataCompra ? formatarData(despesa.dataCompra) : '';
    let dataVencimentoExibir = despesa.dataVencimento ? formatarData(despesa.dataVencimento) : '';
    
    if (!dataCompraExibir && despesa.data) {
        dataCompraExibir = formatarData(despesa.data);
    }
    if (!dataVencimentoExibir && despesa.data) {
        dataVencimentoExibir = formatarData(despesa.data);
    }
    
    return { dataCompraExibir, dataVencimentoExibir };
}

function atualizarBotaoLote() {
    const checkboxes = document.querySelectorAll('.despesa-checkbox:checked');
    const btnPagarEmLote = document.getElementById('btn-pagar-em-lote');
    if (btnPagarEmLote) {
        btnPagarEmLote.disabled = checkboxes.length < 2;
    }
}

function abrirModalNovaDespesa(index) {
    if (typeof recarregarEAtualizarCartoes === 'function') {
        recarregarEAtualizarCartoes();
    }
    
    setTimeout(() => {
        try {
            if (window.mesAberto === null || window.anoAberto === null) {
                window.mesAberto = new Date().getMonth();
                window.anoAberto = new Date().getFullYear();
            }
            
            const modal = document.getElementById('modal-nova-despesa');
            const form = document.getElementById('form-nova-despesa');
            
            if (!modal || !form) {
                throw new Error(ERROS.MODAL_NAO_ENCONTRADO);
            }
            
            form.reset();
            resetarEstadoFormularioDespesa();
            processandoDespesa = false;
            
            if (window.sistemaAnexos) {
                window.sistemaAnexos.limparAnexosTemporarios('despesa');
                window.sistemaAnexos.limparAnexosTemporarios('comprovante');
            }
            
            document.getElementById('despesa-mes').value = window.mesAberto;
            document.getElementById('despesa-ano').value = window.anoAberto;
            
            if (typeof atualizarOpcoesCartoes === 'function') {
                atualizarOpcoesCartoes();
            }
            
            const dataAtual = new Date(window.anoAberto, window.mesAberto, new Date().getDate());
            const dataFormatada = dataAtual.toISOString().split('T')[0];
            document.getElementById('despesa-data-compra').value = dataFormatada;
            document.getElementById('despesa-data-vencimento').value = dataFormatada;
            
            if (index !== undefined && window.dadosFinanceiros?.[window.anoAberto]?.meses?.[window.mesAberto]?.despesas?.[index]) {
                preencherFormularioEdicao(index);
            } else {
                document.getElementById('despesa-id').value = '';
            }
            
            modal.classList.add('active');
            modal.style.display = 'block';
            
            setTimeout(() => {
                const descricaoInput = document.getElementById('despesa-descricao');
                if (descricaoInput) descricaoInput.focus();
            }, 300);
            
        } catch (error) {
            alert("Não foi possível abrir o formulário: " + error.message);
        }
    }, 200);
}

function resetarEstadoFormularioDespesa() {
    const info = document.getElementById('info-parcelamento');
    if (info) info.classList.add('hidden');
    
    const parceladoCheckbox = document.getElementById('despesa-parcelado');
    if (parceladoCheckbox) {
        parceladoCheckbox.checked = false;
        parceladoCheckbox.disabled = false;
    }
    
    const parcelasInput = document.getElementById('despesa-parcelas');
    if (parcelasInput) parcelasInput.disabled = false;
    
    const formasPagamento = document.querySelectorAll('input[name="forma-pagamento"]');
    formasPagamento.forEach(radio => radio.checked = false);
    
    const jaPagoCheckbox = document.getElementById('despesa-ja-pago');
    if (jaPagoCheckbox) {
        jaPagoCheckbox.checked = false;
    }
    
    const recorrenteCheckbox = document.getElementById('despesa-recorrente');
    if (recorrenteCheckbox) {
        recorrenteCheckbox.checked = false;
    }
    
    const grupoDataPagamento = document.getElementById('grupo-data-pagamento');
    if (grupoDataPagamento) {
        grupoDataPagamento.style.display = 'none';
    }
    
    const inputDataPagamento = document.getElementById('despesa-data-pagamento-imediato');
    if (inputDataPagamento) {
        inputDataPagamento.value = '';
    }
    
    document.querySelectorAll('.form-group.error').forEach(group => {
        group.classList.remove('error');
    });
    
    const errorElements = document.querySelectorAll('.form-error-categoria, .form-error-pagamento');
    errorElements.forEach(el => el.remove());
    
    const warningElements = document.querySelectorAll('.form-warning');
    warningElements.forEach(el => el.remove());
}

function preencherFormularioEdicao(index) {
    if (!window.dadosFinanceiros?.[window.anoAberto]?.meses?.[window.mesAberto]?.despesas?.[index]) {
        throw new Error(ERROS.DESPESA_NAO_ENCONTRADA);
    }
    
    const despesa = window.dadosFinanceiros[window.anoAberto].meses[window.mesAberto].despesas[index];
    
    document.getElementById('despesa-id').value = index;
    document.getElementById('despesa-descricao').value = despesa.descricao || '';
    document.getElementById('despesa-categoria').value = despesa.categoria || '';
    
    if (despesa.parcelado && despesa.metadados?.valorOriginalTotal) {
        document.getElementById('despesa-valor').value = despesa.metadados.valorOriginalTotal;
        document.getElementById('despesa-valor-pago').value = despesa.metadados.valorTotalComJuros || '';
    } else {
        document.getElementById('despesa-valor').value = despesa.valorOriginal || despesa.valor;
        document.getElementById('despesa-valor-pago').value = despesa.valorTotalComJuros || despesa.valorPago || '';
    }
    
    if (despesa.dataCompra) {
        document.getElementById('despesa-data-compra').value = despesa.dataCompra;
    }
    
    if (despesa.dataVencimento) {
        document.getElementById('despesa-data-vencimento').value = despesa.dataVencimento;
    }
    
    if (despesa.formaPagamento === 'credito' && despesa.numeroCartao) {
        const radioCartao = document.querySelector(`input[name="forma-pagamento"][data-cartao="${despesa.numeroCartao}"]`);
        if (radioCartao) radioCartao.checked = true;
    } else if (despesa.formaPagamento) {
        const radioFormaPagamento = document.querySelector(`input[name="forma-pagamento"][value="${despesa.formaPagamento}"]`);
        if (radioFormaPagamento) radioFormaPagamento.checked = true;
    }
    
    if (despesa.parcelado) {
        const parceladoCheckbox = document.getElementById('despesa-parcelado');
        const parcelasInput = document.getElementById('despesa-parcelas');
        
        if (parceladoCheckbox) {
            parceladoCheckbox.checked = true;
            parceladoCheckbox.disabled = true;
        }
        if (parcelasInput) {
            parcelasInput.value = despesa.totalParcelas;
            parcelasInput.disabled = true;
        }
        
        const info = document.getElementById('info-parcelamento');
        if (info) info.classList.remove('hidden');
        
        if (despesa.metadados) calcularInfoParcelamento();
    }
    
    if (window.sistemaAnexos && despesa.anexos) {
        window.sistemaAnexos.carregarAnexosExistentes(despesa, 'despesa');
    }
    
    const recorrenteCheckbox = document.getElementById('despesa-recorrente');
    if (recorrenteCheckbox) {
        recorrenteCheckbox.checked = !!despesa.recorrente;
    }
}

async function salvarDespesa(e) {
    if (e && e.preventDefault) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    if (processandoDespesa) return false;
    processandoDespesa = true;
    
    try {
        let formularioValido = true;
        
        if (!validarCategoria()) formularioValido = false;
        if (!validarFormaPagamento()) formularioValido = false;
        
        const descricao = document.getElementById('despesa-descricao');
        if (!descricao.value.trim()) {
            descricao.focus();
            formularioValido = false;
        }
        
        const valor = document.getElementById('despesa-valor');
        if (!valor.value || parseFloat(valor.value) <= 0) {
            valor.focus();
            formularioValido = false;
        }
        
        if (!formularioValido) return false;
        
        const formData = coletarDadosFormularioDespesa();
        const sucesso = await salvarDespesaAPI(formData);

        if (sucesso) {
            document.getElementById('modal-nova-despesa').style.display = 'none';
            
            if (window.despesasCache) {
                window.despesasCache.invalidate(`despesas_${formData.mes}_${formData.ano}`);
            }
            
            await buscarEExibirDespesas(formData.mes, formData.ano);
            
            if (typeof window.renderizarDetalhesDoMes === 'function') {
                await window.renderizarDetalhesDoMes(formData.mes, formData.ano);
            }
            
            if (typeof window.carregarDadosDashboard === 'function') {
                await window.carregarDadosDashboard(formData.ano);
            }
        } else {
            throw new Error('Falha ao salvar despesa');
        }
        
        return false;
        
    } catch (error) {
        alert("Não foi possível salvar a despesa: " + error.message);
        return false;
    } finally {
        processandoDespesa = false;
    }
}

function coletarDadosFormularioDespesa() {
    const categoria = document.getElementById('despesa-categoria').value;
    const formaPagamentoSelecionada = document.querySelector('input[name="forma-pagamento"]:checked');
    const formaPagamento = formaPagamentoSelecionada ? formaPagamentoSelecionada.value : null;
    
    let numeroCartao = null;
    if (formaPagamento === 'credito' && formaPagamentoSelecionada && formaPagamentoSelecionada.dataset.cartao) {
        numeroCartao = parseInt(formaPagamentoSelecionada.dataset.cartao);
    }
    
    const jaPago = document.getElementById('despesa-ja-pago') && document.getElementById('despesa-ja-pago').checked;
    const recorrente = document.getElementById('despesa-recorrente') && document.getElementById('despesa-recorrente').checked;
    
    return {
        id: document.getElementById('despesa-id').value,
        mes: parseInt(document.getElementById('despesa-mes').value),
        ano: parseInt(document.getElementById('despesa-ano').value),
        descricao: document.getElementById('despesa-descricao').value.trim(),
        categoria: categoria,
        formaPagamento: formaPagamento,
        numeroCartao: numeroCartao,
        valor: parseFloat(document.getElementById('despesa-valor').value),
        valorPago: document.getElementById('despesa-valor-pago').value ? 
                  parseFloat(document.getElementById('despesa-valor-pago').value) : null,
        dataCompra: document.getElementById('despesa-data-compra').value,
        dataVencimento: document.getElementById('despesa-data-vencimento').value,
        parcelado: document.getElementById('despesa-parcelado').checked,
        totalParcelas: document.getElementById('despesa-parcelado').checked ? 
                      parseInt(document.getElementById('despesa-parcelas').value) : 1,
        anexos: window.sistemaAnexos ? window.sistemaAnexos.obterAnexosParaSalvar('despesa') : [],
        jaPago: jaPago,
        recorrente: recorrente
    };
}

async function salvarDespesaAPI(formData) {
    try {
        const token = getToken();
        if (!token) throw new Error('Usuário não autenticado');
        
        const dadosAPI = {
            descricao: formData.descricao,
            valor: formData.valor,
            data_vencimento: formData.dataVencimento,
            data_compra: formData.dataCompra || null,
            mes: formData.mes,
            ano: formData.ano,
            categoria_id: 1,
            forma_pagamento: formData.formaPagamento,
            cartao_id: formData.numeroCartao,
            parcelado: formData.parcelado,
            total_parcelas: formData.totalParcelas,
            observacoes: formData.observacoes || null,
            pago: formData.jaPago || false
        };
        
        let response;
        
        if (formData.id !== '' && formData.id !== null) {
            const despesaId = obterIdDespesaPorIndex(formData.id, formData.mes, formData.ano);
            if (!despesaId) throw new Error('ID da despesa não encontrado');
            
            response = await fetch(`${API_URL}/despesas/${despesaId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dadosAPI)
            });
        } else {
            response = await fetch(`${API_URL}/despesas`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dadosAPI)
            });
        }
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Erro ao salvar despesa');
        
        if (window.sistemaAnexos) {
            window.sistemaAnexos.limparAnexosTemporarios('despesa');
        }
        
        return true;
        
    } catch (error) {
        return false;
    }
}

function obterIdDespesaPorIndex(index, mes, ano) {
    const linha = document.querySelector(`[data-index="${index}"]`)?.closest('.grid-row');
    return linha?.getAttribute('data-despesa-id');
}

function validarCategoria() {
    const selectCategoria = document.getElementById('despesa-categoria');
    if (!selectCategoria) return true;
    
    const formGroup = selectCategoria.closest('.form-group');
    if (!formGroup) return selectCategoria.value !== '';
    
    const errorExistente = formGroup.querySelector('.form-error-categoria');
    if (errorExistente) {
        errorExistente.remove();
    }
    formGroup.classList.remove('error');
    
    if (!selectCategoria.value) {
        formGroup.classList.add('error');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'form-error-categoria';
        errorDiv.textContent = 'Por favor, selecione uma categoria';
        formGroup.appendChild(errorDiv);
        return false;
    }
    
    return true;
}

function validarFormaPagamento() {
    const radiosFormaPagamento = document.querySelectorAll('input[name="forma-pagamento"]');
    if (radiosFormaPagamento.length === 0) return true;
    
    const formGroup = radiosFormaPagamento[0].closest('.form-group');
    if (!formGroup) {
        return Array.from(radiosFormaPagamento).some(radio => radio.checked);
    }
    
    const errorExistente = formGroup.querySelector('.form-error-pagamento');
    if (errorExistente) {
        errorExistente.remove();
    }
    formGroup.classList.remove('error');
    
    const algumSelecionado = Array.from(radiosFormaPagamento).some(radio => radio.checked);
    
    if (!algumSelecionado) {
        formGroup.classList.add('error');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'form-error-pagamento';
        errorDiv.textContent = 'Por favor, selecione uma forma de pagamento';
        formGroup.appendChild(errorDiv);
        return false;
    }
    
    return true;
}

function calcularInfoParcelamento() {
    const checkboxParcelado = document.getElementById('despesa-parcelado');
    const inputValorOriginal = document.getElementById('despesa-valor');
    const inputValorPago = document.getElementById('despesa-valor-pago');
    const inputNumParcelas = document.getElementById('despesa-parcelas');
    
    if (!checkboxParcelado || !checkboxParcelado.checked) {
        const info = document.getElementById('info-parcelamento');
        if (info) info.classList.add('hidden');
        return;
    }
    
    const valorOriginal = parseFloat(inputValorOriginal.value) || 0;
    const valorPagoTotal = parseFloat(inputValorPago.value) || valorOriginal;
    const numParcelas = parseInt(inputNumParcelas.value) || 2;
    
    if (valorOriginal <= 0 || valorPagoTotal <= 0 || numParcelas < 2) {
        const info = document.getElementById('info-parcelamento');
        if (info) info.classList.add('hidden');
        return;
    }
    
    const totalJuros = valorPagoTotal - valorOriginal;
    const valorParcela = Math.round((valorPagoTotal / numParcelas) * 100) / 100;
    
    const infoContainer = document.getElementById('info-parcelamento');
    if (infoContainer) {
        infoContainer.classList.remove('hidden');
        
        const elementoJurosTotal = document.getElementById('info-juros-total');
        const elementoJurosParcela = document.getElementById('info-juros-parcela');
        const elementoValorParcela = document.getElementById('info-valor-parcela');
        const elementoValorTotal = document.getElementById('info-valor-total');
        
        if (elementoJurosTotal) elementoJurosTotal.textContent = formatarMoeda(totalJuros);
        if (elementoJurosParcela) elementoJurosParcela.textContent = formatarMoeda(totalJuros / numParcelas);
        if (elementoValorParcela) elementoValorParcela.textContent = formatarMoeda(valorParcela);
        if (elementoValorTotal) elementoValorTotal.textContent = formatarMoeda(valorPagoTotal);
        
        const corJuros = totalJuros > 0 ? '#ef4444' : '#16a34a';
        if (elementoJurosTotal) elementoJurosTotal.style.color = corJuros;
        if (elementoJurosParcela) elementoJurosParcela.style.color = corJuros;
    }
}

async function editarDespesa(index, mes, ano) {
    abrirModalNovaDespesa(index);
}

function configurarEventosFormularioDespesa() {
    const despesaParcelado = document.getElementById('despesa-parcelado');
    if (despesaParcelado) {
        despesaParcelado.addEventListener('change', function() {
            const info = document.getElementById('info-parcelamento');
            
            if (this.checked) {
                info?.classList.remove('hidden');
            } else {
                info?.classList.add('hidden');
            }
            
            calcularInfoParcelamento();
        });
    }

    const formasPagamento = document.querySelectorAll('input[name="forma-pagamento"]');
    formasPagamento.forEach(radio => {
        radio.addEventListener('change', function() {
            validarFormaPagamento();
        });
    });

    const selectCategoria = document.getElementById('despesa-categoria');
    if (selectCategoria) {
        selectCategoria.addEventListener('change', function() {
            validarCategoria();
        });
    }

    const inputValor = document.getElementById('despesa-valor');
    const inputValorPago = document.getElementById('despesa-valor-pago');
    const inputParcelas = document.getElementById('despesa-parcelas');
    
    if (inputValor) {
        inputValor.addEventListener('input', function() {
            calcularInfoParcelamento();
        });
    }
    
    [inputValorPago, inputParcelas].forEach(input => {
        if (input) {
            input.addEventListener('input', calcularInfoParcelamento);
        }
    });
    
    const dataCompra = document.getElementById('despesa-data-compra');
    const dataVencimento = document.getElementById('despesa-data-vencimento');
    
    if (dataCompra && dataVencimento) {
        dataCompra.addEventListener('change', function() {
            if (!dataVencimento.value) {
                dataVencimento.value = this.value;
            }
        });
    }
}

function inicializarSistemaAnexosDespesas() {
    const sistemaAnexos = {
        limparAnexosTemporarios: (tipo) => {},
        carregarAnexosExistentes: (item, tipo) => {},
        obterAnexosParaSalvar: (tipo) => [],
        abrirSeletorArquivos: (tipo) => alert(`Sistema de anexos ${tipo} em desenvolvimento`)
    };
    
    if (!window.sistemaAnexos) {
        window.sistemaAnexos = sistemaAnexos;
    }
    
    configurarEventosFormularioAnexosDespesa();
}

function configurarEventosFormularioAnexosDespesa() {
    const btnAnexarDespesa = document.getElementById('btn-anexar-despesa');
    if (btnAnexarDespesa && !btnAnexarDespesa._anexoListener) {
        btnAnexarDespesa._anexoListener = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.sistemaAnexos) {
                window.sistemaAnexos.abrirSeletorArquivos('despesa');
            }
        };
        btnAnexarDespesa.addEventListener('click', btnAnexarDespesa._anexoListener);
    }
    
    const btnAnexarComprovante = document.getElementById('btn-anexar-comprovante');
    if (btnAnexarComprovante && !btnAnexarComprovante._anexoListener) {
        btnAnexarComprovante._anexoListener = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.sistemaAnexos) {
                window.sistemaAnexos.abrirSeletorArquivos('comprovante');
            }
        };
        btnAnexarComprovante.addEventListener('click', btnAnexarComprovante._anexoListener);
    }
}

async function carregarDespesasAtual() {
    const agora = new Date();
    const mesAtual = agora.getMonth();
    const anoAtual = agora.getFullYear();
    
    window.mesAberto = mesAtual;
    window.anoAberto = anoAtual;
    
    return await buscarEExibirDespesas(mesAtual, anoAtual);
}

window.handleSalvarDespesa = function(event) {
    event.preventDefault();
    salvarDespesa(event);
    return false;
};

window.toggleParcelamentoDespesa = function(checkbox) {
    const inputParcelas = document.getElementById('despesa-parcelas');
    const infoParcelamento = document.getElementById('info-parcelamento');
    
    if (checkbox.checked) {
        if (inputParcelas) inputParcelas.disabled = false;
        if (infoParcelamento) infoParcelamento.classList.remove('hidden');
    } else {
        if (inputParcelas) inputParcelas.disabled = true;
        if (infoParcelamento) infoParcelamento.classList.add('hidden');
    }
    
    calcularInfoParcelamento();
};

document.addEventListener('DOMContentLoaded', async function() {
    await aguardarSistemaReady();
    inicializarSistemaAnexosDespesas();
    configurarEventosFormularioDespesa();
    
    const form = document.getElementById('form-nova-despesa');
    if (form) {
        form.addEventListener('submit', salvarDespesa);
    }
    
    const btnNovaDespesa = document.getElementById('btn-nova-despesa');
    if (btnNovaDespesa) {
        btnNovaDespesa.addEventListener('click', () => {
            const mes = window.mesAberto;
            const ano = window.anoAberto;
            
            if (mes === null || mes === undefined || ano === null || ano === undefined) {
                alert('Por favor, abra um mês antes de adicionar despesas.');
                return;
            }
            
            abrirModalNovaDespesa(null);
        });
    }
    
    setTimeout(carregarDespesasAtual, 100);
});

window.despesasCache = despesasCache;
window.DespesasCore = {
    buscarEExibirDespesas,
    renderizarDespesas,
    abrirModalNovaDespesa,
    editarDespesa,
    salvarDespesa,
    atualizarStatusDespesas,
    obterCategoriaLimpa,
    criarBadgeStatus,
    obterClasseStatus,
    obterDatasExibicao,
    atualizarBotaoLote,
    sincronizarIndicesDespesas,
    configurarEventosDespesas,
    inicializarTabelaDespesasGrid,
    criarLinhaDespesaGrid,
    preencherCelulaAnexos,
    validarCategoria,
    validarFormaPagamento,
    calcularInfoParcelamento,
    carregarDespesasAtual
};