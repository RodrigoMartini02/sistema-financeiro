// ================================================================
// SISTEMA DE ANEXOS COMPLETO PARA DESPESAS
// ================================================================

// ================================================================
// SISTEMA PRINCIPAL DE ANEXOS (GLOBAL)
// ================================================================

if (!window.sistemaAnexos) {
    window.sistemaAnexos = {
        anexosTemporarios: {
            receita: [],
            despesa: [],
            comprovante: []
        },
        
        // Função principal para abrir seletor de arquivos
        abrirSeletorArquivos: function(tipo) {
            const inputMap = {
                'receita': 'input-file-anexos-receita',
                'despesa': 'input-file-anexos-despesa',
                'comprovante': 'input-file-comprovante'
            };
            
            const inputId = inputMap[tipo];
            if (!inputId) {

                return;
            }
            
            const input = document.getElementById(inputId);
            if (!input) {

                return;
            }
            
            // Configurar event listener se não existir
            if (!input._anexoListener) {
                input._anexoListener = (e) => this.processarArquivosSelecionados(e, tipo);
                input.addEventListener('change', input._anexoListener);
            }
            
            input.click();
        },
        
        // Processar arquivos selecionados
        processarArquivosSelecionados: function(event, tipo) {
            const files = event.target.files;
            if (!files || files.length === 0) return;
            
            Array.from(files).forEach(file => {
                this.adicionarAnexo(file, tipo);
            });
            
            // Limpar input
            event.target.value = '';
        },
        
        // Adicionar anexo
        adicionarAnexo: function(file, tipo) {
            // Validar arquivo
            if (!this.validarArquivo(file)) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const anexo = {
                    id: this.gerarIdAnexo(),
                    nome: file.name,
                    tipo: file.type,
                    tamanho: file.size,
                    dados: e.target.result.split(',')[1], // Remove data:type;base64,
                    dataUpload: new Date().toISOString()
                };
                
                this.anexosTemporarios[tipo].push(anexo);
                this.atualizarListaAnexos(tipo);
            };
            
            reader.readAsDataURL(file);
        },
        
        // Validar arquivo
        validarArquivo: function(file) {
            const tiposPermitidos = [
                'application/pdf',
                'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'text/plain'
            ];
            
            if (!tiposPermitidos.includes(file.type)) {
                alert('Tipo de arquivo não permitido. Use: PDF, Imagens (JPG, PNG, GIF), Excel, Word ou TXT.');
                return false;
            }
            
            const tamanhoMaximo = 10 * 1024 * 1024; // 10MB
            if (file.size > tamanhoMaximo) {
                alert('Arquivo muito grande. Tamanho máximo: 10MB.');
                return false;
            }
            
            return true;
        },
        
        // Gerar ID único para anexo
        gerarIdAnexo: function() {
            return 'anexo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        },
        
        // Atualizar lista visual de anexos
        atualizarListaAnexos: function(tipo) {
            const containerId = this.obterContainerAnexos(tipo);
            const container = document.getElementById(containerId);
            
            if (!container) return;
            
            container.innerHTML = '';
            
            this.anexosTemporarios[tipo].forEach((anexo, index) => {
                const item = this.criarItemAnexo(anexo, index, tipo);
                container.appendChild(item);
            });
        },
        
        // Obter container de anexos baseado no tipo
        obterContainerAnexos: function(tipo) {
            const containerMap = {
                'receita': 'lista-anexos-receita',
                'despesa': 'lista-anexos-despesa',
                'comprovante': 'lista-comprovantes'
            };
            
            return containerMap[tipo] || 'lista-anexos-despesa';
        },
        
        // Criar item visual de anexo
        criarItemAnexo: function(anexo, index, tipo) {
            const template = document.getElementById(`template-anexo-item${tipo === 'despesa' ? '-despesa' : ''}`);
            if (!template) {
                return this.criarItemAnexoSemTemplate(anexo, index, tipo);
            }
            
            const clone = template.content.cloneNode(true);
            
            // Preencher informações
            const nomeAnexo = clone.querySelector('.anexo-nome');
            const iconeAnexo = clone.querySelector('.anexo-icone');
            const btnRemover = clone.querySelector('.btn-remover-anexo');
            
            if (nomeAnexo) {
                nomeAnexo.textContent = anexo.nome;
                nomeAnexo.title = `${anexo.nome} (${this.formatarTamanho(anexo.tamanho)})`;
            }
            
            if (iconeAnexo) {
                iconeAnexo.className = `anexo-icone ${this.obterIconeArquivo(anexo.tipo)}`;
            }
            
            if (btnRemover) {
                btnRemover.dataset.anexoId = anexo.id;
                btnRemover.addEventListener('click', () => {
                    this.removerAnexo(anexo.id, tipo);
                });
            }
            
            return clone;
        },
        
        // Criar item sem template (fallback)
        criarItemAnexoSemTemplate: function(anexo, index, tipo) {
            const div = document.createElement('div');
            div.className = 'anexo-item';
            
            const icone = this.obterIconeArquivo(anexo.tipo);
            const tamanho = this.formatarTamanho(anexo.tamanho);
            
            div.innerHTML = `
                <div class="anexo-info">
                    <i class="anexo-icone ${icone}"></i>
                    <span class="anexo-nome" title="${anexo.nome} (${tamanho})">${anexo.nome}</span>
                </div>
                <button class="btn-remover-anexo" data-anexo-id="${anexo.id}">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            const btnRemover = div.querySelector('.btn-remover-anexo');
            btnRemover.addEventListener('click', () => {
                this.removerAnexo(anexo.id, tipo);
            });
            
            return div;
        },
        
        // Obter ícone baseado no tipo de arquivo
        obterIconeArquivo: function(tipo) {
            if (!tipo) return 'fas fa-file';
            
            const tipoLower = tipo.toLowerCase();
            
            if (tipoLower.includes('pdf')) return 'fas fa-file-pdf';
            if (tipoLower.includes('image')) return 'fas fa-file-image';
            if (tipoLower.includes('excel') || tipoLower.includes('sheet')) return 'fas fa-file-excel';
            if (tipoLower.includes('word') || tipoLower.includes('document')) return 'fas fa-file-word';
            if (tipoLower.includes('text')) return 'fas fa-file-alt';
            
            return 'fas fa-file';
        },
        
        // Formatar tamanho do arquivo
        formatarTamanho: function(bytes) {
            if (bytes === 0) return '0 Bytes';
            
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        },
        
        // Remover anexo
        removerAnexo: function(anexoId, tipo) {
            const index = this.anexosTemporarios[tipo].findIndex(a => a.id === anexoId);
            if (index !== -1) {
                this.anexosTemporarios[tipo].splice(index, 1);
                this.atualizarListaAnexos(tipo);
            }
        },
        
        // Obter anexos para salvar
        obterAnexosParaSalvar: function(tipo) {
            return [...this.anexosTemporarios[tipo]];
        },
        
        // Limpar anexos temporários
        limparAnexosTemporarios: function(tipo) {
            this.anexosTemporarios[tipo] = [];
            this.atualizarListaAnexos(tipo);
        },
        
        // Carregar anexos existentes (para edição)
        carregarAnexosExistentes: function(dados, tipo) {
            this.anexosTemporarios[tipo] = [];
            
            if (dados && dados.anexos && Array.isArray(dados.anexos)) {
                this.anexosTemporarios[tipo] = [...dados.anexos];
            }
            
            this.atualizarListaAnexos(tipo);
        }
    };
}

// ================================================================
// FUNÇÃO GLOBAL PARA ABRIR SELETOR
// ================================================================

window.abrirSeletorArquivos = function(tipo) {
    if (window.sistemaAnexos) {
        window.sistemaAnexos.abrirSeletorArquivos(tipo);
    } else {

    }
};

// ================================================================
// SISTEMA DE VISUALIZAÇÃO DE ANEXOS PARA DESPESAS
// ================================================================

// Função para abrir modal de visualização de anexos de despesa
function abrirModalVisualizarAnexosDespesa(index) {
    try {
        if (window.mesAberto === null || window.anoAberto === null) {
            alert('Erro: Mês/ano não definido');
            return;
        }
        
        const dadosMes = window.dadosFinanceiros[window.anoAberto]?.meses[window.mesAberto];
        if (!dadosMes || !dadosMes.despesas || !dadosMes.despesas[index]) {
            alert('Despesa não encontrada');
            return;
        }
        
        const despesa = dadosMes.despesas[index];
        const anexos = despesa.anexos || [];
        
        if (anexos.length === 0) {
            alert('Esta despesa não possui anexos');
            return;
        }
        
        // Preencher modal com anexos
        preencherModalAnexosDespesa(despesa.descricao, anexos);
        
        // Abrir modal
        const modal = document.getElementById('modal-anexos-despesa');
        if (modal) {
            modal.style.display = 'block';
        }
        
    } catch (error) {

        alert('Erro ao carregar anexos da despesa');
    }
}

// Função para preencher o modal com a lista de anexos da despesa
function preencherModalAnexosDespesa(descricaoDespesa, anexos) {
    const modal = document.getElementById('modal-anexos-despesa');
    if (!modal) return;
    
    // Atualizar título
    const titulo = modal.querySelector('h2');
    if (titulo) {
        titulo.textContent = `Anexos: ${descricaoDespesa}`;
    }
    
    // Limpar lista atual
    const listaAnexos = document.getElementById('lista-anexos-despesa-visualizar');
    if (!listaAnexos) return;
    
    listaAnexos.innerHTML = '';
    
    // Separar anexos por tipo
    const anexosCadastro = anexos.filter(anexo => !anexo.tipoAnexo || anexo.tipoAnexo !== 'comprovante');
    const comprovantes = anexos.filter(anexo => anexo.tipoAnexo === 'comprovante');
    
    // Adicionar seção de anexos de cadastro
    if (anexosCadastro.length > 0) {
        const secaoCadastro = document.createElement('div');
        secaoCadastro.className = 'secao-anexos';
        secaoCadastro.innerHTML = '<h4><i class="fas fa-paperclip"></i> Anexos de Cadastro</h4>';
        
        anexosCadastro.forEach((anexo, indice) => {
            const item = criarItemAnexoDespesaParaDownload(anexo, indice, 'cadastro');
            secaoCadastro.appendChild(item);
        });
        
        listaAnexos.appendChild(secaoCadastro);
    }
    
    // Adicionar seção de comprovantes
    if (comprovantes.length > 0) {
        const secaoComprovantes = document.createElement('div');
        secaoComprovantes.className = 'secao-anexos';
        secaoComprovantes.innerHTML = '<h4><i class="fas fa-receipt"></i> Comprovantes de Pagamento</h4>';
        
        comprovantes.forEach((anexo, indice) => {
            const item = criarItemAnexoDespesaParaDownload(anexo, indice, 'comprovante');
            secaoComprovantes.appendChild(item);
        });
        
        listaAnexos.appendChild(secaoComprovantes);
    }
    
    // Se não houver anexos
    if (anexosCadastro.length === 0 && comprovantes.length === 0) {
        listaAnexos.innerHTML = '<p class="sem-anexos">Nenhum anexo encontrado</p>';
    }
}

// Função para criar item de anexo para download
function criarItemAnexoDespesaParaDownload(anexo, indice, tipo = 'cadastro') {
    const div = document.createElement('div');
    div.className = `anexo-download-item anexo-${tipo}`;
    
    const nomeArquivo = anexo.nome || `Anexo ${indice + 1}`;
    const icone = window.sistemaAnexos ? window.sistemaAnexos.obterIconeArquivo(anexo.tipo || anexo.nome) : 'fas fa-file';
    
    // Informações adicionais para comprovantes
    let infoAdicional = '';
    if (tipo === 'comprovante' && anexo.dataPagamento) {
        const dataFormatada = formatarData(anexo.dataPagamento);
        infoAdicional = `<small class="info-comprovante">Pago em: ${dataFormatada}</small>`;
    }
    
    div.innerHTML = `
        <div class="anexo-info">
            <i class="anexo-icone ${icone}"></i>
            <div class="anexo-detalhes">
                <span class="anexo-nome">${nomeArquivo}</span>
                ${infoAdicional}
                ${anexo.descricaoTipo ? `<small class="tipo-anexo">${anexo.descricaoTipo}</small>` : ''}
            </div>
        </div>
        <button class="btn-download-anexo" data-tipo="${tipo}" type="button">
            <i class="fas fa-download"></i>
        </button>
    `;
    
    const btnDownload = div.querySelector('.btn-download-anexo');
    btnDownload.addEventListener('click', () => {
        baixarAnexoDespesa(anexo, nomeArquivo);
    });
    
    return div;
}
// Função fallback para criar item sem template
function criarItemAnexoDespesaSemTemplate(anexo, indice) {
    const div = document.createElement('div');
    div.className = 'anexo-download-item';
    
    const nomeArquivo = anexo.nome || `Anexo ${indice + 1}`;
    const icone = window.sistemaAnexos.obterIconeArquivo(anexo.tipo || anexo.nome);
    
    div.innerHTML = `
        <div class="anexo-info">
            <i class="anexo-icone ${icone}"></i>
            <span class="anexo-nome">${nomeArquivo}</span>
        </div>
        <button class="btn-download-anexo" type="button">
            <i class="fas fa-download"></i>
        </button>
    `;
    
    const btnDownload = div.querySelector('.btn-download-anexo');
    btnDownload.addEventListener('click', () => {
        baixarAnexoDespesa(anexo, nomeArquivo);
    });
    
    return div;
}

// Função para baixar anexo da despesa
function baixarAnexoDespesa(anexo, nomeArquivo) {
    try {
        if (!anexo || !anexo.dados) {
            alert('Dados do anexo não encontrados');
            return;
        }
        
        // Converter base64 para blob
        const byteCharacters = atob(anexo.dados);
        const byteNumbers = new Array(byteCharacters.length);
        
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: anexo.tipo || 'application/octet-stream' });
        
        // Criar link de download
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = nomeArquivo;
        
        // Adicionar ao DOM, clicar e remover
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Limpar URL
        setTimeout(() => URL.revokeObjectURL(url), 100);
        
    } catch (error) {

        alert('Erro ao baixar anexo. Verifique se o arquivo está íntegro.');
    }
}

// ================================================================
// CONFIGURAÇÃO DE EVENTOS PARA DESPESAS
// ================================================================

function configurarEventosAnexosDespesas(container) {
    if (!container) return;
    
    container.addEventListener('click', (e) => {
        const btnAnexos = e.target.closest('.btn-anexos');
        if (!btnAnexos) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const index = parseInt(btnAnexos.dataset.index);
        if (isNaN(index)) return;
        
        abrirModalVisualizarAnexosDespesa(index);
    });
}

// Função para configurar eventos do modal de anexos para despesas
function configurarEventosModalAnexosDespesas() {
    const modal = document.getElementById('modal-anexos-despesa');
    if (!modal) return;
    
    // Fechar modal
    const btnFechar = modal.querySelector('.close');
    if (btnFechar) {
        btnFechar.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }
    
    // Fechar ao clicar fora
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
}

// ================================================================
// ATUALIZAÇÃO DE CONTADORES PARA DESPESAS
// ================================================================

function atualizarContadorAnexosDespesa(index, quantidade) {
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

function atualizarTodosContadoresAnexosDespesas() {
    if (!window.dadosFinanceiros || window.mesAberto === null || window.anoAberto === null) {
        return;
    }
    
    const dadosMes = window.dadosFinanceiros[window.anoAberto]?.meses[window.mesAberto];
    if (!dadosMes || !dadosMes.despesas) return;
    
    dadosMes.despesas.forEach((despesa, index) => {
        if (!despesa.transferidaParaProximoMes) {
            const quantidade = despesa.anexos ? despesa.anexos.length : 0;
            atualizarContadorAnexosDespesa(index, quantidade);
        }
    });
}

// ================================================================
// INTEGRAÇÃO COM O SISTEMA DE DESPESAS
// ================================================================

// Função para configurar eventos no formulário de despesas
function configurarEventosFormularioAnexosDespesa() {
    const btnAnexarDespesa = document.getElementById('btn-anexar-despesa');
    if (btnAnexarDespesa) {
        btnAnexarDespesa.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.sistemaAnexos) {
                window.sistemaAnexos.abrirSeletorArquivos('despesa');
            }
        });
    }
    
    const btnAnexarComprovante = document.getElementById('btn-anexar-comprovante');
    if (btnAnexarComprovante) {
        btnAnexarComprovante.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.sistemaAnexos) {
                window.sistemaAnexos.abrirSeletorArquivos('comprovante');
            }
        });
    }
}

// ================================================================
// INICIALIZAÇÃO
// ================================================================

function inicializarSistemaAnexosDespesas() {
    // Configurar eventos dos modais
    configurarEventosModalAnexosDespesas();
    
    // Configurar eventos do formulário
    configurarEventosFormularioAnexosDespesa();
    
    // Observar mudanças na tabela de despesas para configurar eventos
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                const listaDespesas = document.getElementById('lista-despesas');
                if (listaDespesas && mutation.target === listaDespesas) {
                    configurarEventosAnexosDespesas(listaDespesas);
                    setTimeout(atualizarTodosContadoresAnexosDespesas, 100);
                }
            }
        });
    });
    
    // Observar mudanças na lista de despesas
    const listaDespesas = document.getElementById('lista-despesas');
    if (listaDespesas) {
        observer.observe(listaDespesas, { childList: true, subtree: true });
        configurarEventosAnexosDespesas(listaDespesas);
    }
}

// Função para abrir modal de visualização de anexos de RECEITA
function abrirModalVisualizarAnexosReceita(index) {
    try {
        if (window.mesAberto === null || window.anoAberto === null) {
            alert('Erro: Mês/ano não definido');
            return;
        }
        
        const dadosMes = window.dadosFinanceiros[window.anoAberto]?.meses[window.mesAberto];
        if (!dadosMes || !dadosMes.receitas || !dadosMes.receitas[index]) {
            alert('Receita não encontrada');
            return;
        }
        
        const receita = dadosMes.receitas[index];
        const anexos = receita.anexos || [];
        
        if (anexos.length === 0) {
            alert('Esta receita não possui anexos');
            return;
        }
        
        // Preencher modal com anexos
        preencherModalAnexosReceita(receita.descricao, anexos);
        
        // Abrir modal
        const modal = document.getElementById('modal-anexos-receita');
        if (modal) {
            modal.style.display = 'block';
        }
        
    } catch (error) {

        alert('Erro ao carregar anexos da receita');
    }
}

// Função auxiliar para preencher o modal
function preencherModalAnexosReceita(descricaoReceita, anexos) {
    const modal = document.getElementById('modal-anexos-receita');
    if (!modal) return;
    
    const titulo = modal.querySelector('h2');
    if (titulo) {
        titulo.textContent = `Anexos: ${descricaoReceita}`;
    }
    
    const listaAnexos = document.getElementById('lista-anexos-visualizar');
    if (!listaAnexos) return;
    
    listaAnexos.innerHTML = '';
    
    anexos.forEach((anexo, indice) => {
        const item = criarItemAnexoParaDownload(anexo, indice);
        listaAnexos.appendChild(item);
    });
}

// Função para criar item de download - VERSÃO CORRIGIDA
function criarItemAnexoParaDownload(anexo, indice) {
    const div = document.createElement('div');
    div.className = 'anexo-download-item';
    
    const nomeArquivo = anexo.nome || `Anexo ${indice + 1}`;
    
    div.innerHTML = `
        <div class="anexo-info">
            <i class="fas fa-file"></i>
            <span class="anexo-nome">${nomeArquivo}</span>
        </div>
        <button class="btn-download-anexo" type="button">
            <i class="fas fa-download"></i>
        </button>
    `;
    
    const btnDownload = div.querySelector('.btn-download-anexo');
    btnDownload.addEventListener('click', () => {
        baixarAnexoReceita(anexo, nomeArquivo); // MUDANÇA AQUI
    });
    
    return div;
}

// Função para baixar anexo - ADICIONAR ESTA FUNÇÃO
function baixarAnexoReceita(anexo, nomeArquivo) {
    try {
        if (!anexo || !anexo.dados) {
            alert('Dados do anexo não encontrados');
            return;
        }
        
        // Converter base64 para blob
        const byteCharacters = atob(anexo.dados);
        const byteNumbers = new Array(byteCharacters.length);
        
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: anexo.tipo || 'application/octet-stream' });
        
        // Criar link de download
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = nomeArquivo;
        
        // Forçar download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Limpar URL
        setTimeout(() => URL.revokeObjectURL(url), 100);
        
    } catch (error) {

        alert('Erro ao baixar anexo. Verifique se o arquivo está íntegro.');
    }
}

// Exportar função global
window.abrirModalVisualizarAnexosReceita = abrirModalVisualizarAnexosReceita;

// ================================================================
// EXPORTAR FUNÇÕES GLOBAIS
// ================================================================

// Funções para receitas
function configurarEventosAnexosReceitas(container) {
    // Placeholder - configuração de eventos de anexos para receitas
    if (!container) return;

}

window.abrirModalVisualizarAnexosReceita = abrirModalVisualizarAnexosReceita;
window.baixarAnexoReceita = baixarAnexoReceita;
window.configurarEventosAnexosReceitas = configurarEventosAnexosReceitas;
window.atualizarContadorAnexosReceita = atualizarContadorAnexosReceita;
window.atualizarTodosContadoresAnexosReceitas = atualizarTodosContadoresAnexosReceitas;

// Funções para despesas
window.abrirModalVisualizarAnexosDespesa = abrirModalVisualizarAnexosDespesa;
window.baixarAnexoDespesa = baixarAnexoDespesa;
window.configurarEventosAnexosDespesas = configurarEventosAnexosDespesas;
window.atualizarContadorAnexosDespesa = atualizarContadorAnexosDespesa;
window.atualizarTodosContadoresAnexosDespesas = atualizarTodosContadoresAnexosDespesas;

// ================================================================
// INICIALIZAÇÃO GERAL
// ================================================================

function inicializarSistemaAnexos() {

    inicializarSistemaAnexosDespesas();
    // Receitas não precisam de inicialização especial
}

window.inicializarSistemaAnexos = inicializarSistemaAnexos;

// ================================================================
// INICIALIZAÇÃO AUTOMÁTICA
// ================================================================

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(inicializarSistemaAnexos, 500);
});

// Também inicializar quando o sistema financeiro estiver pronto
window.addEventListener('sistemaFinanceiroReady', function() {
    setTimeout(inicializarSistemaAnexos, 200);
});

// Inicializar imediatamente se já estivermos carregados
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(inicializarSistemaAnexos, 100);
}