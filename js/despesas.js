// ================================================================
// SISTEMA DE DESPESAS - ETAPA 1: RENDERIZAÇÃO, MODAL E SALVAMENTO
// VERSÃO COMPLETA, FUNCIONAL E ASSÍNCRONA
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
// RENDERIZAÇÃO DE DESPESAS - OTIMIZADA
// ================================================================

function renderizarDespesas(despesas, mes, ano, fechado) {
    const listaDespesas = document.getElementById('lista-despesas');
    if (!listaDespesas) {
        console.warn('⚠️ Lista de despesas não encontrada no DOM');
        return;
    }
    
    console.log(`📊 Renderizando ${Array.isArray(despesas) ? despesas.length : 0} despesas para ${mes}/${ano}`);
    
    listaDespesas.innerHTML = '';
    
    if (Array.isArray(despesas) && despesas.length > 0) {
        atualizarStatusDespesas(despesas);
        const despesasParaExibir = despesas.filter(d => !d.transferidaParaProximoMes);
        
        despesasParaExibir.forEach((despesa, index) => {
            try {
                const tr = criarLinhaDespesa(despesa, index, fechado);
                listaDespesas.appendChild(tr);
            } catch (error) {
                console.error(`❌ Erro ao criar linha da despesa ${index}:`, error);
            }
        });
        
        console.log(`✅ ${despesasParaExibir.length} despesas renderizadas`);
    } else {
        console.log('📝 Nenhuma despesa para renderizar');
    }
    
    if (!fechado) {
        configurarEventosDespesas(listaDespesas, mes, ano);
    }
    
    atualizarBotaoLote();
}

function criarLinhaDespesa(despesa, index, fechado) {
    const tr = document.createElement('tr');
    tr.className = 'despesa-row';
    
    // Aplicar classes de status
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
    
    // Definir atributos de dados
    tr.setAttribute('data-status', despesa.status || 'pendente');
    tr.setAttribute('data-categoria', despesa.categoria || '');
    tr.setAttribute('data-forma-pagamento', despesa.formaPagamento || '');
    tr.setAttribute('data-index', index);
    
    preencherLinhaDespesa(tr, despesa, index, fechado);
    
    return tr;
}

function preencherLinhaDespesa(tr, despesa, index, fechado) {
    tr.innerHTML = '';
    
    // Checkbox para seleção em lote
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
    const formaPagamento = despesa.formaPagamento || 'debito';
    const badge = document.createElement('span');
    badge.className = `badge-pagamento ${formaPagamento}`;
    badge.textContent = formaPagamento.toUpperCase();
    tdPagamento.appendChild(badge);
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
    
    // Botão Editar
    const btnEditar = document.createElement('button');
    btnEditar.className = 'btn btn-editar';
    btnEditar.dataset.index = index;
    btnEditar.title = fechado ? 'Mês fechado' : 'Editar';
    btnEditar.innerHTML = '<i class="fas fa-edit"></i>';
    btnEditar.disabled = fechado;
    divAcoes.appendChild(btnEditar);
    
    // Botão Excluir
    const btnExcluir = document.createElement('button');
    btnExcluir.className = 'btn btn-excluir';
    btnExcluir.dataset.index = index;
    btnExcluir.title = fechado ? 'Mês fechado' : 'Excluir';
    btnExcluir.innerHTML = '<i class="fas fa-trash"></i>';
    btnExcluir.disabled = fechado;
    divAcoes.appendChild(btnExcluir);
    
    // Botões adicionais para despesas não quitadas
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
// CONFIGURAÇÃO DE EVENTOS - OTIMIZADA
// ================================================================

function configurarEventosDespesas(container, mes, ano) {
    if (!container) {
        console.warn('⚠️ Container de despesas não fornecido');
        return;
    }
    
    // Usar delegação de eventos para melhor performance
    container.addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn');
        if (!btn) return;
        
        e.stopPropagation();
        e.preventDefault();
        
        const index = parseInt(btn.dataset.index);
        if (isNaN(index)) {
            console.warn('⚠️ Índice da despesa inválido');
            return;
        }
        
        try {
            if (btn.classList.contains('btn-editar')) {
                await editarDespesa(index, mes, ano);
            } else if (btn.classList.contains('btn-excluir')) {
                await excluirDespesa(index, mes, ano);
            } else if (btn.classList.contains('btn-pagar')) {
                await abrirModalPagamento(index, mes, ano);
            } else if (btn.classList.contains('btn-mover')) {
                await moverParaProximoMes(index, mes, ano);
            }
        } catch (error) {
            console.error('❌ Erro ao processar ação da despesa:', error);
            alert('Erro ao processar ação: ' + error.message);
        }
    });
}

// ================================================================
// MODAL NOVA DESPESA - CORRIGIDO
// ================================================================

