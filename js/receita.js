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
// INDICADORES
// ================================================================

function atualizarBarraReceitasDespesas() {
    const mes = window.mesAberto;
    const ano = window.anoAberto;
    if (mes === null || ano === null) return;

    const receitas = window.dadosFinanceiros[ano]?.meses[mes]?.receitas || [];
    const despesas = window.dadosFinanceiros[ano]?.meses[mes]?.despesas || [];

    const saldo = typeof window.calcularSaldoMes === 'function'
        ? window.calcularSaldoMes(mes, ano) : { saldoAnterior: 0 };
    const saldoAnterior = saldo.saldoAnterior || 0;
    const totalReceitas = calcularTotalReceitas(receitas);

    const reservasAcumuladas = typeof window.calcularMovimentacoesReservasAcumuladas === 'function'
        ? (window.calcularMovimentacoesReservasAcumuladas(mes, ano) || 0) : 0;

    // Base disponível para despesas (sem reservas)
    const base = saldoAnterior + totalReceitas - reservasAcumuladas;

    // Despesas realizadas (pagas) = barra sólida
    const despesasPagas = despesas.filter(d => d.ja_pago).reduce((s, d) => s + (parseFloat(d.valor) || 0), 0);
    // Despesas totais (projetadas) para calcular % exibida
    const despesasTotal = despesas.reduce((s, d) => s + (parseFloat(d.valor) || 0), 0);

    const percentualPago = base > 0 ? (despesasPagas / base) * 100 : 0;
    const percentualTotal = base > 0 ? (despesasTotal / base) * 100 : 0;
    const disponivel = base - despesasTotal;

    // ---- Textos informativos ----
    const elDespesas = document.getElementById('barra-rd-despesas');
    const elReceitas = document.getElementById('barra-rd-receitas');
    const elPercentual = document.getElementById('barra-rd-percentual');
    const elDisponivel = document.getElementById('barra-rd-disponivel');

    if (elDespesas) elDespesas.textContent = window.formatarMoeda(despesasTotal);
    if (elReceitas) elReceitas.textContent = window.formatarMoeda(base);
    if (elPercentual) elPercentual.textContent = `${percentualTotal.toFixed(1)}% usado`;
    if (elDisponivel) {
        elDisponivel.textContent = window.formatarMoeda(disponivel);
        elDisponivel.style.color = disponivel >= 0 ? '' : '#dc3545';
    }

    // ---- Cor dinâmica por % ----
    const statusClass = percentualTotal >= 90 ? 'status-critico'
        : percentualTotal >= 70 ? 'status-alerta'
        : 'status-ok';

    // ---- Barra projetada (sólida) — despesas totais ----
    const elProjetado = document.getElementById('barra-rd-projetado');
    if (elProjetado) {
        elProjetado.style.width = `${Math.min(percentualTotal, 100)}%`;
        elProjetado.classList.remove('status-ok', 'status-alerta', 'status-critico');
        elProjetado.classList.add(statusClass);
    }

    // ---- Barra real (translúcida) — despesas pagas ----
    const elProgresso = document.getElementById('barra-rd-progresso');
    if (elProgresso) {
        elProgresso.style.width = `${Math.min(percentualPago, 100)}%`;
        elProgresso.classList.remove('status-ok', 'status-alerta', 'status-critico');
        elProgresso.classList.add(statusClass);
    }

}
window.atualizarBarraReceitasDespesas = atualizarBarraReceitasDespesas;

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
        const saldoFinal = dadosMesAnterior.saldoFinal || 0;
        const reservas = typeof window.calcularTotalReservasAcumuladas === 'function'
            ? window.calcularTotalReservasAcumuladas(mesAnterior, anoAnterior)
            : 0;
        return saldoFinal - reservas;
    }

    return 0;
}

// ================================================================
// MODAL RECEITA - REFATORADO COMPLETAMENTE
// ================================================================

