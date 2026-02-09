// ================================================================
// SISTEMA DE NOTIFICAÇÕES OTIMIZADO
// ================================================================

class SistemaNotificacoes {
    constructor() {
        this.notificacoes = [];
        this.maxNotificacoes = 30;
        this.inicializado = false;
        this.verificandoAutomaticamente = false;
        
        this.aguardarSistemasProntos();
    }

    // ================================================================
    // INICIALIZAÇÃO
    // ================================================================
    
    async aguardarSistemasProntos() {
        let tentativas = 0;
        const maxTentativas = 50;
        
        const verificar = () => {
            tentativas++;
            
            const sistemaPronto = window.sistemaInicializado === true;
            const dadosDisponiveis = typeof window.dadosFinanceiros !== 'undefined' && window.dadosFinanceiros && Object.keys(window.dadosFinanceiros).length > 0;
            const funcionesBasicas = typeof window.formatarMoeda === 'function';
            
            if (sistemaPronto && dadosDisponiveis && funcionesBasicas) {
                this.init();
            } else if (tentativas >= maxTentativas) {
                this.init();
            } else {
                setTimeout(verificar, 200);
            }
        };
        
        verificar();
    }

    // ================================================================
    // TIPOS DE NOTIFICAÇÕES
    // ================================================================
    tipos = {
        DESPESA_VENCENDO: {
            codigo: 'despesa_vencendo',
            icone: 'fa-clock',
            titulo: 'Despesa Vencendo',
            prioridade: 'alta'
        },
        DESPESA_VENCIDA: {
            codigo: 'despesa_vencida',
            icone: 'fa-exclamation-circle',
            titulo: 'Despesa Vencida',
            prioridade: 'critica'
        },
        MES_FECHADO: {
            codigo: 'mes_fechado',
            icone: 'fa-lock',
            titulo: 'Mês Fechado',
            prioridade: 'info'
        },
        SALDO_NEGATIVO: {
            codigo: 'saldo_negativo',
            icone: 'fa-exclamation-triangle',
            titulo: 'Saldo Negativo',
            prioridade: 'alta'
        },
        PAGAMENTO_PROCESSADO: {
            codigo: 'pagamento_processado',
            icone: 'fa-check-circle',
            titulo: 'Pagamento Processado',
            prioridade: 'sucesso'
        }
    };

    // ================================================================
    // INICIALIZAÇÃO
    // ================================================================
    init() {
        if (this.inicializado) {
            return;
        }

        this.carregarNotificacoes();
        this.configurarEventos();
        this.atualizarBadge();
        this.solicitarPermissaoNotificacaoWeb();

        setTimeout(() => {
            this.verificarNotificacoesPendentes();
            this.iniciarVerificacaoAutomatica();
        }, 2000);

        this.inicializado = true;
    }

    iniciarVerificacaoAutomatica() {
        if (this.verificandoAutomaticamente) return;
        
        this.verificandoAutomaticamente = true;
        
        setInterval(() => {
            try {
                this.verificarNotificacoesPendentes();
            } catch (error) {
                // Falha silenciosa
            }
        }, 5 * 60 * 1000);
    }

    // ================================================================
    // CRIAÇÃO DE NOTIFICAÇÕES
    // ================================================================
    criarNotificacao(tipo, dados = {}) {
        try {
            const tipoConfig = this.tipos[tipo];
            if (!tipoConfig) {
                return null;
            }

            const notificacao = {
                id: this.gerarId(),
                tipo: tipoConfig.codigo,
                icone: tipoConfig.icone,
                titulo: tipoConfig.titulo,
                mensagem: dados.mensagem || '',
                dados: dados,
                prioridade: tipoConfig.prioridade,
                dataHora: new Date().toISOString(),
                expiresAt: dados.expiresAt || null
            };

            this.adicionarNotificacao(notificacao);
            return notificacao;
        } catch (error) {
            return null;
        }
    }

    // ================================================================
    // NOTIFICAÇÕES ESPECÍFICAS
    // ================================================================

    notificarDespesaVencendo(despesa, diasRestantes) {
        const mensagem = `A despesa "${despesa.descricao}" vence em ${diasRestantes} dia(s). Valor: ${this.formatarMoedaSeguro(despesa.valor)}`;
        
        return this.criarNotificacao('DESPESA_VENCENDO', {
            mensagem,
            despesa: despesa,
            diasRestantes,
            acao: 'abrir_despesa',
            mes: despesa.mes,
            ano: despesa.ano,
            index: despesa.index
        });
    }