function abrirModalNovaDespesa(index) {
    try {
        console.log(`📝 Abrindo modal de despesa, índice: ${index}`);
        
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
        
        // Definir mês e ano
        document.getElementById('despesa-mes').value = mesAberto;
        document.getElementById('despesa-ano').value = anoAberto;
        
        // Definir datas padrão
        const dataAtual = new Date(anoAberto, mesAberto, new Date().getDate());
        const dataFormatada = dataAtual.toISOString().split('T')[0];
        document.getElementById('despesa-data-compra').value = dataFormatada;
        document.getElementById('despesa-data-vencimento').value = dataFormatada;
        
        // Preencher para edição ou limpar para nova despesa
        if (index !== undefined && dadosFinanceiros[anoAberto]?.meses[mesAberto]?.despesas?.[index]) {
            preencherFormularioEdicao(index);
        } else {
            document.getElementById('despesa-id').value = '';
        }
        
        modal.classList.add('active');
        modal.style.display = 'block';
        
        // Focar no primeiro campo após um pequeno delay
        setTimeout(() => {
            const descricaoInput = document.getElementById('despesa-descricao');
            if (descricaoInput) descricaoInput.focus();
        }, 300);
        
        console.log('✅ Modal de despesa aberto');
        
    } catch (error) {
        console.error("❌ Erro ao abrir modal de nova despesa:", error);
        alert("Não foi possível abrir o formulário: " + error.message);
    }
}

function resetarEstadoFormularioDespesa() {
    // Ocultar seções condicionais
    const elementos = [
        'opcoes-parcelamento',
        'info-parcelamento',
        'opcoes-replicacao-sem-valor'
    ];
    
    elementos.forEach(id => {
        const elemento = document.getElementById(id);
        if (elemento) elemento.classList.add('hidden');
    });
    
    // Resetar checkboxes
    const checkboxes = [
        'replicar-sem-valores',
        'despesa-parcelado'
    ];
    
    checkboxes.forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.checked = false;
            checkbox.disabled = false;
        }
    });
    
    // Desmarcar radio buttons
    const formasPagamento = document.querySelectorAll('input[name="forma-pagamento"]');
    formasPagamento.forEach(radio => radio.checked = false);
    
    // Remover classes de erro
    document.querySelectorAll('.form-group.error').forEach(group => {
        group.classList.remove('error');
    });
    
    // Remover mensagens de erro
    const errorElements = document.querySelectorAll('.form-error-categoria, .form-error-pagamento');
    errorElements.forEach(el => el.remove());
}

// ================================================================
// SALVAR DESPESA - TOTALMENTE REESCRITO E ASSÍNCRONO
// ================================================================