function abrirModalNovaReceita(index, mes, ano) {
    try {
        const mesReceita = mes !== undefined ? mes : (window.mesAberto ?? new Date().getMonth());
        const anoReceita = ano !== undefined ? ano : (window.anoAberto ?? new Date().getFullYear());
        
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
        
        if (receitaExiste) {
            const receita = receitas[index];
            
            
            if (receita.saldoAnterior === true || receita.descricao?.includes('Saldo Anterior')) {
                (window.mostrarToast || alert)('Não é possível editar receitas de saldo anterior.', 'warning');
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
        atualizarIndicadorMesReceita();
        modal.style.display = 'block';
        
        setTimeout(() => {
            document.getElementById('receita-descricao').focus();
        }, 100);
        
    } catch (error) {
        (window.mostrarToast || alert)("Erro ao abrir modal: " + error.message, 'error');
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
        (window.mostrarToast || alert)('Sistema ainda carregando. Aguarde alguns segundos e tente novamente.', 'info');
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


            document.getElementById('modal-nova-receita').style.display = 'none';

            if (window.mostrarMensagemSucesso) {
                window.mostrarMensagemSucesso(ehEdicao ? 'Receita atualizada com sucesso!' : 'Receita cadastrada com sucesso!');
            }

            if (typeof window.renderizarDetalhesDoMes === 'function') {
                await window.renderizarDetalhesDoMes(formData.mes, formData.ano);
            }
            if (typeof window.carregarDadosDashboardLocal === 'function') {
                window.carregarDadosDashboardLocal(formData.ano);
            }

        } else {
            (window.mostrarToast || alert)('Não foi possível salvar a receita. Tente novamente.', 'error');
        }

        return false;

    } catch (error) {
        (window.mostrarToast || alert)('Erro ao salvar receita: ' + error.message, 'error');
        return false;
    } finally {
        processandoReceita = false;
    }
}

function coletarDadosFormulario() {
    const idValue = document.getElementById('receita-id').value;
    const data = document.getElementById('receita-data').value;
    const d = new Date(data + 'T00:00:00');

    return {
        id: idValue,
        mes: d.getMonth(),
        ano: d.getFullYear(),
        descricao: document.getElementById('receita-descricao').value.trim(),
        valor: parseFloat(document.getElementById('receita-valor').value),
        data
    };
}

function validarDadosFormulario(formData) {
    if (!formData.descricao) {
        (window.mostrarToast || alert)('Por favor, informe a descrição da receita.', 'warning');
        document.getElementById('receita-descricao').focus();
        return false;
    }

    if (isNaN(formData.valor) || formData.valor <= 0) {
        (window.mostrarToast || alert)('Por favor, informe um valor válido para a receita.', 'warning');
        document.getElementById('receita-valor').focus();
        return false;
    }

    if (isNaN(formData.mes) || formData.mes < 0 || formData.mes > 11) {
        (window.mostrarToast || alert)('Mês inválido.', 'error');
        return false;
    }

    if (isNaN(formData.ano) || formData.ano < 2020 || formData.ano > 2050) {
        (window.mostrarToast || alert)('Ano inválido.', 'error');
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

        if (window.usuarioDataManager && typeof window.usuarioDataManager.salvarReceita === 'function') {
            const sucesso = await window.usuarioDataManager.salvarReceita(mes, ano, receita, id);

            if (sucesso) {
                if (typeof window.buscarReceitasAPI === 'function') {
                    const receitasAtualizadas = await window.buscarReceitasAPI(mes, ano);
                    if (receitasAtualizadas) {
                        window.garantirEstruturaDados(ano, mes);
                        window.dadosFinanceiros[ano].meses[mes].receitas = receitasAtualizadas;
                    }
                }

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

        // Fallback localStorage
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
            (window.mostrarToast || alert)('Não é possível editar receitas de saldo anterior. Estas são geradas automaticamente.', 'warning');
            return;
        }
    } else {
        (window.mostrarToast || alert)('Receita não encontrada!', 'error');
        return;
    }
    
    abrirModalNovaReceita(index, mes, ano);
}

function excluirReceita(index, mes, ano) {
    try {
        if (!window.dadosFinanceiros[ano]?.meses[mes]?.receitas[index]) {
            (window.mostrarToast || alert)('Receita não encontrada!', 'error');
            return;
        }

        const receita = window.dadosFinanceiros[ano].meses[mes].receitas[index];

        if (receita.saldoAnterior === true || receita.descricao.includes('Saldo Anterior')) {
            (window.mostrarToast || alert)('Não é possível excluir receitas de saldo anterior. Estas são geradas automaticamente.', 'warning');
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
        (window.mostrarToast || alert)("Erro ao excluir receita: " + error.message, 'error');
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
        (window.mostrarToast || alert)("Erro ao processar exclusão: " + error.message, 'error');
        throw error;
    }
}

async function excluirReceitaLocal(opcao, index, mes, ano, descricaoReceita) {
    try {
        let valorExcluido = 0;

        if (opcao === 'atual') {
            const receita = window.dadosFinanceiros[ano]?.meses[mes]?.receitas[index];

            if (!receita) throw new Error('Receita não encontrada');

            if (!receita.id) {
                (window.mostrarToast || alert)('Erro: Receita sem identificador. Por favor, recarregue a página.', 'error');
                return false;
            }

            valorExcluido = receita.valor;

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
            const perfilId = typeof window.getPerfilAtivo === 'function' ? window.getPerfilAtivo() : null;
            const urlTodasReceitas = perfilId
                ? `${API_URL}/receitas?ano=${ano}&perfil_id=${perfilId}`
                : `${API_URL}/receitas?ano=${ano}`;
            const response = await fetch(urlTodasReceitas, {
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
// FUNÇÕES DE EXCLUSÃO
// ================================================================

async function excluirAtual() {
    if (window.dadosExclusao) {
        const modal = document.getElementById('modal-exclusao-receita');
        const btn = document.getElementById('btn-excluir-atual');
        if (btn) { btn.disabled = true; btn.classList.add('btn-loading'); }
        try {
            await processarExclusaoReceita('atual', window.dadosExclusao.index, window.dadosExclusao.mes, window.dadosExclusao.ano, window.dadosExclusao.descricao);
            if (modal) modal.style.display = 'none';
        } finally {
            if (btn) { btn.disabled = false; btn.classList.remove('btn-loading'); }
        }
    }
}

async function excluirTodas() {
    if (window.dadosExclusao) {
        const modal = document.getElementById('modal-exclusao-receita');
        const btn = document.getElementById('btn-excluir-todas');
        if (btn) { btn.disabled = true; btn.classList.add('btn-loading'); }
        try {
            await processarExclusaoReceita('todas', window.dadosExclusao.index, window.dadosExclusao.mes, window.dadosExclusao.ano, window.dadosExclusao.descricao);
            if (modal) modal.style.display = 'none';
        } finally {
            if (btn) { btn.disabled = false; btn.classList.remove('btn-loading'); }
        }
    }
}

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

const NOMES_MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function atualizarIndicadorMesReceita() {
    const data = document.getElementById('receita-data')?.value;
    const indicador = document.getElementById('receita-mes-indicador');
    if (!indicador) return;
    if (data) {
        const d = new Date(data + 'T00:00:00');
        indicador.textContent = `→ ${NOMES_MESES[d.getMonth()]} ${d.getFullYear()}`;
    } else {
        indicador.textContent = '';
    }
}

function inicializarEventListeners() {
    const form = document.getElementById('form-nova-receita');
    if (form) {
        form.addEventListener('submit', salvarReceita);
    }

    const btnNovaReceita = document.getElementById('btn-nova-receita');
    if (btnNovaReceita) {
        btnNovaReceita.addEventListener('click', () => abrirModalNovaReceita());
    }

    const inputData = document.getElementById('receita-data');
    if (inputData) {
        inputData.addEventListener('change', atualizarIndicadorMesReceita);
    }

    configurarEventListenersAnexos();
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
                (window.mostrarToast || alert)('Sistema de anexos não disponível', 'warning');
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

window.toggleReplicarReceita = toggleReplicarReceita;

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
        btnExcluirAtual.addEventListener('click', excluirAtual);
    }

    const btnExcluirTodas = document.getElementById('btn-excluir-todas');
    if (btnExcluirTodas) {
        btnExcluirTodas.addEventListener('click', excluirTodas);
    }
}


// ================================================================
// SALDO ANTERIOR NA TOOLBAR
// ================================================================

function atualizarSaldoAnteriorToolbar() {
    const spanAnt = document.getElementById('saldo-anterior-toolbar');
    const cardAnt = document.getElementById('saldo-anterior-toolbar-card');
    const sepAnt  = document.getElementById('saldo-sep-ant');

    const spanReal = document.getElementById('saldo-real-toolbar');
    const cardReal = document.getElementById('saldo-real-toolbar-card');
    const sepReal  = document.getElementById('saldo-sep-real');

    const spanProjetado = document.getElementById('saldo-projetado-toolbar');
    const cardProjetado = document.getElementById('saldo-projetado-toolbar-card');

    const mes = window.mesAberto;
    const ano = window.anoAberto;

    function ocultarCard(card, sep) {
        if (card) card.classList.add('hidden');
        if (sep)  sep.classList.add('hidden');
    }
    function mostrarCard(card, sep) {
        if (card) card.classList.remove('hidden');
        if (sep)  sep.classList.remove('hidden');
    }

    // Ocultar tudo se não há mês aberto
    if (mes === undefined || ano === undefined) {
        ocultarCard(cardAnt, sepAnt);
        ocultarCard(cardReal, sepReal);
        ocultarCard(cardProjetado, null);
        return;
    }

    // --- Saldo Anterior ---
    const valorAnt = obterSaldoAnteriorValido(mes, ano);
    if (spanAnt) {
        spanAnt.textContent = window.formatarMoeda(valorAnt);
        spanAnt.classList.remove('saldo-positivo', 'saldo-negativo');
        spanAnt.classList.add(valorAnt >= 0 ? 'saldo-positivo' : 'saldo-negativo');
    }
    mostrarCard(cardAnt, sepAnt);

    // --- Saldo Real e Projetado ---
    const saldo = typeof window.calcularSaldoMes === 'function'
        ? window.calcularSaldoMes(mes, ano)
        : null;

    let movimentacoesAcumuladas = 0;
    if (typeof window.calcularTotalReservasAcumuladas === 'function') {
        movimentacoesAcumuladas = window.calcularTotalReservasAcumuladas(mes, ano);
    }

    const temTransacoes = saldo && (saldo.receitas > 0 || saldo.despesas > 0 || saldo.despesasTotal > 0);

    if (saldo && temTransacoes) {
        const saldoReal = saldo.saldoFinal - movimentacoesAcumuladas;
        const saldoProjetado = saldo.saldoProjetado - movimentacoesAcumuladas;

        if (spanReal) {
            spanReal.textContent = window.formatarMoeda(saldoReal);
            spanReal.classList.remove('saldo-positivo', 'saldo-negativo');
            spanReal.classList.add(saldoReal >= 0 ? 'saldo-positivo' : 'saldo-negativo');
        }
        mostrarCard(cardReal, sepReal);

        // Mostrar projetado apenas se difere do real (há despesas não pagas)
        const temDespesasNaoPagas = Math.round(saldoProjetado * 100) !== Math.round(saldoReal * 100);
        if (temDespesasNaoPagas) {
            if (spanProjetado) {
                spanProjetado.textContent = window.formatarMoeda(saldoProjetado);
                spanProjetado.classList.remove('saldo-positivo', 'saldo-negativo');
                spanProjetado.classList.add(saldoProjetado >= 0 ? 'saldo-positivo' : 'saldo-negativo');
            }
            mostrarCard(cardProjetado, null);
        } else {
            ocultarCard(cardProjetado, null);
        }
    } else {
        ocultarCard(cardReal, sepReal);
        ocultarCard(cardProjetado, null);
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
window.calcularTotalReceitas = calcularTotalReceitas;
window.atualizarSaldoAnteriorToolbar = atualizarSaldoAnteriorToolbar;


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
        const perfilId = typeof window.getPerfilAtivo === 'function' ? window.getPerfilAtivo() : null;
        const perfilQuery = perfilId ? `?perfil_id=${perfilId}` : '';
        const [reservasResponse, movimentacoesResponse] = await Promise.all([
            fetch(`${API_URL_RESERVAS}/reservas${perfilQuery}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch(`${API_URL_RESERVAS}/reservas/movimentacoes/todas?limite=1000${perfilId ? `&perfil_id=${perfilId}` : ''}`, {
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
window.calcularMovimentacoesReservasAcumuladas = calcularMovimentacoesReservasAcumuladas;
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
        (window.mostrarToast || alert)('Selecione um mês primeiro', 'warning');
        return;
    }

    // Verificar se o mês está fechado
    if (mesFechadoAtual()) {
        const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                           'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const msg = `O mês de ${nomesMeses[window.mesAberto]}/${window.anoAberto} está fechado. Não é possível gerenciar reservas.`;
        (window.mostrarToast || alert)(msg, 'warning');
        return;
    }

    // Carregar reservas do backend
    await carregarReservasAPI();

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
        modal.style.display = 'block';
    }
}

/**
 * Calcula o valor atual de uma reserva a partir do cache de movimentações
 */
function _calcularValorAtualReserva(reservaId) {
    const movs = window.movimentacoesReservasCache || [];
    return movs
        .filter(m => m.reserva_id === reservaId)
        .reduce((acc, m) => m.tipo === 'entrada' ? acc + parseFloat(m.valor) : acc - parseFloat(m.valor), 0);
}

/**
 * Renderiza lista de reservas com cards modernos e unificados
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

    const hoje = new Date();

    // Separar reservas simples de objetivos
    const simples   = [...window.reservasCache].filter(r => r.tipo_reserva !== 'objetivo').sort((a,b) => (a.observacoes||'').localeCompare(b.observacoes||''));
    const objetivos = [...window.reservasCache].filter(r => r.tipo_reserva === 'objetivo').sort((a,b) => (a.observacoes||'').localeCompare(b.observacoes||''));

    const renderGrupo = (grupo, secaoLabel) => {
        if (grupo.length === 0) return;
        const sec = document.createElement('div');
        sec.className = 'reserva-secao-label';
        sec.textContent = secaoLabel;
        lista.appendChild(sec);
        grupo.forEach(reserva => renderCard(reserva));
    };

    const renderCard = (reserva) => {
        const temMeta = reserva.tipo_reserva === 'objetivo' && parseFloat(reserva.objetivo_valor) > 0;
        const valorAtual = _calcularValorAtualReserva(reserva.id);
        const valorMeta = parseFloat(reserva.objetivo_valor) || 0;
        const valorExibir = valorAtual !== 0 ? valorAtual : parseFloat(reserva.valor) || 0;

        // Barra de progresso da meta
        let metaHtml = '';
        let metaCor = '';
        if (temMeta) {
            const pct = valorMeta > 0 ? Math.min((valorAtual / valorMeta) * 100, 100) : 0;
            const cor = pct >= 75 ? 'verde' : pct >= 40 ? 'amarelo' : 'vermelho';
            metaCor = cor;
            let diasHtml = '';
            if (reserva.data_objetivo) {
                const dataAlvo = new Date(reserva.data_objetivo + 'T00:00:00');
                const diffDias = Math.ceil((dataAlvo - hoje) / (1000 * 60 * 60 * 24));
                const diasCor = diffDias > 60 ? 'verde' : diffDias > 0 ? 'laranja' : 'vermelho';
                diasHtml = `<span class="reserva-meta-dias ${diasCor}"><i class="fas fa-calendar-alt"></i> ${diffDias > 0 ? diffDias + ' dias restantes' : 'Prazo vencido'}</span>`;
            }
            metaHtml = `
                <div class="reserva-meta-info">
                    <div class="reserva-meta-bar-row">
                        <div class="reserva-meta-bar-track"><div class="reserva-meta-bar-fill ${cor}" style="width:${pct.toFixed(1)}%"></div></div>
                        <span class="reserva-meta-pct ${cor}">${pct.toFixed(0)}%</span>
                    </div>
                    <div class="reserva-meta-texto">
                        <span class="reserva-meta-valores">${window.formatarMoeda(valorAtual)} <span style="opacity:0.45">/</span> ${window.formatarMoeda(valorMeta)}</span>
                        ${diasHtml}
                    </div>
                </div>`;
        }

        // Painel de meta (oculto por padrão)
        const painelMetaHtml = `
            <div class="reserva-meta-painel" id="meta-painel-${reserva.id}" style="display:none">
                <div class="reserva-meta-painel-inputs">
                    <input type="number" id="meta-valor-${reserva.id}" placeholder="Valor da meta (R$)" step="0.01" min="0" value="${temMeta ? valorMeta : ''}">
                    <input type="date" id="meta-data-${reserva.id}" value="${reserva.data_objetivo ? reserva.data_objetivo.split('T')[0] : ''}">
                </div>
                <div class="reserva-meta-painel-acoes">
                    <button class="btn btn-sm btn-success" onclick="salvarMetaReserva(${reserva.id}, parseFloat(document.getElementById('meta-valor-${reserva.id}').value)||0, document.getElementById('meta-data-${reserva.id}').value)">
                        <i class="fas fa-check"></i> Salvar
                    </button>
                    ${temMeta ? `<button class="btn btn-sm btn-secondary" onclick="salvarMetaReserva(${reserva.id}, 0, null)"><i class="fas fa-times"></i> Remover</button>` : ''}
                </div>
            </div>`;

        const card = document.createElement('div');
        const metaClass = temMeta ? ` tem-meta meta-${metaCor}` : '';
        card.className = `reserva-card${metaClass}`;
        card.dataset.reservaId = reserva.id;
        card.innerHTML = `
            <div class="reserva-card-top">
                <div class="reserva-card-info">
                    <div class="reserva-card-nome">${reserva.observacoes || 'Reserva'}</div>
                    <div class="reserva-card-valor">${window.formatarMoeda(valorExibir)}<span class="reserva-card-valor-label">guardado</span></div>
                </div>
                <div class="reserva-card-acoes">
                    <button class="reserva-btn reserva-btn-meta${temMeta ? ' ativo' : ''}" title="${temMeta ? 'Editar meta' : 'Definir meta'}"><i class="fas fa-bullseye"></i></button>
                    <button class="reserva-btn reserva-btn-excluir" title="Excluir reserva"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <div class="reserva-mov-inline">
                <input type="number" id="mov-valor-${reserva.id}" placeholder="+ adicionar  ·  − retirar" step="0.01">
                <button class="reserva-btn-mover">Mover</button>
            </div>
            ${metaHtml}
            ${painelMetaHtml}
        `;

        card.querySelector('.reserva-btn-meta').addEventListener('click', () => togglePainelMeta(reserva.id));
        card.querySelector('.reserva-btn-excluir').addEventListener('click', () => excluirReserva(reserva.id));
        card.querySelector('.reserva-btn-mover').addEventListener('click', () => moverReserva(reserva.id));
        card.querySelector(`#mov-valor-${reserva.id}`).addEventListener('keydown', e => {
            if (e.key === 'Enter') moverReserva(reserva.id);
        });

        lista.appendChild(card);
    }; // fim renderCard

    renderGrupo(simples, 'Reservas');
    renderGrupo(objetivos, 'Objetivos');

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
        (window.mostrarToast || alert)('Mês fechado. Não é possível movimentar reservas.', 'warning');
        return;
    }

    if (isNaN(valor) || valor === 0) {
        (window.mostrarToast || alert)('Informe um valor válido', 'warning');
        return;
    }

    const tipo = valor > 0 ? 'entrada' : 'saida';
    const valorAbsoluto = Math.abs(valor);

    // Se for entrada (valor positivo), validar se tem saldo disponível no mês atual
    if (tipo === 'entrada') {
        const { saldoAtualMes } = calcularSaldoAtualMes();

        if (valorAbsoluto > saldoAtualMes) {
            const msg = `Valor indisponível para reserva. Disponível: ${window.formatarMoeda(saldoAtualMes)}`;
            (window.mostrarToast || alert)(msg, 'warning');
            return;
        }
    }

    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (!token) {
        (window.mostrarToast || alert)('Sessão expirada.', 'error');
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
            (window.mostrarToast || alert)(error.message || 'Erro', 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        (window.mostrarToast || alert)('Erro ao processar', 'error');
    }
}

// Estado do histórico para infinite scroll
const _historicoState = { offset: 0, limite: 20, total: 0, carregando: false, observer: null };

function _renderLinhaHistorico(mov) {
    const dataHora = new Date(mov.data_hora);
    const dataFormatada = dataHora.toLocaleDateString('pt-BR');
    const horaFormatada = dataHora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const isEntrada = mov.tipo === 'entrada';
    return `<div class="historico-linha ${isEntrada ? 'entrada' : 'saida'}">
        <span class="hist-nome">${mov.nome_reserva || 'Reserva'}</span>
        <span class="hist-valor ${isEntrada ? 'positivo' : 'negativo'}">${isEntrada ? '+' : '-'}${window.formatarMoeda(mov.valor)}</span>
        <span class="hist-data">${dataFormatada} ${horaFormatada}</span>
    </div>`;
}

async function _carregarMaisHistorico() {
    if (_historicoState.carregando) return;
    if (_historicoState.offset > 0 && _historicoState.offset >= _historicoState.total) return;

    _historicoState.carregando = true;
    const container = document.getElementById('historico-geral-reservas');
    if (!container) { _historicoState.carregando = false; return; }

    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (!token) { _historicoState.carregando = false; return; }

    try {
        const url = `${API_URL_RESERVAS}/reservas/movimentacoes/todas?limite=${_historicoState.limite}&offset=${_historicoState.offset}`;
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) throw new Error();

        const data = await response.json();
        const movs = data.data || [];
        _historicoState.total = data.total || 0;
        _historicoState.offset += movs.length;

        if (_historicoState.offset === movs.length && movs.length === 0) {
            container.innerHTML = '<div class="historico-vazio">Nenhuma movimentação</div>';
        } else {
            container.insertAdjacentHTML('beforeend', movs.map(_renderLinhaHistorico).join(''));
        }
    } catch {
        if (_historicoState.offset === 0) container.innerHTML = '<div class="historico-vazio">Erro ao carregar histórico</div>';
    } finally {
        _historicoState.carregando = false;
    }
}

async function renderizarHistoricoGeral() {
    const container = document.getElementById('historico-geral-reservas');
    if (!container) return;

    // Reset estado
    _historicoState.offset = 0;
    _historicoState.total = 0;
    _historicoState.carregando = false;
    container.innerHTML = '';

    await _carregarMaisHistorico();

    // Configurar IntersectionObserver no sentinel
    if (_historicoState.observer) _historicoState.observer.disconnect();
    const sentinel = document.getElementById('historico-sentinel');
    if (sentinel) {
        _historicoState.observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) _carregarMaisHistorico();
        }, { threshold: 0.1 });
        _historicoState.observer.observe(sentinel);
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
        (window.mostrarToast || alert)('Mês fechado. Não é possível criar reservas.', 'warning');
        return;
    }

    const valor = parseFloat(document.getElementById('input-valor-reserva').value);
    const descricao = document.getElementById('input-descricao-reserva').value.trim();

    if (!descricao) {
        (window.mostrarToast || alert)('Informe o nome da reserva', 'warning');
        return;
    }

    if (isNaN(valor) || valor <= 0) {
        (window.mostrarToast || alert)('Informe um valor válido', 'warning');
        return;
    }

    // Validar se tem saldo disponível para reservar no mês atual
    const { saldoAtualMes } = calcularSaldoAtualMes();

    if (valor > saldoAtualMes) {
        const msg = `Valor indisponível para reserva. Disponível: ${window.formatarMoeda(saldoAtualMes)}`;
        (window.mostrarToast || alert)(msg, 'warning');
        return;
    }

    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (!token) {
        (window.mostrarToast || alert)('Sessão expirada. Faça login novamente.', 'error');
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
                mes: mes,
                ano: ano,
                data: `${ano}-${String(mes + 1).padStart(2, '0')}-15`,
                observacoes: descricao,
                perfil_id: typeof window.getPerfilAtivo === 'function' ? window.getPerfilAtivo() : null
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
            (window.mostrarToast || alert)(error.message || 'Erro ao criar reserva', 'error');
        }
    } catch (error) {
        console.error('Erro ao criar reserva:', error);
        (window.mostrarToast || alert)('Erro ao criar reserva', 'error');
    }
}

/**
 * Cria novo objetivo (reserva com tipo_reserva='objetivo', saldo inicial 0)
 */
async function processarAdicionarObjetivo() {
    const descricao = document.getElementById('input-descricao-objetivo')?.value.trim();
    const valorMeta = parseFloat(document.getElementById('input-valor-objetivo')?.value);
    const dataAlvo  = document.getElementById('input-data-objetivo')?.value || null;

    if (!descricao) { (window.mostrarToast || alert)('Informe o nome do objetivo', 'warning'); return; }
    if (isNaN(valorMeta) || valorMeta <= 0) { (window.mostrarToast || alert)('Informe o valor meta', 'warning'); return; }

    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (!token) { (window.mostrarToast || alert)('Sessão expirada', 'error'); return; }

    const mes = window.mesAberto;
    const ano = window.anoAberto;

    try {
        const response = await fetch(`${API_URL_RESERVAS}/reservas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                valor: 0,
                mes, ano,
                data: `${ano}-${String(mes + 1).padStart(2, '0')}-15`,
                observacoes: descricao,
                tipo_reserva: 'objetivo',
                objetivo_valor: valorMeta,
                data_objetivo: dataAlvo || null,
                perfil_id: typeof window.getPerfilAtivo === 'function' ? window.getPerfilAtivo() : null
            })
        });

        if (response.ok) {
            document.getElementById('input-descricao-objetivo').value = '';
            document.getElementById('input-valor-objetivo').value = '';
            document.getElementById('input-data-objetivo').value = '';
            await carregarReservasAPI();
            await atualizarModalReservas();
            atualizarCardReservasIntegrado();
            window.mostrarMensagemSucesso ? window.mostrarMensagemSucesso('Objetivo criado!') : null;
        } else {
            const err = await response.json();
            (window.mostrarToast || alert)(err.message || 'Erro ao criar objetivo', 'error');
        }
    } catch(e) {
        (window.mostrarToast || alert)('Erro ao criar objetivo', 'error');
    }
}

/**
 * Atualiza valores do modal de reservas
 */
async function atualizarModalReservas() {
    await renderizarListaReservasModal();
    await renderizarHistoricoGeral();
}

/**
 * Exclui reserva via API
 */
async function excluirReserva(id) {
    // Verificar se o mês está fechado
    if (mesFechadoAtual()) {
        (window.mostrarToast || alert)('Mês fechado. Não é possível excluir reservas.', 'warning');
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
            (window.mostrarToast || alert)('Erro ao excluir reserva', 'error');
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
    if (btnAdicionar) btnAdicionar.addEventListener('click', processarAdicionarReserva);

    const btnAdicionarObj = document.getElementById('btn-adicionar-objetivo');
    if (btnAdicionarObj) btnAdicionarObj.addEventListener('click', processarAdicionarObjetivo);

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
// SISTEMA DE METAS / OBJETIVOS — funções de suporte
// ================================================================

/**
 * Carrega objetivos (reservas com tipo_reserva='objetivo') — ainda usada no dashboard
 */
async function carregarObjetivos() {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (!token) return [];
    try {
        const response = await fetch(`${API_URL_RESERVAS}/reservas/objetivos`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data.data || [];
    } catch {
        return [];
    }
}
window.carregarObjetivos = carregarObjetivos;

/**
 * Marca objetivo como atingido — mantido por precaução
 */
async function marcarObjetivoAtingido(id) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (!token) return;
    try {
        const response = await fetch(`${API_URL_RESERVAS}/reservas/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ objetivo_atingido: true })
        });
        if (response.ok) {
            window.mostrarMensagemSucesso ? window.mostrarMensagemSucesso('Objetivo marcado como atingido!') : null;
        }
    } catch (e) {
        console.error('Erro ao marcar objetivo:', e);
    }
}
window.marcarObjetivoAtingido = marcarObjetivoAtingido;

