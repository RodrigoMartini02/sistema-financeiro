// ================================================================
// SISTEMA PRINCIPAL - MAIN.JS OTIMIZADO
// ================================================================
window.API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';
const API_URL = window.API_URL;

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
    try {
        await iniciarSistema();
    } catch (error) {
        console.error('Erro ao iniciar sistema:', error);
    } finally {
        if (typeof window.hideLoadingScreen === 'function') {
            window.hideLoadingScreen();
        }
    }
});

async function iniciarSistema() {
    if (!verificarAcessoUsuario()) {
        return;
    }

    exportarVariaveisGlobais();

    await carregarDadosLocais();

    sistemaInicializado = true;
    window.sistemaInicializado = true;

    configurarInterface();
    exibirNomeUsuario();
    inicializarFotoPerfil();

    if (!dadosFinanceiros[anoAtual]) {
        abrirModalNovoAno();
    } else {
        await carregarDadosDashboard(anoAtual);
        // Dados já carregados pelo dashboard, não recarregar da API
        await renderizarMeses(anoAtual, false);

        // Garantir que dashboard inicia visível
        const dashboardLink = document.querySelector('[data-section="dashboard"]');
        if (dashboardLink && !dashboardLink.classList.contains('active')) {
            dashboardLink.click();
        }
    }

    notificarSistemaReady();

    // Inicializar switcher de perfis PF/PJ (await garante que perfis estão prontos antes de qualquer clique)
    if (typeof window.inicializarPerfis === 'function') {
        await window.inicializarPerfis();
    }
}


function verificarAcessoUsuario() {
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    if (!usuarioAtual) {
        redirecionarParaLogin();
        return false;
    }
    return true;
}

function exportarVariaveisGlobais() {
    // window.dadosFinanceiros será definido APÓS carregarDadosLocais() para evitar cache vazio
    window.anoAtual = anoAtual;
    window.mesAtual = mesAtual;
    window.mesAberto = mesAberto;
    window.anoAberto = anoAberto;
    
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
    window.obterSaldoAnterior = obterSaldoAnterior;

    window.abrirDetalhesDoMes = abrirDetalhesDoMes;
    window.renderizarMeses = renderizarMeses;
    window.renderizarDetalhesDoMes = renderizarDetalhesDoMes;
    window.carregarDadosDashboard = carregarDadosDashboard;
    window.carregarDadosDashboardLocal = carregarDadosDashboardLocal;
    window.atualizarResumoAnual = atualizarResumoAnual;
    window.atualizarLimitesCartoes = atualizarLimitesCartoes;
    window.calcularLimiteCartao = calcularLimiteCartao;
    // Funções de fechamento de mês
    window.fecharMes = fecharMes;
    window.reabrirMes = reabrirMes;
    window.criarReceitaSaldoAnterior = criarReceitaSaldoAnterior;
    window.removerReceitaSaldoAnterior = removerReceitaSaldoAnterior;
    window.verificarFechamentoAutomatico = verificarFechamentoAutomatico;

    if (typeof window.calcularTotalDespesas !== 'function') {
        window.calcularTotalDespesas = function(despesas, apenasPagas = false) {
            if (!Array.isArray(despesas)) return 0;
            return despesas.reduce((total, despesa) => {
                if (apenasPagas && !despesa.pago) return total;
                return total + (window.obterValorRealDespesa ? window.obterValorRealDespesa(despesa) : (despesa.valor || 0));
            }, 0);
        };
    }

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

    window.mostrarMensagemSucesso = function(mensagem) {
        mostrarNotificacao(mensagem, 'sucesso');
    };

    window.mostrarMensagemErro = function(mensagem) {
        mostrarNotificacao(mensagem, 'erro');
    };
}

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

    const toastTmpl = document.getElementById('template-toast');
    if (toastTmpl) {
        const clone = toastTmpl.content.cloneNode(true);
        clone.querySelector('.toast-icon').className = `toast-icon ${icons[tipo] || icons.info}`;
        clone.querySelector('.toast-message').textContent = mensagem;
        toast.appendChild(clone);
    } else {
        toast.innerHTML = `<i class="toast-icon ${icons[tipo] || icons.info}"></i><div class="toast-content"><p class="toast-message">${mensagem}</p></div><button class="toast-close" aria-label="Fechar"><i class="fas fa-times"></i></button>`;
    }

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
        if (window.usuarioDataManager) {
            // Aguardar até que o usuarioDataManager esteja pronto
            let tentativas = 0;
            const maxTentativas = 50;
            while (!window.usuarioDataManager.inicializado && tentativas < maxTentativas) {
                await new Promise(resolve => setTimeout(resolve, 100));
                tentativas++;
            }
        }

        const [dadosAPI] = await Promise.all([
            window.usuarioDataManager && typeof window.usuarioDataManager.getDadosFinanceirosUsuario === 'function'
                ? window.usuarioDataManager.getDadosFinanceirosUsuario()
                : Promise.resolve(criarEstruturaVazia()),
            carregarCartoesDoUsuario()
        ]);

        dadosFinanceiros = (!dadosAPI || Object.keys(dadosAPI).length === 0) ? criarEstruturaVazia() : dadosAPI;
        window.dadosFinanceiros = dadosFinanceiros;

    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        dadosFinanceiros = criarEstruturaVazia();
        window.dadosFinanceiros = dadosFinanceiros;
    }
}

/**
 * Carrega os cartões do usuário da API
 */
