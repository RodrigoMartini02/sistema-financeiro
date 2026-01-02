// ================================================================
// SISTEMA DE RECEITAS - VERSÃO FUNCIONAL COMPLETA
// ================================================================

let processandoReceita = false;

// ================================================================
// INICIALIZAÇÃO
// ================================================================

async function aguardarSistemaReady() {
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
                resolve(false);
            } else {
                setTimeout(verificar, 100);
            }
        };
        
        verificar();
    });
}

// ================================================================
// RENDERIZAÇÃO
// ================================================================

function renderizarReceitas(receitas, fechado) {
    const listaReceitas = document.getElementById('lista-receitas');
    if (!listaReceitas) return;
   
    listaReceitas.innerHTML = '';
   
    const temSaldoAnteriorReal = Array.isArray(receitas) && 
        receitas.some(receita => receita.saldoAnterior === true);
    
    if (!temSaldoAnteriorReal) {
        const saldoAnterior = obterSaldoAnteriorValido(window.mesAberto, window.anoAberto);
        if (saldoAnterior !== 0) {
            const trSaldo = criarLinhaSaldoAnterior(saldoAnterior, fechado);
            listaReceitas.appendChild(trSaldo);
        }
    }
   
    if (Array.isArray(receitas)) {
        receitas.forEach((receita, index) => {
            const tr = criarLinhaReceita(receita, index, fechado);
            listaReceitas.appendChild(tr);
        });
    }
   
    if (!fechado) {
        configurarEventosReceitas(listaReceitas, window.mesAberto, window.anoAberto);
    }
    
    setTimeout(() => {
        configurarEventosAnexosReceitas(listaReceitas);
        atualizarTodosContadoresAnexosReceitas();
    }, 100);
}


function criarLinhaSaldoAnterior(saldoAnterior, fechado) {
    const template = document.getElementById('template-saldo-anterior-inline') || 
                    document.getElementById('template-linha-saldo-anterior');
    
    if (!template) return document.createElement('tr');
    
    const clone = template.content.cloneNode(true);
    const tr = clone.querySelector('tr');
    
    if (fechado) tr.classList.add('transacao-fechada');
    
    const tipoSaldo = saldoAnterior >= 0 ? 'positivo' : 'negativo';
    const descricaoSaldo = saldoAnterior >= 0 ?
        'Saldo Anterior (Positivo)' :
        'Saldo Anterior (Negativo)';
    
    const spanDesc = clone.querySelector('.saldo-anterior-desc');
    const spanValor = clone.querySelector('.saldo-anterior-valor');
    
    if (spanDesc) {
        spanDesc.textContent = descricaoSaldo;
        spanDesc.classList.add(tipoSaldo);
    }
    
    if (spanValor) {
        spanValor.textContent = window.formatarMoeda(saldoAnterior);
        spanValor.classList.add(tipoSaldo);
    }
    
    return clone;
}

function criarLinhaReceita(receita, index, fechado) {
    const template = document.getElementById('template-linha-receita');
    if (!template) return document.createElement('tr');
    
    const clone = template.content.cloneNode(true);
    const tr = clone.querySelector('tr');
    
    const eSaldoAnterior = receita.saldoAnterior === true || 
                          receita.descricao.includes('Saldo Anterior');
    
    if (eSaldoAnterior) {
        tr.classList.add('saldo-anterior-row');
        preencherLinhaSaldoAnterior(clone, receita);
    } else {
        preencherLinhaReceitaNormal(clone, receita, index, fechado);
    }
    
    if (fechado) tr.classList.add('transacao-fechada');
    
    return clone;
}

function preencherLinhaSaldoAnterior(clone, receita) {
    const tipoSaldo = receita.valor >= 0 ? 'positivo' : 'negativo';
    
    const descricaoEl = clone.querySelector('.receita-descricao');
    const valorEl = clone.querySelector('.receita-valor');
    const dataEl = clone.querySelector('.receita-data');
    const parcelaEl = clone.querySelector('.receita-parcela');
    const acoesEl = clone.querySelector('.receita-acoes');
    
    if (descricaoEl) {
        descricaoEl.textContent = receita.descricao;
        descricaoEl.classList.add('saldo-anterior-desc', tipoSaldo);
    }
    
    if (valorEl) {
        valorEl.textContent = window.formatarMoeda(receita.valor);
        valorEl.classList.add('saldo-anterior-valor', tipoSaldo);
    }
    
    if (dataEl) dataEl.textContent = '-';
    if (parcelaEl) parcelaEl.textContent = '-';
    if (acoesEl) acoesEl.innerHTML = '<span class="badge-saldo-anterior">AUTOMÁTICO</span>';
}