async function moverReserva(reservaId) {
    const input = document.getElementById(`mov-valor-${reservaId}`);
    if (!input) return;
    const valor = parseFloat(input.value.replace(',', '.'));
    if (isNaN(valor) || valor === 0) {
        (window.mostrarToast || alert)('Digite um valor (positivo para adicionar, negativo para retirar)', 'warning');
        return;
    }
    input.value = '';
    await movimentarReservaSimples(reservaId, valor);
}
window.moverReserva = moverReserva;

function togglePainelMeta(reservaId) {
    const painel = document.getElementById(`meta-painel-${reservaId}`);
    if (!painel) return;
    painel.style.display = painel.style.display === 'none' ? 'block' : 'none';
}
window.togglePainelMeta = togglePainelMeta;

/**
 * Salva (ou remove) a meta de uma reserva via PUT /api/reservas/:id
 */
async function salvarMetaReserva(reservaId, valorMeta, dataAlvo) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const body = valorMeta > 0
        ? { tipo_reserva: 'objetivo', objetivo_valor: valorMeta, data_objetivo: dataAlvo || null }
        : { tipo_reserva: 'normal', objetivo_valor: null, data_objetivo: null };
    try {
        const resp = await fetch(`${API_URL_RESERVAS}/reservas/${reservaId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
        });
        if (resp.ok) {
            await carregarReservasAPI();
            renderizarListaReservasModal();
            const msg = valorMeta > 0 ? 'Meta definida!' : 'Meta removida!';
            window.mostrarMensagemSucesso ? window.mostrarMensagemSucesso(msg) : null;
        } else {
            const err = await resp.json();
            (window.mostrarToast || alert)(err.message || 'Erro ao salvar meta', 'error');
        }
    } catch (e) {
        console.error('Erro ao salvar meta:', e);
        (window.mostrarToast || alert)('Erro ao salvar meta', 'error');
    }
}
window.salvarMetaReserva = salvarMetaReserva;

