// ================================================================
// SISTEMA PRINCIPAL - MAIN.JS OTIMIZADO
// ================================================================
const API_URL = 'https://sistema-financeiro-backend-o199.onrender.com/api'

// Função padrão para enviar dados para o servidor
async function enviarDados(rota, dados) {
    try {
        const resposta = await fetch(`${API_URL}${rota}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        return await resposta.json();
    } catch (erro) {
        // Erro na conexão - silencioso
    }
}
// ================================================================
// VARIÁVEIS GLOBAIS
// ================================================================

let dadosFinanceiros = {};
let anoAtual = new Date().getFullYear();
let mesAtual = new Date().getMonth();
let mesAberto = null;
let anoAberto = null;

let sistemaInicializado = false;
let salvandoDados = false;
let timerSalvamento = null;

// ================================================================
// INICIALIZAÇÃO
// ================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await iniciarSistema();
});

async function iniciarSistema() {
    if (!verificarAcessoUsuario()) {
        return;
    }

    exportarVariaveisGlobais();

    // ✅ Aguardar carregamento dos dados da API
    await carregarDadosLocais();

    sistemaInicializado = true;
    window.sistemaInicializado = true;

    configurarInterface();
    exibirNomeUsuario(); // Mostrar nome do usuário logado

    if (!dadosFinanceiros[anoAtual]) {
        abrirModalNovoAno();
    } else {
        await carregarDadosDashboard(anoAtual);
        await renderizarMeses(anoAtual);

        // Garantir que dashboard inicia visível
        setTimeout(() => {
            onSecaoAtivada('dashboard');
        }, 200);
    }

    notificarSistemaReady();
}

function verificarAcessoUsuario() {
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    if (!usuarioAtual) {
        redirecionarParaLogin();
        return false;
    }
    return true;
}

function redirecionarParaLogin() {
    if (!window.location.pathname.includes('login.html')) {
        window.location.href = 'login.html';
    }
}

function exportarVariaveisGlobais() {
    window.dadosFinanceiros = dadosFinanceiros;
    window.anoAtual = anoAtual;
    window.mesAtual = mesAtual;
    window.mesAberto = mesAberto;
    window.anoAberto = anoAberto;
    
    window.formatarMoeda = formatarMoeda;
    window.formatarData = formatarData;
    window.gerarId = gerarId;
    window.salvarDados = salvarDados;
    window.garantirEstruturaDados = garantirEstruturaDados;
    
    window.abrirModal = abrirModal;
    window.fecharModal = fecharModal;
    window.atualizarElemento = atualizarElemento;
    window.obterValorElemento = obterValorElemento;
    
    window.mudarAno = mudarAno;
    window.criarAnoSimples = criarAnoSimples;
    window.excluirAno = excluirAno;
    window.calcularSaldoMes = calcularSaldoMes;
    
    window.abrirDetalhesDoMes = abrirDetalhesDoMes;
    window.renderizarMeses = renderizarMeses;
    window.renderizarDetalhesDoMes = renderizarDetalhesDoMes;
    window.carregarDadosDashboard = carregarDadosDashboard;
    window.atualizarResumoAnual = atualizarResumoAnual;
    
    // Funções de fechamento de mês
    window.fecharMes = fecharMes;
    window.reabrirMes = reabrirMes;
    window.criarReceitaSaldoAnterior = criarReceitaSaldoAnterior;
    window.removerReceitaSaldoAnterior = removerReceitaSaldoAnterior;
    window.verificarFechamentoAutomatico = verificarFechamentoAutomatico;

    
    
    window.calcularTotalDespesas = function(despesas) {
        if (!Array.isArray(despesas)) return 0;
        return despesas.reduce((total, despesa) => {
            return total + obterValorRealDespesa(despesa);
        }, 0);
    };

    window.notificarSistema = function(tipo, dados) {
        try {
            if (typeof window.SistemaNotificacoes !== 'undefined') {
                switch(tipo) {
                    case 'pagamento_processado':
                        window.SistemaNotificacoes.onPagamentoProcessado(dados.despesa, dados.valor);
                        break;
                    case 'mes_fechado':
                        window.SistemaNotificacoes.onMesFechado(dados.mes, dados.ano, dados.saldo);
                        break;
                }
            }
        } catch (error) {
            // Falha silenciosa
        }
    };

    // ✅ FUNÇÕES DE NOTIFICAÇÃO DE SUCESSO/ERRO
    window.mostrarMensagemSucesso = function(mensagem) {
        mostrarNotificacao(mensagem, 'sucesso');
    };

    window.mostrarMensagemErro = function(mensagem) {
        mostrarNotificacao(mensagem, 'erro');
    };
}

// ================================================================
// SISTEMA DE NOTIFICAÇÕES
// ================================================================

// ================================================================
// SISTEMA DE TOAST NOTIFICATIONS - GLOBAL
// ================================================================
function mostrarToast(mensagem, tipo = 'info', duracao = 4000) {
    // Garantir que o container de toast existe
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    // Criar elemento toast
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;

    // Ícones por tipo
    const icons = {
        success: 'fas fa-check-circle',
        sucesso: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        erro: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        aviso: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };

    // Normalizar tipo (compatibilidade com português)
    const tipoNormalizado = tipo === 'sucesso' ? 'success' :
                           tipo === 'erro' ? 'error' :
                           tipo === 'aviso' ? 'warning' : tipo;

    toast.innerHTML = `
        <i class="toast-icon ${icons[tipo] || icons.info}"></i>
        <div class="toast-content">
            <p class="toast-message">${mensagem}</p>
        </div>
        <button class="toast-close" aria-label="Fechar">
            <i class="fas fa-times"></i>
        </button>
    `;

    toast.className = `toast ${tipoNormalizado}`;

    // Adicionar ao container
    container.appendChild(toast);

    // Mostrar toast com animação
    setTimeout(() => toast.classList.add('show'), 10);

    // Fechar toast ao clicar no botão X
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
        fecharToast(toast);
    });

    // Auto-fechar após duração
    if (duracao > 0) {
        setTimeout(() => {
            fecharToast(toast);
        }, duracao);
    }

    return toast;
}

function fecharToast(toast) {
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(() => {
        if (toast.parentElement) {
            toast.parentElement.removeChild(toast);
        }
    }, 300);
}

// Retrocompatibilidade com função antiga
function mostrarNotificacao(mensagem, tipo) {
    // Converter tipo antigo para novo formato
    const tipoConvertido = tipo === 'sucesso' ? 'success' :
                          tipo === 'erro' ? 'error' : tipo;
    mostrarToast(mensagem, tipoConvertido, 4000);
}

// ================================================================
// CARREGAMENTO DE DADOS
// ================================================================

async function carregarDadosLocais() {
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');

    if (!usuarioAtual) {
        dadosFinanceiros = criarEstruturaVazia();
        window.dadosFinanceiros = dadosFinanceiros;
        return;
    }

    try {
        // ✅ Carregar dados da API através do usuarioDataManager
        if (window.usuarioDataManager && typeof window.usuarioDataManager.getDadosFinanceirosUsuario === 'function') {
            dadosFinanceiros = await window.usuarioDataManager.getDadosFinanceirosUsuario();

            if (!dadosFinanceiros || Object.keys(dadosFinanceiros).length === 0) {
                dadosFinanceiros = criarEstruturaVazia();
            }
        } else {
            dadosFinanceiros = criarEstruturaVazia();
        }

        window.dadosFinanceiros = dadosFinanceiros;

    } catch (error) {
        dadosFinanceiros = criarEstruturaVazia();
        window.dadosFinanceiros = dadosFinanceiros;
    }
}

function criarEstruturaVazia() {
    const estrutura = {};
    estrutura[anoAtual] = { meses: [] };
    
    for (let i = 0; i < 12; i++) {
        estrutura[anoAtual].meses[i] = { 
            receitas: [], 
            despesas: [],
            fechado: false,
            saldoAnterior: 0,
            saldoFinal: 0
        };
    }
    
    return estrutura;
}

// ================================================================
// SALVAMENTO DE DADOS
// ================================================================

async function salvarDados() {
    if (salvandoDados) {
        return await aguardarSalvamento();
    }

    if (timerSalvamento) {
        clearTimeout(timerSalvamento);
    }

    return new Promise((resolve) => {
        timerSalvamento = setTimeout(async () => {
            salvandoDados = true;
            let sucesso = false;

            try {
                // 🔥 SALVAR NA API DO POSTGRESQL PRIMEIRO
                if (window.usuarioDataManager && typeof window.usuarioDataManager.salvarDadosUsuario === 'function') {
                    sucesso = await window.usuarioDataManager.salvarDadosUsuario(window.dadosFinanceiros);

                    // Salvar também no localStorage como backup
                    if (sucesso) {
                        await salvarDadosLocal();
                    }
                } else {
                    // Fallback para localStorage se usuarioDataManager não disponível
                    sucesso = await salvarDadosLocal();
                }
            } catch (error) {
                // Fallback para localStorage em caso de erro
                sucesso = await salvarDadosLocal();
            } finally {
                salvandoDados = false;
                resolve(sucesso);
            }
        }, 300);
    });
}

async function aguardarSalvamento() {
    let tentativas = 0;
    const maxTentativas = 20;
    
    while (salvandoDados && tentativas < maxTentativas) {
        await new Promise(resolve => setTimeout(resolve, 200));
        tentativas++;
    }
    
    return !salvandoDados;
}

async function salvarDadosLocal() {
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    
    if (!usuarioAtual) {
        return false;
    }

    try {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const index = usuarios.findIndex(u => 
            u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual
        );
        
        if (index !== -1) {
            usuarios[index].dadosFinanceiros = dadosFinanceiros;
            usuarios[index].ultimaAtualizacao = new Date().toISOString();
            localStorage.setItem('usuarios', JSON.stringify(usuarios));
            return true;
        }
        
        return false;
    } catch (error) {
        return false;
    }
}

// ================================================================
// CONFIGURAÇÃO DE INTERFACE
// ================================================================

function configurarInterface() {
    setupNavigation();
    setupControlesAno();
    setupModais();
    setupTransacoesRapidas();
    setupAbas();
    setupOutrosControles();
    setupSistemaBloqueio();
    setupEventosFechamento();
    configurarObservadorModal(); // ADICIONAR ESTA LINHA
    
    atualizarElemento('ano-atual', anoAtual);
}

function setupNavigation() {
    const toggleSidebar = document.getElementById('toggleSidebar');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (toggleSidebar && sidebar && mainContent) {
        toggleSidebar.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        });
    }
    
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            document.querySelectorAll('section[id$="-section"]').forEach(section => {
                section.classList.remove('active');
            });
            
            const sectionId = link.getAttribute('data-section') + '-section';
            const section = document.getElementById(sectionId);
            if (section) {
                section.classList.add('active');
                onSecaoAtivada(link.getAttribute('data-section'));
            }
        });
    });
}

function onSecaoAtivada(secao) {
    switch (secao) {
        case 'dashboard':
            // ✅ Carregar dados do dashboard automaticamente ao entrar na seção
            setTimeout(async () => {
                await carregarDadosDashboard(anoAtual);
                atualizarResumoAnual(anoAtual);
            }, 100);
            break;

        case 'meses':
            setTimeout(async () => {
                await renderizarMeses(anoAtual);
                atualizarResumoAnual(anoAtual);

                // Se há um mês aberto, recarregar seus detalhes
                if (window.mesAberto !== null && window.anoAberto !== null &&
                    typeof window.renderizarDetalhesDoMes === 'function') {
                    await window.renderizarDetalhesDoMes(window.mesAberto, window.anoAberto);
                }
            }, 100);
            break;

        case 'fin-sights':
            if (typeof onRevistaActivated === 'function') {
                setTimeout(() => onRevistaActivated(), 100);
            }
            break;

        case 'relatorios':
            if (window.sistemaRelatoriosTelaCheia) {
                setTimeout(() => {
                    window.sistemaRelatoriosTelaCheia.carregarCategorias();
                }, 100);
            }
            break;

        case 'registros':
            // Seção removida
            break;
    }
}

function setupControlesAno() {
    const btnAnoAnterior = document.getElementById('btn-ano-anterior');
    const btnProximoAno = document.getElementById('btn-proximo-ano');
    const btnNovoAno = document.getElementById('btn-novo-ano');
    const btnExcluirAno = document.getElementById('btn-excluir-ano-atual');
    
    if (btnAnoAnterior) {
        btnAnoAnterior.addEventListener('click', () => mudarAno(anoAtual - 1));
    }
    
    if (btnProximoAno) {
        btnProximoAno.addEventListener('click', () => mudarAno(anoAtual + 1));
    }
    
    if (btnNovoAno) {
        btnNovoAno.addEventListener('click', abrirModalNovoAno);
    }
    
    if (btnExcluirAno) {
        btnExcluirAno.addEventListener('click', () => excluirAno(anoAtual));
    }
    
    const formNovoAno = document.getElementById('form-novo-ano');
    if (formNovoAno) {
        formNovoAno.addEventListener('submit', criarNovoAno);
    }
}

function setupModais() {
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', () => {
            const modal = closeBtn.closest('.modal');
            if (modal && modal.id !== 'modal-lock-screen') {
                if (modal.id === 'modal-detalhes-mes') {
                    const checkboxTodas = document.getElementById('select-all-despesas');
                    if (checkboxTodas) {
                        checkboxTodas.checked = false;
                    }
                    
                    const todasCheckboxes = document.querySelectorAll('.despesa-checkbox');
                    todasCheckboxes.forEach(checkbox => {
                        checkbox.checked = false;
                    });
                    
                    if (typeof atualizarBotaoLote === 'function') {
                        atualizarBotaoLote();
                    }
                }
                modal.style.display = 'none';
            }
        });
    });

    window.addEventListener('click', event => {
        if (event.target.classList.contains('modal') && 
            event.target.id !== 'modal-lock-screen') {
            if (event.target.id === 'modal-detalhes-mes') {
                const checkboxTodas = document.getElementById('select-all-despesas');
                if (checkboxTodas) {
                    checkboxTodas.checked = false;
                }
                
                const todasCheckboxes = document.querySelectorAll('.despesa-checkbox');
                todasCheckboxes.forEach(checkbox => {
                    checkbox.checked = false;
                });
                
                if (typeof atualizarBotaoLote === 'function') {
                    atualizarBotaoLote();
                }
            }
            event.target.style.display = 'none';
        }
    });
}

function setupTransacoesRapidas() {
    const btnAdicionarReceitaRapida = document.getElementById('btn-adicionar-receita-rapida');
    const btnAdicionarDespesaRapida = document.getElementById('btn-adicionar-despesa-rapida');
    const modalSelecionarMes = document.getElementById('modal-selecionar-mes');

    if (!btnAdicionarReceitaRapida || !btnAdicionarDespesaRapida || !modalSelecionarMes) {
        return;
    }

    const seletorMesGrid = document.getElementById('seletor-mes-rapido-grid');
    const tipoTransacaoRapidaInput = document.getElementById('tipo-transacao-rapida');
    const selecionarMesTitulo = document.getElementById('selecionar-mes-titulo');
    const spanCloseSeletorMes = modalSelecionarMes.querySelector('.close');

    const abrirModalSelecaoMes = (tipo) => {
        tipoTransacaoRapidaInput.value = tipo;
        selecionarMesTitulo.textContent = `Adicionar ${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`;
        modalSelecionarMes.style.display = 'block';
    };

    btnAdicionarReceitaRapida.addEventListener('click', () => abrirModalSelecaoMes('receita'));
    btnAdicionarDespesaRapida.addEventListener('click', () => abrirModalSelecaoMes('despesa'));
    
    if (spanCloseSeletorMes) {
        spanCloseSeletorMes.addEventListener('click', () => {
            modalSelecionarMes.style.display = 'none';
        });
    }

    if (seletorMesGrid) {
        seletorMesGrid.addEventListener('click', function(e) {
            const botaoMes = e.target.closest('.mes-btn');
            if (!botaoMes) return;

            const mesSelecionado = parseInt(botaoMes.dataset.mes);
            const tipo = tipoTransacaoRapidaInput.value;
            
            modalSelecionarMes.style.display = 'none';

            mesAberto = mesSelecionado;
            anoAberto = anoAtual;
            window.mesAberto = mesAberto;
            window.anoAberto = anoAberto;

            if (tipo === 'receita' && typeof window.abrirModalNovaReceita === 'function') {
                window.abrirModalNovaReceita();
            } else if (tipo === 'despesa' && typeof window.abrirModalNovaDespesa === 'function') {
                window.abrirModalNovaDespesa();
            }
        });
    }
}

function setupAbas() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            const tabContent = document.getElementById(tabId);
            if (tabContent) {
                tabContent.classList.add('active');
            }
        });
    });
}

function setupOutrosControles() {
    const refreshBtn = document.getElementById('btn-refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            const icon = this.querySelector('i');
            icon.classList.add('fa-spin');

            await carregarDadosLocais();
            await carregarDadosDashboard(anoAtual);
            await renderizarMeses(anoAtual);

            const secaoAtiva = document.querySelector('.nav-link.active')?.dataset.section;
            if (secaoAtiva) {
                onSecaoAtivada(secaoAtiva);
            }

            setTimeout(() => icon.classList.remove('fa-spin'), 500);
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function(e) {
            e.preventDefault();

            sessionStorage.removeItem('usuarioAtual');
            sessionStorage.removeItem('dadosUsuarioLogado');
            localStorage.removeItem('token');

            window.location.href = 'login.html';
        });
    }
}

function setupSistemaBloqueio() {
    const lockButton = document.getElementById('btn-lock-system');
    const lockForm = document.getElementById('form-lock-screen');
    const overlay = document.getElementById('lock-screen-overlay');
    const modal = document.getElementById('modal-lock-screen');

    if (!lockButton || !lockForm || !overlay || !modal) {
        return;
    }

    const passwordInput = document.getElementById('lock-screen-password');
    const modalContent = modal.querySelector('.modal-content');
    let inactivityTimer;

    const LOCK_STATE_KEY = 'sistema_bloqueado';

    const lockSystem = (salvarEstado = true) => {
        if (modal.classList.contains('visible')) return;
        
        overlay.classList.add('visible');
        modal.classList.add('visible');
        document.body.classList.add('body-locked');
        
        if (salvarEstado) {
            localStorage.setItem(LOCK_STATE_KEY, 'true');
        }
        
        clearTimeout(inactivityTimer);
        bloquearModal();
        
        if (passwordInput) {
            passwordInput.value = '';
            setTimeout(() => passwordInput.focus(), 100);
        }
    };

    const unlockSystem = () => {
        overlay.classList.remove('visible');
        modal.classList.remove('visible');
        document.body.classList.remove('body-locked');
        
        localStorage.removeItem(LOCK_STATE_KEY);
        desbloquearModal();
        resetInactivityTimer();
    };

    const bloquearModal = () => {
        overlay.addEventListener('click', impedirFechamento, true);
        modal.addEventListener('click', impedirFechamento, true);
        document.addEventListener('keydown', bloquearEscape, true);
    };

    const desbloquearModal = () => {
        overlay.removeEventListener('click', impedirFechamento, true);
        modal.removeEventListener('click', impedirFechamento, true);
        document.removeEventListener('keydown', bloquearEscape, true);
    };

    const impedirFechamento = (event) => {
        if (localStorage.getItem(LOCK_STATE_KEY) === 'true') {
            const isFormElement = event.target.closest('#form-lock-screen') || 
                                  event.target.id === 'lock-screen-password';
            
            if (!isFormElement) {
                event.preventDefault();
                event.stopPropagation();
                if (passwordInput) passwordInput.focus();
                return false;
            }
        }
    };

    const bloquearEscape = (event) => {
        if (localStorage.getItem(LOCK_STATE_KEY) === 'true' && event.key === 'Escape') {
            event.preventDefault();
            if (passwordInput) passwordInput.focus();
            return false;
        }
    };

    const handleUnlockAttempt = async (event) => {
        event.preventDefault();
        
        const enteredPassword = passwordInput?.value;
        if (!enteredPassword) {
            alert('Por favor, digite sua senha.');
            return;
        }
        
        try {
            const usuario = obterUsuarioAtualLocal();
            const senhaCorreta = usuario && (usuario.password === enteredPassword || usuario.senha === enteredPassword);
            
            if (senhaCorreta) {
                unlockSystem();
            } else {
                if (modalContent) {
                    modalContent.classList.add('shake-animation');
                    setTimeout(() => modalContent.classList.remove('shake-animation'), 500);
                }
                passwordInput.value = '';
                passwordInput.focus();
            }
        } catch (error) {
            alert('Erro ao verificar senha. Tente novamente.');
        }
    };

    const resetInactivityTimer = () => {
        if (localStorage.getItem(LOCK_STATE_KEY) === 'true') return;

        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(lockSystem, 20 * 60 * 1000);
    };

    // Event listeners
    lockButton.addEventListener('click', lockSystem);
    lockForm.addEventListener('submit', handleUnlockAttempt);

    ['mousemove', 'keydown', 'scroll', 'click'].forEach(evento => {
        window.addEventListener(evento, () => {
            if (localStorage.getItem(LOCK_STATE_KEY) !== 'true') {
                resetInactivityTimer();
            }
        });
    });

    // Verificar se estava bloqueado ao carregar
    if (localStorage.getItem(LOCK_STATE_KEY) === 'true') {
        setTimeout(() => lockSystem(false), 100);
    } else {
        resetInactivityTimer();
    }

    // Prevenir fechamento da aba quando bloqueado
    window.addEventListener('beforeunload', (event) => {
        if (localStorage.getItem(LOCK_STATE_KEY) === 'true') {
            event.preventDefault();
            event.returnValue = 'Sistema bloqueado. Desbloqueie antes de sair.';
            return event.returnValue;
        }
    });
}




function setupEventosFechamento() {
    const btnFecharMes = document.getElementById('btn-fechar-mes');
    const btnReabrirMes = document.getElementById('btn-reabrir-mes');
    
    if (btnFecharMes) {
        btnFecharMes.addEventListener('click', () => {
            if (mesAberto !== null && anoAberto !== null) {
                abrirModalConfirmacaoFechamento(mesAberto, anoAberto);
            }
        });
    }
    
    if (btnReabrirMes) {
        btnReabrirMes.addEventListener('click', () => {
            if (mesAberto !== null && anoAberto !== null) {
                abrirModalConfirmacaoReabertura(mesAberto, anoAberto);
            }
        });
    }
    
    const btnConfirmarFechamento = document.getElementById('btn-confirmar-fechamento');
    const btnConfirmarReabertura = document.getElementById('btn-confirmar-reabertura');
    const btnCancelarFechamento = document.getElementById('btn-cancelar-fechamento');
    const btnCancelarReabertura = document.getElementById('btn-cancelar-reabertura');
    
    if (btnConfirmarFechamento) {
        btnConfirmarFechamento.addEventListener('click', async () => {
            await confirmarFechamento();
        });
    }
    
    if (btnConfirmarReabertura) {
        btnConfirmarReabertura.addEventListener('click', async () => {
            await confirmarReabertura();
        });
    }
    
    if (btnCancelarFechamento) {
        btnCancelarFechamento.addEventListener('click', () => {
            fecharModal('modal-confirmar-fechamento');
        });
    }
    
    if (btnCancelarReabertura) {
        btnCancelarReabertura.addEventListener('click', () => {
            fecharModal('modal-confirmar-reabertura');
        });
    }
}

function obterUsuarioAtualLocal() {
    try {
        // Primeiro tenta pegar do sessionStorage (dados do usuário logado via API)
        const dadosUsuario = sessionStorage.getItem('dadosUsuarioLogado');
        if (dadosUsuario) {
            return JSON.parse(dadosUsuario);
        }

        // Fallback: busca no localStorage (modo antigo)
        const usuarioAtual = sessionStorage.getItem('usuarioAtual');
        if (!usuarioAtual) return null;

        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        return usuarios.find(u => u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual);
    } catch (error) {
        return null;
    }
}




function configurarObservadorModal() {
    const modal = document.getElementById('modal-nova-despesa');
    if (!modal) return;
    
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                const isVisible = modal.style.display === 'block' || modal.classList.contains('active');
                
                if (isVisible) {
                    setTimeout(() => {
                        if (typeof recarregarEAtualizarCartoes === 'function') {
                            recarregarEAtualizarCartoes();
                        }
                    }, 100);
                }
            }
        });
    });
    
    observer.observe(modal, {
        attributes: true,
        attributeFilter: ['style', 'class']
    });
}





// ================================================================
// GESTÃO DE ANOS
// ================================================================

async function mudarAno(ano) {
    try {
        if (!dadosFinanceiros[ano]) {
            if (confirm(`O ano ${ano} ainda não foi configurado. Deseja criar agora?`)) {
                await criarAnoSimples(ano);
            }
            return;
        }
        
        anoAtual = ano;
        window.anoAtual = anoAtual;
        atualizarElemento('ano-atual', anoAtual);
        
        await carregarDadosDashboard(anoAtual);
        atualizarResumoAnual(anoAtual);
        await renderizarMeses(anoAtual);

    } catch (error) {
        alert('Erro ao mudar ano: ' + error.message);
    }
}

async function criarAnoSimples(ano) {
    try {
        if (dadosFinanceiros[ano]) {
            alert(`O ano ${ano} já existe!`);
            return;
        }
        
        dadosFinanceiros[ano] = { meses: [] };
        
        for (let i = 0; i < 12; i++) {
            dadosFinanceiros[ano].meses[i] = {
                receitas: [],
                despesas: [],
                fechado: false,
                saldoAnterior: 0,
                saldoFinal: 0
            };
        }
        
        await salvarDados();
        
        anoAtual = ano;
        window.anoAtual = anoAtual;
        atualizarElemento('ano-atual', anoAtual);
        
        await carregarDadosDashboard(anoAtual);
        atualizarResumoAnual(anoAtual);
        await renderizarMeses(anoAtual);

        alert(`Ano ${ano} criado com sucesso!`);
        
    } catch (error) {
        alert('Erro ao criar ano: ' + error.message);
    }
}

async function criarNovoAno(e) {
    e.preventDefault();
    
    try {
        const ano = parseInt(obterValorElemento('ano'));
        
        if (isNaN(ano) || ano < 2020 || ano > 2050) {
            alert('Por favor, informe um ano válido entre 2020 e 2050.');
            return;
        }
        
        await criarAnoSimples(ano);
        fecharModal('modal-novo-ano');
        
    } catch (error) {
        alert('Erro ao criar novo ano: ' + error.message);
    }
}

async function excluirAno(ano) {
    try {
        if (!dadosFinanceiros[ano]) {
            alert(`O ano ${ano} não existe!`);
            return;
        }

        if (!confirm(`Tem certeza que deseja excluir todos os dados do ano ${ano}?\n\nEsta ação não pode ser desfeita!`)) {
            return;
        }
        
        if (!confirm(`CONFIRMAÇÃO FINAL: Excluir definitivamente o ano ${ano}?`)) {
            return;
        }

        delete dadosFinanceiros[ano];
        await salvarDados();
        
        if (ano === anoAtual) {
            anoAtual = new Date().getFullYear();
            window.anoAtual = anoAtual;
            atualizarElemento('ano-atual', anoAtual);
            
            if (!dadosFinanceiros[anoAtual]) {
                abrirModalNovoAno();
            } else {
                await carregarDadosDashboard(anoAtual);
                atualizarResumoAnual(anoAtual);
                await renderizarMeses(anoAtual);
            }
        } else {
            await carregarDadosDashboard(anoAtual);
            atualizarResumoAnual(anoAtual);
            await renderizarMeses(anoAtual);
        }
        
        alert(`O ano ${ano} foi excluído com sucesso!`);
        
    } catch (error) {
        alert('Erro ao excluir ano: ' + error.message);
    }
}

function abrirModalNovoAno() {
    const inputAno = document.getElementById('ano');
    if (inputAno) {
        inputAno.value = anoAtual;
    }
    abrirModal('modal-novo-ano');
}

// ================================================================
// RENDERIZAÇÃO DE MESES
// ================================================================

async function renderizarMeses(ano) {
    try {
        // ✅ Recarregar dados da API para garantir sincronização
        if (window.usuarioDataManager && typeof window.usuarioDataManager.getDadosFinanceirosUsuario === 'function') {
            const dadosAtualizados = await window.usuarioDataManager.getDadosFinanceirosUsuario();
            if (dadosAtualizados && Object.keys(dadosAtualizados).length > 0) {
                window.dadosFinanceiros = dadosAtualizados;
                dadosFinanceiros = dadosAtualizados;
            }
        }

        const mesesContainer = document.querySelector('.meses-container');
        if (!mesesContainer) {
            return;
        }

        mesesContainer.innerHTML = '';

        for (let i = 0; i < 12; i++) {
            const mesCard = criarCardMes(i, ano);
            mesesContainer.appendChild(mesCard);
        }

    } catch (error) {
        // Falha silenciosa
    }
}

function criarCardMes(mes, ano) {
    const mesCard = document.createElement('div');
    mesCard.className = 'mes-card';
    mesCard.dataset.mes = mes;
    mesCard.dataset.ano = ano;
    
    const saldo = calcularSaldoMes(mes, ano);
    const dadosMes = dadosFinanceiros[ano]?.meses[mes];
    const fechado = dadosMes?.fechado || false;
    const temTransacoes = (saldo.receitas > 0 || saldo.despesas > 0);
    
    if (fechado) {
        mesCard.classList.add('mes-fechado');
    } else if (temTransacoes) {
        mesCard.classList.add('mes-ativo');
    } else {
        mesCard.classList.add('mes-vazio');
    }
    
    preencherConteudoMes(mesCard, mes, ano, saldo, fechado, temTransacoes);
    
    mesCard.addEventListener('click', () => abrirDetalhesDoMes(mes, ano));
    
    return mesCard;
}

function preencherConteudoMes(mesCard, mes, ano, saldo, fechado, temTransacoes) {
    const template = document.getElementById('template-mes-card');
    if (!template) {
        mesCard.innerHTML = `<p>Erro: Template não encontrado</p>`;
        return;
    }
    
    const clone = template.content.cloneNode(true);
    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                       'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    clone.querySelector('.mes-nome').textContent = nomesMeses[mes];
    
    const saldoAnteriorDiv = clone.querySelector('.mes-saldo-anterior');
    if (saldo.saldoAnterior !== 0 && temSaldoAnteriorValido(mes, ano)) {
        saldoAnteriorDiv.classList.remove('hidden');
        const valorAnterior = clone.querySelector('.valor-anterior');
        valorAnterior.textContent = formatarMoeda(saldo.saldoAnterior);
        valorAnterior.className = `valor-anterior ${saldo.saldoAnterior >= 0 ? 'positivo' : 'negativo'}`;
    }
    
    clone.querySelector('.mes-receita').textContent = formatarMoeda(saldo.receitas);
    clone.querySelector('.mes-despesa').textContent = formatarMoeda(saldo.despesas);
    
    const saldoValor = clone.querySelector('.mes-saldo-valor');
    const saldoContainer = clone.querySelector('.mes-saldo');
    
    if (fechado || ehUltimoMesProcessado(mes, ano)) {
        saldoValor.textContent = formatarMoeda(saldo.saldoFinal);
        saldoValor.className = `mes-saldo-valor ${saldo.saldoFinal >= 0 ? 'mes-saldo-positivo' : 'mes-saldo-negativo'}`;
        saldoContainer.style.display = 'block';
    } else {
        saldoContainer.style.display = 'none';
    }
    
    const btnReabrir = clone.querySelector('.btn-reabrir');
    const btnFechar = clone.querySelector('.btn-fechar');
    const btnDetalhes = clone.querySelector('.btn-detalhes');
    
    if (fechado) {
        btnReabrir.classList.remove('hidden');
        btnReabrir.onclick = (e) => {
            e.stopPropagation();
            reabrirMes(mes, ano);
        };
    } else {
        btnFechar.classList.remove('hidden');
        btnFechar.onclick = (e) => {
            e.stopPropagation();
            fecharMes(mes, ano);
        };
    }
    
    btnDetalhes.onclick = (e) => {
        e.stopPropagation();
        abrirDetalhesDoMes(mes, ano);
    };
    
    mesCard.appendChild(clone);
}

function temSaldoAnteriorValido(mes, ano) {
    let mesAnterior = mes - 1;
    let anoAnterior = ano;
    
    if (mes === 0) {
        mesAnterior = 11;
        anoAnterior = ano - 1;
    }
    
    if (!dadosFinanceiros[anoAnterior] || !dadosFinanceiros[anoAnterior].meses) {
        return false;
    }
    
    const dadosMesAnterior = dadosFinanceiros[anoAnterior].meses[mesAnterior];
    return dadosMesAnterior && dadosMesAnterior.fechado === true;
}

function ehUltimoMesProcessado(mes, ano) {
    for (let i = 11; i >= 0; i--) {
        const dadosMes = dadosFinanceiros[ano]?.meses[i];
        if (dadosMes && ((dadosMes.receitas && dadosMes.receitas.length > 0) || 
                        (dadosMes.despesas && dadosMes.despesas.length > 0))) {
            return i === mes;
        }
    }
    return false;
}

// ================================================================
// DETALHES DO MÊS
// ================================================================

function abrirDetalhesDoMes(mes, ano) {
    try {
        mesAberto = mes;
        anoAberto = ano;
        
        window.mesAberto = mesAberto;
        window.anoAberto = anoAberto;
        
        const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                           'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        
        atualizarElemento('detalhes-mes-titulo', `${nomesMeses[mes]} de ${ano}`);
        
        renderizarDetalhesDoMes(mes, ano);
        ativarPrimeiraAba();
        configurarBotoesModal();
        
        setTimeout(() => {
            if (typeof window.criarFiltrosCategorias === 'function') {
                window.criarFiltrosCategorias(mes, ano);
            }
            if (typeof window.criarFiltrosFormaPagamento === 'function') {
                window.criarFiltrosFormaPagamento(mes, ano);
            }
            if (typeof window.criarFiltrosStatus === 'function') {
                window.criarFiltrosStatus();
            }
        }, 100);
        
        abrirModal('modal-detalhes-mes');
        
    } catch (error) {
        alert('Erro ao abrir detalhes do mês: ' + error.message);
    }
}


function navegarMesModal(direcao) {
    // Garantir que mesAberto e anoAberto existem
    if (mesAberto === null || anoAberto === null) {
        return;
    }
    
    let novoMes = mesAberto + direcao;
    let novoAno = anoAberto;
    
    // Ajustar ano se necessário
    if (novoMes < 0) {
        novoMes = 11;
        novoAno--;
    } else if (novoMes > 11) {
        novoMes = 0;
        novoAno++;
    }
    
    // Verificar se o ano existe
    if (!dadosFinanceiros[novoAno]) {
        alert(`O ano ${novoAno} não está disponível.`);
        return;
    }
    
    // Reabrir o modal com o novo mês
    abrirDetalhesDoMes(novoMes, novoAno);
}

function atualizarBotoesNavegacaoMes(mes, ano) {
    const btnAnterior = document.getElementById('btn-mes-anterior');
    const btnProximo = document.getElementById('btn-mes-proximo');
    
    if (!btnAnterior || !btnProximo) return;
    
    // Verificar mês anterior
    let mesAnterior = mes - 1;
    let anoAnterior = ano;
    if (mesAnterior < 0) {
        mesAnterior = 11;
        anoAnterior--;
    }
    
    // Verificar próximo mês
    let mesProximo = mes + 1;
    let anoProximo = ano;
    if (mesProximo > 11) {
        mesProximo = 0;
        anoProximo++;
    }
    
    // Ativar/desativar botões
    btnAnterior.disabled = !dadosFinanceiros[anoAnterior];
    btnProximo.disabled = !dadosFinanceiros[anoProximo];
}

// ================================================================
// FUNÇÕES DE API - CENTRALIZAÇÃO
// ================================================================

function getToken() {
    return sessionStorage.getItem('token');
}

async function buscarReceitasAPI(mes, ano) {
    try {
        const response = await fetch(`${API_URL}/receitas?mes=${mes}&ano=${ano}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro ao buscar receitas');
        }

        // Converter formato da API para formato do frontend
        return data.data.map(r => ({
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

    } catch (error) {
        return [];
    }
}

async function buscarDespesasAPI(mes, ano) {
    try {
        const response = await fetch(`${API_URL}/despesas?mes=${mes}&ano=${ano}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro ao buscar despesas');
        }

        // Converter formato da API para formato do frontend
        return data.data.map(d => ({
            id: d.id,
            descricao: d.descricao,
            categoria: d.categoria_nome || 'Outros',
            formaPagamento: d.forma_pagamento,
            numeroCartao: d.cartao_id,
            valor: parseFloat(d.valor),
            dataVencimento: d.data_vencimento,
            dataCompra: d.data_compra,
            dataPagamento: d.data_pagamento,
            mes: d.mes,
            ano: d.ano,
            parcelado: d.parcelado,
            totalParcelas: d.numero_parcelas,
            parcelaAtual: d.parcela_atual,
            parcela: d.parcelado ? `${d.parcela_atual}/${d.numero_parcelas}` : null,
            pago: d.pago,
            quitado: d.pago,
            observacoes: d.observacoes,
            anexos: [],
            status: d.pago ? 'quitada' : (new Date(d.data_vencimento) < new Date() ? 'atrasada' : 'em_dia')
        }));

    } catch (error) {
        return [];
    }
}

// ================================================================
// RENDERIZAÇÃO DE DETALHES DO MÊS
// ================================================================

async function renderizarDetalhesDoMes(mes, ano) {
    try {
        // ✅ Recarregar dados da API para garantir sincronização
        if (window.usuarioDataManager && typeof window.usuarioDataManager.getDadosFinanceirosUsuario === 'function') {
            const dadosAtualizados = await window.usuarioDataManager.getDadosFinanceirosUsuario();
            if (dadosAtualizados && Object.keys(dadosAtualizados).length > 0) {
                window.dadosFinanceiros = dadosAtualizados;
                dadosFinanceiros = dadosAtualizados;
            }
        }

        // Garantir que temos a estrutura de dados
        garantirEstruturaDados(ano, mes);

        const fechado = dadosFinanceiros[ano]?.meses[mes]?.fechado || false;

        // Buscar dados do dadosFinanceiros que já está em memória (sincronizado via usuarioDados.js)
        const receitas = dadosFinanceiros[ano]?.meses[mes]?.receitas || [];
        const despesas = dadosFinanceiros[ano]?.meses[mes]?.despesas || [];

        const saldo = calcularSaldoMes(mes, ano);
        const totalJuros = typeof window.calcularTotalJuros === 'function' ?
                          window.calcularTotalJuros(despesas || []) : 0;

        atualizarResumoDetalhes(saldo, totalJuros);
        atualizarBarrasCartoes(mes, ano);
        atualizarTituloDetalhes(mes, ano, fechado);
        atualizarControlesFechamento(mes, ano, fechado);

        if (typeof window.renderizarReceitas === 'function') {
            window.renderizarReceitas(receitas, fechado);
        }

        if (typeof window.atualizarCardReservasIntegrado === 'function') {
            window.atualizarCardReservasIntegrado();
        }

        if (typeof window.renderizarDespesas === 'function') {
            window.renderizarDespesas(despesas, mes, ano, fechado);
        }

        if (typeof window.atualizarContadoresFiltro === 'function') {
            window.atualizarContadoresFiltro();
        }

    } catch (error) {
        alert('Erro ao carregar dados do mês');
    }
}

function obterDadosMes(ano, mes) {
    return (dadosFinanceiros[ano] && dadosFinanceiros[ano].meses[mes]) ||
           { receitas: [], despesas: [], fechado: false };
}

function atualizarTituloDetalhes(mes, ano, fechado) {
    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                       'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const titulo = document.getElementById('detalhes-mes-titulo');
    if (titulo) {
        const status = fechado ? ' (Fechado)' : '';
        titulo.textContent = `${nomesMeses[mes]} de ${ano}${status}`;
    }
}

function atualizarControlesFechamento(mes, ano, fechado) {
    const btnFechar = document.getElementById('btn-fechar-mes');
    const btnReabrir = document.getElementById('btn-reabrir-mes');
    const statusMes = document.getElementById('status-mes-atual');
    
    if (fechado) {
        if (btnFechar) btnFechar.classList.add('hidden');
        if (btnReabrir) btnReabrir.classList.remove('hidden');
        if (statusMes) statusMes.textContent = 'Mês Fechado';
    } else {
        if (btnFechar) btnFechar.classList.remove('hidden');
        if (btnReabrir) btnReabrir.classList.add('hidden');
        if (statusMes) statusMes.textContent = 'Mês Aberto';
    }
}

function atualizarResumoDetalhes(saldo, totalJuros) {
    atualizarElemento('resumo-receitas', formatarMoeda(saldo.receitas));
    atualizarElemento('resumo-despesas', formatarMoeda(saldo.despesas));
    atualizarElemento('resumo-juros', formatarMoeda(totalJuros));
    
    const saldoElement = document.getElementById('resumo-saldo');
    if (saldoElement) {
        saldoElement.textContent = formatarMoeda(saldo.saldoFinal);
        saldoElement.className = saldo.saldoFinal >= 0 ? 'saldo-positivo' : 'saldo-negativo';
    }
}

function ativarPrimeiraAba() {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    const primeiraAba = document.querySelector('.tab-btn[data-tab="tab-resumo"]');
    const primeiroConteudo = document.getElementById('tab-resumo');
    
    if (primeiraAba) primeiraAba.classList.add('active');
    if (primeiroConteudo) primeiroConteudo.classList.add('active');
}

function configurarBotoesModal() {
    configurarBotao('btn-nova-receita', () => {
        if (typeof window.abrirModalNovaReceita === 'function') {
            window.abrirModalNovaReceita();
        }
    });
    
    configurarBotao('btn-nova-despesa', () => {
        if (typeof window.abrirModalNovaDespesa === 'function') {
            window.abrirModalNovaDespesa();
        }
    });
    
    const checkboxTodasDespesas = document.getElementById('pagar-despesas-em-lote');
    if (checkboxTodasDespesas) {
        checkboxTodasDespesas.addEventListener('change', function() {
            const btnPagarEmLote = document.getElementById('btn-pagar-em-lote');
            if (btnPagarEmLote) {
                btnPagarEmLote.disabled = !this.checked;
            }
            
            const checkboxes = document.querySelectorAll('.despesa-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = this.checked;
            });
        });
    }
    
    configurarBotao('btn-pagar-em-lote', () => {
        if (typeof window.pagarDespesasEmLote === 'function') {
            window.pagarDespesasEmLote();
        }
    });
    
    configurarBotao('btn-limpar-filtros', () => {
        if (typeof window.limparFiltros === 'function') {
            window.limparFiltros();
        }
    });
    
       configurarBotao('btn-mes-anterior', () => navegarMesModal(-1));
    configurarBotao('btn-mes-proximo', () => navegarMesModal(1));
    
    // Atualizar estado dos botões
    atualizarBotoesNavegacaoMes(mesAberto, anoAberto);
}






function configurarBotao(id, callback) {
    const botao = document.getElementById(id);
    if (botao && callback) {
        const novoBotao = botao.cloneNode(true);
        botao.parentNode.replaceChild(novoBotao, botao);
        
        document.getElementById(id).addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            callback();
        });
    }
}

// ================================================================
// DASHBOARD
// ================================================================

async function carregarDadosDashboard(ano) {
    try {
        // ✅ Recarregar dados da API para garantir sincronização
        if (window.usuarioDataManager && typeof window.usuarioDataManager.getDadosFinanceirosUsuario === 'function') {
            const dadosAtualizados = await window.usuarioDataManager.getDadosFinanceirosUsuario();
            if (dadosAtualizados && Object.keys(dadosAtualizados).length > 0) {
                window.dadosFinanceiros = dadosAtualizados;
                dadosFinanceiros = dadosAtualizados;
            }
        }

        carregarDadosDashboardLocal(ano);
    } catch (error) {
        carregarDadosDashboardLocal(ano);
    }
}


function carregarDadosDashboardLocal(ano) {
    if (!dadosFinanceiros[ano]) {
        atualizarElementosDashboard({ totalReceitas: 0, totalDespesas: 0, totalJuros: 0, totalEconomias: 0, saldo: 0 });
        return;
    }
    
    let totalReceitasReais = 0;
    let totalDespesas = 0;
    let totalJuros = 0;
    let totalEconomias = 0;
    let saldoFinalAno = 0;
    
    for (let mes = 0; mes < 12; mes++) {
        const dadosMes = dadosFinanceiros[ano].meses[mes] || { receitas: [], despesas: [] };
        
        const receitasReaisMes = (dadosMes.receitas || []).reduce((sum, r) => {
            if (r.saldoAnterior === true || 
                r.descricao?.includes('Saldo Anterior') ||
                r.automatica === true) {
                return sum;
            }
            return sum + (r.valor || 0);
        }, 0);
        
        totalReceitasReais += receitasReaisMes;
        
        const despesasMes = typeof window.calcularTotalDespesas === 'function' ?
                           window.calcularTotalDespesas(dadosMes.despesas) :
                           dadosMes.despesas.reduce((sum, d) => sum + (d.valor || 0), 0);
        
        totalDespesas += despesasMes;
        
        const jurosMes = typeof window.calcularTotalJuros === 'function' ?
                        window.calcularTotalJuros(dadosMes.despesas) : 0;
        
        totalJuros += jurosMes;
        
        const economiasMes = typeof window.calcularTotalEconomias === 'function' ?
                            window.calcularTotalEconomias(dadosMes.despesas) : 0;
        
        totalEconomias += economiasMes;
        
        const saldoMes = calcularSaldoMes(mes, ano);
        saldoFinalAno = saldoMes.saldoFinal;
    }
    
    atualizarElementosDashboard({
        totalReceitas: totalReceitasReais,
        totalDespesas: totalDespesas,
        totalJuros: totalJuros,
        totalEconomias: totalEconomias,
        saldo: saldoFinalAno
    });
}



function atualizarElementosDashboard(dados) {
    atualizarElemento('dashboard-total-receitas', formatarMoeda(dados.totalReceitas));
    atualizarElemento('dashboard-total-despesas', formatarMoeda(dados.totalDespesas));
    atualizarElemento('dashboard-total-juros', formatarMoeda(dados.totalJuros || 0));
    atualizarElemento('dashboard-total-economias', formatarMoeda(dados.totalEconomias || 0));
    
    const saldoElement = document.getElementById('dashboard-saldo-anual');
    if (saldoElement) {
        saldoElement.textContent = formatarMoeda(dados.saldo);
        saldoElement.className = dados.saldo >= 0 ? 'saldo-positivo' : 'saldo-negativo';
    }
}

async function atualizarResumoAnual(ano) {
    await carregarDadosDashboard(ano);
}

// ================================================================
// CÁLCULO DE SALDO DO MÊS
// ================================================================

function calcularSaldoMes(mes, ano) {
    try {
        const dadosMes = obterDadosMes(ano, mes);
        const saldoAnterior = obterSaldoAnterior(mes, ano);
        
        const receitas = (dadosMes.receitas || []).reduce((sum, r) => {
            if (r.saldoAnterior === true || 
                r.descricao?.includes('Saldo Anterior') ||
                r.automatica === true) {
                return sum;
            }
            return sum + (r.valor || 0);
        }, 0);
        
        const despesas = typeof window.calcularTotalDespesas === 'function' ?
                        window.calcularTotalDespesas(dadosMes.despesas || []) :
                        (dadosMes.despesas || []).reduce((sum, d) => sum + obterValorRealDespesa(d), 0);
        
        const reservas = (dadosMes.reservas || []).reduce((sum, r) => {
            return sum + parseFloat(r.valor || 0);
        }, 0);
        
        return {
            saldoAnterior: saldoAnterior,
            receitas: receitas,
            despesas: despesas,
            reservas: reservas,
            saldoFinal: saldoAnterior + receitas - despesas - reservas
        };
        
    } catch (error) {
        return { 
            saldoAnterior: 0, 
            receitas: 0, 
            despesas: 0, 
            reservas: 0,
            saldoFinal: 0 
        };
    }
}

function obterSaldoAnterior(mes, ano) {
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

// ================================================================
// FECHAMENTO E REABERTURA DE MÊS
// ================================================================

function abrirModalConfirmacaoFechamento(mes, ano) {
    const dadosMes = dadosFinanceiros[ano]?.meses[mes];
    if (!dadosMes || dadosMes.fechado) {
        alert('Mês já está fechado ou não existe!');
        return;
    }
    
    const saldo = calcularSaldoMes(mes, ano);
    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                       'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    let proximoMes = mes + 1;
    let proximoAno = ano;
    
    if (proximoMes > 11) {
        proximoMes = 0;
        proximoAno = ano + 1;
    }
    
    const nomeProximoMes = proximoMes === 0 ? 
        `Janeiro/${proximoAno}` : 
        `${nomesMeses[proximoMes]}/${ano}`;
    
    atualizarElemento('mensagem-fechamento', `Fechar ${nomesMeses[mes]} de ${ano}?`);
    atualizarElemento('resumo-receitas-fechamento', formatarMoeda(saldo.receitas));
    atualizarElemento('resumo-despesas-fechamento', formatarMoeda(saldo.despesas));
    atualizarElemento('resumo-saldo-fechamento', formatarMoeda(saldo.saldoFinal));
    atualizarElemento('info-transferencia', `Este saldo será transferido para ${nomeProximoMes}`);
    
    abrirModal('modal-confirmar-fechamento');
}

function abrirModalConfirmacaoReabertura(mes, ano) {
    const dadosMes = dadosFinanceiros[ano]?.meses[mes];
    if (!dadosMes || !dadosMes.fechado) {
        alert('Mês já está aberto ou não existe!');
        return;
    }
    
    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                       'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    const saldo = calcularSaldoMes(mes, ano);
    
    atualizarElemento('mensagem-reabertura', `Reabrir ${nomesMeses[mes]} de ${ano}?`);
    atualizarElemento('reabertura-receitas', formatarMoeda(saldo.receitas));
    atualizarElemento('reabertura-despesas', formatarMoeda(saldo.despesas));
    atualizarElemento('reabertura-saldo', formatarMoeda(saldo.saldoFinal));
    
    abrirModal('modal-confirmar-reabertura');
}

async function confirmarFechamento() {
    try {
        const sucesso = await fecharMes(mesAberto, anoAberto);
        
        if (sucesso) {
            fecharModal('modal-confirmar-fechamento');
            await renderizarDetalhesDoMes(mesAberto, anoAberto);

            if (typeof window.renderizarMeses === 'function') {
                await window.renderizarMeses(anoAberto);
            }
        }
    } catch (error) {
        alert('Erro ao fechar mês: ' + error.message);
    }
}

async function confirmarReabertura() {
    try {
        const sucesso = await reabrirMes(mesAberto, anoAberto);
        
        if (sucesso) {
            fecharModal('modal-confirmar-reabertura');
            await renderizarDetalhesDoMes(mesAberto, anoAberto);

            if (typeof window.renderizarMeses === 'function') {
                await window.renderizarMeses(anoAberto);
            }
        }
    } catch (error) {
        alert('Erro ao reabrir mês: ' + error.message);
    }
}

async function fecharMes(mes, ano) {
    const dadosMes = dadosFinanceiros[ano]?.meses[mes];
    if (!dadosMes || dadosMes.fechado) {
        alert('Mês já está fechado ou não existe!');
        return false;
    }
   
    const saldo = calcularSaldoMes(mes, ano);
    
    let proximoMes = mes + 1;
    let proximoAno = ano;
    
    if (proximoMes > 11) {
        proximoMes = 0;
        proximoAno = ano + 1;
    }
    
    try {
        dadosMes.fechado = true;
        dadosMes.saldoFinal = saldo.saldoFinal;
        dadosMes.dataFechamento = new Date().toISOString().split('T')[0];
        
        if (saldo.saldoFinal !== 0) {
            await criarReceitaSaldoAnterior(proximoMes, proximoAno, saldo.saldoFinal, mes, ano);
        }
        
        await salvarDados();

        if (typeof window.renderizarMeses === 'function') {
            await window.renderizarMeses(ano);
        }

        if (proximoAno !== ano && typeof window.renderizarMeses === 'function') {
            setTimeout(async () => await window.renderizarMeses(proximoAno), 100);
        }
        
        return true;

    } catch (error) {
        alert('Erro ao fechar mês: ' + error.message);
        return false;
    }
}

async function reabrirMes(mes, ano) {
    const dadosMes = dadosFinanceiros[ano]?.meses[mes];
    if (!dadosMes || !dadosMes.fechado) {
        alert('Mês já está aberto ou não existe!');
        return false;
    }
   
    let proximoMes = mes + 1;
    let proximoAno = ano;
    
    if (proximoMes > 11) {
        proximoMes = 0;
        proximoAno = ano + 1;
    }
   
    try {
        dadosMes.fechado = false;
        dadosMes.dataFechamento = null;
        dadosMes.saldoFinal = 0;
        
        await removerReceitaSaldoAnterior(proximoMes, proximoAno, mes, ano);
        
        await salvarDados();

        if (typeof window.renderizarMeses === 'function') {
            await window.renderizarMeses(ano);

            if (proximoAno !== ano) {
                setTimeout(async () => await window.renderizarMeses(proximoAno), 100);
            }
        }
        
        return true;

    } catch (error) {
        alert('Erro ao reabrir mês: ' + error.message);
        return false;
    }
}

async function criarReceitaSaldoAnterior(mes, ano, valor, mesOrigem, anoOrigem) {
    try {
        if (!dadosFinanceiros[ano]) {
            await criarAnoSimples(ano);
        }
        
        garantirEstruturaDados(ano, mes);
        
        const receitasExistentes = dadosFinanceiros[ano].meses[mes].receitas;
        const jaExisteSaldo = receitasExistentes.some(receita =>
            receita.saldoAnterior === true || receita.descricao.includes('Saldo Anterior')
        );

        if (jaExisteSaldo) {
            return;
        }
        
        const tipoDescricao = valor >= 0 ? 'Saldo Anterior (Positivo)' : 'Saldo Anterior (Negativo)';
        const primeiroDiaProximoMes = new Date(ano, mes, 1);
        
        const receitaSaldoAnterior = {
            descricao: tipoDescricao,
            valor: valor,
            data: primeiroDiaProximoMes.toISOString().split('T')[0],
            parcela: null,
            parcelado: false,
            saldoAnterior: true,
            mesOrigem: mesOrigem,
            anoOrigem: anoOrigem,
            dataTransferencia: new Date().toISOString().split('T')[0]
        };

        dadosFinanceiros[ano].meses[mes].receitas.unshift(receitaSaldoAnterior);

    } catch (error) {
        throw error;
    }
}

async function removerReceitaSaldoAnterior(mes, ano, mesOrigem, anoOrigem) {
    try {
        if (!dadosFinanceiros[ano]?.meses[mes]?.receitas) {
            return;
        }
        
        const receitas = dadosFinanceiros[ano].meses[mes].receitas;
        
        for (let i = receitas.length - 1; i >= 0; i--) {
            const receita = receitas[i];
            if (receita.saldoAnterior === true && 
                receita.mesOrigem === mesOrigem && 
                receita.anoOrigem === anoOrigem) {
                receitas.splice(i, 1);
                break;
            }
        }

    } catch (error) {
        // Erro ao remover receita de saldo anterior - silencioso
    }
}

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
    try {
        const dadosMes = dadosFinanceiros[ano]?.meses[mes];
        if (!dadosMes || dadosMes.fechado) return false;
        
        const saldo = calcularSaldoMes(mes, ano);
        
        let proximoMes = mes + 1;
        let proximoAno = ano;
        
        if (proximoMes > 11) {
            proximoMes = 0;
            proximoAno = ano + 1;
        }
        
        dadosMes.fechado = true;
        dadosMes.saldoFinal = saldo.saldoFinal;
        dadosMes.dataFechamento = new Date().toISOString().split('T')[0];
        dadosMes.fechadoAutomaticamente = true;
        
        if (saldo.saldoFinal !== 0) {
            await criarReceitaSaldoAnterior(proximoMes, proximoAno, saldo.saldoFinal, mes, ano);
        }
        
        await salvarDados();

        if (typeof window.renderizarMeses === 'function') {
            await window.renderizarMeses(ano);
        }

        return true;
        
    } catch (error) {
        return false;
    }
}

// ================================================================
// NOTIFICAÇÃO PARA MÓDULOS
// ================================================================

function notificarSistemaReady() {
    const evento = new CustomEvent('sistemaFinanceiroReady', {
        detail: {
            sistemaInicializado: sistemaInicializado,
            dadosCarregados: !!dadosFinanceiros,
            modoLocal: true
        }
    });
    
    window.dispatchEvent(evento);
}

// ================================================================
// FUNÇÕES UTILITÁRIAS
// ================================================================

function garantirEstruturaDados(ano, mes) {
    if (!dadosFinanceiros[ano]) {
        dadosFinanceiros[ano] = { meses: [] };
    }
    
    if (!dadosFinanceiros[ano].meses[mes]) {
        dadosFinanceiros[ano].meses[mes] = { 
            receitas: [], 
            despesas: [],
            fechado: false,
            saldoAnterior: 0,
            saldoFinal: 0
        };
    }
}

function formatarMoeda(valor) {
    try {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(valor || 0);
    } catch (error) {
        return `R$ ${(valor || 0).toFixed(2)}`;
    }
}

function formatarData(dataString) {
    try {
        const data = new Date(dataString);
        return data.toLocaleDateString('pt-BR');
    } catch (error) {
        return 'Data inválida';
    }
}

function gerarId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${timestamp}-${random}`;
}

function atualizarElemento(id, valor) {
    const elemento = document.getElementById(id);
    if (elemento) {
        elemento.textContent = valor;
    }
}

function obterValorElemento(id) {
    const elemento = document.getElementById(id);
    return elemento ? elemento.value : '';
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
    }
}

function exibirNomeUsuario() {
    try {
        const dadosUsuario = sessionStorage.getItem('dadosUsuarioLogado');
        const token = sessionStorage.getItem('token');

        if (dadosUsuario) {
            const usuario = JSON.parse(dadosUsuario);
            const primeiroNome = usuario.nome?.split(' ')[0] || 'Usuário';
            const tipoUsuario = usuario.tipo || 'padrao';

            // Traduzir tipo de usuário
            const tipoTexto = {
                'master': 'Master',
                'admin': 'Admin',
                'padrao': 'Padrão'
            }[tipoUsuario] || 'Padrão';

            // Preencher sidebar
            const nomeSidebar = document.getElementById('nome-usuario-sidebar');
            if (nomeSidebar) {
                nomeSidebar.textContent = `${primeiroNome} (${tipoTexto})`;
            }
        }
    } catch (error) {
        // Erro ao exibir nome do usuário - silencioso
    }
}

function fecharModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

function obterValorRealDespesa(despesa) {
    if ((despesa.quitado || despesa.status === 'quitada') && 
        despesa.valorPago !== null && 
        despesa.valorPago !== undefined) {
        return parseFloat(despesa.valorPago);
    }
    
    return parseFloat(despesa.valor) || 0;
}




// ================================================================
// ADICIONAR NO FINAL DO main.js - FUNÇÕES PARA CARTÕES
// ================================================================

window.calcularUsoCartoes = function(mes, ano) {
    const usoCartoes = { cartao1: 0, cartao2: 0, cartao3: 0 };
    
    const anoInicio = Math.min(...Object.keys(dadosFinanceiros).map(Number));
    const anoFim = ano + 3;
    
    for (let anoAtual = anoInicio; anoAtual <= anoFim; anoAtual++) {
        if (!dadosFinanceiros[anoAtual]) continue;
        
        for (let mesAtual = 0; mesAtual < 12; mesAtual++) {
            const dadosMes = dadosFinanceiros[anoAtual]?.meses[mesAtual];
            if (!dadosMes || !dadosMes.despesas) continue;
            
            dadosMes.despesas.forEach(despesa => {
                // Pular despesas transferidas
                if (despesa.transferidaParaProximoMes) return;
                
                // Contar APENAS crédito com número de cartão definido, NÃO quitadas e NÃO recorrentes
                if (despesa.formaPagamento === 'credito' && 
                    despesa.numeroCartao && 
                    !despesa.quitado &&
                    !despesa.recorrente) {
                    
                    const chaveCartao = `cartao${despesa.numeroCartao}`;
                    if (usoCartoes[chaveCartao] !== undefined) {
                        const valorDespesa = obterValorRealDespesa(despesa);
                        usoCartoes[chaveCartao] += valorDespesa;
                    }
                }
            });
        }
    }
    
    return usoCartoes;
};



// Função para atualizar as barras de progresso dos cartões
function atualizarBarrasCartoes(mes, ano) {
    const usoCartoes = calcularUsoCartoes(mes, ano);
    const cartoes = window.cartoesUsuario || {};
    
    let temCartaoAtivo = false;
    
    ['1', '2', '3'].forEach(num => {
        const cartao = cartoes[`cartao${num}`];
        const uso = usoCartoes[`cartao${num}`] || 0;
        
        const barraContainer = document.getElementById(`cartao${num}-barra`);
        const nomeDisplay = document.getElementById(`cartao${num}-nome-display`);
        const valorUsado = document.getElementById(`cartao${num}-valor-usado`);
        const valorLimite = document.getElementById(`cartao${num}-valor-limite`);
        const barraPreenchida = document.getElementById(`cartao${num}-barra-preenchida`);
        const percentual = document.getElementById(`cartao${num}-percentual`);
        const disponivel = document.getElementById(`cartao${num}-disponivel`);
        const status = document.getElementById(`cartao${num}-status`);
        
        if (cartao && cartao.ativo && cartao.nome && cartao.nome.trim() !== '') {
            temCartaoAtivo = true;
            
            if (barraContainer) barraContainer.style.display = 'block';
            if (nomeDisplay) nomeDisplay.textContent = cartao.nome || `Cartão ${num}`;
            if (valorUsado) valorUsado.textContent = formatarMoeda(uso);
            if (valorLimite) valorLimite.textContent = formatarMoeda(cartao.limite);
            if (status) status.textContent = 'Ativo';
            
            const percentualUso = cartao.limite > 0 ? (uso / cartao.limite) * 100 : 0;
            const disponibilidade = Math.max(0, cartao.limite - uso);
            
            if (barraPreenchida) {
                barraPreenchida.style.width = `${Math.min(percentualUso, 100)}%`;
                barraPreenchida.className = 'barra-preenchida';
                
                if (percentualUso > 90) {
                    barraPreenchida.classList.add('limite-critico');
                } else if (percentualUso > 70) {
                    barraPreenchida.classList.add('limite-alto');
                } else {
                    barraPreenchida.classList.add('limite-normal');
                }
            }
            
            if (percentual) percentual.textContent = `${percentualUso.toFixed(1)}% usado`;
            if (disponivel) disponivel.textContent = `Disponível: ${formatarMoeda(disponibilidade)}`;
        } else {
            if (barraContainer) barraContainer.style.display = 'none';
        }
    });
    
    const containerPrincipal = document.getElementById('limites-cartoes-container');
    if (containerPrincipal) {
        if (temCartaoAtivo) {
            containerPrincipal.style.display = 'block';
        } else {
            containerPrincipal.style.display = 'none';
        }
    }
}

// Exportar as funções globalmente
window.atualizarBarrasCartoes = atualizarBarrasCartoes;
window.navegarMesModal = navegarMesModal;
window.atualizarBotoesNavegacaoMes = atualizarBotoesNavegacaoMes;

// Exportar sistema de toast globalmente
window.mostrarToast = mostrarToast;
window.fecharToast = fecharToast;
window.mostrarNotificacao = mostrarNotificacao;

// ================================================================
// EVENT LISTENERS NATIVOS - SUBSTITUINDO ONCLICK INLINE
// ================================================================
function configurarEventListeners() {
    // Fechar modais com X
    document.querySelectorAll('.close[data-modal]').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            const modalId = this.getAttribute('data-modal');
            fecharModal(modalId);
        });
    });

    // Botões de excluir receita
    const btnExcluirAtual = document.getElementById('btn-excluir-atual');
    const btnExcluirTodas = document.getElementById('btn-excluir-todas');

    if (btnExcluirAtual) {
        btnExcluirAtual.addEventListener('click', excluirAtual);
    }

    if (btnExcluirTodas) {
        btnExcluirTodas.addEventListener('click', excluirTodas);
    }

    // Botões de nova despesa (podem existir múltiplos)
    document.querySelectorAll('#btn-nova-despesa').forEach(btn => {
        btn.addEventListener('click', abrirModalNovaDespesa);
    });

    // Botão pagar em lote
    const btnPagarLote = document.getElementById('btn-pagar-em-lote');
    if (btnPagarLote) {
        btnPagarLote.addEventListener('click', pagarDespesasEmLote);
    }

    // Botão fechar mês (delegação de evento - criado dinamicamente)
    document.addEventListener('click', function(e) {
        if (e.target && e.target.id === 'btn-fechar-mes') {
            handleFecharMes();
        }
        if (e.target && e.target.id === 'btn-reabrir-mes') {
            handleReabrirMes();
        }
    });

    // Botão limpar filtros
    const btnLimparFiltros = document.getElementById('btn-limpar-filtros');
    if (btnLimparFiltros) {
        btnLimparFiltros.addEventListener('click', limparFiltros);
    }
}



const calendarioFinanceiro = {
    // Datas de 2026
   "2026-01-01": "Início do ano fiscal em muitos países. Planejamento orçamentário é essencial para governos, empresas e famílias.",

    "2026-01-03": "O que são Bancos Centrais? Instituições responsáveis por controlar a inflação e os juros de uma economia.",

    "2026-02-01": "Inflação: quando os preços sobem de forma contínua, o poder de compra da população diminui.",

    "2026-02-15": "Juros altos combatem a inflação, mas podem desacelerar a economia. Juros baixos estimulam o consumo.",

    "2026-03-01": "O que é o PIB? Ele mede a soma de todas as riquezas produzidas por um país em determinado período.",

    "2026-03-15": "Câmbio: a valorização ou desvalorização da moeda afeta importações, exportações e viagens internacionais.",

    "2026-04-01": "Globalização econômica conecta países, mas também transmite crises financeiras rapidamente.",

    "2026-05-01": "Trabalho e economia: emprego formal aumenta renda, consumo e arrecadação de impostos.",

    "2026-06-01": "Crises econômicas ensinam a importância de reservas financeiras e políticas fiscais responsáveis.",

    "2026-07-01": "Dívida pública: governos se endividam para investir, mas precisam manter sustentabilidade fiscal.",

    "2026-08-01": "Mercado financeiro canaliza recursos para investimentos produtivos e crescimento econômico.",

    "2026-09-01": "Política monetária influencia crédito, consumo e investimentos no curto e médio prazo.",

    "2026-10-01": "Educação financeira ajuda famílias a evitar endividamento excessivo e planejar o futuro.",

    "2026-11-01": "Comércio internacional permite ganhos de escala, mas depende de estabilidade cambial.",

    "2026-12-01": "Crescimento econômico sustentável equilibra desenvolvimento, inclusão social e meio ambiente.",
     
    "2026-01-05": "O orçamento público define como o governo arrecada e gasta recursos ao longo do ano.",

    "2026-02-05": "O IPCA mede a inflação oficial do Brasil e impacta salários, benefícios e contratos.",

    "2026-03-05": "A Taxa Selic influencia empréstimos, financiamentos e aplicações financeiras.",

    "2026-04-05": "Impostos financiam serviços públicos como saúde, educação e infraestrutura.",

    "2026-05-05": "Empreendedorismo impulsiona inovação, geração de empregos e crescimento econômico.",

    "2026-06-05": "O sistema bancário conecta poupadores e tomadores de crédito.",

    "2026-07-05": "Déficit e superávit fiscal indicam se o governo gasta mais ou menos do que arrecada.",

    "2026-08-05": "Exportações fortalecem a economia ao gerar divisas e empregos.",

    "2026-09-05": "A indústria transforma matérias-primas em produtos de maior valor agregado.",

    "2026-10-05": "Programas sociais movimentam a economia local e reduzem desigualdades.",

    "2026-11-05": "Consumo consciente ajuda no equilíbrio financeiro das famílias.",

    "2026-12-05": "Planejamento financeiro anual prepara famílias e empresas para o próximo ciclo econômico."
};

function verificarMensagens() {
    // Pega a data local respeitando o fuso horário do usuário
    const data = new Date();
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    const hoje = `${ano}-${mes}-${dia}`;

    const banner = document.getElementById('banner-financeiro');
    const displayMensagem = document.getElementById('mensagem-dia');

    if (calendarioFinanceiro[hoje]) {
        displayMensagem.innerText = calendarioFinanceiro[hoje];
        banner.style.display = 'flex';
    } else {
        banner.style.display = 'none';
    }
}
// Event listener para fechar o banner
function fecharBanner() {
    const banner = document.getElementById('banner-financeiro');
    banner.style.display = 'none';
}

// Inicia a verificação assim que a página carregar
document.addEventListener("DOMContentLoaded", () => {
    verificarMensagens();

    const btnFechar = document.getElementById('btn-fechar-banner');
    if (btnFechar) {
        btnFechar.addEventListener('click', fecharBanner);
    }
});


// --- CONFIGURAÇÃO NEWSDATA.IO ---
const NEWSDATA_API_KEY = 'pub_5cfccab63ba54e729b804382b4f3d0cb'; 
let noticiasAtivas = false;

/**
 * Busca notícias reais do Brasil via NewsData.io
 */
async function buscarNoticiasAPI() {
    // Configurado para: Notícias do Brasil, Idioma Português, Categoria Top (Principais)
    const url = `https://newsdata.io/api/1/news?apikey=${NEWSDATA_API_KEY}&country=br&language=pt&category=top`;

    try {
        const response = await fetch(url);
        const dados = await response.json();

        // NewsData retorna "success" no campo status
        if (dados.status === "success" && dados.results && dados.results.length > 0) {
            // Mapeia os títulos e une com um separador elegante
            return dados.results.map(n => n.title).join('  •  ');
        }
        
        return "Buscando novas atualizações no Brasil...";

    } catch (erro) {
        console.error("Erro na conexão NewsData:", erro);
        return "Conectando ao servidor de notícias mundiais...";
    }
}

/**
 * Função de Toggle para o Letreiro (Marquee)
 */
async function toggleNoticias() {
    const marquee = document.getElementById('marquee-noticias');
    const conteudo = document.getElementById('conteudo-noticias');
    
    if (!marquee || !conteudo) return;

    noticiasAtivas = !noticiasAtivas;

    if (noticiasAtivas) {
        // Limpa e mostra o carregamento
        conteudo.innerHTML = "<span>Carregando manchetes reais...</span>";
        marquee.style.display = 'block';

        // Busca os dados da API
        const textoFinal = await buscarNoticiasAPI();
        
        // Injeta o texto final dentro de um span (importante para o CSS de animação)
        conteudo.innerHTML = `<span>${textoFinal}</span>`;
    } else {
        marquee.style.display = 'none';
        conteudo.innerHTML = ""; // Limpa ao fechar para evitar sobreposição
    }
}

// Vincula o clique ao carregar a página
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById('btn-toggle-noticias');
    if (btn) {
        btn.onclick = toggleNoticias;
    }
});