function preencherLinhaReceitaNormal(clone, receita, index, fechado) {
    const descricaoEl = clone.querySelector('.receita-descricao');
    const valorEl = clone.querySelector('.receita-valor');
    const dataEl = clone.querySelector('.receita-data');
    const parcelaEl = clone.querySelector('.receita-parcela');
    
    if (descricaoEl) descricaoEl.textContent = receita.descricao || 'Sem descrição';
    if (valorEl) valorEl.textContent = window.formatarMoeda(receita.valor || 0);
    if (dataEl) dataEl.textContent = window.formatarData(receita.data || new Date());
    if (parcelaEl) parcelaEl.textContent = receita.parcela || '-';
    
    const btnEditar = clone.querySelector('.btn-editar');
    const btnExcluir = clone.querySelector('.btn-excluir');
    
    if (btnEditar) {
        btnEditar.dataset.index = index;
        if (fechado) {
            btnEditar.disabled = true;
            btnEditar.title = 'Mês fechado';
        }
    }
    
    if (btnExcluir) {
        btnExcluir.dataset.index = index;
        if (fechado) {
            btnExcluir.disabled = true;
            btnExcluir.title = 'Mês fechado';
        }
    }
    
    configurarBotaoAnexos(clone, receita, index, fechado);
}

function configurarBotaoAnexos(clone, receita, index, fechado) {
    const btnAnexos = clone.querySelector('.btn-anexos');
    if (!btnAnexos) return;
    
    btnAnexos.dataset.index = index;
    
    const quantidadeAnexos = receita.anexos ? receita.anexos.length : 0;
    const contador = clone.querySelector('.contador-anexos');
    
    if (contador) {
        contador.textContent = quantidadeAnexos;
    }
    
    if (quantidadeAnexos > 0) {
        btnAnexos.classList.add('tem-anexos');
        btnAnexos.title = `${quantidadeAnexos} anexo(s) - Clique para visualizar`;
    } else {
        btnAnexos.classList.remove('tem-anexos');
        btnAnexos.title = 'Sem anexos';
    }
    
    btnAnexos.disabled = false;
}

// ================================================================
// EVENTOS
// ================================================================

function configurarEventosReceitas(container, mes, ano) {
    if (!container) return;
    
    if (container._receitasListener) {
        container.removeEventListener('click', container._receitasListener);
    }
    
    container._receitasListener = (e) => {
        const btn = e.target.closest('.btn');
        if (!btn) return;
        
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        
        if (btn.classList.contains('btn-editar')) {
            editarReceita(index, mes, ano);
        } else if (btn.classList.contains('btn-excluir')) {
            excluirReceita(index, mes, ano);
        } else if (btn.classList.contains('btn-anexos')) {
            if (typeof window.abrirModalVisualizarAnexosReceita === 'function') {
                window.abrirModalVisualizarAnexosReceita(index);
            } else {
                alert('Sistema de visualização de anexos não disponível');
            }
        }
    };
    
    container.addEventListener('click', container._receitasListener);
}

function configurarEventosAnexosReceitas(container) {
    if (!container) return;
    
    if (typeof window.configurarEventosAnexosReceitas === 'function') {
        window.configurarEventosAnexosReceitas(container);
    }
}

// ================================================================
// CÁLCULOS
// ================================================================

function calcularTotalReceitas(receitas) {
    if (!Array.isArray(receitas)) return 0;
    
    return receitas.reduce((total, receita) => {
        if (receita.saldoAnterior === true || 
            receita.descricao?.includes('Saldo Anterior') ||
            receita.automatica === true) {
            return total;
        }
        return total + parseFloat(receita.valor || 0);
    }, 0);
}

function obterSaldoAnteriorValido(mes, ano) {
    let mesAnterior = mes - 1;
    let anoAnterior = ano;
    
    if (mes === 0) {
        mesAnterior = 11;
        anoAnterior = ano - 1;
    }
    
    if (!window.dadosFinanceiros[anoAnterior] || !window.dadosFinanceiros[anoAnterior].meses) {
        return 0;
    }
    
    const dadosMesAnterior = window.dadosFinanceiros[anoAnterior].meses[mesAnterior];
    
    if (dadosMesAnterior && dadosMesAnterior.fechado === true) {
        return dadosMesAnterior.saldoFinal || 0;
    }
    
    return 0;
}

// ================================================================
// MODAL RECEITA - REFATORADO COMPLETAMENTE
// ================================================================