    notificarDespesaVencida(despesa, diasAtraso) {
        const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                           'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const nomeMes = nomesMeses[despesa.mes];
        const mensagem = `A despesa "${despesa.descricao}" de ${nomeMes}/${despesa.ano} está ${diasAtraso} dia(s) em atraso. Valor: ${this.formatarMoedaSeguro(despesa.valor)}`;
        
        return this.criarNotificacao('DESPESA_VENCIDA', {
            mensagem,
            despesa: despesa,
            diasAtraso,
            acao: 'abrir_despesa',
            mes: despesa.mes,
            ano: despesa.ano,
            index: despesa.index
        });
    }

    notificarMesFechado(mes, ano, saldo) {
        const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                           'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const mensagem = `${nomesMeses[mes]} de ${ano} foi fechado. Saldo final: ${this.formatarMoedaSeguro(saldo)}`;
        
        return this.criarNotificacao('MES_FECHADO', {
            mensagem,
            mes,
            ano,
            saldo,
            acao: 'abrir_mes'
        });
    }

    notificarSaldoNegativo(mes, ano, saldo) {
        const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                           'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const mensagem = `Atenção! O saldo de ${nomesMeses[mes]} está negativo: ${this.formatarMoedaSeguro(saldo)}`;
        
        return this.criarNotificacao('SALDO_NEGATIVO', {
            mensagem,
            mes,
            ano,
            saldo,
            acao: 'abrir_mes'
        });
    }

    notificarPagamentoProcessado(despesa, valorPago) {
        const mensagem = `Pagamento de "${despesa.descricao}" processado. Valor pago: ${this.formatarMoedaSeguro(valorPago)}`;
        
        return this.criarNotificacao('PAGAMENTO_PROCESSADO', {
            mensagem,
            despesa,
            valorPago,
            acao: 'abrir_mes'
        });
    }

    // ================================================================
    // VERIFICAÇÕES AUTOMÁTICAS OTIMIZADAS
    // ================================================================
    verificarNotificacoesPendentes() {
        try {
            if (typeof window.dadosFinanceiros === 'undefined' || !window.dadosFinanceiros || Object.keys(window.dadosFinanceiros).length === 0) {
                return;
            }

            this.limparNotificacoesDespesasPagas();
            this.verificarDespesasVencendo();
            this.verificarDespesasVencidas();
            this.verificarSaldosNegativos();
            this.limparNotificacoesExpiradas();
        } catch (error) {
            // Falha silenciosa
        }
    }

    limparNotificacoesDespesasPagas() {
        try {
            const antes = this.notificacoes.length;

            this.notificacoes = this.notificacoes.filter(n => {
                if (n.tipo !== 'despesa_vencida' && n.tipo !== 'despesa_vencendo') return true;

                const dados = n.dados;
                if (!dados || dados.mes === undefined || !dados.ano) return true;

                const anoData = window.dadosFinanceiros[dados.ano];
                if (!anoData || !anoData.meses) return true;

                const dadosMes = anoData.meses[dados.mes];
                if (!dadosMes?.despesas) return true;

                const despesa = dadosMes.despesas.find(d =>
                    d.descricao === dados.despesa?.descricao
                );

                // Remover se a despesa foi paga
                if (despesa && despesa.quitado) return false;

                return true;
            });

            if (this.notificacoes.length !== antes) {
                this.salvarNotificacoes();
                this.atualizarBadge();
                this.renderizarNotificacoes();
            }
        } catch (error) {
            // Falha silenciosa
        }
    }