async function salvarDespesa(e) {
    if (e && e.preventDefault) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    if (processandoDespesa) {
        console.log('⏳ Despesa já sendo processada...');
        return false;
    }
    
    processandoDespesa = true;
    
    try {
        console.log('💸 Iniciando salvamento de despesa...');
        
        // Validar formulário
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
            console.log('❌ Formulário inválido');
            return false;
        }
        
        // Coletar dados do formulário
        const formData = coletarDadosFormularioDespesa();
        console.log('📋 Dados coletados:', formData);
        
        // AGUARDAR SISTEMA ESTAR PRONTO
        if (window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function') {
            console.log('⏳ Aguardando usuarioDados estar pronto...');
            await window.usuarioDados.aguardarPronto();
        }
        
        let sucesso = false;
        
        // Tentar salvar via sistema integrado
        if (window.usuarioDados && typeof window.usuarioDados.salvarDespesa === 'function') {
            try {
                console.log('🌐 Salvando despesa via sistema integrado...');
                sucesso = await window.usuarioDados.salvarDespesa(
                    formData.mes, 
                    formData.ano, 
                    formData, 
                    formData.id !== '' ? formData.id : null
                );
                
                if (sucesso) {
                    console.log('✅ Despesa salva via sistema integrado');
                }
            } catch (error) {
                console.error('❌ Erro no sistema integrado:', error);
                sucesso = false;
            }
        }
        
        // Fallback para salvamento direto
        if (!sucesso) {
            console.log('💾 Usando fallback direto...');
            sucesso = await salvarDespesaFallback(formData);
        }
        
        if (sucesso) {
            // Fechar modal
            document.getElementById('modal-nova-despesa').style.display = 'none';
            
            // Atualizar interface
            if (typeof carregarDadosDashboard === 'function') {
                await carregarDadosDashboard(anoAtual);
            }
            
            if (typeof renderizarDetalhesDoMes === 'function') {
                renderizarDetalhesDoMes(formData.mes, formData.ano);
            }
            
            console.log('✅ Despesa salva e interface atualizada');
        } else {
            throw new Error('Falha ao salvar despesa');
        }
        
        return false;
        
    } catch (error) {
        console.error("❌ Erro ao salvar despesa:", error);
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
    
    return {
        id: document.getElementById('despesa-id').value,
        mes: parseInt(document.getElementById('despesa-mes').value),
        ano: parseInt(document.getElementById('despesa-ano').value),
        descricao: document.getElementById('despesa-descricao').value.trim(),
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

// Função de fallback para salvamento direto
async function salvarDespesaFallback(formData) {
    try {
        garantirEstruturaDados(formData.ano, formData.mes);
        
        if (formData.id !== '' && formData.id !== null) {
            // Atualizar despesa existente
            await atualizarDespesaExistente(formData);
        } else {
            // Adicionar nova despesa
            await adicionarNovaDespesa(formData);
        }
        
        const sucessoSalvamento = await salvarDados();
        return sucessoSalvamento;
        
    } catch (error) {
        console.error('❌ Erro no fallback de salvamento:', error);
        return false;
    }
}

async function adicionarNovaDespesa(formData) {
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
    
    // Criar parcelas futuras se necessário
    if (formData.parcelado && formData.totalParcelas > 1) {
        await criarParcelasFuturas(formData, valorPorParcela, idGrupoParcelamento, valorOriginal, valorTotalComJuros, totalJuros);
    }
    
    // Replicar sem valor se necessário
    if (formData.replicarSemValor && formData.totalMesesReplicacao > 0) {
        await replicarDespesasSemValores(formData, idGrupoParcelamento);
    }
}

async function criarParcelasFuturas(formData, valorPorParcela, idGrupoParcelamento, valorOriginal, valorTotalComJuros, totalJuros) {
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

async function replicarDespesasSemValores(formData, idGrupoParcelamento) {
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

async function atualizarDespesaExistente(formData) {
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

function preencherFormularioEdicao(index) {
    if (!dadosFinanceiros[anoAberto]?.meses[mesAberto]?.despesas[index]) {
        throw new Error(ERROS.DESPESA_NAO_ENCONTRADA);
    }
    
    const despesa = dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index];
    
    document.getElementById('despesa-id').value = index;
    document.getElementById('despesa-descricao').value = despesa.descricao || '';
    document.getElementById('despesa-categoria').value = despesa.categoria || '';
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

async function editarDespesa(index, mes, ano) {
    console.log(`✏️ Editando despesa ${index} do mês ${mes}/${ano}`);
    abrirModalNovaDespesa(index);
}

// ================================================================
// FUNÇÕES AUXILIARES E UTILITÁRIAS
// ================================================================

function criarObjetoDespesa(dados) {
    return {
        id: dados.id || gerarId(),
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
        replicadaSemValor: dados.replicadaSemValor || false,
        dataCriacao: dados.dataCriacao || new Date().toISOString()
    };
}

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
    if (!Array.isArray(despesas)) return 0;
    
    return despesas.reduce((total, despesa) => {
        if (despesa.valorPago !== null && despesa.valorPago !== undefined && despesa.valorPago > 0) {
            return total + parseFloat(despesa.valorPago);
        }
        return total + parseFloat(despesa.valor || 0);
    }, 0);
}

function calcularTotalJuros(despesas) {
    if (!Array.isArray(despesas)) return 0;
    
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
        
        // Colorir juros
        const corJuros = totalJuros > 0 ? '#ef4444' : '#16a34a';
        if (elementoJurosTotal) elementoJurosTotal.style.color = corJuros;
        if (elementoJurosParcela) elementoJurosParcela.style.color = corJuros;
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

// ================================================================
// INICIALIZAÇÃO DA ETAPA 1
// ================================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Inicializando sistema de despesas - ETAPA 1...');
    
    // Aguardar outros sistemas estarem prontos
    setTimeout(() => {
        inicializarFormularioDespesas();
        configurarEventosFormularioDespesa();
        console.log('✅ Sistema de despesas ETAPA 1 inicializado');
    }, 600);
});

function inicializarFormularioDespesas() {
    const formNovaDespesa = document.getElementById('form-nova-despesa');
    if (formNovaDespesa) {
        // Remover handlers antigos
        formNovaDespesa.removeAttribute('onsubmit');
        
        // Clonar para limpar event listeners
        const novoForm = formNovaDespesa.cloneNode(true);
        formNovaDespesa.parentNode.replaceChild(novoForm, formNovaDespesa);
        
        // Adicionar event listener assíncrono
        document.getElementById('form-nova-despesa').addEventListener('submit', async function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            try {
                await salvarDespesa(e);
            } catch (error) {
                console.error('❌ Erro no submit do formulário de despesas:', error);
                alert('Erro ao salvar despesa: ' + error.message);
            }
            
            return false;
        });
    }
    
    // Fechar modais ao clicar no X
    document.querySelectorAll('.modal .close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });
}

// ================================================================
// EXPORTAR FUNÇÕES GLOBAIS DA ETAPA 1
// ================================================================

window.abrirModalNovaDespesa = abrirModalNovaDespesa;
window.editarDespesa = editarDespesa;
window.salvarDespesa = salvarDespesa;
window.renderizarDespesas = renderizarDespesas;
window.atualizarStatusDespesas = atualizarStatusDespesas;
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

console.log('📦 Sistema de despesas ETAPA 1 carregado - aguardando inicialização completa...');



// ================================================================
// SISTEMA DE DESPESAS - ETAPA 2: EXCLUSÃO, PAGAMENTOS E FILTROS
// VERSÃO COMPLETA, FUNCIONAL E ASSÍNCRONA
// ================================================================

// ================================================================
// EXCLUSÃO DE DESPESAS - TOTALMENTE REESCRITO E CORRIGIDO
// ================================================================

async function excluirDespesa(index, mes, ano) {
    try {
        console.log(`🗑️ Iniciando exclusão da despesa ${index} do mês ${mes}/${ano}`);
        
        if (!dadosFinanceiros[ano] || 
            !dadosFinanceiros[ano].meses[mes] || 
            !dadosFinanceiros[ano].meses[mes].despesas[index]) {
            throw new Error(ERROS.DESPESA_NAO_ENCONTRADA);
        }
        
        const despesa = dadosFinanceiros[ano].meses[mes].despesas[index];
        
        // Guardar dados globalmente para os botões do modal
        window.despesaParaExcluir = {
            index: index,
            mes: mes,
            ano: ano,
            despesa: despesa
        };
        
        await configurarModalExclusao(despesa, index, mes, ano);
        
        const modal = document.getElementById('modal-confirmacao-exclusao-despesa');
        if (modal) {
            modal.style.display = 'block';
            console.log('✅ Modal de exclusão aberto');
        }
        
    } catch (error) {
        console.error("❌ Erro ao excluir despesa:", error);
        alert("Não foi possível excluir a despesa: " + error.message);
    }
}

async function configurarModalExclusao(despesa, index, mes, ano) {
    const titulo = document.getElementById('exclusao-titulo');
    const mensagem = document.getElementById('exclusao-mensagem');
    
    if (despesa.parcelado && despesa.parcela) {
        // Despesa parcelada
        if (titulo) titulo.textContent = 'Excluir item parcelado';
        if (mensagem) mensagem.textContent = 'Este item está parcelado. Como deseja prosseguir?';
        
        // Mostrar opções de parcelamento
        document.querySelectorAll('.opcao-exclusao-basica').forEach(btn => btn.style.display = 'none');
        document.querySelectorAll('.opcao-exclusao-parcelada').forEach(btn => btn.style.display = 'block');
    } else {
        // Despesa simples
        if (titulo) titulo.textContent = 'Excluir despesa';
        if (mensagem) mensagem.textContent = 'Tem certeza que deseja excluir esta despesa?';
        
        // Mostrar opções básicas
        document.querySelectorAll('.opcao-exclusao-basica').forEach(btn => btn.style.display = 'block');
        document.querySelectorAll('.opcao-exclusao-parcelada').forEach(btn => btn.style.display = 'none');
    }
    
    await configurarBotoesExclusao(despesa, index, mes, ano);
}

async function configurarBotoesExclusao(despesa, index, mes, ano) {
    // Limpar todos os event listeners existentes clonando os botões
    const botoesParaLimpar = [
        'btn-excluir-atual',
        'btn-excluir-todos-meses',
        'btn-excluir-parcela-atual',
        'btn-excluir-todas-parcelas'
    ];
    
    botoesParaLimpar.forEach(id => {
        const botao = document.getElementById(id);
        if (botao) {
            const novoBotao = botao.cloneNode(true);
            novoBotao.id = id;
            botao.parentNode.replaceChild(novoBotao, botao);
        }
    });
    
    // Aguardar um tick para garantir que os botões foram substituídos
    await new Promise(resolve => setTimeout(resolve, 10));
    
    if (!despesa.parcelado) {
        // Configurar botões para despesas simples
        configurarBotoesExclusaoSimples(despesa, index, mes, ano);
    } else {
        // Configurar botões para despesas parceladas
        configurarBotoesExclusaoParcelada(despesa, index, mes, ano);
    }
}

function configurarBotoesExclusaoSimples(despesa, index, mes, ano) {
    const btnAtual = document.getElementById('btn-excluir-atual');
    const btnTodos = document.getElementById('btn-excluir-todos-meses');
    
    if (btnAtual) {
        btnAtual.onclick = async function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🗑️ Excluindo apenas do mês atual...', index, mes, ano);
            
            try {
                await processarExclusao('atual', index, mes, ano, despesa.descricao, despesa.categoria, despesa.idGrupoParcelamento);
            } catch (error) {
                console.error('❌ Erro na exclusão atual:', error);
                alert('Erro ao excluir: ' + error.message);
            }
        };
    }
    
    if (btnTodos) {
        btnTodos.onclick = async function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🗑️ Excluindo de todos os meses...', despesa.descricao, despesa.categoria);
            
            try {
                await processarExclusao('todas', index, mes, ano, despesa.descricao, despesa.categoria, despesa.idGrupoParcelamento);
            } catch (error) {
                console.error('❌ Erro na exclusão total:', error);
                alert('Erro ao excluir: ' + error.message);
            }
        };
    }
}

function configurarBotoesExclusaoParcelada(despesa, index, mes, ano) {
    const btnParcela = document.getElementById('btn-excluir-parcela-atual');
    const btnTodas = document.getElementById('btn-excluir-todas-parcelas');
    
    if (btnParcela) {
        btnParcela.onclick = async function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🗑️ Excluindo apenas esta parcela...', index, mes, ano);
            
            try {
                await processarExclusao('atual', index, mes, ano, despesa.descricao, despesa.categoria, despesa.idGrupoParcelamento);
            } catch (error) {
                console.error('❌ Erro na exclusão da parcela:', error);
                alert('Erro ao excluir parcela: ' + error.message);
            }
        };
    }
    
    if (btnTodas) {
        btnTodas.onclick = async function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🗑️ Excluindo todas as parcelas...', despesa.idGrupoParcelamento);
            
            try {
                await processarExclusao('todas', index, mes, ano, despesa.descricao, despesa.categoria, despesa.idGrupoParcelamento);
            } catch (error) {
                console.error('❌ Erro na exclusão de todas as parcelas:', error);
                alert('Erro ao excluir todas as parcelas: ' + error.message);
            }
        };
    }
}