function abrirModalNovaReceita(index, mes, ano) {
    try {
        const mesReceita = mes !== undefined ? mes : window.mesAberto;
        const anoReceita = ano !== undefined ? ano : window.anoAberto;
        
        if (mesReceita === null || anoReceita === null) {
            throw new Error('Mês ou ano não definido');
        }
        
        const modal = document.getElementById('modal-nova-receita');
        const form = document.getElementById('form-nova-receita');
        
        if (!modal || !form) {
            throw new Error('Modal ou formulário não encontrado');
        }
        
        processandoReceita = false;
        
        if (window.sistemaAnexos) {
            window.sistemaAnexos.limparAnexosTemporarios('receita');
        }
        
        const indexValido = typeof index === 'number' && !isNaN(index) && index >= 0;
        const receitas = window.dadosFinanceiros[anoReceita]?.meses[mesReceita]?.receitas;
        const receitaExiste = indexValido && receitas && receitas[index];

        form.reset();
        resetarOpcoesReplicacao();
        
        document.getElementById('receita-mes').value = mesReceita;
        document.getElementById('receita-ano').value = anoReceita;
        
        if (receitaExiste) {
            const receita = receitas[index];
            
            
            if (receita.saldoAnterior === true || receita.descricao?.includes('Saldo Anterior')) {
                alert('Não é possível editar receitas de saldo anterior.');
                return;
            }
            
            document.getElementById('receita-id').value = index;
            document.getElementById('receita-descricao').value = receita.descricao || '';
            document.getElementById('receita-valor').value = receita.valor || '';
            document.getElementById('receita-data').value = receita.data || '';
            
            
            if (window.sistemaAnexos && receita.anexos) {
                window.sistemaAnexos.carregarAnexosExistentes(receita, 'receita');
            }
            
            const titulo = modal.querySelector('.modal-header h2');
            if (titulo) titulo.textContent = 'Editar Receita';
            
        } else {
            
            document.getElementById('receita-id').value = '';
            
            const dataAtual = new Date(anoReceita, mesReceita, new Date().getDate());
            document.getElementById('receita-data').value = dataAtual.toISOString().split('T')[0];
            
            const titulo = modal.querySelector('.modal-header h2');
            if (titulo) titulo.textContent = 'Nova Receita';
        }
        
        configurarOpcoesReplicacao();
        modal.style.display = 'block';
        
        setTimeout(() => {
            document.getElementById('receita-descricao').focus();
        }, 100);
        
    } catch (error) {
        alert("Erro ao abrir modal: " + error.message);
    }
}

function resetarOpcoesReplicacao() {
    const opcoesDetalhes = document.getElementById('opcoes-replicacao-detalhes');
    const selectorContainer = document.getElementById('selector-ate-container');
    const checkboxReplicar = document.getElementById('receita-replicar');
    const radioTodos = document.getElementById('replicar-todos');
    
    if (opcoesDetalhes) opcoesDetalhes.classList.add('hidden');
    if (selectorContainer) selectorContainer.classList.add('hidden');
    if (checkboxReplicar) checkboxReplicar.checked = false;
    if (radioTodos) radioTodos.checked = true;
}

// ================================================================
// SALVAMENTO
// ================================================================

async function salvarReceita(e) {
    if (e && e.preventDefault) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    if (processandoReceita) {
        return false;
    }
    
    if (!window.sistemaInicializado || !window.dadosFinanceiros) {
        alert('Sistema ainda carregando. Aguarde alguns segundos e tente novamente.');
        return false;
    }
    
    processandoReceita = true;
    
    try {
        const formData = coletarDadosFormulario();

        if (!validarDadosFormulario(formData)) {
            processandoReceita = false;
            return false;
        }
        
        const novaReceita = criarObjetoReceita(formData);
        
        const idValue = formData.id;
        const ehEdicao = idValue !== '' && idValue !== null && idValue !== undefined;

        const sucesso = await salvarReceitaLocal(formData.mes, formData.ano, novaReceita, idValue);

        if (sucesso) {
            if (!ehEdicao) {
                const replicar = document.getElementById('receita-replicar');
                if (replicar && replicar.checked) {
                    await processarReplicacao(novaReceita, formData.mes, formData.ano);
                }
            }

            // ✅ FECHAR MODAL
            document.getElementById('modal-nova-receita').style.display = 'none';

            // ✅ EXIBIR MENSAGEM DE SUCESSO
            if (window.mostrarMensagemSucesso) {
                window.mostrarMensagemSucesso(ehEdicao ? 'Receita atualizada com sucesso!' : 'Receita cadastrada com sucesso!');
            }

            // Atualizar interface
            if (typeof window.renderizarDetalhesDoMes === 'function') {
                window.renderizarDetalhesDoMes(formData.mes, formData.ano);
            }

            if (typeof window.carregarDadosDashboard === 'function') {
                await window.carregarDadosDashboard(formData.ano);
            }

        } else {
            if (window.mostrarMensagemErro) {
                window.mostrarMensagemErro('Não foi possível salvar a receita. Tente novamente.');
            } else {
                alert('Não foi possível salvar a receita. Tente novamente.');
            }
        }

        return false;

    } catch (error) {
        if (window.mostrarMensagemErro) {
            window.mostrarMensagemErro('Erro ao salvar receita: ' + error.message);
        } else {
            alert('Erro ao salvar receita: ' + error.message);
        }
        return false;
    } finally {
        processandoReceita = false;
    }
}

