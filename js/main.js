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
    await carregarVersaoSistema(); // Carregar versão do backend

    if (!dadosFinanceiros[anoAtual]) {
        abrirModalNovoAno();
    } else {
        await carregarDadosDashboard(anoAtual);
        await renderizarMeses(anoAtual);

        // Garantir que dashboard inicia visível (sem recarregar)
        setTimeout(() => {
            const dashboardLink = document.querySelector('[data-section="dashboard"]');
            if (dashboardLink && !dashboardLink.classList.contains('active')) {
                dashboardLink.click();
            }
        }, 200);
    }

    notificarSistemaReady();
}

// ================================================================
// CARREGAR VERSÃO DO SISTEMA
// ================================================================
async function carregarVersaoSistema() {
    try {
        const response = await fetch('https://sistema-financeiro-backend-o199.onrender.com/version');
        if (response.ok) {
            const data = await response.json();
            const versionElement = document.getElementById('system-version');
            const dateElement = document.getElementById('system-update-date');

            if (versionElement && data.version) {
                versionElement.textContent = data.version;
            }

            if (dateElement && data.timestamp) {
                const date = new Date(data.timestamp);
                const formattedDate = date.toLocaleDateString('pt-BR');
                dateElement.textContent = formattedDate;
            }
        }
    } catch (error) {
        console.warn('Não foi possível carregar versão do sistema:', error);
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
    window.obterSaldoAnterior = obterSaldoAnterior;

    window.abrirDetalhesDoMes = abrirDetalhesDoMes;
    window.renderizarMeses = renderizarMeses;
    window.renderizarDetalhesDoMes = renderizarDetalhesDoMes;
    window.carregarDadosDashboard = carregarDadosDashboard;
    window.atualizarResumoAnual = atualizarResumoAnual;
    window.atualizarResumoMesAtual = atualizarResumoMesAtual;
    window.atualizarLimitesCartoes = atualizarLimitesCartoes;
    window.calcularLimiteCartao = calcularLimiteCartao;
    window.carregarCartoesDoServidor = carregarCartoesDoUsuario;

    // Funções de fechamento de mês
    window.fecharMes = fecharMes;
    window.reabrirMes = reabrirMes;
    window.criarReceitaSaldoAnterior = criarReceitaSaldoAnterior;
    window.removerReceitaSaldoAnterior = removerReceitaSaldoAnterior;
    window.verificarFechamentoAutomatico = verificarFechamentoAutomatico;

    
    
    window.calcularTotalDespesas = function(despesas) {
        if (!Array.isArray(despesas)) return 0;
        return despesas.reduce((total, despesa) => {
            return total + (window.obterValorRealDespesa ? window.obterValorRealDespesa(despesa) : (despesa.valor || 0));
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
        // ✅ Aguardar inicialização do usuarioDataManager
        if (window.usuarioDataManager) {
            // Aguardar até que o usuarioDataManager esteja pronto
            let tentativas = 0;
            const maxTentativas = 50;
            while (!window.usuarioDataManager.inicializado && tentativas < maxTentativas) {
                await new Promise(resolve => setTimeout(resolve, 100));
                tentativas++;
            }
        }

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

        // ✅ Carregar cartões do usuário antes do dashboard
        await carregarCartoesDoUsuario();

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

        const response = await fetch(`${API_URL}/usuarios/${usuario.id}/cartoes`, {
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
            console.log('✅ Cartões carregados:', cartoes);

            // ✅ CORREÇÃO AUTOMÁTICA: Atualizar despesas de crédito sem cartao_id
            // Pegar o primeiro cartão de crédito ativo para corrigir despesas antigas
            const cartaoCredito = cartoes.find(c => c.ativo && c.banco && c.banco.toLowerCase().includes('cred'));
            if (cartaoCredito && cartaoCredito.id) {
                await corrigirDespesasSemCartao(cartaoCredito.id, token);
            } else if (cartoes.length > 0 && cartoes[0].id) {
                // Usar o primeiro cartão disponível
                await corrigirDespesasSemCartao(cartoes[0].id, token);
            }
        } else {
            window.cartoesUsuario = [];
        }

    } catch (error) {
        console.error('Erro ao carregar cartões:', error);
        window.cartoesUsuario = [];
    }
}

/**
 * Corrige despesas de crédito que não têm cartao_id válido
 */
async function corrigirDespesasSemCartao(cartaoId, token) {
    try {
        const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

        const response = await fetch(`${API_URL}/despesas/corrigir-cartao`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ cartao_id: cartaoId })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success && data.quantidade > 0) {
                console.log(`✅ ${data.quantidade} despesa(s) corrigida(s) com cartao_id=${cartaoId}`);

                // ✅ RECARREGAR DADOS FINANCEIROS APÓS CORREÇÃO
                // Isso garante que os dados em memória tenham o cartao_id atualizado
                if (window.usuarioDataManager) {
                    // Limpar cache para forçar nova requisição
                    if (typeof window.usuarioDataManager.limparCache === 'function') {
                        window.usuarioDataManager.limparCache();
                    }

                    if (typeof window.usuarioDataManager.getDadosFinanceirosUsuario === 'function') {
                        dadosFinanceiros = await window.usuarioDataManager.getDadosFinanceirosUsuario();
                        window.dadosFinanceiros = dadosFinanceiros;
                        console.log('✅ Dados financeiros recarregados após correção');

                        // Atualizar dashboard se visível
                        if (typeof atualizarDashboard === 'function') {
                            atualizarDashboard();
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Erro ao corrigir despesas sem cartão:', error);
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
    
    atualizarDisplayAno(anoAtual);
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
    // ✅ Botões de navegação de ano
    const btnAnoAnterior = document.getElementById('btn-ano-anterior');
    const btnProximoAno = document.getElementById('btn-proximo-ano');
    const btnAnoAtualDisplay = document.getElementById('ano-atual-btn');
    const dropdownAnos = document.getElementById('dropdown-anos');

    // ✅ Menu de gerenciamento de ano
    const btnAnoMenu = document.getElementById('btn-ano-menu');
    const dropdownAnoMenu = document.getElementById('dropdown-ano-menu');
    const btnNovoAnoMenu = document.getElementById('btn-novo-ano-menu');
    const btnExcluirAnoMenu = document.getElementById('btn-excluir-ano-menu');

    // ✅ Botões antigos (manter compatibilidade)
    const btnNovoAno = document.getElementById('btn-novo-ano');
    const btnExcluirAno = document.getElementById('btn-excluir-ano-atual');

    // Navegação anterior/próximo
    if (btnAnoAnterior) {
        btnAnoAnterior.addEventListener('click', () => mudarAno(anoAtual - 1));
    }

    if (btnProximoAno) {
        btnProximoAno.addEventListener('click', () => mudarAno(anoAtual + 1));
    }

    // ✅ Dropdown de anos ao clicar no ano atual
    if (btnAnoAtualDisplay && dropdownAnos) {
        btnAnoAtualDisplay.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownAnos.classList.toggle('show');

            if (dropdownAnos.classList.contains('show')) {
                preencherDropdownAnos();
            }
        });
    }

    // ✅ Menu de gerenciamento de ano
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

    // Manter compatibilidade com botões antigos
    if (btnNovoAno) {
        btnNovoAno.addEventListener('click', abrirModalNovoAno);
    }

    if (btnExcluirAno) {
        btnExcluirAno.addEventListener('click', () => excluirAno(anoAtual));
    }

    // ✅ Fechar dropdowns ao clicar fora
    document.addEventListener('click', () => {
        if (dropdownAnos) dropdownAnos.classList.remove('show');
        if (dropdownAnoMenu) dropdownAnoMenu.classList.remove('show');
    });

    const formNovoAno = document.getElementById('form-novo-ano');
    if (formNovoAno) {
        formNovoAno.addEventListener('submit', criarNovoAno);
    }
}

// ✅ Preencher dropdown com anos disponíveis
function preencherDropdownAnos() {
    const dropdownAnos = document.getElementById('dropdown-anos');
    if (!dropdownAnos) return;

    const anosDisponiveis = Object.keys(window.dadosFinanceiros || {})
        .map(ano => parseInt(ano))
        .sort((a, b) => b - a); // Mais recente primeiro

    dropdownAnos.innerHTML = '';

    if (anosDisponiveis.length === 0) {
        dropdownAnos.innerHTML = '<button class="btn btn-secondary" disabled>Nenhum ano disponível</button>';
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

// ✅ Atualizar display do ano no botão
function atualizarDisplayAno(ano) {
    const btnAnoAtualDisplay = document.getElementById('ano-atual-btn');
    if (btnAnoAtualDisplay) {
        btnAnoAtualDisplay.textContent = ano;
    }

    // Manter compatibilidade com elemento antigo
    atualizarElemento('ano-atual', ano);
}

// ✅ Função removida - saldo agora está apenas no dashboard

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

            // Também controlar o conteúdo contextual da toolbar (lado direito)
            document.querySelectorAll('.tab-toolbar-content').forEach(content => content.classList.remove('active'));

            // Controlar ações contextuais (lado esquerdo)
            document.querySelectorAll('.toolbar-esquerda .toolbar-acoes').forEach(acoes => acoes.classList.remove('active'));

            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            const tabContent = document.getElementById(tabId);
            if (tabContent) {
                tabContent.classList.add('active');
            }

            // Ativar conteúdo contextual correspondente na toolbar (lado direito)
            const toolbarContent = document.querySelector(`.tab-toolbar-content[data-for-tab="${tabId}"]`);
            if (toolbarContent) {
                toolbarContent.classList.add('active');
            }

            // Ativar ações contextuais correspondentes (lado esquerdo)
            const toolbarAcoes = document.querySelector(`.toolbar-esquerda .toolbar-acoes[data-for-tab="${tabId}"]`);
            if (toolbarAcoes) {
                toolbarAcoes.classList.add('active');
            }
        });
    });

    // Configurar eventos dos botões da toolbar
    setupToolbarButtons();
}

function setupToolbarButtons() {
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

    // Botão Reservas na toolbar
    const btnReservasToolbar = document.getElementById('btn-reservas-toolbar');
    if (btnReservasToolbar) {
        btnReservasToolbar.addEventListener('click', function(e) {
            e.preventDefault();
            if (typeof window.abrirModalReservarValor === 'function') {
                window.abrirModalReservarValor();
            }
        });
    }
}

// Função de atualização do contador da toolbar (usada pelo despesas.js)
function atualizarContadorToolbar(visiveis, total, valorTotal) {
    const contador = document.getElementById('contador-despesas-toolbar');
    if (contador) {
        if (visiveis === total) {
            contador.textContent = `${total} itens`;
        } else {
            contador.textContent = `${visiveis}/${total}`;
        }
    }

    // Atualizar valor total
    const totalElement = document.getElementById('total-despesas-toolbar');
    if (totalElement && valorTotal !== undefined) {
        totalElement.textContent = formatarMoeda(valorTotal);
    }
}

// Atualizar saldos na toolbar de receitas
function atualizarSaldosToolbar(saldoAtual, reservado) {
    const saldoElement = document.getElementById('toolbar-saldo-atual');
    const reservadoElement = document.getElementById('toolbar-reservado');

    if (saldoElement) {
        saldoElement.textContent = formatarMoeda(saldoAtual || 0);
    }
    if (reservadoElement) {
        reservadoElement.textContent = formatarMoeda(reservado || 0);
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
window.atualizarSaldosToolbar = atualizarSaldosToolbar;
window.atualizarCategoriasToolbar = atualizarCategoriasToolbar;
window.atualizarContadorToolbar = atualizarContadorToolbar;

function setupOutrosControles() {
    const refreshBtn = document.getElementById('btn-refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            const icon = this.querySelector('i');
            icon.classList.add('fa-spin');

            // Limpar cache do usuarioDataManager
            if (window.usuarioDataManager && typeof window.usuarioDataManager.limparCache === 'function') {
                window.usuarioDataManager.limparCache();
            }

            // Recarregar dados principais
            await carregarDadosLocais();
            await carregarDadosDashboard(anoAtual);
            await renderizarMeses(anoAtual);

            // Recarregar categorias
            if (typeof window.carregarCategoriasDoServidor === 'function') {
                await window.carregarCategoriasDoServidor();
            }

            // Recarregar cartões
            if (typeof window.carregarCartoesDoServidor === 'function') {
                await window.carregarCartoesDoServidor();
            }

            // Recarregar notificações
            if (typeof window.carregarNotificacoes === 'function') {
                await window.carregarNotificacoes();
            }

            // Recarregar seção ativa
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
            alert('Por favor, digite sua senha.');
            return;
        }

        try {
            const token = sessionStorage.getItem('token') || localStorage.getItem('token');

            if (!token) {
                alert('Sessão expirada. Faça login novamente.');
                window.location.href = 'login.html';
                return;
            }

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
            console.error('Erro ao verificar senha:', error);
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
        atualizarDisplayAno(anoAtual);
        
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
            if (window.mostrarToast) {
                window.mostrarToast(`O ano ${ano} já existe!`, 'warning');
            } else {
                alert(`O ano ${ano} já existe!`);
            }
            return;
        }

        // ✅ Salvar ano no backend primeiro
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
        await renderizarMeses(anoAtual);

        if (window.mostrarToast) {
            window.mostrarToast(`Ano ${ano} criado com sucesso!`, 'success');
        } else {
            alert(`Ano ${ano} criado com sucesso!`);
        }

    } catch (error) {
        console.error('Erro ao criar ano:', error);
        if (window.mostrarToast) {
            window.mostrarToast('Erro ao criar ano: ' + error.message, 'error');
        } else {
            alert('Erro ao criar ano: ' + error.message);
        }
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

        // ✅ Carregar reservas para calcular saldo disponível nos cards
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

    // Calcular reservas acumuladas até este mês para descontar do saldo
    let reservasAcumuladas = 0;
    if (typeof window.calcularTotalReservasAcumuladas === 'function') {
        reservasAcumuladas = window.calcularTotalReservasAcumuladas(mes, ano);
    } else if (window.reservasCache && Array.isArray(window.reservasCache)) {
        // Fallback: calcular manualmente das reservas em cache
        reservasAcumuladas = window.reservasCache
            .filter(r => {
                const rAno = parseInt(r.ano);
                const rMes = parseInt(r.mes);
                return rAno < ano || (rAno === ano && rMes <= mes);
            })
            .reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
    }

    // Saldo disponível = saldo final - reservas acumuladas
    const saldoDisponivel = saldo.saldoFinal - reservasAcumuladas;

    // Saldo anterior disponível = saldo anterior - reservas anteriores
    let reservasAnteriores = 0;
    if (mes > 0 || ano > Math.min(...Object.keys(dadosFinanceiros).map(Number))) {
        if (window.reservasCache && Array.isArray(window.reservasCache)) {
            const mesAnterior = mes === 0 ? 11 : mes - 1;
            const anoAnterior = mes === 0 ? ano - 1 : ano;
            reservasAnteriores = window.reservasCache
                .filter(r => {
                    const rAno = parseInt(r.ano);
                    const rMes = parseInt(r.mes);
                    return rAno < anoAnterior || (rAno === anoAnterior && rMes <= mesAnterior);
                })
                .reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
        }
    }
    const saldoAnteriorDisponivel = saldo.saldoAnterior - reservasAnteriores;

    // Criar objeto de saldo ajustado para o card
    const saldoAjustado = {
        saldoAnterior: saldoAnteriorDisponivel,
        receitas: saldo.receitas,
        despesas: saldo.despesas,
        saldoFinal: saldoDisponivel
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
            anexos: r.anexos || []
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
            anexos: d.anexos || [],
            metadados: d.metadados || null,
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
        const totalEconomias = typeof window.calcularTotalEconomias === 'function' ?
                          window.calcularTotalEconomias(despesas || []) : 0;

        // Carregar reservas antes de atualizar o resumo (para descontar do saldo)
        if (typeof window.carregarReservasAPI === 'function') {
            await window.carregarReservasAPI();
        }

        atualizarResumoDetalhes(saldo, totalJuros, totalEconomias);
        atualizarLimitesCartoes(mes, ano);
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

        // ✅ NOVO: Forçar inicialização dos resizers de coluna após renderização
        setTimeout(() => {
            // Reinicializar resizer de receitas
            if (typeof window.reinitReceitasResizer === 'function') {
                window.reinitReceitasResizer();
            }
            // Reinicializar resizer de despesas
            if (typeof window.reinitDespesasResizer === 'function') {
                window.reinitDespesasResizer();
            }
        }, 100);

    } catch (error) {
        console.error('❌ Erro ao carregar dados do mês:', error);
        if (window.mostrarToast) {
            window.mostrarToast('Erro ao carregar dados do mês: ' + error.message, 'error');
        } else {
            alert('Erro ao carregar dados do mês: ' + error.message);
        }
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

function atualizarResumoDetalhes(saldo, totalJuros, totalEconomias = 0) {
    // Receitas do Mês = apenas receitas cadastradas no mês (sem saldo anterior, sem reservas)
    const receitasMes = saldo.receitas;

    // Despesas do Mês = despesas cadastradas no mês
    const despesasMes = saldo.despesas;

    // Saldo Atual Mês = Receitas do mês - Despesas do mês + Acumulado do mês anterior
    const saldoAtualMes = receitasMes - despesasMes + saldo.saldoAnterior;

    atualizarElemento('resumo-receitas', formatarMoeda(receitasMes));
    atualizarElemento('resumo-despesas', formatarMoeda(despesasMes));
    atualizarElemento('resumo-juros', formatarMoeda(totalJuros));
    atualizarElemento('resumo-economias', formatarMoeda(totalEconomias));

    const saldoElement = document.getElementById('resumo-saldo');
    if (saldoElement) {
        saldoElement.textContent = formatarMoeda(saldoAtualMes);
        saldoElement.className = 'card-value';
    }
}

// Atualiza apenas o resumo do mês aberto (para quando reservas mudam)
function atualizarResumoMesAtual() {
    if (mesAberto === null || anoAberto === null) return;

    const despesas = dadosFinanceiros[anoAberto]?.meses[mesAberto]?.despesas || [];
    const saldo = calcularSaldoMes(mesAberto, anoAberto);
    const totalJuros = typeof window.calcularTotalJuros === 'function' ?
                      window.calcularTotalJuros(despesas) : 0;
    const totalEconomias = typeof window.calcularTotalEconomias === 'function' ?
                      window.calcularTotalEconomias(despesas) : 0;

    atualizarResumoDetalhes(saldo, totalJuros, totalEconomias);
}

function ativarPrimeiraAba() {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.querySelectorAll('.tab-toolbar-content').forEach(content => content.classList.remove('active'));
    document.querySelectorAll('.toolbar-esquerda .toolbar-acoes').forEach(acoes => acoes.classList.remove('active'));

    const primeiraAba = document.querySelector('.tab-btn[data-tab="tab-resumo"]');
    const primeiroConteudo = document.getElementById('tab-resumo');
    const primeiroToolbarContent = document.querySelector('.tab-toolbar-content[data-for-tab="tab-resumo"]');

    if (primeiraAba) primeiraAba.classList.add('active');
    if (primeiroConteudo) primeiroConteudo.classList.add('active');
    if (primeiroToolbarContent) primeiroToolbarContent.classList.add('active');
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

        // ✅ Carregar reservas para calcular saldo disponível
        if (typeof window.carregarReservasAPI === 'function') {
            await window.carregarReservasAPI();
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

    // Saldo inicial do ano (saldo final do ano anterior)
    const saldoInicialAno = obterSaldoAnterior(0, ano);

    let receitasAno = 0;
    let totalDespesas = 0;
    let totalJuros = 0;
    let totalEconomias = 0;

    for (let mes = 0; mes < 12; mes++) {
        const dadosMes = dadosFinanceiros[ano].meses[mes] || { receitas: [], despesas: [] };

        // Receitas do mês (excluindo saldo anterior automático)
        const receitasMes = (dadosMes.receitas || []).reduce((sum, r) => {
            if (r.saldoAnterior === true ||
                r.descricao?.includes('Saldo Anterior') ||
                r.automatica === true) {
                return sum;
            }
            return sum + (r.valor || 0);
        }, 0);

        receitasAno += receitasMes;

        const despesasMes = typeof window.calcularTotalDespesas === 'function' ?
                           window.calcularTotalDespesas(dadosMes.despesas) :
                           dadosMes.despesas.reduce((sum, d) => sum + (d.valor || 0), 0);

        totalDespesas += despesasMes;
        totalJuros += typeof window.calcularTotalJuros === 'function' ? window.calcularTotalJuros(dadosMes.despesas) : 0;
        totalEconomias += typeof window.calcularTotalEconomias === 'function' ? window.calcularTotalEconomias(dadosMes.despesas) : 0;
    }

    // Total de reservas do ano
    let totalReservado = 0;
    if (window.reservasCache && Array.isArray(window.reservasCache)) {
        totalReservado = window.reservasCache
            .filter(r => parseInt(r.ano) === ano)
            .reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
    }

    // Receitas Totais = saldo inicial + receitas do ano - reservas
    const receitasTotais = saldoInicialAno + receitasAno - totalReservado;

    // Saldo Atual = Receitas Totais - Despesas
    const saldoAtual = receitasTotais - totalDespesas;

    atualizarElementosDashboard({
        totalReceitas: receitasTotais,
        totalDespesas: totalDespesas,
        totalJuros: totalJuros,
        totalEconomias: totalEconomias,
        saldo: saldoAtual
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
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Nenhum cartão cadastrado</p>';
        return;
    }

    // Filtrar apenas cartões ativos
    const cartoesAtivos = cartoes.filter(c => c.ativo);

    if (cartoesAtivos.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Nenhum cartão ativo</p>';
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

        const despesas = typeof window.calcularTotalDespesas === 'function' ?
                        window.calcularTotalDespesas(dadosMes.despesas || []) :
                        (dadosMes.despesas || []).reduce((sum, d) => sum + (window.obterValorRealDespesa ? window.obterValorRealDespesa(d) : (d.valor || 0)), 0);

        // Saldo Final = Saldo Anterior + Receitas - Despesas (SEM descontar reservas)
        // Reservas são separadas e só afetam o "Saldo Disponível" no resumo
        return {
            saldoAnterior: saldoAnterior,
            receitas: receitas,
            despesas: despesas,
            saldoFinal: saldoAnterior + receitas - despesas
        };

    } catch (error) {
        return {
            saldoAnterior: 0,
            receitas: 0,
            despesas: 0,
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
        // ✅ CHAMAR ENDPOINT DA API PARA FECHAR MÊS
        const token = sessionStorage.getItem('token');
        const response = await fetch(`${API_URL}/meses/${ano}/${mes}/fechar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                saldo_final: saldo.saldoFinal
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

        if (typeof window.renderizarMeses === 'function') {
            await window.renderizarMeses(ano);
        }

        if (proximoAno !== ano && typeof window.renderizarMeses === 'function') {
            setTimeout(async () => await window.renderizarMeses(proximoAno), 100);
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
        // ✅ CHAMAR ENDPOINT DA API PARA REABRIR MÊS
        const token = sessionStorage.getItem('token');
        const response = await fetch(`${API_URL}/meses/${ano}/${mes}/reabrir`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
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

        if (typeof window.renderizarMeses === 'function') {
            await window.renderizarMeses(ano);

            if (proximoAno !== ano) {
                setTimeout(async () => await window.renderizarMeses(proximoAno), 100);
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
    if (!dataString) return '';
    try {
        // Adiciona T00:00:00 para evitar problema de timezone
        const data = typeof dataString === 'string' && !dataString.includes('T')
            ? new Date(dataString + 'T00:00:00')
            : new Date(dataString);

        if (isNaN(data.getTime())) return 'Data inválida';

        const dia = String(data.getDate()).padStart(2, '0');
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const ano = data.getFullYear();
        return `${dia}/${mes}/${ano}`;
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

// Função removida - usar window.obterValorRealDespesa de despesas.js

// ================================================================
// ADICIONAR NO FINAL DO main.js - FUNÇÕES PARA CARTÕES
// ================================================================

window.calcularUsoCartoes = function(mes, ano) {
    // Usar cartao_id (ID real do banco) em vez de posição
    const cartoesUsuario = window.cartoesUsuario || [];
    const usoCartoes = {};

    // Inicializar uso para cada cartão pelo ID
    cartoesUsuario.forEach(cartao => {
        usoCartoes[cartao.id] = 0;
    });

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

                const formaPag = (despesa.formaPagamento || '').toLowerCase();
                const eCreditoOuVariacao = formaPag === 'credito' || formaPag === 'crédito' ||
                                            formaPag === 'cred-merpago' || formaPag === 'créd-merpago';

                // Verificar se está paga (verificar ambos campos: pago e quitado)
                const estaPaga = despesa.pago === true || despesa.pago === 'true' || despesa.pago === 1 ||
                                 despesa.quitado === true || despesa.quitado === 'true' || despesa.quitado === 1;

                if (!eCreditoOuVariacao || estaPaga || despesa.recorrente) return;

                // Verificar cartao_id (ID real do banco)
                let cartaoIdDespesa = despesa.cartao_id || despesa.cartaoId;

                // Fallback para despesas antigas que usam numeroCartao (posição)
                if (!cartaoIdDespesa && despesa.numeroCartao) {
                    const cartaoNaPosicao = cartoesUsuario[parseInt(despesa.numeroCartao) - 1];
                    if (cartaoNaPosicao) {
                        cartaoIdDespesa = cartaoNaPosicao.id;
                    }
                }

                if (cartaoIdDespesa && usoCartoes[cartaoIdDespesa] !== undefined) {
                    const valorDespesa = window.obterValorRealDespesa ? window.obterValorRealDespesa(despesa) : (despesa.valor || 0);
                    usoCartoes[cartaoIdDespesa] += valorDespesa;
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
            const numeroFormatado = cartao.numero ? `#${cartao.numero.toString().padStart(3, '0')} - ` : '';
            if (nomeDisplay) nomeDisplay.textContent = `${numeroFormatado}${cartao.nome}` || `Cartão ${num}`;
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
    "2026-01-01": "Você sabia que hoje começa o ano fiscal em muitos países? É o momento perfeito para o planejamento orçamentário, essencial para governos, empresas e famílias.",
    "2026-01-05": "Já parou para pensar em como o governo decide onde gastar? O orçamento público, definido hoje, dita como os recursos serão arrecadados e aplicados no ano.",
    "2026-01-15": "Você sabe qual é o papel dos Bancos Centrais? Eles são as instituições fundamentais para controlar a inflação e calibrar os juros de uma economia.",
    
    "2026-02-01": "Atenção ao seu bolso: a inflação ocorre quando os preços sobem de forma contínua, fazendo com que o poder de compra da população diminua.",
    "2026-02-05": "Fique de olho no IPCA! Esse índice mede a inflação oficial do Brasil e impacta diretamente salários, benefícios e contratos.",
    "2026-02-15": "Entenda o dilema dos juros: taxas altas combatem a inflação, mas podem frear a economia. Já juros baixos são usados para estimular o consumo.",
    
    "2026-03-01": "Você sabia que o PIB é o 'termômetro' de um país? Ele mede a soma de todas as riquezas produzidas em um determinado período.",
    "2026-03-05": "Como a Taxa Selic te afeta? Ela influencia desde o custo de empréstimos e financiamentos até o rendimento das suas aplicações financeiras.",
    "2026-03-15": "Vai viajar ou comprar algo de fora? O câmbio e a oscilação da moeda afetam diretamente as importações, exportações e o turismo internacional.",
    
    "2026-04-01": "Você sabia que vivemos em um mundo conectado? A globalização econômica une países pelo comércio, mas também transmite crises financeiras com rapidez.",
    "2026-04-05": "Para onde vai o seu imposto? É através dele que o Estado financia serviços públicos essenciais, como saúde, educação e infraestrutura.",
    
    "2026-05-01": "No Dia do Trabalho, lembre-se: o emprego formal é um motor econômico que aumenta a renda, o consumo e a arrecadação de impostos.",
    "2026-05-05": "O poder de empreender: você sabia que o empreendedorismo impulsiona a inovação e é um dos maiores geradores de empregos no país?",
    
    "2026-06-01": "Lição do dia: crises econômicas, embora difíceis, ensinam a importância vital de manter reservas financeiras e políticas fiscais responsáveis.",
    "2026-06-05": "Você sabe como o dinheiro circula? O sistema bancário funciona como a ponte que conecta quem quer poupar com quem precisa de crédito.",
    
    "2026-07-01": "O que é a dívida pública? Governos se endividam para investir no país, mas precisam manter o equilíbrio para que a conta seja sustentável.",
    "2026-07-05": "Déficit ou Superávit? Esses termos indicam, de forma simples, se o governo está gastando mais ou menos do que consegue arrecadar.",
    
    "2026-08-01": "Como o mercado financeiro ajuda o país? Ele canaliza recursos de investidores para projetos produtivos que geram crescimento econômico.",
    "2026-08-05": "A força das exportações: vender para o exterior fortalece a economia nacional ao gerar divisas (moeda estrangeira) e novos empregos.",
    
    "2026-09-01": "Você entende a política monetária? Ela é a ferramenta que influencia o crédito, o consumo e os investimentos no curto e médio prazo.",
    "2026-09-05": "O valor da indústria: você sabia que ela é vital por transformar matérias-primas em produtos de maior valor, acelerando o desenvolvimento.",
    
    "2026-10-01": "Dica de ouro: a educação financeira ajuda as famílias a evitar o endividamento excessivo e a planejar um futuro mais tranquilo.",
    "2026-10-05": "O impacto social na economia: programas de auxílio movimentam o comércio local e ajudam a reduzir as desigualdades do país.",
    
    "2026-11-01": "Conexão global: o comércio internacional permite ganhos de escala para as empresas, mas sua eficiência depende da estabilidade do câmbio.",
    "2026-11-05": "Consuma com consciência! Pequenas mudanças de hábito ajudam a manter o equilíbrio financeiro e a saúde do orçamento familiar.",
    
    "2026-12-01": "O futuro é sustentável: o verdadeiro crescimento econômico deve equilibrar desenvolvimento, inclusão social e preservação do meio ambiente.",
    "2026-12-05": "Hora de planejar 2027! Um bom planejamento financeiro anual prepara famílias e empresas para o sucesso no próximo ciclo econômico."
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
let listaNoticias = [];
let noticiaAtualIndex = 0;
let intervaloNoticias = null;
let noticiasAtivas = false;

async function buscarNoticiasAPI() {
    const url = `https://newsdata.io/api/1/news?apikey=${NEWSDATA_API_KEY}&country=br&language=pt&category=top`;
    try {
        const response = await fetch(url);
        const dados = await response.json();
        if (dados.status === "success" && dados.results) {
            return dados.results.map(n => n.title); // Retorna uma lista de títulos
        }
        return ["Buscando novas atualizações no Brasil..."];
    } catch (erro) {
        return ["Conectando ao servidor de notícias..."];
    }
}

function mostrarProximaNoticia() {
    const conteudo = document.getElementById('conteudo-noticias');
    if (!conteudo || listaNoticias.length === 0) return;

    // Aplica o texto da notícia atual
    conteudo.innerHTML = `<div class="marquee-content">${listaNoticias[noticiaAtualIndex]}</div>`;

    // Incrementa o índice para a próxima notícia
    noticiaAtualIndex = (noticiaAtualIndex + 1) % listaNoticias.length;
}

async function toggleNoticias() {
    const marquee = document.getElementById('marquee-noticias');
    const conteudo = document.getElementById('conteudo-noticias');
    
    noticiasAtivas = !noticiasAtivas;

    if (noticiasAtivas) {
        marquee.style.display = 'flex';
        conteudo.innerHTML = '<div class="marquee-content">Carregando notícias reais...</div>';
        
        // Busca as notícias e inicia o ciclo
        listaNoticias = await buscarNoticiasAPI();
        noticiaAtualIndex = 0;
        
        mostrarProximaNoticia();
        
        // Define o intervalo de 30 segundos para trocar a notícia
        intervaloNoticias = setInterval(mostrarProximaNoticia, 10000);
    } else {
        marquee.style.display = 'none';
        clearInterval(intervaloNoticias); // Para o cronômetro
        conteudo.innerHTML = "";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById('btn-toggle-noticias');
    if (btn) {
        btn.onclick = toggleNoticias;
        // Iniciar notícias automaticamente
        toggleNoticias();
    }
});






function iniciarAtualizacaoCotacoes() {
    // ✅ Suportar ambos os elementos (antigo e novo)
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
            if (dados.BTCBRL) cotacoes.push(formatarCompacto('BTC', dados.BTCBRL.bid));

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

// IMPORTANTE: Chame a função para ela começar a rodar!
document.addEventListener('DOMContentLoaded', iniciarAtualizacaoCotacoes);

// Executar quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', configurarEventListeners);