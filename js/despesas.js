// ================================================================
// SISTEMA DE DESPESAS - VERSÃO COMPLETA E FUNCIONAL
// ================================================================

let processandoDespesa = false;

const ERROS = {
    DESPESA_NAO_ENCONTRADA: 'A despesa solicitada não foi encontrada',
    ESTRUTURA_DADOS_INVALIDA: 'A estrutura de dados do mês/ano é inválida',
    VALOR_INVALIDO: 'O valor fornecido é inválido',
    DESCRICAO_OBRIGATORIA: 'A descrição da despesa é obrigatória',
    CATEGORIA_OBRIGATORIA: 'A categoria da despesa é obrigatória',
    FORMA_PAGAMENTO_OBRIGATORIA: 'É necessário selecionar uma forma de pagamento',
    PARCELAS_INVALIDAS: 'O número de parcelas deve ser maior que zero',
    MODAL_NAO_ENCONTRADO: 'Modal não encontrado'
};

// ================================================================
// RENDERIZAÇÃO DE DESPESAS
// ================================================================

function renderizarDespesas(despesas, mes, ano, fechado) {
    const listaDespesas = document.getElementById('lista-despesas');
    if (!listaDespesas) return;
    
    listaDespesas.innerHTML = '';
    
    if (Array.isArray(despesas)) {
        atualizarStatusDespesas(despesas);
        const despesasParaExibir = despesas.filter(d => !d.transferidaParaProximoMes);
        
        despesasParaExibir.forEach((despesa, index) => {
            const tr = criarLinhaDespesa(despesa, index, fechado);
            listaDespesas.appendChild(tr);
        });
    }
    
    if (!fechado) {
        configurarEventosDespesas(listaDespesas, mes, ano);
    }
    
    atualizarBotaoLote();
}

function criarLinhaDespesa(despesa, index, fechado) {
    const tr = document.createElement('tr');
    tr.className = 'despesa-row';
    
    if (despesa.status === 'em_dia') {
        tr.classList.add('despesa-em-dia');
    } else if (despesa.status === 'atrasada') {
        tr.classList.add('despesa-atrasada');
    } else if (despesa.status === 'quitada' || despesa.quitado) {
        tr.classList.add('despesa-quitada');
    }
    
    if (fechado) {
        tr.classList.add('transacao-fechada');
    }
    
    tr.setAttribute('data-status', despesa.status || 'pendente');
    tr.setAttribute('data-categoria', despesa.categoria || '');
    tr.setAttribute('data-forma-pagamento', despesa.formaPagamento || '');
    
    preencherLinhaDespesa(tr, despesa, index, fechado);
    
    return tr;
}

function preencherLinhaDespesa(tr, despesa, index, fechado) {
    tr.innerHTML = '';
    
    // Checkbox
    const tdCheckbox = document.createElement('td');
    tdCheckbox.className = 'col-checkbox';
    if (!fechado && !despesa.quitado && despesa.status !== 'quitada') {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'despesa-checkbox';
        checkbox.dataset.index = index;
        checkbox.addEventListener('change', atualizarBotaoLote);
        tdCheckbox.appendChild(checkbox);
    }
    tr.appendChild(tdCheckbox);
    
    // Descrição
    const tdDescricao = document.createElement('td');
    tdDescricao.className = 'col-descricao';
    const spanDescricao = document.createElement('span');
    spanDescricao.className = 'despesa-descricao';
    spanDescricao.textContent = despesa.descricao || 'Sem descrição';
    spanDescricao.title = despesa.descricao || 'Sem descrição';
    tdDescricao.appendChild(spanDescricao);
    tr.appendChild(tdDescricao);
    
    // Categoria
    const tdCategoria = document.createElement('td');
    tdCategoria.className = 'col-categoria';
    const spanCategoria = document.createElement('span');
    spanCategoria.className = 'despesa-categoria';
    spanCategoria.textContent = obterCategoriaLimpa(despesa);
    spanCategoria.title = obterCategoriaLimpa(despesa);
    tdCategoria.appendChild(spanCategoria);
    tr.appendChild(tdCategoria);
    
    // Forma de Pagamento
    const tdPagamento = document.createElement('td');
    tdPagamento.className = 'col-forma-pagamento';
    if (despesa.formaPagamento) {
        const badge = document.createElement('span');
        badge.className = `badge-pagamento ${despesa.formaPagamento}`;
        badge.textContent = despesa.formaPagamento.toUpperCase();
        tdPagamento.appendChild(badge);
    } else {
        const badge = document.createElement('span');
        badge.className = 'badge-pagamento debito';
        badge.textContent = 'DÉBITO';
        tdPagamento.appendChild(badge);
    }
    tr.appendChild(tdPagamento);
    
    // Valor
    const tdValor = document.createElement('td');
    tdValor.className = 'col-valor';
    const spanValor = document.createElement('span');
    spanValor.className = 'despesa-valor';
    spanValor.textContent = formatarMoeda(despesa.valor || 0);
    tdValor.appendChild(spanValor);
    tr.appendChild(tdValor);
    
    // Parcela
    const tdParcela = document.createElement('td');
    tdParcela.className = 'col-parcela';
    const spanParcela = document.createElement('span');
    spanParcela.className = 'despesa-parcela';
    spanParcela.textContent = despesa.parcela || '-';
    tdParcela.appendChild(spanParcela);
    tr.appendChild(tdParcela);
    
    // Valor Pago
    const tdValorPago = document.createElement('td');
    tdValorPago.className = 'col-valor-pago';
    const spanValorPago = document.createElement('span');
    spanValorPago.className = 'despesa-valor-pago';
    if (despesa.valorPago !== null && despesa.valorPago !== undefined && despesa.valorPago > 0) {
        spanValorPago.textContent = formatarMoeda(despesa.valorPago);
    } else {
        spanValorPago.textContent = '-';
    }
    tdValorPago.appendChild(spanValorPago);
    tr.appendChild(tdValorPago);
    
    // Status
    const tdStatus = document.createElement('td');
    tdStatus.className = 'col-status';
    const badgeStatus = document.createElement('span');
    badgeStatus.textContent = criarBadgeStatus(despesa);
    
    if (despesa.status === 'em_dia') {
        badgeStatus.className = 'badge-status badge-em-dia';
    } else if (despesa.status === 'atrasada') {
        badgeStatus.className = 'badge-status badge-atrasada';
    } else if (despesa.quitado || despesa.status === 'quitada') {
        badgeStatus.className = 'badge-status badge-quitada';
    } else {
        badgeStatus.className = 'badge-status badge-pendente';
    }
    tdStatus.appendChild(badgeStatus);
    tr.appendChild(tdStatus);
    
    // Data Compra
    const tdCompra = document.createElement('td');
    tdCompra.className = 'col-compra';
    const spanCompra = document.createElement('span');
    spanCompra.className = 'despesa-data-compra';
    const { dataCompraExibir } = obterDatasExibicao(despesa);
    spanCompra.textContent = dataCompraExibir || '-';
    tdCompra.appendChild(spanCompra);
    tr.appendChild(tdCompra);
    
    // Data Vencimento
    const tdVencimento = document.createElement('td');
    tdVencimento.className = 'col-vencimento';
    const spanVencimento = document.createElement('span');
    spanVencimento.className = 'despesa-data-vencimento';
    const { dataVencimentoExibir } = obterDatasExibicao(despesa);
    spanVencimento.textContent = dataVencimentoExibir || '-';
    tdVencimento.appendChild(spanVencimento);
    tr.appendChild(tdVencimento);
    
    // Ações
    const tdAcoes = document.createElement('td');
    tdAcoes.className = 'col-acoes';
    const divAcoes = document.createElement('div');
    divAcoes.className = 'despesa-acoes';
    
    const btnEditar = document.createElement('button');
    btnEditar.className = 'btn btn-editar';
    btnEditar.dataset.index = index;
    btnEditar.title = 'Editar';
    btnEditar.innerHTML = '<i class="fas fa-edit"></i>';
    if (fechado) {
        btnEditar.disabled = true;
        btnEditar.title = 'Mês fechado';
    }
    divAcoes.appendChild(btnEditar);
    
    const btnExcluir = document.createElement('button');
    btnExcluir.className = 'btn btn-excluir';
    btnExcluir.dataset.index = index;
    btnExcluir.title = 'Excluir';
    btnExcluir.innerHTML = '<i class="fas fa-trash"></i>';
    if (fechado) {
        btnExcluir.disabled = true;
        btnExcluir.title = 'Mês fechado';
    }
    divAcoes.appendChild(btnExcluir);
    
    if (!fechado && !despesa.quitado && despesa.status !== 'quitada') {
        const btnPagar = document.createElement('button');
        btnPagar.className = 'btn btn-pagar';
        btnPagar.dataset.index = index;
        btnPagar.title = 'Pagar';
        btnPagar.innerHTML = '<i class="fas fa-check"></i>';
        divAcoes.appendChild(btnPagar);
        
        const btnMover = document.createElement('button');
        btnMover.className = 'btn btn-mover';
        btnMover.dataset.index = index;
        btnMover.title = 'Mover para próximo mês';
        btnMover.innerHTML = '<i class="fas fa-arrow-right"></i>';
        divAcoes.appendChild(btnMover);
    }
    
    tdAcoes.appendChild(divAcoes);
    tr.appendChild(tdAcoes);
}