async function processarExclusao(opcao, index, mes, ano, descricaoDespesa, categoriaDespesa, idGrupoParcelamento) {
    console.log('🔄 Processando exclusão:', opcao, index, mes, ano);
    
    try {
        // AGUARDAR SISTEMA ESTAR PRONTO
        if (window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function') {
            console.log('⏳ Aguardando usuarioDados estar pronto...');
            await window.usuarioDados.aguardarPronto();
        }
        
        let sucesso = false;
        
        // Tentar excluir via sistema integrado
        if (window.usuarioDados && typeof window.usuarioDados.excluirDespesa === 'function') {
            try {
                console.log('🌐 Excluindo despesa via sistema integrado...');
                const dadosExclusao = { descricaoDespesa, categoriaDespesa, idGrupoParcelamento };
                sucesso = await window.usuarioDados.excluirDespesa(mes, ano, index, opcao, dadosExclusao);
                
                if (sucesso) {
                    console.log('✅ Despesa excluída via sistema integrado');
                }
            } catch (error) {
                console.error('❌ Erro no sistema integrado:', error);
                sucesso = false;
            }
        }
        
        // Fallback para exclusão direta
        if (!sucesso) {
            console.log('💾 Usando fallback direto para exclusão...');
            sucesso = await excluirDespesaFallback(opcao, index, mes, ano, descricaoDespesa, categoriaDespesa, idGrupoParcelamento);
        }
        
        if (sucesso) {
            // Atualizar interface
            if (typeof carregarDadosDashboard === 'function') {
                await carregarDadosDashboard(anoAtual);
            }
            
            if (typeof renderizarDetalhesDoMes === 'function') {
                renderizarDetalhesDoMes(mesAberto, anoAberto);
            }
            
            console.log('✅ Despesa excluída e interface atualizada');
        } else {
            throw new Error('Falha ao excluir despesa');
        }
        
        // Fechar modal
        const modal = document.getElementById('modal-confirmacao-exclusao-despesa');
        if (modal) modal.style.display = 'none';
        
    } catch (error) {
        console.error('❌ Erro ao processar exclusão:', error);
        alert('Erro ao processar exclusão: ' + error.message);
    }
}

