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
    
    const linhas = document.querySelectorAll('.grid-row.despesa-row');
    
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
}

function atualizarFiltrosExistentes(mes, ano) {
    const filtroCategoria = document.getElementById('filtro-categoria');
    if (filtroCategoria) {
        const categorias = obterCategoriasDoMes(mes, ano);
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
       const despesasParaExibir = despesas.filter(d => !d.transferidaParaProximoMes);
       
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
       sincronizarIndicesDespesas();
       // NOVO: Atualizar contadores de anexos após renderização
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
  const div = clone.querySelector('.grid-row');
  
  if (despesa.status === 'em_dia') div.classList.add('despesa-em-dia');
  else if (despesa.status === 'atrasada') div.classList.add('despesa-atrasada');
  else if (despesa.status === 'quitada' || despesa.quitado) div.classList.add('despesa-quitada');
  
  if (fechado) div.classList.add('transacao-fechada');
  
  div.setAttribute('data-status', despesa.status || 'pendente');
  div.setAttribute('data-categoria', despesa.categoria || '');
  div.setAttribute('data-forma-pagamento', despesa.formaPagamento || '');
  div.setAttribute('data-index', index);
  div.setAttribute('data-despesa-id', despesa.id || '');
  // NOVO: Preservar informação de anexos no elemento
  div.setAttribute('data-anexos-count', despesa.anexos ? despesa.anexos.length : 0);
  
  preencherCelulasGrid(clone, despesa, index, fechado, mes, ano);
  
  return clone;
}

function sincronizarIndicesDespesas() {
  const linhasDespesas = document.querySelectorAll('.grid-row.despesa-row');
  
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
    const template = document.getElementById('template-badge-forma-pagamento-despesa');
    if (template) {
        const badgeClone = template.content.cloneNode(true);
        const badge = badgeClone.querySelector('.badge-pagamento');
        const formaPag = despesa.formaPagamento || 'debito';
        badge.className = `badge-pagamento ${formaPag}`;
        badge.textContent = formaPag.toUpperCase();
        celulaFormaPagamento.appendChild(badgeClone);
    }
}

function preencherCelulaValor(clone, despesa) {
    const celulaValor = clone.querySelector('.col-valor');
    const temJuros = despesa.metadados && despesa.metadados.jurosPorParcela > 0;
    
    if (temJuros) {
        const template = document.getElementById('template-valor-com-juros');
        if (template) {
            const valorClone = template.content.cloneNode(true);
            const valorOriginal = despesa.valorOriginal || (despesa.metadados.valorOriginalTotal / despesa.totalParcelas);
            
            valorClone.querySelector('.valor-original').textContent = window.formatarMoeda(valorOriginal);
            valorClone.querySelector('.valor-juros').textContent = window.formatarMoeda(despesa.valor || 0);
            
            celulaValor.appendChild(valorClone);
        }
    } else {
        celulaValor.textContent = window.formatarMoeda(despesa.valor || 0);
    }
}

function preencherCelulaParcela(clone, despesa) {
    const celulaParcela = clone.querySelector('.col-parcela');
    celulaParcela.textContent = despesa.parcela || '-';
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
      
      const index = parseInt(btn.dataset.index);
      if (isNaN(index)) return;
      
      try {
          if (btn.classList.contains('btn-editar')) {
              await editarDespesa(index, mes, ano);
          } else if (btn.classList.contains('btn-excluir')) {
              await excluirDespesa(index, mes, ano);
          } else if (btn.classList.contains('btn-pagar')) {
              await abrirModalPagamento(index, mes, ano);
          } else if (btn.classList.contains('btn-mover')) {
              await moverParaProximoMes(index, mes, ano);
          } else if (btn.classList.contains('btn-anexos')) {
              // NOVO: Gerenciar visualização de anexos
              await abrirModalVisualizarAnexosDespesa(index);
          }
      } catch (error) {

          alert('Erro ao processar ação: ' + error.message);
      }
  };
  
  container.addEventListener('click', container._despesasListener);
}