function iniciarAtualizacaoCotacoes() {
    const elemento = document.getElementById('cotacoes');
    if (!elemento) return; // Segurança caso o elemento não exista na página

    const INTERVALO_ATUALIZACAO = 300000; // 5 minutos

    async function carregarCotacoesEmReal() {
        try {
            // Adicionado cabeçalho para evitar problemas de CORS e Cache
            const pares = 'USD-BRL,EUR-BRL,GBP-BRL,JPY-BRL';
            const response = await fetch(
                `https://economia.awesomeapi.com.br/json/last/${pares}`,
                { cache: 'no-store' }
            );

            if (!response.ok) throw new Error('Falha na rede');
            
            const dados = await response.json();

            const formatarMoeda = (codigo, valor) =>
                `<strong>${codigo}</strong> R$ ${parseFloat(valor).toFixed(2)}`;

            const cotacoes = [];

            // A API retorna as chaves sem o hífen (USDBRL)
            if (dados.USDBRL) cotacoes.push(formatarMoeda('USD', dados.USDBRL.bid));
            if (dados.EURBRL) cotacoes.push(formatarMoeda('EUR', dados.EURBRL.bid));
            if (dados.GBPBRL) cotacoes.push(formatarMoeda('GBP', dados.GBPBRL.bid));
            if (dados.JPYBRL) cotacoes.push(formatarMoeda('JPY', dados.JPYBRL.bid));

            // Usamos innerHTML para aceitar as tags <strong> caso queira destacar o código
            elemento.innerHTML = cotacoes.join(' <span style="margin: 0 8px; color: #ccc;">|</span> ');

            // Atualiza o title do container pai para acessibilidade
            if (elemento.parentElement) {
                elemento.parentElement.title = 'Cotações atualizadas em: ' + new Date().toLocaleTimeString();
            }

        } catch (erro) {
            elemento.innerText = 'Câmbio indisponível';
            console.error('Erro ao atualizar cotações:', erro);
        }
    }

    // Executa a primeira carga imediatamente
    carregarCotacoesEmReal();

    // Inicia o intervalo de atualização
    setInterval(carregarCotacoesEmReal, INTERVALO_ATUALIZACAO);
}

// IMPORTANTE: Chame a função para ela começar a rodar!
document.addEventListener('DOMContentLoaded', iniciarAtualizacaoCotacoes);

// Executar quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', configurarEventListeners);