async function carregarCartoesDoUsuario() {
    try {
        const usuario = window.usuarioDataManager?.getUsuarioAtual();
        const token = sessionStorage.getItem('token');

        if (!usuario || !usuario.id || !token) {
            window.cartoesUsuario = [];
            return;
        }

        const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

        const perfilIdMain = typeof window.getPerfilAtivo === 'function' ? window.getPerfilAtivo() : null;
        const perfilQueryMain = perfilIdMain ? `?perfil_id=${perfilIdMain}` : '';
        const response = await fetch(`${API_URL}/usuarios/${usuario.id}/cartoes${perfilQueryMain}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            window.cartoesUsuario = [];
            return;
        }

        const data = await response.json();

        if (data.success && data.cartoes) {
            // Migrar formato antigo para novo (se necessário)
            let cartoes = data.cartoes;

            if (Array.isArray(cartoes)) {
                // Garantir que todos os cartões tenham numero_cartao
                cartoes = cartoes
                    .filter(c => (c.banco || c.nome) && (c.banco || c.nome).trim() !== '')
                    .map((c, index) => ({
                        ...c,
                        banco: c.banco || c.nome,
                        numero_cartao: c.numero_cartao || (index + 1)
                    }));
            } else {
                // Converter formato antigo {cartao1, cartao2, cartao3} para array
                const cartoesArray = [];
                let posicao = 1;
                ['cartao1', 'cartao2', 'cartao3'].forEach(key => {
                    if (cartoes[key] && cartoes[key].nome && cartoes[key].nome.trim() !== '') {
                        cartoesArray.push({
                            id: posicao,
                            banco: cartoes[key].nome,
                            validade: cartoes[key].validade || '',
                            limite: parseFloat(cartoes[key].limite) || 0,
                            ativo: cartoes[key].ativo || false,
                            numero_cartao: posicao
                        });
                        posicao++;
                    }
                });
                cartoes = cartoesArray;
            }

            window.cartoesUsuario = cartoes;
        } else {
            window.cartoesUsuario = [];
        }

    } catch (error) {
        console.error('Erro ao carregar cartões:', error);
        window.cartoesUsuario = [];
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
                // Salvar na API do PostgreSQL
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
    setupToolbarButtons();
    setupOutrosControles();
    setupSistemaBloqueio();
    setupEventosFechamento();
    configurarObservadorModal();

    atualizarDisplayAno(anoAtual);
}

function setupNavigation() {
    const sidebar    = document.getElementById('sidebar');
    const overlay    = document.getElementById('sidebar-overlay');
    const mainContent = document.querySelector('.main-content');

    const isMobile = () => window.innerWidth <= 768;

    // Desktop inicia com sidebar expandida
    // Mobile inicia com sidebar escondida (overlay model)
    if (isMobile()) {
        sidebar?.classList.add('collapsed');
        mainContent?.classList.add('sidebar-collapsed');
    }

    function abrirSidebar() {
        sidebar?.classList.remove('collapsed');
        mainContent?.classList.remove('sidebar-collapsed');
        if (isMobile()) overlay?.classList.add('visivel');
    }

    function fecharSidebar() {
        sidebar?.classList.add('collapsed');
        mainContent?.classList.add('sidebar-collapsed');
        overlay?.classList.remove('visivel');
    }

    function toggleSidebar() {
        if (sidebar?.classList.contains('collapsed')) abrirSidebar();
        else fecharSidebar();
    }

    // Toggle dentro da sidebar (desktop + mobile quando aberta)
    document.getElementById('btn-toggle-sidebar')?.addEventListener('click', toggleSidebar);
    // Hambúrguer no header (mobile)
    document.getElementById('btn-abrir-sidebar')?.addEventListener('click', toggleSidebar);
    // Overlay fecha a sidebar (mobile)
    overlay?.addEventListener('click', fecharSidebar);

    // Ao redimensionar: ajusta overlay se necessário
    window.addEventListener('resize', () => {
        if (!isMobile()) overlay?.classList.remove('visivel');
    });

    // Nav links: no mobile fecha sidebar; no desktop mantém estado
    const navLinks = document.querySelectorAll('.nav-link');

    // Colapsar/expandir grupo Configurações
    const btnToggleConfig = document.getElementById('btn-toggle-config');
    const sublistConfig = document.getElementById('sublist-config');
    const chevronConfig = document.getElementById('chevron-config');
    let configExpanded = false;

    if (btnToggleConfig) {
        btnToggleConfig.addEventListener('click', () => {
            configExpanded = !configExpanded;
            sublistConfig.classList.toggle('expanded', configExpanded);
            chevronConfig.style.transform = configExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
        });
    }

    // Colapsar/expandir grupo Admin
    const btnToggleAdmin = document.getElementById('btn-toggle-admin');
    const sublistAdmin = document.getElementById('sublist-admin');
    const chevronAdmin = document.getElementById('chevron-admin');
    let adminExpanded = false;

    if (btnToggleAdmin) {
        btnToggleAdmin.addEventListener('click', () => {
            adminExpanded = !adminExpanded;
            sublistAdmin.classList.toggle('expanded', adminExpanded);
            chevronAdmin.style.transform = adminExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
        });
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            if (isMobile()) fecharSidebar();

            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            // Se o link clicado for um subitem de config, expandir o grupo
            if (link.closest('#sublist-config') && !configExpanded) {
                configExpanded = true;
                if (sublistConfig) sublistConfig.classList.add('expanded');
                if (chevronConfig) chevronConfig.style.transform = 'rotate(180deg)';
            }

            // Se o link clicado for um subitem de admin, expandir o grupo
            if (link.closest('#sublist-admin') && !adminExpanded) {
                adminExpanded = true;
                if (sublistAdmin) sublistAdmin.classList.add('expanded');
                if (chevronAdmin) chevronAdmin.style.transform = 'rotate(180deg)';
            }

            document.querySelectorAll('section[id$="-section"]').forEach(section => {
                section.classList.remove('active');
            });

            const secao = link.getAttribute('data-section');
            const tab = link.getAttribute('data-tab');
            const sectionId = secao + '-section';
            const section = document.getElementById(sectionId);
            if (section) {
                section.classList.add('active');

                // Se tem data-tab, ativar a aba correspondente em config
                if (tab && typeof window.ativarConfigTab === 'function') {
                    window.ativarConfigTab(tab);
                }

                onSecaoAtivada(secao, tab);
            }
        });
    });
}

function onSecaoAtivada(secao, tab) {
    switch (secao) {
           case 'dashboard':
                setTimeout(async () => {
                    await carregarDadosDashboard(anoAtual);
                    atualizarResumoAnual(anoAtual);

                    if (typeof window.renderizarGraficoMediaCategorias === 'function') {
                        window.renderizarGraficoMediaCategorias();
                    }
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


        case 'relatorios':
            if (window.sistemaRelatoriosTelaCheia) {
                setTimeout(() => {
                    window.sistemaRelatoriosTelaCheia.carregarCategorias();
                }, 100);
            }
            break;

        case 'fornecedor':
            if (typeof carregarDadosFornecedor === 'function') carregarDadosFornecedor();
            break;

        case 'config':
            // Lógica específica por aba já é tratada em ativarConfigTab (configuracao.js)
            break;

    }
}

function setupControlesAno() {
    const btnAnoAnterior = document.getElementById('btn-ano-anterior');
    const btnProximoAno = document.getElementById('btn-proximo-ano');
    const btnAnoAtualDisplay = document.getElementById('ano-atual-btn');
    const dropdownAnos = document.getElementById('dropdown-anos');

    const btnAnoMenu = document.getElementById('btn-ano-menu');
    const dropdownAnoMenu = document.getElementById('dropdown-ano-menu');
    const btnNovoAnoMenu = document.getElementById('btn-novo-ano-menu');
    const btnExcluirAnoMenu = document.getElementById('btn-excluir-ano-menu');

    // Navegação anterior/próximo
    if (btnAnoAnterior) {
        btnAnoAnterior.addEventListener('click', () => mudarAno(anoAtual - 1));
    }

    if (btnProximoAno) {
        btnProximoAno.addEventListener('click', () => mudarAno(anoAtual + 1));
    }

    if (btnAnoAtualDisplay && dropdownAnos) {
        btnAnoAtualDisplay.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownAnos.classList.toggle('show');

            if (dropdownAnos.classList.contains('show')) {
                preencherDropdownAnos();
            }
        });
    }

    if (btnAnoMenu && dropdownAnoMenu) {
        btnAnoMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownAnoMenu.classList.toggle('show');
        });
    }

    // Botões do menu dropdown
    if (btnNovoAnoMenu) {
        btnNovoAnoMenu.addEventListener('click', () => {
            dropdownAnoMenu.classList.remove('show');
            abrirModalNovoAno();
        });
    }

    if (btnExcluirAnoMenu) {
        btnExcluirAnoMenu.addEventListener('click', () => {
            dropdownAnoMenu.classList.remove('show');
            excluirAno(anoAtual);
        });
    }

    document.addEventListener('click', () => {
        if (dropdownAnos) dropdownAnos.classList.remove('show');
        if (dropdownAnoMenu) dropdownAnoMenu.classList.remove('show');
    });

    const formNovoAno = document.getElementById('form-novo-ano');
    if (formNovoAno) {
        formNovoAno.addEventListener('submit', criarNovoAno);
    }
}

function preencherDropdownAnos() {
    const dropdownAnos = document.getElementById('dropdown-anos');
    if (!dropdownAnos) return;

    const anosDisponiveis = Object.keys(window.dadosFinanceiros || {})
        .map(ano => parseInt(ano))
        .sort((a, b) => b - a); // Mais recente primeiro

    dropdownAnos.innerHTML = '';

    if (anosDisponiveis.length === 0) {
        const tmplAno = document.getElementById('template-ano-vazio');
        dropdownAnos.appendChild(tmplAno ? tmplAno.content.cloneNode(true) : (() => { const b = document.createElement('button'); b.className = 'btn btn-secondary'; b.disabled = true; b.textContent = 'Nenhum ano disponível'; return b; })());
        return;
    }

    anosDisponiveis.forEach(ano => {
        const btn = document.createElement('button');
        btn.textContent = ano;
        btn.className = ano === anoAtual ? 'btn btn-secondary active' : 'btn btn-secondary';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            mudarAno(ano);
            dropdownAnos.classList.remove('show');
        });
        dropdownAnos.appendChild(btn);
    });
}

function atualizarDisplayAno(ano) {
    const btnAnoAtualDisplay = document.getElementById('ano-atual-btn');
    if (btnAnoAtualDisplay) {
        btnAnoAtualDisplay.textContent = ano;
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


function setupToolbarButtons() {
    // Botão Nova Despesa no header principal
    const btnNovaDespesa = document.getElementById('btn-nova-despesa');
    if (btnNovaDespesa) {
        btnNovaDespesa.addEventListener('click', function(e) {
            e.preventDefault();
            if (typeof window.abrirModalNovaDespesa === 'function') {
                window.abrirModalNovaDespesa();
            }
        });
    }

    // Botão Nova Despesa na toolbar
    const btnNovaDespesaToolbar = document.getElementById('btn-nova-despesa-toolbar');
    if (btnNovaDespesaToolbar) {
        btnNovaDespesaToolbar.addEventListener('click', function(e) {
            e.preventDefault();
            if (typeof window.abrirModalNovaDespesa === 'function') {
                window.abrirModalNovaDespesa();
            }
        });
    }

    // Botão Pagar em Lote na toolbar
    const btnPagarLoteToolbar = document.getElementById('btn-pagar-lote-toolbar');
    if (btnPagarLoteToolbar) {
        btnPagarLoteToolbar.addEventListener('click', function(e) {
            e.preventDefault();
            if (typeof window.abrirModalPagamentoLote === 'function') {
                window.abrirModalPagamentoLote();
            }
        });
    }

    // Botão Nova Receita na toolbar
    const btnNovaReceitaToolbar = document.getElementById('btn-nova-receita-toolbar');
    if (btnNovaReceitaToolbar) {
        btnNovaReceitaToolbar.addEventListener('click', function(e) {
            e.preventDefault();
            if (typeof window.abrirModalNovaReceita === 'function') {
                window.abrirModalNovaReceita();
            }
        });
    }

}

// Atualizar categorias no filtro da toolbar
function atualizarCategoriasToolbar(categorias) {
    const filtro = document.getElementById('filtro-categoria-toolbar');
    if (filtro) {
        const valorAtual = filtro.value;
        filtro.innerHTML = '<option value="todas">Categorias</option>';

        categorias.forEach(categoria => {
            const option = document.createElement('option');
            option.value = categoria;
            option.textContent = categoria;
            filtro.appendChild(option);
        });

        if (valorAtual && categorias.includes(valorAtual)) {
            filtro.value = valorAtual;
        }
    }
}

// Exportar funções globalmente
window.atualizarCategoriasToolbar = atualizarCategoriasToolbar;

function setupOutrosControles() {
    // Toggle indicadores (accordion)
    const indicadoresToggle = document.getElementById('indicadores-toggle');
    const indicadoresConteudo = document.getElementById('indicadores-conteudo');
    if (indicadoresToggle && indicadoresConteudo) {
        indicadoresToggle.addEventListener('click', () => {
            indicadoresToggle.classList.toggle('collapsed');
            indicadoresConteudo.classList.toggle('collapsed');
        });
    }

    // Auto-atualização de dados
    async function atualizarDados() {
        if (window.usuarioDataManager && typeof window.usuarioDataManager.limparCache === 'function') {
            window.usuarioDataManager.limparCache();
        }
        await carregarDadosLocais();
        await carregarDadosDashboard(anoAtual);
        await Promise.all([
            renderizarMeses(anoAtual, false),
            typeof window.carregarCategoriasDoServidor === 'function' ? window.carregarCategoriasDoServidor() : Promise.resolve(),
            typeof window.carregarCartoesDoUsuario === 'function' ? window.carregarCartoesDoUsuario() : Promise.resolve(),
            typeof window.carregarNotificacoes === 'function' ? window.carregarNotificacoes() : Promise.resolve()
        ]);
        const secaoAtiva = document.querySelector('.nav-link.active')?.dataset.section;
        if (secaoAtiva) onSecaoAtivada(secaoAtiva);
    }

    // Atualiza ao voltar para a aba
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') atualizarDados();
    });

    // Atualiza a cada 5 minutos em segundo plano
    setInterval(atualizarDados, 5 * 60 * 1000);

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function(e) {
            e.preventDefault();

            sessionStorage.removeItem('usuarioAtual');
            sessionStorage.removeItem('dadosUsuarioLogado');
            sessionStorage.removeItem('token');
            localStorage.removeItem('usuarioAtual');
            localStorage.removeItem('dadosUsuarioLogado');
            localStorage.removeItem('token');
            localStorage.removeItem('perfilAtivoId');
            localStorage.removeItem('perfilAtivoNome');
            localStorage.removeItem('perfilAtivoTipo');

            window.location.href = 'index.html';
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
    const modalContent = modal.querySelector('.lock-card');
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
                                  event.target.id === 'lock-screen-password' ||
                                  event.target.closest('button[type="submit"][form="form-lock-screen"]') ||
                                  event.target.closest('.modal-footer');

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
            (window.mostrarToast || alert)('Digite sua senha.', 'warning');
            return;
        }

        try {
            const token = sessionStorage.getItem('token');
            const response = await fetch(`${API_URL}/auth/verify-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ senha: enteredPassword })
            });

            const resultado = await response.json();

            if (resultado.success) {
                if (window._lockScreenSuccessCallback) {
                    const cb = window._lockScreenSuccessCallback;
                    window._lockScreenSuccessCallback = null;
                    _fecharLockScreenCofre();
                    cb();
                } else {
                    unlockSystem();
                }
            } else {
                if (modalContent) {
                    modalContent.classList.add('shake-animation');
                    setTimeout(() => modalContent.classList.remove('shake-animation'), 500);
                }
                passwordInput.value = '';
                passwordInput.focus();
                (window.mostrarToast || alert)(resultado.message || 'Senha incorreta.', 'error');
            }
        } catch (error) {
            console.error('Erro ao verificar senha:', error);
            (window.mostrarToast || alert)('Erro ao verificar senha. Tente novamente.', 'error');
        }
    };

    const resetInactivityTimer = () => {
        if (localStorage.getItem(LOCK_STATE_KEY) === 'true') return;

        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(lockSystem, 20 * 60 * 1000);
    };

    const _fecharLockScreenCofre = () => {
        window._lockScreenSuccessCallback = null;
        overlay.classList.remove('visible');
        modal.classList.remove('visible');
        if (overlay._cofreCancelListener) {
            overlay.removeEventListener('click', overlay._cofreCancelListener);
            overlay._cofreCancelListener = null;
        }
        const escListener = modal._cofreEscListener;
        if (escListener) {
            document.removeEventListener('keydown', escListener);
            modal._cofreEscListener = null;
        }
        const title = modal.querySelector('.lock-title');
        const subtitle = modal.querySelector('.lock-subtitle');
        const lockIcon = modal.querySelector('.lock-icon-wrap i');
        const submitBtn = modal.querySelector('.lock-btn');
        if (title) title.textContent = 'Sistema Bloqueado';
        if (subtitle) subtitle.textContent = 'Digite sua senha para continuar';
        if (lockIcon) lockIcon.className = 'fas fa-lock';
        if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-unlock-alt"></i> Desbloquear';
    };

    window.mostrarLockScreenParaVerificacao = (callback) => {
        window._lockScreenSuccessCallback = callback;
        const title = modal.querySelector('.lock-title');
        const subtitle = modal.querySelector('.lock-subtitle');
        const lockIcon = modal.querySelector('.lock-icon-wrap i');
        const submitBtn = modal.querySelector('.lock-btn');
        if (title) title.textContent = 'Acesso ao Cofre';
        if (subtitle) subtitle.textContent = 'Digite sua senha para acessar o Cofre';
        if (lockIcon) lockIcon.className = 'fas fa-piggy-bank';
        if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-unlock-alt"></i> Entrar';
        if (passwordInput) { passwordInput.value = ''; setTimeout(() => passwordInput.focus(), 100); }
        overlay.classList.add('visible');
        modal.classList.add('visible');
        const cancelOnOverlay = (e) => { if (e.target === overlay) _fecharLockScreenCofre(); };
        overlay._cofreCancelListener = cancelOnOverlay;
        overlay.addEventListener('click', cancelOnOverlay);
        const escHandler = (e) => { if (e.key === 'Escape') _fecharLockScreenCofre(); };
        modal._cofreEscListener = escHandler;
        document.addEventListener('keydown', escHandler);
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
    const btnReabrirMes = document.getElementById('btn-reabrir-mes');

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

function configurarObservadorModal() {
    const modal = document.getElementById('modal-lancamento-despesas');
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
        atualizarDisplayAno(anoAtual);
        
        await carregarDadosDashboard(anoAtual);
        atualizarResumoAnual(anoAtual);
        // Dados já carregados pelo dashboard, não recarregar da API
        await renderizarMeses(anoAtual, false);

    } catch (error) {
        (window.mostrarToast || alert)('Erro ao mudar ano: ' + error.message, 'error');
    }
}