// ================================================================
// CONFIGURAÇÃO DE EVENTOS
// ================================================================

function configurarEventosDespesas(container, mes, ano) {
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn');
        if (!btn) return;
        
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        
        if (btn.classList.contains('btn-editar')) {
            editarDespesa(index, mes, ano);
        } else if (btn.classList.contains('btn-excluir')) {
            excluirDespesa(index, mes, ano);
        } else if (btn.classList.contains('btn-pagar')) {
            abrirModalPagamento(index, mes, ano);
        } else if (btn.classList.contains('btn-mover')) {
            moverParaProximoMes(index, mes, ano);
        }
    });
}

// ================================================================
// MODAL NOVA DESPESA
// ================================================================

function abrirModalNovaDespesa(index) {
    try {
        if (mesAberto === null || anoAberto === null) {
            mesAberto = new Date().getMonth();
            anoAberto = new Date().getFullYear();
        }
     
        const modal = document.getElementById('modal-nova-despesa');
        const form = document.getElementById('form-nova-despesa');
        
        if (!modal || !form) {
            throw new Error(ERROS.MODAL_NAO_ENCONTRADO);
        }
        
        form.reset();
        resetarEstadoFormularioDespesa();
        processandoDespesa = false;
        
        document.getElementById('despesa-mes').value = mesAberto;
        document.getElementById('despesa-ano').value = anoAberto;
        
        const dataAtual = new Date(anoAberto, mesAberto, new Date().getDate());
        const dataFormatada = dataAtual.toISOString().split('T')[0];
        document.getElementById('despesa-data-compra').value = dataFormatada;
        document.getElementById('despesa-data-vencimento').value = dataFormatada;
        
        if (index !== undefined) {
            preencherFormularioEdicao(index);
        } else {
            document.getElementById('despesa-id').value = '';
        }
        
        modal.classList.add('active');
        modal.style.display = 'block';
        
        setTimeout(() => {
            document.getElementById('despesa-descricao').focus();
        }, 300);
        
    } catch (error) {
        console.error("Erro ao abrir modal de nova despesa:", error);
        alert("Não foi possível abrir o formulário: " + error.message);
    }
}

function resetarEstadoFormularioDespesa() {
    document.getElementById('opcoes-parcelamento').classList.add('hidden');
    document.getElementById('info-parcelamento').classList.add('hidden');
    
    const opcoesReplicacaoSemValor = document.getElementById('opcoes-replicacao-sem-valor');
    if (opcoesReplicacaoSemValor) opcoesReplicacaoSemValor.classList.add('hidden');
    
    const checkReplicarSemValores = document.getElementById('replicar-sem-valores');
    if (checkReplicarSemValores) {
        checkReplicarSemValores.checked = false;
        checkReplicarSemValores.disabled = false;
    }
    
    const checkDespesaParcelado = document.getElementById('despesa-parcelado');
    if (checkDespesaParcelado) {
        checkDespesaParcelado.checked = false;
        checkDespesaParcelado.disabled = false;
    }
    
    const formasPagamento = document.querySelectorAll('input[name="forma-pagamento"]');
    formasPagamento.forEach(radio => radio.checked = false);
    
    document.querySelectorAll('.form-group.error').forEach(group => {
        group.classList.remove('error');
    });
    
    const errorElements = document.querySelectorAll('.form-error-categoria, .form-error-pagamento');
    errorElements.forEach(el => el.remove());
}

// ================================================================
// SALVAR DESPESA
// ================================================================

function salvarDespesa(e) {
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
        
        if (!formularioValido) {
            processandoDespesa = false;
            return false;
        }
        
        const formData = coletarDadosFormularioDespesa();
        
        // ✅ ADICIONAR ESTAS 5 LINHAS:
        if (window.useAPI && window.sistemaAdapter) {
            window.sistemaAdapter.salvarDespesa(formData.mes, formData.ano, formData);
        } else {
            // Código existente
            if (formData.id !== '') {
                atualizarDespesaExistente(formData);
            } else {
                adicionarNovaDespesa(formData);
            }
            salvarDados();
        }
        
        setTimeout(() => {
            if (typeof carregarDadosDashboard === 'function') {
                carregarDadosDashboard(anoAtual);
            }
            
            if (typeof renderizarDetalhesDoMes === 'function') {
                renderizarDetalhesDoMes(formData.mes, formData.ano);
            }
            
            document.getElementById('modal-nova-despesa').style.display = 'none';
            
            processandoDespesa = false;
        }, 100);
        
        return false;
    } catch (error) {
        console.error("Erro ao salvar despesa:", error);
        alert("Não foi possível salvar a despesa: " + error.message);
        processandoDespesa = false;
        return false;
    }
}

function coletarDadosFormularioDespesa() {
    const categoria = document.getElementById('despesa-categoria').value;
    const formaPagamentoSelecionada = document.querySelector('input[name="forma-pagamento"]:checked');
    const formaPagamento = formaPagamentoSelecionada ? formaPagamentoSelecionada.value : null;
    
    return {
        id: document.getElementById('despesa-id').value,
        mes: parseInt(document.getElementById('despesa-mes').value),
        ano: parseInt(document.getElementById('despesa-ano').value),
        descricao: document.getElementById('despesa-descricao').value,
        categoria: categoria,
        formaPagamento: formaPagamento,
        valor: parseFloat(document.getElementById('despesa-valor').value),
        valorPago: document.getElementById('despesa-valor-pago').value ? 
                  parseFloat(document.getElementById('despesa-valor-pago').value) : null,
        dataCompra: document.getElementById('despesa-data-compra').value,
        dataVencimento: document.getElementById('despesa-data-vencimento').value,
        parcelado: document.getElementById('despesa-parcelado').checked,
        totalParcelas: document.getElementById('despesa-parcelado').checked ? 
                      parseInt(document.getElementById('despesa-parcelas').value) : 1,
        replicarSemValor: document.getElementById('replicar-sem-valores') ? 
                         document.getElementById('replicar-sem-valores').checked : false,
        totalMesesReplicacao: document.getElementById('replicar-sem-valores') && 
                             document.getElementById('replicar-sem-valores').checked &&
                             document.getElementById('replicar-meses') ? 
                             parseInt(document.getElementById('replicar-meses').value) : 0
    };
}

