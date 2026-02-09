// ================================================================
// SISTEMA DE DESPESAS - PARTE 1/3
// ESTRUTURA, CONSTANTES, INICIALIZAÇÃO E RENDERIZAÇÃO
// ================================================================

let processandoDespesa = false;

const ERROS = {
    DESPESA_NAO_ENCONTRADA: 'A despesa solicitada não foi encontrada',
    ESTRUTURA_DADOS_INVALIDA: 'A estrutura de dados do mês/ano é inválida',
    MODAL_NAO_ENCONTRADO: 'Modal não encontrado'
};

// ================================================================
// VALIDAÇÃO DE CAMPOS
// ================================================================

function marcarCampoInvalido(campo) {
    if (campo) {
        campo.classList.add('campo-invalido');
        campo.addEventListener('input', function removerErro() {
            campo.classList.remove('campo-invalido');
            campo.removeEventListener('input', removerErro);
        }, { once: true });
    }
}

function limparErrosValidacao() {
    document.querySelectorAll('.campo-invalido').forEach(el => {
        el.classList.remove('campo-invalido');
    });
}

// Limpar erro de pagamento ao selecionar
document.addEventListener('change', function(e) {
    if (e.target.name === 'forma-pagamento') {
        const paymentMethods = document.querySelector('.payment-methods');
        if (paymentMethods) paymentMethods.classList.remove('campo-invalido');
    }
});

// ================================================================
// FUNÇÕES DE REPLICAÇÃO DE DESPESAS
// ================================================================

/**
 * Toggle para mostrar/ocultar opções de replicação
 */
function toggleReplicarDespesa() {
    const checkbox = document.getElementById('despesa-replicar');
    const options = document.getElementById('despesa-replicar-options');

    if (checkbox && options) {
        if (checkbox.checked) {
            options.classList.remove('hidden');
            inicializarSelectAnosReplicarDespesa();
        } else {
            options.classList.add('hidden');
        }
    }

}

// Exportar para uso global
window.toggleReplicarDespesa = toggleReplicarDespesa;

/**
 * Inicializa o select de anos para replicação de despesas
 */
function inicializarSelectAnosReplicarDespesa() {
    const selectAno = document.getElementById('despesa-replicar-ano');
    const selectMes = document.getElementById('despesa-replicar-mes');

    if (!selectAno) return;

    const anoAtual = window.anoAberto || new Date().getFullYear();
    const mesAtual = window.mesAberto !== null ? window.mesAberto : new Date().getMonth();

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
    selectMes.value = '11';
    selectAno.value = anoAtual;
}

/**
 * Processa a replicação de uma despesa para meses futuros
 * @param {Object} despesaOriginal - Dados da despesa original
 * @param {number} mesInicio - Mês de início (0-11)
 * @param {number} anoInicio - Ano de início
 */
async function processarReplicacaoDespesa(despesaOriginal, mesInicio, anoInicio) {
    const replicarCheckbox = document.getElementById('despesa-replicar');

    if (!replicarCheckbox || !replicarCheckbox.checked) {
        return;
    }

    const mesFinal = parseInt(document.getElementById('despesa-replicar-mes').value);
    const anoFinal = parseInt(document.getElementById('despesa-replicar-ano').value);

    // Calcular próximo mês a partir do mês de criação
    let mesAtual = mesInicio;
    let anoAtual = anoInicio;

    // Avançar para o próximo mês
    mesAtual++;
    if (mesAtual > 11) {
        mesAtual = 0;
        anoAtual++;
    }

    // Obter dia do vencimento original
    const dataVencOriginal = new Date(despesaOriginal.dataVencimento + 'T00:00:00');
    const diaVenc = dataVencOriginal.getDate();

    // Guardar anos que precisam ser atualizados
    const anosParaAtualizar = new Set();
    anosParaAtualizar.add(anoInicio);

    // Replicar até o mês/ano final
    while (anoAtual < anoFinal || (anoAtual === anoFinal && mesAtual <= mesFinal)) {
        // Calcular nova data de vencimento
        const novaDataVenc = calcularDataReplicada(diaVenc, mesAtual, anoAtual);

        // Criar cópia da despesa para o novo mês
        const despesaReplicada = {
            descricao: despesaOriginal.descricao,
            valor: despesaOriginal.valor,
            valorPago: despesaOriginal.valorPago,
            dataCompra: novaDataVenc, // Usar mesma data para compra
            dataVencimento: novaDataVenc,
            categoria: despesaOriginal.categoria,
            categoriaId: despesaOriginal.categoriaId,
            formaPagamento: despesaOriginal.formaPagamento,
            cartaoId: despesaOriginal.cartaoId,
            pago: false,
            recorrente: true, // Marcar como recorrente
            anexos: [] // Não replicar anexos
        };

        // Salvar despesa replicada
        try {
            await window.usuarioDataManager.salvarDespesa(mesAtual, anoAtual, despesaReplicada, null);
            anosParaAtualizar.add(anoAtual);
        } catch (error) {
            console.error(`Erro ao replicar despesa para ${mesAtual + 1}/${anoAtual}:`, error);
        }

        // Avançar para próximo mês
        mesAtual++;
        if (mesAtual > 11) {
            mesAtual = 0;
            anoAtual++;
        }
    }

    // Atualizar interface para todos os anos afetados
    for (const ano of anosParaAtualizar) {
        if (typeof window.carregarDadosDashboard === 'function') {
            await window.carregarDadosDashboard(ano);
        }
    }

    // Atualizar cards dos meses do ano atual
    if (typeof window.renderizarMeses === 'function') {
        await window.renderizarMeses(window.anoAberto || new Date().getFullYear());
    }
}

/**
 * Calcula a data replicada mantendo o mesmo dia do mês
 * Se o dia não existir no mês (ex: 31 em fevereiro), usa o último dia do mês
 */
function calcularDataReplicada(dia, mes, ano) {
    // Descobrir quantos dias tem o mês
    const ultimoDiaMes = new Date(ano, mes + 1, 0).getDate();
    const diaFinal = Math.min(dia, ultimoDiaMes);

    const data = new Date(ano, mes, diaFinal);
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

// ================================================================
// INICIALIZAÇÃO E ESTRUTURA
// ================================================================

function inicializarTabelaDespesasGrid() {
    const tabDespesas = document.getElementById('tab-despesas');
    if (!tabDespesas) {

        return false;
    }
    
    const template = document.getElementById('template-estrutura-despesas-grid');
    if (!template) {

        return false;
    }
    
    const clone = template.content.cloneNode(true);
    tabDespesas.innerHTML = '';
    tabDespesas.appendChild(clone);
    
    configurarEventosGrid();

    return true;
}

function configurarEventosGrid() {
    const btnNovaDespesa = document.getElementById('btn-nova-despesa');
    if (btnNovaDespesa) {
        btnNovaDespesa.addEventListener('click', function(e) {
            e.preventDefault();
            abrirModalNovaDespesa();
        });
    }

    const btnPagarLote = document.getElementById('btn-pagar-em-lote');
    if (btnPagarLote) {
        btnPagarLote.addEventListener('click', function(e) {
            e.preventDefault();
            abrirModalPagamentoLote();
        });
    }

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

    configurarEventosFiltros();
    configurarEventoBotaoLimpar();
    configurarEventoOrdenacao();
}

// ================================================================
// APLICAR TODOS OS FILTROS SIMULTANEAMENTE
// ================================================================
function aplicarTodosFiltros() {
    const filtroCategoria = document.getElementById('filtro-categoria')?.value || 'todas';
    const filtroFormaPagamento = document.getElementById('filtro-forma-pagamento-tabela')?.value || 'todas';
    const filtroStatus = document.getElementById('filtro-status')?.value || 'todas';
    
    const linhas = document.querySelectorAll('tr.despesa-row');
    
    linhas.forEach(linha => {
        let mostrarLinha = true;
        
        // Verificar filtro de categoria
        if (filtroCategoria !== 'todas') {
            if (!verificarCategoriaDespesa(linha, filtroCategoria)) {
                mostrarLinha = false;
            }
        }
        
        // Verificar filtro de forma de pagamento
        if (filtroFormaPagamento !== 'todas' && mostrarLinha) {
            if (!verificarFormaPagamentoDespesa(linha, filtroFormaPagamento)) {
                mostrarLinha = false;
            }
        }
        
        // Verificar filtro de status
        if (filtroStatus !== 'todas' && mostrarLinha) {
            if (!verificarStatusDespesa(linha, filtroStatus)) {
                mostrarLinha = false;
            }
        }
        
        // Aplicar visibilidade
        linha.style.display = mostrarLinha ? '' : 'none';
    });
    
    atualizarContadoresFiltro();
}

function configurarEventosFiltros() {
    // Filtros antigos (se existirem)
    const filtros = [
        { id: 'filtro-categoria', handler: filtrarDespesasPorCategoria },
        { id: 'filtro-forma-pagamento-tabela', handler: filtrarDespesasPorFormaPagamento },
        { id: 'filtro-status', handler: filtrarDespesasPorStatus }
    ];

    filtros.forEach(filtro => {
        const elemento = document.getElementById(filtro.id);
        if (elemento) {
            elemento.addEventListener('change', function() {
                filtro.handler(this.value);
            });
        }
    });

    // Filtros da toolbar unificada
    const filtrosToolbar = [
        { id: 'filtro-categoria-toolbar', tipo: 'categoria' },
        { id: 'filtro-forma-pagamento-toolbar', tipo: 'formaPagamento' },
        { id: 'filtro-status-toolbar', tipo: 'status' }
    ];

    filtrosToolbar.forEach(filtro => {
        const elemento = document.getElementById(filtro.id);
        if (elemento) {
            elemento.addEventListener('change', function() {
                aplicarFiltrosToolbarDespesas();
            });
        }
    });

    // Botão limpar filtros da toolbar
    const btnLimparToolbar = document.getElementById('btn-limpar-filtros-toolbar');
    if (btnLimparToolbar) {
        btnLimparToolbar.addEventListener('click', function(e) {
            e.preventDefault();
            limparFiltrosToolbarDespesas();
        });
    }
}

function aplicarFiltrosToolbarDespesas() {
    const filtroCategoria = document.getElementById('filtro-categoria-toolbar')?.value || 'todas';
    const filtroFormaPagamento = document.getElementById('filtro-forma-pagamento-toolbar')?.value || 'todas';
    const filtroStatus = document.getElementById('filtro-status-toolbar')?.value || 'todas';

    const linhas = document.querySelectorAll('tr.despesa-row');

    linhas.forEach(linha => {
        let mostrarLinha = true;

        // Filtro de categoria
        if (filtroCategoria !== 'todas') {
            const categoriaDespesa = linha.querySelector('.col-categoria')?.textContent?.trim() || '';
            if (categoriaDespesa.toLowerCase() !== filtroCategoria.toLowerCase()) {
                mostrarLinha = false;
            }
        }

        // Filtro de forma de pagamento
        if (filtroFormaPagamento !== 'todas' && mostrarLinha) {
            if (filtroFormaPagamento.startsWith('credito_')) {
                const cartaoIdFiltro = filtroFormaPagamento.replace('credito_', '');
                const formaPag = (linha.dataset.formaPagamento || '').toLowerCase();
                const cartaoIdLinha = linha.dataset.cartaoId || '';
                if (!formaPag.includes('cred') || String(cartaoIdLinha) !== String(cartaoIdFiltro)) {
                    mostrarLinha = false;
                }
            } else {
                const formaPagamento = linha.dataset.formaPagamento || '';
                if (formaPagamento.toLowerCase() !== filtroFormaPagamento.toLowerCase()) {
                    mostrarLinha = false;
                }
            }
        }

        // Filtro de status
        if (filtroStatus !== 'todas' && mostrarLinha) {
            const statusDespesa = linha.dataset.status || '';
            if (filtroStatus === 'pagas' && statusDespesa !== 'quitada') mostrarLinha = false;
            else if (filtroStatus === 'pendentes' && statusDespesa === 'quitada') mostrarLinha = false;
            else if (filtroStatus === 'em_dia' && statusDespesa !== 'em_dia') mostrarLinha = false;
            else if (filtroStatus === 'atrasada' && statusDespesa !== 'atrasada') mostrarLinha = false;
        }

        linha.style.display = mostrarLinha ? '' : 'none';
    });

    atualizarContadoresFiltro();
}

function limparFiltrosToolbarDespesas() {
    const filtros = ['filtro-categoria-toolbar', 'filtro-forma-pagamento-toolbar', 'filtro-status-toolbar'];
    filtros.forEach(filtroId => {
        const filtro = document.getElementById(filtroId);
        if (filtro) filtro.value = 'todas';
    });

    // Mostrar todas as linhas
    document.querySelectorAll('tr.despesa-row').forEach(linha => {
        linha.style.display = '';
    });

    atualizarContadoresFiltro();
}

function atualizarFiltrosExistentes(mes, ano) {
    const categorias = obterCategoriasDoMes(mes, ano);

    // Atualizar filtro antigo (se existir)
    const filtroCategoria = document.getElementById('filtro-categoria');
    if (filtroCategoria) {
        const valorAtual = filtroCategoria.value;

        filtroCategoria.innerHTML = '<option value="todas">Categorias</option>';

        categorias.forEach(categoria => {
            const option = document.createElement('option');
            option.value = categoria;
            option.textContent = categoria;
            filtroCategoria.appendChild(option);
        });

        if (valorAtual && categorias.includes(valorAtual)) {
            filtroCategoria.value = valorAtual;
        }
    }

    // Atualizar filtro da toolbar unificada
    const filtroCategoriaToolbar = document.getElementById('filtro-categoria-toolbar');
    if (filtroCategoriaToolbar) {
        const valorAtual = filtroCategoriaToolbar.value;

        filtroCategoriaToolbar.innerHTML = '<option value="todas">Categorias</option>';

        categorias.forEach(categoria => {
            const option = document.createElement('option');
            option.value = categoria;
            option.textContent = categoria;
            filtroCategoriaToolbar.appendChild(option);
        });

        if (valorAtual && categorias.includes(valorAtual)) {
            filtroCategoriaToolbar.value = valorAtual;
        }
    }
}

// ================================================================
// RENDERIZAÇÃO DE DESPESAS
// ================================================================

function renderizarDespesas(despesas, mes, ano, fechado) {
   if (!document.getElementById('despesas-grid-container')) {
       inicializarTabelaDespesasGrid();
   }

   const listaDespesas = document.getElementById('lista-despesas');
   if (!listaDespesas) return;

   listaDespesas.innerHTML = '';

   if (Array.isArray(despesas) && despesas.length > 0) {
       atualizarStatusDespesas(despesas);
       let despesasParaExibir = despesas.filter(d => !d.transferidaParaProximoMes);

       // Ordenação padrão: última despesa cadastrada no topo (ID decrescente)
       despesasParaExibir = despesasParaExibir.sort((a, b) => {
           const idA = parseInt(a.id) || 0;
           const idB = parseInt(b.id) || 0;
           return idB - idA; // Decrescente - maior ID primeiro
       });

       despesasParaExibir.forEach((despesa, index) => {
           const divRow = criarLinhaDespesaGrid(despesa, index, fechado, mes, ano);
           if (divRow) listaDespesas.appendChild(divRow);
       });
   }

   if (!fechado) {
       configurarEventosDespesas(listaDespesas, mes, ano);
   }

   atualizarFiltrosExistentes(mes, ano);
   atualizarBotaoLote();

   setTimeout(() => {
       // Atualizar contadores de anexos após renderização
       if (typeof atualizarTodosContadoresAnexosDespesas === 'function') {
           atualizarTodosContadoresAnexosDespesas();
       }
   }, 100);
}

function criarLinhaDespesaGrid(despesa, index, fechado, mes, ano) {
  const template = document.getElementById('template-linha-despesa-grid');
  if (!template) {

      return null;
  }
  
  const clone = template.content.cloneNode(true);
  const div = clone.querySelector('.despesa-row');
  
  if (despesa.status === 'em_dia') div.classList.add('despesa-em-dia');
  else if (despesa.status === 'atrasada') div.classList.add('despesa-atrasada');
  else if (despesa.status === 'quitada' || despesa.quitado) div.classList.add('despesa-quitada');
  
  if (fechado) div.classList.add('transacao-fechada');
  
  div.setAttribute('data-status', despesa.status || 'pendente');
  div.setAttribute('data-categoria', despesa.categoria || '');
  div.setAttribute('data-forma-pagamento', despesa.formaPagamento || '');
  div.setAttribute('data-cartao-id', despesa.cartao_id || despesa.cartaoId || '');
  div.setAttribute('data-index', index);
  div.setAttribute('data-despesa-id', despesa.id || '');
  // NOVO: Preservar informação de anexos no elemento
  div.setAttribute('data-anexos-count', despesa.anexos ? despesa.anexos.length : 0);
  
  preencherCelulasGrid(clone, despesa, index, fechado, mes, ano);
  
  return clone;
}

function sincronizarIndicesDespesas() {
  const linhasDespesas = document.querySelectorAll('tr.despesa-row');
  
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
      
      // NOVO: Sincronizar botões de anexos
      const btnAnexos = linha.querySelector('.btn-anexos');
      if (btnAnexos) {
          btnAnexos.setAttribute('data-index', novoIndex);
      }
  });
}

