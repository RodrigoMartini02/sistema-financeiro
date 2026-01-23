// ================================================================
// SISTEMA DE LOGS - AUDITORIA DE AÇÕES
// ================================================================

class LogManager {
    constructor() {
        this.logs = [];
        this.initStorage();
    }

    /**
     * Inicializa o armazenamento de logs
     */
    initStorage() {
        const usuario = window.usuarioDataManager?.getUsuarioAtual();
        if (!usuario || !usuario.id) {
            return;
        }

        const chave = `logs_usuario_${usuario.id}`;
        const logsArmazenados = localStorage.getItem(chave);

        if (logsArmazenados) {
            try {
                this.logs = JSON.parse(logsArmazenados);
            } catch (error) {
                this.logs = [];
            }
        }
    }

    /**
     * Registra uma nova ação no sistema de logs
     * @param {Object} params - Parâmetros do log
     * @param {string} params.modulo - Módulo do sistema (Receitas, Despesas, etc)
     * @param {string} params.acao - Ação realizada (Criado, Editado, Excluído)
     * @param {string} params.categoria - Categoria do item
     * @param {string} params.descricao - Descrição do item
     * @param {number} params.valor - Valor do item
     * @param {string} params.detalhes - Detalhes adicionais da ação
     */
    registrar({ modulo, acao, categoria, descricao, valor, detalhes = '' }) {
        const usuario = window.usuarioDataManager?.getUsuarioAtual();

        if (!usuario || !usuario.id) {
            return;
        }

        const agora = new Date();

        const novoLog = {
            id: this.gerarId(),
            data: agora.toISOString().split('T')[0], // YYYY-MM-DD
            hora: agora.toTimeString().split(' ')[0], // HH:MM:SS
            timestamp: agora.getTime(),
            modulo: modulo,
            acao: acao,
            usuario: usuario.nome || 'Usuário',
            usuarioId: usuario.id,
            categoria: categoria || '-',
            descricao: descricao || '-',
            valor: valor !== undefined ? valor : null,
            detalhes: detalhes
        };

        this.logs.push(novoLog);
        this.salvar();
    }

    /**
     * Salva os logs no localStorage
     */
    salvar() {
        const usuario = window.usuarioDataManager?.getUsuarioAtual();
        if (!usuario || !usuario.id) {
            return;
        }

        const chave = `logs_usuario_${usuario.id}`;

        try {
            // Manter apenas os últimos 1000 logs para não sobrecarregar o localStorage
            if (this.logs.length > 1000) {
                this.logs = this.logs.slice(-1000);
            }

            localStorage.setItem(chave, JSON.stringify(this.logs));
        } catch (error) {
            console.error('Erro ao salvar logs:', error);
        }
    }