function adicionarNovaDespesa(formData) {
    garantirEstruturaDados(formData.ano, formData.mes);
    
    let valorOriginal = formData.valor;
    let valorTotalComJuros = formData.valorPago !== null ? formData.valorPago : valorOriginal;
    let totalJuros = valorTotalComJuros - valorOriginal;
    let valorPorParcela = formData.parcelado ? arredondarParaDuasCasas(valorTotalComJuros / formData.totalParcelas) : valorTotalComJuros;
    
    const idGrupoParcelamento = formData.parcelado || formData.replicarSemValor ? gerarId() : null;
    
    const novaDespesa = criarObjetoDespesa({
        descricao: formData.descricao,
        categoria: formData.categoria,
        formaPagamento: formData.formaPagamento,
        valor: valorPorParcela,
        valorOriginal: formData.parcelado ? valorOriginal / formData.totalParcelas : valorOriginal,
        valorTotalComJuros: valorTotalComJuros,
        valorPago: null,
        dataCompra: formData.dataCompra,
        dataVencimento: formData.dataVencimento,
        parcelado: formData.parcelado,
        parcela: formData.parcelado ? '1/' + formData.totalParcelas : null,
        totalParcelas: formData.parcelado ? formData.totalParcelas : null,
        metadados: formData.parcelado ? {
            valorOriginalTotal: valorOriginal,
            valorTotalComJuros: valorTotalComJuros,
            totalJuros: totalJuros,
            jurosPorParcela: totalJuros / formData.totalParcelas,
            valorPorParcela: valorPorParcela
        } : totalJuros > 0 ? {
            valorOriginalTotal: valorOriginal,
            valorTotalComJuros: valorTotalComJuros,
            totalJuros: totalJuros
        } : null,
        quitado: false,
        idGrupoParcelamento: idGrupoParcelamento
    });
    
    dadosFinanceiros[formData.ano].meses[formData.mes].despesas.push(novaDespesa);
    
    if (formData.parcelado && formData.totalParcelas > 1) {
        criarParcelasFuturas(formData, valorPorParcela, idGrupoParcelamento, valorOriginal, valorTotalComJuros, totalJuros);
    }
    
    if (formData.replicarSemValor && formData.totalMesesReplicacao > 0) {
        replicarDespesasSemValores(formData, idGrupoParcelamento);
    }
}

function criarParcelasFuturas(formData, valorPorParcela, idGrupoParcelamento, valorOriginal, valorTotalComJuros, totalJuros) {
    for (let i = 1; i < formData.totalParcelas; i++) {
        const mesParcela = (formData.mes + i) % 12;
        const anoParcela = formData.ano + Math.floor((formData.mes + i) / 12);
        
        garantirEstruturaDados(anoParcela, mesParcela);
        
        const dataVencimentoBase = new Date(formData.dataVencimento);
        dataVencimentoBase.setMonth(dataVencimentoBase.getMonth() + i);
        const dataVencimento = dataVencimentoBase.toISOString().split('T')[0];
        
        dadosFinanceiros[anoParcela].meses[mesParcela].despesas.push(criarObjetoDespesa({
            descricao: formData.descricao,
            categoria: formData.categoria,
            formaPagamento: formData.formaPagamento,
            valor: valorPorParcela,
            valorOriginal: valorOriginal / formData.totalParcelas,
            valorTotalComJuros: null,
            valorPago: null,
            dataCompra: formData.dataCompra,
            dataVencimento: dataVencimento,
            parcelado: true,
            parcela: `${i + 1}/${formData.totalParcelas}`,
            totalParcelas: formData.totalParcelas,
            metadados: {
                valorOriginalTotal: valorOriginal,
                valorTotalComJuros: valorTotalComJuros,
                totalJuros: totalJuros,
                jurosPorParcela: totalJuros / formData.totalParcelas,
                valorPorParcela: valorPorParcela
            },
            quitado: false,
            idGrupoParcelamento: idGrupoParcelamento
        }));
    }
}

function replicarDespesasSemValores(formData, idGrupoParcelamento) {
    for (let i = 1; i <= formData.totalMesesReplicacao; i++) {
        const mesReplicacao = (formData.mes + i) % 12;
        const anoReplicacao = formData.ano + Math.floor((formData.mes + i) / 12);
        
        garantirEstruturaDados(anoReplicacao, mesReplicacao);
        
        const dataVencimentoBase = new Date(formData.dataVencimento);
        dataVencimentoBase.setMonth(dataVencimentoBase.getMonth() + i);
        const dataVencimento = dataVencimentoBase.toISOString().split('T')[0];
        
        dadosFinanceiros[anoReplicacao].meses[mesReplicacao].despesas.push(criarObjetoDespesa({
            descricao: formData.descricao,
            categoria: formData.categoria,
            formaPagamento: formData.formaPagamento,
            valor: 0,
            valorOriginal: 0,
            valorTotalComJuros: null,
            valorPago: null,
            dataCompra: formData.dataCompra,
            dataVencimento: dataVencimento,
            parcelado: false,
            quitado: false,
            idGrupoParcelamento: idGrupoParcelamento,
            replicadaSemValor: true
        }));
    }
}

// ================================================================
// EXCLUSÃO DE DESPESAS - VERSÃO CORRIGIDA
// ================================================================

// ================================================================
// EXCLUSÃO DE DESPESAS - VERSÃO CORRIGIDA E SIMPLIFICADA
// ================================================================

function excluirDespesa(index, mes, ano) {
    try {
        if (!dadosFinanceiros[ano] || 
            !dadosFinanceiros[ano].meses[mes] || 
            !dadosFinanceiros[ano].meses[mes].despesas[index]) {
            throw new Error(ERROS.DESPESA_NAO_ENCONTRADA);
        }
        
        const despesa = dadosFinanceiros[ano].meses[mes].despesas[index];
        
        // Guardar referências globais para uso nos botões
        window.despesaParaExcluir = {
            index: index,
            mes: mes,
            ano: ano,
            despesa: despesa
        };
        
        configurarModalExclusao(despesa, index, mes, ano);
        document.getElementById('modal-confirmacao-exclusao-despesa').style.display = 'block';
    } catch (error) {
        console.error("Erro ao excluir despesa:", error);
        alert("Não foi possível excluir a despesa: " + error.message);
    }
}

function configurarModalExclusao(despesa, index, mes, ano) {
    const titulo = document.getElementById('exclusao-titulo');
    const mensagem = document.getElementById('exclusao-mensagem');
    
    if (despesa.parcelado && despesa.parcela) {
        titulo.textContent = 'Excluir item parcelado';
        mensagem.textContent = 'Este item está parcelado. Como deseja prosseguir?';
        
        document.querySelectorAll('.opcao-exclusao-basica').forEach(btn => btn.style.display = 'none');
        document.querySelectorAll('.opcao-exclusao-parcelada').forEach(btn => btn.style.display = 'block');
    } else {
        titulo.textContent = 'Excluir despesa';
        mensagem.textContent = 'Tem certeza que deseja excluir esta despesa?';
        
        document.querySelectorAll('.opcao-exclusao-basica').forEach(btn => btn.style.display = 'block');
        document.querySelectorAll('.opcao-exclusao-parcelada').forEach(btn => btn.style.display = 'none');
    }
    
    configurarBotoesExclusao(despesa, index, mes, ano);
}

