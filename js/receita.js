window.API_URL = 'https://sistema-financeiro-backend-o199.onrender.com/api';

function getToken() {
    return sessionStorage.getItem('token');
}

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

function renderizarReceitas(receitas, fechado, mes, ano) {
    const listaReceitas = document.getElementById('lista-receitas');
    if (!listaReceitas) return;
   
    listaReceitas.innerHTML = '';
   
    const temSaldoAnteriorReal = Array.isArray(receitas) && 
        receitas.some(receita => receita.saldoAnterior === true);
    
    if (!temSaldoAnteriorReal) {
        const saldoAnterior = obterSaldoAnteriorValido(mes, ano);
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
        configurarEventosReceitas(listaReceitas, mes, ano);
    }
    
    setTimeout(() => {
        configurarEventosAnexosReceitas(listaReceitas);
        atualizarTodosContadoresAnexosReceitas();
    }, 100);
}


async function buscarEExibirReceitas(mes, ano) {
    try {
        console.log(`🔍 Buscando receitas do mês ${mes}/${ano} via API`);
        
        const response = await fetch(`${API_URL}/receitas?mes=${mes}&ano=${ano}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Erro ao buscar receitas');
        }
        
        console.log('✅ Receitas carregadas da API:', data.data);
        
        const receitasFormatadas = data.data.map(r => ({
            id: r.id,
            descricao: r.descricao,
            valor: parseFloat(r.valor),
            data: r.data_recebimento,
            mes: r.mes,
            ano: r.ano,
            observacoes: r.observacoes,
            saldoAnterior: false,
            anexos: []
        }));
        
        const mesFechado = window.dadosFinanceiros[ano]?.meses[mes]?.fechado || false;
        renderizarReceitas(receitasFormatadas, mesFechado, mes, ano);
        
        return receitasFormatadas;
        
    } catch (error) {
        console.error('❌ Erro ao buscar receitas:', error);
        alert('Erro ao carregar receitas: ' + error.message);
        return [];
    }
}

async function carregarReceitasAtual() {
    try {
        const agora = new Date();
        const mesAtual = agora.getMonth();
        const anoAtual = agora.getFullYear();
        
        window.mesAberto = mesAtual;
        window.anoAberto = anoAtual;
        
        const receitasData = await buscarEExibirReceitas(mesAtual, anoAtual);
        return receitasData;
        
    } catch (error) {
        console.error('❌ Erro ao carregar receitas atual:', error);
        return [];
    }
}

function salvarReceitaLocal(dadosReceita) {
    fetch(`${API_URL}/receitas`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${getToken()}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(dadosReceita)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('✅ Receita salva na API!', data);
            buscarEExibirReceitas(dadosReceita.mes, dadosReceita.ano);
        }
    })
    .catch(error => console.error('❌ Erro ao salvar receita:', error));
}

document.addEventListener('DOMContentLoaded', carregarReceitasAtual);


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
    
    // Configurar eventos reais aqui, não recursão
    console.log('Configurando eventos de anexos para receitas');

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

async function obterSaldoAnteriorValido(mes, ano) {
    try {
        console.log('🔍 Valores recebidos - mes:', mes, 'ano:', ano);
        
        if (mes === undefined || mes === null || ano === undefined || ano === null || isNaN(mes) || isNaN(ano)) {
            console.log('⚠️ Mes ou ano inválido, retornando 0');
            return 0;
        }
        
        let mesAnterior = parseInt(mes) - 1;
        let anoAnterior = parseInt(ano);
        
        if (mesAnterior < 0) {
            mesAnterior = 11;
            anoAnterior = anoAnterior - 1;
        }
        
        const response = await fetch(`${API_URL}/receitas/saldo-anterior?mes=${mes}&ano=${ano}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            console.warn('⚠️ Erro ao buscar saldo anterior:', data.message);
            return 0;
        }
        
        return data.saldo || 0;
        
    } catch (error) {
        console.error('❌ Erro ao calcular saldo anterior:', error);
        return 0;
    }
}

// ================================================================
// MODAL RECEITA - REFATORADO COMPLETAMENTE
// ================================================================