async function excluirDespesaFallback(opcao, index, mes, ano, descricaoDespesa, categoriaDespesa, idGrupoParcelamento) {
    try {
        if (opcao === 'atual') {
            // Excluir apenas a despesa atual
            if (dadosFinanceiros[ano]?.meses[mes]?.despesas[index]) {
                dadosFinanceiros[ano].meses[mes].despesas.splice(index, 1);
            }
        } 
        else if (opcao === 'todas') {
            if (idGrupoParcelamento) {
                // Excluir todas as parcelas do grupo
                await excluirTodasParcelas(ano, descricaoDespesa, categoriaDespesa, idGrupoParcelamento);
            } else {
                // Excluir despesas simples em todos os meses
                await excluirDespesaEmTodosMeses(ano, descricaoDespesa, categoriaDespesa);
            }
        }
        
        const sucessoSalvamento = await salvarDados();
        return sucessoSalvamento;
        
    } catch (error) {
        console.error('❌ Erro no fallback de exclusão:', error);
        return false;
    }
}

async function excluirTodasParcelas(ano, descricao, categoria, idGrupo) {
    if (!idGrupo) {
        console.warn('⚠️ ID do grupo não fornecido para exclusão de parcelas');
        return;
    }
    
    console.log(`🗑️ Excluindo todas as parcelas do grupo: ${idGrupo}`);
    
    // Excluir em todos os anos possíveis (atual + 3 anos futuros)
    for (let anoAtual = ano; anoAtual <= ano + 3; anoAtual++) {
        if (!dadosFinanceiros[anoAtual]) continue;
        
        for (let m = 0; m < 12; m++) {
            if (!dadosFinanceiros[anoAtual].meses[m] || !dadosFinanceiros[anoAtual].meses[m].despesas) continue;
            
            const despesas = dadosFinanceiros[anoAtual].meses[m].despesas;
            
            for (let i = despesas.length - 1; i >= 0; i--) {
                const d = despesas[i];
                if (d.idGrupoParcelamento === idGrupo && d.descricao === descricao && d.categoria === categoria) {
                    console.log(`🗑️ Removendo parcela: ${d.descricao} - ${d.parcela}`);
                    despesas.splice(i, 1);
                }
            }
        }
    }
}

async function excluirDespesaEmTodosMeses(ano, descricao, categoria) {
    if (!dadosFinanceiros[ano]) return;
    
    console.log(`🗑️ Excluindo em todos os meses: ${descricao} - ${categoria}`);
    
    for (let m = 0; m < 12; m++) {
        if (!dadosFinanceiros[ano].meses[m] || !dadosFinanceiros[ano].meses[m].despesas) continue;
        
        const despesas = dadosFinanceiros[ano].meses[m].despesas;
        
        for (let i = despesas.length - 1; i >= 0; i--) {
            const d = despesas[i];
            // Exclui apenas despesas não parceladas com mesma descrição e categoria
            if (d.descricao === descricao && d.categoria === categoria && !d.parcelado) {
                console.log(`🗑️ Removendo despesa do mês ${m}: ${d.descricao}`);
                despesas.splice(i, 1);
            }
        }
    }
}

// Funções globais para compatibilidade com HTML
window.excluirDespesaAtual = async function() {
    if (window.despesaParaExcluir) {
        const { index, mes, ano } = window.despesaParaExcluir;
        
        try {
            await processarExclusao('atual', index, mes, ano, '', '', null);
        } catch (error) {
            console.error('❌ Erro na exclusão rápida:', error);
            alert('Erro ao excluir: ' + error.message);
        }
    }
};