function configurarBotoesExclusao(despesa, index, mes, ano) {
    // Remover TODOS os event listeners anteriores clonando os botões
    const btnExcluirAtual = document.getElementById('btn-excluir-atual');
    const btnExcluirTodosMeses = document.getElementById('btn-excluir-todos-meses');
    const btnExcluirParcelaAtual = document.getElementById('btn-excluir-parcela-atual');
    const btnExcluirTodasParcelas = document.getElementById('btn-excluir-todas-parcelas');
    
    // Para despesas NÃO parceladas
    if (!despesa.parcelado) {
        // Botão "Excluir apenas neste mês"
        if (btnExcluirAtual) {
            const novoBtnAtual = btnExcluirAtual.cloneNode(true);
            novoBtnAtual.id = 'btn-excluir-atual';
            btnExcluirAtual.parentNode.replaceChild(novoBtnAtual, btnExcluirAtual);
        }
        
        // Botão "Excluir em todos os meses"
        if (btnExcluirTodosMeses) {
            const novoBtnTodosMeses = btnExcluirTodosMeses.cloneNode(true);
            novoBtnTodosMeses.id = 'btn-excluir-todos-meses';
            btnExcluirTodosMeses.parentNode.replaceChild(novoBtnTodosMeses, btnExcluirTodosMeses);
        }
        
        // Adicionar eventos após garantir que os elementos foram substituídos
        setTimeout(() => {
            const btnAtual = document.getElementById('btn-excluir-atual');
            const btnTodos = document.getElementById('btn-excluir-todos-meses');
            
            if (btnAtual) {
                btnAtual.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Excluindo apenas do mês atual...', index, mes, ano);
                    
                    // Excluir apenas esta despesa
                    dadosFinanceiros[ano].meses[mes].despesas.splice(index, 1);
                    
                    // Salvar e atualizar
                    salvarDados();
                    if (typeof carregarDadosDashboard === 'function') {
                        carregarDadosDashboard(anoAtual);
                    }
                    if (typeof renderizarDetalhesDoMes === 'function') {
                        renderizarDetalhesDoMes(mes, ano);
                    }
                    
                    // Fechar modal
                    document.getElementById('modal-confirmacao-exclusao-despesa').style.display = 'none';
                };
            }
            
            if (btnTodos) {
                btnTodos.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Excluindo de todos os meses...', despesa.descricao, despesa.categoria);
                    
                    // Excluir em todos os meses
                    excluirDespesaEmTodosMeses(ano, despesa.descricao, despesa.categoria);
                    
                    // Salvar e atualizar
                    salvarDados();
                    if (typeof carregarDadosDashboard === 'function') {
                        carregarDadosDashboard(anoAtual);
                    }
                    if (typeof renderizarDetalhesDoMes === 'function') {
                        renderizarDetalhesDoMes(mes, ano);
                    }
                    
                    // Fechar modal
                    document.getElementById('modal-confirmacao-exclusao-despesa').style.display = 'none';
                };
            }
        }, 50);
    } 
    // Para despesas PARCELADAS
    else {
        // Botão "Excluir apenas esta parcela"
        if (btnExcluirParcelaAtual) {
            const novoBtnParcela = btnExcluirParcelaAtual.cloneNode(true);
            novoBtnParcela.id = 'btn-excluir-parcela-atual';
            btnExcluirParcelaAtual.parentNode.replaceChild(novoBtnParcela, btnExcluirParcelaAtual);
        }
        
        // Botão "Excluir todas as parcelas"
        if (btnExcluirTodasParcelas) {
            const novoBtnTodasParcelas = btnExcluirTodasParcelas.cloneNode(true);
            novoBtnTodasParcelas.id = 'btn-excluir-todas-parcelas';
            btnExcluirTodasParcelas.parentNode.replaceChild(novoBtnTodasParcelas, btnExcluirTodasParcelas);
        }
        
        // Adicionar eventos após garantir que os elementos foram substituídos
        setTimeout(() => {
            const btnParcela = document.getElementById('btn-excluir-parcela-atual');
            const btnTodas = document.getElementById('btn-excluir-todas-parcelas');
            
            if (btnParcela) {
                btnParcela.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    processarExclusao('atual', index, mes, ano, despesa.descricao, despesa.categoria, despesa.idGrupoParcelamento);
                };
            }
            
            if (btnTodas) {
                btnTodas.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    processarExclusao('todas', index, mes, ano, despesa.descricao, despesa.categoria, despesa.idGrupoParcelamento);
                };
            }
        }, 50);
    }
}

function processarExclusao(opcao, index, mes, ano, descricaoDespesa, categoriaDespesa, idGrupoParcelamento) {
    console.log('Processando exclusão:', opcao, index, mes, ano);
    
    // ✅ ADICIONAR ESTAS 3 LINHAS:
    if (window.useAPI && window.sistemaAdapter) {
        window.sistemaAdapter.excluirDespesa(mes, ano, index, opcao, { descricaoDespesa, categoriaDespesa, idGrupoParcelamento });
    } else {
        // Código existente
        if (opcao === 'atual') {
            dadosFinanceiros[ano].meses[mes].despesas.splice(index, 1);
        } 
        else if (opcao === 'todas') {
            excluirTodasParcelas(ano, descricaoDespesa, categoriaDespesa, idGrupoParcelamento);
        }
        salvarDados();
    }
    
    setTimeout(() => {
        if (typeof carregarDadosDashboard === 'function') {
            carregarDadosDashboard(anoAtual);
        }
        if (typeof renderizarDetalhesDoMes === 'function') {
            renderizarDetalhesDoMes(mesAberto, anoAberto);
        }
        document.getElementById('modal-confirmacao-exclusao-despesa').style.display = 'none';
    }, 100);
}
function excluirTodasParcelas(ano, descricao, categoria, idGrupo) {
    if (!idGrupo) {
        alert("Não foi possível identificar todas as parcelas relacionadas.");
        return;
    }
    
    // Excluir em todos os anos possíveis
    for (let anoAtual = ano; anoAtual <= ano + 3; anoAtual++) {
        if (!dadosFinanceiros[anoAtual]) continue;
        
        for (let m = 0; m < 12; m++) {
            if (!dadosFinanceiros[anoAtual].meses[m] || !dadosFinanceiros[anoAtual].meses[m].despesas) continue;
            
            const despesas = dadosFinanceiros[anoAtual].meses[m].despesas;
            
            for (let i = despesas.length - 1; i >= 0; i--) {
                const d = despesas[i];
                if (d.idGrupoParcelamento === idGrupo && d.descricao === descricao && d.categoria === categoria) {
                    despesas.splice(i, 1);
                }
            }
        }
    }
}

// Função para excluir despesa em todos os meses do ano
function excluirDespesaEmTodosMeses(ano, descricao, categoria) {
    if (!dadosFinanceiros[ano]) return;
    
    console.log('Excluindo em todos os meses:', descricao, categoria);
    
    for (let m = 0; m < 12; m++) {
        if (!dadosFinanceiros[ano].meses[m] || !dadosFinanceiros[ano].meses[m].despesas) continue;
        
        const despesas = dadosFinanceiros[ano].meses[m].despesas;
        
        for (let i = despesas.length - 1; i >= 0; i--) {
            const d = despesas[i];
            // Exclui apenas despesas não parceladas com mesma descrição e categoria
            if (d.descricao === descricao && d.categoria === categoria && !d.parcelado) {
                console.log('Removendo despesa do mês', m, ':', d.descricao);
                despesas.splice(i, 1);
            }
        }
    }
}

// Função auxiliar global para excluir despesa atual (pode ser chamada diretamente)
window.excluirDespesaAtual = function() {
    if (window.despesaParaExcluir) {
        const { index, mes, ano } = window.despesaParaExcluir;
        
        console.log('Excluindo despesa atual:', index, mes, ano);
        
        dadosFinanceiros[ano].meses[mes].despesas.splice(index, 1);
        salvarDados();
        
        if (typeof carregarDadosDashboard === 'function') {
            carregarDadosDashboard(anoAtual);
        }
        if (typeof renderizarDetalhesDoMes === 'function') {
            renderizarDetalhesDoMes(mes, ano);
        }
        
        document.getElementById('modal-confirmacao-exclusao-despesa').style.display = 'none';
    }
};

// Função para fechar o modal
window.fecharModalExclusao = function() {
    const modal = document.getElementById('modal-confirmacao-exclusao-despesa');
    if (modal) {
        modal.style.display = 'none';
    }
    window.despesaParaExcluir = null;
};

// ================================================================
// FUNÇÕES AUXILIARES
// ================================================================

function criarObjetoDespesa(dados) {
    return {
        descricao: dados.descricao || '',
        categoria: dados.categoria || '',
        formaPagamento: dados.formaPagamento || null,
        valor: parseFloat(dados.valor) || 0,
        valorOriginal: dados.valorOriginal !== undefined ? parseFloat(dados.valorOriginal) : null,
        valorTotalComJuros: dados.valorTotalComJuros !== undefined ? parseFloat(dados.valorTotalComJuros) : null,
        valorPago: dados.valorPago !== undefined ? parseFloat(dados.valorPago) : null,
        dataCompra: dados.dataCompra || new Date().toISOString().split('T')[0],
        dataVencimento: dados.dataVencimento || new Date().toISOString().split('T')[0],
        parcelado: !!dados.parcelado,
        parcela: dados.parcela || null,
        totalParcelas: dados.parcelado ? parseInt(dados.totalParcelas) || null : null,
        metadados: dados.metadados || null,
        quitado: !!dados.quitado,
        status: dados.status || 'em_dia',
        idGrupoParcelamento: dados.idGrupoParcelamento || null,
        replicadaSemValor: dados.replicadaSemValor || false
    };
}

