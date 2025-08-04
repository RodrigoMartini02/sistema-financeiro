// ================================================================
// SISTEMA DE NOTIFICAÇÕES - notificacoes.js
// ================================================================

const SistemaNotificacoes = {
    notificacoes: [],
    maxNotificacoes: 50,
    
    // ============================================================
    // TIPOS DE NOTIFICAÇÕES
    // ============================================================
    tipos: {
        DESPESA_VENCENDO: {
            codigo: 'despesa_vencendo',
            icone: '⚠️',
            titulo: 'Despesa Vencendo',
            prioridade: 'alta'
        },
        DESPESA_VENCIDA: {
            codigo: 'despesa_vencida',
            icone: '🔴',
            titulo: 'Despesa Vencida',
            prioridade: 'critica'
        },
        RECEITA_RECEBIDA: {
            codigo: 'receita_recebida',
            icone: '💰',
            titulo: 'Receita Recebida',
            prioridade: 'info'
        },
        MES_FECHADO: {
            codigo: 'mes_fechado',
            icone: '🔒',
            titulo: 'Mês Fechado',
            prioridade: 'info'
        },
        SALDO_NEGATIVO: {
            codigo: 'saldo_negativo',
            icone: '⚡',
            titulo: 'Saldo Negativo',
            prioridade: 'alta'
        },
        META_ATINGIDA: {
            codigo: 'meta_atingida',
            icone: '🎯',
            titulo: 'Meta Atingida',
            prioridade: 'sucesso'
        },
        BACKUP_RECOMENDADO: {
            codigo: 'backup_recomendado',
            icone: '💾',
            titulo: 'Backup Recomendado',
            prioridade: 'baixa'
        },
        GASTOS_ELEVADOS: {
            codigo: 'gastos_elevados',
            icone: '📈',
            titulo: 'Gastos Elevados',
            prioridade: 'media'
        },
        PAGAMENTO_PROCESSADO: {
            codigo: 'pagamento_processado',
            icone: '✅',
            titulo: 'Pagamento Processado',
            prioridade: 'sucesso'
        },
        SISTEMA_ATUALIZADO: {
            codigo: 'sistema_atualizado',
            icone: '🔄',
            titulo: 'Sistema Atualizado',
            prioridade: 'info'
        }
    },

    // ============================================================
    // INICIALIZAÇÃO
    // ============================================================
    init() {
        this.carregarNotificacoes();
        this.configurarEventos();
        this.verificarNotificacoesPendentes();
        this.atualizarBadge();
        
        // Verificação automática a cada 5 minutos
        setInterval(() => {
            this.verificarNotificacoesPendentes();
        }, 5 * 60 * 1000);
    },

    // ============================================================
    // CRIAÇÃO DE NOTIFICAÇÕES
    // ============================================================
    criarNotificacao(tipo, dados = {}) {
        const tipoConfig = this.tipos[tipo];
        if (!tipoConfig) {
            console.warn('Tipo de notificação inválido:', tipo);
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
            lida: false,
            dataHora: new Date().toISOString(),
            expiresAt: dados.expiresAt || null
        };

        this.adicionarNotificacao(notificacao);
        return notificacao;
    },

    // ============================================================
    // NOTIFICAÇÕES ESPECÍFICAS DO SISTEMA FINANCEIRO
    // ============================================================
    notificarDespesaVencendo(despesa, diasRestantes) {
        const mensagem = `A despesa "${despesa.descricao}" vence em ${diasRestantes} dia(s). Valor: ${formatarMoeda(despesa.valor)}`;
        
        return this.criarNotificacao('DESPESA_VENCENDO', {
            mensagem,
            despesa: despesa,
            diasRestantes,
            acao: 'abrir_despesa',
            mes: despesa.mes,
            ano: despesa.ano,
            index: despesa.index
        });
    },

    notificarDespesaVencida(despesa, diasAtraso) {
        const mensagem = `A despesa "${despesa.descricao}" está ${diasAtraso} dia(s) em atraso. Valor: ${formatarMoeda(despesa.valor)}`;
        
        return this.criarNotificacao('DESPESA_VENCIDA', {
            mensagem,
            despesa: despesa,
            diasAtraso,
            acao: 'abrir_despesa',
            mes: despesa.mes,
            ano: despesa.ano,
            index: despesa.index
        });
    },

    notificarReceitaRecebida(receita) {
        const mensagem = `Receita "${receita.descricao}" no valor de ${formatarMoeda(receita.valor)} foi registrada`;
        
        return this.criarNotificacao('RECEITA_RECEBIDA', {
            mensagem,
            receita: receita,
            acao: 'abrir_mes'
        });
    },

    notificarMesFechado(mes, ano, saldo) {
        const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                           'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const mensagem = `${nomesMeses[mes]} de ${ano} foi fechado. Saldo final: ${formatarMoeda(saldo)}`;
        
        return this.criarNotificacao('MES_FECHADO', {
            mensagem,
            mes,
            ano,
            saldo,
            acao: 'abrir_mes'
        });
    },

    notificarSaldoNegativo(mes, ano, saldo) {
        const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                           'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const mensagem = `Atenção! O saldo de ${nomesMeses[mes]} está negativo: ${formatarMoeda(saldo)}`;
        
        return this.criarNotificacao('SALDO_NEGATIVO', {
            mensagem,
            mes,
            ano,
            saldo,
            acao: 'abrir_mes'
        });
    },

    notificarGastosElevados(categoria, valor, percentual) {
        const mensagem = `Gastos com "${categoria}" estão ${percentual}% acima da média: ${formatarMoeda(valor)}`;
        
        return this.criarNotificacao('GASTOS_ELEVADOS', {
            mensagem,
            categoria,
            valor,
            percentual,
            acao: 'abrir_dashboard'
        });
    },

    notificarPagamentoProcessado(despesa, valorPago) {
        const mensagem = `Pagamento de "${despesa.descricao}" processado. Valor pago: ${formatarMoeda(valorPago)}`;
        
        return this.criarNotificacao('PAGAMENTO_PROCESSADO', {
            mensagem,
            despesa,
            valorPago,
            acao: 'abrir_mes'
        });
    },

    notificarBackupRecomendado() {
        const ultimoBackup = localStorage.getItem('ultimo_backup');
        const diasSemBackup = ultimoBackup ? 
            Math.floor((Date.now() - new Date(ultimoBackup)) / (1000 * 60 * 60 * 24)) : 30;
        
        const mensagem = `Recomendamos fazer backup dos seus dados. ${diasSemBackup} dias sem backup.`;
        
        return this.criarNotificacao('BACKUP_RECOMENDADO', {
            mensagem,
            diasSemBackup,
            acao: 'abrir_configuracoes',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // Expira em 7 dias
        });
    },

    // ============================================================
    // VERIFICAÇÕES AUTOMÁTICAS
    // ============================================================
    verificarNotificacoesPendentes() {
        this.verificarDespesasVencendo();
        this.verificarDespesasVencidas();
        this.verificarSaldosNegativos();
        this.verificarBackupRecomendado();
        this.limparNotificacoesExpiradas();
    },

    verificarDespesasVencendo() {
        if (!dadosFinanceiros) return;

        const hoje = new Date();
        const em3Dias = new Date(hoje.getTime() + 3 * 24 * 60 * 60 * 1000);

        for (const ano in dadosFinanceiros) {
            for (let mes = 0; mes < 12; mes++) {
                const dadosMes = dadosFinanceiros[ano]?.meses?.[mes];
                if (!dadosMes?.despesas) continue;

                dadosMes.despesas.forEach((despesa, index) => {
                    if (despesa.quitado) return;

                    const dataVencimento = new Date(despesa.dataVencimento || despesa.data);
                    
                    if (dataVencimento >= hoje && dataVencimento <= em3Dias) {
                        const diasRestantes = Math.ceil((dataVencimento - hoje) / (1000 * 60 * 60 * 24));
                        
                        // Verifica se já existe notificação para esta despesa
                        const jaNotificado = this.notificacoes.some(n => 
                            n.tipo === 'despesa_vencendo' && 
                            n.dados.despesa?.descricao === despesa.descricao &&
                            n.dados.mes === mes &&
                            n.dados.ano === parseInt(ano)
                        );

                        if (!jaNotificado) {
                            this.notificarDespesaVencendo({
                                ...despesa,
                                mes,
                                ano: parseInt(ano),
                                index
                            }, diasRestantes);
                        }
                    }
                });
            }
        }
    },

    verificarDespesasVencidas() {
        if (!dadosFinanceiros) return;

        const hoje = new Date();

        for (const ano in dadosFinanceiros) {
            for (let mes = 0; mes < 12; mes++) {
                const dadosMes = dadosFinanceiros[ano]?.meses?.[mes];
                if (!dadosMes?.despesas) continue;

                dadosMes.despesas.forEach((despesa, index) => {
                    if (despesa.quitado) return;

                    const dataVencimento = new Date(despesa.dataVencimento || despesa.data);
                    
                    if (dataVencimento < hoje) {
                        const diasAtraso = Math.floor((hoje - dataVencimento) / (1000 * 60 * 60 * 24));
                        
                        // Verifica se já existe notificação para esta despesa vencida
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
    },

    verificarSaldosNegativos() {
        if (!dadosFinanceiros || typeof calcularSaldoMes !== 'function') return;

        const anoAtual = new Date().getFullYear();
        
        for (let mes = 0; mes < 12; mes++) {
            const saldo = calcularSaldoMes(mes, anoAtual);
            
            if (saldo.saldoFinal < 0) {
                // Verifica se já existe notificação para este saldo negativo
                const jaNotificado = this.notificacoes.some(n => 
                    n.tipo === 'saldo_negativo' && 
                    n.dados.mes === mes &&
                    n.dados.ano === anoAtual
                );

                if (!jaNotificado) {
                    this.notificarSaldoNegativo(mes, anoAtual, saldo.saldoFinal);
                }
            }
        }
    },

    verificarBackupRecomendado() {
        const ultimoBackup = localStorage.getItem('ultimo_backup');
        const agora = Date.now();
        
        // Se nunca fez backup ou fez há mais de 30 dias
        if (!ultimoBackup || (agora - new Date(ultimoBackup)) > 30 * 24 * 60 * 60 * 1000) {
            // Verifica se já existe notificação de backup
            const jaNotificado = this.notificacoes.some(n => 
                n.tipo === 'backup_recomendado' && 
                !n.lida
            );

            if (!jaNotificado) {
                this.notificarBackupRecomendado();
            }
        }
    },

    // ============================================================
    // GERENCIAMENTO DE NOTIFICAÇÕES
    // ============================================================
    adicionarNotificacao(notificacao) {
        this.notificacoes.unshift(notificacao);
        
        // Limita o número máximo de notificações
        if (this.notificacoes.length > this.maxNotificacoes) {
            this.notificacoes = this.notificacoes.slice(0, this.maxNotificacoes);
        }
        
        this.salvarNotificacoes();
        this.atualizarBadge();
        this.renderizarNotificacoes();
    },

    marcarComoLida(id) {
        const notificacao = this.notificacoes.find(n => n.id === id);
        if (notificacao) {
            notificacao.lida = true;
            this.salvarNotificacoes();
            this.atualizarBadge();
            this.renderizarNotificacoes();
        }
    },

    marcarTodasComoLidas() {
        this.notificacoes.forEach(n => n.lida = true);
        this.salvarNotificacoes();
        this.atualizarBadge();
        this.renderizarNotificacoes();
    },

    excluirNotificacao(id) {
        this.notificacoes = this.notificacoes.filter(n => n.id !== id);
        this.salvarNotificacoes();
        this.atualizarBadge();
        this.renderizarNotificacoes();
    },

    limparTodasNotificacoes() {
        this.notificacoes = [];
        this.salvarNotificacoes();
        this.atualizarBadge();
        this.renderizarNotificacoes();
    },

    limparNotificacoesExpiradas() {
        const agora = new Date().toISOString();
        const antes = this.notificacoes.length;
        
        this.notificacoes = this.notificacoes.filter(n => 
            !n.expiresAt || n.expiresAt > agora
        );
        
        if (this.notificacoes.length !== antes) {
            this.salvarNotificacoes();
            this.atualizarBadge();
        }
    },

    // ============================================================
    // INTERFACE E RENDERIZAÇÃO
    // ============================================================
    configurarEventos() {
        // Botão do sino de notificações
        const notificationBell = document.getElementById('notification-bell');
        if (notificationBell) {
            notificationBell.addEventListener('click', () => {
                this.abrirModal();
            });
        }

        // Botões do modal
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

        // Fechar modal clicando fora
        if (modalNotificacoes) {
            modalNotificacoes.addEventListener('click', (e) => {
                if (e.target === modalNotificacoes) {
                    this.fecharModal();
                }
            });
        }
    },

    abrirModal() {
        const modal = document.getElementById('modal-notificacoes');
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.display = 'block';
            this.renderizarNotificacoes();
        }
    },

    fecharModal() {
        const modal = document.getElementById('modal-notificacoes');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
    },

    renderizarNotificacoes() {
        const container = document.getElementById('notifications-list');
        if (!container) return;

        container.innerHTML = '';

        if (this.notificacoes.length === 0) {
            container.innerHTML = `
                <div class="notification-empty">
                    <div class="empty-icon">🔔</div>
                    <p>Nenhuma notificação</p>
                </div>
            `;
            return;
        }

        this.notificacoes.forEach(notificacao => {
            const item = this.criarItemNotificacao(notificacao);
            container.appendChild(item);
        });
    },

    criarItemNotificacao(notificacao) {
        const template = document.getElementById('template-notification-item');
        if (!template) {
            console.error('Template de notificação não encontrado');
            return document.createElement('div');
        }

        const clone = template.content.cloneNode(true);
        const item = clone.querySelector('.notification-item');

        // Configurar dados
        item.dataset.id = notificacao.id;
        item.dataset.tipo = notificacao.tipo;
        
        if (!notificacao.lida) {
            item.classList.add('unread');
        }

        // Preencher conteúdo
        clone.querySelector('.notification-icon').textContent = notificacao.icone;
        clone.querySelector('.notification-title').textContent = notificacao.titulo;
        clone.querySelector('.notification-message').textContent = notificacao.mensagem;
        clone.querySelector('.notification-time').textContent = this.formatarTempo(notificacao.dataHora);

        // Configurar botões
        const btnMarkRead = clone.querySelector('.btn-mark-read');
        const btnDelete = clone.querySelector('.btn-delete-notification');

        if (btnMarkRead) {
            if (notificacao.lida) {
                btnMarkRead.style.opacity = '0.3';
                btnMarkRead.disabled = true;
            } else {
                btnMarkRead.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.marcarComoLida(notificacao.id);
                });
            }
        }

        if (btnDelete) {
            btnDelete.addEventListener('click', (e) => {
                e.stopPropagation();
                this.excluirNotificacao(notificacao.id);
            });
        }

        // Click na notificação para executar ação
        item.addEventListener('click', () => {
            this.executarAcaoNotificacao(notificacao);
            if (!notificacao.lida) {
                this.marcarComoLida(notificacao.id);
            }
        });

        return clone;
    },

    executarAcaoNotificacao(notificacao) {
        const dados = notificacao.dados;
        
        switch (dados.acao) {
            case 'abrir_despesa':
                if (typeof abrirDetalhesDoMes === 'function') {
                    abrirDetalhesDoMes(dados.mes, dados.ano);
                    this.fecharModal();
                }
                break;
                
            case 'abrir_mes':
                if (typeof abrirDetalhesDoMes === 'function') {
                    abrirDetalhesDoMes(dados.mes, dados.ano);
                    this.fecharModal();
                }
                break;
                
            case 'abrir_dashboard':
                // Navegar para dashboard
                const dashboardLink = document.querySelector('.nav-link[data-section="dashboard"]');
                if (dashboardLink) {
                    dashboardLink.click();
                    this.fecharModal();
                }
                break;
                
            case 'abrir_configuracoes':
                // Navegar para configurações
                const configLink = document.querySelector('.nav-link[data-section="config"]');
                if (configLink) {
                    configLink.click();
                    this.fecharModal();
                }
                break;
        }
    },

    atualizarBadge() {
        const badge = document.getElementById('notification-count');
        const naoLidas = this.notificacoes.filter(n => !n.lida).length;
        
        if (badge) {
            if (naoLidas > 0) {
                badge.textContent = naoLidas > 99 ? '99+' : naoLidas;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    },

    // ============================================================
    // PERSISTÊNCIA DE DADOS
    // ============================================================
    salvarNotificacoes() {
        const usuarioAtual = sessionStorage.getItem('usuarioAtual');
        if (usuarioAtual) {
            const chave = `notificacoes_${usuarioAtual}`;
            localStorage.setItem(chave, JSON.stringify(this.notificacoes));
        }
    },

    carregarNotificacoes() {
        const usuarioAtual = sessionStorage.getItem('usuarioAtual');
        if (usuarioAtual) {
            const chave = `notificacoes_${usuarioAtual}`;
            const dados = localStorage.getItem(chave);
            
            if (dados) {
                try {
                    this.notificacoes = JSON.parse(dados);
                } catch (error) {
                    console.error('Erro ao carregar notificações:', error);
                    this.notificacoes = [];
                }
            }
        }
    },

    // ============================================================
    // UTILITÁRIOS
    // ============================================================
    gerarId() {
        return 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },

    formatarTempo(dataHora) {
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
    }
};

// ============================================================
// INTEGRAÇÃO COM O SISTEMA EXISTENTE
// ============================================================

// Intercepta funções existentes para criar notificações automáticas
const originalProcessarPagamento = window.processarPagamento;
if (originalProcessarPagamento) {
    window.processarPagamento = function(index, mes, ano, valorPago, quitarParcelasFuturas) {
        const resultado = originalProcessarPagamento.call(this, index, mes, ano, valorPago, quitarParcelasFuturas);
        
        if (resultado && dadosFinanceiros[ano]?.meses[mes]?.despesas[index]) {
            const despesa = dadosFinanceiros[ano].meses[mes].despesas[index];
            SistemaNotificacoes.notificarPagamentoProcessado(despesa, valorPago || despesa.valor);
        }
        
        return resultado;
    };
}

const originalFecharMes = window.fecharMes;
if (originalFecharMes) {
    window.fecharMes = function(mes, ano) {
        const resultado = originalFecharMes.call(this, mes, ano);
        
        if (resultado && typeof calcularSaldoMes === 'function') {
            const saldo = calcularSaldoMes(mes, ano);
            SistemaNotificacoes.notificarMesFechado(mes, ano, saldo.saldoFinal);
        }
        
        return resultado;
    };
}

// ============================================================
// INICIALIZAÇÃO AUTOMÁTICA
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    // Aguarda um pouco para garantir que outras variáveis globais estejam disponíveis
    setTimeout(() => {
        SistemaNotificacoes.init();
    }, 1000);
});

// Exportar para escopo global
window.SistemaNotificacoes = SistemaNotificacoes;