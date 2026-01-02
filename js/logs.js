// ================================================================
// SISTEMA DE LOGS / REGISTROS
// ================================================================
// Este arquivo gerencia o sistema de auditoria e logs do sistema
// Registra todas as operações realizadas pelos usuários
// ================================================================

// ================================================================
// VARIÁVEIS GLOBAIS
// ================================================================

let logsCache = [];
let paginaAtual = 1;
const LOGS_POR_PAGINA = 50;
let usandoBackend = true; // Controla se usa backend ou localStorage

// ================================================================
// INICIALIZAÇÃO
// ================================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('📋 Módulo de Logs carregado');

    // Inicializar event listeners
    inicializarEventListeners();
});

/**
 * Inicializa todos os event listeners da página de logs
 */
function inicializarEventListeners() {
    // Botão de exportar
    const btnExportarLogs = document.getElementById('btn-exportar-logs');

    if (btnExportarLogs) {
        btnExportarLogs.addEventListener('click', exportarLogs);
    }

    // Botões de paginação
    const btnAnterior = document.getElementById('btn-pagina-anterior');
    const btnProxima = document.getElementById('btn-pagina-proxima');

    if (btnAnterior) {
        btnAnterior.addEventListener('click', () => mudarPagina(-1));
    }

    if (btnProxima) {
        btnProxima.addEventListener('click', () => mudarPagina(1));
    }
}

// ================================================================
// FUNÇÃO PRINCIPAL: REGISTRAR LOG
// ================================================================

/**
 * Registra um log no sistema
 * @param {string} modulo - Módulo do sistema (receita, despesa, categoria, etc)
 * @param {string} acao - Descrição da ação realizada
 * @param {string} status - Status da operação (sucesso, erro, info)
 * @param {string} detalhes - Detalhes adicionais sobre a operação
 */
async function registrarLog(modulo, acao, status = 'sucesso', detalhes = '') {
    try {
        const usuario = localStorage.getItem('nomeUsuario') || sessionStorage.getItem('nomeUsuario') || 'Sistema';
        const agora = new Date();

        const log = {
            modulo: modulo.toLowerCase(),
            acao: acao,
            status: status.toLowerCase(),
            detalhes: detalhes,
            usuario: usuario,
            dataHora: agora.toISOString()
        };

        console.log('📝 Tentando registrar log:', log);

        // Sempre salvar no localStorage como backup
        salvarLogLocal(log);

        // Tentar salvar no backend
        if (usandoBackend) {
            try {
                const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';
                const token = sessionStorage.getItem('token') || localStorage.getItem('token');

                const response = await fetch(`${API_URL}/logs`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(log)
                });

                if (!response.ok) {
                    console.warn('⚠️ Falha ao salvar log no servidor:', response.status);
                    console.log('💾 Usando armazenamento local');
                } else {
                    console.log('✅ Log registrado no servidor e localStorage');
                }
            } catch (error) {
                console.warn('⚠️ Backend não disponível, usando localStorage:', error.message);
            }
        } else {
            console.log('💾 Log salvo apenas no localStorage');
        }

    } catch (error) {
        console.error('❌ Erro ao registrar log:', error);
    }
}

/**
 * Salva log no localStorage
 */
function salvarLogLocal(log) {
    try {
        const logsLocais = JSON.parse(localStorage.getItem('systemLogs') || '[]');
        logsLocais.push(log);

        // Limitar a 500 logs no localStorage
        if (logsLocais.length > 500) {
            logsLocais.shift();
        }

        localStorage.setItem('systemLogs', JSON.stringify(logsLocais));
    } catch (error) {
        console.error('❌ Erro ao salvar log local:', error);
    }
}

// ================================================================
// CARREGAR E EXIBIR LOGS
// ================================================================

/**
 * Carrega os logs do servidor ou localStorage
 */
