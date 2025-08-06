// ================================================================
// SISTEMA DE RECEITAS - VERSÃO CORRIGIDA E ASSÍNCRONA
// ================================================================

let processandoReceita = false;

// ================================================================
// RENDERIZAÇÃO DE RECEITAS
// ================================================================

function renderizarReceitas(receitas, fechado) {
    const listaReceitas = document.getElementById('lista-receitas');
    if (!listaReceitas) return;
   
    listaReceitas.innerHTML = '';
   
    // Adicionar saldo anterior se existir
    const saldoAnterior = obterSaldoAnteriorValido(mesAberto, anoAberto);
    if (saldoAnterior !== 0) {
        const trSaldo = criarLinhaSaldoAnterior(saldoAnterior, fechado);
        listaReceitas.appendChild(trSaldo);
    }
   
    // Adicionar receitas
    if (Array.isArray(receitas)) {
        receitas.forEach((receita, index) => {
            const tr = criarLinhaReceita(receita, index, fechado);
            listaReceitas.appendChild(tr);
        });
    }
   
    // Configurar eventos para os botões
    if (!fechado) {
        configurarEventosReceitas(listaReceitas, mesAberto, anoAberto);
    }
}

function criarLinhaSaldoAnterior(saldoAnterior, fechado) {
    const tr = document.createElement('tr');
    tr.className = 'saldo-anterior-row';
    if (fechado) tr.classList.add('transacao-fechada');
   
    const tipoSaldo = saldoAnterior >= 0 ? 'positivo' : 'negativo';
    const descricaoSaldo = saldoAnterior >= 0 ?
        '💰 Saldo Anterior (Positivo)' :
        '🔴 Saldo Anterior (Negativo)';
   
    tr.innerHTML = `
        <td class="col-descricao">
            <span class="saldo-anterior-desc ${tipoSaldo}">${descricaoSaldo}</span>
        </td>
        <td class="col-valor">
            <span class="saldo-anterior-valor ${tipoSaldo}">${formatarMoeda(saldoAnterior)}</span>
        </td>
        <td class="col-data">-</td>
        <td class="col-parcela">-</td>
        <td class="col-acoes">
            <span class="badge-saldo-anterior">AUTOMÁTICO</span>
        </td>
    `;
   
    return tr;
}

function criarLinhaReceita(receita, index, fechado) {
    const tr = document.createElement('tr');
    tr.className = 'receita-row';
    if (fechado) tr.classList.add('transacao-fechada');
   
    // Criar estrutura da linha
    tr.innerHTML = '';
   
    // Coluna Descrição
    const tdDescricao = document.createElement('td');
    tdDescricao.className = 'col-descricao';
    const spanDescricao = document.createElement('span');
    spanDescricao.className = 'receita-descricao';
    spanDescricao.textContent = receita.descricao || 'Sem descrição';
    spanDescricao.title = receita.descricao || 'Sem descrição';
    tdDescricao.appendChild(spanDescricao);
    tr.appendChild(tdDescricao);
   
    // Coluna Valor
    const tdValor = document.createElement('td');
    tdValor.className = 'col-valor';
    const spanValor = document.createElement('span');
    spanValor.className = 'receita-valor';
    spanValor.textContent = formatarMoeda(receita.valor || 0);
    tdValor.appendChild(spanValor);
    tr.appendChild(tdValor);
   
    // Coluna Data
    const tdData = document.createElement('td');
    tdData.className = 'col-data';
    const spanData = document.createElement('span');
    spanData.className = 'receita-data';
    spanData.textContent = formatarData(receita.data || new Date());
    tdData.appendChild(spanData);
    tr.appendChild(tdData);
   
    // Coluna Parcela
    const tdParcela = document.createElement('td');
    tdParcela.className = 'col-parcela';
    const spanParcela = document.createElement('span');
    spanParcela.className = 'receita-parcela';
    spanParcela.textContent = receita.parcela || '-';
    tdParcela.appendChild(spanParcela);
    tr.appendChild(tdParcela);
   
    // Coluna Ações
    const tdAcoes = document.createElement('td');
    tdAcoes.className = 'col-acoes';
    const divAcoes = document.createElement('div');
    divAcoes.className = 'receita-acoes';
   
    // Botão Editar
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
   
    // Botão Excluir
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
   
    tdAcoes.appendChild(divAcoes);
    tr.appendChild(tdAcoes);
   
    return tr;
}