async function criarAnoSimples(ano) {
    try {
        if (dadosFinanceiros[ano]) {
            (window.mostrarToast || alert)(`O ano ${ano} já existe!`, 'warning');
            return;
        }

        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

        const response = await fetch(`${API_URL}/anos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ ano: parseInt(ano) })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Erro ao criar ano no servidor');
        }

        // Criar estrutura local
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

        anoAtual = ano;
        window.anoAtual = anoAtual;
        atualizarDisplayAno(anoAtual);

        await carregarDadosDashboard(anoAtual);
        atualizarResumoAnual(anoAtual);
        // Dados já carregados pelo dashboard
        await renderizarMeses(anoAtual, false);

        (window.mostrarToast || alert)(`Ano ${ano} criado com sucesso!`, 'success');

    } catch (error) {
        console.error('Erro ao criar ano:', error);
        (window.mostrarToast || alert)('Erro ao criar ano: ' + error.message, 'error');
    }
}

async function criarNovoAno(e) {
    e.preventDefault();
    
    try {
        const ano = parseInt(obterValorElemento('ano'));
        
        if (isNaN(ano) || ano < 2020 || ano > 2050) {
            (window.mostrarToast || alert)('Por favor, informe um ano válido entre 2020 e 2050.', 'warning');
            return;
        }

        await criarAnoSimples(ano);
        fecharModal('modal-novo-ano');

    } catch (error) {
        (window.mostrarToast || alert)('Erro ao criar novo ano: ' + error.message, 'error');
    }
}

async function excluirAno(ano) {
    try {
        if (!dadosFinanceiros[ano]) {
            (window.mostrarToast || alert)(`O ano ${ano} não existe!`, 'error');
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

            if (!dadosFinanceiros[anoAtual]) {
                abrirModalNovoAno();
            } else {
                await carregarDadosDashboard(anoAtual);
                atualizarResumoAnual(anoAtual);
                await renderizarMeses(anoAtual, false);
            }
        } else {
            await carregarDadosDashboard(anoAtual);
            atualizarResumoAnual(anoAtual);
            await renderizarMeses(anoAtual, false);
        }
        
        (window.mostrarToast || alert)(`O ano ${ano} foi excluído com sucesso!`, 'success');

    } catch (error) {
        (window.mostrarToast || alert)('Erro ao excluir ano: ' + error.message, 'error');
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

async function renderizarMeses(ano, recarregarDaAPI = true) {
    try {
        // Recarregar dados da API apenas se solicitado
        // Não recarregar durante operações de fechamento/reabertura para evitar perder alterações locais
        if (recarregarDaAPI && window.usuarioDataManager && typeof window.usuarioDataManager.getDadosFinanceirosUsuario === 'function') {
            const dadosAtualizados = await window.usuarioDataManager.getDadosFinanceirosUsuario();
            if (dadosAtualizados && Object.keys(dadosAtualizados).length > 0) {
                window.dadosFinanceiros = dadosAtualizados;
                dadosFinanceiros = dadosAtualizados;
            }
        }

        // Carregar reservas para calcular saldo disponível nos cards
        if (typeof window.carregarReservasAPI === 'function') {
            await window.carregarReservasAPI();
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

    // Calcular movimentações de reservas ACUMULADAS até este mês
    // Usa as movimentações (com data/hora) para saber quanto foi reservado em cada período
    let movimentacoesAcumuladas = 0;
    if (typeof window.calcularTotalReservasAcumuladas === 'function') {
        movimentacoesAcumuladas = window.calcularTotalReservasAcumuladas(mes, ano);
    }

    // Saldo disponível = saldo final - movimentações acumuladas até este mês
    const saldoDisponivel = saldo.saldoFinal - movimentacoesAcumuladas;

    // Saldo anterior disponível = saldo anterior - movimentações acumuladas até o mês anterior
    let movimentacoesAnteriores = 0;
    if (mes > 0 || ano > Math.min(...Object.keys(dadosFinanceiros || {}).map(Number))) {
        const mesAnterior = mes === 0 ? 11 : mes - 1;
        const anoAnterior = mes === 0 ? ano - 1 : ano;
        if (typeof window.calcularTotalReservasAcumuladas === 'function') {
            movimentacoesAnteriores = window.calcularTotalReservasAcumuladas(mesAnterior, anoAnterior);
        }
    }
    const saldoAnteriorDisponivel = saldo.saldoAnterior - movimentacoesAnteriores;

    // Saldo projetado disponível = saldo projetado - movimentações acumuladas
    const saldoProjetadoDisponivel = saldo.saldoProjetado - movimentacoesAcumuladas;

    // Criar objeto de saldo ajustado para o card
    const saldoAjustado = {
        saldoAnterior: saldoAnteriorDisponivel,
        receitas: saldo.receitas,
        despesas: saldo.despesas,
        saldoFinal: saldoDisponivel,
        saldoProjetado: saldoProjetadoDisponivel
    };

    if (fechado) {
        mesCard.classList.add('mes-fechado');
    } else if (temTransacoes) {
        mesCard.classList.add('mes-ativo');
    } else {
        mesCard.classList.add('mes-vazio');
    }

    preencherConteudoMes(mesCard, mes, ano, saldoAjustado, fechado, temTransacoes);

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

    const temMovReserva = window.movimentacoesReservasCache && Array.isArray(window.movimentacoesReservasCache) &&
        window.movimentacoesReservasCache.some(mov => {
            const d = new Date(mov.data_hora);
            return d.getFullYear() === ano && d.getMonth() === mes;
        });
    if (temMovReserva) {
        clone.querySelector('.mes-reserva-icon').classList.remove('hidden');
    }
    
    const saldoAnteriorDiv = clone.querySelector('.mes-saldo-anterior');
    saldoAnteriorDiv.classList.remove('hidden');
    const valorAnterior = clone.querySelector('.valor-anterior');
    const saldoAnt = (temSaldoAnteriorValido(mes, ano) ? saldo.saldoAnterior : 0) || 0;
    valorAnterior.textContent = formatarMoeda(saldoAnt);
    valorAnterior.className = `valor-anterior ${saldoAnt >= 0 ? 'positivo' : 'negativo'}`;

    clone.querySelector('.mes-receita').textContent = formatarMoeda(saldo.receitas);
    clone.querySelector('.mes-despesa').textContent = formatarMoeda(saldo.despesas);

    const saldoValor = clone.querySelector('.mes-saldo-valor');
    const saldoContainer = clone.querySelector('.mes-saldo');
    const saldoFinalExibir = (fechado || ehUltimoMesProcessado(mes, ano)) ? saldo.saldoFinal : 0;
    saldoValor.textContent = formatarMoeda(saldoFinalExibir);
    saldoValor.className = `mes-saldo-valor ${saldoFinalExibir >= 0 ? 'mes-saldo-positivo' : 'mes-saldo-negativo'}`;
    saldoContainer.style.display = 'block';
    
    const btnReabrir = clone.querySelector('.btn-reabrir');
    const btnFechar = clone.querySelector('.btn-fechar');

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
        atualizarCardSaldoAtual();

        const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                           'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        
        atualizarElemento('detalhes-mes-titulo', `${nomesMeses[mes]} de ${ano}`);
        
        renderizarDetalhesDoMes(mes, ano);
        configurarBotoesModal();
        
        setTimeout(() => {
            if (typeof window.criarFiltrosFormaPagamento === 'function') {
                window.criarFiltrosFormaPagamento();
            }
        }, 100);
        
        abrirModal('modal-detalhes-mes');
        
    } catch (error) {
        (window.mostrarToast || alert)('Erro ao abrir detalhes do mês: ' + error.message, 'error');
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
        (window.mostrarToast || alert)(`O ano ${novoAno} não está disponível.`, 'warning');
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

async function buscarReceitasAPI(mes, ano) {
    try {
        const perfilId = window.getPerfilAtivo?.() || null;
        const urlReceitas = perfilId
            ? `${API_URL}/receitas?mes=${mes}&ano=${ano}&perfil_id=${perfilId}`
            : `${API_URL}/receitas?mes=${mes}&ano=${ano}`;
        const response = await fetch(urlReceitas, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro ao buscar receitas');
        }

        // Converter formato da API para formato do frontend
        return data.data.map(r => {
            let anexos = r.anexos || [];
            if (typeof anexos === 'string') {
                try { anexos = JSON.parse(anexos); } catch(e) { anexos = []; }
            }
            return {
                id: r.id,
                descricao: r.descricao,
                valor: parseFloat(r.valor),
                data: r.data_recebimento,
                mes: r.mes,
                ano: r.ano,
                observacoes: r.observacoes,
                saldoAnterior: false,
                anexos: Array.isArray(anexos) ? anexos : []
            };
        });

    } catch (error) {
        return [];
    }
}

async function buscarDespesasAPI(mes, ano) {
    try {
        const perfilId = window.getPerfilAtivo?.() || null;
        const urlDespesas = perfilId
            ? `${API_URL}/despesas?mes=${mes}&ano=${ano}&perfil_id=${perfilId}`
            : `${API_URL}/despesas?mes=${mes}&ano=${ano}`;
        const response = await fetch(urlDespesas, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro ao buscar despesas');
        }

        // Converter formato da API para formato do frontend
        return data.data.map(d => {
            let anexos = d.anexos || [];
            if (typeof anexos === 'string') {
                try { anexos = JSON.parse(anexos); } catch(e) { anexos = []; }
            }
            return {
                id: d.id,
                descricao: d.descricao,
                categoria: d.categoria_nome || 'Outros',
                formaPagamento: d.forma_pagamento,
                cartao_id: d.cartao_id,
                valor: parseFloat(d.valor),
                valorOriginal: parseFloat(d.valor_original || d.valor),
                valorPago: d.valor_pago ? parseFloat(d.valor_pago) : null,
                valorTotalComJuros: d.valor_total_com_juros ? parseFloat(d.valor_total_com_juros) : null,
                dataVencimento: d.data_vencimento,
                dataCompra: d.data_compra,
                dataPagamento: d.data_pagamento,
                mes: d.mes,
                ano: d.ano,
                parcelado: d.parcelado,
                totalParcelas: d.numero_parcelas,
                parcelaAtual: d.parcela_atual,
                parcela: d.parcelado ? `${d.parcela_atual}/${d.numero_parcelas}` : null,
                idGrupoParcelamento: d.grupo_parcelamento_id,
                pago: d.pago,
                quitado: d.pago,
                recorrente: d.recorrente || false,
                observacoes: d.observacoes,
                anexos: Array.isArray(anexos) ? anexos : [],
                metadados: d.metadados || null,
                status: d.pago ? 'quitada' : (function() {
                    // Comparação sem timezone: extrai partes da string YYYY-MM-DD diretamente
                    var hoje = new Date(); hoje.setHours(0,0,0,0);
                    var partsV = (d.data_vencimento || '').split('-');
                    var venc = partsV.length === 3 ? new Date(parseInt(partsV[0]), parseInt(partsV[1])-1, parseInt(partsV[2])) : hoje;
                    return venc < hoje ? 'atrasada' : 'em_dia';
                })()
            };
        });

    } catch (error) {
        return [];
    }
}

// ================================================================
// RENDERIZAÇÃO DE DETALHES DO MÊS
// ================================================================

async function renderizarDetalhesDoMes(mes, ano) {
    try {
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

        // Carregar reservas
        if (typeof window.carregarReservasAPI === 'function') {
            await window.carregarReservasAPI();
        }

        atualizarLimitesCartoes(mes, ano);
        atualizarTituloDetalhes(mes, ano, fechado);
        atualizarControlesFechamento(mes, ano, fechado);

        // Atualizar saldo anterior na toolbar
        if (typeof window.atualizarSaldoAnteriorToolbar === 'function') {
            window.atualizarSaldoAnteriorToolbar();
        }

        // Atualizar barra receitas vs despesas
        if (typeof window.atualizarBarraReceitasDespesas === 'function') {
            window.atualizarBarraReceitasDespesas();
        }

        if (typeof window.atualizarCardReservasIntegrado === 'function') {
            window.atualizarCardReservasIntegrado();
        }

        // Mesclar receitas e despesas para tabela unificada
        const receitasMarcadas = [];
        receitas.forEach((r, i) => {
            if (!r.saldoAnterior && !r.descricao?.includes('Saldo Anterior')) {
                receitasMarcadas.push({ ...r, tipo: 'receita', _receitaIndex: i });
            }
        });
        const despesasMarcadas = despesas.map(d => ({ ...d, tipo: 'despesa' }));

        // Incluir movimentações de reservas do mês atual na tabela
        const movimentacoesReservaMes = [];
        if (window.movimentacoesReservasCache && Array.isArray(window.movimentacoesReservasCache)) {
            window.movimentacoesReservasCache.forEach(mov => {
                const dataHora = new Date(mov.data_hora);
                const movAno = dataHora.getFullYear();
                const movMes = dataHora.getMonth(); // 0-11
                if (movAno === ano && movMes === mes) {
                    movimentacoesReservaMes.push({ ...mov, tipo: 'reserva', tipoMovimento: mov.tipo });
                }
            });
        }

        const itensUnificados = [...receitasMarcadas, ...despesasMarcadas, ...movimentacoesReservaMes];

        if (typeof window.renderizarDespesas === 'function') {
            window.renderizarDespesas(itensUnificados, mes, ano, fechado);
        }

        if (typeof window.atualizarContadoresFiltro === 'function') {
            window.atualizarContadoresFiltro();
        }

        setTimeout(() => {
            if (typeof window.reinitDespesasResizer === 'function') {
                window.reinitDespesasResizer();
            }
        }, 100);

    } catch (error) {
        console.error('Erro ao carregar dados do mês:', error);
        (window.mostrarToast || alert)('Erro ao carregar dados do mês: ' + error.message, 'error');
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
    const btnReabrir = document.getElementById('btn-reabrir-mes');
    const statusMes = document.getElementById('status-mes-atual');

    if (fechado) {
        if (btnReabrir) btnReabrir.classList.remove('hidden');
        if (statusMes) statusMes.textContent = 'Mês Fechado';
    } else {
        if (btnReabrir) btnReabrir.classList.add('hidden');
        if (statusMes) statusMes.textContent = 'Mês Aberto';
    }
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
        if (window.usuarioDataManager && typeof window.usuarioDataManager.getDadosFinanceirosUsuario === 'function') {
            const dadosAtualizados = await window.usuarioDataManager.getDadosFinanceirosUsuario();
            if (dadosAtualizados && Object.keys(dadosAtualizados).length > 0) {
                window.dadosFinanceiros = dadosAtualizados;
                dadosFinanceiros = dadosAtualizados;
            }
        }

        if (typeof window.carregarReservasAPI === 'function') {
            await window.carregarReservasAPI();
        }

        carregarDadosDashboardLocal(ano);
    } catch (error) {
        carregarDadosDashboardLocal(ano);
    }
}


function carregarDadosDashboardLocal(ano) {
    // Modo "todos os anos" — agrega todos os anos disponíveis
    if (ano === 'todos') {
        const anosDisponiveis = Object.keys(dadosFinanceiros).map(Number).filter(Boolean).sort();
        if (anosDisponiveis.length === 0) {
            atualizarElementosDashboard({ totalReceitas: 0, totalDespesas: 0, totalJuros: 0, totalEconomias: 0, saldo: 0 });
            return;
        }
        let totalReceitas = 0, totalDespesas = 0, totalJuros = 0, totalEconomias = 0;
        for (const anoItem of anosDisponiveis) {
            const res = _calcularTotaisAno(anoItem);
            totalReceitas += res.receitas;
            totalDespesas += res.despesas;
            totalJuros    += res.juros;
            totalEconomias += res.economias;
        }
        atualizarElementosDashboard({
            totalReceitas,
            totalDespesas,
            totalJuros,
            totalEconomias,
            saldo: totalReceitas - totalDespesas
        });
        return;
    }

    if (!dadosFinanceiros[ano]) {
        atualizarElementosDashboard({ totalReceitas: 0, totalDespesas: 0, totalJuros: 0, totalEconomias: 0, saldo: 0 });
        return;
    }

    const { receitas, despesas, juros, economias, saldoInicial, reservado } = _calcularTotaisAno(ano);
    const receitasTotais = saldoInicial + receitas - reservado;
    const saldoAtual = receitasTotais - despesas;

    atualizarElementosDashboard({
        totalReceitas: receitasTotais,
        totalDespesas: despesas,
        totalJuros: juros,
        totalEconomias: economias,
        saldo: saldoAtual
    });
}

function _calcularTotaisAno(ano) {
    const saldoInicial = obterSaldoAnterior(0, ano);
    let receitas = 0, despesas = 0, juros = 0, economias = 0;

    for (let mes = 0; mes < 12; mes++) {
        const dadosMes = dadosFinanceiros[ano]?.meses[mes] || { receitas: [], despesas: [] };

        receitas += (dadosMes.receitas || []).reduce((sum, r) => {
            if (r.saldoAnterior === true || r.descricao?.includes('Saldo Anterior') || r.automatica === true) return sum;
            return sum + (r.valor || 0);
        }, 0);

        despesas += typeof window.calcularTotalDespesas === 'function'
            ? window.calcularTotalDespesas(dadosMes.despesas)
            : (dadosMes.despesas || []).reduce((sum, d) => sum + (d.valor || 0), 0);

        juros     += typeof window.calcularTotalJuros === 'function'     ? window.calcularTotalJuros(dadosMes.despesas)     : 0;
        economias += typeof window.calcularTotalEconomias === 'function' ? window.calcularTotalEconomias(dadosMes.despesas) : 0;
    }

    let reservado = 0;
    if (window.reservasCache && Array.isArray(window.reservasCache)) {
        reservado = window.reservasCache
            .filter(r => parseInt(r.ano) === ano)
            .reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
    }

    return { receitas, despesas, juros, economias, saldoInicial, reservado };
}



function atualizarElementosDashboard(dados) {
    atualizarElemento('dashboard-total-receitas', formatarMoeda(dados.totalReceitas));
    atualizarElemento('dashboard-total-despesas', formatarMoeda(dados.totalDespesas));
    atualizarElemento('dashboard-total-juros', formatarMoeda(dados.totalJuros || 0));
    atualizarElemento('dashboard-total-economias', formatarMoeda(dados.totalEconomias || 0));

    const saldoElement = document.getElementById('dashboard-saldo-anual');
    if (saldoElement) {
        saldoElement.textContent = formatarMoeda(dados.saldo);
        saldoElement.className = 'card-value ' + (dados.saldo >= 0 ? 'saldo-positivo' : 'saldo-negativo');
    }

    // Atualizar card SALDO ATUAL — saldo real do mês aberto (deduzindo reservas)
    const saldoAtualElement = document.getElementById('dashboard-saldo-atual');
    if (saldoAtualElement) {
        // Usar mês aberto se disponível; caso contrário, usar mês/ano atual como fallback
        const mesCálculo = (window.mesAberto !== null && window.mesAberto !== undefined)
            ? window.mesAberto : (window.mesAtual !== undefined ? window.mesAtual : mesAtual);
        const anoCálculo = (window.anoAberto !== null && window.anoAberto !== undefined)
            ? window.anoAberto : (window.anoAtual !== undefined ? window.anoAtual : anoAtual);

        if (typeof window.calcularSaldoMes === 'function' || typeof calcularSaldoMes === 'function') {
            const fnSaldo = typeof window.calcularSaldoMes === 'function' ? window.calcularSaldoMes : calcularSaldoMes;
            const saldoMes = fnSaldo(mesCálculo, anoCálculo);
            const reservas = typeof window.calcularMovimentacoesReservasAcumuladas === 'function'
                ? window.calcularMovimentacoesReservasAcumuladas(mesCálculo, anoCálculo)
                : (typeof window.calcularTotalReservasAcumuladas === 'function'
                    ? window.calcularTotalReservasAcumuladas(mesCálculo, anoCálculo)
                    : 0);
            const saldoAtual = (saldoMes.saldoFinal || 0) - (reservas || 0);
            saldoAtualElement.textContent = formatarMoeda(saldoAtual);
            if (saldoAtual > 0) {
                saldoAtualElement.className = 'card-value saldo-positivo';
                saldoAtualElement.style.color = '#3b82f6';
            } else if (saldoAtual < 0) {
                saldoAtualElement.className = 'card-value saldo-negativo';
                saldoAtualElement.style.color = '#ef4444';
            } else {
                saldoAtualElement.className = 'card-value';
                saldoAtualElement.style.color = '#6b7280';
            }
        } else {
            saldoAtualElement.textContent = formatarMoeda(0);
            saldoAtualElement.className = 'card-value';
            saldoAtualElement.style.color = '#6b7280';
        }
    }
}

function atualizarCardSaldoAtual() {
    const el = document.getElementById('dashboard-saldo-atual');
    if (!el) return;
    // Usar mês aberto se disponível; caso contrário, usar mês/ano atual como fallback
    const mesCálculo = (window.mesAberto !== null && window.mesAberto !== undefined)
        ? window.mesAberto : (window.mesAtual !== undefined ? window.mesAtual : mesAtual);
    const anoCálculo = (window.anoAberto !== null && window.anoAberto !== undefined)
        ? window.anoAberto : (window.anoAtual !== undefined ? window.anoAtual : anoAtual);
    const fnSaldo = typeof window.calcularSaldoMes === 'function' ? window.calcularSaldoMes : calcularSaldoMes;
    const saldoMes = fnSaldo ? fnSaldo(mesCálculo, anoCálculo) : { saldoFinal: 0 };
    const reservas = typeof window.calcularMovimentacoesReservasAcumuladas === 'function'
        ? window.calcularMovimentacoesReservasAcumuladas(mesCálculo, anoCálculo)
        : 0;
    const saldoAtual = (saldoMes.saldoFinal || 0) - (reservas || 0);
    el.textContent = formatarMoeda(saldoAtual);
    if (saldoAtual > 0) {
        el.className = 'card-value saldo-positivo';
        el.style.color = '#3b82f6';
    } else if (saldoAtual < 0) {
        el.className = 'card-value saldo-negativo';
        el.style.color = '#ef4444';
    } else {
        el.className = 'card-value';
        el.style.color = '#6b7280';
    }
}
window.atualizarCardSaldoAtual = atualizarCardSaldoAtual;

// Recalcular saldo atual após o sistema estar completamente pronto
window.addEventListener('sistemaFinanceiroReady', () => {
    atualizarCardSaldoAtual();
}, { once: true });

async function atualizarResumoAnual(ano) {
    await carregarDadosDashboard(ano);
    atualizarLimitesCartoes(mesAberto, anoAberto);
}

/**
 * Atualiza os limites dos cartões na tela de resumo
 */
function atualizarLimitesCartoes(mes, ano) {
    const container = document.getElementById('lista-barras-cartoes');
    if (!container) return;

    // Limpar container
    container.innerHTML = '';

    // Buscar cartões do usuário
    const cartoes = window.cartoesUsuario || [];

    if (!Array.isArray(cartoes) || cartoes.length === 0) {
        container.appendChild(document.getElementById('tpl-cartao-vazio').content.cloneNode(true));
        return;
    }

    // Filtrar apenas cartões ativos
    const cartoesAtivos = cartoes.filter(c => c.ativo);

    if (cartoesAtivos.length === 0) {
        container.appendChild(document.getElementById('tpl-cartao-sem-ativo').content.cloneNode(true));
        return;
    }

    // Renderizar cada cartão ativo
    cartoesAtivos.forEach(cartao => {
        const limiteInfo = calcularLimiteCartao(cartao.id, mes, ano);

        const cartaoDiv = document.createElement('div');
        cartaoDiv.className = 'cartao-limite-item';
        cartaoDiv.setAttribute('data-cartao-id', cartao.id);

        const percentualUsado = limiteInfo.percentualUsado;
        let statusClass = 'status-ok';
        if (percentualUsado >= 90) statusClass = 'status-critico';
        else if (percentualUsado >= 70) statusClass = 'status-alerta';

        // Limitar largura da barra em 100% (mesmo que percentual seja maior)
        const larguraBarra = Math.min(percentualUsado, 100);

        const nomeCartao = cartao.banco || cartao.nome || 'Cartão';

        cartaoDiv.innerHTML = `
            <div class="cartao-info-header">
                <span class="cartao-nome">${nomeCartao.toUpperCase()}</span>
                <div class="cartao-valores">
                    <span class="valor-usado">${formatarMoeda(limiteInfo.limiteUtilizado)}</span>
                    <span class="separador">/</span>
                    <span class="valor-limite">${formatarMoeda(limiteInfo.limiteTotal)}</span>
                </div>
            </div>

            <div class="cartao-barra-progresso">
                <div class="barra-fundo">
                    <div class="barra-preenchida ${statusClass}" style="width: ${larguraBarra}%"></div>
                </div>
                <div class="cartao-percentual">
                    <span class="percentual-texto">${percentualUsado.toFixed(1)}% usado</span>
                    <span class="disponivel-texto">Disponível: ${formatarMoeda(limiteInfo.limiteDisponivel)}</span>
                </div>
            </div>

            <div class="cartao-status">
                <span class="status-ativo">ATIVO</span>
            </div>
        `;

        container.appendChild(cartaoDiv);
    });
}

/**
 * Calcula limite disponível de um cartão específico
 */
function calcularLimiteCartao(cartaoId, mes, ano) {
    const cartao = (window.cartoesUsuario || []).find(c => c.id === cartaoId);

    if (!cartao) {
        return {
            limiteTotal: 0,
            limiteUtilizado: 0,
            limiteDisponivel: 0,
            percentualUsado: 0
        };
    }

    const limiteTotal = parseFloat(cartao.limite) || 0;
    let limiteUtilizado = 0;

    // Função auxiliar para verificar se despesa está paga
    const despesaEstaPaga = (despesa) => {
        // Verificar campo 'pago'
        if (despesa.pago === true || despesa.pago === 'true' || despesa.pago === 1 || despesa.pago === '1') {
            return true;
        }
        // Verificar campo 'quitado'
        if (despesa.quitado === true || despesa.quitado === 'true' || despesa.quitado === 1 || despesa.quitado === '1') {
            return true;
        }
        return false;
    };

    // Função auxiliar para verificar se despesa é recorrente
    const despesaEhRecorrente = (despesa) => {
        return despesa.recorrente === true || despesa.recorrente === 'true' || despesa.recorrente === 1 || despesa.recorrente === '1';
    };

    // Função auxiliar para verificar se despesa pertence ao cartão
    const pertenceAoCartao = (despesa) => {
        const formaPag = (despesa.formaPagamento || despesa.forma_pagamento || '').toLowerCase();
        const eCreditoOuVariacao = formaPag === 'credito' || formaPag === 'crédito' ||
                                    formaPag === 'cred-merpago' || formaPag === 'créd-merpago';
        if (!eCreditoOuVariacao) return false;

        // Verificar cartao_id (ID real do banco de dados)
        const cartaoIdDespesa = despesa.cartao_id || despesa.cartaoId;
        if (cartaoIdDespesa) {
            return parseInt(cartaoIdDespesa) === parseInt(cartaoId);
        }

        // Fallback para despesas antigas que usam numeroCartao (posição)
        const numeroCartaoDespesa = despesa.numeroCartao || despesa.numero_cartao;
        if (numeroCartaoDespesa) {
            const cartoesUsuario = window.cartoesUsuario || [];
            const cartaoNaPosicao = cartoesUsuario[parseInt(numeroCartaoDespesa) - 1];
            if (cartaoNaPosicao) {
                return cartaoNaPosicao.id === cartaoId;
            }
        }

        // Despesas sem cartao_id não pertencem a nenhum cartão
        return false;
    };

    // Calcular limite baseado em TODAS as despesas NÃO PAGAS do cartão
    // O limite comprometido é FIXO - independe do mês sendo visualizado
    // Despesas recorrentes NÃO comprometem o limite (são contabilizadas apenas quando vencem)

    // Processar TODOS os anos disponíveis nos dados financeiros
    const anosDisponiveis = Object.keys(dadosFinanceiros || {}).map(Number).sort((a, b) => a - b);

    for (const anoProcessar of anosDisponiveis) {
        const anoData = dadosFinanceiros?.[anoProcessar];
        if (!anoData?.meses) continue;

        // Percorrer TODOS os meses do ano
        for (let mesProcessar = 0; mesProcessar < 12; mesProcessar++) {
            const despesasMes = anoData.meses[mesProcessar]?.despesas || [];

            despesasMes.forEach(despesa => {
                // Pular despesas transferidas
                if (despesa.transferidaParaProximoMes === true) return;

                // Pular se não pertence ao cartão
                if (!pertenceAoCartao(despesa)) return;

                // Pular se já está paga (limite já liberado)
                if (despesaEstaPaga(despesa)) return;

                // Pular despesas recorrentes (não comprometem limite)
                if (despesaEhRecorrente(despesa)) return;

                // Somar valor da despesa não paga
                const valor = parseFloat(despesa.valorTotalComJuros) || parseFloat(despesa.valor) || 0;
                limiteUtilizado += valor;
            });
        }
    }

    const limiteDisponivel = Math.max(0, limiteTotal - limiteUtilizado);
    const percentualUsado = limiteTotal > 0 ? (limiteUtilizado / limiteTotal) * 100 : 0;

    return {
        limiteTotal,
        limiteUtilizado,
        limiteDisponivel,
        percentualUsado
    };
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

        const obterValor = window.obterValorRealDespesa || (d => parseFloat(d.valor || 0));

        const _hoje = new Date();
        _hoje.setHours(0, 0, 0, 0);

        const despesas = (dadosMes.despesas || []).reduce((sum, d) => {
            if (d.quitacaoAntecipada === true) return sum;
            if (d.pago) return sum + obterValor(d);
            if (dadosMes.fechado === true) return sum + obterValor(d);
            const ehRecorrente = d.recorrente === true || d.recorrente === 'true' || d.recorrente === 1 || d.recorrente === '1';
            const ehParcelado = d.parcelado || d.parcela || d.idGrupoParcelamento;
            // Parceladas confirmadas sempre contam (são compromissos futuros definidos)
            if (ehParcelado) return sum + obterValor(d);
            if (ehRecorrente) {
                if (!d.dataVencimento) return sum;
                const partes = d.dataVencimento.split('-');
                const vencimento = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
                return vencimento <= _hoje ? sum + obterValor(d) : sum;
            }
            return sum;
        }, 0);

        const despesasTotal = (dadosMes.despesas || []).reduce((sum, d) => {
            if (d.quitacaoAntecipada === true) return sum;
            return sum + obterValor(d);
        }, 0);

        return {
            saldoAnterior: saldoAnterior,
            receitas: receitas,
            despesas: despesas,
            despesasTotal: despesasTotal,
            saldoFinal: saldoAnterior + receitas - despesas,
            saldoProjetado: saldoAnterior + receitas - despesasTotal
        };

    } catch (error) {
        return {
            saldoAnterior: 0,
            receitas: 0,
            despesas: 0,
            despesasTotal: 0,
            saldoFinal: 0,
            saldoProjetado: 0
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

    // Se o mês anterior está fechado, usar o saldoFinal salvo
    if (dadosMesAnterior && dadosMesAnterior.fechado === true) {
        return dadosMesAnterior.saldoFinal || 0;
    }

    // Se o mês anterior NÃO está fechado, calcular dinamicamente
    // Isso evita retornar 0 e perder todo o histórico de receitas/despesas
    if (dadosMesAnterior) {
        // Delegar a calcularSaldoMes para aplicar a mesma lógica de recorrência/vencimento
        return calcularSaldoMes(mesAnterior, anoAnterior).saldoFinal;
    }

    return 0;
}

// ================================================================
// FECHAMENTO E REABERTURA DE MÊS
// ================================================================

function abrirModalConfirmacaoFechamento(mes, ano) {
    const dadosMes = dadosFinanceiros[ano]?.meses[mes];
    if (!dadosMes || dadosMes.fechado) {
        (window.mostrarToast || alert)('Mês já está fechado ou não existe!', 'warning');
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
        (window.mostrarToast || alert)('Mês já está aberto ou não existe!', 'warning');
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
            // Dados já carregados, apenas re-renderizar cards dos meses
            if (typeof window.renderizarMeses === 'function') {
                await window.renderizarMeses(anoAberto, false);
            }
        }
    } catch (error) {
        (window.mostrarToast || alert)('Erro ao fechar mês: ' + error.message, 'error');
    }
}

async function confirmarReabertura() {
    try {
        const sucesso = await reabrirMes(mesAberto, anoAberto);

        if (sucesso) {
            fecharModal('modal-confirmar-reabertura');
            await renderizarDetalhesDoMes(mesAberto, anoAberto);
            // Dados já carregados, apenas re-renderizar cards dos meses
            if (typeof window.renderizarMeses === 'function') {
                await window.renderizarMeses(anoAberto, false);
            }
        }
    } catch (error) {
        (window.mostrarToast || alert)('Erro ao reabrir mês: ' + error.message, 'error');
    }
}

async function fecharMes(mes, ano) {
    const dadosMes = dadosFinanceiros[ano]?.meses[mes];
    if (!dadosMes || dadosMes.fechado) {
        (window.mostrarToast || alert)('Mês já está fechado ou não existe!', 'warning');
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
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        const perfilIdMes = typeof window.getPerfilAtivo === 'function' ? window.getPerfilAtivo() : null;
        const response = await fetch(`${API_URL}/meses/${ano}/${mes}/fechar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                saldo_final: saldo.saldoFinal,
                perfil_id: perfilIdMes
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Erro ao fechar mês na API');
        }

        // Atualizar dados locais após confirmar sucesso na API
        dadosMes.fechado = true;
        dadosMes.saldoFinal = saldo.saldoFinal;
        dadosMes.dataFechamento = new Date().toISOString().split('T')[0];

        if (saldo.saldoFinal !== 0) {
            await criarReceitaSaldoAnterior(proximoMes, proximoAno, saldo.saldoFinal, mes, ano);
        }

        // Renderizar sem recarregar da API para manter as alterações locais
        if (typeof window.renderizarMeses === 'function') {
            await window.renderizarMeses(ano, false);
        }

        if (proximoAno !== ano && typeof window.renderizarMeses === 'function') {
            setTimeout(async () => await window.renderizarMeses(proximoAno, false), 100);
        }

        return true;

    } catch (error) {
        console.error('Erro ao fechar mês:', error);
        (window.mostrarToast || alert)('Erro ao fechar mês: ' + error.message, 'error');
        return false;
    }
}