function preencherFormularioEdicao(index) {
    if (!dadosFinanceiros[anoAberto]?.meses[mesAberto]?.despesas[index]) {
        throw new Error(ERROS.DESPESA_NAO_ENCONTRADA);
    }
    
    const despesa = dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index];
    
    document.getElementById('despesa-id').value = index;
    document.getElementById('despesa-descricao').value = despesa.descricao;
    document.getElementById('despesa-categoria').value = despesa.categoria;
    document.getElementById('despesa-valor').value = despesa.valorOriginal || despesa.valor;
    document.getElementById('despesa-valor-pago').value = despesa.valorTotalComJuros || despesa.valorPago || '';
    
    if (despesa.dataCompra) {
        document.getElementById('despesa-data-compra').value = despesa.dataCompra;
    }
    
    if (despesa.dataVencimento) {
        document.getElementById('despesa-data-vencimento').value = despesa.dataVencimento;
    }
    
    if (despesa.formaPagamento) {
        const radioFormaPagamento = document.querySelector(`input[name="forma-pagamento"][value="${despesa.formaPagamento}"]`);
        if (radioFormaPagamento) radioFormaPagamento.checked = true;
    }
    
    if (despesa.parcelado) {
        document.getElementById('despesa-parcelado').checked = true;
        document.getElementById('opcoes-parcelamento').classList.remove('hidden');
        document.getElementById('despesa-parcelas').value = despesa.totalParcelas;
        
        if (despesa.metadados) calcularInfoParcelamento();
    }
}

function atualizarDespesaExistente(formData) {
    if (!dadosFinanceiros[formData.ano] || 
        !dadosFinanceiros[formData.ano].meses[formData.mes] ||
        !dadosFinanceiros[formData.ano].meses[formData.mes].despesas[formData.id]) {
        throw new Error(ERROS.DESPESA_NAO_ENCONTRADA);
    }
    
    let valorOriginal = formData.valor;
    let valorTotalComJuros = formData.valorPago !== null ? formData.valorPago : valorOriginal;
    let totalJuros = valorTotalComJuros - valorOriginal;
    let valorPorParcela = formData.parcelado ? arredondarParaDuasCasas(valorTotalComJuros / formData.totalParcelas) : valorTotalComJuros;
    
    const despesaAtualizada = criarObjetoDespesa({
        descricao: formData.descricao,
        categoria: formData.categoria,
        formaPagamento: formData.formaPagamento,
        valor: valorPorParcela,
        valorOriginal: formData.parcelado ? valorOriginal / formData.totalParcelas : valorOriginal,
        valorTotalComJuros: valorTotalComJuros,
        valorPago: null,
        dataCompra: formData.dataCompra,
        dataVencimento: formData.dataVencimento,
        parcelado: formData.parcelado,
        parcela: formData.parcelado ? '1/' + formData.totalParcelas : null,
        totalParcelas: formData.parcelado ? formData.totalParcelas : null,
        metadados: formData.parcelado || totalJuros > 0 ? {
            valorOriginalTotal: valorOriginal,
            valorTotalComJuros: valorTotalComJuros,
            totalJuros: totalJuros,
            jurosPorParcela: formData.parcelado ? totalJuros / formData.totalParcelas : 0,
            valorPorParcela: valorPorParcela
        } : null,
        quitado: false
    });
    
    dadosFinanceiros[formData.ano].meses[formData.mes].despesas[formData.id] = despesaAtualizada;
}

function editarDespesa(index, mes, ano) {
    abrirModalNovaDespesa(index);
}

// ================================================================
// MOVER DESPESA PARA PRÓXIMO MÊS
// ================================================================

function moverParaProximoMes(index, mes, ano) {
    try {
        if (!dadosFinanceiros[ano] || !dadosFinanceiros[ano].meses[mes] || !dadosFinanceiros[ano].meses[mes].despesas[index]) {
            return;
        }
        
        const despesa = dadosFinanceiros[ano].meses[mes].despesas[index];
        
        if (despesa.quitado) {
            alert("Não é possível mover uma despesa que já foi paga.");
            return;
        }
        
        const { proximoMes, proximoAno } = calcularProximoMes(mes, ano);
        const { mesAtualNome, proximoMesNome } = obterNomesMeses(mes, proximoMes);
        
        if (!confirm(`Mover despesa "${despesa.descricao}" de ${mesAtualNome} para ${proximoMesNome} de ${proximoAno}?`)) {
            return;
        }
        
        executarMovimentoDespesa(despesa, index, mes, ano, proximoMes, proximoAno, mesAtualNome, proximoMesNome);
        
    } catch (error) {
        console.error("Erro ao mover despesa:", error);
        alert("Não foi possível mover a despesa: " + error.message);
    }
}

function calcularProximoMes(mes, ano) {
    let proximoMes = mes + 1;
    let proximoAno = ano;
    
    if (proximoMes > 11) {
        proximoMes = 0;
        proximoAno = ano + 1;
    }
    
    return { proximoMes, proximoAno };
}

function obterNomesMeses(mes, proximoMes) {
    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                       'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    return {
        mesAtualNome: nomesMeses[mes],
        proximoMesNome: nomesMeses[proximoMes]
    };
}

function executarMovimentoDespesa(despesa, index, mes, ano, proximoMes, proximoAno, mesAtualNome, proximoMesNome) {
    garantirEstruturaDados(proximoAno, proximoMes);
    
    const despesaMovida = { ...despesa };
    
    despesaMovida.movidaEm = new Date().toISOString().split('T')[0];
    despesaMovida.mesOriginalMovimento = mes;
    despesaMovida.anoOriginalMovimento = ano;
    despesaMovida.mesDestinoMovimento = proximoMes;
    despesaMovida.anoDestinoMovimento = proximoAno;
    despesaMovida.movidaDeOutroMes = true;
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataVencimento = new Date(despesaMovida.dataVencimento);
    dataVencimento.setHours(0, 0, 0, 0);
    
    if (despesaMovida.quitado) {
        despesaMovida.status = 'quitada';
    } else if (dataVencimento < hoje) {
        despesaMovida.status = 'atrasada';
    } else {
        despesaMovida.status = 'em_dia';
    }
    
    dadosFinanceiros[proximoAno].meses[proximoMes].despesas.push(despesaMovida);
    dadosFinanceiros[ano].meses[mes].despesas.splice(index, 1);
    
    salvarDados();
    
    renderizarDetalhesDoMes(mes, ano);
    
    if (typeof carregarDadosDashboard === 'function') {
        carregarDadosDashboard(anoAtual);
    }
    
    alert(`Despesa movida com sucesso para ${proximoMesNome} de ${proximoAno}!`);
}

// ================================================================
// PAGAMENTO DE DESPESAS
// ================================================================

function abrirModalPagamento(index, mes, ano) {
    try {
        if (!dadosFinanceiros[ano] || 
            !dadosFinanceiros[ano].meses[mes] || 
            !dadosFinanceiros[ano].meses[mes].despesas[index]) {
            throw new Error(ERROS.DESPESA_NAO_ENCONTRADA);
        }
        
        const despesa = dadosFinanceiros[ano].meses[mes].despesas[index];
        
        preencherInfoDespesaPagamento(despesa);
        configurarFormPagamento(index, mes, ano);
        
        document.getElementById('modal-pagamento-individual').style.display = 'block';
    } catch (error) {
        console.error("Erro ao abrir modal de pagamento:", error);
        alert("Não foi possível abrir o modal de pagamento: " + error.message);
    }
}

function preencherInfoDespesaPagamento(despesa) {
    const eParcelado = despesa.parcelado === true && despesa.parcela;
    
    document.getElementById('pagamento-descricao').textContent = despesa.descricao;
    document.getElementById('pagamento-categoria').textContent = despesa.categoria;
    document.getElementById('pagamento-valor-original').textContent = formatarMoeda(despesa.valor);
    
    const formaPagamentoContainer = document.getElementById('pagamento-forma-container');
    if (despesa.formaPagamento) {
        document.getElementById('pagamento-forma').textContent = despesa.formaPagamento.toUpperCase();
        formaPagamentoContainer.style.display = 'block';
    } else {
        formaPagamentoContainer.style.display = 'none';
    }
    
    document.getElementById('valor-pago-individual').value = despesa.valor;
    document.getElementById('despesa-quitado-individual').checked = false;
    
    const infoParcelasFuturas = document.getElementById('info-parcelas-futuras');
    if (eParcelado) {
        infoParcelasFuturas.classList.remove('hidden');
    } else {
        infoParcelasFuturas.classList.add('hidden');
    }
}

function configurarFormPagamento(index, mes, ano) {
    const form = document.getElementById('form-pagamento-individual');
    
    const novoForm = form.cloneNode(true);
    form.parentNode.replaceChild(novoForm, form);
    
    document.getElementById('form-pagamento-individual').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const valorPago = parseFloat(document.getElementById('valor-pago-individual').value);
        const quitado = document.getElementById('despesa-quitado-individual').checked;
        
        if (isNaN(valorPago) || valorPago < 0) {
            alert('Por favor, insira um valor válido.');
            return;
        }
        
        const sucesso = processarPagamento(index, mes, ano, valorPago, quitado);
        
        if (sucesso) {
            document.getElementById('modal-pagamento-individual').style.display = 'none';
        } else {
            alert('Ocorreu um erro ao processar o pagamento.');
        }
    });
}

