window.processandoPagamento = false;
window.processandoExclusao = false;

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

async function excluirDespesa(index, mes, ano) {
    if (window.processandoExclusao) return;
    window.processandoExclusao = true;
    
    try {
        const indexNumerico = parseInt(index);
        const response = await fetch(`${window.API_URL}/despesas?mes=${mes}&ano=${ano}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Erro ao buscar despesas');
        
        const despesas = data.data;
        if (!despesas || !despesas[indexNumerico]) {
            alert('Despesa não encontrada!');
            return;
        }
        
        const despesa = despesas[indexNumerico];
        
        window.despesaParaExcluir = {
            index: indexNumerico,
            mes: mes,
            ano: ano,
            despesa: despesa
        };
        
        await configurarModalExclusao(despesa, indexNumerico, mes, ano);
        
        const modal = document.getElementById('modal-confirmacao-exclusao-despesa');
        if (modal) modal.style.display = 'block';
        
    } catch (error) {
        alert('Erro ao excluir despesa: ' + error.message);
        if (typeof window.renderizarDetalhesDoMes === 'function') {
            window.renderizarDetalhesDoMes(mes, ano);
        }
    } finally {
        window.processandoExclusao = false;
    }
}

async function configurarModalExclusao(despesa, index, mes, ano) {
    const titulo = document.getElementById('exclusao-titulo');
    const mensagem = document.getElementById('exclusao-mensagem');
    
    if (despesa.parcelado && despesa.parcela_atual) {
        if (titulo) titulo.textContent = 'Excluir item parcelado';
        if (mensagem) mensagem.textContent = 'Este item está parcelado. Como deseja prosseguir?';
        
        document.querySelectorAll('.opcao-exclusao-basica').forEach(btn => btn.style.display = 'none');
        document.querySelectorAll('.opcao-exclusao-parcelada').forEach(btn => btn.style.display = 'block');
    } else {
        if (titulo) titulo.textContent = 'Excluir despesa';
        if (mensagem) mensagem.textContent = 'Tem certeza que deseja excluir esta despesa?';
        
        document.querySelectorAll('.opcao-exclusao-basica').forEach(btn => btn.style.display = 'block');
        document.querySelectorAll('.opcao-exclusao-parcelada').forEach(btn => btn.style.display = 'none');
    }
    
    await configurarBotoesExclusao(despesa, index, mes, ano);
}

async function configurarBotoesExclusao(despesa, index, mes, ano) {
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
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    if (!despesa.parcelado) {
        configurarBotoesExclusaoSimples(despesa, index, mes, ano);
    } else {
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
            
            try {
                await processarExclusao('atual', index, mes, ano, despesa.id);
            } catch (error) {
                alert('Erro ao excluir: ' + error.message);
            }
        };
    }
    
    if (btnTodos) {
        btnTodos.onclick = async function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            try {
                await processarExclusao('todas', index, mes, ano, despesa.id);
            } catch (error) {
                alert('Erro ao excluir: ' + error.message);
            }
        };
    }
}

function configurarBotoesExclusaoParcelada(despesa, index, mes, ano) {
    const btnParcela = document.getElementById('btn-excluir-parcela-atual');
    const btnFuturas = document.getElementById('btn-excluir-parcelas-futuras');
    const btnTodas = document.getElementById('btn-excluir-todas-parcelas');
    
    if (btnParcela) {
        btnParcela.onclick = async function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            try {
                await processarExclusao('parcela', index, mes, ano, despesa.id);
            } catch (error) {
                alert('Erro ao excluir parcela: ' + error.message);
            }
        };
    }
    
    if (btnFuturas) {
        btnFuturas.onclick = async function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            try {
                await processarExclusao('futuras', index, mes, ano, despesa.id);
            } catch (error) {
                alert('Erro ao excluir parcelas futuras: ' + error.message);
            }
        };
    }
    
    if (btnTodas) {
        btnTodas.onclick = async function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            try {
                await processarExclusao('todas', index, mes, ano, despesa.id);
            } catch (error) {
                alert('Erro ao excluir todas as parcelas: ' + error.message);
            }
        };
    }
}

async function processarExclusao(opcao, index, mes, ano, despesaId) {
    try {
        let sucesso = false;
        
        switch (opcao) {
            case 'atual':
            case 'parcela':
                sucesso = await excluirDespesaAPI(despesaId);
                break;
                
            case 'todas':
            case 'futuras':
                sucesso = await excluirDespesaAPI(despesaId);
                break;
                
            default:
                throw new Error('Tipo de exclusão não reconhecido');
        }

        if (sucesso) {
            if (window.despesasCache) {
                window.despesasCache.invalidate(`despesas_${mes}_${ano}`);
            }
            
            if (window.DespesasCore) {
                await window.DespesasCore.buscarEExibirDespesas(mes, ano);
            }
            
            if (typeof window.renderizarDetalhesDoMes === 'function') {
                window.renderizarDetalhesDoMes(mes, ano);
            }
            
            if (typeof window.carregarDadosDashboard === 'function') {
                await window.carregarDadosDashboard(ano);
            }
        } else {
            throw new Error('Falha ao excluir despesa');
        }
        
        const modal = document.getElementById('modal-confirmacao-exclusao-despesa');
        if (modal) modal.style.display = 'none';
        
    } catch (error) {
        alert('Erro ao processar exclusão: ' + error.message);
    }
}

async function excluirDespesaAPI(despesaId) {
    try {
        const token = getToken();
        if (!token) {
            throw new Error('Usuário não autenticado');
        }
        
        const response = await fetch(`${window.API_URL}/despesas/${despesaId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Erro ao excluir despesa');
        }
        
        return true;
        
    } catch (error) {
        return false;
    }
}

window.excluirDespesaAtual = async function() {
    if (window.despesaParaExcluir) {
        const { index, mes, ano } = window.despesaParaExcluir;
        
        try {
            await processarExclusao('atual', index, mes, ano, window.despesaParaExcluir.despesa.id);
        } catch (error) {
            alert('Erro ao excluir: ' + error.message);
        }
    }
};

window.fecharModalExclusao = function() {
    const modal = document.getElementById('modal-confirmacao-exclusao-despesa');
    if (modal) modal.style.display = 'none';
    window.despesaParaExcluir = null;
};

async function moverParaProximoMes(index, mes, ano) {
    try {
        const response = await fetch(`${window.API_URL}/despesas?mes=${mes}&ano=${ano}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Erro ao buscar despesas');
        
        const despesas = data.data;
        if (!despesas || !despesas[index]) {
            alert('Despesa não encontrada!');
            return;
        }
        
        const despesa = despesas[index];
        
        if (despesa.pago === true) {
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
        alert("Não foi possível mover a despesa: " + error.message);
    }
}

async function executarMovimentoDespesa(despesa, index, mes, ano, proximoMes, proximoAno, mesAtualNome, proximoMesNome) {
    try {
        const token = getToken();
        if (!token) throw new Error('Usuário não autenticado');
        
        const dataAtualizada = new Date(proximoAno, proximoMes, new Date().getDate()).toISOString().split('T')[0];
        
        const dadosAtualizacao = {
            data_vencimento: dataAtualizada,
            mes: proximoMes,
            ano: proximoAno
        };
        
        const response = await fetch(`${window.API_URL}/despesas/${despesa.id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dadosAtualizacao)
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Erro ao mover despesa');
        
        if (window.despesasCache) {
            window.despesasCache.invalidate(`despesas_${mes}_${ano}`);
            window.despesasCache.invalidate(`despesas_${proximoMes}_${proximoAno}`);
        }
        
        if (window.DespesasCore) {
            await window.DespesasCore.buscarEExibirDespesas(mes, ano);
        }
        
        if (typeof window.renderizarDetalhesDoMes === 'function') {
            window.renderizarDetalhesDoMes(mes, ano);
        }
        
        if (typeof window.carregarDadosDashboard === 'function') {
            await window.carregarDadosDashboard(ano);
        }
        
        alert(`Despesa movida com sucesso para ${proximoMesNome} de ${proximoAno}!`);
        
    } catch (error) {
        alert('Erro ao mover despesa: ' + error.message);
    }
}

async function abrirModalPagamento(index, mes, ano) {
    if (window.processandoPagamento) return;
    
    try {
        const response = await fetch(`${window.API_URL}/despesas?mes=${mes}&ano=${ano}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Erro ao buscar despesas');
        
        const despesas = data.data;
        if (!despesas || !despesas[index]) {
            alert('Despesa não encontrada!');
            return;
        }
        
        const despesa = despesas[index];
        
        if (despesa.pago === true) {
            alert('Esta despesa já foi paga.');
            return;
        }
        
        if (window.sistemaAnexos) {
            window.sistemaAnexos.limparAnexosTemporarios('comprovante');
        }
        
        preencherInfoDespesaPagamento(despesa);
        
        const inputDataPagamento = document.getElementById('data-pagamento-individual');
        if (inputDataPagamento) {
            if (despesa.data_pagamento) {
                inputDataPagamento.value = despesa.data_pagamento;
            } else {
                inputDataPagamento.value = new Date().toISOString().split('T')[0];
            }
        }
        
        configurarFormPagamento(index, mes, ano, despesa);
        
        const modal = document.getElementById('modal-pagamento-individual');
        if (modal) {
            modal.style.display = 'block';
            
            setTimeout(() => {
                const btnComprovante = document.getElementById('btn-anexar-comprovante');
                if (btnComprovante) {
                    btnComprovante.onclick = function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (window.sistemaAnexos) {
                            window.sistemaAnexos.abrirSeletorArquivos('comprovante');
                        } else {
                            alert('Sistema de anexos não disponível');
                        }
                    };
                }
            }, 100);
            
        } else {
            throw new Error('Modal de pagamento não encontrado no DOM');
        }
        
    } catch (error) {
        alert("Não foi possível abrir o modal de pagamento: " + error.message);
    }
}

function preencherInfoDespesaPagamento(despesa) {
    const formatarMoeda = window.formatarMoeda || ((valor) => {
        const num = parseFloat(valor || 0);
        return `R$ ${num.toFixed(2).replace('.', ',')}`;
    });
    
    const elementos = {
        'pagamento-descricao': despesa.descricao || 'Sem descrição',
        'pagamento-categoria': despesa.categoria_nome || 'Sem categoria',
        'pagamento-valor-original': formatarMoeda(despesa.valor || 0)
    };
    
    Object.entries(elementos).forEach(([id, valor]) => {
        const elemento = document.getElementById(id);
        if (elemento) elemento.textContent = valor;
    });
    
    const formaPagamentoContainer = document.getElementById('pagamento-forma-container');
    const formaPagamentoElemento = document.getElementById('pagamento-forma');
    
    if (despesa.forma_pagamento && formaPagamentoElemento) {
        formaPagamentoElemento.textContent = despesa.forma_pagamento.toUpperCase();
        if (formaPagamentoContainer) formaPagamentoContainer.style.display = 'block';
    } else {
        if (formaPagamentoContainer) formaPagamentoContainer.style.display = 'none';
    }
    
    const valorPagoInput = document.getElementById('valor-pago-individual');
    if (valorPagoInput) valorPagoInput.value = despesa.valor || 0;
    
    const quitadoCheckbox = document.getElementById('despesa-quitado-individual');
    const infoParcelasFuturas = document.getElementById('info-parcelas-futuras');
    const eParcelado = despesa.parcelado === true && despesa.parcela_atual;
    
    if (eParcelado) {
        if (quitadoCheckbox) {
            quitadoCheckbox.parentElement.style.display = 'block';
            quitadoCheckbox.checked = false;
        }
        if (infoParcelasFuturas) infoParcelasFuturas.classList.remove('hidden');
    } else {
        if (quitadoCheckbox) quitadoCheckbox.parentElement.style.display = 'none';
        if (infoParcelasFuturas) infoParcelasFuturas.classList.add('hidden');
    }
}

function configurarFormPagamento(index, mes, ano, despesa) {
    const form = document.getElementById('form-pagamento-individual');
    if (!form) return;
    
    const novoForm = form.cloneNode(true);
    form.parentNode.replaceChild(novoForm, form);
    
    const formAtualizado = document.getElementById('form-pagamento-individual');
    if (formAtualizado) {
        formAtualizado.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (window.processandoPagamento) return;
            window.processandoPagamento = true;
            
            try {
                const valorPagoInput = document.getElementById('valor-pago-individual');
                const quitadoCheckbox = document.getElementById('despesa-quitado-individual');
                
                if (!valorPagoInput) {
                    throw new Error('Campo de valor pago não encontrado');
                }
                
                const valorPago = parseFloat(valorPagoInput.value);
                const quitarFuturas = quitadoCheckbox ? quitadoCheckbox.checked : false;
                
                if (isNaN(valorPago) || valorPago < 0) {
                    alert('Por favor, insira um valor válido.');
                    valorPagoInput.focus();
                    return;
                }
                
                const sucesso = await processarPagamento(despesa.id, mes, ano, valorPago, quitarFuturas);
                
                if (sucesso) {
                    const modal = document.getElementById('modal-pagamento-individual');
                    if (modal) modal.style.display = 'none';
                    alert('Pagamento processado com sucesso!');
                } else {
                    alert('Ocorreu um erro ao processar o pagamento.');
                }
                
            } catch (error) {
                alert('Erro ao processar pagamento: ' + error.message);
            } finally {
                window.processandoPagamento = false;
            }
        });
    }
}

async function processarPagamento(despesaId, mes, ano, valorPago = null, quitarParcelasFuturas = false) {
    try {
        const token = getToken();
        if (!token) {
            throw new Error('Usuário não autenticado');
        }
        
        const inputDataPagamento = document.getElementById('data-pagamento-individual');
        const dataPagamento = inputDataPagamento ? inputDataPagamento.value : 
                            new Date().toISOString().split('T')[0];
        
        const dadosPagamento = {
            valor_pago: valorPago,
            data_pagamento: dataPagamento,
            quitar_futuras: quitarParcelasFuturas
        };
        
        const response = await fetch(`${window.API_URL}/despesas/${despesaId}/pagar`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dadosPagamento)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Erro ao processar pagamento');
        }
        
        if (window.despesasCache) {
            window.despesasCache.invalidate(`despesas_${mes}_${ano}`);
        }
        
        if (window.DespesasCore) {
            await window.DespesasCore.buscarEExibirDespesas(mes, ano);
        }
        
        return true;
        
    } catch (error) {
        alert('Erro ao processar pagamento: ' + error.message);
        return false;
    }
}

async function pagarDespesasEmLote() {
    try {
        const todasCheckboxes = document.querySelectorAll('.despesa-checkbox:checked');
        
        if (todasCheckboxes.length === 0) {
            alert("Nenhuma despesa selecionada para pagamento.");
            return;
        }

        const checkboxesValidas = Array.from(todasCheckboxes).filter(checkbox => {
            const linha = checkbox.closest('.grid-row');
            return linha && !linha.classList.contains('despesa-quitada');
        });
        
        if (checkboxesValidas.length === 0) {
            alert("Nenhuma despesa válida selecionada para pagamento.");
            return;
        }
        
        await configurarModalPagamentoLote(checkboxesValidas);
        
        const modal = document.getElementById('modal-pagamento-lote-despesas');
        if (modal) modal.style.display = 'block';
        
    } catch (error) {
        alert("Ocorreu um erro ao preparar o pagamento em lote: " + error.message);
    }
}

async function configurarModalPagamentoLote(checkboxes) {
    const contadorElement = document.getElementById('lote-contagem-despesas');
    if (contadorElement) {
        contadorElement.textContent = `Você está prestes a pagar ${checkboxes.length} despesa(s) em lote.`;
    }
    
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
    
    const inputDataLote = document.getElementById('data-pagamento-lote');
    if (inputDataLote) {
        inputDataLote.value = new Date().toISOString().split('T')[0];
    }
    
    if (window.sistemaAnexos) {
        window.sistemaAnexos.limparAnexosTemporarios('comprovante');
    }
    
    document.getElementById('btn-pagar-valor-original')?.addEventListener('click', async () => {
        try {
            await pagarLoteComValoresOriginais(checkboxes);
            document.getElementById('modal-pagamento-lote-despesas').style.display = 'none';
        } catch (error) {
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
    
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (window.sistemaAnexos) {
        window.sistemaAnexos.limparAnexosTemporarios('comprovante');
    }

    const inputDataPersonalizada = document.getElementById('data-pagamento-personalizada');
    if (inputDataPersonalizada) {
        inputDataPersonalizada.value = new Date().toISOString().split('T')[0];
    }
    
    let despesasValidas = 0;
    
    Promise.all(indices.map(async (index) => {
        try {
            const linha = document.querySelector(`[data-index="${index}"]`)?.closest('.grid-row');
            if (!linha) return;
            
            const despesaId = linha.getAttribute('data-despesa-id');
            if (!despesaId) return;
            
            const response = await fetch(`${window.API_URL}/despesas/${despesaId}`, {
                headers: {
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            if (!response.ok) return;
            
            const despesa = data.data;
            if (despesa.pago) return;
            
            const template = document.getElementById('template-linha-valor-personalizado');
            if (template) {
                const clone = template.content.cloneNode(true);
                
                clone.querySelector('.despesa-descricao').textContent = despesa.descricao;
                clone.querySelector('.despesa-categoria').textContent = despesa.categoria_nome || 'Outros';
                
                const badgeContainer = clone.querySelector('.despesa-forma-pagamento');
                if (despesa.forma_pagamento) {
                    const badge = document.createElement('span');
                    badge.className = `badge-pagamento badge-${despesa.forma_pagamento}`;
                    badge.textContent = despesa.forma_pagamento.toUpperCase();
                    badgeContainer.innerHTML = '';
                    badgeContainer.appendChild(badge);
                } else {
                    badgeContainer.textContent = '-';
                }
                
                const formatarMoeda = window.formatarMoeda || ((valor) => {
                    const num = parseFloat(valor || 0);
                    return `R$ ${num.toFixed(2).replace('.', ',')}`;
                });
                
                clone.querySelector('.despesa-valor-original').textContent = formatarMoeda(despesa.valor);
                
                const input = clone.querySelector('.input-valor-pago');
                input.value = despesa.valor;
                input.dataset.despesaId = despesa.id;
                
                tbody.appendChild(clone);
                despesasValidas++;
            }
        } catch (error) {
            console.error('Erro ao carregar despesa:', error);
        }
    })).then(() => {
        if (despesasValidas === 0) {
            alert("Não há despesas válidas para processar.");
            return;
        }
    });
    
    const btnConfirmar = document.getElementById('btn-confirmar-valores');
    if (btnConfirmar) {
        const novoBtnConfirmar = btnConfirmar.cloneNode(true);
        btnConfirmar.parentNode.replaceChild(novoBtnConfirmar, btnConfirmar);
        
        document.getElementById('btn-confirmar-valores').addEventListener('click', async () => {
            try {
                await processarValoresPersonalizados();
            } catch (error) {
                alert('Erro ao processar valores personalizados: ' + error.message);
            }
        });
    }
}

async function processarValoresPersonalizados() {
    const inputs = document.querySelectorAll('.input-valor-pago');
    
    const inputDataPersonalizada = document.getElementById('data-pagamento-personalizada');
    const dataPagamento = inputDataPersonalizada ? inputDataPersonalizada.value : 
                         new Date().toISOString().split('T')[0];
    
    let despesasPagas = 0;
    
    let comprovantes = [];
    if (window.sistemaAnexos) {
        comprovantes = window.sistemaAnexos.obterAnexosParaSalvar('comprovante');
    }
    
    for (const input of inputs) {
        const despesaId = input.dataset.despesaId;
        const valorPago = parseFloat(input.value);
        
        if (!isNaN(valorPago) && valorPago >= 0 && despesaId) {
            if (await processarPagamentoComData(despesaId, valorPago, false, dataPagamento)) {
                despesasPagas++;
            }
        }
    }
    
    if (window.sistemaAnexos) {
        window.sistemaAnexos.limparAnexosTemporarios('comprovante');
    }
    
    document.getElementById('modal-valores-personalizados-despesas').style.display = 'none';
    
    if (window.mesAberto !== null && window.anoAberto !== null) {
        if (window.DespesasCore) {
            await window.DespesasCore.buscarEExibirDespesas(window.mesAberto, window.anoAberto);
        }
        
        if (typeof window.renderizarDetalhesDoMes === 'function') {
            window.renderizarDetalhesDoMes(window.mesAberto, window.anoAberto);
        }
    }
    
    if (despesasPagas > 0) {
        alert(`${despesasPagas} despesa(s) paga(s) com sucesso!`);
        
        const checkboxTodas = document.getElementById('select-all-despesas');
        if (checkboxTodas) {
            checkboxTodas.checked = false;
        }
        
        if (window.DespesasCore) {
            window.DespesasCore.atualizarBotaoLote();
        }
    } else {
        alert("Nenhuma despesa foi processada com sucesso.");
    }
}

async function processarPagamentoComData(despesaId, valorPago = null, quitarParcelasFuturas = false, dataPagamento = null) {
    try {
        const token = getToken();
        if (!token) {
            throw new Error('Usuário não autenticado');
        }
        
        const dadosPagamento = {
            valor_pago: valorPago,
            data_pagamento: dataPagamento || new Date().toISOString().split('T')[0],
            quitar_futuras: quitarParcelasFuturas
        };
        
        const response = await fetch(`${window.API_URL}/despesas/${despesaId}/pagar`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dadosPagamento)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Erro ao processar pagamento');
        }
        
        return true;
        
    } catch (error) {
        return false;
    }
}

async function pagarLoteComValoresOriginais(checkboxes) {
    const inputDataLote = document.getElementById('data-pagamento-lote');
    const dataPagamentoLote = inputDataLote ? inputDataLote.value : 
                             new Date().toISOString().split('T')[0];
    
    let comprovantes = [];
    if (window.sistemaAnexos) {
        comprovantes = window.sistemaAnexos.obterAnexosParaSalvar('comprovante');
    }
    
    let despesasPagas = 0;
    
    for (const checkbox of checkboxes) {
        const linha = checkbox.closest('.grid-row');
        if (!linha) continue;
        
        const despesaId = linha.getAttribute('data-despesa-id');
        if (!despesaId) continue;
        
        try {
            const response = await fetch(`${window.API_URL}/despesas/${despesaId}`, {
                headers: {
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            if (!response.ok) continue;
            
            const despesa = data.data;
            if (despesa.pago) continue;
            
            if (await processarPagamentoComData(despesaId, despesa.valor, false, dataPagamentoLote)) {
                despesasPagas++;
            }
        } catch (error) {
            console.error('Erro ao processar despesa:', error);
        }
    }
    
    if (window.sistemaAnexos) {
        window.sistemaAnexos.limparAnexosTemporarios('comprovante');
    }
    
    if (window.mesAberto !== null && window.anoAberto !== null) {
        if (window.DespesasCore) {
            await window.DespesasCore.buscarEExibirDespesas(window.mesAberto, window.anoAberto);
        }
        
        if (typeof window.renderizarDetalhesDoMes === 'function') {
            window.renderizarDetalhesDoMes(window.mesAberto, window.anoAberto);
        }
    }
    
    if (despesasPagas > 0) {
        alert(`${despesasPagas} despesa(s) paga(s) com sucesso!`);
        
        const checkboxTodas = document.getElementById('select-all-despesas');
        if (checkboxTodas) {
            checkboxTodas.checked = false;
        }
        
        if (window.DespesasCore) {
            window.DespesasCore.atualizarBotaoLote();
        }
    } else {
        alert("Nenhuma despesa foi processada com sucesso.");
    }
}

function encontrarDespesaPorIndice(index, despesas) {
    if (!Array.isArray(despesas) || index < 0 || index >= despesas.length) {
        return { despesa: null, indice: -1 };
    }
    
    const despesa = despesas[index];
    if (!despesa || despesa.transferidaParaProximoMes === true) {
        return { despesa: null, indice: -1 };
    }
    
    return { despesa: despesa, indice: index };
}

function criarObjetoDespesa(dados) {
    return {
        id: dados.id || (window.gerarId ? window.gerarId() : Date.now().toString()),
        descricao: dados.descricao || '',
        categoria: dados.categoria || '',
        formaPagamento: dados.formaPagamento || null,
        numeroCartao: dados.numeroCartao || null,
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
        recorrente: !!dados.recorrente,
        idGrupoParcelamento: dados.idGrupoParcelamento || null,
        dataCriacao: dados.dataCriacao || new Date().toISOString(),
        anexos: dados.anexos || []
    };
}

function calcularLimiteDisponivelCartao(numeroCartao, mes, ano) {
    if (!numeroCartao || !window.cartoesUsuario) return null;
    
    const cartao = window.cartoesUsuario[`cartao${numeroCartao}`];
    if (!cartao || !cartao.ativo) return null;
    
    const limiteTotal = parseFloat(cartao.limite) || 0;
    let limiteUtilizado = 0;
    
    if (window.dadosFinanceiros) {
        for (let anoAtual = ano; anoAtual <= ano + 3; anoAtual++) {
            if (!window.dadosFinanceiros[anoAtual]) continue;
            
            for (let mesAtual = 0; mesAtual < 12; mesAtual++) {
                if (!window.dadosFinanceiros[anoAtual].meses?.[mesAtual]?.despesas) continue;
                
                const despesas = window.dadosFinanceiros[anoAtual].meses[mesAtual].despesas;
                
                despesas.forEach(despesa => {
                    if (despesa.formaPagamento === 'credito' && 
                        despesa.numeroCartao === numeroCartao && 
                        !despesa.quitado &&
                        !despesa.recorrente) {
                        
                        limiteUtilizado += parseFloat(despesa.valor) || 0;
                    }
                });
            }
        }
    }
    
    const limiteDisponivel = limiteTotal - limiteUtilizado;
    const percentualUsado = limiteTotal > 0 ? (limiteUtilizado / limiteTotal) * 100 : 0;
    
    return {
        limiteTotal,
        limiteUtilizado,
        limiteDisponivel,
        percentualUsado,
        temLimite: limiteDisponivel > 0
    };
}

function arredondarParaDuasCasas(valor) {
    return Math.round((parseFloat(valor) + Number.EPSILON) * 100) / 100;
}

async function excluirApenasParcela(index, mes, ano) {
    try {
        if (!window.dadosFinanceiros?.[ano]?.meses?.[mes]?.despesas?.[index]) {
            throw new Error('Parcela não encontrada');
        }
        
        const despesa = window.dadosFinanceiros[ano].meses[mes].despesas[index];
        const idGrupo = despesa.idGrupoParcelamento;
        
        const sucesso = await excluirDespesaAPI(despesa.id);
        
        if (sucesso && idGrupo) {
            reindexarParcelasAposExclusao(idGrupo, despesa.descricao);
        }
        
        return sucesso;
    } catch (error) {
        return false;
    }
}

async function excluirParcelaEFuturas(index, mes, ano) {
    try {
        if (!window.dadosFinanceiros?.[ano]?.meses?.[mes]?.despesas?.[index]) {
            throw new Error('Parcela não encontrada');
        }
        
        const despesa = window.dadosFinanceiros[ano].meses[mes].despesas[index];
        const idGrupo = despesa.idGrupoParcelamento;
        const numeroParcelaAtual = despesa.parcelaAtual || 1;
        
        if (!idGrupo) {
            return await excluirDespesaAPI(despesa.id);
        }
        
        let parcelas = [];
        for (let anoFuturo = ano; anoFuturo <= ano + 3; anoFuturo++) {
            if (!window.dadosFinanceiros[anoFuturo]) continue;
            
            const mesInicial = anoFuturo === ano ? mes : 0;
            
            for (let mesFuturo = mesInicial; mesFuturo < 12; mesFuturo++) {
                if (!window.dadosFinanceiros[anoFuturo].meses?.[mesFuturo]?.despesas) continue;
                
                const despesas = window.dadosFinanceiros[anoFuturo].meses[mesFuturo].despesas;
                
                despesas.forEach(d => {
                    if (d.idGrupoParcelamento === idGrupo && 
                        d.descricao === despesa.descricao &&
                        (d.parcelaAtual || 1) >= numeroParcelaAtual) {
                        
                        parcelas.push(d.id);
                    }
                });
            }
        }
        
        let sucessos = 0;
        for (const parcelaId of parcelas) {
            if (await excluirDespesaAPI(parcelaId)) {
                sucessos++;
            }
        }
        
        return sucessos > 0;
        
    } catch (error) {
        return false;
    }
}

function validarGrupoParcelamento(idGrupo, despesaOriginal) {
    if (!idGrupo || !despesaOriginal) return { valido: false, erro: 'Parâmetros inválidos' };
    
    const parcelas = [];
    const anoBase = despesaOriginal.ano || new Date().getFullYear();
    
    if (!window.dadosFinanceiros) return { valido: false, erro: 'Dados não carregados' };
    
    for (let ano = anoBase; ano <= anoBase + 3; ano++) {
        if (!window.dadosFinanceiros[ano]) continue;
        
        for (let mes = 0; mes < 12; mes++) {
            if (!window.dadosFinanceiros[ano].meses?.[mes]?.despesas) continue;
            
            window.dadosFinanceiros[ano].meses[mes].despesas.forEach((despesa, index) => {
                if (despesa.idGrupoParcelamento === idGrupo && 
                    despesa.descricao === despesaOriginal.descricao) {
                    parcelas.push({
                        despesa,
                        index,
                        mes,
                        ano,
                        parcela: despesa.parcela || `${index + 1}/1`
                    });
                }
            });
        }
    }
    
    const totalEsperado = parseInt(despesaOriginal.totalParcelas) || 1;
    const encontradas = parcelas.length;
    
    return {
        valido: encontradas === totalEsperado,
        encontradas,
        esperadas: totalEsperado,
        parcelas: parcelas.sort((a, b) => {
            const [numA] = (a.parcela || '1/1').split('/').map(Number);
            const [numB] = (b.parcela || '1/1').split('/').map(Number);
            return numA - numB;
        }),
        erro: encontradas !== totalEsperado ? `Esperadas ${totalEsperado}, encontradas ${encontradas}` : null
    };
}

function sincronizarParcelasGrupo(idGrupo, despesaReferencia) {
    if (!idGrupo || !despesaReferencia || !window.dadosFinanceiros) return false;
    
    const validacao = validarGrupoParcelamento(idGrupo, despesaReferencia);
    
    if (!validacao.valido) {
        return false;
    }
    
    validacao.parcelas.forEach((item, sequencia) => {
        const { despesa } = item;
        const numeroParcelaCorreto = `${sequencia + 1}/${despesaReferencia.totalParcelas}`;
        
        if (despesa.parcela !== numeroParcelaCorreto) {
            despesa.parcela = numeroParcelaCorreto;
            despesa.parcelaAtual = sequencia + 1;
        }
    });
    
    return true;
}

function reindexarParcelasAposExclusao(idGrupo, descricao) {
    if (!idGrupo || !window.dadosFinanceiros) return;
    
    const parcelas = [];
    const anoBase = new Date().getFullYear();
    
    for (let ano = anoBase; ano <= anoBase + 3; ano++) {
        if (!window.dadosFinanceiros[ano]) continue;
        
        for (let mes = 0; mes < 12; mes++) {
            if (!window.dadosFinanceiros[ano].meses?.[mes]?.despesas) continue;
            
            window.dadosFinanceiros[ano].meses[mes].despesas.forEach(despesa => {
                if (despesa.idGrupoParcelamento === idGrupo && 
                    despesa.descricao === descricao) {
                    parcelas.push(despesa);
                }
            });
        }
    }
    
    parcelas.sort((a, b) => {
        const dataA = new Date(a.dataVencimento || a.dataCompra || 0);
        const dataB = new Date(b.dataVencimento || b.dataCompra || 0);
        return dataA - dataB;
    });
    
    parcelas.forEach((parcela, index) => {
        const numeroParcelaCorreto = `${index + 1}/${parcelas.length}`;
        parcela.parcela = numeroParcelaCorreto;
        parcela.parcelaAtual = index + 1;
        parcela.totalParcelas = parcelas.length;
    });
}

function contarParcelasGrupo(idGrupo, descricao) {
    if (!idGrupo || !window.dadosFinanceiros) return 0;
    
    let contador = 0;
    const anoAtual = new Date().getFullYear();
    
    for (let ano = anoAtual; ano <= anoAtual + 3; ano++) {
        if (!window.dadosFinanceiros[ano]) continue;
        
        for (let mes = 0; mes < 12; mes++) {
            if (!window.dadosFinanceiros[ano].meses?.[mes]?.despesas) continue;
            
            contador += window.dadosFinanceiros[ano].meses[mes].despesas.filter(d => 
                d.idGrupoParcelamento === idGrupo && 
                (!descricao || d.descricao === descricao)
            ).length;
        }
    }
    
    return contador;
}

function verificarOrfaosParcelamento() {
    if (!window.dadosFinanceiros) return [];
    
    const grupos = new Map();
    const anoBase = new Date().getFullYear();
    
    for (let ano = anoBase; ano <= anoBase + 3; ano++) {
        if (!window.dadosFinanceiros[ano]) continue;
        
        for (let mes = 0; mes < 12; mes++) {
            if (!window.dadosFinanceiros[ano].meses?.[mes]?.despesas) continue;
            
            window.dadosFinanceiros[ano].meses[mes].despesas.forEach(despesa => {
                if (despesa.idGrupoParcelamento && despesa.parcelado) {
                    const key = `${despesa.idGrupoParcelamento}-${despesa.descricao}`;
                    
                    if (!grupos.has(key)) {
                        grupos.set(key, {
                            idGrupo: despesa.idGrupoParcelamento,
                            descricao: despesa.descricao,
                            totalEsperado: despesa.totalParcelas || 1,
                            parcelas: []
                        });
                    }
                    
                    grupos.get(key).parcelas.push({
                        despesa,
                        mes,
                        ano,
                        parcela: despesa.parcela || '1/1'
                    });
                }
            });
        }
    }
    
    const problemas = [];
    
    grupos.forEach((grupo, key) => {
        if (grupo.parcelas.length !== grupo.totalEsperado) {
            problemas.push({
                idGrupo: grupo.idGrupo,
                descricao: grupo.descricao,
                esperadas: grupo.totalEsperado,
                encontradas: grupo.parcelas.length,
                tipo: grupo.parcelas.length > grupo.totalEsperado ? 'duplicada' : 'faltando'
            });
        }
    });
    
    return problemas;
}

async function excluirTodasParcelas(ano, descricao, categoria, idGrupo) {
    if (!idGrupo || !window.dadosFinanceiros) return false;
    
    try {
        const idsParaExcluir = [];
        
        for (let anoAtual = ano; anoAtual <= ano + 3; anoAtual++) {
            if (!window.dadosFinanceiros[anoAtual]) continue;
            
            for (let mes = 0; mes < 12; mes++) {
                if (!window.dadosFinanceiros[anoAtual].meses?.[mes]?.despesas) continue;
                
                const despesas = window.dadosFinanceiros[anoAtual].meses[mes].despesas;
                
                despesas.forEach(d => {
                    if (d.idGrupoParcelamento === idGrupo && 
                        d.descricao === descricao && 
                        d.categoria === categoria) {
                        
                        idsParaExcluir.push(d.id);
                    }
                });
            }
        }
        
        let sucessos = 0;
        for (const id of idsParaExcluir) {
            if (await excluirDespesaAPI(id)) {
                sucessos++;
            }
        }
        
        return sucessos > 0;
    } catch (error) {
        return false;
    }
}

async function excluirDespesaEmTodosMeses(ano, descricao, categoria) {
    if (!window.dadosFinanceiros?.[ano]) return false;
    
    try {
        const idsParaExcluir = [];
        
        for (let mes = 0; mes < 12; mes++) {
            if (!window.dadosFinanceiros[ano].meses?.[mes]?.despesas) continue;
            
            const despesas = window.dadosFinanceiros[ano].meses[mes].despesas;
            
            despesas.forEach(d => {
                if (d.descricao === descricao && d.categoria === categoria && !d.parcelado) {
                    idsParaExcluir.push(d.id);
                }
            });
        }
        
        let sucessos = 0;
        for (const id of idsParaExcluir) {
            if (await excluirDespesaAPI(id)) {
                sucessos++;
            }
        }
        
        return sucessos > 0;
    } catch (error) {
        return false;
    }
}

async function adicionarNovaDespesa(formData) {
    try {
        const token = getToken();
        if (!token) throw new Error('Usuário não autenticado');
        
        let valorOriginal = formData.valor;
        let valorTotalComJuros = formData.valorPago !== null ? formData.valorPago : valorOriginal;
        let totalJuros = valorTotalComJuros - valorOriginal;
        let valorPorParcela = formData.parcelado ? arredondarParaDuasCasas(valorTotalComJuros / formData.totalParcelas) : valorTotalComJuros;
        
        const dadosAPI = {
            descricao: formData.descricao,
            valor: valorPorParcela,
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
        
        const response = await fetch(`${window.API_URL}/despesas`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dadosAPI)
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Erro ao criar despesa');
        
        if (formData.parcelado && formData.totalParcelas > 1) {
            await criarParcelasFuturas(data.data.id, dadosAPI, formData.totalParcelas);
        }
        
        return true;
        
    } catch (error) {
        return false;
    }
}

async function criarParcelasFuturas(despesaOrigemId, despesaBase, totalParcelas) {
    try {
        const token = getToken();
        if (!token) return false;
        
        const valorPorParcela = parseFloat(despesaBase.valor) / totalParcelas;
        
        await fetch(`${window.API_URL}/despesas/${despesaOrigemId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...despesaBase,
                valor: valorPorParcela,
                descricao: `${despesaBase.descricao} (1/${totalParcelas})`
            })
        });
        
        for (let i = 2; i <= totalParcelas; i++) {
            let proximoMes = despesaBase.mes + (i - 1);
            let proximoAno = despesaBase.ano;
            
            while (proximoMes > 11) {
                proximoMes -= 12;
                proximoAno += 1;
            }
            
            const dataVencimentoBase = new Date(despesaBase.data_vencimento);
            dataVencimentoBase.setMonth(dataVencimentoBase.getMonth() + (i - 1));
            const proximaDataVencimento = dataVencimentoBase.toISOString().split('T')[0];
            
            await fetch(`${window.API_URL}/despesas`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...despesaBase,
                    descricao: `${despesaBase.descricao} (${i}/${totalParcelas})`,
                    valor: valorPorParcela,
                    data_vencimento: proximaDataVencimento,
                    mes: proximoMes,
                    ano: proximoAno
                })
            });
        }
        
        return true;
        
    } catch (error) {
        return false;
    }
}