window.fecharModalExclusao = function() {
    const modal = document.getElementById('modal-confirmacao-exclusao-despesa');
    if (modal) {
        modal.style.display = 'none';
    }
    window.despesaParaExcluir = null;
};

// ================================================================
// MOVIMENTAÇÃO PARA PRÓXIMO MÊS - CORRIGIDA
// ================================================================

async function moverParaProximoMes(index, mes, ano) {
    try {
        console.log(`➡️ Movendo despesa ${index} para próximo mês`);
        
        if (!dadosFinanceiros[ano] || !dadosFinanceiros[ano].meses[mes] || !dadosFinanceiros[ano].meses[mes].despesas[index]) {
            throw new Error('Despesa não encontrada');
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
        
        await executarMovimentoDespesa(despesa, index, mes, ano, proximoMes, proximoAno, mesAtualNome, proximoMesNome);
        
    } catch (error) {
        console.error("❌ Erro ao mover despesa:", error);
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

async function executarMovimentoDespesa(despesa, index, mes, ano, proximoMes, proximoAno, mesAtualNome, proximoMesNome) {
    garantirEstruturaDados(proximoAno, proximoMes);
    
    const despesaMovida = { ...despesa };
    
    // Adicionar metadados do movimento
    despesaMovida.movidaEm = new Date().toISOString().split('T')[0];
    despesaMovida.mesOriginalMovimento = mes;
    despesaMovida.anoOriginalMovimento = ano;
    despesaMovida.mesDestinoMovimento = proximoMes;
    despesaMovida.anoDestinoMovimento = proximoAno;
    despesaMovida.movidaDeOutroMes = true;
    
    // Atualizar status baseado na data de vencimento
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
    
    // Executar movimento
    dadosFinanceiros[proximoAno].meses[proximoMes].despesas.push(despesaMovida);
    dadosFinanceiros[ano].meses[mes].despesas.splice(index, 1);
    
    await salvarDados();
    
    // Atualizar interface
    renderizarDetalhesDoMes(mes, ano);
    
    if (typeof carregarDadosDashboard === 'function') {
        await carregarDadosDashboard(anoAtual);
    }
    
    alert(`Despesa movida com sucesso para ${proximoMesNome} de ${proximoAno}!`);
}

// ================================================================
// SISTEMA DE PAGAMENTOS - INDIVIDUAL E LOTE
// ================================================================

async function abrirModalPagamento(index, mes, ano) {
    try {
        console.log(`💰 Abrindo modal de pagamento para despesa ${index}`);
        
        if (!dadosFinanceiros[ano] || 
            !dadosFinanceiros[ano].meses[mes] || 
            !dadosFinanceiros[ano].meses[mes].despesas[index]) {
            throw new Error(ERROS.DESPESA_NAO_ENCONTRADA);
        }
        
        const despesa = dadosFinanceiros[ano].meses[mes].despesas[index];
        
        preencherInfoDespesaPagamento(despesa);
        configurarFormPagamento(index, mes, ano);
        
        const modal = document.getElementById('modal-pagamento-individual');
        if (modal) {
            modal.style.display = 'block';
            console.log('✅ Modal de pagamento aberto');
        }
        
    } catch (error) {
        console.error("❌ Erro ao abrir modal de pagamento:", error);
        alert("Não foi possível abrir o modal de pagamento: " + error.message);
    }
}

function preencherInfoDespesaPagamento(despesa) {
    const eParcelado = despesa.parcelado === true && despesa.parcela;
    
    // Preencher informações básicas
    const elementos = {
        'pagamento-descricao': despesa.descricao,
        'pagamento-categoria': despesa.categoria,
        'pagamento-valor-original': formatarMoeda(despesa.valor)
    };
    
    Object.entries(elementos).forEach(([id, valor]) => {
        const elemento = document.getElementById(id);
        if (elemento) elemento.textContent = valor;
    });
    
    // Forma de pagamento
    const formaPagamentoContainer = document.getElementById('pagamento-forma-container');
    const formaPagamentoElemento = document.getElementById('pagamento-forma');
    
    if (despesa.formaPagamento && formaPagamentoElemento) {
        formaPagamentoElemento.textContent = despesa.formaPagamento.toUpperCase();
        if (formaPagamentoContainer) formaPagamentoContainer.style.display = 'block';
    } else {
        if (formaPagamentoContainer) formaPagamentoContainer.style.display = 'none';
    }
    
    // Valores do formulário
    const valorPagoInput = document.getElementById('valor-pago-individual');
    const quitadoCheckbox = document.getElementById('despesa-quitado-individual');
    
    if (valorPagoInput) valorPagoInput.value = despesa.valor;
    if (quitadoCheckbox) quitadoCheckbox.checked = false;
    
    // Informações sobre parcelas futuras
    const infoParcelasFuturas = document.getElementById('info-parcelas-futuras');
    if (infoParcelasFuturas) {
        if (eParcelado) {
            infoParcelasFuturas.classList.remove('hidden');
        } else {
            infoParcelasFuturas.classList.add('hidden');
        }
    }
}

function configurarFormPagamento(index, mes, ano) {
    const form = document.getElementById('form-pagamento-individual');
    if (!form) return;
    
    // Clonar formulário para remover event listeners antigos
    const novoForm = form.cloneNode(true);
    form.parentNode.replaceChild(novoForm, form);
    
    // Adicionar novo event listener
    document.getElementById('form-pagamento-individual').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        try {
            const valorPago = parseFloat(document.getElementById('valor-pago-individual').value);
            const quitado = document.getElementById('despesa-quitado-individual').checked;
            
            if (isNaN(valorPago) || valorPago < 0) {
                alert('Por favor, insira um valor válido.');
                return;
            }
            
            const sucesso = await processarPagamento(index, mes, ano, valorPago, quitado);
            
            if (sucesso) {
                document.getElementById('modal-pagamento-individual').style.display = 'none';
            } else {
                alert('Ocorreu um erro ao processar o pagamento.');
            }
        } catch (error) {
            console.error('❌ Erro no formulário de pagamento:', error);
            alert('Erro ao processar pagamento: ' + error.message);
        }
    });
}

async function processarPagamento(index, mes, ano, valorPago = null, quitarParcelasFuturas = false) {
    try {
        console.log(`💰 Processando pagamento da despesa ${index}`);
        
        if (!dadosFinanceiros[ano] || !dadosFinanceiros[ano].meses[mes]) {
            throw new Error(ERROS.ESTRUTURA_DADOS_INVALIDA);
        }
        
        if (!dadosFinanceiros[ano].meses[mes].despesas || !dadosFinanceiros[ano].meses[mes].despesas[index]) {
            throw new Error(ERROS.DESPESA_NAO_ENCONTRADA);
        }
        
        const despesa = dadosFinanceiros[ano].meses[mes].despesas[index];
        
        if (valorPago === null) valorPago = despesa.valor;
        
        // Atualizar despesa
        despesa.valorPago = parseFloat(valorPago);
        despesa.quitado = true;
        despesa.status = 'quitada';
        despesa.dataPagamento = new Date().toISOString().split('T')[0];
        
        // Quitar parcelas futuras se solicitado
        if (quitarParcelasFuturas && despesa.parcelado && despesa.idGrupoParcelamento) {
            await processarParcelasFuturas(despesa, ano);
        }
        
        await salvarDados();
        
        // Atualizar interface
        if (typeof carregarDadosDashboard === 'function') {
            await carregarDadosDashboard(anoAtual);
        }
        
        renderizarDetalhesDoMes(mes, ano);
        
        console.log('✅ Pagamento processado com sucesso');
        return true;
        
    } catch (error) {
        console.error("❌ Erro ao processar pagamento:", error);
        return false;
    }
}

async function processarParcelasFuturas(despesa, anoAtual) {
    console.log(`🔄 Processando parcelas futuras para grupo: ${despesa.idGrupoParcelamento}`);
    
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
                    console.log(`✅ Parcela futura quitada: ${d.descricao} - ${d.parcela}`);
                }
            });
        }
    }
}