    verificarDespesasVencendo() {
        try {
            const hoje = new Date();
            const em3Dias = new Date(hoje.getTime() + 3 * 24 * 60 * 60 * 1000);
            const mesAtual = hoje.getMonth();
            const anoAtual = hoje.getFullYear();

            // Apenas mês atual para despesas vencendo
            const anoData = window.dadosFinanceiros[anoAtual];
            if (!anoData || !anoData.meses) return;

            const dadosMes = anoData.meses[mesAtual];
            if (!dadosMes?.despesas) return;

            dadosMes.despesas.forEach((despesa, index) => {
                if (despesa.quitado) return;

                const dataVencimento = new Date(despesa.dataVencimento || despesa.data);
                
                if (dataVencimento >= hoje && dataVencimento <= em3Dias) {
                    const diasRestantes = Math.ceil((dataVencimento - hoje) / (1000 * 60 * 60 * 24));
                    
                    const jaNotificado = this.notificacoes.some(n => 
                        n.tipo === 'despesa_vencendo' && 
                        n.dados.despesa?.descricao === despesa.descricao &&
                        n.dados.mes === mesAtual &&
                        n.dados.ano === anoAtual
                    );

                    if (!jaNotificado) {
                        this.notificarDespesaVencendo({
                            ...despesa,
                            mes: mesAtual,
                            ano: anoAtual,
                            index
                        }, diasRestantes);
                    }
                }
            });
        } catch (error) {
            // Falha silenciosa
        }
    }

    verificarDespesasVencidas() {
        try {
            const hoje = new Date();

            // Verificar todos os anos e meses para despesas vencidas
            for (const ano in window.dadosFinanceiros) {
                const anoData = window.dadosFinanceiros[ano];
                if (!anoData || !anoData.meses) continue;

                for (let mes = 0; mes < 12; mes++) {
                    const dadosMes = anoData.meses[mes];
                    if (!dadosMes?.despesas) continue;

                    dadosMes.despesas.forEach((despesa, index) => {
                        if (despesa.quitado) return;

                        const dataVencimento = new Date(despesa.dataVencimento || despesa.data);
                        
                        if (dataVencimento < hoje) {
                            const diasAtraso = Math.floor((hoje - dataVencimento) / (1000 * 60 * 60 * 24));
                            
                            const jaNotificado = this.notificacoes.some(n => 
                                n.tipo === 'despesa_vencida' && 
                                n.dados.despesa?.descricao === despesa.descricao &&
                                n.dados.mes === mes &&
                                n.dados.ano === parseInt(ano)
                            );

                            if (!jaNotificado) {
                                this.notificarDespesaVencida({
                                    ...despesa,
                                    mes,
                                    ano: parseInt(ano),
                                    index
                                }, diasAtraso);
                            }
                        }
                    });
                }
            }
        } catch (error) {
            // Falha silenciosa
        }
    }

    verificarSaldosNegativos() {
        try {
            if (typeof window.calcularSaldoMes !== 'function') {
                return;
            }

            const hoje = new Date();
            const mesAtual = hoje.getMonth();
            const anoAtual = hoje.getFullYear();
            
            // Apenas mês atual para saldos negativos
            const saldo = window.calcularSaldoMes(mesAtual, anoAtual);
            
            if (saldo && saldo.saldoFinal < 0) {
                const jaNotificado = this.notificacoes.some(n => 
                    n.tipo === 'saldo_negativo' && 
                    n.dados.mes === mesAtual &&
                    n.dados.ano === anoAtual
                );

                if (!jaNotificado) {
                    this.notificarSaldoNegativo(mesAtual, anoAtual, saldo.saldoFinal);
                }
            }
        } catch (error) {
            // Falha silenciosa
        }
    }

    // ================================================================
    // GERENCIAMENTO DE NOTIFICAÇÕES
    // ================================================================
    adicionarNotificacao(notificacao) {
        try {
            this.notificacoes.unshift(notificacao);

            if (this.notificacoes.length > this.maxNotificacoes) {
                this.notificacoes = this.notificacoes.slice(0, this.maxNotificacoes);
            }

            this.salvarNotificacoes();
            this.atualizarBadge();
            this.renderizarNotificacoes();
            this.enviarNotificacaoWeb(notificacao);
        } catch (error) {
            // Falha silenciosa
        }
    }

    marcarComoLida(id) {
        try {
            this.notificacoes = this.notificacoes.filter(n => n.id !== id);
            this.salvarNotificacoes();
            this.atualizarBadge();
            this.renderizarNotificacoes();
        } catch (error) {
            // Falha silenciosa
        }
    }

    marcarTodasComoLidas() {
        try {
            this.notificacoes = [];
            this.salvarNotificacoes();
            this.atualizarBadge();
            this.renderizarNotificacoes();
        } catch (error) {
            // Falha silenciosa
        }
    }

