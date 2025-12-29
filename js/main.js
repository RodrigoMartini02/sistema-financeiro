// ================================================================
// SISTEMA PRINCIPAL - MAIN.JS OTIMIZADO
// ================================================================
// Se o sistema estiver rodando no Render, use a URL do Render. 
// Caso contrário, use o localhost (para quando você estiver testando no PC).
// Define onde o servidor está (Render ou Local)
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
        console.error("Erro na conexão:", erro);
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
    await carregarDadosAPI();
    
    sistemaInicializado = true;
    window.sistemaInicializado = true;
    
    configurarInterface();
    
    if (!dadosFinanceiros[anoAtual]) {
        abrirModalNovoAno();
    } else {
        await carregarDadosDashboard(anoAtual);
        renderizarMeses(anoAtual);
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
                    case 'transacao_salva':
                        window.SistemaNotificacoes.onTransacaoSalva(dados.tipo, dados.transacao);
                        break;
                    case 'transacao_excluida':
                        window.SistemaNotificacoes.onTransacaoExcluida(dados.tipo, dados.transacao);
                        break;
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
}

// ================================================================
// CARREGAMENTO DE DADOS
// ================================================================

async function carregarDadosAPI() {
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    
    if (!usuarioAtual) {
        dadosFinanceiros = criarEstruturaVazia();
        return;
    }

    try {
        const dadosAPI = await buscarDadosCompletosDaAPI();
        
        if (dadosAPI) {
            dadosFinanceiros = dadosAPI;
        } else {
            carregarDadosLocalstorageFallback();
        }
        
        window.dadosFinanceiros = dadosFinanceiros;
        
    } catch (error) {
        carregarDadosLocalstorageFallback();
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
                sucesso = await salvarDadosAPI();
            } catch (error) {
                sucesso = false;
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

async function salvarDadosAPI() {
    const token = getToken();
    
    if (!token) {
        return await salvarDadosLocalstorageFallback();
    }

    try {
        const sucessoLocalStorage = await salvarDadosLocalstorageFallback();
        return sucessoLocalStorage;
        
    } catch (error) {
        return await salvarDadosLocalstorageFallback();
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
        case 'meses':
            setTimeout(() => {
                renderizarMeses(anoAtual);
                atualizarResumoAnual(anoAtual);
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
        refreshBtn.addEventListener('click', async function() {
            try {
                const activeSection = document.querySelector('section.active');
                if (activeSection) {
                    const sectionId = activeSection.id;
                    switch(sectionId) {
                        case 'dashboard-section':
                            await carregarDadosDashboard(anoAtual);
                            atualizarResumoAnual(anoAtual);
                            break;
                        case 'meses-section':
                            renderizarMeses(anoAtual);
                            atualizarResumoAnual(anoAtual);
                            break;
                    }
                }
            } catch (error) {
                // Falha silenciosa
            }
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

const handleUnlockAttempt = (event) => {
    if (event) event.preventDefault();

    const passwordInput = document.getElementById('input-lock-password');
    const enteredPassword = passwordInput?.value;
    const modalContent = document.querySelector('.lock-modal-content');

    // Recupera os dados do usuário salvos no login
    const dadosUsuario = JSON.parse(sessionStorage.getItem('dadosUsuarioLogado'));
    
    // Compara a senha digitada com a senha que está na sessão do navegador
    if (enteredPassword === dadosUsuario?.senha) {
        unlockSystem(); 
        passwordInput.value = '';
    } else {
        // Efeito de erro caso a senha esteja errada
        if (modalContent) {
            modalContent.classList.add('shake-error');
            setTimeout(() => modalContent.classList.remove('shake-error'), 500);
        }
        passwordInput.value = '';
        passwordInput.focus();
    }
};

const resetInactivityTimer = () => {
    if (localStorage.getItem('sistema_bloqueado') === 'true') return;
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(lockSystem, 20 * 60 * 1000);
};

// Mantenha os event listeners e o restante como estão abaixo
lockButton.addEventListener('click', lockSystem);
lockForm.addEventListener('submit', handleUnlockAttempt);

['mousemove', 'keydown', 'scroll', 'click'].forEach(evento => {
    window.addEventListener(evento, () => {
        if (localStorage.getItem('sistema_bloqueado') !== 'true') {
            resetInactivityTimer();
        }
    });
});

if (localStorage.getItem('sistema_bloqueado') === 'true') {
    setTimeout(() => lockSystem(false), 100);
} else {
    resetInactivityTimer();
}

window.addEventListener('beforeunload', (event) => {
    if (localStorage.getItem('sistema_bloqueado') === 'true') {
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
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    if (!usuarioAtual) return null;
    
    try {
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
        renderizarMeses(anoAtual);
        
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
        renderizarMeses(anoAtual);
        
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
                renderizarMeses(anoAtual);
            }
        } else {
            await carregarDadosDashboard(anoAtual);
            atualizarResumoAnual(anoAtual);
            renderizarMeses(anoAtual);
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

function renderizarMeses(ano) {
    try {
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
        console.error('❌ mesAberto ou anoAberto não definidos!');
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





async function renderizarDetalhesDoMes(mes, ano) {
    try {
        const dadosMes = obterDadosMes(ano, mes);
        const saldo = calcularSaldoMes(mes, ano);
        const totalJuros = typeof window.calcularTotalJuros === 'function' ?
                          window.calcularTotalJuros(dadosMes.despesas || []) : 0;
        const fechado = dadosMes.fechado || false;
        
        atualizarResumoDetalhes(saldo, totalJuros);
        atualizarBarrasCartoes(mes, ano);
        atualizarTituloDetalhes(mes, ano, fechado);
        atualizarControlesFechamento(mes, ano, fechado);
        
        if (typeof window.buscarEExibirReceitas === 'function') {
    await window.buscarEExibirReceitas(mes, ano);
} else if (typeof window.renderizarReceitas === 'function') {
    window.renderizarReceitas(dadosMes.receitas, fechado, mes, ano);
}
        
        if (typeof window.renderizarDespesas === 'function') {
            window.renderizarDespesas(dadosMes.despesas, mes, ano, fechado);
        }
        
        if (typeof window.atualizarContadoresFiltro === 'function') {
            window.atualizarContadoresFiltro();
        }
        
    } catch (error) {
        // Falha silenciosa
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
            renderizarDetalhesDoMes(mesAberto, anoAberto);
            
            if (typeof window.renderizarMeses === 'function') {
                window.renderizarMeses(anoAberto);
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
            renderizarDetalhesDoMes(mesAberto, anoAberto);
            
            if (typeof window.renderizarMeses === 'function') {
                window.renderizarMeses(anoAberto);
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
            window.renderizarMeses(ano);
        }
        
        if (proximoAno !== ano && typeof window.renderizarMeses === 'function') {
            setTimeout(() => window.renderizarMeses(proximoAno), 100);
        }
        
        return true;
        
    } catch (error) {
        console.error('Erro ao fechar mês:', error);
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
            window.renderizarMeses(ano);
            
            if (proximoAno !== ano) {
                setTimeout(() => window.renderizarMeses(proximoAno), 100);
            }
        }
        
        return true;
        
    } catch (error) {
        console.error('Erro ao reabrir mês:', error);
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
            console.warn('Já existe receita de saldo anterior neste mês');
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
        
        console.log(`✅ Receita de saldo anterior criada: ${tipoDescricao} - ${formatarMoeda(valor)}`);
        
    } catch (error) {
        console.error('Erro ao criar receita de saldo anterior:', error);
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
        console.error('Erro ao remover receita de saldo anterior:', error);
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
            window.renderizarMeses(ano);
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




function getToken() {
    return sessionStorage.getItem('token');
}

function formatarReceitaDaAPI(receita) {
    return {
        id: receita.id,
        descricao: receita.descricao,
        valor: parseFloat(receita.valor),
        data: receita.data_recebimento,
        mes: receita.mes,
        ano: receita.ano,
        categoria: receita.categoria_nome || receita.categoria_id,
        observacoes: receita.observacoes,
        saldo_anterior: receita.saldo_anterior
    };
}

function formatarDespesaDaAPI(despesa) {
    return {
        id: despesa.id,
        descricao: despesa.descricao,
        categoria: despesa.categoria_nome || despesa.categoria_id,
        formaPagamento: despesa.forma_pagamento,
        numeroCartao: despesa.cartao_id,
        valor: parseFloat(despesa.valor),
        dataVencimento: despesa.data_vencimento,
        dataCompra: despesa.data_compra,
        dataPagamento: despesa.data_pagamento,
        mes: despesa.mes,
        ano: despesa.ano,
        parcelado: despesa.parcelado,
        totalParcelas: despesa.numero_parcelas,
        parcelaAtual: despesa.parcela_atual,
        pago: despesa.pago,
        quitado: despesa.pago,
        observacoes: despesa.observacoes
    };
}

async function buscarDadosCompletosDaAPI() {
    try {
        const token = getToken();
        if (!token) return null;
        
        const anoAtual = new Date().getFullYear();
        const dadosCompletos = {};
        
        for (let ano = anoAtual - 1; ano <= anoAtual + 1; ano++) {
            dadosCompletos[ano] = { meses: [] };
            
            for (let mes = 0; mes < 12; mes++) {
                const receitasResponse = await fetch(`${API_URL}/receitas?mes=${mes}&ano=${ano}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                const despesasResponse = await fetch(`${API_URL}/despesas?mes=${mes}&ano=${ano}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                let receitas = [];
                let despesas = [];
                
                if (receitasResponse.ok) {
                    const receitasData = await receitasResponse.json();
                    receitas = receitasData.data || [];
                }
                
                if (despesasResponse.ok) {
                    const despesasData = await despesasResponse.json();
                    despesas = despesasData.data || [];
                }
                
                dadosCompletos[ano].meses[mes] = {
                    receitas: receitas.map(formatarReceitaDaAPI),
                    despesas: despesas.map(formatarDespesaDaAPI),
                    fechado: false,
                    saldoAnterior: 0,
                    saldoFinal: 0
                };
            }
        }
        
        return dadosCompletos;
        
    } catch (error) {
        return null;
    }
}

function carregarDadosLocalstorageFallback() {
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    
    try {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const usuario = usuarios.find(u => 
            u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual
        );
        
        if (usuario && usuario.dadosFinanceiros) {
            dadosFinanceiros = usuario.dadosFinanceiros;
        } else {
            dadosFinanceiros = criarEstruturaVazia();
        }
        
    } catch (error) {
        dadosFinanceiros = criarEstruturaVazia();
    }
}

async function salvarDadosLocalstorageFallback() {
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



// Exportar as funções globalmente
window.atualizarBarrasCartoes = atualizarBarrasCartoes;
window.navegarMesModal = navegarMesModal;
window.atualizarBotoesNavegacaoMes = atualizarBotoesNavegacaoMes;