function abrirModalNovaReceita(index, mes, ano) {
    try {
        console.log('🔵 Abrindo modal - Index:', index, 'Mes:', mes, 'Ano:', ano);
        
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
        
        console.log('📋 Verificação:', {
            indexValido,
            receitaExiste,
            totalReceitas: receitas?.length
        });
        
        form.reset();
        resetarOpcoesReplicacao();
        
        document.getElementById('receita-mes').value = mesReceita;
        document.getElementById('receita-ano').value = anoReceita;
        
        if (receitaExiste) {
            const receita = receitas[index];
            
            console.log('✏️ MODO EDIÇÃO - Receita:', receita);
            
            if (receita.saldoAnterior === true || receita.descricao?.includes('Saldo Anterior')) {
                alert('Não é possível editar receitas de saldo anterior.');
                return;
            }
            
            document.getElementById('receita-id').value = index;
            document.getElementById('receita-descricao').value = receita.descricao || '';
            document.getElementById('receita-valor').value = receita.valor || '';
            document.getElementById('receita-data').value = receita.data || '';
            
            console.log('✅ Campos preenchidos:', {
                id: index,
                descricao: receita.descricao,
                valor: receita.valor,
                data: receita.data
            });
            
            if (window.sistemaAnexos && receita.anexos) {
                window.sistemaAnexos.carregarAnexosExistentes(receita, 'receita');
            }
            
            const titulo = modal.querySelector('.modal-header h2');
            if (titulo) titulo.textContent = 'Editar Receita';
            
        } else {
            console.log('➕ MODO NOVA RECEITA');
            
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
        console.error('❌ Erro ao abrir modal:', error);
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
        console.log('⏳ Já está processando...');
        return false;
    }
    
    if (!window.sistemaInicializado || !window.dadosFinanceiros) {
        alert('Sistema ainda carregando. Aguarde alguns segundos e tente novamente.');
        return false;
    }
    
    processandoReceita = true;
    
    try {
        const formData = coletarDadosFormulario();
        
        console.log('📝 Dados coletados:', formData);
        
        if (!validarDadosFormulario(formData)) {
            processandoReceita = false;
            return false;
        }
        
        const novaReceita = criarObjetoReceita(formData);
        
        const idValue = formData.id;
        const ehEdicao = idValue !== '' && idValue !== null && idValue !== undefined;
        
        console.log('💾 Salvando - É edição?', ehEdicao, 'ID:', idValue);
        
        const sucesso = await salvarReceitaLocal(formData.mes, formData.ano, novaReceita, idValue);

        if (sucesso) {
            if (!ehEdicao) {
                const replicar = document.getElementById('receita-replicar');
                if (replicar && replicar.checked) {
                    await processarReplicacao(novaReceita, formData.mes, formData.ano);
                }
            }

            document.getElementById('modal-nova-receita').style.display = 'none';
            
            if (typeof window.renderizarDetalhesDoMes === 'function') {
                window.renderizarDetalhesDoMes(formData.mes, formData.ano);
            }
            
            if (typeof window.carregarDadosDashboard === 'function') {
                await window.carregarDadosDashboard(formData.ano);
            }
            
            console.log('✅ Receita salva com sucesso!');
        } else {
            throw new Error('Falha ao salvar receita');
        }
        
        return false;
        
    } catch (error) {
        console.error("❌ Erro ao salvar receita:", error);
        alert("Erro ao salvar receita: " + error.message);
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
            console.warn('⚠️ Erro ao obter anexos:', error);
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
        const ehEdicao = id !== '' && id !== null && id !== undefined;
        
        const payload = {
            descricao: receita.descricao,
            valor: receita.valor,
            data_recebimento: receita.data,
            mes: mes,
            ano: ano,
            observacoes: receita.observacoes || null
        };
        
        let response;
        
        if (ehEdicao) {
            console.log('✏️ Editando receita via API');
            
            const receitaId = window.dadosFinanceiros[ano]?.meses[mes]?.receitas[id]?.id;
            
            if (!receitaId) {
                throw new Error('ID da receita não encontrado');
            }
            
            response = await fetch(`${API_URL}/receitas/${receitaId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify(payload)
            });
        } else {
            console.log('➕ Criando nova receita via API');
            
            response = await fetch(`${API_URL}/receitas`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify(payload)
            });
        }
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Erro ao salvar receita');
        }
        
        console.log('✅ Receita salva na API:', data);
        
        if (window.sistemaAnexos) {
            window.sistemaAnexos.limparAnexosTemporarios('receita');
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro em salvarReceitaLocal:', error);
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
        
        console.log('✅ Replicação concluída');
        
    } catch (error) {
        console.error('Erro na replicação:', error);
        alert('Erro na replicação: ' + error.message);
    }
}

async function replicarParaMes(receita, mes, ano, dia) {
    try {
        const novaData = new Date(ano, mes, dia);
        
        if (novaData.getMonth() !== mes) {
            const ultimoDia = new Date(ano, mes + 1, 0).getDate();
            novaData.setDate(ultimoDia);
        }
        
        const payload = {
            descricao: receita.descricao,
            valor: receita.valor,
            data_recebimento: novaData.toISOString().split('T')[0],
            mes: mes,
            ano: ano,
            observacoes: receita.observacoes || null
        };
        
       const response = await fetch(`${API_URL}/receitas`, {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
    },
    // SEM credentials: 'include'
    body: JSON.stringify(payload)
});
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Erro ao replicar receita');
        }
        
        console.log(`✅ Receita replicada para ${mes}/${ano}`);
        
    } catch (error) {
        console.error('Erro ao replicar para mês:', error);
        throw error;
    }
}
// ================================================================
// EDITAR E EXCLUIR
// ================================================================

async function editarReceita(index, mes, ano) {
    try {
        console.log('🖊️ Editando receita - Index:', index, 'Mes:', mes, 'Ano:', ano);
        
        const response = await fetch(`${API_URL}/receitas?mes=${mes}&ano=${ano}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Erro ao buscar receitas');
        }
        
        const receitas = data.data;
        
        if (!receitas || !receitas[index]) {
            console.error('❌ Receita não encontrada!');
            alert('Receita não encontrada!');
            return;
        }
        
        const receita = receitas[index];
        
        console.log('📄 Receita encontrada:', receita);
        
        if (receita.saldo_anterior === true || receita.descricao?.includes('Saldo Anterior')) {
            alert('Não é possível editar receitas de saldo anterior. Estas são geradas automaticamente.');
            return;
        }
        
        abrirModalNovaReceita(index, mes, ano);
        
    } catch (error) {
        console.error('❌ Erro ao editar receita:', error);
        alert('Erro ao carregar receita: ' + error.message);
    }
}

async function excluirReceita(index, mes, ano) {
    try {
        const response = await fetch(`${API_URL}/receitas?mes=${mes}&ano=${ano}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Erro ao buscar receitas');
        }
        
        const receitas = data.data;
        
        if (!receitas || !receitas[index]) {
            alert('Receita não encontrada!');
            return;
        }
        
        const receita = receitas[index];
        
        if (receita.saldo_anterior === true || receita.descricao?.includes('Saldo Anterior')) {
            alert('Não é possível excluir receitas de saldo anterior. Estas são geradas automaticamente.');
            return;
        }
        
        const descricaoReceita = receita.descricao;
        
        window.dadosExclusao = {
            id: receita.id,
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
        console.error("Erro ao excluir receita:", error);
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
        if (opcao === 'atual') {
            const receita = window.dadosFinanceiros[ano]?.meses[mes]?.receitas[index];
            
            if (!receita || !receita.id) {
                throw new Error('Receita não encontrada');
            }
            
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
            
            console.log('✅ Receita excluída da API');
            
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
                
                console.log(`✅ ${receitasParaExcluir.length} receita(s) excluída(s)`);
            }
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao excluir receita:', error);
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


async function abrirAbaReservas() {
    const mes = window.mesAberto;
    const ano = window.anoAberto;
    
    if (mes === null || ano === null) return;
    
    document.getElementById('valor-reserva').value = '';
    
    await atualizarResumos(mes, ano);
    await renderizarHistorico(mes, ano);
}


async function atualizarResumos(mes, ano) {
    try {
        const response = await fetch(`${API_URL}/receitas/resumo?mes=${mes}&ano=${ano}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Erro ao buscar resumo');
        }
        
        const { totalReceitas, totalReservas, disponivelParaReservar, totalAcumulado } = data;
        
        document.getElementById('reservas-total-receitas').textContent = window.formatarMoeda(totalReceitas);
        document.getElementById('reservas-ja-reservado').textContent = window.formatarMoeda(totalAcumulado);
        
        const elemDisponivel = document.getElementById('reservas-disponivel');
        elemDisponivel.textContent = window.formatarMoeda(disponivelParaReservar);
        elemDisponivel.style.color = disponivelParaReservar > 0 ? '#27ae60' : '#e74c3c';
        
        const inputValor = document.getElementById('valor-reserva');
        if (inputValor) {
            inputValor.max = disponivelParaReservar.toFixed(2);
        }
        
    } catch (error) {
        console.error('❌ Erro ao atualizar resumos:', error);
    }
}

async function adicionarReserva(e) {
    e.preventDefault();
    
    const mes = window.mesAberto;
    const ano = window.anoAberto;
    const valor = parseFloat(document.getElementById('valor-reserva').value);
    
    if (isNaN(valor) || valor <= 0) {
        return;
    }
    
    try {
        const payload = {
            valor: valor,
            mes: mes,
            ano: ano,
            data: new Date().toISOString().split('T')[0]
        };
        
        const response = await fetch(`${API_URL}/reservas`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Erro ao adicionar reserva');
        }
        
        await atualizarResumos(mes, ano);
        await renderizarHistorico(mes, ano);
        
        document.getElementById('valor-reserva').value = '';
        
        console.log('✅ Reserva adicionada com sucesso');
        
    } catch (error) {
        console.error('❌ Erro ao adicionar reserva:', error);
        alert('Erro ao adicionar reserva: ' + error.message);
    }
}



async function renderizarHistorico(mes, ano) {
    const lista = document.getElementById('lista-historico-reservas');
    if (!lista) return;
    
    try {
        const response = await fetch(`${API_URL}/reservas?mes=${mes}&ano=${ano}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Erro ao buscar reservas');
        }
        
        const reservas = data.data || [];
        lista.innerHTML = '';
        
        if (reservas.length === 0) {
            lista.innerHTML = '<p class="historico-vazio">Nenhuma reserva neste mês.</p>';
            return;
        }
        
        const template = document.getElementById('template-historico-reserva');
        if (!template) return;
        
        reservas.forEach((reserva, index) => {
            const clone = template.content.cloneNode(true);
            
            clone.querySelector('.historico-data').textContent = window.formatarData(reserva.data);
            clone.querySelector('.historico-valor').textContent = window.formatarMoeda(reserva.valor);
            
            const btnRemover = clone.querySelector('.btn-remover-reserva');
            btnRemover.addEventListener('click', () => removerReserva(reserva.id, mes, ano));
            
            lista.appendChild(clone);
        });
        
    } catch (error) {
        console.error('❌ Erro ao renderizar histórico:', error);
        lista.innerHTML = '<p class="historico-erro">Erro ao carregar histórico de reservas.</p>';
    }
}

async function removerReserva(reservaId, mes, ano) {
    try {
        const response = await fetch(`${API_URL}/reservas/${reservaId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Erro ao remover reserva');
        }
        
        await atualizarResumos(mes, ano);
        await renderizarHistorico(mes, ano);
        
        console.log('✅ Reserva removida com sucesso');
        
    } catch (error) {
        console.error('❌ Erro ao remover reserva:', error);
        alert('Erro ao remover reserva: ' + error.message);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        const tabBtnReservas = document.querySelector('.tab-btn[data-tab="tab-reservas"]');
        if (tabBtnReservas) {
            tabBtnReservas.addEventListener('click', abrirAbaReservas);
        }
        
        const form = document.getElementById('form-migrar-reserva');
        if (form) {
            form.addEventListener('submit', adicionarReserva);
        }
    }, 200);
});


// ================================================================
// EXPORTAR FUNÇÕES GLOBAIS
// ================================================================

window.abrirModalNovaReceita = abrirModalNovaReceita;
window.editarReceita = editarReceita;
window.excluirReceita = excluirReceita;
window.processarExclusaoReceita = processarExclusaoReceita;
window.salvarReceita = salvarReceita;
window.renderizarReceitas = renderizarReceitas;
window.buscarEExibirReceitas = buscarEExibirReceitas;
window.calcularTotalReceitas = calcularTotalReceitas;
window.atualizarContadorAnexosReceita = atualizarContadorAnexosReceita;
window.atualizarTodosContadoresAnexosReceitas = atualizarTodosContadoresAnexosReceitas;

console.log('✅ Sistema de receitas carregado com logs de debug');