// ================================================================
// CONFIGURAÇÃO DE EVENTOS
// ================================================================

function configurarEventosReceitas(container, mes, ano) {
    // Usar delegação de eventos no container
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn');
        if (!btn) return;
       
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
       
        if (btn.classList.contains('btn-editar')) {
            editarReceita(index, mes, ano);
        } else if (btn.classList.contains('btn-excluir')) {
            excluirReceita(index, mes, ano);
        }
    });
}

// ================================================================
// CÁLCULOS
// ================================================================

function calcularTotalReceitas(receitas) {
    if (!Array.isArray(receitas)) return 0;
    return receitas.reduce((total, receita) => total + parseFloat(receita.valor || 0), 0);
}

function calcularTotalReceitasComSaldo(receitas, mes, ano) {
    const totalReceitas = calcularTotalReceitas(receitas || []);
    const saldoAnterior = obterSaldoAnteriorValido(mes || mesAberto, ano || anoAberto);
    return totalReceitas + saldoAnterior;
}

// ================================================================
// MODAL NOVA RECEITA
// ================================================================

function abrirModalNovaReceita(index) {
    try {
        if (mesAberto === null || anoAberto === null) {
            mesAberto = new Date().getMonth();
            anoAberto = new Date().getFullYear();
        }
     
        const modal = document.getElementById('modal-nova-receita');
        const form = document.getElementById('form-nova-receita');
       
        if (!modal || !form) {
            console.error("Modal ou formulário não encontrado!");
            return;
        }
       
        form.reset();
        processandoReceita = false;
       
        // Resetar estado do formulário
        document.getElementById('opcoes-replicacao-detalhes').classList.add('hidden');
        document.getElementById('selector-ate-container').classList.add('hidden');
        document.getElementById('receita-replicar').checked = false;
        document.getElementById('replicar-todos').checked = true;
       
        document.getElementById('receita-mes').value = mesAberto;
        document.getElementById('receita-ano').value = anoAberto;
       
        const dataAtual = new Date(anoAberto, mesAberto, new Date().getDate());
        document.getElementById('receita-data').value = dataAtual.toISOString().split('T')[0];
       
        if (index !== undefined && dadosFinanceiros[anoAberto]?.meses[mesAberto]?.receitas[index]) {
            const receita = dadosFinanceiros[anoAberto].meses[mesAberto].receitas[index];
            document.getElementById('receita-id').value = index;
            document.getElementById('receita-descricao').value = receita.descricao;
            document.getElementById('receita-valor').value = receita.valor;
            document.getElementById('receita-data').value = receita.data;
        } else {
            document.getElementById('receita-id').value = '';
        }
       
        configurarOpcoesReplicacao();
        modal.style.display = 'block';
       
        // Focar no primeiro campo
        setTimeout(() => {
            document.getElementById('receita-descricao').focus();
        }, 100);
       
    } catch (error) {
        console.error("Erro ao abrir modal:", error);
        alert("Erro ao abrir modal: " + error.message);
    }
}

// ================================================================
// SALVAR RECEITA - CORRIGIDO E TOTALMENTE ASSÍNCRONO
// ================================================================