function toggleCamposPagamentoImediato() {
    const checkbox = document.getElementById('despesa-ja-pago');
    const grupoDataPagamento = document.getElementById('grupo-data-pagamento');
    
    if (checkbox && grupoDataPagamento) {
        if (checkbox.checked) {
            grupoDataPagamento.style.display = 'block';
            const inputData = document.getElementById('despesa-data-pagamento-imediato');
            if (inputData && !inputData.value) {
                inputData.value = new Date().toISOString().split('T')[0];
            }
        } else {
            grupoDataPagamento.style.display = 'none';
        }
    }
}

window.DespesasActions = {
    excluirDespesa,
    moverParaProximoMes,
    abrirModalPagamento,
    processarPagamento,
    pagarDespesasEmLote,
    encontrarDespesaPorIndice,
    criarObjetoDespesa,
    calcularLimiteDisponivelCartao,
    configurarModalPagamentoLote,
    configurarModalValoresPersonalizados,
    processarValoresPersonalizados,
    pagarLoteComValoresOriginais,
    processarPagamentoComData,
    calcularProximoMes,
    obterNomesMeses,
    arredondarParaDuasCasas,
    excluirApenasParcela,
    excluirParcelaEFuturas,
    validarGrupoParcelamento,
    sincronizarParcelasGrupo,
    reindexarParcelasAposExclusao,
    contarParcelasGrupo,
    verificarOrfaosParcelamento,
    excluirTodasParcelas,
    excluirDespesaEmTodosMeses,
    adicionarNovaDespesa,
    criarParcelasFuturas,
    toggleCamposPagamentoImediato
};

console.log('DespesasActions carregado com sucesso');