function coletarDadosFormulario() {
    const idValue = document.getElementById('receita-id').value;
    
    return {
        id: idValue,
        mes: parseInt(document.getElementById('receita-mes').value),
        ano: parseInt(document.getElementById('receita-ano').value),
        descricao: document.getElementById('receita-descricao').value.trim(),
        valor: parseFloat(document.getElementById('receita-valor').value),
        data: document.getElementById('receita-data').value
    };
}

function validarDadosFormulario(formData) {
    if (!formData.descricao) {
        alert('Por favor, informe a descrição da receita.');
        document.getElementById('receita-descricao').focus();
        return false;
    }
    
    if (isNaN(formData.valor) || formData.valor <= 0) {
        alert('Por favor, informe um valor válido para a receita.');
        document.getElementById('receita-valor').focus();
        return false;
    }

    if (isNaN(formData.mes) || formData.mes < 0 || formData.mes > 11) {
        alert('Mês inválido.');
        return false;
    }

    if (isNaN(formData.ano) || formData.ano < 2020 || formData.ano > 2050) {
        alert('Ano inválido.');
        return false;
    }
    
    return true;
}

function criarObjetoReceita(formData) {
    let anexosReceita = [];
    if (window.sistemaAnexos) {
        try {
            anexosReceita = window.sistemaAnexos.obterAnexosParaSalvar('receita');
            if (!Array.isArray(anexosReceita)) {
                anexosReceita = [];
            }
        } catch (error) {
            anexosReceita = [];
        }
    }
    
    return {
        id: window.gerarId ? window.gerarId() : Date.now().toString(),
        descricao: formData.descricao,
        valor: formData.valor,
        data: formData.data,
        parcelado: false,
        parcela: null,
        saldoAnterior: false,
        anexos: anexosReceita
    };
}

async function salvarReceitaLocal(mes, ano, receita, id) {
    try {
        window.garantirEstruturaDados(ano, mes);

        const ehEdicao = id !== '' && id !== null && id !== undefined;

        if (ehEdicao) {
            const index = parseInt(id);
            window.dadosFinanceiros[ano].meses[mes].receitas[index] = receita;
        } else {
            if (!window.dadosFinanceiros[ano].meses[mes].receitas) {
                window.dadosFinanceiros[ano].meses[mes].receitas = [];
            }
            window.dadosFinanceiros[ano].meses[mes].receitas.push(receita);
        }

        const sucesso = await window.salvarDados();

        if (sucesso) {
            // Registrar log da ação
            if (window.logManager) {
                window.logManager.registrar({
                    modulo: 'Receitas',
                    acao: ehEdicao ? 'Editado' : 'Criado',
                    categoria: '-',
                    descricao: receita.descricao,
                    valor: receita.valor,
                    detalhes: `${ehEdicao ? 'Editou' : 'Criou'} receita em ${mes + 1}/${ano}`
                });
            }

            if (window.sistemaAnexos) {
                window.sistemaAnexos.limparAnexosTemporarios('receita');
            }
        } else {
        }

        return sucesso;

    } catch (error) {
        throw new Error(`Erro ao salvar receita: ${error.message}`);
    }
}

// ================================================================
// REPLICAÇÃO
// ================================================================

async function processarReplicacao(receita, mes, ano) {
    try {
        const tipoReplicacao = document.querySelector('input[name="tipo-replicacao"]:checked')?.value || 'todos';
        const dataReceita = new Date(receita.data);
        const diaReceita = dataReceita.getDate();
        
        if (tipoReplicacao === 'todos') {
            for (let mesProcesando = mes + 1; mesProcesando < 12; mesProcesando++) {
                await replicarParaMes(receita, mesProcesando, ano, diaReceita);
            }
        } else if (tipoReplicacao === 'ate') {
            const mesFinal = parseInt(document.getElementById('replicar-ate-mes').value);
            const anoFinal = parseInt(document.getElementById('replicar-ate-ano').value);
            
            let mesAtual = mes;
            let anoAtual = ano;
            
            while (anoAtual < anoFinal || (anoAtual === anoFinal && mesAtual < mesFinal)) {
                mesAtual++;
                if (mesAtual > 11) {
                    mesAtual = 0;
                    anoAtual++;
                }
                
                if (anoAtual <= anoFinal) {
                    window.garantirEstruturaDados(anoAtual, mesAtual);
                    await replicarParaMes(receita, mesAtual, anoAtual, diaReceita);
                }
            }
        }
        
        await window.salvarDados();
        
    } catch (error) {
    }
}