async function carregarLogs() {
    try {
        console.log('🔄 Iniciando carregamento de logs...');
        mostrarLoading();

        let logs = [];
        let fonte = 'localStorage';

        // Tentar carregar do backend primeiro
        if (usandoBackend) {
            try {
                const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';
                const url = `${API_URL}/logs`;
                const token = sessionStorage.getItem('token') || localStorage.getItem('token');

                console.log('🌐 Tentando carregar do servidor:', url);

                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    const dadosBackend = await response.json();
                    if (Array.isArray(dadosBackend) && dadosBackend.length > 0) {
                        logs = dadosBackend;
                        fonte = 'servidor';
                        console.log('✅ Logs carregados do servidor:', logs.length, 'registros');
                    } else {
                        console.log('⚠️ Servidor retornou array vazio, usando localStorage');
                        throw new Error('Array vazio do servidor');
                    }
                } else {
                    console.warn('⚠️ Servidor retornou erro:', response.status);
                    throw new Error('Erro no servidor');
                }
            } catch (backendError) {
                console.log('💾 Carregando logs do localStorage (backend indisponível)');
                logs = carregarLogsLocal();
            }
        } else {
            logs = carregarLogsLocal();
        }

        logsCache = Array.isArray(logs) ? logs : [];

        // Ordenar por data/hora decrescente (mais recentes primeiro)
        logsCache.sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora));

        console.log(`📊 Total de ${logsCache.length} logs carregados (fonte: ${fonte})`);

        paginaAtual = 1;
        renderizarLogs();

    } catch (error) {
        console.error('❌ Erro ao carregar logs:', error);
        mostrarMensagemInfo('Carregando logs do armazenamento local');
        logsCache = carregarLogsLocal();
        logsCache.sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora));
        renderizarLogs();
    } finally {
        esconderLoading();
    }
}

/**
 * Carrega logs do localStorage
 */
function carregarLogsLocal() {
    try {
        const logsLocais = JSON.parse(localStorage.getItem('systemLogs') || '[]');
        console.log('💾 Logs carregados do localStorage:', logsLocais.length);
        return logsLocais;
    } catch (error) {
        console.error('❌ Erro ao carregar logs locais:', error);
        return [];
    }
}

/**
 * Renderiza os logs na tabela
 */
function renderizarLogs() {
    const tbody = document.getElementById('tabela-registros-body');
    const semDados = document.getElementById('sem-registros-mensagem');
    const paginacao = document.getElementById('registros-paginacao');

    if (!tbody) {
        console.error('❌ Elemento tabela-registros-body não encontrado');
        return;
    }

    tbody.innerHTML = '';

    if (logsCache.length === 0) {
        if (semDados) {
            semDados.classList.add('active');
            // Atualizar mensagem se necessário
            const msgElement = semDados.querySelector('p');
            if (msgElement) {
                msgElement.textContent = 'Nenhum registro encontrado. As atividades do sistema serão registradas aqui.';
            }
        }
        if (paginacao) {
            paginacao.classList.add('hidden');
        }
        console.log('📋 Nenhum log para exibir');
        return;
    }

    if (semDados) {
        semDados.classList.remove('active');
    }

    // Calcular índices da paginação
    const inicio = (paginaAtual - 1) * LOGS_POR_PAGINA;
    const fim = inicio + LOGS_POR_PAGINA;
    const logsParaExibir = logsCache.slice(inicio, fim);

    console.log(`📊 Renderizando ${logsParaExibir.length} logs (total: ${logsCache.length})`);

    // Renderizar cada log
    logsParaExibir.forEach(log => {
        const tr = document.createElement('tr');

        try {
            const dataHora = new Date(log.dataHora);
            const data = dataHora.toLocaleDateString('pt-BR');
            const hora = dataHora.toLocaleTimeString('pt-BR');

            tr.innerHTML = `
                <td class="log-data">${data}</td>
                <td class="log-hora">${hora}</td>
                <td class="log-usuario">${log.usuario || 'Sistema'}</td>
                <td>
                    <span class="log-modulo ${log.modulo}">${log.modulo}</span>
                </td>
                <td class="log-acao">${log.acao}</td>
                <td>
                    <span class="log-status ${log.status}">
                        ${getIconeStatus(log.status)}
                        ${getTextoStatus(log.status)}
                    </span>
                </td>
                <td class="log-detalhes" title="${log.detalhes || ''}">${log.detalhes || '-'}</td>
            `;

            tbody.appendChild(tr);
        } catch (error) {
            console.error('❌ Erro ao renderizar log:', error, log);
        }
    });

    // Atualizar paginação
    atualizarPaginacao();
}