function processarPagamento(index, mes, ano, valorPago = null, quitarParcelasFuturas = false) {
    try {
        if (!dadosFinanceiros[ano] || !dadosFinanceiros[ano].meses[mes]) {
            throw new Error(ERROS.ESTRUTURA_DADOS_INVALIDA);
        }
        
        if (!dadosFinanceiros[ano].meses[mes].despesas || !dadosFinanceiros[ano].meses[mes].despesas[index]) {
            throw new Error(ERROS.DESPESA_NAO_ENCONTRADA);
        }
        
        const despesa = dadosFinanceiros[ano].meses[mes].despesas[index];
        
        if (valorPago === null) valorPago = despesa.valor;
        
        despesa.valorPago = parseFloat(valorPago);
        despesa.quitado = true;
        despesa.status = 'quitada';
        despesa.dataPagamento = new Date().toISOString().split('T')[0];
        
        if (quitarParcelasFuturas && despesa.parcelado && despesa.idGrupoParcelamento) {
            processarParcelasFuturas(despesa, ano);
        }
        
        salvarDados();
        
        carregarDadosDashboard(anoAtual);
        renderizarDetalhesDoMes(mes, ano);
        
        return true;
    } catch (error) {
        console.error("Erro ao processar pagamento:", error);
        return false;
    }
}

function processarParcelasFuturas(despesa, anoAtual) {
    for (let anoFuturo = anoAtual; anoFuturo <= anoAtual + 3; anoFuturo++) {
        if (!dadosFinanceiros[anoFuturo]) continue;
        
        const mesInicial = anoFuturo === anoAtual ? mesAberto + 1 : 0;
        
        for (let mesFuturo = mesInicial; mesFuturo < 12; mesFuturo++) {
            if (!dadosFinanceiros[anoFuturo].meses[mesFuturo] || 
                !dadosFinanceiros[anoFuturo].meses[mesFuturo].despesas) continue;
            
            dadosFinanceiros[anoFuturo].meses[mesFuturo].despesas.forEach(d => {
                if (d.idGrupoParcelamento === despesa.idGrupoParcelamento) {
                    d.valor = 0;
                    d.quitado = true;
                    d.status = 'quitada';
                    d.valorPago = 0;
                    d.dataPagamento = despesa.dataPagamento;
                    d.pagoAntecipadamente = true;
                }
            });
        }
    }
}

// ================================================================
// PAGAMENTO EM LOTE
// ================================================================

function pagarDespesasEmLote() {
    try {
        const todasCheckboxes = document.querySelectorAll('.despesa-checkbox:checked');
        
        if (todasCheckboxes.length === 0) {
            alert("Nenhuma despesa selecionada para pagamento.");
            return;
        }

        const checkboxesValidas = Array.from(todasCheckboxes).filter(checkbox => {
            const index = parseInt(checkbox.dataset.index);
            
            if (!(dadosFinanceiros[anoAberto] && 
                  dadosFinanceiros[anoAberto].meses[mesAberto] && 
                  dadosFinanceiros[anoAberto].meses[mesAberto].despesas && 
                  dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index])) {
                return false;
            }
            
            const despesa = dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index];
            return !despesa.quitado;
        });
        
        if (checkboxesValidas.length === 0) {
            alert("Nenhuma despesa válida selecionada para pagamento.");
            return;
        }
        
        configurarModalPagamentoLote(checkboxesValidas);
        document.getElementById('modal-pagamento-lote-despesas').style.display = 'block';
    } catch (error) {
        console.error("Erro ao preparar pagamento em lote:", error);
        alert("Ocorreu um erro ao preparar o pagamento em lote: " + error.message);
    }
}

function configurarModalPagamentoLote(checkboxes) {
    document.getElementById('lote-contagem-despesas').textContent = `Você está prestes a pagar ${checkboxes.length} despesa(s) em lote.`;
    
    const btnOriginal = document.getElementById('btn-pagar-valor-original');
    const btnPersonalizado = document.getElementById('btn-pagar-com-valor-personalizado');
    
    const novoBtnOriginal = btnOriginal.cloneNode(true);
    btnOriginal.parentNode.replaceChild(novoBtnOriginal, btnOriginal);
    
    const novoBtnPersonalizado = btnPersonalizado.cloneNode(true);
    btnPersonalizado.parentNode.replaceChild(novoBtnPersonalizado, btnPersonalizado);
    
    document.getElementById('btn-pagar-valor-original').addEventListener('click', () => {
        pagarLoteComValoresOriginais(checkboxes);
        document.getElementById('modal-pagamento-lote-despesas').style.display = 'none';
    });
    
    document.getElementById('btn-pagar-com-valor-personalizado').addEventListener('click', () => {
        document.getElementById('modal-pagamento-lote-despesas').style.display = 'none';
        configurarModalValoresPersonalizados(checkboxes);
        document.getElementById('modal-valores-personalizados-despesas').style.display = 'block';
    });
}

function configurarModalValoresPersonalizados(checkboxes) {
    const indices = Array.from(checkboxes).map(checkbox => parseInt(checkbox.dataset.index));
    const tbody = document.getElementById('valores-personalizados-body');
    
    tbody.innerHTML = '';
    
    let despesasValidas = 0;
    indices.forEach(index => {
        if (dadosFinanceiros[anoAberto]?.meses[mesAberto]?.despesas?.[index] && 
            !dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index].quitado) {
            
            const despesa = dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index];
            
            const template = document.getElementById('template-linha-valor-personalizado');
            if (template) {
                const clone = template.content.cloneNode(true);
                
                clone.querySelector('.despesa-descricao').textContent = despesa.descricao;
                clone.querySelector('.despesa-categoria').textContent = despesa.categoria;
                
                const badgeContainer = clone.querySelector('.despesa-forma-pagamento');
                if (despesa.formaPagamento) {
                    const badge = document.createElement('span');
                    badge.className = `badge-pagamento badge-${despesa.formaPagamento}`;
                    badge.textContent = despesa.formaPagamento.toUpperCase();
                    badgeContainer.innerHTML = '';
                    badgeContainer.appendChild(badge);
                } else {
                    badgeContainer.textContent = '-';
                }
                
                clone.querySelector('.despesa-valor-original').textContent = formatarMoeda(despesa.valor);
                
                const input = clone.querySelector('.input-valor-pago');
                input.value = despesa.valor;
                input.dataset.index = index;
                
                tbody.appendChild(clone);
                despesasValidas++;
            }
        }
    });
    
    if (despesasValidas === 0) {
        alert("Não há despesas válidas do mês atual para processar.");
        return;
    }
    
    const btnConfirmar = document.getElementById('btn-confirmar-valores');
    const novoBtnConfirmar = btnConfirmar.cloneNode(true);
    btnConfirmar.parentNode.replaceChild(novoBtnConfirmar, btnConfirmar);
    
    document.getElementById('btn-confirmar-valores').addEventListener('click', () => {
        const inputs = document.querySelectorAll('.input-valor-pago');
        let despesasPagas = 0;
        
        inputs.forEach(input => {
            const index = parseInt(input.dataset.index);
            const valorPago = parseFloat(input.value);
            
            if (!isNaN(valorPago) && valorPago >= 0) {
                if (processarPagamento(index, mesAberto, anoAberto, valorPago, false)) {
                    despesasPagas++;
                }
            }
        });
        
        document.getElementById('modal-valores-personalizados-despesas').style.display = 'none';
        renderizarDetalhesDoMes(mesAberto, anoAberto);
        
        if (despesasPagas > 0) {
            alert(`${despesasPagas} despesa(s) paga(s) com sucesso!`);
        } else {
            alert("Nenhuma despesa foi processada com sucesso.");
        }
    });
}