async function reabrirMes(mes, ano) {
    const dadosMes = dadosFinanceiros[ano]?.meses[mes];
    if (!dadosMes || !dadosMes.fechado) {
        (window.mostrarToast || alert)('Mês já está aberto ou não existe!', 'warning');
        return false;
    }

    let proximoMes = mes + 1;
    let proximoAno = ano;

    if (proximoMes > 11) {
        proximoMes = 0;
        proximoAno = ano + 1;
    }

    try {
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        const perfilIdReabrir = typeof window.getPerfilAtivo === 'function' ? window.getPerfilAtivo() : null;
        const response = await fetch(`${API_URL}/meses/${ano}/${mes}/reabrir`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ perfil_id: perfilIdReabrir })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Erro ao reabrir mês na API');
        }

        // Atualizar dados locais após confirmar sucesso na API
        dadosMes.fechado = false;
        dadosMes.dataFechamento = null;
        dadosMes.saldoFinal = 0;

        await removerReceitaSaldoAnterior(proximoMes, proximoAno, mes, ano);

        // Renderizar sem recarregar da API para manter as alterações locais
        if (typeof window.renderizarMeses === 'function') {
            await window.renderizarMeses(ano, false);

            if (proximoAno !== ano) {
                setTimeout(async () => await window.renderizarMeses(proximoAno, false), 100);
            }
        }

        return true;

    } catch (error) {
        console.error('Erro ao reabrir mês:', error);
        (window.mostrarToast || alert)('Erro ao reabrir mês: ' + error.message, 'error');
        return false;
    }
}