async function salvarReceita(e) {
    if (e && e.preventDefault) {
        e.preventDefault();
        e.stopPropagation();
    }
   
    if (processandoReceita) {
        console.log('⏳ Receita já sendo processada...');
        return false;
    }
    
    processandoReceita = true;
   
    try {
        console.log('💰 Iniciando salvamento de receita...');
        
        const mes = parseInt(document.getElementById('receita-mes').value);
        const ano = parseInt(document.getElementById('receita-ano').value);
        const id = document.getElementById('receita-id').value;
       
        const descricao = document.getElementById('receita-descricao').value.trim();
        const valor = parseFloat(document.getElementById('receita-valor').value);
       
        // Validações
        if (!descricao) {
            alert('Por favor, informe a descrição da receita.');
            document.getElementById('receita-descricao').focus();
            return false;
        }
       
        if (isNaN(valor) || valor <= 0) {
            alert('Por favor, informe um valor válido para a receita.');
            document.getElementById('receita-valor').focus();
            return false;
        }
       
        // Criar objeto receita
        const novaReceita = {
            descricao: descricao,
            valor: valor,
            data: document.getElementById('receita-data').value,
            parcelado: false,
            parcela: null
        };

        // CORREÇÃO PRINCIPAL: Aguardar usuarioDados estar pronto
        if (window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function') {
            console.log('⏳ Aguardando usuarioDados estar pronto...');
            await window.usuarioDados.aguardarPronto();
        }

        let sucesso = false;

        // Tentar salvar via sistema integrado
        if (window.usuarioDados && typeof window.usuarioDados.salvarReceita === 'function') {
            try {
                console.log('🌐 Salvando receita via sistema integrado...');
                sucesso = await window.usuarioDados.salvarReceita(mes, ano, novaReceita, id);
                if (sucesso) {
                    console.log('✅ Receita salva via sistema integrado');
                }
            } catch (error) {
                console.error('❌ Erro no sistema integrado:', error);
                sucesso = false;
            }
        }

        // Fallback para método direto
        if (!sucesso) {
            console.log('💾 Usando fallback direto...');
            sucesso = await salvarReceitaFallback(mes, ano, novaReceita, id);
        }

        if (sucesso) {
            // Processar replicação se necessário
            if (id === '' || id === null) { // Apenas para receitas novas
                const replicar = document.getElementById('receita-replicar');
                if (replicar && replicar.checked) {
                    await processarReplicacao(novaReceita, mes, ano);
                }
            }

            // Fechar modal
            document.getElementById('modal-nova-receita').style.display = 'none';
           
            // Atualizar interface
            if (typeof renderizarDetalhesDoMes === 'function') {
                renderizarDetalhesDoMes(mes, ano);
            }
           
            if (typeof carregarDadosDashboard === 'function') {
                await carregarDadosDashboard(ano);
            }

            console.log('✅ Receita salva e interface atualizada');
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

// Função de fallback para salvamento direto
async function salvarReceitaFallback(mes, ano, receita, id) {
    try {
        garantirEstruturaDados(ano, mes);
        
        if (id !== '' && id !== null) {
            // Editar receita existente
            const index = parseInt(id);
            if (dadosFinanceiros[ano].meses[mes].receitas[index]) {
                dadosFinanceiros[ano].meses[mes].receitas[index] = receita;
            }
        } else {
            // Adicionar nova receita
            dadosFinanceiros[ano].meses[mes].receitas.push(receita);
        }
        
        const sucessoSalvamento = await salvarDados();
        if (sucessoSalvamento) {
            atualizarSaldosMesesOtimizado(mes, ano);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('❌ Erro no fallback de salvamento:', error);
        return false;
    }
}

// ================================================================
// REPLICAÇÃO DE RECEITAS - CORRIGIDA
// ================================================================

async function processarReplicacao(receita, mes, ano) {
    try {
        console.log('🔄 Processando replicação de receita...');
        
        const tipoReplicacao = document.querySelector('input[name="tipo-replicacao"]:checked')?.value || 'todos';
        const dataReceita = new Date(receita.data);
        const diaReceita = dataReceita.getDate();
       
        if (tipoReplicacao === 'todos') {
            // Replicar para todos os meses futuros do ano
            for (let mesProcesando = mes + 1; mesProcesando < 12; mesProcesando++) {
                await replicarParaMes(receita, mesProcesando, ano, diaReceita);
            }
        } else if (tipoReplicacao === 'ate') {
            // Replicar até o mês selecionado
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
                    garantirEstruturaDados(anoAtual, mesAtual);
                    await replicarParaMes(receita, mesAtual, anoAtual, diaReceita);
                }
            }
        }
        
        // Salvar após replicação
        await salvarDados();
        console.log('✅ Replicação concluída');
        
    } catch (error) {
        console.error('❌ Erro na replicação:', error);
    }
}

async function replicarParaMes(receita, mes, ano, dia) {
    try {
        garantirEstruturaDados(ano, mes);
       
        const receitaReplicada = { ...receita };
        const novaData = new Date(ano, mes, dia);
       
        // Ajustar para último dia do mês se necessário
        if (novaData.getMonth() !== mes) {
            const ultimoDia = new Date(ano, mes + 1, 0).getDate();
            novaData.setDate(ultimoDia);
        }
       
        receitaReplicada.data = novaData.toISOString().split('T')[0];
        dadosFinanceiros[ano].meses[mes].receitas.push(receitaReplicada);
        
    } catch (error) {
        console.error('❌ Erro ao replicar para mês:', error);
    }
}

// ================================================================
// EDITAR E EXCLUIR RECEITAS - CORRIGIDAS
// ================================================================

function editarReceita(index, mes, ano) {
    abrirModalNovaReceita(index);
}

function excluirReceita(index, mes, ano) {
    try {
        if (!dadosFinanceiros[ano]?.meses[mes]?.receitas[index]) {
            alert('Receita não encontrada!');
            return;
        }
       
        const receita = dadosFinanceiros[ano].meses[mes].receitas[index];
        const descricaoReceita = receita.descricao;
       
        // Configurar modal
        const modal = document.getElementById('modal-exclusao-receita');
        const titulo = modal.querySelector('h3');
        const mensagem = modal.querySelector('p');
       
        titulo.textContent = 'Excluir receita';
        mensagem.textContent = `Deseja excluir a receita "${descricaoReceita}"?`;
       
        // Remover listeners antigos dos botões
        const btnExcluirAtual = document.getElementById('btn-excluir-atual');
        const btnExcluirTodas = document.getElementById('btn-excluir-todas');
       
        const novoBtnAtual = btnExcluirAtual.cloneNode(true);
        btnExcluirAtual.parentNode.replaceChild(novoBtnAtual, btnExcluirAtual);
       
        const novoBtnTodas = btnExcluirTodas.cloneNode(true);
        btnExcluirTodas.parentNode.replaceChild(novoBtnTodas, btnExcluirTodas);
       
        // Adicionar novos listeners
        document.getElementById('btn-excluir-atual').addEventListener('click', () => {
            processarExclusaoReceita('atual', index, mes, ano, descricaoReceita);
        });
       
        document.getElementById('btn-excluir-todas').addEventListener('click', () => {
            processarExclusaoReceita('todas', index, mes, ano, descricaoReceita);
        });
       
        // Configurar botão fechar
        const closeBtn = modal.querySelector('.close');
        closeBtn.onclick = () => modal.style.display = 'none';
       
        // Mostrar modal
        modal.style.display = 'block';
       
    } catch (error) {
        console.error("Erro ao excluir receita:", error);
        alert("Erro ao excluir receita: " + error.message);
    }
}

async function processarExclusaoReceita(opcao, index, mes, ano, descricaoReceita) {
    try {
        console.log('🗑️ Iniciando exclusão de receita...', opcao);
        
        // CORREÇÃO: Aguardar sistema estar pronto
        if (window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function') {
            await window.usuarioDados.aguardarPronto();
        }

        let sucesso = false;

        // Tentar excluir via sistema integrado
        if (window.usuarioDados && typeof window.usuarioDados.excluirReceita === 'function') {
            try {
                console.log('🌐 Excluindo receita via sistema integrado...');
                sucesso = await window.usuarioDados.excluirReceita(mes, ano, index, opcao, descricaoReceita);
                if (sucesso) {
                    console.log('✅ Receita excluída via sistema integrado');
                }
            } catch (error) {
                console.error('❌ Erro no sistema integrado:', error);
                sucesso = false;
            }
        }

        // Fallback para exclusão direta
        if (!sucesso) {
            console.log('💾 Usando fallback direto para exclusão...');
            sucesso = await excluirReceitaFallback(opcao, index, mes, ano, descricaoReceita);
        }

        if (sucesso) {
            // Atualizar interface
            if (typeof renderizarDetalhesDoMes === 'function') {
                renderizarDetalhesDoMes(mes, ano);
            }
           
            if (typeof carregarDadosDashboard === 'function') {
                await carregarDadosDashboard(ano);
            }

            console.log('✅ Receita excluída e interface atualizada');
        } else {
            throw new Error('Falha ao excluir receita');
        }
       
        // Fechar modal
        document.getElementById('modal-exclusao-receita').style.display = 'none';
       
    } catch (error) {
        console.error("❌ Erro ao processar exclusão:", error);
        alert("Erro ao processar exclusão: " + error.message);
    }
}

// Função de fallback para exclusão direta
async function excluirReceitaFallback(opcao, index, mes, ano, descricaoReceita) {
    try {
        if (opcao === 'atual') {
            if (dadosFinanceiros[ano]?.meses[mes]?.receitas[index]) {
                dadosFinanceiros[ano].meses[mes].receitas.splice(index, 1);
            }
        } else if (opcao === 'todas') {
            // Excluir todas as receitas com a mesma descrição no ano
            for (let m = 0; m < 12; m++) {
                if (!dadosFinanceiros[ano]?.meses[m]?.receitas) continue;
                
                const receitas = dadosFinanceiros[ano].meses[m].receitas;
                for (let i = receitas.length - 1; i >= 0; i--) {
                    if (receitas[i].descricao === descricaoReceita) {
                        receitas.splice(i, 1);
                    }
                }
            }
        }
        
        const sucessoSalvamento = await salvarDados();
        if (sucessoSalvamento) {
            atualizarSaldosMesesOtimizado(mes, ano);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('❌ Erro no fallback de exclusão:', error);
        return false;
    }
}

// ================================================================
// CONFIGURAÇÃO DE OPÇÕES DE REPLICAÇÃO
// ================================================================

function configurarOpcoesReplicacao() {
    const checkboxReplicar = document.getElementById('receita-replicar');
    const opcoesDetalhes = document.getElementById('opcoes-replicacao-detalhes');
   
    if (checkboxReplicar) {
        checkboxReplicar.onchange = function() {
            if (this.checked) {
                opcoesDetalhes.classList.remove('hidden');
            } else {
                opcoesDetalhes.classList.add('hidden');
            }
        };
    }
   
    // Configurar seletor de ano
    const anoSelect = document.getElementById('replicar-ate-ano');
    if (anoSelect && anoSelect.children.length === 0) {
        const anoAtual = anoAberto || new Date().getFullYear();
        for (let i = 0; i <= 5; i++) {
            const ano = anoAtual + i;
            const option = document.createElement('option');
            option.value = ano;
            option.textContent = ano;
            if (i === 0) option.selected = true;
            anoSelect.appendChild(option);
        }
    }
   
    // Configurar seletor de mês
    const mesSelect = document.getElementById('replicar-ate-mes');
    if (mesSelect) {
        mesSelect.value = '11'; // Dezembro por padrão
    }
}

// ================================================================
// SALDOS E FECHAMENTO DE MÊS
// ================================================================

function obterSaldoAnteriorValido(mes, ano) {
    let mesAnterior = mes - 1;
    let anoAnterior = ano;
   
    if (mes === 0) {
        mesAnterior = 11;
        anoAnterior = ano - 1;
    }
   
    if (!dadosFinanceiros[anoAnterior] || !dadosFinanceiros[anoAnterior].meses) {
        return 0;
    }
   
    const dadosMesAnterior = dadosFinanceiros[anoAnterior].meses[mesAnterior];
   
    if (dadosMesAnterior && dadosMesAnterior.fechado === true) {
        return dadosMesAnterior.saldoFinal || 0;
    }
   
    return 0;
}

function calcularSaldoMes(mes, ano) {
    const dadosMes = dadosFinanceiros[ano]?.meses[mes];
    if (!dadosMes) return { saldoAnterior: 0, receitas: 0, despesas: 0, saldoFinal: 0 };
   
    const saldoAnterior = obterSaldoAnteriorValido(mes, ano);
    const receitasManuais = calcularTotalReceitas(dadosMes.receitas || []);
    const despesas = typeof calcularTotalDespesas === 'function' ?
                    calcularTotalDespesas(dadosMes.despesas || []) : 0;
   
    const receitasTotal = saldoAnterior + receitasManuais;
    const saldoFinal = saldoAnterior + receitasManuais - despesas;
   
    return {
        saldoAnterior,
        receitas: receitasTotal,
        despesas,
        saldoFinal
    };
}

function atualizarSaldoMes(mes, ano) {
    if (!dadosFinanceiros[ano] || !dadosFinanceiros[ano].meses[mes]) return;
   
    const dadosMes = dadosFinanceiros[ano].meses[mes];
   
    if (dadosMes.fechado === undefined) dadosMes.fechado = false;
   
    const saldoAnterior = obterSaldoAnteriorValido(mes, ano);
    const receitas = calcularTotalReceitas(dadosMes.receitas || []);
    const despesas = typeof calcularTotalDespesas === 'function' ?
                    calcularTotalDespesas(dadosMes.despesas || []) : 0;
   
    dadosMes.saldoAnterior = saldoAnterior;
    dadosMes.saldoFinal = saldoAnterior + receitas - despesas;
}

async function atualizarSaldosMesesOtimizado(mes, ano) {
    // Atualizar mês atual
    atualizarSaldoMes(mes, ano);
   
    // Atualizar próximo mês se existir
    let proximoMes = mes + 1;
    let proximoAno = ano;
   
    if (proximoMes > 11) {
        proximoMes = 0;
        proximoAno = ano + 1;
    }
   
    if (dadosFinanceiros[proximoAno] && dadosFinanceiros[proximoAno].meses[proximoMes]) {
        atualizarSaldoMes(proximoMes, proximoAno);
    }
   
    await salvarDados();
}

async function fecharMes(mes, ano) {
    const dadosMes = dadosFinanceiros[ano]?.meses[mes];
    if (!dadosMes || dadosMes.fechado) {
        alert('Mês já está fechado ou não existe!');
        return false;
    }
   
    const saldo = calcularSaldoMes(mes, ano);
    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                       'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
   
    const proximoMes = mes + 1;
    const proximoAno = proximoMes > 11 ? ano + 1 : ano;
    const proximoMesAjustado = proximoMes > 11 ? 0 : proximoMes;
    const nomeProximoMes = proximoMes > 11 ? `Janeiro/${proximoAno}` : `${nomesMeses[proximoMes]}/${ano}`;
   
    const mensagem = `Fechar ${nomesMeses[mes]} de ${ano}?\n\n` +
                    `Saldo final: ${formatarMoeda(saldo.saldoFinal)}\n\n` +
                    `✅ Este saldo será transferido para ${nomeProximoMes}`;
   
    if (!confirm(mensagem)) return false;
   
    dadosMes.fechado = true;
    dadosMes.dataFechamento = new Date().toISOString().split('T')[0];
   
    await atualizarSaldosMesesOtimizado(mes, ano);
   
    if (typeof renderizarMeses === 'function') {
        renderizarMeses(ano);
    }
   
    alert(`${nomesMeses[mes]} fechado com sucesso!\n\n💰 Saldo de ${formatarMoeda(saldo.saldoFinal)} transferido para ${nomeProximoMes}`);
    return true;
}

async function reabrirMes(mes, ano) {
    const dadosMes = dadosFinanceiros[ano]?.meses[mes];
    if (!dadosMes || !dadosMes.fechado) {
        alert('Mês já está aberto ou não existe!');
        return false;
    }
   
    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                       'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
   
    const mensagem = `Reabrir ${nomesMeses[mes]} de ${ano}?\n\n` +
                    `⚠️ O próximo mês terá seu saldo recalculado`;
   
    if (!confirm(mensagem)) return false;
   
    dadosMes.fechado = false;
    dadosMes.dataFechamento = null;
   
    await atualizarSaldosMesesOtimizado(mes, ano);
   
    if (typeof renderizarMeses === 'function') {
        renderizarMeses(ano);
    }
   
    alert(`${nomesMeses[mes]} reaberto com sucesso!`);
    return true;
}

// ================================================================
// FECHAMENTO AUTOMÁTICO
// ================================================================

function verificarFechamentoAutomatico() {
    const hoje = new Date();
    if (hoje.getDate() !== 1) return;
   
    const mesAtual = hoje.getMonth();
    const anoAtual = hoje.getFullYear();
   
    let mesAnterior = mesAtual - 1;
    let anoAnterior = anoAtual;
   
    if (mesAnterior < 0) {
        mesAnterior = 11;
        anoAnterior = anoAtual - 1;
    }
   
    const dadosMesAnterior = dadosFinanceiros[anoAnterior]?.meses[mesAnterior];
   
    if (dadosMesAnterior && !dadosMesAnterior.fechado) {
        const temTransacoes = (dadosMesAnterior.receitas && dadosMesAnterior.receitas.length > 0) ||
                             (dadosMesAnterior.despesas && dadosMesAnterior.despesas.length > 0);
       
        if (temTransacoes) {
            fecharMesAutomatico(mesAnterior, anoAnterior);
        }
    }
}

async function fecharMesAutomatico(mes, ano) {
    const dadosMes = dadosFinanceiros[ano]?.meses[mes];
    if (!dadosMes || dadosMes.fechado) return false;
   
    dadosMes.fechado = true;
    dadosMes.dataFechamento = new Date().toISOString().split('T')[0];
    dadosMes.fechadoAutomaticamente = true;
   
    await atualizarSaldosMesesOtimizado(mes, ano);
   
    if (typeof renderizarMeses === 'function') {
        renderizarMeses(ano);
    }
   
    return true;
}

// ================================================================
// FUNÇÕES GLOBAIS PARA O HTML
// ================================================================

window.toggleReplicacaoReceita = function(checkbox) {
    const opcoes = document.getElementById('opcoes-replicacao-detalhes');
    if (checkbox.checked) {
        opcoes.classList.remove('hidden');
    } else {
        opcoes.classList.add('hidden');
    }
};

window.toggleSeletorAte = function() {
    const selectorContainer = document.getElementById('selector-ate-container');
    const radioAte = document.getElementById('replicar-ate');
   
    if (radioAte && radioAte.checked) {
        selectorContainer.classList.remove('hidden');
    } else {
        selectorContainer.classList.add('hidden');
    }
};

window.handleSalvarReceita = function(event) {
    event.preventDefault();
    salvarReceita(event);
    return false;
};

window.handleNovaReceita = function() {
    abrirModalNovaReceita();
};

window.handleFecharMes = function() {
    if (mesAberto !== null && anoAberto !== null) {
        fecharMes(mesAberto, anoAberto);
    }
};

window.handleReabrirMes = function() {
    if (mesAberto !== null && anoAberto !== null) {
        reabrirMes(mesAberto, anoAberto);
    }
};

// ================================================================
// INICIALIZAÇÃO
// ================================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Inicializando sistema de receitas...');
    
    // Aguardar um pouco para garantir que outros sistemas estejam prontos
    setTimeout(() => {
        inicializarFormularioReceitas();
        configurarEventosReceitas();
        verificarFechamentoAutomaticoInicial();
        console.log('✅ Sistema de receitas inicializado');
    }, 500);
});

function inicializarFormularioReceitas() {
    // Remover handler inline antigo se existir
    const form = document.getElementById('form-nova-receita');
    if (form) {
        // Remover o onsubmit inline
        form.removeAttribute('onsubmit');
       
        // Clonar para remover todos os event listeners antigos
        const novoForm = form.cloneNode(true);
        form.parentNode.replaceChild(novoForm, form);
       
        // Adicionar apenas um event listener assíncrono
        document.getElementById('form-nova-receita').addEventListener('submit', async function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            try {
                await salvarReceita(e);
            } catch (error) {
                console.error('❌ Erro no submit do formulário:', error);
                alert('Erro ao salvar receita: ' + error.message);
            }
            
            return false;
        });
    }
}