function pagarLoteComValoresOriginais(checkboxes) {
    const indices = Array.from(checkboxes).map(checkbox => parseInt(checkbox.dataset.index));
    
    let despesasPagas = 0;
    indices.forEach(index => {
        if (dadosFinanceiros[anoAberto] && 
            dadosFinanceiros[anoAberto].meses[mesAberto] && 
            dadosFinanceiros[anoAberto].meses[mesAberto].despesas && 
            dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index]) {
            
            if (processarPagamento(index, mesAberto, anoAberto, null, false)) {
                despesasPagas++;
            }
        }
    });
    
    renderizarDetalhesDoMes(mesAberto, anoAberto);
    
    if (despesasPagas > 0) {
        alert(`${despesasPagas} despesa(s) paga(s) com sucesso!`);
    } else {
        alert("Nenhuma despesa foi processada com sucesso.");
    }
}

// ================================================================
// FILTROS
// ================================================================

function criarFiltrosCategorias(mes, ano) {
    const categorias = obterCategoriasDoMes(mes, ano);
    const selectCategoria = document.getElementById('filtro-categoria');
    
    if (selectCategoria) {
        limparSelect(selectCategoria);
        adicionarOpcaoSelect(selectCategoria, 'todas', 'Todas as Categorias');
        
        categorias.forEach(categoria => {
            adicionarOpcaoSelect(selectCategoria, categoria, categoria);
        });
        
        selectCategoria.addEventListener('change', function() {
            filtrarDespesasPorCategoria(this.value);
        });
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
        
        selectFormaPagamento.addEventListener('change', function() {
            filtrarDespesasPorFormaPagamento(this.value);
        });
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
            { value: 'quitada', text: 'Pagas' }
        ];
        
        opcoes.forEach(opcao => {
            adicionarOpcaoSelect(selectStatus, opcao.value, opcao.text);
        });
        
        selectStatus.addEventListener('change', function() {
            filtrarDespesasPorStatus(this.value);
        });
    }
}

function obterCategoriasDoMes(mes, ano) {
    if (!dadosFinanceiros[ano] || !dadosFinanceiros[ano].meses[mes]) {
        return [];
    }
    
    const categorias = new Set();
    dadosFinanceiros[ano].meses[mes].despesas.forEach(despesa => {
        let categoria = despesa.categoria || 'Sem categoria';
        categorias.add(categoria);
    });
    
    return Array.from(categorias).sort();
}

function filtrarDespesasPorCategoria(categoria) {
    const linhas = document.querySelectorAll('#lista-despesas tr');
    
    linhas.forEach(linha => {
        if (categoria === 'todas') {
            linha.style.display = '';
        } else {
            const mostrar = verificarCategoriaDespesa(linha, categoria);
            linha.style.display = mostrar ? '' : 'none';
        }
    });
    
    atualizarContadoresFiltro();
}

function filtrarDespesasPorFormaPagamento(formaPagamento) {
    const linhas = document.querySelectorAll('#lista-despesas tr');
    
    linhas.forEach(linha => {
        if (formaPagamento === 'todas') {
            linha.style.display = '';
        } else {
            const mostrar = verificarFormaPagamentoDespesa(linha, formaPagamento);
            linha.style.display = mostrar ? '' : 'none';
        }
    });
    
    atualizarContadoresFiltro();
}

function filtrarDespesasPorStatus(status) {
    const linhas = document.querySelectorAll('#lista-despesas tr');
    
    linhas.forEach(linha => {
        if (status === 'todas') {
            linha.style.display = '';
        } else {
            const mostrar = verificarStatusDespesa(linha, status);
            linha.style.display = mostrar ? '' : 'none';
        }
    });
    
    atualizarContadoresFiltro();
}

function verificarCategoriaDespesa(linha, categoria) {
    const index = obterIndexDespesa(linha);
    
    if (index !== null && dadosFinanceiros[anoAberto]?.meses[mesAberto]?.despesas?.[index]) {
        const despesa = dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index];
        const categoriaLimpa = obterCategoriaLimpa(despesa);
        return categoriaLimpa === categoria;
    }
    
    return false;
}

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

function verificarStatusDespesa(linha, status) {
    const index = obterIndexDespesa(linha);
    
    if (index !== null && dadosFinanceiros[anoAberto]?.meses[mesAberto]?.despesas?.[index]) {
        const despesa = dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index];
        
        let statusDespesa = '';
        if (despesa.quitado || despesa.status === 'quitada') {
            statusDespesa = 'quitada';
        } else if (despesa.status === 'atrasada') {
            statusDespesa = 'atrasada';
        } else {
            statusDespesa = 'em_dia';
        }
        
        if (status === 'pendentes') {
            return statusDespesa === 'em_dia' || statusDespesa === 'atrasada';
        } else {
            return statusDespesa === status;
        }
    }
    
    return false;
}

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

function limparFiltros() {
    const selectCategoria = document.getElementById('filtro-categoria');
    const selectStatus = document.getElementById('filtro-status');
    const selectFormaPagamento = document.getElementById('filtro-forma-pagamento-tabela');
    
    if (selectCategoria) selectCategoria.value = 'todas';
    if (selectStatus) selectStatus.value = 'todas';
    if (selectFormaPagamento) selectFormaPagamento.value = 'todas';
    
    const linhas = document.querySelectorAll('#lista-despesas tr');
    linhas.forEach(linha => {
        linha.style.display = '';
    });
    
    atualizarContadoresFiltro();
}

function atualizarContadoresFiltro() {
    const linhasVisiveis = document.querySelectorAll('#lista-despesas tr:not([style*="display: none"])');
    const totalLinhas = document.querySelectorAll('#lista-despesas tr').length;
    
    let valorTotalVisivel = 0;
    
    linhasVisiveis.forEach(linha => {
        const valorDespesa = calcularValorDespesaLinha(linha);
        valorTotalVisivel += valorDespesa;
    });
    
    const contadorFiltro = document.getElementById('contador-filtro');
    if (contadorFiltro) {
        contadorFiltro.textContent = `${linhasVisiveis.length} de ${totalLinhas} despesas (${formatarMoeda(valorTotalVisivel)})`;
    }
}

function calcularValorDespesaLinha(linha) {
    const index = obterIndexDespesa(linha);
    
    if (index !== null && dadosFinanceiros[anoAberto]?.meses[mesAberto]?.despesas?.[index]) {
        const despesa = dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index];
        return obterValorRealDespesa(despesa);
    }
    
    return 0;
}

// ================================================================
// FUNÇÕES UTILITÁRIAS
// ================================================================

function atualizarStatusDespesas(despesas) {
    if (!Array.isArray(despesas)) return;
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    despesas.forEach(despesa => {
        if (despesa.quitado) {
            despesa.status = 'quitada';
        } else {
            const dataVencimento = despesa.dataVencimento ? new Date(despesa.dataVencimento) : 
                                  (despesa.data ? new Date(despesa.data) : new Date());
            dataVencimento.setHours(0, 0, 0, 0);
            
            if (dataVencimento < hoje) {
                despesa.status = 'atrasada';
            } else {
                despesa.status = 'em_dia';
            }
        }
    });
}

function calcularTotalDespesas(despesas) {
    return despesas.reduce((total, despesa) => {
        if (despesa.valorPago !== null && despesa.valorPago !== undefined && despesa.valorPago > 0) {
            return total + parseFloat(despesa.valorPago);
        }
        return total + parseFloat(despesa.valor || 0);
    }, 0);
}

function calcularTotalJuros(despesas) {
    return despesas.reduce((total, despesa) => {
        if (despesa.parcelado && despesa.metadados) {
            if (despesa.metadados.totalJuros) {
                if (despesa.totalParcelas > 1) {
                    return total + (despesa.metadados.totalJuros / despesa.totalParcelas);
                }
                return total + despesa.metadados.totalJuros;
            }
        }
        else if (despesa.valorPago && despesa.valorPago > despesa.valor) {
            return total + (despesa.valorPago - despesa.valor);
        }
        return total;
    }, 0);
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
    const valorParcela = arredondarParaDuasCasas(valorPagoTotal / numParcelas);
    
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
        
        if (totalJuros > 0) {
            if (elementoJurosTotal) elementoJurosTotal.style.color = '#ef4444';
            if (elementoJurosParcela) elementoJurosParcela.style.color = '#ef4444';
        } else {
            if (elementoJurosTotal) elementoJurosTotal.style.color = '#16a34a';
            if (elementoJurosParcela) elementoJurosParcela.style.color = '#16a34a';
        }
    }
}