// ================================================================
// FUNÇÕES AUXILIARES E UTILITÁRIAS
// ================================================================

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
       id: dados.id || gerarId(),
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
    if (despesa.quitadaAntecipadamente === true) {
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
    if (despesa.quitadaAntecipadamente === true) {
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
    const btnPagarEmLote = document.getElementById('btn-pagar-em-lote');
    if (btnPagarEmLote) {
        btnPagarEmLote.disabled = checkboxes.length < 2;
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

function configurarEventosFormularioAnexosDespesa() {
    const btnAnexarDespesa = document.getElementById('btn-anexar-despesa');
    if (btnAnexarDespesa && !btnAnexarDespesa._anexoListener) {
        btnAnexarDespesa._anexoListener = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.sistemaAnexos) {
                window.sistemaAnexos.abrirSeletorArquivos('despesa');
            }
        };
        btnAnexarDespesa.addEventListener('click', btnAnexarDespesa._anexoListener);
    }
    
    const btnAnexarComprovante = document.getElementById('btn-anexar-comprovante');
    if (btnAnexarComprovante && !btnAnexarComprovante._anexoListener) {
        btnAnexarComprovante._anexoListener = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.sistemaAnexos) {
                window.sistemaAnexos.abrirSeletorArquivos('comprovante');
            }
        };
        btnAnexarComprovante.addEventListener('click', btnAnexarComprovante._anexoListener);
    }
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

       const dataAtual = new Date(window.anoAberto, window.mesAberto, new Date().getDate());
       const dataFormatada = dataAtual.toISOString().split('T')[0];
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
       alert("Não foi possível abrir o formulário: " + error.message);
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
   
   document.getElementById('despesa-id').value = index;
   document.getElementById('despesa-descricao').value = despesa.descricao || '';
   document.getElementById('despesa-categoria').value = despesa.categoria || '';
   
   if (despesa.parcelado && despesa.metadados?.valorOriginalTotal) {
       document.getElementById('despesa-valor').value = despesa.metadados.valorOriginalTotal;
       document.getElementById('despesa-valor-pago').value = despesa.metadados.valorTotalComJuros || '';
   } else {
       document.getElementById('despesa-valor').value = despesa.valorOriginal || despesa.valor;
       document.getElementById('despesa-valor-pago').value = despesa.valorTotalComJuros || despesa.valorPago || '';
   }
   
   if (despesa.dataCompra) {
       document.getElementById('despesa-data-compra').value = despesa.dataCompra;
   }
   
   if (despesa.dataVencimento) {
       document.getElementById('despesa-data-vencimento').value = despesa.dataVencimento;
   }
   
   if (despesa.formaPagamento === 'credito' && despesa.numeroCartao) {
       const radioCartao = document.querySelector(`input[name="forma-pagamento"][data-cartao="${despesa.numeroCartao}"]`);
       if (radioCartao) radioCartao.checked = true;
   } else if (despesa.formaPagamento) {
       const radioFormaPagamento = document.querySelector(`input[name="forma-pagamento"][value="${despesa.formaPagamento}"]`);
       if (radioFormaPagamento) radioFormaPagamento.checked = true;
   }
   
   if (despesa.parcelado) {
       const parceladoCheckbox = document.getElementById('despesa-parcelado');
       const parcelasInput = document.getElementById('despesa-parcelas');
       
       if (parceladoCheckbox) {
           parceladoCheckbox.checked = true;
           parceladoCheckbox.disabled = true;
       }
       if (parcelasInput) {
           parcelasInput.value = despesa.totalParcelas;
           parcelasInput.disabled = true;
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
        
        if (!formularioValido) return false;
        
        const formData = coletarDadosFormularioDespesa();
        const ehEdicao = formData.id !== '' && formData.id !== null;

        const sucesso = await salvarDespesaLocal(formData);

        if (sucesso) {

            const modal = document.getElementById('modal-nova-despesa');
            if (modal) {
                modal.classList.remove('active');
                modal.style.display = 'none';
            }

            // ✅ EXIBIR MENSAGEM DE SUCESSO
            if (window.mostrarMensagemSucesso) {
                window.mostrarMensagemSucesso(ehEdicao ? 'Despesa atualizada com sucesso!' : 'Despesa cadastrada com sucesso!');
            }

            // Atualizar interface IMEDIATAMENTE
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
   
   let numeroCartao = null;
   if (formaPagamento === 'credito' && formaPagamentoSelecionada && formaPagamentoSelecionada.dataset.cartao) {
       numeroCartao = parseInt(formaPagamentoSelecionada.dataset.cartao);
   }
   
   const jaPago = document.getElementById('despesa-ja-pago') && document.getElementById('despesa-ja-pago').checked;
   const recorrente = document.getElementById('despesa-recorrente') && document.getElementById('despesa-recorrente').checked;
   
   const formData = {
       id: document.getElementById('despesa-id').value,
       mes: parseInt(document.getElementById('despesa-mes').value),
       ano: parseInt(document.getElementById('despesa-ano').value),
       descricao: document.getElementById('despesa-descricao').value.trim(),
       categoria: categoria,
       formaPagamento: formaPagamento,
       numeroCartao: numeroCartao,
       valor: parseFloat(document.getElementById('despesa-valor').value),
       valorPago: document.getElementById('despesa-valor-pago').value ? 
                 parseFloat(document.getElementById('despesa-valor-pago').value) : null,
       dataCompra: document.getElementById('despesa-data-compra').value,
       dataVencimento: document.getElementById('despesa-data-vencimento').value,
       parcelado: document.getElementById('despesa-parcelado').checked,
       totalParcelas: document.getElementById('despesa-parcelado').checked ? 
                     parseInt(document.getElementById('despesa-parcelas').value) : 1,
       anexos: window.sistemaAnexos ? window.sistemaAnexos.obterAnexosParaSalvar('despesa') : [],
       jaPago: jaPago,
       recorrente: recorrente
   };
   
   return formData;
}

// ================================================================
// SALVAMENTO LOCAL
// ================================================================

async function salvarDespesaLocal(formData) {
    try {
        const ehEdicao = formData.id !== '' && formData.id !== null;

        // ✅ PRODUÇÃO: Usar API de despesas via usuarioDataManager
        if (window.usuarioDataManager && typeof window.usuarioDataManager.salvarDespesa === 'function') {
            console.log('💾 Salvando despesa via API:', formData);

            // Preparar objeto despesa para API
            const despesa = {
                descricao: formData.descricao,
                categoria: formData.categoria,
                formaPagamento: formData.formaPagamento,
                numeroCartao: formData.numeroCartao,
                valor: parseFloat(formData.valor),
                valorPago: formData.valorPago || null,
                dataCompra: formData.dataCompra,
                dataVencimento: formData.dataVencimento,
                dataPagamento: formData.jaPago ? formData.dataCompra : null,
                parcelado: formData.parcelado || false,
                totalParcelas: formData.parcelado ? formData.totalParcelas : null,
                quitado: formData.jaPago || false,
                pago: formData.jaPago || false,
                recorrente: formData.recorrente || false,
                observacoes: formData.observacoes || '',
                anexos: formData.anexos || []
            };

            const sucesso = await window.usuarioDataManager.salvarDespesa(
                formData.mes,
                formData.ano,
                despesa,
                ehEdicao ? formData.id : null
            );

            if (sucesso) {
                // ✅ Atualizar memória local APÓS salvar na API
                window.garantirEstruturaDados(formData.ano, formData.mes);

                if (ehEdicao) {
                    await atualizarDespesaExistente(formData);
                } else {
                    await adicionarNovaDespesa(formData);
                }

                // Registrar log da ação
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

            return sucesso;
        }

        // ❌ FALLBACK: Salvamento antigo (localStorage) se API não disponível
        console.warn('⚠️ usuarioDataManager não disponível, usando fallback localStorage');
        window.garantirEstruturaDados(formData.ano, formData.mes);

        if (ehEdicao) {
            await atualizarDespesaExistente(formData);
        } else {
            await adicionarNovaDespesa(formData);
        }

        const sucesso = await window.salvarDados();

        if (sucesso && window.logManager) {
            window.logManager.registrar({
                modulo: 'Despesas',
                acao: ehEdicao ? 'Editado' : 'Criado',
                categoria: formData.categoria || '-',
                descricao: formData.descricao,
                valor: formData.valor,
                detalhes: `${ehEdicao ? 'Editou' : 'Criou'} despesa em ${formData.mes + 1}/${formData.ano}`
            });
        }

        return sucesso;

    } catch (error) {
        console.error('❌ Erro ao salvar despesa:', error);
        return false;
    }
}

async function adicionarNovaDespesa(formData) {
  garantirEstruturaDados(formData.ano, formData.mes);
  
  let valorOriginal = formData.valor;
  let valorTotalComJuros = formData.valorPago !== null ? formData.valorPago : valorOriginal;
  let totalJuros = valorTotalComJuros - valorOriginal;
  let valorPorParcela = formData.parcelado ? arredondarParaDuasCasas(valorTotalComJuros / formData.totalParcelas) : valorTotalComJuros;
  
  const idGrupoParcelamento = formData.parcelado ? gerarId() : null;
  
  const novaDespesa = criarObjetoDespesa({
      descricao: formData.descricao,
      categoria: formData.categoria,
      formaPagamento: formData.formaPagamento,
      numeroCartao: formData.numeroCartao,
      valor: valorPorParcela,
      valorOriginal: formData.parcelado ? valorOriginal / formData.totalParcelas : valorOriginal,
      valorTotalComJuros: valorTotalComJuros,
      valorPago: formData.jaPago ? (formData.valorPago || valorPorParcela) : null,
      dataCompra: formData.dataCompra,
      dataVencimento: formData.dataVencimento,
      dataPagamento: formData.jaPago ? formData.dataCompra : null,
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
      quitado: formData.jaPago || false,
      recorrente: formData.recorrente || false,
      idGrupoParcelamento: idGrupoParcelamento,
      anexos: formData.anexos || []
  });
  
  dadosFinanceiros[formData.ano].meses[formData.mes].despesas.push(novaDespesa);
  
  if (formData.parcelado && formData.totalParcelas > 1) {
      await criarParcelasFuturas(formData, valorPorParcela, idGrupoParcelamento, valorOriginal, valorTotalComJuros, totalJuros);
  }
  
  if (window.sistemaAnexos) {
      window.sistemaAnexos.limparAnexosTemporarios('despesa');
  }
}

async function criarParcelasFuturas(formData, valorPorParcela, idGrupoParcelamento, valorOriginal, valorTotalComJuros, totalJuros) {
    const parcelasExistentes = validarGrupoParcelamento(idGrupoParcelamento, {
        descricao: formData.descricao,
        totalParcelas: formData.totalParcelas,
        ano: formData.ano
    });
    
    if (parcelasExistentes.valido && parcelasExistentes.encontradas > 1) {
        console.warn('Parcelas já existem para este grupo:', idGrupoParcelamento);
        return;
    }
    
    for (let i = 1; i < formData.totalParcelas; i++) {
        const mesParcela = (formData.mes + i) % 12;
        const anoParcela = formData.ano + Math.floor((formData.mes + i) / 12);
        
        garantirEstruturaDados(anoParcela, mesParcela);
        
        const dataVencimentoBase = new Date(formData.dataVencimento);
        dataVencimentoBase.setMonth(dataVencimentoBase.getMonth() + i);
        const dataVencimento = dataVencimentoBase.toISOString().split('T')[0];
        
        const parcelaExiste = dadosFinanceiros[anoParcela].meses[mesParcela].despesas.some(d => 
            d.idGrupoParcelamento === idGrupoParcelamento && 
            d.parcela === `${i + 1}/${formData.totalParcelas}`
        );
        
        if (!parcelaExiste) {
            dadosFinanceiros[anoParcela].meses[mesParcela].despesas.push(criarObjetoDespesa({
                descricao: formData.descricao,
                categoria: formData.categoria,
                formaPagamento: formData.formaPagamento,
                numeroCartao: formData.numeroCartao,
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
                recorrente: formData.recorrente || false,
                idGrupoParcelamento: idGrupoParcelamento
            }));
        }
    }
}

async function atualizarDespesaExistente(formData) {
    if (!dadosFinanceiros[formData.ano] || 
        !dadosFinanceiros[formData.ano].meses[formData.mes] ||
        !dadosFinanceiros[formData.ano].meses[formData.mes].despesas[formData.id]) {
        throw new Error(ERROS.DESPESA_NAO_ENCONTRADA);
    }
    
    const despesaExistente = dadosFinanceiros[formData.ano].meses[formData.mes].despesas[formData.id];
    
    if (despesaExistente.parcelado && despesaExistente.idGrupoParcelamento) {
        await atualizarDespesaParcelada(formData, despesaExistente);
    } else {
        await atualizarDespesaSimples(formData, despesaExistente);
    }
}

async function atualizarDespesaSimples(formData, despesaExistente) {
    let valorOriginal = formData.valor;
    let valorTotalComJuros = formData.valorPago !== null ? formData.valorPago : valorOriginal;
    let totalJuros = valorTotalComJuros - valorOriginal;
    let valorPorParcela = formData.parcelado ? arredondarParaDuasCasas(valorTotalComJuros / formData.totalParcelas) : valorTotalComJuros;
    
        const despesaAtualizada = criarObjetoDespesa({
            descricao: formData.descricao,
            categoria: formData.categoria,
            formaPagamento: formData.formaPagamento,
            numeroCartao: formData.numeroCartao, // LINHA ADICIONADA
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
            quitado: false,
            status: 'em_dia'
        });
    
    dadosFinanceiros[formData.ano].meses[formData.mes].despesas[formData.id] = despesaAtualizada;
}

async function atualizarDespesaParcelada(formData, despesaExistente) {
    const idGrupoParcelamento = despesaExistente.idGrupoParcelamento;
    
    for (let anoAtual = formData.ano; anoAtual <= formData.ano + 3; anoAtual++) {
        if (!dadosFinanceiros[anoAtual]) continue;
        
        for (let m = 0; m < 12; m++) {
            if (!dadosFinanceiros[anoAtual].meses[m] || !dadosFinanceiros[anoAtual].meses[m].despesas) continue;
            
            const despesas = dadosFinanceiros[anoAtual].meses[m].despesas;
            
            for (let i = 0; i < despesas.length; i++) {
                const d = despesas[i];
                if (d.idGrupoParcelamento === idGrupoParcelamento && 
                    d.descricao === despesaExistente.descricao && 
                    d.categoria === despesaExistente.categoria) {
                    
                    if (!d.quitado) {
                        d.descricao = formData.descricao;
                        d.categoria = formData.categoria;
                        d.formaPagamento = formData.formaPagamento;
                        d.numeroCartao = formData.numeroCartao;
                        d.dataCompra = formData.dataCompra;
                        d.valorPago = null;
                        d.quitado = false;
                        d.status = 'em_dia';
                        
                        if (d.metadados) {
                            d.metadados.valorOriginalTotal = formData.valor;
                            d.metadados.valorTotalComJuros = formData.valorPago || formData.valor;
                        }
                    }
                }
            }
        }
    }
}

async function editarDespesa(index, mes, ano) {
    abrirModalNovaDespesa(index);
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
        const idGrupo = despesa.idGrupoParcelamento;
        
        dadosFinanceiros[ano].meses[mes].despesas.splice(index, 1);
        
        if (idGrupo) {
            reindexarParcelasAposExclusao(idGrupo, despesa.descricao);
        }
        
        return await salvarDados();
    } catch (error) {

        return false;
    }
}

async function excluirParcelaEFuturas(index, mes, ano) {
    try {
        if (!dadosFinanceiros[ano]?.meses[mes]?.despesas[index]) {
            throw new Error('Parcela não encontrada');
        }
        
        const despesa = dadosFinanceiros[ano].meses[mes].despesas[index];
        const idGrupo = despesa.idGrupoParcelamento;
        const [numeroParcelaAtual] = despesa.parcela.split('/').map(Number);
        
        for (let anoFuturo = ano; anoFuturo <= ano + 3; anoFuturo++) {
            if (!dadosFinanceiros[anoFuturo]) continue;
            
            const mesInicial = anoFuturo === ano ? mes : 0;
            
            for (let mesFuturo = mesInicial; mesFuturo < 12; mesFuturo++) {
                if (!dadosFinanceiros[anoFuturo].meses[mesFuturo]?.despesas) continue;
                
                const despesas = dadosFinanceiros[anoFuturo].meses[mesFuturo].despesas;
                
                for (let i = despesas.length - 1; i >= 0; i--) {
                    const d = despesas[i];
                    
                    if (d.idGrupoParcelamento === idGrupo && 
                        d.descricao === despesa.descricao) {
                        
                        const [numeroParcela] = d.parcela.split('/').map(Number);
                        
                        if (numeroParcela >= numeroParcelaAtual) {
                            despesas.splice(i, 1);
                        }
                    }
                }
            }
        }
        
        return await salvarDados();
    } catch (error) {

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
        
        const corJuros = totalJuros > 0 ? '#ef4444' : '#16a34a';
        if (elementoJurosTotal) elementoJurosTotal.style.color = corJuros;
        if (elementoJurosParcela) elementoJurosParcela.style.color = corJuros;
    }
}

// ================================================================
// CONFIGURAÇÃO DE EVENTOS DO FORMULÁRIO
// ================================================================

function configurarEventosFormularioDespesa() {
    const despesaParcelado = document.getElementById('despesa-parcelado');
    if (despesaParcelado) {
        despesaParcelado.addEventListener('change', function() {
            const info = document.getElementById('info-parcelamento');
            
            if (this.checked) {
                info?.classList.remove('hidden');
            } else {
                info?.classList.add('hidden');
            }
            
            calcularInfoParcelamento();
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

window.toggleParcelamentoDespesa = function(checkbox) {
    const inputParcelas = document.getElementById('despesa-parcelas');
    const infoParcelamento = document.getElementById('info-parcelamento');
    
    if (checkbox.checked) {
        if (inputParcelas) inputParcelas.disabled = false;
        if (infoParcelamento) infoParcelamento.classList.remove('hidden');
    } else {
        if (inputParcelas) inputParcelas.disabled = true;
        if (infoParcelamento) infoParcelamento.classList.add('hidden');
    }
    
    calcularInfoParcelamento();
};

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
    
    if (despesa.parcelado && despesa.parcela) {
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
                await processarExclusao('atual', index, mes, ano, despesa.descricao, despesa.categoria, despesa.idGrupoParcelamento);
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
                await processarExclusao('todas', index, mes, ano, despesa.descricao, despesa.categoria, despesa.idGrupoParcelamento);
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
                await processarExclusao('parcela', index, mes, ano, despesa.descricao, despesa.categoria, despesa.idGrupoParcelamento);
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
                await processarExclusao('futuras', index, mes, ano, despesa.descricao, despesa.categoria, despesa.idGrupoParcelamento);
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
                await processarExclusao('todas', index, mes, ano, despesa.descricao, despesa.categoria, despesa.idGrupoParcelamento);
            } catch (error) {
                alert('Erro ao excluir todas as parcelas: ' + error.message);
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
        alert('Erro ao processar exclusão: ' + error.message);
    }
}

async function excluirDespesaLocal(opcao, index, mes, ano, descricaoDespesa, categoriaDespesa, idGrupoParcelamento) {
    try {
        let valorExcluido = 0;
        let quantidadeExcluida = 0;

        if (opcao === 'atual') {
            if (dadosFinanceiros[ano]?.meses[mes]?.despesas[index]) {
                valorExcluido = dadosFinanceiros[ano].meses[mes].despesas[index].valor || 0;
                dadosFinanceiros[ano].meses[mes].despesas.splice(index, 1);
                quantidadeExcluida = 1;
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

        const sucesso = await salvarDados();

        // Registrar log da exclusão
        if (sucesso && window.logManager) {
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

        return sucesso;

    } catch (error) {
        return false;
    }
}

async function excluirTodasParcelas(ano, descricao, categoria, idGrupo) {
    if (!idGrupo) return { quantidade: 0, valorTotal: 0 };

    try {
        let parcelasRemovidas = 0;
        let valorTotal = 0;

        for (let anoAtual = ano; anoAtual <= ano + 3; anoAtual++) {
            if (!dadosFinanceiros[anoAtual]) continue;

            for (let m = 0; m < 12; m++) {
                if (!dadosFinanceiros[anoAtual].meses[m]?.despesas) continue;

                const despesas = dadosFinanceiros[anoAtual].meses[m].despesas;

                for (let i = despesas.length - 1; i >= 0; i--) {
                    const d = despesas[i];

                    if (d.idGrupoParcelamento === idGrupo &&
                        d.descricao === descricao &&
                        d.categoria === categoria) {

                        valorTotal += parseFloat(d.valor || 0);
                        despesas.splice(i, 1);
                        parcelasRemovidas++;
                    }
                }
            }
        }

        return { quantidade: parcelasRemovidas, valorTotal: valorTotal };
    } catch (error) {

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
    if (!dadosFinanceiros[ano]) return { quantidade: 0, valorTotal: 0 };

    let despesasRemovidas = 0;
    let valorTotal = 0;

    for (let m = 0; m < 12; m++) {
        if (!dadosFinanceiros[ano].meses[m] || !dadosFinanceiros[ano].meses[m].despesas) continue;

        const despesas = dadosFinanceiros[ano].meses[m].despesas;

        for (let i = despesas.length - 1; i >= 0; i--) {
            const d = despesas[i];
            if (d.descricao === descricao && d.categoria === categoria && !d.parcelado) {
                valorTotal += parseFloat(d.valor || 0);
                despesas.splice(i, 1);
                despesasRemovidas++;
            }
        }
    }

    return { quantidade: despesasRemovidas, valorTotal: valorTotal };
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
    
    await salvarDados();
    
    renderizarDetalhesDoMes(mes, ano);
    
    if (typeof carregarDadosDashboard === 'function') {
        await carregarDadosDashboard(anoAtual);
    }
    
    alert(`Despesa movida com sucesso para ${proximoMesNome} de ${proximoAno}!`);
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
            const linhaElemento = document.querySelector(`[data-index="${index}"]`)?.closest('.grid-row');
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
            
            // CORREÇÃO PRÁTICA: Configurar botão de comprovante após modal abrir
            setTimeout(() => {
                const btnComprovante = document.getElementById('btn-anexar-comprovante');
                if (btnComprovante) {
                    btnComprovante.onclick = function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (window.abrirSeletorArquivos) {
                            window.abrirSeletorArquivos('comprovante');
                        } else if (window.sistemaAnexos) {
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
    const elementos = {
        'pagamento-descricao': despesa.descricao || 'Sem descrição',
        'pagamento-categoria': despesa.categoria || 'Sem categoria',
        'pagamento-valor-original': window.formatarMoeda ? window.formatarMoeda(despesa.valor || 0) : `R$ ${(despesa.valor || 0).toFixed(2)}`
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
    
    const valorPagoInput = document.getElementById('valor-pago-individual');
    if (valorPagoInput) valorPagoInput.value = despesa.valor || 0;
    
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

async function processarPagamento(index, mes, ano, valorPago = null, quitarParcelasFuturas = false) {
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
        
        const sucessoSalvamento = await window.salvarDados();
        if (!sucessoSalvamento) {
            throw new Error('Falha ao salvar os dados');
        }
        
        if (typeof window.carregarDadosDashboard === 'function') {
            await window.carregarDadosDashboard(window.anoAtual || ano);
        }
        
        if (typeof window.renderizarDetalhesDoMes === 'function') {
            window.renderizarDetalhesDoMes(mes, ano);
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
                    d.quitadaAntecipadamente = true;
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
           
           if (await processarPagamentoComData(index, mesAberto, anoAberto, valorPago, false, dataPagamento)) {
               despesasPagas++;
           }
       }
   }
   
   if (window.sistemaAnexos) {
       window.sistemaAnexos.limparAnexosTemporarios('comprovante');
   }
   
   document.getElementById('modal-valores-personalizados-despesas').style.display = 'none';
   renderizarDetalhesDoMes(mesAberto, anoAberto);
   
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

async function processarPagamentoComData(index, mes, ano, valorPago = null, quitarParcelasFuturas = false, dataPagamento = null) {
    // Salvar temporariamente a data no DOM para a função processarPagamento usar
    const inputDataTemp = document.getElementById('data-pagamento-individual');
    let valorOriginal = null;
    
    if (inputDataTemp && dataPagamento) {
        valorOriginal = inputDataTemp.value;
        inputDataTemp.value = dataPagamento;
    }
    
    const resultado = await processarPagamento(index, mes, ano, valorPago, quitarParcelasFuturas);
    
    // Restaurar valor original
    if (inputDataTemp && valorOriginal !== null) {
        inputDataTemp.value = valorOriginal;
    }
    
    return resultado;
}

async function pagarLoteComValoresOriginais(checkboxes) {
   const indices = Array.from(checkboxes).map(checkbox => parseInt(checkbox.dataset.index));
   
   const inputDataLote = document.getElementById('data-pagamento-lote');
   const dataPagamentoLote = inputDataLote ? inputDataLote.value : 
                             new Date().toISOString().split('T')[0];
   
   let comprovantes = [];
   if (window.sistemaAnexos) {
       comprovantes = window.sistemaAnexos.obterAnexosParaSalvar('comprovante');
   }
   
   let despesasPagas = 0;
   for (const index of indices) {
       if (dadosFinanceiros[anoAberto] && 
           dadosFinanceiros[anoAberto].meses[mesAberto] && 
           dadosFinanceiros[anoAberto].meses[mesAberto].despesas && 
           dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index]) {
           
           if (comprovantes.length > 0) {
               const despesa = dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index];
               if (!despesa.comprovantes) {
                   despesa.comprovantes = [];
               }
               despesa.comprovantes.push(...comprovantes);
           }
           
           if (await processarPagamentoComData(index, mesAberto, anoAberto, null, false, dataPagamentoLote)) {
               despesasPagas++;
           }
       }
   }
   
   if (window.sistemaAnexos) {
       window.sistemaAnexos.limparAnexosTemporarios('comprovante');
   }
   
   renderizarDetalhesDoMes(mesAberto, anoAberto);
   
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
        
        selectFormaPagamento.removeEventListener('change', selectFormaPagamento._filterHandler);
        
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
    
    const linhas = Array.from(listaDespesas.querySelectorAll('.grid-row.despesa-row'));
    
    if (tipoOrdenacao === 'original') {
        linhas.sort((a, b) => {
            const indexA = parseInt(a.getAttribute('data-index')) || 0;
            const indexB = parseInt(b.getAttribute('data-index')) || 0;
            return indexA - indexB;
        });
    } else {
        linhas.sort((a, b) => {
            if (tipoOrdenacao.includes('compra')) {
                const dataA = a.querySelector('.col-compra').textContent;
                const dataB = b.querySelector('.col-compra').textContent;
                const resultado = compararDatas(dataA, dataB);
                return tipoOrdenacao.includes('desc') ? -resultado : resultado;
            }
            if (tipoOrdenacao.includes('vencimento')) {
                const dataA = a.querySelector('.col-vencimento').textContent;
                const dataB = b.querySelector('.col-vencimento').textContent;
                const resultado = compararDatas(dataA, dataB);
                return tipoOrdenacao.includes('desc') ? -resultado : resultado;
            }
            if (tipoOrdenacao.includes('valor')) {
                // CORREÇÃO: Obter valor diretamente da célula
                const valorA = obterValorDaColuna(a);
                const valorB = obterValorDaColuna(b);
                const resultado = valorA - valorB;
                return tipoOrdenacao.includes('desc') ? -resultado : resultado;
            }
            return 0;
        });
    }
    
    linhas.forEach(linha => listaDespesas.appendChild(linha));
    sincronizarIndicesDespesas();
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
   const linhasVisiveis = document.querySelectorAll('.grid-row.despesa-row:not([style*="display: none"])');
   const totalLinhas = document.querySelectorAll('.grid-row.despesa-row').length;
   
   let valorTotalVisivel = 0;
   
   linhasVisiveis.forEach(linha => {
       const valorDespesa = calcularValorDespesaLinha(linha);
       valorTotalVisivel += valorDespesa;
   });
   
   const contadorFiltro = document.getElementById('contador-filtro');
   if (contadorFiltro) {
       contadorFiltro.textContent = `${linhasVisiveis.length} de ${totalLinhas} despesas (${formatarMoeda(valorTotalVisivel)})`;
   }
   
   // Atualizar contadores de anexos para linhas visíveis
   setTimeout(() => {
       if (typeof atualizarTodosContadoresAnexosDespesas === 'function') {
           atualizarTodosContadoresAnexosDespesas();
       }
   }, 50);
}

function calcularValorDespesaLinha(linha) {
    const index = obterIndexDespesa(linha);
    
    if (index !== null && dadosFinanceiros[anoAberto]?.meses[mesAberto]?.despesas?.[index]) {
        const despesa = dadosFinanceiros[anoAberto].meses[mesAberto].despesas[index];
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

function calcularTotalDespesas(despesas) {
    if (!Array.isArray(despesas)) return 0;
    
    return despesas.reduce((total, despesa) => {
        if (despesa.quitadaAntecipadamente === true) {
            return total;
        }
        
        if (despesa.valorPago !== null && despesa.valorPago !== undefined && despesa.valorPago > 0) {
            return total + parseFloat(despesa.valorPago);
        }
        return total + parseFloat(despesa.valor || 0);
    }, 0);
}

function calcularTotalJuros(despesas) {
    if (!Array.isArray(despesas)) return 0;
    
    return despesas.reduce((total, despesa) => {
        let jurosCalculado = 0;
        
        if (despesa.quitacaoAntecipada === true || despesa.quitadaAntecipadamente === true) {
            return total;
        }
        
        if (despesa.valorPago !== null && despesa.valorPago !== undefined && 
            despesa.valorOriginal && despesa.valorPago > despesa.valorOriginal) {
            jurosCalculado = despesa.valorPago - despesa.valorOriginal;
        }
        else if (despesa.parcelado && despesa.metadados?.jurosPorParcela && despesa.quitado) {
            jurosCalculado = despesa.metadados.jurosPorParcela;
        }
        else if (despesa.valorOriginal && despesa.valor > despesa.valorOriginal && despesa.quitado) {
            jurosCalculado = despesa.valor - despesa.valorOriginal;
        }
        
        return total + jurosCalculado;
    }, 0);
}

function obterValorRealDespesa(despesa) {
    if (despesa.valorPago !== null && despesa.valorPago !== undefined && despesa.valorPago > 0) {
        return parseFloat(despesa.valorPago);
    }
    return parseFloat(despesa.valor) || 0;
}

// ================================================================
// FUNÇÃO PARA CALCULAR ECONOMIAS TOTAIS
// Cenário 1: Quando valor com juros < valor original (economia no cadastro)
// Cenário 2: Quando valor pago < valor devido (economia no pagamento)
// ================================================================

function calcularTotalEconomias(despesas) {
    if (!Array.isArray(despesas)) return 0;
    
    return despesas.reduce((total, despesa) => {
        let economiaCalculada = 0;
        
        // Pular despesas transferidas para próximo mês
        if (despesa.transferidaParaProximoMes === true) {
            return total;
        }
        
        // CENÁRIO 1: Economia no cadastro da despesa
        // Quando valor com juros/total é menor que valor original
        if (despesa.valorTotalComJuros !== null && 
            despesa.valorTotalComJuros !== undefined && 
            despesa.valorOriginal && 
            despesa.valorTotalComJuros < despesa.valorOriginal) {
            
            economiaCalculada += despesa.valorOriginal - despesa.valorTotalComJuros;
        }
        
        // CENÁRIO 2: Economia no pagamento
        // Quando valor pago é menor que o valor devido
        if (despesa.quitado === true && 
            despesa.valorPago !== null && 
            despesa.valorPago !== undefined) {
            
            // Determinar qual é o valor devido (com ou sem juros)
            let valorDevido = despesa.valor || 0;
            
            // Se tem valor original definido, usar ele como base
            if (despesa.valorOriginal) {
                valorDevido = despesa.valorOriginal;
            }
            
            // Se tem valor total com juros, usar ele como valor devido
            if (despesa.valorTotalComJuros) {
                valorDevido = despesa.valorTotalComJuros;
            }
            
            // Para parcelamentos, usar valor da parcela
            if (despesa.parcelado && despesa.metadados?.valorPorParcela) {
                valorDevido = despesa.metadados.valorPorParcela;
            }
            
            // Calcular economia se pagou menos que o devido
            if (despesa.valorPago < valorDevido) {
                economiaCalculada += valorDevido - despesa.valorPago;
            }
        }
        
        return total + economiaCalculada;
    }, 0);
}

function configurarBotaoComprovanteSimples() {
    const btn = document.getElementById('btn-anexar-comprovante');
    if (btn) {
        btn.onclick = function(e) {
            e.preventDefault();
            if (window.abrirSeletorArquivos) {
                window.abrirSeletorArquivos('comprovante');
            }
        };
    }
}

function calcularLimiteDisponivelCartao(numeroCartao, mes, ano) {
    if (!numeroCartao || !window.cartoesUsuario) return null;
    
    const cartao = window.cartoesUsuario[`cartao${numeroCartao}`];
    if (!cartao || !cartao.ativo) return null;
    
    const limiteTotal = parseFloat(cartao.limite) || 0;
    let limiteUtilizado = 0;
    
    for (let anoAtual = ano; anoAtual <= ano + 3; anoAtual++) {
        if (!dadosFinanceiros[anoAtual]) continue;
        
        for (let mesAtual = 0; mesAtual < 12; mesAtual++) {
            if (!dadosFinanceiros[anoAtual].meses[mesAtual]?.despesas) continue;
            
            const despesas = dadosFinanceiros[anoAtual].meses[mesAtual].despesas;
            
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
window.salvarDespesa = salvarDespesa;
window.renderizarDespesas = renderizarDespesas;
window.atualizarStatusDespesas = atualizarStatusDespesas;
window.calcularTotalDespesas = calcularTotalDespesas;
window.calcularTotalEconomias = calcularTotalEconomias;
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
window.criarFiltrosCategorias = criarFiltrosCategorias;
window.criarFiltrosFormaPagamento = criarFiltrosFormaPagamento;
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

document.addEventListener('DOMContentLoaded', configurarBotaoComprovanteSimples);
