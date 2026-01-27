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

    // Atualizar saldo anterior na barra de ações
    const saldoAnteriorInfo = document.getElementById('saldo-anterior-info');
    const saldoAnteriorValor = document.getElementById('saldo-anterior-valor');
    const saldoAnteriorSeparator = document.getElementById('saldo-anterior-separator');

    const temSaldoAnteriorReal = Array.isArray(receitas) &&
        receitas.some(receita => receita.saldoAnterior === true);

    if (!temSaldoAnteriorReal) {
        const saldoAnterior = obterSaldoAnteriorValido(window.mesAberto, window.anoAberto);
        if (saldoAnterior !== 0 && saldoAnteriorInfo && saldoAnteriorValor) {
            saldoAnteriorValor.textContent = window.formatarMoeda(saldoAnterior);
            saldoAnteriorValor.className = 'reservas-valor ' + (saldoAnterior >= 0 ? 'positivo' : 'negativo');
            saldoAnteriorInfo.style.display = 'inline';
            if (saldoAnteriorSeparator) saldoAnteriorSeparator.style.display = 'inline';
        } else {
            if (saldoAnteriorInfo) saldoAnteriorInfo.style.display = 'none';
            if (saldoAnteriorSeparator) saldoAnteriorSeparator.style.display = 'none';
        }
    } else {
        if (saldoAnteriorInfo) saldoAnteriorInfo.style.display = 'none';
        if (saldoAnteriorSeparator) saldoAnteriorSeparator.style.display = 'none';
    }

    // Renderizar receitas (sem saldo anterior na tabela)
    if (Array.isArray(receitas)) {
        receitas.forEach((receita, index) => {
            // Ignorar saldoAnterior dentro da tabela
            if (receita.saldoAnterior === true || receita.descricao.includes('Saldo Anterior')) {
                return;
            }
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

    if (!template) return document.createElement('div');

    const clone = template.content.cloneNode(true);
    const row = clone.querySelector('tr');

    if (row && fechado) row.classList.add('transacao-fechada');
    
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
    if (!template) {
        console.error('❌ Template não encontrado');
        return document.createElement('div');
    }

    const clone = template.content.cloneNode(true);
    const row = clone.querySelector('tr.receita-row');

    if (!row) {
        console.error('❌ Erro: template tr.receita-row não encontrado');
        return document.createElement('tr');
    }

    const eSaldoAnterior = receita.saldoAnterior === true ||
                          receita.descricao.includes('Saldo Anterior');

    if (eSaldoAnterior) {
        row.classList.add('saldo-anterior-row');
        preencherLinhaSaldoAnterior(clone, receita);
    } else {
        preencherLinhaReceitaNormal(clone, receita, index, fechado);
    }

    if (fechado) row.classList.add('transacao-fechada');

    return clone;
}

function preencherLinhaSaldoAnterior(clone, receita) {
    const tipoSaldo = receita.valor >= 0 ? 'positivo' : 'negativo';

    // Usar seletores .col-* para grid
    const idEl = clone.querySelector('.col-id');
    const descricaoEl = clone.querySelector('.col-descricao');
    const valorEl = clone.querySelector('.col-valor');
    const dataEl = clone.querySelector('.col-data');
    const parcelaEl = clone.querySelector('.col-parcela');
    const acoesEl = clone.querySelector('.col-acoes');
    const anexosEl = clone.querySelector('.col-anexos');

    if (idEl) idEl.textContent = '-';

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
    if (anexosEl) anexosEl.textContent = '-';
    if (acoesEl) acoesEl.innerHTML = '<span class="badge-saldo-anterior">AUTOMÁTICO</span>';
}

function preencherLinhaReceitaNormal(clone, receita, index, fechado) {
    // Usar seletores .col-* para grid
    const idEl = clone.querySelector('.col-id');
    const descricaoEl = clone.querySelector('.col-descricao');
    const valorEl = clone.querySelector('.col-valor');
    const dataEl = clone.querySelector('.col-data');
    const parcelaEl = clone.querySelector('.col-parcela');

    if (idEl) idEl.textContent = receita.id || '-';
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

    // Remover listener anterior para evitar duplicação
    if (container._anexosReceitaListener) {
        container.removeEventListener('click', container._anexosReceitaListener);
    }

    // Criar listener para botões de anexos
    container._anexosReceitaListener = (e) => {
        const btnAnexos = e.target.closest('.btn-anexos');
        if (!btnAnexos) return;

        e.preventDefault();
        e.stopPropagation();

        const index = parseInt(btnAnexos.dataset.index);
        if (isNaN(index)) return;

        if (typeof window.abrirModalVisualizarAnexosReceita === 'function') {
            window.abrirModalVisualizarAnexosReceita(index);
        }
    };

    container.addEventListener('click', container._anexosReceitaListener);
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
            // Usar formato local para evitar problema de timezone
            const dataFormatada = window.dataParaISO ? window.dataParaISO(dataAtual) :
                `${dataAtual.getFullYear()}-${String(dataAtual.getMonth() + 1).padStart(2, '0')}-${String(dataAtual.getDate()).padStart(2, '0')}`;
            document.getElementById('receita-data').value = dataFormatada;
            
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

    // ✅ CORRIGIDO: Não gera mais ID temporário
    // O ID será atribuído pelo backend após o POST
    return {
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
        const ehEdicao = id !== '' && id !== null && id !== undefined;

        // ✅ PRODUÇÃO: Usar API de receitas via usuarioDataManager
        if (window.usuarioDataManager && typeof window.usuarioDataManager.salvarReceita === 'function') {
            console.log('💾 Salvando receita via API:', { mes, ano, receita, id });

            const sucesso = await window.usuarioDataManager.salvarReceita(mes, ano, receita, id);

            if (sucesso) {
                // ✅ CORRIGIDO: Recarregar dados do backend para obter o ID real
                console.log('🔄 Recarregando receitas do backend...');

                if (typeof window.buscarReceitasAPI === 'function') {
                    const receitasAtualizadas = await window.buscarReceitasAPI(mes, ano);
                    if (receitasAtualizadas) {
                        window.garantirEstruturaDados(ano, mes);
                        window.dadosFinanceiros[ano].meses[mes].receitas = receitasAtualizadas;
                        console.log('✅ Receitas atualizadas com IDs reais do backend');
                    }
                }

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
            }

            return sucesso;
        }

        // ❌ FALLBACK: Salvamento antigo (localStorage) se API não disponível
        console.warn('⚠️ usuarioDataManager não disponível, usando fallback localStorage');
        window.garantirEstruturaDados(ano, mes);

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
        }

        return sucesso;

    } catch (error) {
        console.error('❌ Erro ao salvar receita:', error);
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
                    await replicarParaMes(receita, mesAtual, anoAtual, diaReceita);
                }
            }
        }

        // ✅ CORRIGIDO: Não precisa mais salvar dados locais, cada replicação já salva via API

    } catch (error) {
        console.error('❌ Erro no processamento de replicação:', error);
    }
}