/**
 * Retorna o ícone apropriado para cada status
 */
function getIconeStatus(status) {
    const icones = {
        'sucesso': '<i class="fas fa-check-circle"></i>',
        'erro': '<i class="fas fa-times-circle"></i>',
        'info': '<i class="fas fa-info-circle"></i>'
    };
    return icones[status] || icones['info'];
}

/**
 * Retorna o texto apropriado para cada status
 */
function getTextoStatus(status) {
    const textos = {
        'sucesso': 'Sucesso',
        'erro': 'Erro',
        'info': 'Info'
    };
    return textos[status] || 'Info';
}


// ================================================================
// PAGINAÇÃO
// ================================================================

/**
 * Muda a página atual
 * @param {number} direcao - Direção da mudança (-1 para anterior, +1 para próxima)
 */
function mudarPagina(direcao) {
    const totalPaginas = Math.ceil(logsCache.length / LOGS_POR_PAGINA);
    const novaPagina = paginaAtual + direcao;

    if (novaPagina >= 1 && novaPagina <= totalPaginas) {
        paginaAtual = novaPagina;
        renderizarLogs();
    }
}

/**
 * Atualiza os controles de paginação
 */
function atualizarPaginacao() {
    const paginacao = document.getElementById('registros-paginacao');
    const btnAnterior = document.getElementById('btn-pagina-anterior');
    const btnProxima = document.getElementById('btn-pagina-proxima');
    const infoPaginacao = document.getElementById('info-paginacao');

    if (!paginacao) return;

    const totalPaginas = Math.ceil(logsCache.length / LOGS_POR_PAGINA);

    if (totalPaginas <= 1) {
        paginacao.classList.add('hidden');
        return;
    }

    paginacao.classList.remove('hidden');

    // Atualizar botões
    if (btnAnterior) {
        btnAnterior.disabled = paginaAtual === 1;
    }

    if (btnProxima) {
        btnProxima.disabled = paginaAtual === totalPaginas;
    }

    // Atualizar texto
    if (infoPaginacao) {
        infoPaginacao.textContent = `Página ${paginaAtual} de ${totalPaginas}`;
    }
}

// ================================================================
// EXPORTAR LOGS
// ================================================================

/**
 * Exporta os logs para um arquivo CSV
 */