function configurarEventosReceitas() {
    // Configurar eventos de replicação
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
   
    // Configurar radio buttons de tipo de replicação
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
   
    // Fechar modais ao clicar no X
    document.querySelectorAll('#modal-nova-receita .close, #modal-exclusao-receita .close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });
}

function verificarFechamentoAutomaticoInicial() {
    // Verificar fechamento automático
    const ultimaVerificacao = localStorage.getItem('ultima_verificacao_fechamento');
    const hoje = new Date().toDateString();
   
    if (ultimaVerificacao !== hoje) {
        setTimeout(() => {
            verificarFechamentoAutomatico();
            localStorage.setItem('ultima_verificacao_fechamento', hoje);
        }, 1000); // Aguardar 1 segundo para outros sistemas estarem prontos
    }
}

// ================================================================
// EXPORTAR FUNÇÕES GLOBAIS
// ================================================================

window.fecharMes = fecharMes;
window.reabrirMes = reabrirMes;
window.calcularSaldoMes = calcularSaldoMes;
window.atualizarSaldosMesesOtimizado = atualizarSaldosMesesOtimizado;
window.atualizarSaldoMes = atualizarSaldoMes;
window.obterSaldoAnteriorValido = obterSaldoAnteriorValido;
window.abrirModalNovaReceita = abrirModalNovaReceita;
window.editarReceita = editarReceita;
window.excluirReceita = excluirReceita;
window.processarExclusaoReceita = processarExclusaoReceita;
window.salvarReceita = salvarReceita;
window.renderizarReceitas = renderizarReceitas;
window.calcularTotalReceitas = calcularTotalReceitas;
window.calcularTotalReceitasComSaldo = calcularTotalReceitasComSaldo;
window.verificarFechamentoAutomatico = verificarFechamentoAutomatico;
window.fecharMesAutomatico = fecharMesAutomatico;

console.log('📦 Sistema de receitas carregado - aguardando inicialização completa...');