// ================================================================
// SISTEMA DE RECEITAS - VERSÃO FUNCIONAL COMPLETA
// ================================================================

let processandoReceita = false;

// ================================================================
// INICIALIZAÇÃO
// ================================================================

async function aguardarSistemaReady() {
    return new Promise((resolve) => {
        if (window.sistemaInicializado && window.dadosFinanceiros && Object.keys(window.dadosFinanceiros).length > 0 && typeof window.salvarDados === 'function') {
            resolve(true);
            return;
        }

        let tentativas = 0;
        const maxTentativas = 50;

        const verificar = () => {
            tentativas++;

            if (window.sistemaInicializado && window.dadosFinanceiros && Object.keys(window.dadosFinanceiros).length > 0 && typeof window.salvarDados === 'function') {
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

    // Inserir saldo anterior como primeira linha da tabela
    const saldoAnterior = obterSaldoAnteriorValido(window.mesAberto, window.anoAberto);
    if (saldoAnterior !== 0) {
        const linhaSaldo = criarLinhaSaldoAnterior(saldoAnterior, fechado);
        if (linhaSaldo) listaReceitas.appendChild(linhaSaldo);
    }

    // Renderizar receitas (sem saldo anterior duplicado)
    if (Array.isArray(receitas)) {
        receitas.forEach((receita, index) => {
            if (receita.saldoAnterior === true || receita.descricao.includes('Saldo Anterior')) {
                return;
            }
            const tr = criarLinhaReceita(receita, index, fechado);
            listaReceitas.appendChild(tr);
        });
    }

    // Atualizar barra receitas vs despesas
    atualizarBarraReceitasDespesas();

    if (!fechado) {
        configurarEventosReceitas(listaReceitas, window.mesAberto, window.anoAberto);
    }

    setTimeout(() => {
        configurarEventosAnexosReceitas(listaReceitas);
        atualizarTodosContadoresAnexosReceitas();
    }, 100);
}

function atualizarBarraReceitasDespesas() {
    const mes = window.mesAberto;
    const ano = window.anoAberto;
    if (mes === null || ano === null) return;

    const receitas = window.dadosFinanceiros[ano]?.meses[mes]?.receitas || [];
    const despesas = window.dadosFinanceiros[ano]?.meses[mes]?.despesas || [];

    // Saldo anterior faz parte do mês atual
    const saldo = typeof window.calcularSaldoMes === 'function'
        ? window.calcularSaldoMes(mes, ano) : { saldoAnterior: 0 };
    const saldoAnterior = saldo.saldoAnterior || 0;

    const totalReceitas = calcularTotalReceitas(receitas);
    const totalDespesas = typeof window.calcularTotalDespesas === 'function'
        ? window.calcularTotalDespesas(despesas) : 0;

    // Base = saldo anterior + receitas do mês
    const base = saldoAnterior + totalReceitas;
    const percentual = base > 0 ? (totalDespesas / base) * 100 : 0;
    const disponivel = base - totalDespesas;

    // Atualizar elementos da barra
    const elDespesas = document.getElementById('barra-rd-despesas');
    const elReceitas = document.getElementById('barra-rd-receitas');
    const elProgresso = document.getElementById('barra-rd-progresso');
    const elPercentual = document.getElementById('barra-rd-percentual');
    const elDisponivel = document.getElementById('barra-rd-disponivel');

    if (elDespesas) elDespesas.textContent = window.formatarMoeda(totalDespesas);
    if (elReceitas) elReceitas.textContent = window.formatarMoeda(base);
    if (elPercentual) elPercentual.textContent = `${percentual.toFixed(1)}% usado`;
    if (elDisponivel) {
        elDisponivel.textContent = window.formatarMoeda(disponivel);
        elDisponivel.style.color = disponivel >= 0 ? '' : '#dc3545';
    }

    if (elProgresso) {
        elProgresso.style.width = `${Math.min(percentual, 100)}%`;
        elProgresso.className = 'barra-preenchida';
        if (percentual > 90) {
            elProgresso.classList.add('status-critico');
        } else if (percentual > 70) {
            elProgresso.classList.add('status-alerta');
        } else {
            elProgresso.classList.add('status-ok');
        }
    }
}
window.atualizarBarraReceitasDespesas = atualizarBarraReceitasDespesas;


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

    // Garantir que anexos é um array
    let anexos = receita.anexos;
    if (typeof anexos === 'string') {
        try { anexos = JSON.parse(anexos); } catch(e) { anexos = []; }
    }
    const quantidadeAnexos = Array.isArray(anexos) ? anexos.length : 0;

    const contador = clone.querySelector('.contador-anexos');

    if (contador) {
        if (quantidadeAnexos > 0) {
            contador.textContent = quantidadeAnexos;
            contador.style.display = 'flex';
        } else {
            contador.textContent = '0';
            contador.style.display = 'none';
        }
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
    const checkboxReplicar = document.getElementById('receita-replicar');

    if (opcoesDetalhes) opcoesDetalhes.classList.add('hidden');
    if (checkboxReplicar) checkboxReplicar.checked = false;
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

            // Atualizar interface (renderizarDetalhesDoMes já recarrega dados da API)
            if (typeof window.renderizarDetalhesDoMes === 'function') {
                await window.renderizarDetalhesDoMes(formData.mes, formData.ano);
            }
            // Atualizar dashboard local sem re-fetch da API
            if (typeof window.carregarDadosDashboardLocal === 'function') {
                window.carregarDadosDashboardLocal(formData.ano);
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
        const dataReceita = new Date(receita.data + 'T00:00:00');
        const diaReceita = dataReceita.getDate();

        // Obter mês/ano final dos selects
        const mesFinal = parseInt(document.getElementById('replicar-ate-mes').value);
        const anoFinal = parseInt(document.getElementById('replicar-ate-ano').value);

        let mesAtual = mes;
        let anoAtual = ano;

        // Guardar anos que precisam ser atualizados
        const anosParaAtualizar = new Set();
        anosParaAtualizar.add(ano);

        // Replicar até o mês/ano final
        while (anoAtual < anoFinal || (anoAtual === anoFinal && mesAtual < mesFinal)) {
            mesAtual++;
            if (mesAtual > 11) {
                mesAtual = 0;
                anoAtual++;
            }

            if (anoAtual <= anoFinal) {
                await replicarParaMes(receita, mesAtual, anoAtual, diaReceita);
                anosParaAtualizar.add(anoAtual);
            }
        }

        // Atualizar interface para todos os anos afetados
        for (const anoAtualizar of anosParaAtualizar) {
            if (typeof window.carregarDadosDashboard === 'function') {
                await window.carregarDadosDashboard(anoAtualizar);
            }
        }

        // Atualizar cards dos meses do ano atual
        if (typeof window.renderizarMeses === 'function') {
            await window.renderizarMeses(window.anoAberto || new Date().getFullYear());
        }

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
            if (quantidade > 0) {
                contador.textContent = quantidade;
                contador.style.display = 'flex';
                btnAnexos.classList.add('tem-anexos');
                btnAnexos.title = `${quantidade} anexo(s) - Clique para visualizar`;
            } else {
                contador.textContent = '0';
                contador.style.display = 'none';
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

/**
 * Toggle para mostrar/ocultar opções de replicação de receitas
 */
function toggleReplicarReceita() {
    const checkbox = document.getElementById('receita-replicar');
    const opcoes = document.getElementById('opcoes-replicacao-detalhes');

    if (checkbox && opcoes) {
        if (checkbox.checked) {
            opcoes.classList.remove('hidden');
            inicializarSelectAnosReplicarReceita();
        } else {
            opcoes.classList.add('hidden');
        }
    }
}

// Exportar para uso global
window.toggleReplicarReceita = toggleReplicarReceita;

/**
 * Inicializa o select de anos para replicação de receitas
 */
function inicializarSelectAnosReplicarReceita() {
    const selectAno = document.getElementById('replicar-ate-ano');
    const selectMes = document.getElementById('replicar-ate-mes');

    if (!selectAno) return;

    const anoAtual = window.anoAberto || new Date().getFullYear();

    // Limpar opções existentes
    selectAno.innerHTML = '';

    // Adicionar anos (atual até +5 anos)
    for (let ano = anoAtual; ano <= anoAtual + 5; ano++) {
        const option = document.createElement('option');
        option.value = ano;
        option.textContent = ano;
        selectAno.appendChild(option);
    }

    // Selecionar dezembro do ano atual por padrão
    if (selectMes) selectMes.value = '11';
    selectAno.value = anoAtual;
}

function configurarEventListenersReplicacao() {
    // Mantido para compatibilidade, mas agora usa onchange no HTML
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

// Cache local de reservas e movimentações
window.reservasCache = [];
window.movimentacoesReservasCache = [];

/**
 * Carrega reservas e movimentações do backend
 */
async function carregarReservasAPI() {
    try {
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        if (!token) return [];

        // Carregar reservas e movimentações em paralelo
        const [reservasResponse, movimentacoesResponse] = await Promise.all([
            fetch(`${API_URL_RESERVAS}/reservas`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch(`${API_URL_RESERVAS}/reservas/movimentacoes/todas?limite=1000`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
        ]);

        if (reservasResponse.ok) {
            const data = await reservasResponse.json();
            window.reservasCache = data.data || [];
        }

        if (movimentacoesResponse.ok) {
            const movData = await movimentacoesResponse.json();
            window.movimentacoesReservasCache = movData.data || [];
        }

        return window.reservasCache;
    } catch (error) {
        console.error('Erro ao carregar reservas:', error);
        return [];
    }
}

/**
 * Calcula total de reservas (valor atual acumulado de todas as reservas)
 * Usado para exibir o "Total Reservado" no modal
 */
function calcularTotalReservas() {
    return window.reservasCache.reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
}

/**
 * Calcula o total de movimentações de reservas até um determinado mês/ano (inclusive)
 * Usa a data_hora da movimentação para determinar em qual mês ela ocorreu
 *
 * IMPORTANTE: Para reservas antigas sem movimentações, considera o valor da reserva
 * como uma movimentação de entrada no mês de criação da reserva.
 *
 * @param {number} mesLimite - Mês limite (0-11)
 * @param {number} anoLimite - Ano limite
 * @returns {number} Total líquido de movimentações (entradas - saídas)
 */
function calcularMovimentacoesReservasAcumuladas(mesLimite, anoLimite) {
    let totalMovimentacoes = 0;

    // 1. Calcular movimentações registradas
    if (window.movimentacoesReservasCache && Array.isArray(window.movimentacoesReservasCache)) {
        totalMovimentacoes = window.movimentacoesReservasCache
            .filter(mov => {
                const dataHora = new Date(mov.data_hora);
                const movAno = dataHora.getFullYear();
                const movMes = dataHora.getMonth(); // 0-11

                // Inclui movimentações de anos anteriores
                if (movAno < anoLimite) return true;
                // Inclui movimentações do mesmo ano até o mês limite (inclusive)
                if (movAno === anoLimite && movMes <= mesLimite) return true;
                return false;
            })
            .reduce((sum, mov) => {
                const valor = parseFloat(mov.valor || 0);
                // Entrada = adiciona à reserva (sai do saldo)
                // Saída = retira da reserva (volta pro saldo)
                return sum + (mov.tipo === 'entrada' ? valor : -valor);
            }, 0);
    }

    // 2. Para reservas sem movimentação de criação (legadas), calcular valor inicial
    // Isso é necessário para reservas criadas antes da implementação de movimentações
    if (window.reservasCache && Array.isArray(window.reservasCache)) {
        // Identificar reservas que têm movimentação de criação
        const reservasComCriacao = new Set();
        if (window.movimentacoesReservasCache && Array.isArray(window.movimentacoesReservasCache)) {
            window.movimentacoesReservasCache.forEach(mov => {
                if (mov.observacoes === 'Criação da reserva') {
                    reservasComCriacao.add(mov.reserva_id);
                }
            });
        }

        // Para reservas sem movimentação de criação, calcular valor inicial
        // Valor inicial = valor atual - soma das movimentações (entradas - saídas)
        window.reservasCache
            .filter(r => {
                // Reserva não tem movimentação de criação
                if (reservasComCriacao.has(r.id)) return false;

                const reservaAno = parseInt(r.ano);
                const reservaMes = parseInt(r.mes);

                // Inclui reservas de anos anteriores
                if (reservaAno < anoLimite) return true;
                // Inclui reservas do mesmo ano até o mês limite
                if (reservaAno === anoLimite && reservaMes <= mesLimite) return true;
                return false;
            })
            .forEach(r => {
                // Calcular soma das movimentações desta reserva
                let somaMovimentacoes = 0;
                if (window.movimentacoesReservasCache && Array.isArray(window.movimentacoesReservasCache)) {
                    somaMovimentacoes = window.movimentacoesReservasCache
                        .filter(mov => mov.reserva_id === r.id)
                        .reduce((sum, mov) => {
                            const valor = parseFloat(mov.valor || 0);
                            return sum + (mov.tipo === 'entrada' ? valor : -valor);
                        }, 0);
                }

                // Valor inicial = valor atual - soma das movimentações
                const valorInicial = parseFloat(r.valor || 0) - somaMovimentacoes;
                if (valorInicial > 0) {
                    totalMovimentacoes += valorInicial;
                }
            });
    }

    return totalMovimentacoes;
}

/**
 * Calcula movimentações de reservas apenas do mês especificado
 * @param {number} mes - Mês (0-11)
 * @param {number} ano - Ano
 * @returns {number} Total líquido de movimentações do mês (entradas - saídas)
 */
function calcularMovimentacoesReservasMes(mes, ano) {
    let totalMovimentacoes = 0;

    // 1. Calcular movimentações registradas do mês
    if (window.movimentacoesReservasCache && Array.isArray(window.movimentacoesReservasCache)) {
        totalMovimentacoes = window.movimentacoesReservasCache
            .filter(mov => {
                const dataHora = new Date(mov.data_hora);
                const movAno = dataHora.getFullYear();
                const movMes = dataHora.getMonth(); // 0-11
                return movAno === ano && movMes === mes;
            })
            .reduce((sum, mov) => {
                const valor = parseFloat(mov.valor || 0);
                return sum + (mov.tipo === 'entrada' ? valor : -valor);
            }, 0);
    }

    // 2. Para reservas legadas (sem movimentação de criação), calcular valor inicial no mês de criação
    if (window.reservasCache && Array.isArray(window.reservasCache)) {
        // Identificar reservas que têm movimentação de criação
        const reservasComCriacao = new Set();
        if (window.movimentacoesReservasCache && Array.isArray(window.movimentacoesReservasCache)) {
            window.movimentacoesReservasCache.forEach(mov => {
                if (mov.observacoes === 'Criação da reserva') {
                    reservasComCriacao.add(mov.reserva_id);
                }
            });
        }

        window.reservasCache
            .filter(r => {
                if (reservasComCriacao.has(r.id)) return false;
                return parseInt(r.ano) === ano && parseInt(r.mes) === mes;
            })
            .forEach(r => {
                // Calcular soma das movimentações desta reserva
                let somaMovimentacoes = 0;
                if (window.movimentacoesReservasCache && Array.isArray(window.movimentacoesReservasCache)) {
                    somaMovimentacoes = window.movimentacoesReservasCache
                        .filter(mov => mov.reserva_id === r.id)
                        .reduce((sum, mov) => {
                            const valor = parseFloat(mov.valor || 0);
                            return sum + (mov.tipo === 'entrada' ? valor : -valor);
                        }, 0);
                }

                // Valor inicial = valor atual - soma das movimentações
                const valorInicial = parseFloat(r.valor || 0) - somaMovimentacoes;
                if (valorInicial > 0) {
                    totalMovimentacoes += valorInicial;
                }
            });
    }

    return totalMovimentacoes;
}

function _calcularSaldoCaixa(mes, ano) {
    const sequencia = [];
    let m = mes, a = ano;

    for (let i = 0; i < 60; i++) {
        const dm = window.dadosFinanceiros?.[a]?.meses?.[m];

        if (dm?.fechado === true) {
            let base = dm.saldoFinal || 0;
            for (let j = sequencia.length - 1; j >= 0; j--) {
                const { m: sm, a: sa } = sequencia[j];
                const d = window.dadosFinanceiros?.[sa]?.meses?.[sm];
                if (!d) continue;
                const rec = (d.receitas || []).reduce((s, r) => {
                    if (r.saldoAnterior || r.descricao?.includes('Saldo Anterior') || r.automatica) return s;
                    return s + (r.valor || 0);
                }, 0);
                base += rec;
            }
            return base;
        }

        if (dm) sequencia.push({ m, a });
        m -= 1;
        if (m < 0) { m = 11; a -= 1; }
        if (a < 2000 || !window.dadosFinanceiros) break;
    }

    let base = 0;
    for (let j = sequencia.length - 1; j >= 0; j--) {
        const { m: sm, a: sa } = sequencia[j];
        const d = window.dadosFinanceiros?.[sa]?.meses?.[sm];
        if (!d) continue;
        const rec = (d.receitas || []).reduce((s, r) => {
            if (r.saldoAnterior || r.descricao?.includes('Saldo Anterior') || r.automatica) return s;
            return s + (r.valor || 0);
        }, 0);
        base += rec;
    }
    return base;
}

function calcularSaldoAtualMes() {
    const mes = window.mesAberto;
    const ano = window.anoAberto;

    const saldoCaixa     = _calcularSaldoCaixa(mes, ano);
    const movimentacoes  = calcularMovimentacoesReservasAcumuladas(mes, ano);
    const totalReservado = calcularTotalReservas();

    return {
        saldoAtualMes: saldoCaixa - movimentacoes,
        totalReservado
    };
}

// Exportar funções
window.calcularSaldoAtualMes = calcularSaldoAtualMes;
window.calcularTotalReservasAcumuladas = calcularMovimentacoesReservasAcumuladas;
window.calcularMovimentacoesReservasMes = calcularMovimentacoesReservasMes;

/**
 * Verifica se o mês atual aberto está fechado
 * @returns {boolean} true se o mês estiver fechado
 */
function mesFechadoAtual() {
    const mes = window.mesAberto;
    const ano = window.anoAberto;

    if (mes === null || ano === null) return false;

    const dadosMes = window.dadosFinanceiros?.[ano]?.meses?.[mes];
    return dadosMes?.fechado === true;
}

// Exportar função
window.mesFechadoAtual = mesFechadoAtual;

/**
 * Atualiza o card de reservas integrado na aba Receitas
 * O "Saldo Atual" na toolbar é o mesmo "Saldo Atual Mês" do resumo
 */
async function atualizarCardReservasIntegrado() {
    if (window.mesAberto === null || window.anoAberto === null) return;

    // Carregar reservas do backend
    await carregarReservasAPI();

    // Calcular saldo atual do mês (igual ao resumo do mês)
    const { saldoAtualMes, totalReservado } = calcularSaldoAtualMes();

    // Atualizar elementos do DOM (card mini antigo - se existir)
    const elemDisponivel = document.getElementById('reservas-disponivel-mini');
    const elemReservado = document.getElementById('reservas-reservado-mini');

    if (elemDisponivel) {
        elemDisponivel.textContent = window.formatarMoeda(saldoAtualMes);
        elemDisponivel.className = saldoAtualMes >= 0 ? 'valor saldo-positivo' : 'valor saldo-negativo';
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
    if (window.mesAberto === null || window.anoAberto === null) {
        alert('Selecione um mês primeiro');
        return;
    }

    // Verificar se o mês está fechado
    if (mesFechadoAtual()) {
        const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                           'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const msg = `O mês de ${nomesMeses[window.mesAberto]}/${window.anoAberto} está fechado. Não é possível gerenciar reservas.`;
        window.mostrarMensagemErro ? window.mostrarMensagemErro(msg) : alert(msg);
        return;
    }

    // Carregar reservas do backend
    await carregarReservasAPI();

    // Calcular saldo atual do mês (igual ao resumo do mês)
    const { saldoAtualMes, totalReservado } = calcularSaldoAtualMes();

    // Atualizar totalizadores do modal
    const elemTotal = document.getElementById('total-reservado');
    if (elemTotal) {
        elemTotal.textContent = window.formatarMoeda(totalReservado);
    }

    // Mostrar Saldo Atual Mês (igual ao resumo)
    const elemSaldoAtual = document.getElementById('saldo-atual-mes-reservas');
    if (elemSaldoAtual) {
        elemSaldoAtual.textContent = window.formatarMoeda(saldoAtualMes);
        elemSaldoAtual.style.color = saldoAtualMes >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
    }

    // Limpar campos do formulário
    const inputValor = document.getElementById('input-valor-reserva');
    const inputDescricao = document.getElementById('input-descricao-reserva');
    if (inputValor) inputValor.value = '';
    if (inputDescricao) inputDescricao.value = '';

    // Renderizar lista de reservas no modal
    renderizarListaReservasModal();

    // Colapsar histórico ao abrir
    document.getElementById('historico-geral-container')?.classList.add('collapsed');

    // Abrir modal
    const modal = document.getElementById('modal-reservar-valor');
    if (modal) {
        modal.style.display = 'flex';
    }
}

/**
 * Renderiza lista de reservas com campo para adicionar/remover valor
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
 * - Valor positivo = entrada (adiciona à reserva, sai do saldo atual do mês)
 * - Valor negativo = saída (retira da reserva, volta para o saldo atual do mês)
 * A movimentação sempre usa o mês/ano ATUAL aberto
 */
async function movimentarReservaSimples(reservaId, valorStr) {
    const valor = parseFloat(valorStr);
    const mes = window.mesAberto;
    const ano = window.anoAberto;

    // Verificar se o mês está fechado
    if (mesFechadoAtual()) {
        window.mostrarMensagemErro ? window.mostrarMensagemErro('Mês fechado. Não é possível movimentar reservas.') : alert('Mês fechado.');
        return;
    }

    if (isNaN(valor) || valor === 0) {
        window.mostrarMensagemErro ? window.mostrarMensagemErro('Informe um valor válido') : alert('Informe um valor válido');
        return;
    }

    const tipo = valor > 0 ? 'entrada' : 'saida';
    const valorAbsoluto = Math.abs(valor);

    // Se for entrada (valor positivo), validar se tem saldo disponível no mês atual
    if (tipo === 'entrada') {
        const { saldoAtualMes } = calcularSaldoAtualMes();

        if (valorAbsoluto > saldoAtualMes) {
            const msg = `Valor indisponível para reserva. Disponível: ${window.formatarMoeda(saldoAtualMes)}`;
            window.mostrarMensagemErro ? window.mostrarMensagemErro(msg) : alert(msg);
            return;
        }
    }

    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (!token) {
        alert('Sessão expirada.');
        return;
    }

    try {
        // Enviar mês/ano atual para o backend usar na validação
        const response = await fetch(`${API_URL_RESERVAS}/reservas/${reservaId}/movimentar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                tipo,
                valor: valorAbsoluto,
                mes: mes,  // Mês atual aberto
                ano: ano   // Ano atual aberto
            })
        });

        if (response.ok) {
            await carregarReservasAPI();
            await atualizarModalReservas();
            atualizarCardReservasIntegrado();

            // Atualizar barra receitas vs despesas
            if (typeof window.atualizarBarraReceitasDespesas === 'function') {
                window.atualizarBarraReceitasDespesas();
            }

            if (typeof window.carregarDadosDashboard === 'function') {
                await window.carregarDadosDashboard(ano);
            }

            const msg = tipo === 'entrada' ? 'Valor adicionado à reserva!' : 'Valor retirado da reserva!';
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
 * Renderiza histórico geral de todas as reservas
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
 * Cria nova reserva via API
 * A reserva é criada no mês/ano ATUAL aberto
 * O valor sai do saldo atual do mês
 */
async function processarAdicionarReserva() {
    const mes = window.mesAberto;
    const ano = window.anoAberto;

    // Verificar se o mês está fechado
    if (mesFechadoAtual()) {
        window.mostrarMensagemErro ? window.mostrarMensagemErro('Mês fechado. Não é possível criar reservas.') : alert('Mês fechado.');
        return;
    }

    const valor = parseFloat(document.getElementById('input-valor-reserva').value);
    const descricao = document.getElementById('input-descricao-reserva').value.trim();

    if (!descricao) {
        window.mostrarMensagemErro ? window.mostrarMensagemErro('Informe o nome da reserva') : alert('Informe o nome da reserva');
        return;
    }

    if (isNaN(valor) || valor <= 0) {
        window.mostrarMensagemErro ? window.mostrarMensagemErro('Informe um valor válido') : alert('Informe um valor válido');
        return;
    }

    // Validar se tem saldo disponível para reservar no mês atual
    const { saldoAtualMes } = calcularSaldoAtualMes();

    if (valor > saldoAtualMes) {
        const msg = `Valor indisponível para reserva. Disponível: ${window.formatarMoeda(saldoAtualMes)}`;
        window.mostrarMensagemErro ? window.mostrarMensagemErro(msg) : alert(msg);
        return;
    }

    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (!token) {
        alert('Sessão expirada. Faça login novamente.');
        return;
    }

    try {
        // Criar reserva no mês/ano atual aberto
        const response = await fetch(`${API_URL_RESERVAS}/reservas`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                valor: valor,
                mes: mes,    // Mês atual aberto
                ano: ano,    // Ano atual aberto
                // Usar data do mês/ano aberto, não a data atual do sistema
                // Isso garante que a movimentação seja contabilizada no mês correto
                data: `${ano}-${String(mes + 1).padStart(2, '0')}-15`,
                observacoes: descricao
            })
        });

        if (response.ok) {
            // Limpar campos
            document.getElementById('input-valor-reserva').value = '';
            document.getElementById('input-descricao-reserva').value = '';

            // Recarregar reservas e atualizar modal
            await carregarReservasAPI();
            await atualizarModalReservas();
            atualizarCardReservasIntegrado();

            // Atualizar barra receitas vs despesas
            if (typeof window.atualizarBarraReceitasDespesas === 'function') {
                window.atualizarBarraReceitasDespesas();
            }

            if (typeof window.carregarDadosDashboard === 'function') {
                await window.carregarDadosDashboard(ano);
            }

            window.mostrarMensagemSucesso ? window.mostrarMensagemSucesso('Reserva criada com sucesso!') : null;
        } else {
            const error = await response.json();
            window.mostrarMensagemErro ? window.mostrarMensagemErro(error.message || 'Erro ao criar reserva') : alert(error.message || 'Erro ao criar reserva');
        }
    } catch (error) {
        console.error('Erro ao criar reserva:', error);
        window.mostrarMensagemErro ? window.mostrarMensagemErro('Erro ao criar reserva') : alert('Erro ao criar reserva');
    }
}

/**
 * Atualiza valores do modal de reservas
 */
async function atualizarModalReservas() {
    // Calcular saldo atual do mês (igual ao resumo do mês)
    const { saldoAtualMes, totalReservado } = calcularSaldoAtualMes();

    const elemTotal = document.getElementById('total-reservado');
    if (elemTotal) {
        elemTotal.textContent = window.formatarMoeda(totalReservado);
    }

    // Mostrar Saldo Atual Mês (igual ao resumo)
    const elemSaldoAtual = document.getElementById('saldo-atual-mes-reservas');
    if (elemSaldoAtual) {
        elemSaldoAtual.textContent = window.formatarMoeda(saldoAtualMes);
        elemSaldoAtual.style.color = saldoAtualMes >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
    }

    await renderizarListaReservasModal();
    await renderizarHistoricoGeral();
}

/**
 * Exclui reserva via API
 */
async function excluirReserva(id) {
    // Verificar se o mês está fechado
    if (mesFechadoAtual()) {
        window.mostrarMensagemErro ? window.mostrarMensagemErro('Mês fechado. Não é possível excluir reservas.') : alert('Mês fechado.');
        return;
    }

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

            // Atualizar barra receitas vs despesas
            if (typeof window.atualizarBarraReceitasDespesas === 'function') {
                window.atualizarBarraReceitasDespesas();
            }

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
    const btnReservar = document.getElementById('btn-reservar-valor');
    if (btnReservar) {
        btnReservar.addEventListener('click', abrirModalReservarValor);
    }

    const btnAdicionar = document.getElementById('btn-adicionar-reserva');
    if (btnAdicionar) {
        btnAdicionar.addEventListener('click', processarAdicionarReserva);
    }

    const historicoToggle = document.getElementById('historico-geral-toggle');
    if (historicoToggle) {
        historicoToggle.addEventListener('click', () => {
            document.getElementById('historico-geral-container')?.classList.toggle('collapsed');
        });
    }

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
window.calcularTotalReservasAcumuladas = calcularMovimentacoesReservasAcumuladas;
window.calcularMovimentacoesReservasMes = calcularMovimentacoesReservasMes;

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