    excluirNotificacao(id) {
        try {
            this.notificacoes = this.notificacoes.filter(n => n.id !== id);
            this.salvarNotificacoes();
            this.atualizarBadge();
            this.renderizarNotificacoes();
        } catch (error) {
            // Falha silenciosa
        }
    }

    limparTodasNotificacoes() {
        try {
            this.notificacoes = [];
            this.salvarNotificacoes();
            this.atualizarBadge();
            this.renderizarNotificacoes();
        } catch (error) {
            // Falha silenciosa
        }
    }

    limparNotificacoesExpiradas() {
        try {
            const agora = new Date().toISOString();
            const antes = this.notificacoes.length;
            
            this.notificacoes = this.notificacoes.filter(n => 
                !n.expiresAt || n.expiresAt > agora
            );
            
            if (this.notificacoes.length !== antes) {
                this.salvarNotificacoes();
                this.atualizarBadge();
            }
        } catch (error) {
            // Falha silenciosa
        }
    }

    // ================================================================
    // INTERFACE E RENDERIZAÇÃO
    // ================================================================
    configurarEventos() {
        try {
            const notificationBell = document.getElementById('notification-bell');
            if (notificationBell) {
                notificationBell.addEventListener('click', () => {
                    this.abrirModal();
                });
            }

            const btnMarkAllRead = document.getElementById('btn-mark-all-read');
            const btnClearNotifications = document.getElementById('btn-clear-notifications');
            const modalNotificacoes = document.getElementById('modal-notificacoes');
            const closeBtn = modalNotificacoes?.querySelector('.close');

            if (btnMarkAllRead) {
                btnMarkAllRead.addEventListener('click', () => {
                    this.marcarTodasComoLidas();
                });
            }

            if (btnClearNotifications) {
                btnClearNotifications.addEventListener('click', () => {
                    if (confirm('Deseja limpar todas as notificações?')) {
                        this.limparTodasNotificacoes();
                    }
                });
            }

            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    this.fecharModal();
                });
            }

            if (modalNotificacoes) {
                modalNotificacoes.addEventListener('click', (e) => {
                    if (e.target === modalNotificacoes) {
                        this.fecharModal();
                    }
                });
            }
        } catch (error) {
            // Falha silenciosa
        }
    }

    abrirModal() {
        try {
            const modal = document.getElementById('modal-notificacoes');
            if (modal) {
                modal.classList.remove('hidden');
                modal.style.display = 'block';
                this.renderizarNotificacoes();
            }
        } catch (error) {
            // Falha silenciosa
        }
    }

    fecharModal() {
        try {
            const modal = document.getElementById('modal-notificacoes');
            if (modal) {
                modal.classList.add('hidden');
                modal.style.display = 'none';
            }
        } catch (error) {
            // Falha silenciosa
        }
    }

    renderizarNotificacoes() {
        try {
            const container = document.getElementById('notifications-list');
            if (!container) return;

            container.innerHTML = '';

            if (this.notificacoes.length === 0) {
                container.innerHTML = `
                    <div class="notification-empty">
                        <i class="fas fa-bell-slash empty-icon-notif"></i>
                        <p class="empty-text-notif">Nenhuma notificação no momento</p>
                    </div>
                `;
                return;
            }

            this.notificacoes.forEach(notificacao => {
                const item = this.criarItemNotificacao(notificacao);
                if (item) {
                    container.appendChild(item);
                }
            });
        } catch (error) {
            // Falha silenciosa
        }
    }

    criarItemNotificacao(notificacao) {
        try {
            const template = document.getElementById('template-notification-item');
            if (!template) {
                return this.criarItemNotificacaoFallback(notificacao);
            }

            const clone = template.content.cloneNode(true);
            const item = clone.querySelector('.notification-item');

            item.dataset.id = notificacao.id;
            item.dataset.tipo = notificacao.tipo;

            // Usar ícone FontAwesome
            const iconElement = clone.querySelector('.notification-icon');
            iconElement.className = `fas ${notificacao.icone} notification-icon`;

            clone.querySelector('.notification-title').textContent = notificacao.titulo;
            clone.querySelector('.notification-message').textContent = notificacao.mensagem;
            clone.querySelector('.notification-time').textContent = this.formatarTempo(notificacao.dataHora);

            const btnMarkRead = clone.querySelector('.btn-mark-read');
            const btnDelete = clone.querySelector('.btn-delete-notification');

            if (btnMarkRead) {
                btnMarkRead.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.marcarComoLida(notificacao.id);
                });
            }

            if (btnDelete) {
                btnDelete.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.excluirNotificacao(notificacao.id);
                });
            }

            item.addEventListener('click', () => {
                this.executarAcaoNotificacao(notificacao);
            });

            return clone;
        } catch (error) {
            return this.criarItemNotificacaoFallback(notificacao);
        }
    }

    criarItemNotificacaoFallback(notificacao) {
        const div = document.createElement('div');
        div.className = 'notification-item';
        div.innerHTML = `
            <div class="notification-icon-container">
                <i class="fas ${notificacao.icone} notification-icon"></i>
            </div>
            <div class="notification-content">
                <div class="notification-header-inline">
                    <h4 class="notification-title">${notificacao.titulo}</h4>
                    <span class="notification-time">${this.formatarTempo(notificacao.dataHora)}</span>
                </div>
                <p class="notification-message">${notificacao.mensagem}</p>
            </div>
            <div class="notification-actions">
                <button class="btn-mark-read" title="Marcar como lida">
                    <i class="fas fa-check"></i>
                </button>
                <button class="btn-delete-notification" title="Excluir">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        div.querySelector('.btn-mark-read').addEventListener('click', (e) => {
            e.stopPropagation();
            this.marcarComoLida(notificacao.id);
        });

        div.querySelector('.btn-delete-notification').addEventListener('click', (e) => {
            e.stopPropagation();
            this.excluirNotificacao(notificacao.id);
        });

        div.addEventListener('click', () => {
            this.executarAcaoNotificacao(notificacao);
        });

        return div;
    }

    executarAcaoNotificacao(notificacao) {
        try {
            const dados = notificacao.dados;
            
            switch (dados.acao) {
                case 'abrir_despesa':
                case 'abrir_mes':
                    if (typeof window.abrirDetalhesDoMes === 'function') {
                        window.abrirDetalhesDoMes(dados.mes, dados.ano);
                        this.fecharModal();
                    }
                    break;
                    
                case 'abrir_dashboard':
                    const dashboardLink = document.querySelector('.nav-link[data-section="dashboard"]');
                    if (dashboardLink) {
                        dashboardLink.click();
                        this.fecharModal();
                    }
                    break;
                    
                case 'abrir_configuracoes':
                    const configLink = document.querySelector('.nav-link[data-section="config"]');
                    if (configLink) {
                        configLink.click();
                        this.fecharModal();
                    }
                    break;
                    
                case 'info':
                default:
                    break;
            }
        } catch (error) {
            // Falha silenciosa
        }
    }

    atualizarBadge() {
        try {
            const badge = document.getElementById('notification-count');
            const total = this.notificacoes.length;

            if (badge) {
                if (total > 0) {
                    badge.textContent = total > 99 ? '99+' : total;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
        } catch (error) {
            // Falha silenciosa
        }
    }

    // ================================================================
    // NOTIFICAÇÕES WEB (DESKTOP)
    // ================================================================
    solicitarPermissaoNotificacaoWeb() {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    enviarNotificacaoWeb(notificacao) {
        if (!('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;

        try {
            const n = new Notification(notificacao.titulo, {
                body: notificacao.mensagem,
                tag: notificacao.id,
                silent: false
            });

            n.onclick = () => {
                window.focus();
                this.executarAcaoNotificacao(notificacao);
                n.close();
            };

            setTimeout(() => n.close(), 8000);
        } catch (e) {
            // Falha silenciosa
        }
    }

    // ================================================================
    // PERSISTÊNCIA DE DADOS
    // ================================================================
    salvarNotificacoes() {
        try {
            const usuarioAtual = sessionStorage.getItem('usuarioAtual');
            if (usuarioAtual) {
                const chave = `notificacoes_${usuarioAtual}`;
                localStorage.setItem(chave, JSON.stringify(this.notificacoes));
            }
        } catch (error) {
            // Falha silenciosa
        }
    }

    carregarNotificacoes() {
        try {
            const usuarioAtual = sessionStorage.getItem('usuarioAtual');
            if (usuarioAtual) {
                const chave = `notificacoes_${usuarioAtual}`;
                const dados = localStorage.getItem(chave);
                
                if (dados) {
                    this.notificacoes = JSON.parse(dados);
                }
            }
        } catch (error) {
            this.notificacoes = [];
        }
    }

    // ================================================================
    // UTILITÁRIOS
    // ================================================================
    gerarId() {
        return 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    formatarTempo(dataHora) {
        try {
            const agora = new Date();
            const data = new Date(dataHora);
            const diffMs = agora - data;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHoras = Math.floor(diffMs / 3600000);
            const diffDias = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return 'Agora';
            if (diffMins < 60) return `${diffMins}m`;
            if (diffHoras < 24) return `${diffHoras}h`;
            if (diffDias < 7) return `${diffDias}d`;
            
            return data.toLocaleDateString('pt-BR');
        } catch (error) {
            return 'Data inválida';
        }
    }

    formatarMoedaSeguro(valor) {
        try {
            if (typeof window.formatarMoeda === 'function') {
                return window.formatarMoeda(valor);
            }
            
            return new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL'
            }).format(valor || 0);
        } catch (error) {
            return `R$ ${(valor || 0).toFixed(2)}`;
        }
    }

    // ================================================================
    // MÉTODOS PÚBLICOS DE INTEGRAÇÃO
    // ================================================================

    onPagamentoProcessado(despesa, valorPago) {
        if (!this.inicializado) {
            return;
        }

        try {
            this.notificarPagamentoProcessado(despesa, valorPago);
        } catch (error) {
            // Falha silenciosa
        }
    }

    onMesFechado(mes, ano, saldo) {
        if (!this.inicializado) {
            return;
        }

        try {
            this.notificarMesFechado(mes, ano, saldo);
        } catch (error) {
            // Falha silenciosa
        }
    }

    // ================================================================
    // LIMPEZA
    // ================================================================
    destruir() {
        try {
            this.verificandoAutomaticamente = false;
            this.inicializado = false;
            this.notificacoes = [];
        } catch (error) {
            // Falha silenciosa
        }
    }
}

// ================================================================
// INSTÂNCIA GLOBAL E INTEGRAÇÃO
// ================================================================

let sistemaNotificacoes = null;

// Função de inicialização controlada
function inicializarSistemaNotificacoes() {
    if (!sistemaNotificacoes) {
        sistemaNotificacoes = new SistemaNotificacoes();
        
        // Exportar métodos públicos para integração
        window.SistemaNotificacoes = {
            // Métodos para sistemas externos chamarem
            onPagamentoProcessado: (despesa, valor) => sistemaNotificacoes?.onPagamentoProcessado(despesa, valor),
            onMesFechado: (mes, ano, saldo) => sistemaNotificacoes?.onMesFechado(mes, ano, saldo),

            // Métodos de controle
            abrir: () => sistemaNotificacoes?.abrirModal(),
            fechar: () => sistemaNotificacoes?.fecharModal(),
            marcarTodasLidas: () => sistemaNotificacoes?.marcarTodasComoLidas(),
            limparTodas: () => sistemaNotificacoes?.limparTodasNotificacoes(),

            // Estado
            get inicializado() { return sistemaNotificacoes?.inicializado || false; },
            get totalNotificacoes() { return sistemaNotificacoes?.notificacoes?.length || 0; }
        };
    }
}

// ================================================================
// INICIALIZAÇÃO AUTOMÁTICA SEGURA
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        inicializarSistemaNotificacoes();
    }, 500);
});

// Backup de inicialização se o DOMContentLoaded já passou
if (document.readyState === 'loading') {
    // DOM ainda carregando, event listener já foi configurado
} else {
    // DOM já carregado
    setTimeout(() => {
        inicializarSistemaNotificacoes();
    }, 100);
}

// ================================================================
// INTEGRAÇÃO COM SISTEMAS EXISTENTES
// ================================================================

// Se window.addEventListener estiver disponível, aguardar evento customizado
if (typeof window.addEventListener === 'function') {
    window.addEventListener('sistemaFinanceiroReady', function() {
        if (!sistemaNotificacoes) {
            inicializarSistemaNotificacoes();
        }
    });
}