function atualizarBotaoLote() {
    const checkboxes = document.querySelectorAll('.despesa-checkbox:checked');
    const btnPagarEmLote = document.getElementById('btn-pagar-em-lote');
    if (btnPagarEmLote) {
        btnPagarEmLote.disabled = checkboxes.length === 0;
    }
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
    if (despesa.status === 'em_dia') {
        return 'Em Dia';
    } else if (despesa.status === 'atrasada') {
        return 'Atrasada';
    } else if (despesa.quitado || despesa.status === 'quitada') {
        return 'Paga';
    } else {
        return 'Pendente';
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

function obterValorRealDespesa(despesa) {
    if (despesa.valorPago !== null && despesa.valorPago !== undefined && despesa.valorPago > 0) {
        return parseFloat(despesa.valorPago);
    }
    return parseFloat(despesa.valor) || 0;
}

function arredondarParaDuasCasas(valor) {
    return Math.round((parseFloat(valor) + Number.EPSILON) * 100) / 100;
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

// ================================================================
// CONFIGURAÇÃO DE EVENTOS DO FORMULÁRIO
// ================================================================

function configurarEventosFormularioDespesa() {
    const despesaParcelado = document.getElementById('despesa-parcelado');
    if (despesaParcelado) {
        despesaParcelado.addEventListener('change', function() {
            const opcoes = document.getElementById('opcoes-parcelamento');
            const info = document.getElementById('info-parcelamento');
            const replicarCheckbox = document.getElementById('replicar-sem-valores');
            const opcoesReplicacao = document.getElementById('opcoes-replicacao-sem-valor');
            
            if (this.checked) {
                opcoes?.classList.remove('hidden');
                info?.classList.remove('hidden');
                
                const replicarSemValores = document.getElementById('replicar-sem-valores');
                if (replicarSemValores) {
                    replicarSemValores.checked = false;
                    replicarSemValores.disabled = true;
                    opcoesReplicacao?.classList.add('hidden');
                }
            } else {
                opcoes?.classList.add('hidden');
                info?.classList.add('hidden');
                
                const replicarSemValores = document.getElementById('replicar-sem-valores');
                if (replicarSemValores) {
                    replicarSemValores.disabled = false;
                }
            }
            
            calcularInfoParcelamento();
        });
    }

    const replicarSemValores = document.getElementById('replicar-sem-valores');
    if (replicarSemValores) {
        replicarSemValores.addEventListener('change', function() {
            const opcoes = document.getElementById('opcoes-replicacao-sem-valor');
            const parceladoCheckbox = document.getElementById('despesa-parcelado');
            const opcoesParcelamento = document.getElementById('opcoes-parcelamento');
            const infoParcelamento = document.getElementById('info-parcelamento');
            
            if (this.checked) {
                opcoes?.classList.remove('hidden');
                
                if (parceladoCheckbox) {
                    parceladoCheckbox.checked = false;
                    parceladoCheckbox.disabled = true;
                    opcoesParcelamento?.classList.add('hidden');
                    infoParcelamento?.classList.add('hidden');
                }
            } else {
                opcoes?.classList.add('hidden');
                
                if (parceladoCheckbox) {
                    parceladoCheckbox.disabled = false;
                }
            }
        });
    }
    
    const formasPagamento = document.querySelectorAll('input[name="forma-pagamento"]');
    formasPagamento.forEach(radio => {
        radio.addEventListener('change', function() {
            if (typeof validarFormaPagamento === 'function') {
                validarFormaPagamento();
            }
        });
    });

    const selectCategoria = document.getElementById('despesa-categoria');
    if (selectCategoria) {
        selectCategoria.addEventListener('change', function() {
            if (typeof validarCategoria === 'function') {
                validarCategoria();
            }
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

// ================================================================
// FUNÇÕES GLOBAIS PARA O HTML
// ================================================================

// Toggle manual para checkboxes de parcelamento e replicação
window.toggleCheckboxParcelado = function() {
    const checkbox = document.getElementById('despesa-parcelado');
    if (checkbox && !checkbox.disabled) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
    }
};

window.toggleCheckboxReplicacao = function() {
    const checkbox = document.getElementById('replicar-sem-valores');
    if (checkbox && !checkbox.disabled) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
    }
};

window.toggleParcelamentoDespesa = function(checkbox) {
    const opcoes = document.getElementById('opcoes-parcelamento');
    const info = document.getElementById('info-parcelamento');
    const replicarCheckbox = document.getElementById('replicar-sem-valores');
    const opcoesReplicacao = document.getElementById('opcoes-replicacao-sem-valor');
    
    if (checkbox.checked) {
        opcoes?.classList.remove('hidden');
        info?.classList.remove('hidden');
        
        if (replicarCheckbox) {
            replicarCheckbox.checked = false;
            replicarCheckbox.disabled = true;
            opcoesReplicacao?.classList.add('hidden');
        }
    } else {
        opcoes?.classList.add('hidden');
        info?.classList.add('hidden');
        
        if (replicarCheckbox) {
            replicarCheckbox.disabled = false;
        }
    }
    
    calcularInfoParcelamento();
};

window.toggleReplicacaoSemValor = function(checkbox) {
    const opcoes = document.getElementById('opcoes-replicacao-sem-valor');
    const parceladoCheckbox = document.getElementById('despesa-parcelado');
    const opcoesParcelamento = document.getElementById('opcoes-parcelamento');
    const infoParcelamento = document.getElementById('info-parcelamento');
    
    if (checkbox.checked) {
        opcoes?.classList.remove('hidden');
        
        if (parceladoCheckbox) {
            parceladoCheckbox.checked = false;
            parceladoCheckbox.disabled = true;
            opcoesParcelamento?.classList.add('hidden');
            infoParcelamento?.classList.add('hidden');
        }
    } else {
        opcoes?.classList.add('hidden');
        
        if (parceladoCheckbox) {
            parceladoCheckbox.disabled = false;
        }
    }
};

window.handleSalvarDespesa = function(event) {
    event.preventDefault();
    salvarDespesa(event);
    return false;
};

window.fecharModalExclusao = function() {
    document.getElementById('modal-confirmacao-exclusao-despesa').style.display = 'none';
};

// ================================================================
// INICIALIZAÇÃO
// ================================================================

document.addEventListener('DOMContentLoaded', function() {
    const formNovaDespesa = document.getElementById('form-nova-despesa');
    if (formNovaDespesa) {
        const novoForm = formNovaDespesa.cloneNode(true);
        formNovaDespesa.parentNode.replaceChild(novoForm, formNovaDespesa);
        
        document.getElementById('form-nova-despesa').addEventListener('submit', function(e) {
            e.preventDefault();
            e.stopPropagation();
            salvarDespesa(e);
            return false;
        });
    }
    
    configurarEventosFormularioDespesa();
    
    // Fechar modais ao clicar no X
    document.querySelectorAll('.modal .close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });
});

// ================================================================
// EXPORTAR FUNÇÕES GLOBAIS
// ================================================================

window.abrirModalNovaDespesa = abrirModalNovaDespesa;
window.editarDespesa = editarDespesa;
window.excluirDespesa = excluirDespesa;
window.salvarDespesa = salvarDespesa;
window.renderizarDespesas = renderizarDespesas;
window.criarFiltrosCategorias = criarFiltrosCategorias;
window.criarFiltrosFormaPagamento = criarFiltrosFormaPagamento;
window.criarFiltrosStatus = criarFiltrosStatus;
window.limparFiltros = limparFiltros;
window.atualizarContadoresFiltro = atualizarContadoresFiltro;
window.moverParaProximoMes = moverParaProximoMes;
window.atualizarStatusDespesas = atualizarStatusDespesas;
window.abrirModalPagamento = abrirModalPagamento;
window.processarPagamento = processarPagamento;
window.pagarDespesasEmLote = pagarDespesasEmLote;
window.calcularTotalDespesas = calcularTotalDespesas;
window.calcularTotalJuros = calcularTotalJuros;
window.calcularInfoParcelamento = calcularInfoParcelamento;
window.atualizarBotaoLote = atualizarBotaoLote;
window.validarCategoria = validarCategoria;
window.validarFormaPagamento = validarFormaPagamento;
window.configurarEventosDespesas = configurarEventosDespesas;
window.obterCategoriaLimpa = obterCategoriaLimpa;
window.criarBadgeStatus = criarBadgeStatus;
window.obterDatasExibicao = obterDatasExibicao;
window.obterValorRealDespesa = obterValorRealDespesa;