async function replicarParaMes(receita, mes, ano, dia) {
    try {
        window.garantirEstruturaDados(ano, mes);
        
        const receitaReplicada = { ...receita };
        receitaReplicada.anexos = [];
        
        const novaData = new Date(ano, mes, dia);
        
        if (novaData.getMonth() !== mes) {
            const ultimoDia = new Date(ano, mes + 1, 0).getDate();
            novaData.setDate(ultimoDia);
        }
        
        receitaReplicada.data = novaData.toISOString().split('T')[0];
        receitaReplicada.id = window.gerarId ? window.gerarId() : Date.now().toString();
        
        window.dadosFinanceiros[ano].meses[mes].receitas.push(receitaReplicada);
        
    } catch (error) {
    }
}

// ================================================================
// EDITAR E EXCLUIR
// ================================================================

function editarReceita(index, mes, ano) {
    if (window.dadosFinanceiros[ano]?.meses[mes]?.receitas[index]) {
        const receita = window.dadosFinanceiros[ano].meses[mes].receitas[index];

        if (receita.saldoAnterior === true || receita.descricao?.includes('Saldo Anterior')) {
            alert('Não é possível editar receitas de saldo anterior. Estas são geradas automaticamente.');
            return;
        }
    } else {
        alert('Receita não encontrada!');
        return;
    }
    
    abrirModalNovaReceita(index, mes, ano);
}

function excluirReceita(index, mes, ano) {
    try {
        if (!window.dadosFinanceiros[ano]?.meses[mes]?.receitas[index]) {
            alert('Receita não encontrada!');
            return;
        }
        
        const receita = window.dadosFinanceiros[ano].meses[mes].receitas[index];
        
        if (receita.saldoAnterior === true || receita.descricao.includes('Saldo Anterior')) {
            alert('Não é possível excluir receitas de saldo anterior. Estas são geradas automaticamente.');
            return;
        }
        
        const descricaoReceita = receita.descricao;
        
        window.dadosExclusao = {
            index: index,
            mes: mes,
            ano: ano,
            descricao: descricaoReceita
        };
        
        const modal = document.getElementById('modal-exclusao-receita');
        const titulo = modal.querySelector('h3');
        const mensagem = modal.querySelector('p');
        
        if (titulo) titulo.textContent = 'Excluir receita';
        if (mensagem) mensagem.textContent = `Deseja excluir a receita "${descricaoReceita}"?`;
        
        modal.style.display = 'block';
        
    } catch (error) {
        alert("Erro ao excluir receita: " + error.message);
    }
}

async function processarExclusaoReceita(opcao, index, mes, ano, descricaoReceita) {
    try {
        const sucesso = await excluirReceitaLocal(opcao, index, mes, ano, descricaoReceita);

        if (sucesso) {
            if (typeof window.renderizarDetalhesDoMes === 'function') {
                window.renderizarDetalhesDoMes(mes, ano);
            }
            
            if (typeof window.carregarDadosDashboard === 'function') {
                await window.carregarDadosDashboard(window.anoAtual);
            }
        } else {
            throw new Error('Falha ao excluir receita');
        }
        
    } catch (error) {
        alert("Erro ao processar exclusão: " + error.message);
    }
}