async function criarReceitaSaldoAnterior(mes, ano, valor, mesOrigem, anoOrigem) {
    try {
        if (!dadosFinanceiros[ano]) {
            // Criar ano silenciosamente (sem mudar anoAtual nem re-renderizar)
            const tokenAno = sessionStorage.getItem('token') || localStorage.getItem('token');
            const apiUrl = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';
            try {
                await fetch(`${apiUrl}/anos`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenAno}` },
                    body: JSON.stringify({ ano: parseInt(ano) })
                });
            } catch (_) { /* ignora erro de rede — estrutura local é suficiente */ }
            dadosFinanceiros[ano] = { meses: [] };
            for (let i = 0; i < 12; i++) {
                dadosFinanceiros[ano].meses[i] = { receitas: [], despesas: [], fechado: false, saldoAnterior: 0, saldoFinal: 0 };
            }
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

        // Renderizar sem recarregar da API para manter as alterações locais
        if (typeof window.renderizarMeses === 'function') {
            await window.renderizarMeses(ano, false);
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

    // Disparo automático de avaliação após 7 dias de cadastro
    if (typeof window.verificarEDispararAvaliacao === 'function') {
        window.verificarEDispararAvaliacao();
    }
}

// ================================================================
// RECARREGAR DADOS DO APP (usado pelo switcher PF/PJ)
// ================================================================
window.recarregarDadosApp = async function() {
    try {
        if (window.usuarioDataManager && typeof window.usuarioDataManager.limparCache === 'function') {
            window.usuarioDataManager.limparCache();
        }
        // Forçar busca na API ignorando todos os caches (usa {} em vez de null para evitar crash em funções concorrentes)
        window.dadosFinanceiros = {};
        dadosFinanceiros = {};
        window.reservasCache = null;
        window.movimentacoesReservasCache = null;
        // Limpar mês aberto para evitar tentativa de renderizar mês de outro perfil
        mesAberto = null;
        anoAberto = null;
        window.mesAberto = null;
        window.anoAberto = null;
        await carregarDadosLocais();
        // Fechar painel de detalhes do mês (mesAberto já foi limpo acima)
        const painelDetalhes = document.getElementById('mes-detalhes');
        if (painelDetalhes) painelDetalhes.classList.remove('ativo', 'visible');

        // carregarDadosDashboard e renderizarMeses são independentes — rodar em paralelo
        await Promise.all([
            carregarDadosDashboard(anoAtual),
            renderizarMeses(anoAtual, true)
        ]);
        const secaoAtiva = document.querySelector('.nav-link.active')?.dataset.section;
        if (secaoAtiva) onSecaoAtivada(secaoAtiva);
    } catch (error) {
        console.error('Erro ao recarregar dados do app:', error);
    }
};

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

        if (dadosUsuario) {
            const usuario = JSON.parse(dadosUsuario);
            const primeiroNome = usuario.nome?.split(' ')[0] || 'Usuário';
            const tipoUsuario = usuario.tipo || 'padrao';

            const tipoTexto = {
                'master': 'Master',
                'admin': 'Admin',
                'padrao': 'Padrão'
            }[tipoUsuario] || 'Padrão';

            const nomeSidebar = document.getElementById('nome-usuario-sidebar');
            if (nomeSidebar) {
                nomeSidebar.textContent = `${primeiroNome} - ${tipoTexto}`;
            }

            // Mostrar grupo admin para admin/master
            const navGroupAdmin = document.getElementById('nav-group-admin');
            if (navGroupAdmin) {
                navGroupAdmin.style.display = (tipoUsuario === 'admin' || tipoUsuario === 'master') ? '' : 'none';
            }

            // Mostrar painel do fornecedor apenas para master
            const navFornecedor = document.getElementById('nav-item-fornecedor');
            if (navFornecedor) {
                navFornecedor.style.display = tipoUsuario === 'master' ? '' : 'none';
            }

            // Carregar foto de perfil
            carregarFotoPerfil();
        }
    } catch (error) {
        // silencioso
    }
}

// ================================================================
// FOTO DE PERFIL
// ================================================================
async function carregarFotoPerfil() {
    try {
        const token = sessionStorage.getItem('token');
        if (!token) return;

        const response = await fetch(`${API_URL}/usuarios/current`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (result.success && result.data.foto) {
            exibirFotoAvatar(result.data.foto);
        }
    } catch (error) {
        // silencioso
    }
}

function exibirFotoAvatar(fotoBase64) {
    const avatarImg = document.getElementById('avatar-img');
    if (!avatarImg) return;
    if (fotoBase64) {
        avatarImg.innerHTML = `<img src="${fotoBase64}" alt="Foto de perfil">`;
    } else {
        avatarImg.innerHTML = '<i class="fas fa-user avatar-placeholder"></i>';
    }
}

function inicializarFotoPerfil() {
    const avatarContainer = document.getElementById('avatar-container');
    const inputFoto = document.getElementById('input-foto-perfil');
    if (!avatarContainer || !inputFoto) return;

    avatarContainer.addEventListener('click', () => {
        const avatarImg = document.getElementById('avatar-img');
        const temFoto = avatarImg && avatarImg.querySelector('img');

        if (temFoto) {
            // Já tem foto: mostrar menu com opções
            mostrarMenuFoto(avatarContainer);
        } else {
            inputFoto.click();
        }
    });

    inputFoto.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            (window.mostrarToast || alert)('A imagem deve ter no máximo 2MB.', 'warning');
            inputFoto.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async (ev) => {
            const base64 = ev.target.result;
            await salvarFotoPerfil(base64);
            exibirFotoAvatar(base64);
        };
        reader.readAsDataURL(file);
        inputFoto.value = '';
    });
}

function mostrarMenuFoto(anchor) {
    // Remover menu anterior se existir
    const menuExistente = document.querySelector('.foto-menu-popup');
    if (menuExistente) { menuExistente.remove(); return; }

    const menu = document.createElement('div');
    menu.className = 'foto-menu-popup';
    menu.innerHTML = `
        <div class="foto-menu-item" id="foto-alterar"><i class="fas fa-exchange-alt"></i> Alterar foto</div>
        <div class="foto-menu-item foto-menu-remover" id="foto-remover"><i class="fas fa-trash"></i> Remover foto</div>
    `;
    menu.style.cssText = 'position:absolute;top:58px;left:50%;transform:translateX(-50%);background:#1e293b;border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:4px 0;z-index:9999;min-width:140px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';

    const items = menu.querySelectorAll('.foto-menu-item');
    items.forEach(item => {
        item.style.cssText = 'padding:8px 14px;color:rgba(255,255,255,0.85);font-size:12px;cursor:pointer;display:flex;align-items:center;gap:8px;transition:background 0.15s;';
        item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.1)');
        item.addEventListener('mouseleave', () => item.style.background = 'transparent');
    });

    anchor.style.position = 'relative';
    anchor.appendChild(menu);

    menu.querySelector('#foto-alterar').addEventListener('click', (e) => {
        e.stopPropagation();
        menu.remove();
        document.getElementById('input-foto-perfil').click();
    });

    menu.querySelector('#foto-remover').addEventListener('click', async (e) => {
        e.stopPropagation();
        menu.remove();
        await salvarFotoPerfil(null);
        exibirFotoAvatar(null);
    });

    // Fechar ao clicar fora
    setTimeout(() => {
        document.addEventListener('click', function fecharMenu(ev) {
            if (!menu.contains(ev.target)) {
                menu.remove();
                document.removeEventListener('click', fecharMenu);
            }
        });
    }, 10);
}

async function salvarFotoPerfil(fotoBase64) {
    try {
        const token = sessionStorage.getItem('token');
        if (!token) return;

        await fetch(`${API_URL}/usuarios/current/foto`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ foto: fotoBase64 })
        });
    } catch (error) {
        console.error('Erro ao salvar foto:', error);
    }
}

function fecharModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

window.navegarMesModal = navegarMesModal;
window.atualizarBotoesNavegacaoMes = atualizarBotoesNavegacaoMes;

// Exportar sistema de toast globalmente
window.mostrarToast = mostrarToast;
window.fecharToast = fecharToast;
window.mostrarNotificacao = mostrarNotificacao;

// --- CONFIGURAÇÃO NEWSDATA.IO ---
const NEWSDATA_API_KEY = 'pub_5cfccab63ba54e729b804382b4f3d0cb';
let listaNoticias = [];

async function buscarNoticiasAPI() {
    const url = `https://newsdata.io/api/1/news?apikey=${NEWSDATA_API_KEY}&country=br&language=pt&category=top`;
    try {
        const response = await fetch(url);
        const dados = await response.json();
        if (dados.status === "success" && dados.results) {
            return dados.results.map(n => ({
                titulo: n.title,
                fonte: n.source_name || '',
                link: n.link || '#'
            }));
        }
        return [];
    } catch (erro) {
        return [];
    }
}

function renderizarNoticias() {
    const lista = document.getElementById('lista-noticias');
    if (!lista) return;

    if (listaNoticias.length === 0) {
        lista.innerHTML = '<div class="noticia-vazia">Nenhuma notícia disponível</div>';
        return;
    }

    lista.innerHTML = listaNoticias.map(n => `
        <a href="${n.link}" target="_blank" rel="noopener" class="noticia-card">
            <div class="noticia-titulo">${n.titulo}</div>
            <div class="noticia-fonte">${n.fonte}</div>
        </a>
    `).join('');
}

function atualizarBadgeNoticias() {
    const badge = document.getElementById('noticias-count');
    const total = listaNoticias.length;

    if (badge) {
        badge.textContent = total;
        badge.classList.toggle('hidden', total === 0);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    document.getElementById('btn-toggle-noticias')?.addEventListener('click', () => abrirPainelCentral('noticias'));

    // Buscar notícias em background
    listaNoticias = await buscarNoticiasAPI();
    atualizarBadgeNoticias();
    renderizarNoticias();
});

// ================================================================
// PAINEL CENTRAL — lógica compartilhada (notificações + notícias)
// ================================================================

function abrirPainelCentral(aba) {
    const painel = document.getElementById('painel-central');
    if (!painel) return;

    painel.classList.remove('hidden');
    _trocarAbaPainelCentral(aba || 'notificacoes');

    // Fechar ao clicar fora
    setTimeout(() => {
        document.addEventListener('click', _fecharPainelCentralExterno, { once: true, capture: true });
    }, 0);
}

function fecharPainelCentral() {
    document.getElementById('painel-central')?.classList.add('hidden');
    document.removeEventListener('click', _fecharPainelCentralExterno, true);
}

function _fecharPainelCentralExterno(e) {
    const painel = document.getElementById('painel-central');
    if (painel && !painel.contains(e.target)) {
        fecharPainelCentral();
    } else if (painel) {
        // Clicou dentro — re-registrar para próxima vez
        document.addEventListener('click', _fecharPainelCentralExterno, { once: true, capture: true });
    }
}

function _trocarAbaPainelCentral(aba) {
    // Trocar tabs
    document.querySelectorAll('.painel-tab').forEach(btn => {
        btn.classList.toggle('ativo', btn.dataset.tab === aba);
    });

    // Trocar conteúdo
    document.querySelectorAll('.painel-tab-content').forEach(el => {
        el.classList.toggle('ativo', el.id === `tab-${aba}`);
    });

    // Mostrar ações só na aba de notificações
    const acoes = document.getElementById('painel-notif-acoes');
    if (acoes) acoes.classList.toggle('hidden', aba !== 'notificacoes');
}

document.addEventListener('DOMContentLoaded', () => {
    // Fechar painel
    document.getElementById('btn-fechar-painel')?.addEventListener('click', fecharPainelCentral);

    // Trocar abas
    document.querySelectorAll('.painel-tab').forEach(btn => {
        btn.addEventListener('click', () => _trocarAbaPainelCentral(btn.dataset.tab));
    });
});

window.abrirPainelCentral  = abrirPainelCentral;
window.fecharPainelCentral = fecharPainelCentral;



function iniciarAtualizacaoCotacoes() {
    const elemento = document.getElementById('cotacoes') || document.getElementById('cotacoes-compact');
    if (!elemento) return;

    const INTERVALO_ATUALIZACAO = 300000; // 5 minutos

    async function carregarCotacoesEmReal() {
        try {
            // Adicionado BTC-BRL na lista de pares
            const pares = 'USD-BRL,EUR-BRL,GBP-BRL,JPY-BRL,BTC-BRL';
            const response = await fetch(
                `https://economia.awesomeapi.com.br/json/last/${pares}`,
                { cache: 'no-store' }
            );

            if (!response.ok) throw new Error('Falha na rede');
            
            const dados = await response.json();

            // Função de formatação compacta
            const formatarCompacto = (codigo, valor) => {
                const valorNumerico = parseFloat(valor);
                let valorFormatado;

                // Bitcoin mostra valor completo formatado
                if (codigo === 'BTC') {
                    valorFormatado = valorNumerico.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                } else {
                    valorFormatado = valorNumerico.toFixed(2);
                }

                return `<strong>${codigo}</strong> ${valorFormatado}`;
            };

            const cotacoes = [];

            // Incluir apenas USD, EUR e BTC (as mais relevantes)
            if (dados.USDBRL) cotacoes.push(formatarCompacto('USD', dados.USDBRL.bid));
            if (dados.EURBRL) cotacoes.push(formatarCompacto('EUR', dados.EURBRL.bid));
            if (dados.BTCBRL && dados.USDBRL) {
                const btcUsd = parseFloat(dados.BTCBRL.bid) / parseFloat(dados.USDBRL.bid);
                const btcUsdFormatado = btcUsd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                cotacoes.push(`<strong>BTC</strong> $${btcUsdFormatado}`);
            }

            elemento.innerHTML = cotacoes.join(' <span style="margin: 0 6px; color: #ddd;">·</span> ');

            if (elemento.parentElement) {
                elemento.parentElement.title = 'Última atualização: ' + new Date().toLocaleTimeString();
            }

        } catch (erro) {
            elemento.innerText = 'Câmbio indisponível';
            console.error('Erro ao atualizar cotações:', erro);
        }
    }

    carregarCotacoesEmReal();
    setInterval(carregarCotacoesEmReal, INTERVALO_ATUALIZACAO);
}

document.addEventListener('DOMContentLoaded', iniciarAtualizacaoCotacoes);

// ================================================================
// COFRE — ACESSO COM SENHA
// ================================================================

function abrirCofre(tab) {
    const abrirInterno = () => _abrirModalCofreInterno(tab);
    if (localStorage.getItem('cofre_senha_desabilitada') === 'true') {
        abrirInterno();
    } else if (typeof window.mostrarLockScreenParaVerificacao === 'function') {
        window.mostrarLockScreenParaVerificacao(abrirInterno);
    } else {
        abrirInterno();
    }
}

function _abrirModalCofreInterno(tab) {
    if (typeof window.abrirModalReservarValor === 'function') {
        window.abrirModalReservarValor();
    }
    // Sincronizar checkbox ao abrir
    const chk = document.getElementById('chk-desabilitar-senha-cofre');
    if (chk) chk.checked = localStorage.getItem('cofre_senha_desabilitada') === 'true';
    // (abas removidas — modal unificado de Reservas)
}

window.abrirCofre = abrirCofre;

// Checkbox desabilitar senha do Cofre
document.addEventListener('DOMContentLoaded', function() {
    const chkDesabilitar = document.getElementById('chk-desabilitar-senha-cofre');
    if (chkDesabilitar) {
        chkDesabilitar.addEventListener('change', function() {
            if (this.checked) {
                localStorage.setItem('cofre_senha_desabilitada', 'true');
            } else {
                localStorage.removeItem('cofre_senha_desabilitada');
            }
        });
    }

    // Botão Reservas na toolbar de detalhe do mês
    document.getElementById('btn-cofre-detalhe-mes')?.addEventListener('click', () => abrirCofre());

    // Event delegation para elementos com data-action="abrir-cofre"
    document.addEventListener('click', function(e) {
        const el = e.target.closest('[data-action="abrir-cofre"]');
        if (el) abrirCofre(el.dataset.cofre || undefined);
    });
});