// ================================================================
// PAGAMENTO EM LOTE - CORRIGIDO E ASSÍNCRONO
// ================================================================

async function pagarDespesasEmLote() {
    try {
        console.log('💰 Iniciando pagamento em lote...');
        
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
        
        await configurarModalPagamentoLote(checkboxesValidas);
        
        const modal = document.getElementById('modal-pagamento-lote-despesas');
        if (modal) modal.style.display = 'block';
        
    } catch (error) {
        console.error("❌ Erro ao preparar pagamento em lote:", error);
        alert("Ocorreu um erro ao preparar o pagamento em lote: " + error.message);
    }
}

async function configurarModalPagamentoLote(checkboxes) {
    const contadorElement = document.getElementById('lote-contagem-despesas');
    if (contadorElement) {
        contadorElement.textContent = `Você está prestes a pagar ${checkboxes.length} despesa(s) em lote.`;
    }
    
    // Limpar event listeners antigos
    const btnOriginal = document.getElementById('btn-pagar-valor-original');
    const btnPersonalizado = document.getElementById('btn-pagar-com-valor-personalizado');
    
    if (btnOriginal) {
        const novoBtnOriginal = btnOriginal.cloneNode(true);
        btnOriginal.parentNode.replaceChild(novoBtnOriginal, btnOriginal);
    }
    
    if (btnPersonalizado) {
        const novoBtnPersonalizado = btnPersonalizado.cloneNode(true);
        btnPersonalizado.parentNode.replaceChild(novoBtnPersonalizado, btnPersonalizado);
    }
    
    // Adicionar novos event listeners
    document.getElementById('btn-pagar-valor-original')?.addEventListener('click', async () => {
        try {
            await pagarLoteComValoresOriginais(checkboxes);
            document.getElementById('modal-pagamento-lote-despesas').style.display = 'none';
        } catch (error) {
            console.error('❌ Erro no pagamento em lote:', error);
            alert('Erro no pagamento em lote: ' + error.message);
        }
    });
    
    document.getElementById('btn-pagar-com-valor-personalizado')?.addEventListener('click', () => {
        document.getElementById('modal-pagamento-lote-despesas').style.display = 'none';
        configurarModalValoresPersonalizados(checkboxes);
        document.getElementById('modal-valores-personalizados-despesas').style.display = 'block';
    });
}