async function replicarParaMes(receita, mes, ano, dia) {
    try {
        const novaData = new Date(ano, mes, dia);

        if (novaData.getMonth() !== mes) {
            const ultimoDia = new Date(ano, mes + 1, 0).getDate();
            novaData.setDate(ultimoDia);
        }

        // ✅ CORRIGIDO: Criar receita replicada SEM ID (será gerado pelo backend)
        // Usar formato local para evitar problema de timezone
        const dataFormatada = window.dataParaISO ? window.dataParaISO(novaData) :
            `${novaData.getFullYear()}-${String(novaData.getMonth() + 1).padStart(2, '0')}-${String(novaData.getDate()).padStart(2, '0')}`;

        const receitaReplicada = {
            descricao: receita.descricao,
            valor: receita.valor,
            data: dataFormatada,
            parcelado: false,
            parcela: null,
            saldoAnterior: false,
            anexos: [] // Replicações não copiam anexos
        };

        // Salvar via API para obter ID real do backend
        if (window.usuarioDataManager && typeof window.usuarioDataManager.salvarReceita === 'function') {
            await window.usuarioDataManager.salvarReceita(mes, ano, receitaReplicada, null);
            console.log(`✅ Receita replicada para ${mes + 1}/${ano}`);
        }

    } catch (error) {
        console.error('❌ Erro ao replicar receita:', error);
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
            // Recarregar dados da API
            if (typeof window.buscarReceitasAPI === 'function') {
                const receitasAtualizadas = await window.buscarReceitasAPI(mes, ano);
                if (window.dadosFinanceiros[ano]?.meses[mes]) {
                    window.dadosFinanceiros[ano].meses[mes].receitas = receitasAtualizadas;
                }
            }

            // Renderizar interface
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

            if (!receita) {
                console.error('❌ Receita não encontrada:', { ano, mes, index });
                throw new Error('Receita não encontrada');
            }

            // ✅ CORRIGIDO: Validação simplificada - agora sempre temos IDs reais do backend
            if (!receita.id) {
                console.error('❌ Receita sem ID:', receita);
                alert('Erro: Receita sem identificador. Por favor, recarregue a página.');
                return false;
            }

            valorExcluido = receita.valor;

            console.log('🗑️ Excluindo receita:', { id: receita.id, descricao: receita.descricao });

            const response = await fetch(`${API_URL}/receitas/${receita.id}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Erro do servidor:', response.status, errorText);
                throw new Error(`Erro ao excluir receita: ${response.status}`);
            }

            const data = await response.json();

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

                const mesesAfetados = new Set();

                for (const receita of receitasParaExcluir) {
                    await fetch(`${API_URL}/receitas/${receita.id}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${getToken()}`
                        }
                    });
                    mesesAfetados.add(receita.mes);
                }

                // Recarregar dados de todos os meses afetados
                if (typeof window.buscarReceitasAPI === 'function') {
                    for (const mesAfetado of mesesAfetados) {
                        const receitasAtualizadas = await window.buscarReceitasAPI(mesAfetado, ano);
                        if (window.dadosFinanceiros[ano]?.meses[mesAfetado]) {
                            window.dadosFinanceiros[ano].meses[mesAfetado].receitas = receitasAtualizadas;
                        }
                    }
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

    // Configurar botões do modal de exclusão
    const btnExcluirAtual = document.getElementById('btn-excluir-atual');
    if (btnExcluirAtual) {
        btnExcluirAtual.addEventListener('click', window.excluirAtual);
    }

    const btnExcluirTodas = document.getElementById('btn-excluir-todas');
    if (btnExcluirTodas) {
        btnExcluirTodas.addEventListener('click', window.excluirTodas);
    }
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
// SISTEMA DE RESERVAS INTEGRADO COM API
// ================================================================

const API_URL_RESERVAS = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

// Cache local de reservas
window.reservasCache = [];

/**
 * Carrega reservas do backend
 */
async function carregarReservasAPI() {
    try {
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        if (!token) return [];

        const response = await fetch(`${API_URL_RESERVAS}/reservas`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            window.reservasCache = data.data || [];
            return window.reservasCache;
        }
        return [];
    } catch (error) {
        console.error('Erro ao carregar reservas:', error);
        return [];
    }
}

/**
 * Calcula total de reservas até o mês/ano especificado
 * @param {number} mesLimite - Mês limite (0-11), se não informado usa o mês atual aberto
 * @param {number} anoLimite - Ano limite, se não informado usa o ano atual aberto
 */
function calcularTotalReservas(mesLimite, anoLimite) {
    const mes = mesLimite !== undefined ? mesLimite : window.mesAberto;
    const ano = anoLimite !== undefined ? anoLimite : window.anoAberto;

    return window.reservasCache
        .filter(r => {
            const reservaAno = parseInt(r.ano);
            const reservaMes = parseInt(r.mes);
            // Inclui reservas de anos anteriores
            if (reservaAno < ano) return true;
            // Inclui reservas do mesmo ano até o mês atual
            if (reservaAno === ano && reservaMes <= mes) return true;
            return false;
        })
        .reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
}

/**
 * Atualiza o card de reservas integrado na aba Receitas
 */
async function atualizarCardReservasIntegrado() {
    const mes = window.mesAberto;
    const ano = window.anoAberto;

    if (mes === null || ano === null) return;

    // Carregar reservas do backend
    await carregarReservasAPI();

    // Calcular valores
    const saldoInfo = window.calcularSaldoMes ? window.calcularSaldoMes(mes, ano) : { saldoAnterior: 0, receitas: 0, despesas: 0, reservas: 0 };
    const totalReservado = calcularTotalReservas();

    // Saldo Atual = saldo anterior + receitas - despesas - reservas (o que realmente tem para gastar)
    const saldoAtual = saldoInfo.saldoAnterior + saldoInfo.receitas - saldoInfo.despesas - totalReservado;

    // Atualizar elementos do DOM (card mini)
    const elemDisponivel = document.getElementById('reservas-disponivel-mini');
    const elemReservado = document.getElementById('reservas-reservado-mini');

    if (elemDisponivel) {
        elemDisponivel.textContent = window.formatarMoeda(saldoAtual);
        elemDisponivel.className = saldoAtual >= 0 ? 'valor saldo-positivo' : 'valor saldo-negativo';
    }

    if (elemReservado) {
        elemReservado.textContent = window.formatarMoeda(totalReservado);
    }

    // Renderizar últimas reservas no card mini
    renderizarUltimasReservas();
}

/**
 * Renderiza as últimas reservas no card mini
 */
function renderizarUltimasReservas() {
    const lista = document.getElementById('ultimas-reservas-mini');
    if (!lista) return;

    const ultimas5 = [...window.reservasCache]
        .sort((a, b) => new Date(b.data) - new Date(a.data))
        .slice(0, 5);

    lista.innerHTML = '';

    if (ultimas5.length === 0) {
        lista.innerHTML = '<div class="reservas-vazio">Nenhuma reserva ainda</div>';
        return;
    }

    const template = document.getElementById('template-reserva-mini');
    if (!template) return;

    ultimas5.forEach(reserva => {
        const clone = template.content.cloneNode(true);
        clone.querySelector('.reserva-descricao').textContent = reserva.observacoes || 'Reserva';
        clone.querySelector('.reserva-data-mini').textContent = window.formatarData(reserva.data);
        clone.querySelector('.reserva-valor-mini').textContent = window.formatarMoeda(reserva.valor);

        const btnRemover = clone.querySelector('.btn-remover-reserva-mini');
        if (btnRemover) {
            btnRemover.addEventListener('click', () => excluirReserva(reserva.id));
        }

        lista.appendChild(clone);
    });
}

/**
 * Abre o modal para gerenciar reservas
 */
async function abrirModalReservarValor() {
    const mes = window.mesAberto;
    const ano = window.anoAberto;

    if (mes === null || ano === null) {
        alert('Selecione um mês primeiro');
        return;
    }

    // Carregar reservas do backend
    await carregarReservasAPI();

    // Calcular saldo atual (já descontando reservas)
    const saldoInfo = window.calcularSaldoMes ? window.calcularSaldoMes(mes, ano) : { saldoAnterior: 0, receitas: 0, despesas: 0, reservas: 0 };
    const totalReservado = calcularTotalReservas();

    // Saldo Atual = saldo anterior + receitas - despesas - reservas
    const saldoAtual = saldoInfo.saldoAnterior + saldoInfo.receitas - saldoInfo.despesas - totalReservado;

    // Atualizar totalizadores do modal
    const elemTotal = document.getElementById('total-reservado');
    if (elemTotal) {
        elemTotal.textContent = window.formatarMoeda(totalReservado);
    }

    const elemDisponivel = document.getElementById('disponivel-reservar');
    if (elemDisponivel) {
        elemDisponivel.textContent = window.formatarMoeda(saldoAtual);
    }

    // Limpar campos do formulário
    const inputValor = document.getElementById('input-valor-reserva');
    const inputDescricao = document.getElementById('input-descricao-reserva');
    if (inputValor) inputValor.value = '';
    if (inputDescricao) inputDescricao.value = '';

    // Renderizar lista de reservas no modal
    renderizarListaReservasModal();

    // Abrir modal
    const modal = document.getElementById('modal-reservar-valor');
    if (modal) {
        modal.style.display = 'flex';
    }
}

/**
 * Renderiza lista de reservas simplificada
 */
async function renderizarListaReservasModal() {
    const lista = document.getElementById('lista-reservas');
    if (!lista) return;

    lista.innerHTML = '';

    if (window.reservasCache.length === 0) {
        lista.innerHTML = '<div class="reserva-vazia">Nenhuma reserva cadastrada</div>';
        await renderizarHistoricoGeral();
        return;
    }

    // Ordenar por nome
    const reservasOrdenadas = [...window.reservasCache].sort((a, b) =>
        (a.observacoes || '').localeCompare(b.observacoes || '')
    );

    reservasOrdenadas.forEach(reserva => {
        const item = document.createElement('div');
        item.className = 'reserva-linha';
        item.innerHTML = `
            <span class="reserva-nome">${reserva.observacoes || 'Reserva'}</span>
            <span class="reserva-saldo">${window.formatarMoeda(reserva.valor)}</span>
            <input type="number" class="form-control reserva-input-valor" data-id="${reserva.id}" placeholder="+/- valor" step="0.01">
            <button class="btn btn-sm btn-confirmar-mov" data-id="${reserva.id}" title="Confirmar">
                <i class="fas fa-check"></i>
            </button>
            <button class="btn btn-sm btn-excluir-reserva" data-id="${reserva.id}" title="Excluir">
                <i class="fas fa-trash"></i>
            </button>
        `;

        // Enter no input confirma
        const input = item.querySelector('.reserva-input-valor');
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                movimentarReservaSimples(reserva.id, input.value);
            }
        });

        // Botão confirmar
        item.querySelector('.btn-confirmar-mov').addEventListener('click', () => {
            movimentarReservaSimples(reserva.id, input.value);
        });

        // Botão excluir
        item.querySelector('.btn-excluir-reserva').addEventListener('click', () => {
            excluirReserva(reserva.id);
        });

        lista.appendChild(item);
    });

    // Renderizar histórico geral
    await renderizarHistoricoGeral();
}

/**
 * Movimenta reserva com valor positivo ou negativo
 */
async function movimentarReservaSimples(reservaId, valorStr) {
    const valor = parseFloat(valorStr);

    if (isNaN(valor) || valor === 0) {
        window.mostrarMensagemErro ? window.mostrarMensagemErro('Informe um valor válido') : alert('Informe um valor válido');
        return;
    }

    const tipo = valor > 0 ? 'entrada' : 'saida';
    const valorAbsoluto = Math.abs(valor);

    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (!token) {
        alert('Sessão expirada.');
        return;
    }

    try {
        const response = await fetch(`${API_URL_RESERVAS}/reservas/${reservaId}/movimentar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ tipo, valor: valorAbsoluto })
        });

        if (response.ok) {
            await carregarReservasAPI();
            await atualizarModalReservas();
            atualizarCardReservasIntegrado();

            if (typeof window.carregarDadosDashboard === 'function') {
                await window.carregarDadosDashboard(window.anoAberto);
            }

            const msg = tipo === 'entrada' ? 'Valor adicionado!' : 'Valor retirado!';
            window.mostrarMensagemSucesso ? window.mostrarMensagemSucesso(msg) : null;
        } else {
            const error = await response.json();
            window.mostrarMensagemErro ? window.mostrarMensagemErro(error.message || 'Erro') : alert(error.message);
        }
    } catch (error) {
        console.error('Erro:', error);
        window.mostrarMensagemErro ? window.mostrarMensagemErro('Erro ao processar') : alert('Erro');
    }
}