    /**
     * Obtém todos os logs
     * @returns {Array} Array de logs
     */
    obterTodos() {
        return [...this.logs].sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Filtra logs por parâmetros
     * @param {Object} filtros - Filtros a aplicar
     * @returns {Array} Array de logs filtrados
     */
    filtrar(filtros = {}) {
        let logsFilterados = [...this.logs];

        // Filtro por data inicial
        if (filtros.dataInicio) {
            const dataInicio = new Date(filtros.dataInicio).getTime();
            logsFilterados = logsFilterados.filter(log => log.timestamp >= dataInicio);
        }

        // Filtro por data final
        if (filtros.dataFim) {
            const dataFim = new Date(filtros.dataFim).getTime();
            logsFilterados = logsFilterados.filter(log => log.timestamp <= dataFim);
        }

        // Filtro por módulo
        if (filtros.modulo && filtros.modulo !== 'todos') {
            logsFilterados = logsFilterados.filter(log =>
                log.modulo.toLowerCase() === filtros.modulo.toLowerCase()
            );
        }

        // Filtro por ação
        if (filtros.acao && filtros.acao !== 'todos') {
            logsFilterados = logsFilterados.filter(log =>
                log.acao.toLowerCase() === filtros.acao.toLowerCase()
            );
        }

        // Filtro por categoria
        if (filtros.categoria && filtros.categoria !== 'todos') {
            logsFilterados = logsFilterados.filter(log =>
                log.categoria.toLowerCase().includes(filtros.categoria.toLowerCase())
            );
        }

        // Filtro por busca textual
        if (filtros.busca) {
            const termoBusca = filtros.busca.toLowerCase();
            logsFilterados = logsFilterados.filter(log =>
                log.descricao.toLowerCase().includes(termoBusca) ||
                log.detalhes.toLowerCase().includes(termoBusca) ||
                log.categoria.toLowerCase().includes(termoBusca)
            );
        }

        // Ordenar por timestamp decrescente (mais recente primeiro)
        return logsFilterados.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Limpa todos os logs
     */
    limpar() {
        const usuario = window.usuarioDataManager?.getUsuarioAtual();
        if (!usuario || !usuario.id) {
            return false;
        }

        if (!confirm('Tem certeza que deseja limpar todos os logs? Esta ação não pode ser desfeita.')) {
            return false;
        }

        this.logs = [];
        const chave = `logs_usuario_${usuario.id}`;
        localStorage.removeItem(chave);
        return true;
    }

    /**
     * Exporta logs para CSV
     * @param {Array} logs - Logs a exportar (opcional, usa todos se não informado)
     */
    exportarCSV(logs = null) {
        const logsParaExportar = logs || this.obterTodos();

        if (logsParaExportar.length === 0) {
            alert('Não há logs para exportar');
            return;
        }

        // Cabeçalho do CSV
        let csv = 'Data,Hora,Módulo,Ação,Usuário,Categoria,Descrição,Valor,Detalhes\n';

        // Adicionar cada log
        logsParaExportar.forEach(log => {
            const linha = [
                log.data,
                log.hora,
                log.modulo,
                log.acao,
                log.usuario,
                log.categoria || '-',
                `"${(log.descricao || '-').replace(/"/g, '""')}"`, // Escapar aspas
                log.valor !== null ? log.valor : '-',
                `"${(log.detalhes || '').replace(/"/g, '""')}"`
            ].join(',');

            csv += linha + '\n';
        });

        // Download do arquivo
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        const dataAtual = new Date().toISOString().split('T')[0];
        link.setAttribute('href', url);
        link.setAttribute('download', `logs_sistema_${dataAtual}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * Gera um ID único para o log
     * @returns {string} ID único
     */
    gerarId() {
        return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Obtém estatísticas dos logs
     * @returns {Object} Objeto com estatísticas
     */
    obterEstatisticas() {
        const stats = {
            total: this.logs.length,
            porModulo: {},
            porAcao: {},
            ultimaAcao: null
        };

        this.logs.forEach(log => {
            // Contagem por módulo
            stats.porModulo[log.modulo] = (stats.porModulo[log.modulo] || 0) + 1;

            // Contagem por ação
            stats.porAcao[log.acao] = (stats.porAcao[log.acao] || 0) + 1;
        });

        // Última ação
        if (this.logs.length > 0) {
            const logsSorted = [...this.logs].sort((a, b) => b.timestamp - a.timestamp);
            stats.ultimaAcao = logsSorted[0];
        }

        return stats;
    }
}

// ================================================================
// INSTÂNCIA GLOBAL DO LOG MANAGER
// ================================================================
window.logManager = new LogManager();

// ================================================================
// FUNÇÕES DE INTERFACE - RENDERIZAÇÃO E FILTROS
// ================================================================

/**
 * Renderiza todos os logs na tabela
 */
function renderizarLogs(logs = null) {
    const logsParaRenderizar = logs || window.logManager.obterTodos();
    const listaLogs = document.getElementById('lista-logs');
    const semLogsMessage = document.getElementById('sem-logs-message');

    if (!listaLogs) return;

    listaLogs.innerHTML = '';

    if (logsParaRenderizar.length === 0) {
        if (semLogsMessage) semLogsMessage.classList.remove('hidden');
        return;
    }

    if (semLogsMessage) semLogsMessage.classList.add('hidden');

    logsParaRenderizar.forEach(log => {
        const tr = document.createElement('tr');

        // Adicionar classe baseada na ação
        if (log.acao.toLowerCase() === 'criado') {
            tr.classList.add('log-criado');
        } else if (log.acao.toLowerCase() === 'editado') {
            tr.classList.add('log-editado');
        } else if (log.acao.toLowerCase() === 'excluído') {
            tr.classList.add('log-excluido');
        }

        tr.innerHTML = `
            <td>${formatarDataLog(log.data)}</td>
            <td>${log.hora}</td>
            <td><span class="badge-modulo">${log.modulo}</span></td>
            <td><span class="badge-acao acao-${log.acao.toLowerCase()}">${log.acao}</span></td>
            <td>${log.usuario}</td>
            <td>${log.categoria}</td>
            <td>${log.descricao}</td>
            <td>${log.valor !== null ? window.formatarMoeda(log.valor) : '-'}</td>
        `;

        listaLogs.appendChild(tr);
    });
}

/**
 * Formata a data para exibição
 */
function formatarDataLog(dataString) {
    if (!dataString) return '';
    try {
        // Adiciona T00:00:00 para evitar problema de timezone
        const data = typeof dataString === 'string' && !dataString.includes('T')
            ? new Date(dataString + 'T00:00:00')
            : new Date(dataString);

        if (isNaN(data.getTime())) return dataString;

        const dia = String(data.getDate()).padStart(2, '0');
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const ano = data.getFullYear();
        return `${dia}/${mes}/${ano}`;
    } catch (error) {
        return dataString;
    }
}

/**
 * Aplica filtros aos logs
 */
function filtrarLogs() {
    const modulo = document.getElementById('filtro-modulo')?.value;
    const dataInicio = document.getElementById('filtro-data-inicio')?.value;
    const dataFim = document.getElementById('filtro-data-fim')?.value;
    const acao = document.getElementById('filtro-acao')?.value;
    const busca = document.getElementById('filtro-busca')?.value;

    const filtros = {};

    if (modulo && modulo !== 'todos') filtros.modulo = modulo;
    if (dataInicio) filtros.dataInicio = dataInicio;
    if (dataFim) filtros.dataFim = dataFim;
    if (acao && acao !== 'todos') filtros.acao = acao;
    if (busca) filtros.busca = busca;

    const logsFiltrados = window.logManager.filtrar(filtros);
    renderizarLogs(logsFiltrados);
}

/**
 * Limpa todos os filtros
 */
function limparFiltrosLogs() {
    const modulo = document.getElementById('filtro-modulo');
    const dataInicio = document.getElementById('filtro-data-inicio');
    const dataFim = document.getElementById('filtro-data-fim');
    const acao = document.getElementById('filtro-acao');
    const busca = document.getElementById('filtro-busca');

    if (modulo) modulo.value = 'todos';
    if (dataInicio) dataInicio.value = '';
    if (dataFim) dataFim.value = '';
    if (acao) acao.value = 'todos';
    if (busca) busca.value = '';

    renderizarLogs();
}

/**
 * Exporta logs para CSV
 */
function exportarLogsCSV() {
    const modulo = document.getElementById('filtro-modulo')?.value;
    const dataInicio = document.getElementById('filtro-data-inicio')?.value;
    const dataFim = document.getElementById('filtro-data-fim')?.value;
    const acao = document.getElementById('filtro-acao')?.value;
    const busca = document.getElementById('filtro-busca')?.value;

    let logsParaExportar;

    // Se há filtros, exportar apenas os filtrados
    if (modulo || dataInicio || dataFim || acao || busca) {
        const filtros = {};
        if (modulo && modulo !== 'todos') filtros.modulo = modulo;
        if (dataInicio) filtros.dataInicio = dataInicio;
        if (dataFim) filtros.dataFim = dataFim;
        if (acao && acao !== 'todos') filtros.acao = acao;
        if (busca) filtros.busca = busca;

        logsParaExportar = window.logManager.filtrar(filtros);
    } else {
        logsParaExportar = window.logManager.obterTodos();
    }

    window.logManager.exportarCSV(logsParaExportar);
}

/**
 * Limpa todos os logs
 */
function limparTodosLogs() {
    const sucesso = window.logManager.limpar();
    if (sucesso) {
        renderizarLogs();
        if (window.mostrarToast) {
            window.mostrarToast('Logs limpos com sucesso!', 'success');
        }
    }
}

/**
 * Inicializa os event listeners da aba de logs
 */
function inicializarEventosLogs() {
    const btnFiltrar = document.getElementById('btn-filtrar-logs');
    const btnLimparFiltros = document.getElementById('btn-limpar-filtros-logs');
    const btnExportar = document.getElementById('btn-exportar-logs');
    const btnLimparTodos = document.getElementById('btn-limpar-todos-logs');

    if (btnFiltrar) {
        btnFiltrar.addEventListener('click', filtrarLogs);
    }

    if (btnLimparFiltros) {
        btnLimparFiltros.addEventListener('click', limparFiltrosLogs);
    }

    if (btnExportar) {
        btnExportar.addEventListener('click', exportarLogsCSV);
    }

    if (btnLimparTodos) {
        btnLimparTodos.addEventListener('click', limparTodosLogs);
    }

    // Enter para filtrar na busca
    const inputBusca = document.getElementById('filtro-busca');
    if (inputBusca) {
        inputBusca.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                filtrarLogs();
            }
        });
    }
}

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(inicializarEventosLogs, 1000);
});

// ================================================================
// EXPORTAR FUNÇÕES GLOBAIS
// ================================================================
window.renderizarLogs = renderizarLogs;
window.filtrarLogs = filtrarLogs;
window.limparFiltrosLogs = limparFiltrosLogs;
window.exportarLogsCSV = exportarLogsCSV;
window.limparTodosLogs = limparTodosLogs;
window.LogManager = LogManager;