function exportarLogs() {
    if (logsCache.length === 0) {
        mostrarMensagem('Não há logs para exportar', 'warning');
        return;
    }

    try {
        // Criar cabeçalho CSV
        const cabecalho = ['Data', 'Hora', 'Usuário', 'Módulo', 'Ação', 'Status', 'Detalhes'];

        // Criar linhas CSV
        const linhas = logsCache.map(log => {
            const dataHora = new Date(log.dataHora);
            const data = dataHora.toLocaleDateString('pt-BR');
            const hora = dataHora.toLocaleTimeString('pt-BR');

            return [
                data,
                hora,
                log.usuario,
                log.modulo,
                log.acao,
                getTextoStatus(log.status),
                log.detalhes
            ].map(campo => `"${campo}"`).join(',');
        });

        // Combinar cabeçalho e linhas
        const csv = [cabecalho.join(','), ...linhas].join('\n');

        // Criar blob e fazer download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        const dataAtual = new Date().toISOString().split('T')[0];
        link.setAttribute('href', url);
        link.setAttribute('download', `logs-sistema-${dataAtual}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        mostrarMensagem('Logs exportados com sucesso!', 'success');

    } catch (error) {
        console.error('❌ Erro ao exportar logs:', error);
        mostrarMensagemErro('Erro ao exportar logs');
    }
}

// ================================================================
// UTILITÁRIOS DE UI
// ================================================================

/**
 * Mostra o loading overlay
 */
function mostrarLoading() {
    const loading = document.getElementById('registros-loading');
    if (loading) {
        loading.classList.remove('hidden');
    }
}

/**
 * Esconde o loading overlay
 */
function esconderLoading() {
    const loading = document.getElementById('registros-loading');
    if (loading) {
        loading.classList.add('hidden');
    }
}

/**
 * Mostra mensagem de erro
 */
function mostrarMensagemErro(mensagem) {
    if (typeof mostrarMensagem === 'function') {
        mostrarMensagem(mensagem, 'error');
    } else {
        console.error(mensagem);
    }
}

/**
 * Mostra mensagem informativa
 */
function mostrarMensagemInfo(mensagem) {
    if (typeof mostrarMensagem === 'function') {
        mostrarMensagem(mensagem, 'info');
    } else {
        console.info(mensagem);
    }
}

// ================================================================
// EVENTO DE NAVEGAÇÃO
// ================================================================

// Carregar logs quando a seção for aberta - múltiplas formas de detecção
document.addEventListener('click', function(e) {
    const navLink = e.target.closest('[data-section="registros"]');
    if (navLink) {
        console.log('📋 Abrindo seção de registros via click...');
        setTimeout(() => {
            carregarLogs();
        }, 200);
    }
});

// Observar mudanças na seção de registros
const observarSecaoRegistros = () => {
    const registrosSection = document.getElementById('registros-section');
    if (!registrosSection) {
        console.log('⚠️ Seção de registros não encontrada');
        return;
    }

    // Observer para detectar quando a seção fica visível
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const section = mutation.target;
                if (section.classList.contains('active')) {
                    console.log('📋 Seção de registros ativada via observer, carregando logs...');
                    setTimeout(() => {
                        carregarLogs();
                    }, 100);
                }
            }
        });
    });

    observer.observe(registrosSection, {
        attributes: true,
        attributeFilter: ['class']
    });

    console.log('👁️ Observer de registros inicializado');
};

// Também carregar logs se a seção já estiver ativa
window.addEventListener('load', function() {
    const registrosSection = document.getElementById('registros-section');
    if (registrosSection && registrosSection.classList.contains('active')) {
        console.log('📋 Seção de registros já ativa no load, carregando logs...');
        carregarLogs();
    }

    // Iniciar observer
    observarSecaoRegistros();
});

// Inicializar a visualização quando o DOM carregar
document.addEventListener('DOMContentLoaded', function() {
    // Mostrar mensagem inicial de "sem dados" até que os logs sejam carregados
    const semDados = document.getElementById('sem-registros-mensagem');
    if (semDados) {
        semDados.classList.add('active');
    }

    // Iniciar observer se a página já carregou
    if (document.readyState === 'complete') {
        observarSecaoRegistros();
    }
});

// ================================================================
// RECARREGAR LOGS SE A SEÇÃO ESTIVER ATIVA
// ================================================================

/**
 * Recarrega os logs apenas se a seção de registros estiver visível
 */
function recarregarLogsSeAtivo() {
    const registrosSection = document.getElementById('registros-section');
    if (registrosSection && registrosSection.classList.contains('active')) {
        console.log('🔄 Seção de registros ativa, recarregando logs...');
        setTimeout(() => {
            carregarLogs();
        }, 300);
    }
}

// ================================================================
// EXPORTAR FUNÇÃO GLOBAL
// ================================================================

// Tornar funções disponíveis globalmente para outros módulos
window.registrarLog = registrarLog;
window.carregarLogs = carregarLogs;
window.recarregarLogsSeAtivo = recarregarLogsSeAtivo;

console.log('✅ Sistema de Logs inicializado');