/**
 * Renderiza histórico geral de todas as reservas (otimizado - uma única chamada API)
 */
async function renderizarHistoricoGeral() {
    const container = document.getElementById('historico-geral-reservas');
    if (!container) return;

    try {
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        if (!token) {
            container.innerHTML = '<div class="historico-vazio">Sessão expirada</div>';
            return;
        }

        // Buscar todas as movimentações em uma única chamada
        const response = await fetch(`${API_URL_RESERVAS}/reservas/movimentacoes/todas?limite=30`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            container.innerHTML = '<div class="historico-vazio">Erro ao carregar histórico</div>';
            return;
        }

        const data = await response.json();
        const todasMovimentacoes = data.data || [];

        if (todasMovimentacoes.length === 0) {
            container.innerHTML = '<div class="historico-vazio">Nenhuma movimentação</div>';
            return;
        }

        container.innerHTML = todasMovimentacoes.map(mov => {
            const dataHora = new Date(mov.data_hora);
            const dataFormatada = dataHora.toLocaleDateString('pt-BR');
            const horaFormatada = dataHora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const isEntrada = mov.tipo === 'entrada';
            const nomeReserva = mov.nome_reserva || 'Reserva';

            return `
                <div class="historico-linha ${isEntrada ? 'entrada' : 'saida'}">
                    <span class="hist-nome">${nomeReserva}</span>
                    <span class="hist-valor ${isEntrada ? 'positivo' : 'negativo'}">
                        ${isEntrada ? '+' : '-'}${window.formatarMoeda(mov.valor)}
                    </span>
                    <span class="hist-data">${dataFormatada} ${horaFormatada}</span>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        container.innerHTML = '<div class="historico-vazio">Erro ao carregar histórico</div>';
    }
}

/**
 * Carrega movimentações de uma reserva
 */
async function carregarMovimentacoesReserva(reservaId) {
    try {
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        if (!token) return [];

        const response = await fetch(`${API_URL_RESERVAS}/reservas/${reservaId}/movimentacoes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            return data.data || [];
        }
        return [];
    } catch (error) {
        console.error('Erro ao carregar movimentações:', error);
        return [];
    }
}

/**
 * Adiciona ou atualiza reserva via API
 */
async function processarAdicionarReserva() {
    const mes = window.mesAberto;
    const ano = window.anoAberto;
    const valor = parseFloat(document.getElementById('input-valor-reserva').value);
    const descricao = document.getElementById('input-descricao-reserva').value.trim();
    const btnAdicionar = document.getElementById('btn-adicionar-reserva');

    if (isNaN(valor) || valor <= 0) {
        window.mostrarMensagemErro ? window.mostrarMensagemErro('Informe um valor válido') : alert('Informe um valor válido');
        return;
    }

    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (!token) {
        alert('Sessão expirada. Faça login novamente.');
        return;
    }

    const editandoId = btnAdicionar?.dataset.editando;

    try {
        let response;
        const dadosReserva = {
            valor: valor,
            mes: mes,
            ano: ano,
            data: new Date().toISOString().split('T')[0],
            observacoes: descricao || 'Reserva'
        };

        if (editandoId) {
            // Atualizar reserva existente
            response = await fetch(`${API_URL_RESERVAS}/reservas/${editandoId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(dadosReserva)
            });
        } else {
            // Criar nova reserva
            response = await fetch(`${API_URL_RESERVAS}/reservas`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(dadosReserva)
            });
        }

        if (response.ok) {
            // Limpar campos
            document.getElementById('input-valor-reserva').value = '';
            document.getElementById('input-descricao-reserva').value = '';
            if (btnAdicionar) {
                btnAdicionar.innerHTML = '<i class="fas fa-plus"></i>';
                delete btnAdicionar.dataset.editando;
            }

            // Recarregar reservas e atualizar modal
            await carregarReservasAPI();
            await atualizarModalReservas();
            atualizarCardReservasIntegrado();

            if (typeof window.carregarDadosDashboard === 'function') {
                await window.carregarDadosDashboard(ano);
            }

            window.mostrarMensagemSucesso ? window.mostrarMensagemSucesso(editandoId ? 'Reserva atualizada!' : 'Reserva adicionada!') : null;
        } else {
            const error = await response.json();
            window.mostrarMensagemErro ? window.mostrarMensagemErro(error.message || 'Erro ao salvar reserva') : alert(error.message || 'Erro ao salvar reserva');
        }
    } catch (error) {
        console.error('Erro ao salvar reserva:', error);
        window.mostrarMensagemErro ? window.mostrarMensagemErro('Erro ao salvar reserva') : alert('Erro ao salvar reserva');
    }
}

/**
 * Atualiza valores do modal de reservas
 */
async function atualizarModalReservas() {
    const mes = window.mesAberto;
    const ano = window.anoAberto;

    const saldoInfo = window.calcularSaldoMes ? window.calcularSaldoMes(mes, ano) : { saldoAnterior: 0, receitas: 0, despesas: 0, reservas: 0 };
    const totalReservado = calcularTotalReservas();

    // Saldo Atual = saldo anterior + receitas - despesas - reservas
    const saldoAtual = saldoInfo.saldoAnterior + saldoInfo.receitas - saldoInfo.despesas - totalReservado;

    const elemTotal = document.getElementById('total-reservado');
    if (elemTotal) {
        elemTotal.textContent = window.formatarMoeda(totalReservado);
    }

    const elemDisponivel = document.getElementById('disponivel-reservar');
    if (elemDisponivel) {
        elemDisponivel.textContent = window.formatarMoeda(saldoAtual);
    }

    await renderizarListaReservasModal();
}

/**
 * Exclui reserva via API
 */
async function excluirReserva(id) {
    if (!confirm('Deseja realmente excluir esta reserva?')) return;

    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${API_URL_RESERVAS}/reservas/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            await carregarReservasAPI();
            await atualizarModalReservas();
            atualizarCardReservasIntegrado();

            if (typeof window.carregarDadosDashboard === 'function') {
                await window.carregarDadosDashboard(window.anoAberto);
            }

            window.mostrarMensagemSucesso ? window.mostrarMensagemSucesso('Reserva excluída!') : null;
        } else {
            window.mostrarMensagemErro ? window.mostrarMensagemErro('Erro ao excluir reserva') : alert('Erro ao excluir reserva');
        }
    } catch (error) {
        console.error('Erro ao excluir reserva:', error);
    }
}

/**
 * Inicializa eventos das reservas
 */
function inicializarEventosReservasIntegradas() {
    // Botão "Reservas" no card
    const btnReservar = document.getElementById('btn-reservar-valor');
    if (btnReservar) {
        btnReservar.addEventListener('click', abrirModalReservarValor);
    }

    // Botão Adicionar nova reserva
    const btnAdicionar = document.getElementById('btn-adicionar-reserva');
    if (btnAdicionar) {
        btnAdicionar.addEventListener('click', processarAdicionarReserva);
    }

    // Carregar reservas ao iniciar
    carregarReservasAPI();
}

// Aguardar DOM e inicializar
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        inicializarEventosReservasIntegradas();
    }, 500);
});

// Exportar funções
window.atualizarCardReservasIntegrado = atualizarCardReservasIntegrado;
window.abrirModalReservarValor = abrirModalReservarValor;
window.carregarReservasAPI = carregarReservasAPI;
window.calcularTotalReservas = calcularTotalReservas;

// ================================================================
// REDIMENSIONAMENTO DE COLUNAS - RECEITAS (VERSÃO PARA TABLE)
// ================================================================

(function() {
    let isResizing = false;
    let currentTh = null;
    let startX = 0;
    let startWidth = 0;

    function initTableColumnResizer() {
        const tabela = document.getElementById('tabela-receitas');
        if (!tabela || tabela.dataset.resizerInit === 'true') return;
        tabela.dataset.resizerInit = 'true';

        const thead = tabela.querySelector('thead');
        if (!thead) return;

        // Remove listeners antigos se existirem
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        // Adiciona listeners globais
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        // Adiciona resizers nos th (se não existirem)
        const thElements = thead.querySelectorAll('th');
        thElements.forEach(th => {
            // Pular colunas muito pequenas
            if (th.classList.contains('col-anexos')) return;

            // Verificar se já tem resizer
            if (th.querySelector('.column-resizer')) return;

            const resizer = document.createElement('div');
            resizer.className = 'column-resizer';
            resizer.style.cssText = 'position:absolute;right:0;top:0;bottom:0;width:5px;cursor:col-resize;z-index:10;';
            th.style.position = 'relative';
            th.appendChild(resizer);

            resizer.onmousedown = function(e) {
                e.preventDefault();
                e.stopPropagation();

                isResizing = true;
                currentTh = th;
                startX = e.pageX;
                startWidth = th.offsetWidth;

                resizer.classList.add('resizing');
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
            };
        });
    }

    function handleMouseMove(e) {
        if (!isResizing || !currentTh) return;

        const diff = e.pageX - startX;
        const newWidth = Math.max(30, startWidth + diff);

        // Com table-layout: fixed, basta ajustar o th que as td seguem automaticamente
        currentTh.style.width = newWidth + 'px';
    }

    function handleMouseUp() {
        if (!isResizing) return;

        isResizing = false;
        if (currentTh) {
            const resizer = currentTh.querySelector('.column-resizer');
            if (resizer) resizer.classList.remove('resizing');
        }
        currentTh = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }

    // Função para resetar larguras
    window.resetReceitasColumnWidths = function() {
        const tabela = document.getElementById('tabela-receitas');
        if (!tabela) return;

        const thElements = tabela.querySelectorAll('thead th');
        thElements.forEach(th => {
            th.style.width = '';
        });
    };

    window.reinitReceitasResizer = function() {
        const tabela = document.getElementById('tabela-receitas');
        if (tabela) {
            tabela.dataset.resizerInit = '';
            initTableColumnResizer();
        }
    };

    // Inicializa
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTableColumnResizer);
    } else {
        setTimeout(initTableColumnResizer, 100);
    }

    // Observer para reinicializar quando necessário
    const observer = new MutationObserver(() => {
        const tabela = document.getElementById('tabela-receitas');
        if (tabela && tabela.dataset.resizerInit !== 'true') {
            initTableColumnResizer();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();