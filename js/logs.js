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

        // Salvar no backend - usar API_URL do backend real
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
            const errorText = await response.text();
            console.warn('⚠️ Falha ao salvar log no servidor:', response.status, errorText);
        } else {
            console.log('✅ Log registrado com sucesso:', log);
        }

    } catch (error) {
        console.error('❌ Erro ao registrar log:', error);
        // Não propagar o erro para não afetar a operação principal
    }
}

// ================================================================
// CARREGAR E EXIBIR LOGS
// ================================================================

/**
 * Carrega os logs do servidor
 */
async function carregarLogs() {
    try {
        console.log('🔄 Iniciando carregamento de logs...');
        mostrarLoading();

        // Usar API_URL do backend real
        const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';
        const url = `${API_URL}/logs`;
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');

        console.log('🌐 Fazendo requisição para:', url);
        console.log('🔑 Token:', token ? 'presente' : 'ausente');

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('📡 Resposta do servidor:', response.status, response.statusText);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Erro na resposta:', errorText);
            throw new Error(`Erro ao carregar logs: ${response.status}`);
        }

        const logs = await response.json();
        console.log('📊 Logs recebidos:', logs.length, 'registros');

        logsCache = Array.isArray(logs) ? logs : [];

        // Ordenar por data/hora decrescente (mais recentes primeiro)
        logsCache.sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora));

        paginaAtual = 1;
        renderizarLogs();

    } catch (error) {
        console.error('❌ Erro ao carregar logs:', error);
        mostrarMensagemErro('Erro ao carregar registros do sistema');
        logsCache = [];
        renderizarLogs();
    } finally {
        esconderLoading();
    }
}

/**
 * Renderiza os logs na tabela
 */
function renderizarLogs() {
    const tbody = document.getElementById('tabela-registros-body');
    const semDados = document.getElementById('sem-registros-mensagem');
    const paginacao = document.getElementById('registros-paginacao');

    if (!tbody) return;

    tbody.innerHTML = '';

    if (logsCache.length === 0) {
        if (semDados) {
            semDados.classList.add('active');
        }
        if (paginacao) {
            paginacao.classList.add('hidden');
        }
        return;
    }

    if (semDados) {
        semDados.classList.remove('active');
    }

    // Calcular índices da paginação
    const inicio = (paginaAtual - 1) * LOGS_POR_PAGINA;
    const fim = inicio + LOGS_POR_PAGINA;
    const logsParaExibir = logsCache.slice(inicio, fim);

    // Renderizar cada log
    logsParaExibir.forEach(log => {
        const tr = document.createElement('tr');

        const dataHora = new Date(log.dataHora);
        const data = dataHora.toLocaleDateString('pt-BR');
        const hora = dataHora.toLocaleTimeString('pt-BR');

        tr.innerHTML = `
            <td class="log-data">${data}</td>
            <td class="log-hora">${hora}</td>
            <td class="log-usuario">${log.usuario}</td>
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
            <td class="log-detalhes" title="${log.detalhes}">${log.detalhes}</td>
        `;

        tbody.appendChild(tr);
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

// ================================================================
// EVENTO DE NAVEGAÇÃO
// ================================================================

// Carregar logs quando a seção for aberta
document.addEventListener('click', function(e) {
    const navLink = e.target.closest('[data-section="registros"]');
    if (navLink) {
        console.log('📋 Abrindo seção de registros...');
        setTimeout(() => {
            carregarLogs();
        }, 100);
    }
});

// Também carregar logs se a seção já estiver ativa
window.addEventListener('load', function() {
    const registrosSection = document.getElementById('registros-section');
    if (registrosSection && registrosSection.classList.contains('active')) {
        console.log('📋 Seção de registros já ativa, carregando logs...');
        carregarLogs();
    }
});

// Inicializar a visualização quando o DOM carregar
document.addEventListener('DOMContentLoaded', function() {
    // Mostrar mensagem inicial de "sem dados" até que os logs sejam carregados
    const semDados = document.getElementById('sem-registros-mensagem');
    if (semDados) {
        semDados.classList.add('active');
    }
});

// ================================================================
// EXPORTAR FUNÇÃO GLOBAL
// ================================================================

// Tornar registrarLog disponível globalmente para outros módulos
window.registrarLog = registrarLog;

console.log('✅ Sistema de Logs inicializado');