async function excluirReceitaLocal(opcao, index, mes, ano, descricaoReceita) {
    try {
        let valorExcluido = 0;

        if (opcao === 'atual') {
            const receita = window.dadosFinanceiros[ano]?.meses[mes]?.receitas[index];

            if (!receita || !receita.id) {
                throw new Error('Receita não encontrada');
            }

            valorExcluido = receita.valor;

            const response = await fetch(`${API_URL}/receitas/${receita.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Erro ao excluir receita');
            }

            // Registrar log da exclusão
            if (window.logManager) {
                window.logManager.registrar({
                    modulo: 'Receitas',
                    acao: 'Excluído',
                    categoria: '-',
                    descricao: descricaoReceita,
                    valor: valorExcluido,
                    detalhes: `Excluiu receita de ${mes + 1}/${ano}`
                });
            }

        } else if (opcao === 'todas') {
            // Buscar todas as receitas com essa descrição e excluir
            const response = await fetch(`${API_URL}/receitas?ano=${ano}`, {
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                }
            });

            const data = await response.json();

            if (response.ok && data.data) {
                const receitasParaExcluir = data.data.filter(r =>
                    r.descricao === descricaoReceita && !r.saldo_anterior
                );

                for (const receita of receitasParaExcluir) {
                    await fetch(`${API_URL}/receitas/${receita.id}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${getToken()}`
                        }
                    });
                }

                // Registrar log da exclusão em lote
                if (window.logManager && receitasParaExcluir.length > 0) {
                    window.logManager.registrar({
                        modulo: 'Receitas',
                        acao: 'Excluído',
                        categoria: '-',
                        descricao: descricaoReceita,
                        valor: receitasParaExcluir.reduce((sum, r) => sum + parseFloat(r.valor || 0), 0),
                        detalhes: `Excluiu ${receitasParaExcluir.length} receita(s) com a mesma descrição`
                    });
                }
            }
        }

        return true;

    } catch (error) {
        return false;
    }
}


// ================================================================
// OPÇÕES DE REPLICAÇÃO
// ================================================================

function configurarOpcoesReplicacao() {
    const anoSelect = document.getElementById('replicar-ate-ano');
    if (anoSelect && anoSelect.children.length === 0) {
        const anoAtual = window.anoAberto || new Date().getFullYear();
        for (let i = 0; i <= 5; i++) {
            const ano = anoAtual + i;
            const option = document.createElement('option');
            option.value = ano;
            option.textContent = ano;
            if (i === 0) option.selected = true;
            anoSelect.appendChild(option);
        }
    }
    
    const mesSelect = document.getElementById('replicar-ate-mes');
    if (mesSelect) {
        mesSelect.value = '11';
    }
}

// ================================================================
// CONTADORES DE ANEXOS
// ================================================================

function atualizarContadorAnexosReceita(index, quantidade) {
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

function atualizarTodosContadoresAnexosReceitas() {
    if (!window.dadosFinanceiros || window.mesAberto === null || window.anoAberto === null) {
        return;
    }
    
    const dadosMes = window.dadosFinanceiros[window.anoAberto]?.meses[window.mesAberto];
    if (!dadosMes || !dadosMes.receitas) return;
    
    dadosMes.receitas.forEach((receita, index) => {
        if (!receita.saldoAnterior) {
            const quantidade = receita.anexos ? receita.anexos.length : 0;
            atualizarContadorAnexosReceita(index, quantidade);
        }
    });
}

// ================================================================
// FUNÇÕES GLOBAIS DE EXCLUSÃO
// ================================================================

window.excluirAtual = function() {
    if (window.dadosExclusao) {
        const modal = document.getElementById('modal-exclusao-receita');
        modal.style.display = 'none';
        processarExclusaoReceita('atual', window.dadosExclusao.index, window.dadosExclusao.mes, window.dadosExclusao.ano, window.dadosExclusao.descricao);
    }
};

window.excluirTodas = function() {
    if (window.dadosExclusao) {
        const modal = document.getElementById('modal-exclusao-receita');
        modal.style.display = 'none';
        processarExclusaoReceita('todas', window.dadosExclusao.index, window.dadosExclusao.mes, window.dadosExclusao.ano, window.dadosExclusao.descricao);
    }
};

// ================================================================
// INICIALIZAÇÃO DE EVENT LISTENERS
// ================================================================

document.addEventListener('DOMContentLoaded', async function() {
    const sistemaReady = await aguardarSistemaReady();
    if (!sistemaReady) return;
    
    setTimeout(() => {
        inicializarEventListeners();
    }, 100);
});

function inicializarEventListeners() {
    const form = document.getElementById('form-nova-receita');
    if (form) {
        form.addEventListener('submit', salvarReceita);
    }
    
    const btnNovaReceita = document.getElementById('btn-nova-receita');
    if (btnNovaReceita) {
        btnNovaReceita.addEventListener('click', () => abrirModalNovaReceita());
    }
    
    configurarEventListenersAnexos();
    configurarEventListenersReplicacao();
    configurarEventListenersModais();
}

function configurarEventListenersAnexos() {
    const btnAnexarReceita = document.getElementById('btn-anexar-receita');
    if (btnAnexarReceita) {
        btnAnexarReceita.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.sistemaAnexos) {
                window.sistemaAnexos.abrirSeletorArquivos('receita');
            } else {
                alert('Sistema de anexos não disponível');
            }
        });
    }
}

function configurarEventListenersReplicacao() {
    const checkboxReplicar = document.getElementById('receita-replicar');
    if (checkboxReplicar) {
        checkboxReplicar.addEventListener('change', function() {
            const opcoes = document.getElementById('opcoes-replicacao-detalhes');
            if (this.checked) {
                opcoes.classList.remove('hidden');
            } else {
                opcoes.classList.add('hidden');
            }
        });
    }

    document.querySelectorAll('input[name="tipo-replicacao"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const selectorContainer = document.getElementById('selector-ate-container');
            if (this.value === 'ate') {
                selectorContainer.classList.remove('hidden');
            } else {
                selectorContainer.classList.add('hidden');
            }
        });
    });
}

function configurarEventListenersModais() {
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    window.addEventListener('click', function(event) {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    });
}


// ================================================================
// EXPORTAR FUNÇÕES GLOBAIS
// ================================================================

window.abrirModalNovaReceita = abrirModalNovaReceita;
window.editarReceita = editarReceita;
window.excluirReceita = excluirReceita;
window.processarExclusaoReceita = processarExclusaoReceita;
window.salvarReceita = salvarReceita;
window.renderizarReceitas = renderizarReceitas;
window.calcularTotalReceitas = calcularTotalReceitas;
window.atualizarContadorAnexosReceita = atualizarContadorAnexosReceita;
window.atualizarTodosContadoresAnexosReceitas = atualizarTodosContadoresAnexosReceitas;


// ================================================================
// SISTEMA DE RESERVAS INTEGRADO
// ================================================================

/**
 * Atualiza o card de reservas integrado na aba Receitas
 */
function atualizarCardReservasIntegrado() {
    const mes = window.mesAberto;
    const ano = window.anoAberto;

    if (mes === null || ano === null) return;

    window.garantirEstruturaDados(ano, mes);
    const dadosMes = window.dadosFinanceiros[ano]?.meses[mes];
    if (!dadosMes) return;

    // Calcular valores
    const saldoInfo = window.calcularSaldoMes(mes, ano);
    const totalDisponivel = saldoInfo.saldoAnterior + saldoInfo.receitas;
    const totalDespesas = saldoInfo.despesas;
    const saldoLivre = totalDisponivel - totalDespesas;

    // Calcular total acumulado de reservas (todos os meses/anos)
    let totalAcumulado = 0;
    for (const anoKey in window.dadosFinanceiros) {
        if (anoKey === 'versao') continue;
        const dadosAno = window.dadosFinanceiros[anoKey];
        if (!dadosAno.meses) continue;

        for (let m = 0; m < 12; m++) {
            const reservas = dadosAno.meses[m]?.reservas || [];
            totalAcumulado += reservas.reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
        }
    }

    const disponivelParaReservar = Math.max(0, saldoLivre - totalAcumulado);

    // Atualizar elementos do DOM
    const elemDisponivel = document.getElementById('reservas-disponivel-mini');
    const elemReservado = document.getElementById('reservas-reservado-mini');

    if (elemDisponivel) {
        elemDisponivel.textContent = window.formatarMoeda(disponivelParaReservar);
        elemDisponivel.className = disponivelParaReservar >= 0 ? 'valor saldo-positivo' : 'valor saldo-negativo';
    }

    if (elemReservado) {
        elemReservado.textContent = window.formatarMoeda(totalAcumulado);
    }

    // Renderizar últimas 5 reservas
    renderizarUltimasReservas(mes, ano);
}

/**
 * Renderiza as últimas 5 reservas de todos os meses
 */
function renderizarUltimasReservas(mes, ano) {
    const lista = document.getElementById('ultimas-reservas-mini');
    if (!lista) return;

    // Coletar todas as reservas de todos os meses
    const todasReservas = [];

    for (const anoKey in window.dadosFinanceiros) {
        if (anoKey === 'versao') continue;
        const dadosAno = window.dadosFinanceiros[anoKey];
        if (!dadosAno.meses) continue;

        for (let m = 0; m < 12; m++) {
            const reservas = dadosAno.meses[m]?.reservas || [];
            reservas.forEach(reserva => {
                todasReservas.push({
                    ...reserva,
                    mes: m,
                    ano: parseInt(anoKey)
                });
            });
        }
    }

    // Ordenar por data (mais recentes primeiro)
    todasReservas.sort((a, b) => new Date(b.data) - new Date(a.data));

    // Pegar apenas as 5 mais recentes
    const ultimas5 = todasReservas.slice(0, 5);

    lista.innerHTML = '';

    if (ultimas5.length === 0) {
        lista.innerHTML = '<div class="reservas-vazio">Nenhuma reserva ainda</div>';
        return;
    }

    const template = document.getElementById('template-reserva-mini');
    if (!template) return;

    ultimas5.forEach((reserva, index) => {
        const clone = template.content.cloneNode(true);

        const descricao = reserva.descricao || 'Reserva';
        clone.querySelector('.reserva-descricao').textContent = descricao;
        clone.querySelector('.reserva-data-mini').textContent = window.formatarData(reserva.data);
        clone.querySelector('.reserva-valor-mini').textContent = window.formatarMoeda(reserva.valor);

        const btnRemover = clone.querySelector('.btn-remover-reserva-mini');
        btnRemover.addEventListener('click', () => removerReservaIntegrada(reserva.mes, reserva.ano, reserva.id));

        lista.appendChild(clone);
    });
}

/**
 * Abre o modal para reservar valor
 */
function abrirModalReservarValor() {
    const mes = window.mesAberto;
    const ano = window.anoAberto;

    if (mes === null || ano === null) {
        alert('Selecione um mês primeiro');
        return;
    }

    // Calcular disponível
    const saldoInfo = window.calcularSaldoMes(mes, ano);
    const totalDisponivel = saldoInfo.saldoAnterior + saldoInfo.receitas;
    const totalDespesas = saldoInfo.despesas;
    const saldoLivre = totalDisponivel - totalDespesas;

    let totalAcumulado = 0;
    for (const anoKey in window.dadosFinanceiros) {
        if (anoKey === 'versao') continue;
        const dadosAno = window.dadosFinanceiros[anoKey];
        if (!dadosAno.meses) continue;

        for (let m = 0; m < 12; m++) {
            const reservas = dadosAno.meses[m]?.reservas || [];
            totalAcumulado += reservas.reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
        }
    }

    const disponivelParaReservar = Math.max(0, saldoLivre - totalAcumulado);

    // Atualizar modal
    const modalDisponivel = document.getElementById('modal-disponivel-info');
    if (modalDisponivel) {
        modalDisponivel.textContent = window.formatarMoeda(disponivelParaReservar);
    }

    const inputValor = document.getElementById('input-valor-reserva');
    if (inputValor) {
        inputValor.max = disponivelParaReservar.toFixed(2);
        inputValor.value = '';
    }

    const inputDescricao = document.getElementById('input-descricao-reserva');
    if (inputDescricao) {
        inputDescricao.value = '';
    }

    // Abrir modal
    const modal = document.getElementById('modal-reservar-valor');
    if (modal) {
        modal.style.display = 'block';
    }
}

/**
 * Processa o formulário de reservar valor
 */
async function processarReservarValor(e) {
    e.preventDefault();

    const mes = window.mesAberto;
    const ano = window.anoAberto;
    const valor = parseFloat(document.getElementById('input-valor-reserva').value);
    const descricao = document.getElementById('input-descricao-reserva').value.trim() || 'Reserva';

    if (isNaN(valor) || valor <= 0) {
        alert('Informe um valor válido');
        return;
    }

    window.garantirEstruturaDados(ano, mes);
    const dadosMes = window.dadosFinanceiros[ano].meses[mes];

    const novaReserva = {
        id: window.gerarId(),
        valor: valor,
        descricao: descricao,
        data: new Date().toISOString().split('T')[0]
    };

    if (!dadosMes.reservas) dadosMes.reservas = [];
    dadosMes.reservas.push(novaReserva);

    await window.salvarDados();

    // Fechar modal
    document.getElementById('modal-reservar-valor').style.display = 'none';

    // Atualizar interface
    atualizarCardReservasIntegrado();

    if (typeof window.renderizarDetalhesDoMes === 'function') {
        window.renderizarDetalhesDoMes(mes, ano);
    }

    if (typeof window.carregarDadosDashboard === 'function') {
        await window.carregarDadosDashboard(ano);
    }

    if (window.mostrarMensagemSucesso) {
        window.mostrarMensagemSucesso('Reserva criada com sucesso!');
    }
}

/**
 * Remove uma reserva
 */
async function removerReservaIntegrada(mes, ano, reservaId) {
    const reservas = window.dadosFinanceiros[ano]?.meses[mes]?.reservas;
    if (!reservas) return;

    const index = reservas.findIndex(r => r.id === reservaId);
    if (index === -1) return;

    const valor = reservas[index].valor;
    if (!confirm(`Remover reserva de ${window.formatarMoeda(valor)}?`)) return;

    reservas.splice(index, 1);
    await window.salvarDados();

    // Atualizar interface
    atualizarCardReservasIntegrado();

    if (typeof window.renderizarDetalhesDoMes === 'function') {
        window.renderizarDetalhesDoMes(window.mesAberto, window.anoAberto);
    }

    if (typeof window.carregarDadosDashboard === 'function') {
        await window.carregarDadosDashboard(window.anoAberto);
    }

    if (window.mostrarMensagemSucesso) {
        window.mostrarMensagemSucesso('Reserva removida com sucesso!');
    }
}

/**
 * Inicializa eventos das reservas integradas
 */
function inicializarEventosReservasIntegradas() {
    // Botão "Reservar Valor"
    const btnReservar = document.getElementById('btn-reservar-valor');
    if (btnReservar) {
        btnReservar.addEventListener('click', abrirModalReservarValor);
    }

    // Formulário de reservar
    const formReservar = document.getElementById('form-reservar-valor');
    if (formReservar) {
        formReservar.addEventListener('submit', processarReservarValor);
    }

    // Botão cancelar do modal
    const btnCancelar = document.querySelector('#modal-reservar-valor .btn-cancelar-modal');
    if (btnCancelar) {
        btnCancelar.addEventListener('click', () => {
            document.getElementById('modal-reservar-valor').style.display = 'none';
        });
    }

}

// Aguardar DOM e inicializar
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        inicializarEventosReservasIntegradas();
    }, 300);
});

// Exportar funções
window.atualizarCardReservasIntegrado = atualizarCardReservasIntegrado;
window.abrirModalReservarValor = abrirModalReservarValor;
window.removerReservaIntegrada = removerReservaIntegrada;