function preencherCelulasGrid(clone, despesa, index, fechado, mes, ano) {
   preencherCelulaCheckbox(clone, despesa, index, fechado);
   preencherCelulaNumero(clone, despesa);
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

function preencherCelulaNumero(clone, despesa) {
    const celulaNumero = clone.querySelector('.col-numero');
    if (celulaNumero) {
        celulaNumero.textContent = despesa.id || '-';
    }
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
    const formaPag = (despesa.formaPagamento || 'debito').toLowerCase();

    // Se for crédito, mostrar nome do cartão junto
    let textoMetodo = formaPag.toUpperCase();

    if (formaPag === 'credito' || formaPag === 'crédito' || formaPag.includes('cred')) {
        const cartaoId = despesa.cartao_id || despesa.cartaoId;
        if (cartaoId && window.cartoesUsuario) {
            const cartao = window.cartoesUsuario.find(c => c.id === cartaoId);
            if (cartao) {
                const nomeCartao = cartao.banco || cartao.nome || '';
                textoMetodo = `CRÉDITO/${nomeCartao.toUpperCase()}`;
            }
        }
    }

    const template = document.getElementById('template-badge-forma-pagamento-despesa');
    if (template) {
        const badgeClone = template.content.cloneNode(true);
        const badge = badgeClone.querySelector('.badge-pagamento');
        badge.className = `badge-pagamento ${formaPag}`;
        badge.textContent = textoMetodo;
        badge.title = textoMetodo; // Tooltip para texto longo
        celulaFormaPagamento.appendChild(badgeClone);
    }
}

function preencherCelulaCartao(clone, despesa) {
    const celulaCartao = clone.querySelector('.col-cartao');
    if (!celulaCartao) return;

    // Se não for crédito, deixar vazio
    const formaPag = (despesa.formaPagamento || '').toLowerCase();
    if (formaPag !== 'credito' && formaPag !== 'crédito' && !formaPag.includes('cred')) {
        celulaCartao.textContent = '-';
        return;
    }

    // Buscar nome do cartão pelo cartao_id
    const cartaoId = despesa.cartao_id || despesa.cartaoId;
    if (cartaoId && window.cartoesUsuario) {
        const cartao = window.cartoesUsuario.find(c => c.id === cartaoId);
        if (cartao) {
            celulaCartao.textContent = cartao.nome;
            celulaCartao.title = cartao.nome; // Tooltip para nomes longos
            return;
        }
    }

    celulaCartao.textContent = '-';
}

function preencherCelulaValor(clone, despesa) {
    const celulaValor = clone.querySelector('.col-valor');

    // Verificar se tem juros: via metadados OU via valorTotalComJuros diferente do valor
    const valorOriginal = parseFloat(despesa.valorOriginal) || parseFloat(despesa.valor) || 0;
    const valorComJuros = parseFloat(despesa.valorTotalComJuros) || valorOriginal;
    const temJuros = valorComJuros > valorOriginal;

    if (temJuros) {
        const template = document.getElementById('template-valor-com-juros');
        if (template) {
            const valorClone = template.content.cloneNode(true);

            valorClone.querySelector('.valor-original').textContent = window.formatarMoeda(valorOriginal);
            valorClone.querySelector('.valor-juros').textContent = window.formatarMoeda(valorComJuros);

            celulaValor.appendChild(valorClone);
        } else {
            // Fallback se não tiver template: mostrar formato texto
            celulaValor.innerHTML = `${window.formatarMoeda(valorOriginal)} / <span style="color: #ef4444;">${window.formatarMoeda(valorComJuros)}</span>`;
        }
    } else {
        celulaValor.textContent = window.formatarMoeda(despesa.valor || 0);
    }
}

function preencherCelulaParcela(clone, despesa) {
    const celulaParcela = clone.querySelector('.col-parcela');

    // ✅ CORRIGIDO: Usar campo parcela pré-construído do main.js
    if (despesa.parcela) {
        celulaParcela.textContent = despesa.parcela;
    }
    // Fallback para camelCase (transformação do main.js)
    else if (despesa.parcelado && despesa.parcelaAtual && despesa.totalParcelas) {
        celulaParcela.textContent = `${despesa.parcelaAtual}/${despesa.totalParcelas}`;
    }
    // Fallback para snake_case (dados diretos do backend)
    else if (despesa.parcelado && despesa.parcela_atual && despesa.numero_parcelas) {
        celulaParcela.textContent = `${despesa.parcela_atual}/${despesa.numero_parcelas}`;
    }
    else {
        celulaParcela.textContent = '-';
    }
}

function preencherCelulaValorPago(clone, despesa) {
    const celulaValorPago = clone.querySelector('.col-valor-pago');
    celulaValorPago.textContent = despesa.valorPago ? window.formatarMoeda(despesa.valorPago) : '-';
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

function preencherCelulaAcoes(clone, despesa, index, fechado) {
    const celulaAcoes = clone.querySelector('.col-acoes');
    const template = document.getElementById('template-botoes-acao-despesa');
    if (template) {
        const botoesClone = template.content.cloneNode(true);
        configurarBotoesAcaoTemplate(botoesClone, despesa, index, fechado);
        celulaAcoes.appendChild(botoesClone);
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

// ================================================================
// CONFIGURAÇÃO DE EVENTOS
// ================================================================
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

      // Usar data-despesa-id da linha para garantir referência correta
      const linha = btn.closest('tr.despesa-row');
      const despesaId = linha?.getAttribute('data-despesa-id');

      if (!despesaId) {
          console.error('ID da despesa não encontrado');
          return;
      }

      try {
          if (btn.classList.contains('btn-editar')) {
              await editarDespesaPorId(despesaId, mes, ano);
          } else if (btn.classList.contains('btn-excluir')) {
              await excluirDespesaPorId(despesaId, mes, ano);
          } else if (btn.classList.contains('btn-pagar')) {
              await abrirModalPagamentoPorId(despesaId, mes, ano);
          } else if (btn.classList.contains('btn-mover')) {
              await moverParaProximoMesPorId(despesaId, mes, ano);
          } else if (btn.classList.contains('btn-anexos')) {
              await abrirModalVisualizarAnexosDespesaPorId(despesaId);
          }
      } catch (error) {
          if (window.mostrarMensagemErro) {
              window.mostrarMensagemErro('Erro ao processar ação: ' + error.message);
          } else {
              alert('Erro ao processar ação: ' + error.message);
          }
      }
  };

  container.addEventListener('click', container._despesasListener);
}

// ================================================================
// FUNÇÕES AUXILIARES E UTILITÁRIAS
// ================================================================

// Busca despesa por ID no array de despesas
function encontrarDespesaPorId(despesaId, mes, ano) {
    const despesas = dadosFinanceiros[ano]?.meses[mes]?.despesas;
    if (!Array.isArray(despesas)) {
        return { despesa: null, indice: -1 };
    }

    const indice = despesas.findIndex(d => d.id == despesaId);
    if (indice === -1) {
        return { despesa: null, indice: -1 };
    }

    const despesa = despesas[indice];
    if (!despesa || despesa.transferidaParaProximoMes === true) {
        return { despesa: null, indice: -1 };
    }

    return { despesa: despesa, indice: indice };
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
   // ✅ CORRIGIDO: Não gera mais ID temporário
   // O ID será atribuído pelo backend após o POST
   return {
       id: dados.id || null,  // Apenas usa ID se já existir (edição)
       descricao: dados.descricao || '',
       categoria: dados.categoria || '',
       formaPagamento: dados.formaPagamento || null,
       cartao_id: dados.cartao_id || dados.numeroCartao || null,
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

function atualizarStatusDespesas(despesas) {
    if (!Array.isArray(despesas)) return;
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    despesas.forEach(despesa => {
        // ✅ Se foi paga/quitada, status é "quitada"
        if (despesa.quitado === true || despesa.pago === true) {
            despesa.status = 'quitada';
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
    if (despesa.quitacaoAntecipada === true) {
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
    if (despesa.quitacaoAntecipada === true) {
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

function arredondarParaDuasCasas(valor) {
    return Math.round((parseFloat(valor) + Number.EPSILON) * 100) / 100;
}

function atualizarBotaoLote() {
    const checkboxes = document.querySelectorAll('.despesa-checkbox:checked');
    const habilitado = checkboxes.length >= 2;

    // Atualizar botão antigo (se existir)
    const btnPagarEmLote = document.getElementById('btn-pagar-em-lote');
    if (btnPagarEmLote) {
        btnPagarEmLote.disabled = !habilitado;
    }

    // Atualizar botão da toolbar unificada
    const btnPagarLoteToolbar = document.getElementById('btn-pagar-lote-toolbar');
    if (btnPagarLoteToolbar) {
        btnPagarLoteToolbar.disabled = !habilitado;
        if (habilitado) {
            btnPagarLoteToolbar.innerHTML = `<i class="fas fa-check-circle"></i> Lote (${checkboxes.length})`;
        } else {
            btnPagarLoteToolbar.innerHTML = `<i class="fas fa-check-circle"></i> Lote`;
        }
    }
}

// FUNÇÃO: preencherCelulaAnexos()
function preencherCelulaAnexos(clone, despesa, index, fechado) {
   const celulaAnexos = clone.querySelector('.col-anexos');
   if (!celulaAnexos) return;
   
   const quantidadeAnexos = despesa.anexos ? despesa.anexos.length : 0;
   
   if (quantidadeAnexos > 0) {
       // Usar template para anexos existentes
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
       // Usar template para sem anexos
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

// REMOVIDO: Event listeners duplicados - já configurados em js/anexos.js
function configurarEventosFormularioAnexosDespesa() {
    // Listeners de anexo são configurados globalmente pelo sistemaAnexos
}

function inicializarSistemaAnexosDespesas() {
   configurarEventosFormularioAnexosDespesa();
   
   const observer = new MutationObserver((mutations) => {
       mutations.forEach((mutation) => {
           if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
               const listaDespesas = document.getElementById('lista-despesas');
               if (listaDespesas && mutation.target === listaDespesas) {
                   setTimeout(() => {
                       if (typeof atualizarTodosContadoresAnexosDespesas === 'function') {
                           atualizarTodosContadoresAnexosDespesas();
                       }
                   }, 100);
               }
           }
       });
   });
   
   const listaDespesas = document.getElementById('lista-despesas');
   if (listaDespesas) {
       observer.observe(listaDespesas, { childList: true, subtree: true });
   }
}

// ================================================================
// MODAL NOVA DESPESA
// ================================================================

function abrirModalNovaDespesa(index) {
   if (typeof recarregarEAtualizarCartoes === 'function') {
       recarregarEAtualizarCartoes();
   }

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

       if (typeof atualizarDropdowns === 'function') {
           atualizarDropdowns();
       }

       const dataAtual = new Date(window.anoAberto, window.mesAberto, new Date().getDate());
       // Usar formato local para evitar problema de timezone
       const dataFormatada = window.dataParaISO ? window.dataParaISO(dataAtual) :
           `${dataAtual.getFullYear()}-${String(dataAtual.getMonth() + 1).padStart(2, '0')}-${String(dataAtual.getDate()).padStart(2, '0')}`;
       document.getElementById('despesa-data-compra').value = dataFormatada;
       document.getElementById('despesa-data-vencimento').value = dataFormatada;

       if (index !== undefined && window.dadosFinanceiros[window.anoAberto]?.meses[window.mesAberto]?.despesas?.[index]) {
           preencherFormularioEdicao(index);
       } else {
           document.getElementById('despesa-id').value = '';
       }

       modal.classList.add('active');
       modal.style.display = 'block';

       const descricaoInput = document.getElementById('despesa-descricao');
       if (descricaoInput) descricaoInput.focus();

   } catch (error) {
       if (window.mostrarMensagemErro) {
           window.mostrarMensagemErro("Não foi possível abrir o formulário: " + error.message);
       } else {
           alert("Não foi possível abrir o formulário: " + error.message);
       }
   }
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

    // Resetar replicação
    const replicarCheckbox = document.getElementById('despesa-replicar');
    if (replicarCheckbox) {
        replicarCheckbox.checked = false;
    }
    const replicarOptions = document.getElementById('despesa-replicar-options');
    if (replicarOptions) {
        replicarOptions.classList.add('hidden');
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
   if (!dadosFinanceiros[anoAberto]?.meses[mesAberto]?.despesas[index]) {
       throw new Error(ERROS.DESPESA_NAO_ENCONTRADA);
   }

   const despesa = dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index];

   // Guardar ID real da despesa (do banco) e grupo de parcelamento
   document.getElementById('despesa-id').value = despesa.id || index;

   // Guardar informações extras para edição de parceladas
   window.despesaEmEdicao = {
       id: despesa.id,
       idGrupoParcelamento: despesa.idGrupoParcelamento,
       parcelado: despesa.parcelado,
       totalParcelas: despesa.totalParcelas,
       parcelaAtual: despesa.parcelaAtual
   };

   // Se for despesa parcelada e não for a primeira parcela, ajustar mês/ano para a primeira parcela
   if (despesa.parcelado && despesa.parcelaAtual > 1) {
       let mesPrimeiraParcela = despesa.mes - (despesa.parcelaAtual - 1);
       let anoPrimeiraParcela = despesa.ano;
       while (mesPrimeiraParcela < 0) {
           mesPrimeiraParcela += 12;
           anoPrimeiraParcela--;
       }
       document.getElementById('despesa-mes').value = mesPrimeiraParcela;
       document.getElementById('despesa-ano').value = anoPrimeiraParcela;
   }
   // Limpar sufixo de parcela da descrição se for parcelada (ex: "Compra (1/12)" → "Compra")
   let descricaoLimpa = despesa.descricao || '';
   if (despesa.parcelado) {
       descricaoLimpa = descricaoLimpa.replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();
   }
   document.getElementById('despesa-descricao').value = descricaoLimpa;
   document.getElementById('despesa-categoria').value = despesa.categoria || '';
   
   if (despesa.parcelado && despesa.metadados?.valorOriginalTotal) {
       // Usar metadados se disponível
       document.getElementById('despesa-valor').value = despesa.metadados.valorOriginalTotal;
       document.getElementById('despesa-valor-pago').value = despesa.metadados.valorTotalComJuros || '';
   } else if (despesa.parcelado && despesa.totalParcelas > 1) {
       // Parcelado sem metadados: calcular valor total (valor da parcela × número de parcelas)
       const valorParcela = parseFloat(despesa.valorOriginal || despesa.valor) || 0;
       const numParcelas = parseInt(despesa.totalParcelas) || 1;
       const valorTotal = valorParcela * numParcelas;
       document.getElementById('despesa-valor').value = valorTotal.toFixed(2);

       // Se tem valor com juros, também calcular o total
       const valorJurosParcela = parseFloat(despesa.valorTotalComJuros || despesa.valorPago) || 0;
       if (valorJurosParcela > 0) {
           document.getElementById('despesa-valor-pago').value = (valorJurosParcela * numParcelas).toFixed(2);
       } else {
           document.getElementById('despesa-valor-pago').value = '';
       }
   } else {
       // Despesa simples (não parcelada)
       document.getElementById('despesa-valor').value = despesa.valorOriginal || despesa.valor;
       document.getElementById('despesa-valor-pago').value = despesa.valorTotalComJuros || despesa.valorPago || '';
   }
   
   if (despesa.dataCompra) {
       document.getElementById('despesa-data-compra').value = despesa.dataCompra;
   }

   if (despesa.dataVencimento) {
       // Se for despesa parcelada e não for a primeira parcela, calcular a data da primeira parcela
       if (despesa.parcelado && despesa.parcelaAtual > 1) {
           const dataVencimentoAtual = window.dataDeISO ? window.dataDeISO(despesa.dataVencimento) : new Date(despesa.dataVencimento + 'T00:00:00');
           // Subtrair os meses para voltar à primeira parcela
           dataVencimentoAtual.setMonth(dataVencimentoAtual.getMonth() - (despesa.parcelaAtual - 1));
           const dataPrimeiraParcela = window.dataParaISO ? window.dataParaISO(dataVencimentoAtual) :
               `${dataVencimentoAtual.getFullYear()}-${String(dataVencimentoAtual.getMonth() + 1).padStart(2, '0')}-${String(dataVencimentoAtual.getDate()).padStart(2, '0')}`;
           document.getElementById('despesa-data-vencimento').value = dataPrimeiraParcela;
       } else {
           document.getElementById('despesa-data-vencimento').value = despesa.dataVencimento;
       }
   }
   
   if (despesa.formaPagamento === 'credito') {
       let cartaoIdReal = despesa.cartao_id || despesa.cartaoId;

       // Se não tem cartao_id, mas tem numeroCartao (posição antiga), converter para ID real
       if (!cartaoIdReal && despesa.numeroCartao) {
           const cartoesUsuario = window.cartoesUsuario || [];
           const cartaoNaPosicao = cartoesUsuario[parseInt(despesa.numeroCartao) - 1];
           if (cartaoNaPosicao) {
               cartaoIdReal = cartaoNaPosicao.id;
           }
       }

       if (cartaoIdReal) {
           const radioCartao = document.querySelector(`input[name="forma-pagamento"][data-cartao-id="${cartaoIdReal}"]`);
           if (radioCartao) radioCartao.checked = true;
       }
   } else if (despesa.formaPagamento) {
       const radioFormaPagamento = document.querySelector(`input[name="forma-pagamento"][value="${despesa.formaPagamento}"]`);
       if (radioFormaPagamento) radioFormaPagamento.checked = true;
   }
   
   if (despesa.parcelado) {
       const parceladoCheckbox = document.getElementById('despesa-parcelado');
       const parcelasInput = document.getElementById('despesa-parcelas');

       if (parceladoCheckbox) {
           parceladoCheckbox.checked = true;
           // Manter checkbox habilitado para permitir alteração
       }
       if (parcelasInput) {
           parcelasInput.value = despesa.totalParcelas || 1;
           // Manter input habilitado para permitir edição
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

// ================================================================
// SALVAMENTO DE DESPESAS
// ================================================================

async function salvarDespesa(e) {
    if (e && e.preventDefault) {
        e.preventDefault();
        e.stopPropagation();
    }

    if (processandoDespesa) return false;
    processandoDespesa = true;

    try {
        // Limpar erros anteriores
        limparErrosValidacao();

        let formularioValido = true;
        const camposInvalidos = [];

        // Validar descrição
        const descricao = document.getElementById('despesa-descricao');
        if (!descricao.value.trim()) {
            marcarCampoInvalido(descricao);
            camposInvalidos.push('Descrição');
            formularioValido = false;
        }

        // Validar categoria
        const categoria = document.getElementById('despesa-categoria');
        if (!categoria.value) {
            marcarCampoInvalido(categoria);
            camposInvalidos.push('Categoria');
            formularioValido = false;
        }

        // Validar forma de pagamento
        const formaPagamentoSelecionada = document.querySelector('input[name="forma-pagamento"]:checked');
        if (!formaPagamentoSelecionada) {
            const paymentMethods = document.querySelector('.payment-methods');
            if (paymentMethods) paymentMethods.classList.add('campo-invalido');
            camposInvalidos.push('Pagamento');
            formularioValido = false;
        }

        // Validar valor
        const valor = document.getElementById('despesa-valor');
        if (!valor.value || parseFloat(valor.value) <= 0) {
            marcarCampoInvalido(valor);
            camposInvalidos.push('Valor');
            formularioValido = false;
        }

        // Validar datas
        const dataCompra = document.getElementById('despesa-data-compra');
        if (!dataCompra.value) {
            marcarCampoInvalido(dataCompra);
            camposInvalidos.push('Data Compra');
            formularioValido = false;
        }

        const dataVencimento = document.getElementById('despesa-data-vencimento');
        if (!dataVencimento.value) {
            marcarCampoInvalido(dataVencimento);
            camposInvalidos.push('Data Vencimento');
            formularioValido = false;
        }

        if (!formularioValido) {
            if (window.mostrarMensagemErro) {
                window.mostrarMensagemErro('Preencha: ' + camposInvalidos.join(', '));
            }
            processandoDespesa = false;
            return false;
        }

        const formData = coletarDadosFormularioDespesa();
        const ehEdicao = formData.id !== '' && formData.id !== null;

        // Se replicar está marcado, a despesa original também é recorrente
        const replicarCheckbox = document.getElementById('despesa-replicar');
        if (replicarCheckbox && replicarCheckbox.checked) {
            formData.recorrente = true;
        }

        const sucesso = await salvarDespesaLocal(formData);

        if (sucesso) {
            // Processar replicação se habilitada (apenas para novas despesas)
            if (!ehEdicao) {
                await processarReplicacaoDespesa(formData, formData.mes, formData.ano);
            }

            // ✅ EXIBIR MENSAGEM DE SUCESSO
            if (window.mostrarMensagemSucesso) {
                window.mostrarMensagemSucesso(ehEdicao ? 'Despesa atualizada com sucesso!' : 'Despesa cadastrada com sucesso!');
            }

            // Limpar formulário para permitir cadastrar outra despesa (NÃO fecha o modal)
            const form = document.getElementById('form-nova-despesa');
            if (form && !ehEdicao) {
                form.reset();
                resetarEstadoFormularioDespesa();
                document.getElementById('despesa-mes').value = formData.mes;
                document.getElementById('despesa-ano').value = formData.ano;
                document.getElementById('despesa-id').value = '';
                // Focar no campo descrição para facilitar novo cadastro
                const descricaoInput = document.getElementById('despesa-descricao');
                if (descricaoInput) descricaoInput.focus();
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
                window.mostrarMensagemErro('Não foi possível salvar a despesa. Tente novamente.');
            } else {
                alert('Não foi possível salvar a despesa. Tente novamente.');
            }
        }

        return false;

    } catch (error) {

        if (window.mostrarMensagemErro) {
            window.mostrarMensagemErro('Erro ao salvar despesa: ' + error.message);
        } else {
            alert('Erro ao salvar despesa: ' + error.message);
        }
        return false;
    } finally {
        processandoDespesa = false;
    }
}

function coletarDadosFormularioDespesa() {
   const categoria = document.getElementById('despesa-categoria').value;
   const formaPagamentoSelecionada = document.querySelector('input[name="forma-pagamento"]:checked');
   const formaPagamento = formaPagamentoSelecionada ? formaPagamentoSelecionada.value : null;
   
   let cartaoId = null;
   if (formaPagamento === 'credito' && formaPagamentoSelecionada && formaPagamentoSelecionada.dataset.cartaoId) {
       cartaoId = parseInt(formaPagamentoSelecionada.dataset.cartaoId);
   }
   
   const jaPago = document.getElementById('despesa-ja-pago') && document.getElementById('despesa-ja-pago').checked;
   const recorrente = document.getElementById('despesa-recorrente') && document.getElementById('despesa-recorrente').checked;
   
   const numParcelas = parseInt(document.getElementById('despesa-parcelas').value) || 1;
   const parcelado = numParcelas > 1;

   const formData = {
       id: document.getElementById('despesa-id').value,
       mes: parseInt(document.getElementById('despesa-mes').value),
       ano: parseInt(document.getElementById('despesa-ano').value),
       descricao: document.getElementById('despesa-descricao').value.trim(),
       categoria: categoria,
       formaPagamento: formaPagamento,
       cartao_id: cartaoId,
       valor: parseFloat(document.getElementById('despesa-valor').value),
       valorPago: document.getElementById('despesa-valor-pago').value ?
                 parseFloat(document.getElementById('despesa-valor-pago').value) : null,
       dataCompra: document.getElementById('despesa-data-compra').value,
       dataVencimento: document.getElementById('despesa-data-vencimento').value,
       parcelado: parcelado,
       totalParcelas: numParcelas,
       anexos: window.sistemaAnexos ? window.sistemaAnexos.obterAnexosParaSalvar('despesa') : [],
       jaPago: jaPago,
       recorrente: recorrente
   };
   
   return formData;
}

// ================================================================
// SALVAMENTO DE DESPESAS VIA API
// ================================================================

async function salvarDespesaLocal(formData) {
    try {
        const ehEdicao = formData.id !== '' && formData.id !== null && formData.id !== undefined;

        console.log('💾 Salvando despesa via API:', formData);

        // Calcular valores originais e juros
        const valorDigitado = parseFloat(formData.valor);
        const numParcelas = formData.parcelado ? (formData.totalParcelas || 1) : 1;

        // Se for parcelado, dividir o valor total pelo número de parcelas
        // O usuário digita o valor TOTAL da compra, e cada parcela recebe o valor dividido
        const valorParcela = formData.parcelado ? (valorDigitado / numParcelas) : valorDigitado;
        const valorOriginal = valorParcela;

        const valorComJuros = formData.valorPago ? (parseFloat(formData.valorPago) / numParcelas) : valorOriginal;
        const totalJuros = valorComJuros - valorOriginal;

        // Verificar se é edição de despesa parcelada
        const despesaEmEdicao = window.despesaEmEdicao || {};
        const ehEdicaoParcelada = ehEdicao && despesaEmEdicao.parcelado && despesaEmEdicao.idGrupoParcelamento;

        if (ehEdicaoParcelada) {
            // ✅ EDIÇÃO DE DESPESA PARCELADA: Atualizar todas as parcelas do grupo
            console.log('📝 Editando despesa parcelada - atualizando todas as parcelas do grupo:', despesaEmEdicao.idGrupoParcelamento);

            const sucesso = await atualizarTodasParcelasGrupo(formData, despesaEmEdicao, valorParcela, valorComJuros, totalJuros);

            if (sucesso) {
                await recarregarDespesasDoMes(formData.mes, formData.ano);
                limparAposGravacao(formData, true);
            }

            // Limpar dados de edição
            window.despesaEmEdicao = null;
            return sucesso;
        }

        // Preparar objeto despesa para API (nova despesa ou edição simples)
        const despesa = {
            id: ehEdicao ? formData.id : null,
            descricao: formData.descricao,
            categoria: formData.categoria,
            formaPagamento: formData.formaPagamento,
            cartao_id: formData.cartao_id,
            valor: valorParcela,
            valorOriginal: valorParcela,
            valorTotalComJuros: valorComJuros,
            valorPago: formData.jaPago ? valorComJuros : null,
            dataCompra: formData.dataCompra,
            dataVencimento: formData.dataVencimento,
            dataPagamento: formData.jaPago ? formData.dataCompra : null,
            parcelado: formData.parcelado || false,
            totalParcelas: formData.parcelado ? formData.totalParcelas : null,
            quitado: formData.jaPago || false,
            pago: formData.jaPago || false,
            recorrente: formData.recorrente || false,
            observacoes: formData.observacoes || '',
            anexos: formData.anexos || [],
            metadados: totalJuros !== 0 ? {
                valorOriginalTotal: valorDigitado,
                valorTotalComJuros: formData.valorPago ? parseFloat(formData.valorPago) : valorDigitado,
                totalJuros: totalJuros * numParcelas,
                jurosPorParcela: totalJuros
            } : null
        };

        const sucesso = await window.usuarioDataManager.salvarDespesa(
            formData.mes,
            formData.ano,
            despesa,
            ehEdicao ? formData.id : null
        );

        if (sucesso) {
            await recarregarDespesasDoMes(formData.mes, formData.ano);
            limparAposGravacao(formData, ehEdicao);
        }

        // Limpar dados de edição
        window.despesaEmEdicao = null;
        return sucesso;

    } catch (error) {
        console.error('❌ Erro ao salvar despesa:', error);
        return false;
    }
}

// Função auxiliar para recarregar despesas do mês
async function recarregarDespesasDoMes(mes, ano) {
    console.log('🔄 Recarregando despesas do backend...');
    if (typeof window.buscarDespesasAPI === 'function') {
        const despesasAtualizadas = await window.buscarDespesasAPI(mes, ano);
        if (despesasAtualizadas) {
            window.garantirEstruturaDados(ano, mes);
            window.dadosFinanceiros[ano].meses[mes].despesas = despesasAtualizadas;
            console.log('✅ Despesas atualizadas com IDs reais do backend');
        }
    }
}

// Função auxiliar para limpeza após gravação
function limparAposGravacao(formData, ehEdicao) {
    if (window.sistemaAnexos) {
        window.sistemaAnexos.limparAnexosTemporarios('despesa');
    }

    if (window.logManager) {
        window.logManager.registrar({
            modulo: 'Despesas',
            acao: ehEdicao ? 'Editado' : 'Criado',
            categoria: formData.categoria || '-',
            descricao: formData.descricao,
            valor: formData.valor,
            detalhes: `${ehEdicao ? 'Editou' : 'Criou'} despesa em ${formData.mes + 1}/${formData.ano}`
        });
    }
}

// ✅ NOVA FUNÇÃO: Atualizar todas as parcelas de um grupo
async function atualizarTodasParcelasGrupo(formData, despesaEmEdicao, valorParcela, valorComJuros, totalJuros) {
    try {
        // Se idGrupoParcelamento for null, a despesa EM EDIÇÃO é a primeira parcela (usa próprio ID)
        const idGrupo = despesaEmEdicao.idGrupoParcelamento || despesaEmEdicao.id;
        const token = sessionStorage.getItem('token');

        // Converter nome da categoria para ID
        let categoriaId = null;
        if (formData.categoria) {
            // Buscar categoria pelo nome para obter o ID
            const categoriasUsuario = window.categoriasUsuario?.despesas || [];
            const categoriaEncontrada = categoriasUsuario.find(c => {
                const nome = typeof c === 'string' ? c : c.nome;
                return nome === formData.categoria;
            });
            if (categoriaEncontrada && typeof categoriaEncontrada === 'object') {
                categoriaId = categoriaEncontrada.id;
            }
        }

        // Buscar todas as parcelas do grupo via API
        const todasParcelas = [];

        // Buscar no ano anterior, atual e próximos 3 anos (para cobrir parcelamentos longos)
        // Ano anterior é necessário caso a primeira parcela esteja em ano diferente da parcela editada
        for (let ano = formData.ano - 1; ano <= formData.ano + 3; ano++) {
            const response = await fetch(`${API_URL}/despesas?ano=${ano}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                // Incluir parcelas do grupo E a primeira parcela (cujo ID é o idGrupo)
                // Usar parseInt para garantir comparação correta (string vs number)
                const idGrupoNum = parseInt(idGrupo);
                const parcelas = (data.data || []).filter(d =>
                    parseInt(d.grupo_parcelamento_id) === idGrupoNum || parseInt(d.id) === idGrupoNum
                );
                todasParcelas.push(...parcelas);
            }
        }

        console.log(`📦 Encontradas ${todasParcelas.length} parcelas do grupo ${idGrupo}`);

        // Atualizar cada parcela
        for (const parcela of todasParcelas) {
            // Calcular nova data de vencimento baseada na parcela
            const parcelaNum = parcela.parcela_atual || 1;
            // Usar dataDeISO para evitar problema de timezone
            const dataVencimentoBase = window.dataDeISO ? window.dataDeISO(formData.dataVencimento) : new Date(formData.dataVencimento + 'T00:00:00');
            dataVencimentoBase.setMonth(dataVencimentoBase.getMonth() + (parcelaNum - 1));

            // Usar dataParaISO para evitar problema de timezone
            const novaDataVencimento = window.dataParaISO ? window.dataParaISO(dataVencimentoBase) : `${dataVencimentoBase.getFullYear()}-${String(dataVencimentoBase.getMonth() + 1).padStart(2, '0')}-${String(dataVencimentoBase.getDate()).padStart(2, '0')}`;

            // Calcular mês/ano da parcela
            let mesParcela = formData.mes + (parcelaNum - 1);
            let anoParcela = formData.ano;
            while (mesParcela > 11) {
                mesParcela -= 12;
                anoParcela++;
            }

            // Usar o total de parcelas do formulário (pode ter sido editado)
            const totalParcelasAtual = formData.totalParcelas || despesaEmEdicao.totalParcelas;

            // Montar descrição com número da parcela
            const descricaoBase = formData.descricao.replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();
            const descricaoComParcela = `${descricaoBase} (${parcelaNum}/${totalParcelasAtual})`;

            const dadosAtualizacao = {
                descricao: descricaoComParcela,
                valor: valorParcela,
                valor_original: valorParcela,
                valor_total_com_juros: valorComJuros > valorParcela ? valorComJuros : null,
                data_vencimento: novaDataVencimento,
                data_compra: formData.dataCompra,
                mes: mesParcela,
                ano: anoParcela,
                forma_pagamento: formData.formaPagamento,
                cartao_id: formData.cartao_id,
                categoria_id: categoriaId,  // Usar o ID numérico da categoria
                total_parcelas: totalParcelasAtual,
                parcela_atual: parcelaNum,
                parcelado: true,
                recorrente: formData.recorrente || false  // Incluir campo recorrente
            };

            console.log(`📝 Atualizando parcela ${parcelaNum}/${totalParcelasAtual} (ID: ${parcela.id})`);

            const updateResponse = await fetch(`${API_URL}/despesas/${parcela.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(dadosAtualizacao)
            });

            if (!updateResponse.ok) {
                console.error(`❌ Erro ao atualizar parcela ${parcela.id}:`, updateResponse.status);
            }
        }

        console.log('✅ Todas as parcelas atualizadas com sucesso');
        return true;

    } catch (error) {
        console.error('❌ Erro ao atualizar parcelas do grupo:', error);
        return false;
    }
}

async function editarDespesa(index, mes, ano) {
    abrirModalNovaDespesa(index);
}

// ================================================================
// FUNÇÕES BASEADAS EM ID (para ações corretas após filtros/ordenação)
// ================================================================

async function editarDespesaPorId(despesaId, mes, ano) {
    const { despesa, indice } = encontrarDespesaPorId(despesaId, mes, ano);
    if (!despesa) {
        throw new Error('Despesa não encontrada');
    }
    abrirModalNovaDespesa(indice);
}

async function excluirDespesaPorId(despesaId, mes, ano) {
    const { despesa, indice } = encontrarDespesaPorId(despesaId, mes, ano);
    if (!despesa) {
        throw new Error('Despesa não encontrada');
    }
    await excluirDespesa(indice, mes, ano);
}

async function abrirModalPagamentoPorId(despesaId, mes, ano) {
    const { despesa, indice } = encontrarDespesaPorId(despesaId, mes, ano);
    if (!despesa) {
        throw new Error('Despesa não encontrada');
    }
    await abrirModalPagamento(indice, mes, ano);
}

async function moverParaProximoMesPorId(despesaId, mes, ano) {
    const { despesa, indice } = encontrarDespesaPorId(despesaId, mes, ano);
    if (!despesa) {
        throw new Error('Despesa não encontrada');
    }
    await moverParaProximoMes(indice, mes, ano);
}

async function abrirModalVisualizarAnexosDespesaPorId(despesaId) {
    const mes = window.mesAberto;
    const ano = window.anoAberto;
    const { despesa, indice } = encontrarDespesaPorId(despesaId, mes, ano);
    if (!despesa) {
        throw new Error('Despesa não encontrada');
    }
    await abrirModalVisualizarAnexosDespesa(indice);
}

function validarGrupoParcelamento(idGrupo, despesaOriginal) {
    if (!idGrupo || !despesaOriginal) return { valido: false, erro: 'Parâmetros inválidos' };
    
    const parcelas = [];
    const anoBase = despesaOriginal.ano || new Date().getFullYear();
    
    for (let ano = anoBase; ano <= anoBase + 3; ano++) {
        if (!dadosFinanceiros[ano]) continue;
        
        for (let mes = 0; mes < 12; mes++) {
            if (!dadosFinanceiros[ano].meses[mes]?.despesas) continue;
            
            dadosFinanceiros[ano].meses[mes].despesas.forEach((despesa, index) => {
                if (despesa.idGrupoParcelamento === idGrupo && 
                    despesa.descricao === despesaOriginal.descricao) {
                    parcelas.push({
                        despesa,
                        index,
                        mes,
                        ano,
                        parcela: despesa.parcela
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
            const [numA] = a.parcela.split('/').map(Number);
            const [numB] = b.parcela.split('/').map(Number);
            return numA - numB;
        }),
        erro: encontradas !== totalEsperado ? `Esperadas ${totalEsperado}, encontradas ${encontradas}` : null
    };
}

function sincronizarParcelasGrupo(idGrupo, despesaReferencia) {
    if (!idGrupo || !despesaReferencia) return false;
    
    const validacao = validarGrupoParcelamento(idGrupo, despesaReferencia);
    
    if (!validacao.valido) {

        return false;
    }
    
    validacao.parcelas.forEach((item, sequencia) => {
        const { despesa } = item;
        const numeroParcelaCorreto = `${sequencia + 1}/${despesaReferencia.totalParcelas}`;
        
        if (despesa.parcela !== numeroParcelaCorreto) {
            despesa.parcela = numeroParcelaCorreto;
        }
    });
    
    return true;
}

function contarParcelasGrupo(idGrupo, descricao) {
    if (!idGrupo) return 0;
    
    let contador = 0;
    const anoAtual = new Date().getFullYear();
    
    for (let ano = anoAtual; ano <= anoAtual + 3; ano++) {
        if (!dadosFinanceiros[ano]) continue;
        
        for (let mes = 0; mes < 12; mes++) {
            if (!dadosFinanceiros[ano].meses[mes]?.despesas) continue;
            
            contador += dadosFinanceiros[ano].meses[mes].despesas.filter(d => 
                d.idGrupoParcelamento === idGrupo && 
                (!descricao || d.descricao === descricao)
            ).length;
        }
    }
    
    return contador;
}

async function excluirApenasParcela(index, mes, ano) {
    try {
        if (!dadosFinanceiros[ano]?.meses[mes]?.despesas[index]) {
            throw new Error('Parcela não encontrada');
        }

        const despesa = dadosFinanceiros[ano].meses[mes].despesas[index];

        if (!despesa.id) {
            throw new Error('Despesa sem ID');
        }

        // Excluir via API
        const response = await fetch(`${API_URL}/despesas/${despesa.id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error(`Erro ao excluir despesa: ${response.status}`);
        }

        // Recarregar dados do mês
        if (typeof window.buscarDespesasAPI === 'function') {
            const despesasAtualizadas = await window.buscarDespesasAPI(mes, ano);
            if (dadosFinanceiros[ano]?.meses[mes]) {
                dadosFinanceiros[ano].meses[mes].despesas = despesasAtualizadas;
            }
        }

        return true;
    } catch (error) {
        console.error('Erro ao excluir parcela:', error);
        return false;
    }
}

async function excluirParcelaEFuturas(index, mes, ano) {
    try {
        if (!dadosFinanceiros[ano]?.meses[mes]?.despesas[index]) {
            throw new Error('Parcela não encontrada');
        }

        const despesa = dadosFinanceiros[ano].meses[mes].despesas[index];
        const idGrupo = despesa.idGrupoParcelamento || despesa.id;
        const parcelaAtual = despesa.parcelaAtual || (despesa.parcela ? parseInt(despesa.parcela.split('/')[0]) : 1);

        console.log('🗑️ Excluindo parcela atual e futuras:', { idGrupo, parcelaAtual, despesaId: despesa.id });

        // Excluir a parcela atual primeiro
        await fetch(`${API_URL}/despesas/${despesa.id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        // Buscar e excluir parcelas futuras via API (mais confiável que iterar dadosFinanceiros)
        if (idGrupo) {
            // Buscar despesas do ano atual
            const response = await fetch(`${API_URL}/despesas?ano=${ano}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });

            if (response.ok) {
                const data = await response.json();
                for (const d of (data.data || [])) {
                    if (d.grupo_parcelamento_id === idGrupo && d.parcela_atual > parcelaAtual) {
                        console.log('🗑️ Excluindo parcela futura:', d.id, `${d.parcela_atual}/${d.numero_parcelas}`);
                        await fetch(`${API_URL}/despesas/${d.id}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${getToken()}` }
                        });
                    }
                }
            }

            // Verificar ano seguinte
            const responseProx = await fetch(`${API_URL}/despesas?ano=${ano + 1}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });

            if (responseProx.ok) {
                const dataProx = await responseProx.json();
                for (const d of (dataProx.data || [])) {
                    if (d.grupo_parcelamento_id === idGrupo) {
                        console.log('🗑️ Excluindo parcela futura (ano seguinte):', d.id);
                        await fetch(`${API_URL}/despesas/${d.id}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${getToken()}` }
                        });
                    }
                }
            }
        }

        // Recarregar dados do mês atual
        if (typeof window.buscarDespesasAPI === 'function') {
            const despesasAtualizadas = await window.buscarDespesasAPI(mes, ano);
            if (dadosFinanceiros[ano]?.meses[mes]) {
                dadosFinanceiros[ano].meses[mes].despesas = despesasAtualizadas;
            }
        }

        return true;
    } catch (error) {
        console.error('Erro ao excluir parcelas futuras:', error);
        return false;
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

// ================================================================
// CÁLCULOS E INFO DE PARCELAMENTO
// ================================================================

function calcularInfoParcelamento() {
    const inputValorOriginal = document.getElementById('despesa-valor');
    const inputValorPago = document.getElementById('despesa-valor-pago');
    const inputNumParcelas = document.getElementById('despesa-parcelas');

    const valorOriginal = parseFloat(inputValorOriginal.value) || 0;
    const valorPagoTotal = parseFloat(inputValorPago.value) || valorOriginal;
    const numParcelas = parseInt(inputNumParcelas.value) || 1;

    if (valorOriginal <= 0 || valorPagoTotal <= 0 || numParcelas < 1) {
        const info = document.getElementById('info-parcelamento');
        if (info) info.classList.add('hidden');
        return;
    }

    const totalJuros = valorPagoTotal - valorOriginal;
    const valorParcela = arredondarParaDuasCasas(valorPagoTotal / numParcelas);

    const infoContainer = document.getElementById('info-parcelamento');
    if (infoContainer && numParcelas > 1) {
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
    } else if (infoContainer) {
        infoContainer.classList.add('hidden');
    }
}

// ================================================================
// CONFIGURAÇÃO DE EVENTOS DO FORMULÁRIO
// ================================================================

function configurarEventosFormularioDespesa() {
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


window.handleSalvarDespesa = function(event) {
    event.preventDefault();
    salvarDespesa(event);
    return false;
};

// ================================================================
// INICIALIZAÇÃO AUTOMÁTICA
// ================================================================

document.addEventListener('DOMContentLoaded', inicializarSistemaAnexosDespesas);

// ================================================================
// SISTEMA DE DESPESAS - PARTE 2/4
// EXCLUSÕES E MOVIMENTAÇÕES DE DESPESAS
// ================================================================

// ================================================================
// EXCLUSÃO DE DESPESAS
// ================================================================

async function excluirDespesa(index, mes, ano) {
    try {
        const indexNumerico = parseInt(index);
        const despesas = dadosFinanceiros[ano]?.meses[mes]?.despesas;
        
        if (!Array.isArray(despesas) || indexNumerico < 0 || indexNumerico >= despesas.length || !despesas[indexNumerico]) {
            renderizarDetalhesDoMes(mes, ano);
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
        renderizarDetalhesDoMes(mes, ano);
    }
}

async function configurarModalExclusao(despesa, index, mes, ano) {
    const titulo = document.getElementById('exclusao-titulo');
    const mensagem = document.getElementById('exclusao-mensagem');
    const modal = document.getElementById('modal-confirmacao-exclusao-despesa');

    // Verifica se é parcelado pela propriedade parcelado OU pela existência de parcela ou idGrupoParcelamento
    const isParcelado = despesa.parcelado || despesa.parcela || despesa.idGrupoParcelamento;
    const isRecorrente = !isParcelado && despesa.recorrente;

    // Limpar classes anteriores
    if (modal) {
        modal.classList.remove('modal-parcelado');
        modal.classList.remove('modal-recorrente');
    }

    if (isParcelado) {
        if (titulo) titulo.textContent = 'Excluir item parcelado';
        if (mensagem) mensagem.textContent = 'Este item está parcelado. Como deseja prosseguir?';
        if (modal) modal.classList.add('modal-parcelado');
    } else if (isRecorrente) {
        if (titulo) titulo.textContent = 'Excluir despesa recorrente';
        if (mensagem) mensagem.textContent = 'Esta despesa é recorrente. Como deseja prosseguir?';
        if (modal) modal.classList.add('modal-recorrente');
    } else {
        if (titulo) titulo.textContent = 'Excluir despesa';
        if (mensagem) mensagem.textContent = 'Tem certeza que deseja excluir esta despesa?';
    }

    await configurarBotoesExclusao(despesa, index, mes, ano);
}

async function configurarBotoesExclusao(despesa, index, mes, ano) {
    const botoesParaLimpar = [
        'btn-excluir-atual',
        'btn-excluir-todos-meses',
        'btn-excluir-parcela-atual',
        'btn-excluir-parcelas-futuras',
        'btn-excluir-todas-parcelas',
        'btn-excluir-recorrente-atual',
        'btn-excluir-recorrente-futuras',
        'btn-excluir-recorrente-todas'
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

    const isParcelado = despesa.parcelado || despesa.parcela || despesa.idGrupoParcelamento;
    const isRecorrente = !isParcelado && despesa.recorrente;

    if (isParcelado) {
        configurarBotoesExclusaoParcelada(despesa, index, mes, ano);
    } else if (isRecorrente) {
        configurarBotoesExclusaoRecorrente(despesa, index, mes, ano);
    } else {
        configurarBotoesExclusaoSimples(despesa, index, mes, ano);
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
                await processarExclusao('atual', index, mes, ano, despesa.descricao, despesa.categoria, despesa.idGrupoParcelamento);
            } catch (error) {
                if (window.mostrarMensagemErro) {
                    window.mostrarMensagemErro('Erro ao excluir: ' + error.message);
                } else {
                    if (window.mostrarMensagemErro) {
                    window.mostrarMensagemErro('Erro ao excluir: ' + error.message);
                } else {
                    alert('Erro ao excluir: ' + error.message);
                }
                }
            }
        };
    }
    
    if (btnTodos) {
        btnTodos.onclick = async function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            try {
                await processarExclusao('todas', index, mes, ano, despesa.descricao, despesa.categoria, despesa.idGrupoParcelamento);
            } catch (error) {
                if (window.mostrarMensagemErro) {
                    window.mostrarMensagemErro('Erro ao excluir: ' + error.message);
                } else {
                    alert('Erro ao excluir: ' + error.message);
                }
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
                await processarExclusao('parcela', index, mes, ano, despesa.descricao, despesa.categoria, despesa.idGrupoParcelamento);
            } catch (error) {
                if (window.mostrarMensagemErro) {
                    window.mostrarMensagemErro('Erro ao excluir parcela: ' + error.message);
                } else {
                    alert('Erro ao excluir parcela: ' + error.message);
                }
            }
        };
    }
    
    if (btnFuturas) {
        btnFuturas.onclick = async function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            try {
                await processarExclusao('futuras', index, mes, ano, despesa.descricao, despesa.categoria, despesa.idGrupoParcelamento);
            } catch (error) {
                if (window.mostrarMensagemErro) {
                    window.mostrarMensagemErro('Erro ao excluir parcelas futuras: ' + error.message);
                } else {
                    alert('Erro ao excluir parcelas futuras: ' + error.message);
                }
            }
        };
    }
    
    if (btnTodas) {
        btnTodas.onclick = async function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            try {
                await processarExclusao('todas', index, mes, ano, despesa.descricao, despesa.categoria, despesa.idGrupoParcelamento);
            } catch (error) {
                if (window.mostrarMensagemErro) {
                    window.mostrarMensagemErro('Erro ao excluir todas as parcelas: ' + error.message);
                } else {
                    alert('Erro ao excluir todas as parcelas: ' + error.message);
                }
            }
        };
    }
}

function configurarBotoesExclusaoRecorrente(despesa, index, mes, ano) {
    const btnAtual = document.getElementById('btn-excluir-recorrente-atual');
    const btnFuturas = document.getElementById('btn-excluir-recorrente-futuras');
    const btnTodas = document.getElementById('btn-excluir-recorrente-todas');

    if (btnAtual) {
        btnAtual.onclick = async function(e) {
            e.preventDefault();
            e.stopPropagation();
            try {
                await processarExclusao('atual', index, mes, ano, despesa.descricao, despesa.categoria, null);
            } catch (error) {
                if (window.mostrarMensagemErro) {
                    window.mostrarMensagemErro('Erro ao excluir: ' + error.message);
                } else {
                    alert('Erro ao excluir: ' + error.message);
                }
            }
        };
    }

    if (btnFuturas) {
        btnFuturas.onclick = async function(e) {
            e.preventDefault();
            e.stopPropagation();
            try {
                await processarExclusao('recorrente-futuras', index, mes, ano, despesa.descricao, despesa.categoria, null);
            } catch (error) {
                if (window.mostrarMensagemErro) {
                    window.mostrarMensagemErro('Erro ao excluir futuras: ' + error.message);
                } else {
                    alert('Erro ao excluir futuras: ' + error.message);
                }
            }
        };
    }

    if (btnTodas) {
        btnTodas.onclick = async function(e) {
            e.preventDefault();
            e.stopPropagation();
            try {
                await processarExclusao('todas', index, mes, ano, despesa.descricao, despesa.categoria, null);
            } catch (error) {
                if (window.mostrarMensagemErro) {
                    window.mostrarMensagemErro('Erro ao excluir todas: ' + error.message);
                } else {
                    alert('Erro ao excluir todas: ' + error.message);
                }
            }
        };
    }
}

async function processarExclusao(opcao, index, mes, ano, descricaoDespesa, categoriaDespesa, idGrupoParcelamento) {
    try {
        let sucesso = false;
        
        switch (opcao) {
            case 'atual':
                sucesso = await excluirDespesaLocal('atual', index, mes, ano, descricaoDespesa, categoriaDespesa, idGrupoParcelamento);
                break;
                
            case 'todas':
                sucesso = await excluirDespesaLocal('todas', index, mes, ano, descricaoDespesa, categoriaDespesa, idGrupoParcelamento);
                break;
                
            case 'parcela':
                sucesso = await excluirApenasParcela(index, mes, ano);
                break;
                
            case 'futuras':
                sucesso = await excluirParcelaEFuturas(index, mes, ano);
                break;

            case 'recorrente-futuras':
                sucesso = await excluirRecorrenteEFuturas(index, mes, ano);
                break;

            default:
                throw new Error('Tipo de exclusão não reconhecido');
        }

        if (sucesso) {
            if (typeof carregarDadosDashboard === 'function') {
                await carregarDadosDashboard(anoAtual);
            }
            
            if (typeof renderizarDetalhesDoMes === 'function') {
                renderizarDetalhesDoMes(mesAberto, anoAberto);
            }
        } else {
            throw new Error('Falha ao excluir despesa');
        }
        
        const modal = document.getElementById('modal-confirmacao-exclusao-despesa');
        if (modal) modal.style.display = 'none';
        
    } catch (error) {
        if (window.mostrarMensagemErro) {
            window.mostrarMensagemErro('Erro ao processar exclusão: ' + error.message);
        } else {
            alert('Erro ao processar exclusão: ' + error.message);
        }
    }
}

async function excluirDespesaLocal(opcao, index, mes, ano, descricaoDespesa, categoriaDespesa, idGrupoParcelamento) {
    try {
        let valorExcluido = 0;
        let quantidadeExcluida = 0;

        if (opcao === 'atual') {
            const despesa = dadosFinanceiros[ano]?.meses[mes]?.despesas[index];
            if (!despesa) {
                throw new Error('Despesa não encontrada');
            }

            // ✅ CORRIGIDO: Validação simplificada - agora sempre temos IDs reais do backend
            if (!despesa.id) {
                console.error('❌ Despesa sem ID:', despesa);
                if (window.mostrarMensagemErro) {
                    window.mostrarMensagemErro('Erro: Despesa sem identificador. Por favor, recarregue a página.');
                } else {
                    alert('Erro: Despesa sem identificador. Por favor, recarregue a página.');
                }
                return false;
            }

            valorExcluido = despesa.valor || 0;
            quantidadeExcluida = 1;

            const response = await fetch(`${API_URL}/despesas/${despesa.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                }
            });

            if (!response.ok) {
                throw new Error(`Erro ao excluir despesa: ${response.status}`);
            }

            // Recarregar dados do mês
            if (typeof window.buscarDespesasAPI === 'function') {
                const despesasAtualizadas = await window.buscarDespesasAPI(mes, ano);
                if (dadosFinanceiros[ano]?.meses[mes]) {
                    dadosFinanceiros[ano].meses[mes].despesas = despesasAtualizadas;
                }
            }
        }
        else if (opcao === 'todas') {
            if (idGrupoParcelamento) {
                const resultado = await excluirTodasParcelas(ano, descricaoDespesa, categoriaDespesa, idGrupoParcelamento);
                quantidadeExcluida = resultado.quantidade || 0;
                valorExcluido = resultado.valorTotal || 0;
            } else {
                const resultado = await excluirDespesaEmTodosMeses(ano, descricaoDespesa, categoriaDespesa);
                quantidadeExcluida = resultado.quantidade || 0;
                valorExcluido = resultado.valorTotal || 0;
            }
        }

        // Registrar log da exclusão
        if (window.logManager && quantidadeExcluida > 0) {
            window.logManager.registrar({
                modulo: 'Despesas',
                acao: 'Excluído',
                categoria: categoriaDespesa || '-',
                descricao: descricaoDespesa,
                valor: valorExcluido,
                detalhes: quantidadeExcluida > 1
                    ? `Excluiu ${quantidadeExcluida} despesa(s)`
                    : `Excluiu despesa de ${mes + 1}/${ano}`
            });
        }

        return true;

    } catch (error) {
        console.error('Erro ao excluir despesa:', error);
        return false;
    }
}

async function excluirTodasParcelas(ano, descricao, categoria, idGrupo) {
    if (!idGrupo) return { quantidade: 0, valorTotal: 0 };

    try {
        console.log('🗑️ Excluindo TODAS as parcelas do grupo:', idGrupo);

        // Usar o endpoint do backend com excluir_grupo=true para excluir todas de uma vez
        const response = await fetch(`${API_URL}/despesas/${idGrupo}?excluir_grupo=true`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error(`Erro ao excluir grupo: ${response.status}`);
        }

        console.log('✅ Grupo de parcelas excluído com sucesso');

        // Recarregar dados do mês atual
        if (typeof window.buscarDespesasAPI === 'function') {
            const despesasAtualizadas = await window.buscarDespesasAPI(mesAberto, anoAberto);
            if (dadosFinanceiros[anoAberto]?.meses[mesAberto]) {
                dadosFinanceiros[anoAberto].meses[mesAberto].despesas = despesasAtualizadas;
            }
        }

        return { quantidade: 1, valorTotal: 0 };
    } catch (error) {
        console.error('Erro ao excluir todas as parcelas:', error);
        return { quantidade: 0, valorTotal: 0 };
    }
}

function reindexarParcelasAposExclusao(idGrupo, descricao) {
    const parcelas = [];
    const anoBase = new Date().getFullYear();
    
    for (let ano = anoBase; ano <= anoBase + 3; ano++) {
        if (!dadosFinanceiros[ano]) continue;
        
        for (let mes = 0; mes < 12; mes++) {
            if (!dadosFinanceiros[ano].meses[mes]?.despesas) continue;
            
            dadosFinanceiros[ano].meses[mes].despesas.forEach(despesa => {
                if (despesa.idGrupoParcelamento === idGrupo && 
                    despesa.descricao === descricao) {
                    parcelas.push(despesa);
                }
            });
        }
    }
    
    parcelas.sort((a, b) => {
        const dataA = new Date(a.dataVencimento);
        const dataB = new Date(b.dataVencimento);
        return dataA - dataB;
    });
    
    parcelas.forEach((parcela, index) => {
        parcela.parcela = `${index + 1}/${parcelas.length}`;
        parcela.totalParcelas = parcelas.length;
    });
}

function verificarOrfaosParcelamento() {
    const grupos = new Map();
    const anoBase = new Date().getFullYear();
    
    for (let ano = anoBase; ano <= anoBase + 3; ano++) {
        if (!dadosFinanceiros[ano]) continue;
        
        for (let mes = 0; mes < 12; mes++) {
            if (!dadosFinanceiros[ano].meses[mes]?.despesas) continue;
            
            dadosFinanceiros[ano].meses[mes].despesas.forEach(despesa => {
                if (despesa.idGrupoParcelamento && despesa.parcelado) {
                    const key = `${despesa.idGrupoParcelamento}-${despesa.descricao}`;
                    
                    if (!grupos.has(key)) {
                        grupos.set(key, {
                            idGrupo: despesa.idGrupoParcelamento,
                            descricao: despesa.descricao,
                            totalEsperado: despesa.totalParcelas,
                            parcelas: []
                        });
                    }
                    
                    grupos.get(key).parcelas.push({
                        despesa,
                        mes,
                        ano,
                        parcela: despesa.parcela
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

async function excluirDespesaEmTodosMeses(ano, descricao, categoria) {
    let despesasRemovidas = 0;
    let valorTotal = 0;
    const anosAfetados = new Set();
    const mesesAfetadosPorAno = {};

    // Buscar em TODOS os anos do dadosFinanceiros (não apenas o ano atual)
    const todosAnos = Object.keys(dadosFinanceiros).map(Number).sort();

    for (const anoAtual of todosAnos) {
        if (!dadosFinanceiros[anoAtual]?.meses) continue;

        for (let m = 0; m < 12; m++) {
            if (!dadosFinanceiros[anoAtual].meses[m]?.despesas) continue;

            const despesas = dadosFinanceiros[anoAtual].meses[m].despesas;

            for (const d of despesas) {
                if (d.descricao === descricao && d.categoria === categoria && !d.parcelado) {
                    if (d.id && d.id <= 2147483647) {
                        await fetch(`${API_URL}/despesas/${d.id}`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${getToken()}`
                            }
                        });

                        valorTotal += parseFloat(d.valor || 0);
                        despesasRemovidas++;
                        anosAfetados.add(anoAtual);
                        if (!mesesAfetadosPorAno[anoAtual]) mesesAfetadosPorAno[anoAtual] = new Set();
                        mesesAfetadosPorAno[anoAtual].add(m);
                    }
                }
            }
        }
    }

    // Recarregar dados dos meses afetados
    if (typeof window.buscarDespesasAPI === 'function') {
        for (const anoAfetado of anosAfetados) {
            for (const mesAfetado of (mesesAfetadosPorAno[anoAfetado] || [])) {
                const despesasAtualizadas = await window.buscarDespesasAPI(mesAfetado, anoAfetado);
                if (dadosFinanceiros[anoAfetado]?.meses[mesAfetado]) {
                    dadosFinanceiros[anoAfetado].meses[mesAfetado].despesas = despesasAtualizadas;
                }
            }
        }
    }

    // Atualizar dashboard para todos os anos afetados
    for (const anoAfetado of anosAfetados) {
        if (typeof window.carregarDadosDashboard === 'function') {
            await window.carregarDadosDashboard(anoAfetado);
        }
    }

    return { quantidade: despesasRemovidas, valorTotal: valorTotal };
}

/**
 * Exclui a despesa recorrente atual e todas as futuras com mesma descrição/categoria
 */
async function excluirRecorrenteEFuturas(index, mes, ano) {
    try {
        const despesa = dadosFinanceiros[ano]?.meses[mes]?.despesas[index];
        if (!despesa) {
            throw new Error('Despesa não encontrada');
        }

        const descricao = despesa.descricao;
        const categoria = despesa.categoria;
        let despesasRemovidas = 0;
        const mesesAfetados = new Set();
        const anosAfetados = new Set();

        // 1. Excluir a despesa atual
        if (despesa.id) {
            await fetch(`${API_URL}/despesas/${despesa.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            despesasRemovidas++;
            mesesAfetados.add(`${ano}-${mes}`);
            anosAfetados.add(ano);
        }

        // 2. Excluir futuras do mesmo ano (meses posteriores)
        for (let m = mes + 1; m < 12; m++) {
            if (!dadosFinanceiros[ano]?.meses[m]?.despesas) continue;
            for (const d of dadosFinanceiros[ano].meses[m].despesas) {
                if (d.descricao === descricao && d.categoria === categoria && !d.parcelado && d.id) {
                    await fetch(`${API_URL}/despesas/${d.id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${getToken()}` }
                    });
                    despesasRemovidas++;
                    mesesAfetados.add(`${ano}-${m}`);
                }
            }
        }

        // 3. Buscar e excluir em anos futuros via API (até 3 anos à frente)
        for (let anoFuturo = ano + 1; anoFuturo <= ano + 3; anoFuturo++) {
            try {
                const response = await fetch(`${API_URL}/despesas?ano=${anoFuturo}`, {
                    headers: { 'Authorization': `Bearer ${getToken()}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    for (const d of (data.data || [])) {
                        if (d.descricao === descricao && d.categoria === categoria && !d.parcelado) {
                            await fetch(`${API_URL}/despesas/${d.id}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${getToken()}` }
                            });
                            despesasRemovidas++;
                            anosAfetados.add(anoFuturo);
                        }
                    }
                }
            } catch (err) {
                console.error(`Erro ao buscar despesas de ${anoFuturo}:`, err);
            }
        }

        // 4. Recarregar dados dos meses afetados
        if (typeof window.buscarDespesasAPI === 'function') {
            for (const chave of mesesAfetados) {
                const [a, m] = chave.split('-').map(Number);
                const despesasAtualizadas = await window.buscarDespesasAPI(m, a);
                if (dadosFinanceiros[a]?.meses[m]) {
                    dadosFinanceiros[a].meses[m].despesas = despesasAtualizadas;
                }
            }
        }

        // 5. Recarregar dashboard para anos afetados
        for (const a of anosAfetados) {
            if (typeof window.carregarDadosDashboard === 'function') {
                await window.carregarDadosDashboard(a);
            }
        }

        if (window.logManager && despesasRemovidas > 0) {
            window.logManager.registrar({
                modulo: 'Despesas',
                acao: 'Excluído',
                categoria: categoria || '-',
                descricao: descricao,
                detalhes: `Excluiu ${despesasRemovidas} despesa(s) recorrente(s) (atual e futuras)`
            });
        }

        return true;
    } catch (error) {
        console.error('Erro ao excluir recorrente e futuras:', error);
        return false;
    }
}

window.excluirDespesaAtual = async function() {
    if (window.despesaParaExcluir) {
        const { index, mes, ano } = window.despesaParaExcluir;
        
        try {
            await processarExclusao('atual', index, mes, ano, '', '', null);
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

// ================================================================
// MOVIMENTAÇÃO PARA PRÓXIMO MÊS
// ================================================================

async function moverParaProximoMes(index, mes, ano) {
    try {
        if (!dadosFinanceiros[ano] || !dadosFinanceiros[ano].meses[mes] || !dadosFinanceiros[ano].meses[mes].despesas[index]) {
            throw new Error('Despesa não encontrada');
        }
        
        const despesa = dadosFinanceiros[ano].meses[mes].despesas[index];

        if (despesa.quitado === true) {
            if (window.mostrarMensagemErro) {
                window.mostrarMensagemErro("Não é possível mover uma despesa que já foi paga.");
            } else {
                alert("Não é possível mover uma despesa que já foi paga.");
            }
            return;
        }

        const { proximoMes, proximoAno } = calcularProximoMes(mes, ano);
        const { mesAtualNome, proximoMesNome } = obterNomesMeses(mes, proximoMes);

        if (!confirm(`Mover despesa "${despesa.descricao}" de ${mesAtualNome} para ${proximoMesNome} de ${proximoAno}?`)) {
            return;
        }

        await executarMovimentoDespesa(despesa, index, mes, ano, proximoMes, proximoAno, mesAtualNome, proximoMesNome);

    } catch (error) {
        if (window.mostrarMensagemErro) {
            window.mostrarMensagemErro("Não foi possível mover a despesa: " + error.message);
        } else {
            alert("Não foi possível mover a despesa: " + error.message);
        }
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
    try {
        // Validar se despesa tem ID
        if (!despesa.id) {
            throw new Error('Despesa sem ID. Por favor, recarregue a página.');
        }

        // 1. Excluir despesa do mês original via API
        const responseDelete = await fetch(`${API_URL}/despesas/${despesa.id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!responseDelete.ok) {
            throw new Error(`Erro ao excluir despesa do mês original: ${responseDelete.status}`);
        }

        // 2. Criar nova despesa no mês destino via API
        const novaDespesa = {
            descricao: despesa.descricao,
            valor: despesa.valor,
            data_vencimento: despesa.dataVencimento || despesa.data_vencimento,
            data_compra: despesa.dataCompra || despesa.data_compra,
            mes: proximoMes,
            ano: proximoAno,
            categoria_id: despesa.categoriaId || despesa.categoria_id,
            cartao_id: despesa.cartaoId || despesa.cartao_id,
            forma_pagamento: despesa.formaPagamento || despesa.forma_pagamento,
            parcelado: despesa.parcelado || false,
            total_parcelas: despesa.totalParcelas || despesa.numero_parcelas,
            parcela_atual: despesa.parcelaAtual || despesa.parcela_atual,
            observacoes: despesa.observacoes,
            pago: false,
            valor_original: despesa.valorOriginal || despesa.valor_original,
            valor_total_com_juros: despesa.valorTotalComJuros || despesa.valor_total_com_juros
        };

        const responseCreate = await fetch(`${API_URL}/despesas`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(novaDespesa)
        });

        if (!responseCreate.ok) {
            throw new Error(`Erro ao criar despesa no mês destino: ${responseCreate.status}`);
        }

        // 3. Recarregar dados dos dois meses afetados
        if (typeof window.buscarDespesasAPI === 'function') {
            // Recarregar mês original
            const despesasOriginal = await window.buscarDespesasAPI(mes, ano);
            if (dadosFinanceiros[ano]?.meses[mes]) {
                dadosFinanceiros[ano].meses[mes].despesas = despesasOriginal;
            }

            // Garantir estrutura do mês destino
            garantirEstruturaDados(proximoAno, proximoMes);

            // Recarregar mês destino
            const despesasDestino = await window.buscarDespesasAPI(proximoMes, proximoAno);
            if (dadosFinanceiros[proximoAno]?.meses[proximoMes]) {
                dadosFinanceiros[proximoAno].meses[proximoMes].despesas = despesasDestino;
            }
        }

        // 4. Atualizar interface
        renderizarDetalhesDoMes(mes, ano);

        if (typeof carregarDadosDashboard === 'function') {
            await carregarDadosDashboard(anoAtual);
        }

        // 5. Exibir mensagem de sucesso
        if (window.mostrarMensagemSucesso) {
            window.mostrarMensagemSucesso(`Despesa movida com sucesso para ${proximoMesNome} de ${proximoAno}!`);
        } else {
            alert(`Despesa movida com sucesso para ${proximoMesNome} de ${proximoAno}!`);
        }

    } catch (error) {
        console.error('Erro ao mover despesa:', error);
        throw error;
    }
}

// ================================================================
// SISTEMA DE PAGAMENTOS
// ================================================================

async function abrirModalPagamento(index, mes, ano) {
    try {
        if (!dadosFinanceiros[ano] || 
            !dadosFinanceiros[ano].meses[mes] || 
            !Array.isArray(dadosFinanceiros[ano].meses[mes].despesas)) {
            throw new Error('Estrutura de dados do mês é inválida');
        }
        
        const despesas = dadosFinanceiros[ano].meses[mes].despesas;
        
        let despesaEncontrada = null;
        let indiceAtualizado = -1;
        
        if (index >= 0 && index < despesas.length && despesas[index] && !despesas[index].transferidaParaProximoMes) {
            despesaEncontrada = despesas[index];
            indiceAtualizado = index;
        } else {
            const linhaElemento = document.querySelector(`[data-index="${index}"]`)?.closest('tr.despesa-row');
            if (linhaElemento) {
                const descricaoElemento = linhaElemento.querySelector('.col-descricao');
                const categoriaElemento = linhaElemento.querySelector('.col-categoria');
                
                if (descricaoElemento && categoriaElemento) {
                    const descricao = descricaoElemento.textContent.trim();
                    const categoria = categoriaElemento.textContent.trim();
                    
                    for (let i = 0; i < despesas.length; i++) {
                        const despesa = despesas[i];
                        if (despesa && 
                            !despesa.transferidaParaProximoMes &&
                            despesa.descricao === descricao && 
                            obterCategoriaLimpa(despesa) === categoria) {
                            despesaEncontrada = despesa;
                            indiceAtualizado = i;
                            break;
                        }
                    }
                }
            }
        }
        
        if (!despesaEncontrada) {
            if (typeof renderizarDetalhesDoMes === 'function') {
                renderizarDetalhesDoMes(mes, ano);
            }
            alert('Despesa não encontrada. A tabela foi atualizada. Tente novamente.');
            return;
        }
        
        if (despesaEncontrada.quitado === true) {
            alert('Esta despesa já foi paga.');
            return;
        }
        
        // Limpar anexos temporários de comprovantes
        if (window.sistemaAnexos) {
            window.sistemaAnexos.limparAnexosTemporarios('comprovante');
        }
        
        preencherInfoDespesaPagamento(despesaEncontrada);
        
        // Configurar data de pagamento
        const inputDataPagamento = document.getElementById('data-pagamento-individual');
        if (inputDataPagamento) {
            if (despesaEncontrada.dataPagamento) {
                inputDataPagamento.value = despesaEncontrada.dataPagamento;
            } else {
                inputDataPagamento.value = new Date().toISOString().split('T')[0];
            }
        }
        
        configurarFormPagamento(indiceAtualizado, mes, ano, despesaEncontrada);
        
        const modal = document.getElementById('modal-pagamento-individual');
        if (modal) {
            modal.style.display = 'block';

            // Configurar botão de comprovante ao abrir o modal
            const btnComprovante = document.getElementById('btn-anexar-comprovante');
            if (btnComprovante && window.sistemaAnexos) {
                // Remover listener anterior se existir
                btnComprovante.onclick = null;
                btnComprovante.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.sistemaAnexos.abrirSeletorArquivos('comprovante');
                };
            }

        } else {
            throw new Error('Modal de pagamento não encontrado no DOM');
        }
        
    } catch (error) {

        alert("Não foi possível abrir o modal de pagamento: " + error.message);
    }
}

// Variável global para armazenar o valor original da despesa sendo paga
let valorOriginalDespesaPagamento = 0;

function preencherInfoDespesaPagamento(despesa) {
    // Usar valor com juros se disponível, senão usar valor original
    const valorOriginal = parseFloat(despesa.valorOriginal) || parseFloat(despesa.valor) || 0;
    const valorAPagar = parseFloat(despesa.valorTotalComJuros) || valorOriginal;

    const elementos = {
        'pagamento-descricao': despesa.descricao || 'Sem descrição',
        'pagamento-categoria': despesa.categoria || 'Sem categoria',
        'pagamento-valor-original': window.formatarMoeda ? window.formatarMoeda(valorOriginal) : `R$ ${valorOriginal.toFixed(2)}`
    };

    Object.entries(elementos).forEach(([id, valor]) => {
        const elemento = document.getElementById(id);
        if (elemento) elemento.textContent = valor;
    });

    const formaPagamentoContainer = document.getElementById('pagamento-forma-container');
    const formaPagamentoElemento = document.getElementById('pagamento-forma');

    if (despesa.formaPagamento && formaPagamentoElemento) {
        formaPagamentoElemento.textContent = despesa.formaPagamento.toUpperCase();
        if (formaPagamentoContainer) formaPagamentoContainer.style.display = 'block';
    } else {
        if (formaPagamentoContainer) formaPagamentoContainer.style.display = 'none';
    }

    // Armazenar valor original para cálculo de diferença
    valorOriginalDespesaPagamento = valorOriginal;

    const valorPagoInput = document.getElementById('valor-pago-individual');
    if (valorPagoInput) {
        // Preencher com valor COM JUROS (valor a pagar de fato)
        valorPagoInput.value = valorAPagar;
        // Calcular diferença inicial
        calcularDiferencaPagamento();
    }

    const quitadoCheckbox = document.getElementById('despesa-quitado-individual');
    const infoParcelasFuturas = document.getElementById('info-parcelas-futuras');
    const eParcelado = despesa.parcelado === true && despesa.parcela;

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

// Função para calcular e exibir diferença entre valor pago e valor original
function calcularDiferencaPagamento() {
    const valorPagoInput = document.getElementById('valor-pago-individual');
    const diferencaInfo = document.getElementById('diferenca-pagamento-info');
    const diferencaTexto = document.getElementById('diferenca-texto');

    if (!valorPagoInput || !diferencaInfo || !diferencaTexto) return;

    const valorPago = parseFloat(valorPagoInput.value) || 0;
    const valorOriginal = valorOriginalDespesaPagamento;

    // Calcular diferença
    const diferenca = valorOriginal - valorPago;

    if (Math.abs(diferenca) < 0.01) {
        // Valores iguais
        diferencaInfo.classList.add('hidden');
    } else if (diferenca > 0) {
        // Economia (pagou menos que o original)
        diferencaInfo.classList.remove('hidden');
        diferencaInfo.className = 'diferenca-info economia';
        diferencaTexto.textContent = `Economia: ${window.formatarMoeda ? window.formatarMoeda(diferenca) : `R$ ${diferenca.toFixed(2)}`}`;
    } else {
        // Juros (pagou mais que o original)
        diferencaInfo.classList.remove('hidden');
        diferencaInfo.className = 'diferenca-info juros';
        diferencaTexto.textContent = `Juros: ${window.formatarMoeda ? window.formatarMoeda(Math.abs(diferenca)) : `R$ ${Math.abs(diferenca).toFixed(2)}`}`;
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
                
                const sucesso = await processarPagamento(index, mes, ano, valorPago, quitarFuturas);

                if (sucesso) {
                    const modal = document.getElementById('modal-pagamento-individual');
                    if (modal) modal.style.display = 'none';

                    // Usar toast notification em vez de alert
                    if (window.mostrarToast) {
                        window.mostrarToast('Pagamento processado com sucesso!', 'success');
                    }
                } else {
                    if (window.mostrarToast) {
                        window.mostrarToast('Ocorreu um erro ao processar o pagamento.', 'error');
                    } else {
                        alert('Ocorreu um erro ao processar o pagamento.');
                    }
                }

            } catch (error) {
                if (window.mostrarToast) {
                    window.mostrarToast('Erro ao processar pagamento: ' + error.message, 'error');
                } else {
                    alert('Erro ao processar pagamento: ' + error.message);
                }
            }
        });
    }
}

async function processarPagamento(index, mes, ano, valorPago = null, quitarParcelasFuturas = false, skipRerender = false) {
    try {
        if (!dadosFinanceiros[ano] || !dadosFinanceiros[ano].meses[mes]) {
            throw new Error('Estrutura de dados do mês é inválida');
        }
        
        const despesas = dadosFinanceiros[ano].meses[mes].despesas;
        
        if (!Array.isArray(despesas)) {
            throw new Error('Lista de despesas inválida');
        }
        
        if (index < 0 || index >= despesas.length || !despesas[index] || despesas[index].transferidaParaProximoMes) {
            throw new Error('Despesa não encontrada no índice especificado');
        }
        
        const despesa = despesas[index];

        if (despesa.quitado === true || despesa.valorPago > 0) {
            throw new Error('Esta despesa já foi paga anteriormente');
        }

        const valorFinal = valorPago !== null ? valorPago : despesa.valor;

        despesa.valorPago = parseFloat(valorFinal);
        despesa.quitado = true;
        despesa.status = 'quitada';
        const inputDataPagamento = document.getElementById('data-pagamento-individual');
        despesa.dataPagamento = inputDataPagamento ? inputDataPagamento.value :
                        new Date().toISOString().split('T')[0];

        // Calcular juros ou economia no pagamento
        const valorOriginalDespesa = parseFloat(despesa.valorOriginal) || parseFloat(despesa.valor);
        const valorPagoNumerico = parseFloat(valorFinal);

        if (!despesa.metadados) {
            despesa.metadados = {};
        }

        // Calcular diferença entre valor pago e valor original
        const diferencaValor = valorPagoNumerico - valorOriginalDespesa;

        if (diferencaValor > 0) {
            // Pagou MAIS que o original = JUROS
            despesa.metadados.jurosPagamento = diferencaValor;
            // Limpar economia se existir
            if (despesa.metadados.economiaPagamento) {
                delete despesa.metadados.economiaPagamento;
            }
        } else if (diferencaValor < 0) {
            // Pagou MENOS que o original = ECONOMIA (desconto)
            despesa.metadados.economiaPagamento = Math.abs(diferencaValor);
            // Limpar juros se existir
            if (despesa.metadados.jurosPagamento) {
                delete despesa.metadados.jurosPagamento;
            }
        } else {
            // Valores iguais = sem juros nem economia
            if (despesa.metadados.jurosPagamento) {
                delete despesa.metadados.jurosPagamento;
            }
            if (despesa.metadados.economiaPagamento) {
                delete despesa.metadados.economiaPagamento;
            }
        }
        
        // NOVA FUNCIONALIDADE: Unificar anexos de cadastro com comprovantes
        if (window.sistemaAnexos) {
            const comprovantes = window.sistemaAnexos.obterAnexosParaSalvar('comprovante');
            if (comprovantes.length > 0) {

                
                // Inicializar array de anexos se não existir
                if (!despesa.anexos) {
                    despesa.anexos = [];
                }
                
                // Marcar comprovantes como tal e adicionar aos anexos principais
                comprovantes.forEach(comprovante => {
                    comprovante.tipoAnexo = 'comprovante';
                    comprovante.dataPagamento = despesa.dataPagamento;
                    comprovante.descricaoTipo = 'Comprovante de Pagamento';

                });
                
                // Adicionar comprovantes aos anexos principais
                despesa.anexos.push(...comprovantes);

            }
            
            // Limpar comprovantes temporários
            window.sistemaAnexos.limparAnexosTemporarios('comprovante');
        }
        
        if (quitarParcelasFuturas) {
            despesa.quitacaoAntecipada = true;
            despesa.valorQuitacaoTotal = parseFloat(valorFinal);
        }
        
        if (quitarParcelasFuturas && despesa.parcelado && despesa.idGrupoParcelamento) {
            await processarParcelasFuturas(despesa, ano, mes);
        }

        // ✅ CORRIGIDO: Salvar via API em vez de localStorage
        if (window.usuarioDataManager && typeof window.usuarioDataManager.salvarDespesa === 'function') {
            console.log('💾 Salvando pagamento via API:', despesa);
            const sucesso = await window.usuarioDataManager.salvarDespesa(mes, ano, despesa, despesa.id);
            if (!sucesso) {
                throw new Error('Falha ao salvar pagamento na API');
            }
        } else {
            // Fallback para localStorage
            const sucessoSalvamento = await window.salvarDados();
            if (!sucessoSalvamento) {
                throw new Error('Falha ao salvar os dados');
            }
        }
        
        // Em modo lote (skipRerender=true), pular re-renders individuais
        // O chamador fará um único render no final
        if (!skipRerender) {
            if (typeof window.carregarDadosDashboard === 'function') {
                await window.carregarDadosDashboard(window.anoAtual || ano);
            }

            if (typeof window.renderizarDetalhesDoMes === 'function') {
                window.renderizarDetalhesDoMes(mes, ano);
            }
        }

        return true;

    } catch (error) {

        alert("Erro ao processar pagamento: " + error.message);
        return false;
    }
}

async function processarParcelasFuturas(despesa, anoAtual, mesAtual) {
    if (!despesa.idGrupoParcelamento) return;
    
    for (let anoFuturo = anoAtual; anoFuturo <= anoAtual + 3; anoFuturo++) {
        if (!dadosFinanceiros[anoFuturo]) continue;
        
        const mesInicial = anoFuturo === anoAtual ? mesAtual + 1 : 0;
        
        for (let mesFuturo = mesInicial; mesFuturo < 12; mesFuturo++) {
            if (!dadosFinanceiros[anoFuturo].meses[mesFuturo] || 
                !dadosFinanceiros[anoFuturo].meses[mesFuturo].despesas) continue;
            
            dadosFinanceiros[anoFuturo].meses[mesFuturo].despesas.forEach(d => {
                if (d.idGrupoParcelamento === despesa.idGrupoParcelamento && 
                    d.descricao === despesa.descricao && 
                    !d.quitado) {
                    
                    d.valor = 0;
                    d.valorPago = 0;
                    d.quitado = true;
                    d.status = 'quitada';
                    d.dataPagamento = despesa.dataPagamento;
                    d.quitacaoAntecipada = true;
                    d.parcelaOriginalQuitacao = despesa.parcela;
                    d.valorOriginalParcela = d.valor;
                }
            });
        }
    }
}

// ================================================================
// SISTEMA DE DESPESAS - PARTE 3/4
// PAGAMENTO EM LOTE E SISTEMA DE FILTROS
// ================================================================

// ================================================================
// PAGAMENTO EM LOTE
// ================================================================

async function pagarDespesasEmLote() {
    try {
        const todasCheckboxes = document.querySelectorAll('.despesa-checkbox:checked');

        if (todasCheckboxes.length === 0) {
            alert("Nenhuma despesa selecionada para pagamento.");
            return;
        }

        const checkboxesValidas = Array.from(todasCheckboxes).filter(checkbox => {
            const linha = checkbox.closest('tr.despesa-row');
            const despesaId = linha?.getAttribute('data-despesa-id');
            if (!despesaId) return false;

            const { despesa } = encontrarDespesaPorId(despesaId, mesAberto, anoAberto);
            if (!despesa) return false;

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
   
   // NOVO: Configurar data padrão para lote
   const inputDataLote = document.getElementById('data-pagamento-lote');
   if (inputDataLote) {
       inputDataLote.value = new Date().toISOString().split('T')[0];
   }
   
   // NOVO: Limpar anexos temporários de comprovantes
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
   
   // Limpar anexos temporários de comprovantes
   if (window.sistemaAnexos) {
       window.sistemaAnexos.limparAnexosTemporarios('comprovante');
   }

   // Configurar data padrão para valores personalizados
const inputDataPersonalizada = document.getElementById('data-pagamento-personalizada');
if (inputDataPersonalizada) {
    inputDataPersonalizada.value = new Date().toISOString().split('T')[0];
}
   
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
       const index = parseInt(input.dataset.index);
       const valorPago = parseFloat(input.value);
       
       if (!isNaN(valorPago) && valorPago >= 0) {
           if (comprovantes.length > 0 && dadosFinanceiros[mesAberto]?.meses[mesAberto]?.despesas?.[index]) {
               const despesa = dadosFinanceiros[mesAberto].meses[mesAberto].despesas[index];
               if (!despesa.comprovantes) {
                   despesa.comprovantes = [];
               }
               despesa.comprovantes.push(...comprovantes);
           }
           
           if (await processarPagamentoComData(index, mesAberto, anoAberto, valorPago, false, dataPagamento, true)) {
               despesasPagas++;
           }
       }
   }

   if (window.sistemaAnexos) {
       window.sistemaAnexos.limparAnexosTemporarios('comprovante');
   }

   document.getElementById('modal-valores-personalizados-despesas').style.display = 'none';
   // Um único render no final em vez de um por despesa
   await renderizarDetalhesDoMes(mesAberto, anoAberto);
   
   if (despesasPagas > 0) {
       alert(`${despesasPagas} despesa(s) paga(s) com sucesso!`);
       
       const checkboxTodas = document.getElementById('select-all-despesas');
       if (checkboxTodas) {
           checkboxTodas.checked = false;
       }
       
       atualizarBotaoLote();
   } else {
       alert("Nenhuma despesa foi processada com sucesso.");
   }
}

async function processarPagamentoComData(index, mes, ano, valorPago = null, quitarParcelasFuturas = false, dataPagamento = null, skipRerender = false) {
    // Salvar temporariamente a data no DOM para a função processarPagamento usar
    const inputDataTemp = document.getElementById('data-pagamento-individual');
    let valorOriginal = null;

    if (inputDataTemp && dataPagamento) {
        valorOriginal = inputDataTemp.value;
        inputDataTemp.value = dataPagamento;
    }

    const resultado = await processarPagamento(index, mes, ano, valorPago, quitarParcelasFuturas, skipRerender);

    // Restaurar valor original
    if (inputDataTemp && valorOriginal !== null) {
        inputDataTemp.value = valorOriginal;
    }

    return resultado;
}

async function pagarLoteComValoresOriginais(checkboxes) {
   // Obter IDs das despesas a partir das linhas
   const despesaIds = Array.from(checkboxes).map(checkbox => {
       const linha = checkbox.closest('tr.despesa-row');
       return linha?.getAttribute('data-despesa-id');
   }).filter(id => id);

   const inputDataLote = document.getElementById('data-pagamento-lote');
   const dataPagamentoLote = inputDataLote ? inputDataLote.value :
                             new Date().toISOString().split('T')[0];

   let comprovantes = [];
   if (window.sistemaAnexos) {
       comprovantes = window.sistemaAnexos.obterAnexosParaSalvar('comprovante');
   }

   let despesasPagas = 0;
   for (const despesaId of despesaIds) {
       const { despesa, indice } = encontrarDespesaPorId(despesaId, mesAberto, anoAberto);
       if (!despesa) continue;

       if (comprovantes.length > 0) {
           if (!despesa.comprovantes) {
               despesa.comprovantes = [];
           }
           despesa.comprovantes.push(...comprovantes);
       }

       if (await processarPagamentoComData(indice, mesAberto, anoAberto, null, false, dataPagamentoLote, true)) {
           despesasPagas++;
       }
   }

   if (window.sistemaAnexos) {
       window.sistemaAnexos.limparAnexosTemporarios('comprovante');
   }

   // Um único render no final em vez de um por despesa
   await renderizarDetalhesDoMes(mesAberto, anoAberto);

   if (despesasPagas > 0) {
       alert(`${despesasPagas} despesa(s) paga(s) com sucesso!`);

       const checkboxTodas = document.getElementById('select-all-despesas');
       if (checkboxTodas) {
           checkboxTodas.checked = false;
       }

       atualizarBotaoLote();
   } else {
       alert("Nenhuma despesa foi processada com sucesso.");
   }
}

// ================================================================
// SISTEMA DE FILTROS
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
        
        selectCategoria.removeEventListener('change', selectCategoria._filterHandler);
        
        selectCategoria._filterHandler = function() {
            filtrarDespesasPorCategoria(this.value);
        };
        selectCategoria.addEventListener('change', selectCategoria._filterHandler);
    }
}

function obterOpcoesFormaPagamento() {
    const opcoes = [
        { value: 'todas', text: 'Pagamento' },
        { value: 'pix', text: 'PIX' },
        { value: 'debito', text: 'Débito' },
        { value: 'dinheiro', text: 'Dinheiro' }
    ];

    const cartoes = window.cartoesUsuario || [];
    if (cartoes.length > 0) {
        cartoes.forEach(cartao => {
            const nome = cartao.banco || cartao.nome || 'Cartão';
            opcoes.push({ value: `credito_${cartao.id}`, text: `Crédito/${nome}` });
        });
    } else {
        opcoes.push({ value: 'credito', text: 'Crédito' });
    }

    return opcoes;
}

function criarFiltrosFormaPagamento(mes, ano) {
    const selectFormaPagamento = document.getElementById('filtro-forma-pagamento-tabela');

    if (selectFormaPagamento) {
        limparSelect(selectFormaPagamento);

        obterOpcoesFormaPagamento().forEach(opcao => {
            adicionarOpcaoSelect(selectFormaPagamento, opcao.value, opcao.text);
        });

        selectFormaPagamento.removeEventListener('change', selectFormaPagamento._filterHandler);

        selectFormaPagamento._filterHandler = function() {
            filtrarDespesasPorFormaPagamento(this.value);
        };
        selectFormaPagamento.addEventListener('change', selectFormaPagamento._filterHandler);
    }

    // Atualizar também o filtro da toolbar
    popularFiltroFormaPagamentoToolbar();
}

function popularFiltroFormaPagamentoToolbar() {
    const select = document.getElementById('filtro-forma-pagamento-toolbar');
    if (!select) return;

    const valorAtual = select.value;
    select.innerHTML = '';

    obterOpcoesFormaPagamento().forEach(opcao => {
        const opt = document.createElement('option');
        opt.value = opcao.value;
        opt.textContent = opcao.text;
        select.appendChild(opt);
    });

    // Restaurar seleção se ainda existir
    if (valorAtual && select.querySelector(`option[value="${valorAtual}"]`)) {
        select.value = valorAtual;
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
            { value: 'pagas', text: 'Pagas' }
        ];
        
        opcoes.forEach(opcao => {
            adicionarOpcaoSelect(selectStatus, opcao.value, opcao.text);
        });
        
        selectStatus.removeEventListener('change', selectStatus._filterHandler);
        
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
    aplicarTodosFiltros();
}

function filtrarDespesasPorFormaPagamento(formaPagamento) {
    aplicarTodosFiltros();
}

function filtrarDespesasPorStatus(status) {
    aplicarTodosFiltros();
}

function verificarCategoriaDespesa(linha, categoria) {
    const despesaId = linha.getAttribute('data-despesa-id');
    if (!despesaId) return false;

    const { despesa } = encontrarDespesaPorId(despesaId, mesAberto, anoAberto);
    if (!despesa) return false;

    const categoriaLimpa = obterCategoriaLimpa(despesa);
    return categoriaLimpa === categoria;
}

function verificarFormaPagamentoDespesa(linha, formaPagamento) {
    const despesaId = linha.getAttribute('data-despesa-id');
    if (!despesaId) return false;

    const { despesa } = encontrarDespesaPorId(despesaId, mesAberto, anoAberto);
    if (!despesa) return false;

    // Filtro por cartão específico: credito_ID
    if (formaPagamento.startsWith('credito_')) {
        const cartaoIdFiltro = formaPagamento.replace('credito_', '');
        const formaPag = (despesa.formaPagamento || '').toLowerCase();
        const cartaoId = String(despesa.cartao_id || despesa.cartaoId || '');
        return (formaPag === 'credito' || formaPag === 'crédito' || formaPag.includes('cred')) && cartaoId === cartaoIdFiltro;
    }

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

function verificarStatusDespesa(linha, status) {
    const despesaId = linha.getAttribute('data-despesa-id');
    if (!despesaId) return false;

    const { despesa } = encontrarDespesaPorId(despesaId, mesAberto, anoAberto);
    if (!despesa) return false;

    let statusDespesa = '';
    if (despesa.quitado === true) {
        statusDespesa = 'paga';
    } else if (despesa.status === 'atrasada') {
        statusDespesa = 'atrasada';
    } else {
        statusDespesa = 'em_dia';
    }

    if (status === 'pendentes') {
        return statusDespesa === 'em_dia' || statusDespesa === 'atrasada';
    } else if (status === 'pagas') {
        return despesa.quitado === true;
    } else {
        return statusDespesa === status;
    }
}

function obterDespesaDaLinha(linha) {
    const despesaId = linha.getAttribute('data-despesa-id');
    if (!despesaId) return null;

    const { despesa } = encontrarDespesaPorId(despesaId, mesAberto, anoAberto);
    return despesa;
}

function limparFiltros() {
    const filtros = [
        'filtro-categoria',
        'filtro-status', 
        'filtro-forma-pagamento-tabela',
        'filtro-ordenacao-despesas'
    ];
    
    filtros.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            if (id === 'filtro-ordenacao-despesas') {
                select.value = 'original';
            } else {
                select.value = 'todas';
            }
        }
    });
    
    aplicarTodosFiltros();
    aplicarOrdenacaoDespesas('original');
}

// Event listener para ordenação
function configurarEventoOrdenacao() {
    const filtroOrdenacao = document.getElementById('filtro-ordenacao-despesas');
    if (filtroOrdenacao) {
        filtroOrdenacao.addEventListener('change', function() {
            aplicarOrdenacaoDespesas(this.value);
        });
    }
}

// Event listener para botão limpar
function configurarEventoBotaoLimpar() {
    const btnLimpar = document.getElementById('btn-limpar-filtros');
    if (btnLimpar) {
        btnLimpar.addEventListener('click', function(e) {
            e.preventDefault();
            limparFiltros();
        });
    }
}

function aplicarOrdenacaoDespesas(tipoOrdenacao) {
    const listaDespesas = document.getElementById('lista-despesas');
    if (!listaDespesas) return;
    
    const linhas = Array.from(listaDespesas.querySelectorAll('tr.despesa-row'));

    if (tipoOrdenacao === 'original') {
        // Ordenação original: ID decrescente (mais recente primeiro)
        linhas.sort((a, b) => {
            const idA = parseInt(a.getAttribute('data-despesa-id')) || 0;
            const idB = parseInt(b.getAttribute('data-despesa-id')) || 0;
            return idB - idA;
        });
    } else {
        linhas.sort((a, b) => {
            if (tipoOrdenacao.includes('compra')) {
                const dataA = a.querySelector('.col-compra')?.textContent || '';
                const dataB = b.querySelector('.col-compra')?.textContent || '';
                const resultado = compararDatas(dataA, dataB);
                return tipoOrdenacao.includes('desc') ? -resultado : resultado;
            }
            if (tipoOrdenacao.includes('vencimento')) {
                const dataA = a.querySelector('.col-vencimento')?.textContent || '';
                const dataB = b.querySelector('.col-vencimento')?.textContent || '';
                const resultado = compararDatas(dataA, dataB);
                return tipoOrdenacao.includes('desc') ? -resultado : resultado;
            }
            if (tipoOrdenacao.includes('valor')) {
                const valorA = obterValorDaColuna(a);
                const valorB = obterValorDaColuna(b);
                const resultado = valorA - valorB;
                return tipoOrdenacao.includes('desc') ? -resultado : resultado;
            }
            return 0;
        });
    }

    linhas.forEach(linha => listaDespesas.appendChild(linha));
}

// Extrair valor numérico da coluna valor
function obterValorDaColuna(linha) {
    const celulaValor = linha.querySelector('.col-valor');
    if (!celulaValor) return 0;
    
    // Pegar o texto da célula e extrair apenas os números
    let textoValor = celulaValor.textContent || '0';
    
    // Se tem estrutura de valor com juros, pegar o último valor (com juros)
    const valorComJuros = celulaValor.querySelector('.valor-juros');
    if (valorComJuros) {
        textoValor = valorComJuros.textContent || '0';
    }
    
    // Remover símbolos de moeda e converter para número
    const valorNumerico = textoValor
        .replace(/[R$\s.,]/g, '')
        .replace(/(\d+)(\d{2})$/, '$1.$2');
    
    return parseFloat(valorNumerico) || 0;
}

function compararDatas(dataA, dataB) {
    const parseData = (dataStr) => {
        if (!dataStr || dataStr === '-') return new Date(0);
        const partes = dataStr.split('/');
        if (partes.length === 3) {
            return new Date(partes[2], partes[1] - 1, partes[0]);
        }
        return new Date(dataStr);
    };
    
    const dateA = parseData(dataA);
    const dateB = parseData(dataB);
    return dateA.getTime() - dateB.getTime();
}

function atualizarContadoresFiltro() {
   const linhasVisiveis = document.querySelectorAll('tr.despesa-row:not([style*="display: none"])');
   const totalLinhas = document.querySelectorAll('tr.despesa-row').length;

   let valorTotalVisivel = 0;

   linhasVisiveis.forEach(linha => {
       const valorDespesa = calcularValorDespesaLinha(linha);
       valorTotalVisivel += valorDespesa;
   });

   // Atualizar contador antigo (se existir)
   const contadorFiltro = document.getElementById('contador-filtro');
   if (contadorFiltro) {
       contadorFiltro.textContent = `${linhasVisiveis.length} de ${totalLinhas} despesas (${formatarMoeda(valorTotalVisivel)})`;
   }

   // Atualizar contador da toolbar unificada
   const contadorToolbar = document.getElementById('contador-despesas-toolbar');
   if (contadorToolbar) {
       if (linhasVisiveis.length === totalLinhas) {
           contadorToolbar.textContent = `${totalLinhas} itens`;
       } else {
           contadorToolbar.textContent = `${linhasVisiveis.length}/${totalLinhas}`;
       }
   }

   // Atualizar valor total na toolbar
   const totalToolbar = document.getElementById('total-despesas-toolbar');
   if (totalToolbar) {
       totalToolbar.textContent = formatarMoeda(valorTotalVisivel);
   }

   // Atualizar contadores de anexos para linhas visíveis
   setTimeout(() => {
       if (typeof atualizarTodosContadoresAnexosDespesas === 'function') {
           atualizarTodosContadoresAnexosDespesas();
       }
   }, 50);
}

function calcularValorDespesaLinha(linha) {
    const despesa = obterDespesaDaLinha(linha);

    if (despesa) {
        return obterValorRealDespesa(despesa);
    }

    return 0;
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
// FUNÇÕES DE CÁLCULO E TOTALIZAÇÕES
// ================================================================

// ================================================================
// FUNÇÕES AUXILIARES CENTRALIZADAS
// ================================================================

/**
 * Verifica se uma despesa é parcelada
 * @param {Object} despesa - Objeto da despesa
 * @returns {boolean}
 */
function isParcelado(despesa) {
    return despesa.parcelado || despesa.parcela || despesa.idGrupoParcelamento;
}

/**
 * Calcula os juros de UMA despesa individual
 * @param {Object} despesa - Objeto da despesa
 * @returns {number} - Valor dos juros
 */
function calcularJurosDespesa(despesa) {
    if (!despesa || typeof despesa !== 'object') return 0;

    // Despesas quitadas antecipadamente não têm juros
    if (despesa.quitacaoAntecipada === true) {
        return 0;
    }

    // Garantir que valores sejam números
    const valorPago = parseFloat(despesa.valorPago) || 0;
    const valorOriginal = parseFloat(despesa.valorOriginal) || 0;
    const valorTotalComJuros = parseFloat(despesa.valorTotalComJuros) || 0;

    // PRIORIDADE 1: Juros já registrados em metadados (mais confiável)
    if (despesa.metadados?.jurosPagamento && valorPago > 0) {
        return parseFloat(despesa.metadados.jurosPagamento);
    }

    // PRIORIDADE 2: Diferença entre valor pago e valor original (quando já pago com juros)
    if (valorPago > 0 && valorOriginal > 0 && valorPago > valorOriginal) {
        return valorPago - valorOriginal;
    }

    // PRIORIDADE 3: Juros de parcelamento registrados em metadados
    if (isParcelado(despesa) && despesa.metadados?.jurosPorParcela) {
        return parseFloat(despesa.metadados.jurosPorParcela) || 0;
    }

    // PRIORIDADE 4: Total de juros dividido por parcelas (para parcelamentos)
    if (despesa.metadados?.totalJuros) {
        const totalJuros = parseFloat(despesa.metadados.totalJuros);
        if (isParcelado(despesa) && despesa.totalParcelas > 1) {
            return totalJuros / despesa.totalParcelas;
        }
        return totalJuros;
    }

    // PRIORIDADE 5: Diferença entre valorTotalComJuros e valorOriginal (cadastro com juros)
    if (valorTotalComJuros > 0 && valorOriginal > 0 && valorTotalComJuros > valorOriginal) {
        const diferencaJuros = valorTotalComJuros - valorOriginal;
        if (isParcelado(despesa) && despesa.totalParcelas > 1) {
            return diferencaJuros / despesa.totalParcelas;
        }
        return diferencaJuros;
    }

    return 0;
}

/**
 * Calcula a economia de UMA despesa individual
 * @param {Object} despesa - Objeto da despesa
 * @returns {number} - Valor da economia
 */
function calcularEconomiaDespesa(despesa) {
    if (!despesa || typeof despesa !== 'object') return 0;

    // Despesas transferidas não contam economia
    if (despesa.transferidaParaProximoMes === true) {
        return 0;
    }

    // Garantir que valores sejam números
    const valorPago = parseFloat(despesa.valorPago) || 0;
    const valorOriginal = parseFloat(despesa.valorOriginal) || 0;
    const valorTotalComJuros = parseFloat(despesa.valorTotalComJuros) || 0;
    const valorAtual = parseFloat(despesa.valor) || 0;

    let economia = 0;

    // PRIORIDADE 1: Economia registrada em metadados (quando paga com desconto)
    if (despesa.metadados?.economiaPagamento) {
        economia += parseFloat(despesa.metadados.economiaPagamento);
    }

    // PRIORIDADE 2: Economia quando valor pago < valor original (via modal pagar despesa)
    else if (valorPago > 0 && valorOriginal > 0 && valorPago < valorOriginal) {
        economia += valorOriginal - valorPago;
    }

    // PRIORIDADE 3: Despesa marcada como paga (quitado=true) com valor final < valor original
    else if (despesa.quitado === true && valorOriginal > 0 && valorAtual < valorOriginal) {
        economia += valorOriginal - valorAtual;
    }

    // PRIORIDADE 4: Economia no cadastro (valorTotalComJuros < valorOriginal)
    else if (valorTotalComJuros > 0 && valorOriginal > 0 && valorTotalComJuros < valorOriginal) {
        // Para parcelamentos, calcular economia por parcela
        const diferencaEconomia = valorOriginal - valorTotalComJuros;
        if (isParcelado(despesa) && despesa.totalParcelas > 1) {
            economia += diferencaEconomia / despesa.totalParcelas;
        } else {
            economia += diferencaEconomia;
        }
    }

    return economia > 0 ? economia : 0;
}

// ================================================================
// FUNÇÕES DE TOTALIZAÇÃO
// ================================================================

function calcularTotalDespesas(despesas) {
    if (!Array.isArray(despesas)) return 0;
    
    return despesas.reduce((total, despesa) => {
        if (despesa.quitacaoAntecipada === true) {
            return total;
        }
        
        if (despesa.valorPago !== null && despesa.valorPago !== undefined && despesa.valorPago > 0) {
            return total + parseFloat(despesa.valorPago);
        }
        return total + parseFloat(despesa.valor || 0);
    }, 0);
}

/**
 * Calcula o total de juros de um array de despesas
 * @param {Array} despesas - Array de despesas
 * @returns {number} - Total de juros
 */
function calcularTotalJuros(despesas) {
    if (!Array.isArray(despesas)) return 0;

    return despesas.reduce((total, despesa) => {
        return total + calcularJurosDespesa(despesa);
    }, 0);
}

function obterValorRealDespesa(despesa) {
    if (despesa.valorPago !== null && despesa.valorPago !== undefined && despesa.valorPago > 0) {
        return parseFloat(despesa.valorPago);
    }
    return parseFloat(despesa.valor) || 0;
}

/**
 * Calcula o total de economias de um array de despesas
 * @param {Array} despesas - Array de despesas
 * @returns {number} - Total de economias
 */
function calcularTotalEconomias(despesas) {
    if (!Array.isArray(despesas)) return 0;

    return despesas.reduce((total, despesa) => {
        return total + calcularEconomiaDespesa(despesa);
    }, 0);
}

// REMOVIDO: Configuração duplicada - já feita pelo sistemaAnexos
function configurarBotaoComprovanteSimples() {
    // Botão já configurado globalmente pelo sistemaAnexos
}

function calcularLimiteDisponivelCartao(cartaoId, mes, ano) {
    if (!cartaoId || !window.cartoesUsuario) return null;

    const cartao = (window.cartoesUsuario || []).find(c => c.id === cartaoId);
    if (!cartao || !cartao.ativo) return null;

    const limiteTotal = parseFloat(cartao.limite) || 0;
    let limiteUtilizado = 0;

    for (let anoAtual = ano; anoAtual <= ano + 3; anoAtual++) {
        if (!dadosFinanceiros[anoAtual]) continue;

        for (let mesAtual = 0; mesAtual < 12; mesAtual++) {
            if (!dadosFinanceiros[anoAtual].meses[mesAtual]?.despesas) continue;

            const despesas = dadosFinanceiros[anoAtual].meses[mesAtual].despesas;

            despesas.forEach(despesa => {
                const formaPag = (despesa.formaPagamento || despesa.forma_pagamento || '').toLowerCase();
                const eCreditoOuVariacao = formaPag === 'credito' || formaPag === 'crédito' ||
                                            formaPag === 'cred-merpago' || formaPag === 'créd-merpago';

                if (!eCreditoOuVariacao) return;

                // Pular se recorrente ou já pago
                if (despesa.recorrente || despesa.quitado || despesa.pago) {
                    return;
                }

                // Verificar cartao_id (ID real do banco de dados)
                const cartaoIdDespesa = despesa.cartao_id || despesa.cartaoId;
                if (cartaoIdDespesa) {
                    if (parseInt(cartaoIdDespesa) === parseInt(cartaoId)) {
                        limiteUtilizado += parseFloat(despesa.valor) || 0;
                    }
                    return;
                }

                // Fallback para despesas antigas que usam numeroCartao (posição)
                const numeroCartaoDespesa = despesa.numeroCartao || despesa.numero_cartao;
                if (numeroCartaoDespesa) {
                    const cartoesUsuario = window.cartoesUsuario || [];
                    const cartaoNaPosicao = cartoesUsuario[parseInt(numeroCartaoDespesa) - 1];
                    if (cartaoNaPosicao && cartaoNaPosicao.id === cartaoId) {
                        limiteUtilizado += parseFloat(despesa.valor) || 0;
                    }
                }
            });
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

function toggleCamposPagamentoImediato() {
    const checkbox = document.getElementById('despesa-ja-pago');
    
    if (checkbox && checkbox.checked) {

    }
}

// ================================================================
// EXPORTAÇÕES GLOBAIS
// ================================================================

window.calcularLimiteDisponivelCartao = calcularLimiteDisponivelCartao;
window.abrirModalNovaDespesa = abrirModalNovaDespesa;
window.editarDespesa = editarDespesa;
window.excluirDespesa = excluirDespesa;
window.moverParaProximoMes = moverParaProximoMes;
window.abrirModalPagamento = abrirModalPagamento;
window.processarPagamento = processarPagamento;
window.pagarDespesasEmLote = pagarDespesasEmLote;
window.abrirModalPagamentoLote = pagarDespesasEmLote;
window.salvarDespesa = salvarDespesa;
window.renderizarDespesas = renderizarDespesas;
window.atualizarStatusDespesas = atualizarStatusDespesas;
window.calcularTotalDespesas = calcularTotalDespesas;
window.calcularTotalEconomias = calcularTotalEconomias;
window.calcularTotalJuros = calcularTotalJuros;
window.calcularJurosDespesa = calcularJurosDespesa;
window.calcularEconomiaDespesa = calcularEconomiaDespesa;
window.isParcelado = isParcelado;
window.calcularInfoParcelamento = calcularInfoParcelamento;
window.atualizarBotaoLote = atualizarBotaoLote;
window.validarCategoria = validarCategoria;
window.validarFormaPagamento = validarFormaPagamento;
window.configurarEventosDespesas = configurarEventosDespesas;
window.obterCategoriaLimpa = obterCategoriaLimpa;
window.criarBadgeStatus = criarBadgeStatus;
window.obterDatasExibicao = obterDatasExibicao;
window.obterValorRealDespesa = obterValorRealDespesa;
window.criarFiltrosCategorias = criarFiltrosCategorias;
window.criarFiltrosFormaPagamento = criarFiltrosFormaPagamento;
window.obterOpcoesFormaPagamento = obterOpcoesFormaPagamento;
window.popularFiltroFormaPagamentoToolbar = popularFiltroFormaPagamentoToolbar;
window.criarFiltrosStatus = criarFiltrosStatus;
window.limparFiltros = limparFiltros;
window.atualizarContadoresFiltro = atualizarContadoresFiltro;
window.inicializarTabelaDespesasGrid = inicializarTabelaDespesasGrid;
window.criarLinhaDespesaGrid = criarLinhaDespesaGrid;
window.encontrarDespesaPorIndice = encontrarDespesaPorIndice;
window.preencherCelulaAnexos = preencherCelulaAnexos;
window.configurarEventosFormularioAnexosDespesa = configurarEventosFormularioAnexosDespesa;
window.inicializarSistemaAnexosDespesas = inicializarSistemaAnexosDespesas;
window.toggleCamposPagamentoImediato = toggleCamposPagamentoImediato;

// Função para selecionar/deselecionar todas as despesas (chamada pelo HTML)
function toggleTodasDespesas(checkbox) {
    const todasCheckboxes = document.querySelectorAll('.despesa-checkbox');
    todasCheckboxes.forEach(cb => {
        cb.checked = checkbox.checked;
    });
    atualizarBotaoLote();
}
window.toggleTodasDespesas = toggleTodasDespesas;

document.addEventListener('DOMContentLoaded', configurarBotaoComprovanteSimples);

// ================================================================
// REDIMENSIONAMENTO DE COLUNAS - VERSÃO PARA TABLE
// ================================================================

(function() {
    let isResizing = false;
    let currentTh = null;
    let startX = 0;
    let startWidth = 0;

    function initTableColumnResizer() {
        const tabela = document.getElementById('tabela-despesas');
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
            // Pular colunas muito pequenas (checkbox, anexos)
            if (th.classList.contains('col-checkbox') || th.classList.contains('col-anexos')) return;

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
    window.resetDespesasColumnWidths = function() {
        const tabela = document.getElementById('tabela-despesas');
        if (!tabela) return;

        const thElements = tabela.querySelectorAll('thead th');
        thElements.forEach(th => {
            th.style.width = '';
        });
    };

    window.reinitDespesasResizer = function() {
        const tabela = document.getElementById('tabela-despesas');
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
        const tabela = document.getElementById('tabela-despesas');
        if (tabela && tabela.dataset.resizerInit !== 'true') {
            initTableColumnResizer();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();

// ================================================================
// CRIAR CATEGORIA INLINE NO MODAL DE DESPESA
// ================================================================

/**
 * Alterna visibilidade do input de nova categoria
 */
function toggleNovaCategoriaInline() {
    const container = document.getElementById('nova-categoria-inline');
    const btnToggle = document.getElementById('btn-toggle-nova-categoria');
    const input = document.getElementById('input-nova-categoria-despesa');

    if (!container || !btnToggle) return;

    const isHidden = container.classList.contains('hidden');

    if (isHidden) {
        container.classList.remove('hidden');
        btnToggle.classList.add('active');
        if (input) {
            input.value = '';
            input.focus();
        }
    } else {
        container.classList.add('hidden');
        btnToggle.classList.remove('active');
        if (input) input.value = '';
    }
}

/**
 * Salva nova categoria inline e atualiza o dropdown
 */
async function salvarCategoriaInline() {
    const input = document.getElementById('input-nova-categoria-despesa');
    if (!input) return;

    const nomeCategoria = input.value.trim();

    if (!nomeCategoria) {
        if (window.mostrarMensagemErro) {
            window.mostrarMensagemErro('Digite o nome da categoria');
        }
        input.focus();
        return;
    }

    const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

    try {
        const response = await fetch(`${API_URL}/categorias`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('token') || localStorage.getItem('token') || ''}`
            },
            body: JSON.stringify({ nome: nomeCategoria })
        });

        if (response.ok) {
            // Ocultar input
            toggleNovaCategoriaInline();

            // Atualizar dropdown de categorias
            if (typeof window.atualizarDropdowns === 'function') {
                await window.atualizarDropdowns();
            }

            // Atualizar lista na aba de configurações
            if (typeof window.atualizarListaCategorias === 'function') {
                await window.atualizarListaCategorias();
            }

            // Selecionar a nova categoria
            const selectCategoria = document.getElementById('despesa-categoria');
            if (selectCategoria) {
                setTimeout(() => {
                    for (let option of selectCategoria.options) {
                        if (option.text === nomeCategoria) {
                            selectCategoria.value = option.value;
                            break;
                        }
                    }
                }, 200);
            }

            if (window.mostrarMensagemSucesso) {
                window.mostrarMensagemSucesso('Categoria criada!');
            }

            // Log
            if (window.logManager) {
                window.logManager.registrar({
                    modulo: 'Despesas',
                    acao: 'Criado',
                    categoria: 'Categoria',
                    descricao: nomeCategoria,
                    valor: null,
                    detalhes: 'Nova categoria (inline)'
                });
            }
        } else {
            const data = await response.json();
            if (window.mostrarMensagemErro) {
                window.mostrarMensagemErro(data.message || 'Erro ao criar categoria');
            }
        }
    } catch (error) {
        console.error('Erro ao criar categoria:', error);
        if (window.mostrarMensagemErro) {
            window.mostrarMensagemErro('Erro ao salvar categoria');
        }
    }
}

/**
 * Inicializa eventos da categoria inline
 */
function inicializarCategoriaInline() {
    const btnToggle = document.getElementById('btn-toggle-nova-categoria');
    if (btnToggle) {
        btnToggle.addEventListener('click', toggleNovaCategoriaInline);
    }

    const btnSalvar = document.getElementById('btn-salvar-categoria-inline');
    if (btnSalvar) {
        btnSalvar.addEventListener('click', salvarCategoriaInline);
    }

    const btnCancelar = document.getElementById('btn-cancelar-categoria-inline');
    if (btnCancelar) {
        btnCancelar.addEventListener('click', toggleNovaCategoriaInline);
    }

    const input = document.getElementById('input-nova-categoria-despesa');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                salvarCategoriaInline();
            }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                toggleNovaCategoriaInline();
            }
        });
    }
}

// Inicializar quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(inicializarCategoriaInline, 300);
});