function configurarModalValoresPersonalizados(checkboxes) {
    const indices = Array.from(checkboxes).map(checkbox => parseInt(checkbox.dataset.index));
    const tbody = document.getElementById('valores-personalizados-body');
    
    if (!tbody) {
        console.error('❌ Tbody de valores personalizados não encontrado');
        return;
    }
    
    tbody.innerHTML = '';
    
    let despesasValidas = 0;
    indices.forEach(index => {
        if (dadosFinanceiros[anoAberto]?.meses[mesAberto]?.despesas?.[index] && 
            !dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index].quitado) {
            
            const despesa = dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index];
            
            const template = document.getElementById('template-linha-valor-personalizado');
            if (template) {
                const clone = template.content.cloneNode(true);
                
                // Preencher dados da despesa
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
    
    // Configurar botão de confirmação
    const btnConfirmar = document.getElementById('btn-confirmar-valores');
    if (btnConfirmar) {
        const novoBtnConfirmar = btnConfirmar.cloneNode(true);
        btnConfirmar.parentNode.replaceChild(novoBtnConfirmar, btnConfirmar);
        
        document.getElementById('btn-confirmar-valores').addEventListener('click', async () => {
            try {
                await processarValoresPersonalizados();
            } catch (error) {
                console.error('❌ Erro nos valores personalizados:', error);
                alert('Erro ao processar valores personalizados: ' + error.message);
            }
        });
    }
}

async function processarValoresPersonalizados() {
    const inputs = document.querySelectorAll('.input-valor-pago');
    let despesasPagas = 0;
    
    for (const input of inputs) {
        const index = parseInt(input.dataset.index);
        const valorPago = parseFloat(input.value);
        
        if (!isNaN(valorPago) && valorPago >= 0) {
            if (await processarPagamento(index, mesAberto, anoAberto, valorPago, false)) {
                despesasPagas++;
            }
        }
    }
    
    document.getElementById('modal-valores-personalizados-despesas').style.display = 'none';
    renderizarDetalhesDoMes(mesAberto, anoAberto);
    
    if (despesasPagas > 0) {
        alert(`${despesasPagas} despesa(s) paga(s) com sucesso!`);
    } else {
        alert("Nenhuma despesa foi processada com sucesso.");
    }
}

async function pagarLoteComValoresOriginais(checkboxes) {
    const indices = Array.from(checkboxes).map(checkbox => parseInt(checkbox.dataset.index));
    
    let despesasPagas = 0;
    for (const index of indices) {
        if (dadosFinanceiros[anoAberto] && 
            dadosFinanceiros[anoAberto].meses[mesAberto] && 
            dadosFinanceiros[anoAberto].meses[mesAberto].despesas && 
            dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index]) {
            
            if (await processarPagamento(index, mesAberto, anoAberto, null, false)) {
                despesasPagas++;
            }
        }
    }
    
    renderizarDetalhesDoMes(mesAberto, anoAberto);
    
    if (despesasPagas > 0) {
        alert(`${despesasPagas} despesa(s) paga(s) com sucesso!`);
    } else {
        alert("Nenhuma despesa foi processada com sucesso.");
    }
}

// ================================================================
// SISTEMA DE FILTROS - OTIMIZADO
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
        
        // Remover event listener antigo
        selectCategoria.removeEventListener('change', selectCategoria._filterHandler);
        
        // Adicionar novo event listener
        selectCategoria._filterHandler = function() {
            filtrarDespesasPorCategoria(this.value);
        };
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
        
        // Remover event listener antigo
        selectFormaPagamento.removeEventListener('change', selectFormaPagamento._filterHandler);
        
        // Adicionar novo event listener
        selectFormaPagamento._filterHandler = function() {
            filtrarDespesasPorFormaPagamento(this.value);
        };
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
            { value: 'quitada', text: 'Pagas' }
        ];
        
        opcoes.forEach(opcao => {
            adicionarOpcaoSelect(selectStatus, opcao.value, opcao.text);
        });
        
        // Remover event listener antigo
        selectStatus.removeEventListener('change', selectStatus._filterHandler);
        
        // Adicionar novo event listener
        selectStatus._filterHandler = function() {
            filtrarDespesasPorStatus(this.value);
        };
        selectStatus.addEventListener('change', selectStatus._filterHandler);
    }
}

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
    const filtros = [
        'filtro-categoria',
        'filtro-status', 
        'filtro-forma-pagamento-tabela'
    ];
    
    filtros.forEach(id => {
        const select = document.getElementById(id);
        if (select) select.value = 'todas';
    });
    
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
// FUNÇÕES UTILITÁRIAS FINAIS
// ================================================================

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
// EXPORTAR FUNÇÕES GLOBAIS DA ETAPA 2
// ================================================================

window.excluirDespesa = excluirDespesa;
window.moverParaProximoMes = moverParaProximoMes;
window.abrirModalPagamento = abrirModalPagamento;
window.processarPagamento = processarPagamento;
window.pagarDespesasEmLote = pagarDespesasEmLote;
window.criarFiltrosCategorias = criarFiltrosCategorias;
window.criarFiltrosFormaPagamento = criarFiltrosFormaPagamento;
window.criarFiltrosStatus = criarFiltrosStatus;
window.limparFiltros = limparFiltros;
window.atualizarContadoresFiltro = atualizarContadoresFiltro;

console.log('📦 Sistema de despesas ETAPA 2 carregado - sistema completo pronto!');