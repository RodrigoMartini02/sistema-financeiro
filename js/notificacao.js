// ================================================================
// SISTEMA DE NOTIFICAÇÕES - VERSÃO CORRIGIDA E COMPATÍVEL
// Compatible com receitas.js e despesas.js - Sem interceptações
// ================================================================

class SistemaNotificacoes {
    constructor() {
        this.notificacoes = [];
        this.maxNotificacoes = 50;
        this.inicializado = false;
        this.verificandoAutomaticamente = false;
        
        // Aguardar sistemas principais estarem prontos
        this.aguardarSistemasProntos();
    }

    // ================================================================
    // INICIALIZAÇÃO SEGURA
    // ================================================================
    
    async aguardarSistemasProntos() {
        let tentativas = 0;
        const maxTentativas = 50; // 10 segundos
        
        const verificar = () => {
            tentativas++;
            
            // Verificar se sistemas principais estão prontos
            const sistemaPronto = window.sistemaInicializado === true;
            const dadosDisponiveis = typeof window.dadosFinanceiros !== 'undefined';
            const funcionesBasicas = typeof window.formatarMoeda === 'function';
            
            if (sistemaPronto && dadosDisponiveis && funcionesBasicas) {
                console.log('✅ SistemaNotificacoes: Dependências prontas, inicializando...');
                this.init();
            } else if (tentativas >= maxTentativas) {
                console.warn('⚠️ SistemaNotificacoes: Timeout, inicializando com funcionalidades limitadas...');
                this.init();
            } else {
                console.log(`⏳ SistemaNotificacoes aguardando dependências... ${tentativas}/${maxTentativas}`);
                setTimeout(verificar, 200);
            }
        };
        
        verificar();
    }

    // ============================================================
    // TIPOS DE NOTIFICAÇÕES
    // ============================================================
    tipos = {
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
        },
        TRANSACAO_SALVA: {
            codigo: 'transacao_salva',
            icone: '💾',
            titulo: 'Transação Salva',
            prioridade: 'sucesso'
        },
        TRANSACAO_EXCLUIDA: {
            codigo: 'transacao_excluida',
            icone: '🗑️',
            titulo: 'Transação Excluída',
            prioridade: 'info'
        }
    };

    // ============================================================
    // INICIALIZAÇÃO
    // ============================================================
    init() {
        if (this.inicializado) {
            console.log('⚠️ SistemaNotificacoes já foi inicializado');
            return;
        }

        console.log('🚀 Inicializando SistemaNotificacoes...');
        
        this.carregarNotificacoes();
        this.configurarEventos();
        this.atualizarBadge();
        
        // Aguardar um pouco antes de iniciar verificações automáticas
        setTimeout(() => {
            this.verificarNotificacoesPendentes();
            this.iniciarVerificacaoAutomatica();
        }, 2000);
        
        this.inicializado = true;
        console.log('✅ SistemaNotificacoes inicializado com sucesso');
    }

    iniciarVerificacaoAutomatica() {
        if (this.verificandoAutomaticamente) return;
        
        this.verificandoAutomaticamente = true;
        
        // Verificação a cada 5 minutos
        setInterval(() => {
            try {
                this.verificarNotificacoesPendentes();
            } catch (error) {
                console.error('❌ Erro na verificação automática:', error);
            }
        }, 5 * 60 * 1000);
        
        console.log('🔄 Verificação automática de notificações iniciada');
    }

    // ============================================================
    // CRIAÇÃO DE NOTIFICAÇÕES
    // ============================================================
    criarNotificacao(tipo, dados = {}) {
        try {
            const tipoConfig = this.tipos[tipo];
            if (!tipoConfig) {
                console.warn('⚠️ Tipo de notificação inválido:', tipo);
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
        } catch (error) {
            console.error('❌ Erro ao criar notificação:', error);
            return null;
        }
    }

    // ============================================================
    // NOTIFICAÇÕES ESPECÍFICAS - SEM INTERCEPTAÇÕES
    // ============================================================
    
    // Método público para ser chamado externamente
    notificarTransacaoSalva(tipo, descricao, valor) {
        const tipoTexto = tipo === 'receita' ? 'Receita' : 'Despesa';
        const icone = tipo === 'receita' ? '💰' : '💸';
        const mensagem = `${tipoTexto} "${descricao}" salva com sucesso. Valor: ${this.formatarMoedaSeguro(valor)}`;
        
        return this.criarNotificacao('TRANSACAO_SALVA', {
            mensagem,
            tipo,
            descricao,
            valor,
            icone,
            acao: 'info'
        });
    }

    // Método público para ser chamado externamente
    notificarTransacaoExcluida(tipo, descricao, valor) {
        const tipoTexto = tipo === 'receita' ? 'Receita' : 'Despesa';
        const mensagem = `${tipoTexto} "${descricao}" excluída. Valor: ${this.formatarMoedaSeguro(valor)}`;
        
        return this.criarNotificacao('TRANSACAO_EXCLUIDA', {
            mensagem,
            tipo,
            descricao,
            valor,
            acao: 'info'
        });
    }

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
        const mensagem = `A despesa "${despesa.descricao}" está ${diasAtraso} dia(s) em atraso. Valor: ${this.formatarMoedaSeguro(despesa.valor)}`;
        
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

    notificarReceitaRecebida(receita) {
        const mensagem = `Receita "${receita.descricao}" no valor de ${this.formatarMoedaSeguro(receita.valor)} foi registrada`;
        
        return this.criarNotificacao('RECEITA_RECEBIDA', {
            mensagem,
            receita: receita,
            acao: 'abrir_mes'
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

    notificarBackupRecomendado() {
        const ultimoBackup = localStorage.getItem('ultimo_backup');
        const diasSemBackup = ultimoBackup ? 
            Math.floor((Date.now() - new Date(ultimoBackup)) / (1000 * 60 * 60 * 24)) : 30;
        
        const mensagem = `Recomendamos fazer backup dos seus dados. ${diasSemBackup} dias sem backup.`;
        
        return this.criarNotificacao('BACKUP_RECOMENDADO', {
            mensagem,
            diasSemBackup,
            acao: 'abrir_configuracoes',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });
    }

    // ============================================================
    // VERIFICAÇÕES AUTOMÁTICAS - COM PROTEÇÕES
    // ============================================================
    verificarNotificacoesPendentes() {
        try {
            // Verificar se dados estão disponíveis
            if (typeof window.dadosFinanceiros === 'undefined' || !window.dadosFinanceiros) {
                console.log('⏳ Dados financeiros não disponíveis para verificação');
                return;
            }

            this.verificarDespesasVencendo();
            this.verificarDespesasVencidas();
            this.verificarSaldosNegativos();
            this.verificarBackupRecomendado();
            this.limparNotificacoesExpiradas();
        } catch (error) {
            console.error('❌ Erro nas verificações automáticas:', error);
        }
    }

    verificarDespesasVencendo() {
        try {
            const hoje = new Date();
            const em3Dias = new Date(hoje.getTime() + 3 * 24 * 60 * 60 * 1000);

            for (const ano in window.dadosFinanceiros) {
                const anoData = window.dadosFinanceiros[ano];
                if (!anoData || !anoData.meses) continue;

                for (let mes = 0; mes < 12; mes++) {
                    const dadosMes = anoData.meses[mes];
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
        } catch (error) {
            console.error('❌ Erro ao verificar despesas vencendo:', error);
        }
    }

    verificarDespesasVencidas() {
        try {
            const hoje = new Date();

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
        } catch (error) {
            console.error('❌ Erro ao verificar despesas vencidas:', error);
        }
    }

    verificarSaldosNegativos() {
        try {
            if (typeof window.calcularSaldoMes !== 'function') {
                console.log('⏳ Função calcularSaldoMes não disponível');
                return;
            }

            const anoAtual = new Date().getFullYear();
            
            for (let mes = 0; mes < 12; mes++) {
                const saldo = window.calcularSaldoMes(mes, anoAtual);
                
                if (saldo && saldo.saldoFinal < 0) {
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
        } catch (error) {
            console.error('❌ Erro ao verificar saldos negativos:', error);
        }
    }

    verificarBackupRecomendado() {
        try {
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
        } catch (error) {
            console.error('❌ Erro ao verificar backup:', error);
        }
    }

    // ============================================================
    // GERENCIAMENTO DE NOTIFICAÇÕES
    // ============================================================
    adicionarNotificacao(notificacao) {
        try {
            this.notificacoes.unshift(notificacao);
            
            // Limita o número máximo de notificações
            if (this.notificacoes.length > this.maxNotificacoes) {
                this.notificacoes = this.notificacoes.slice(0, this.maxNotificacoes);
            }
            
            this.salvarNotificacoes();
            this.atualizarBadge();
            this.renderizarNotificacoes();
        } catch (error) {
            console.error('❌ Erro ao adicionar notificação:', error);
        }
    }

    marcarComoLida(id) {
        try {
            const notificacao = this.notificacoes.find(n => n.id === id);
            if (notificacao) {
                notificacao.lida = true;
                this.salvarNotificacoes();
                this.atualizarBadge();
                this.renderizarNotificacoes();
            }
        } catch (error) {
            console.error('❌ Erro ao marcar notificação como lida:', error);
        }
    }

    marcarTodasComoLidas() {
        try {
            this.notificacoes.forEach(n => n.lida = true);
            this.salvarNotificacoes();
            this.atualizarBadge();
            this.renderizarNotificacoes();
        } catch (error) {
            console.error('❌ Erro ao marcar todas como lidas:', error);
        }
    }

    excluirNotificacao(id) {
        try {
            this.notificacoes = this.notificacoes.filter(n => n.id !== id);
            this.salvarNotificacoes();
            this.atualizarBadge();
            this.renderizarNotificacoes();
        } catch (error) {
            console.error('❌ Erro ao excluir notificação:', error);
        }
    }

    limparTodasNotificacoes() {
        try {
            this.notificacoes = [];
            this.salvarNotificacoes();
            this.atualizarBadge();
            this.renderizarNotificacoes();
        } catch (error) {
            console.error('❌ Erro ao limpar notificações:', error);
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
            console.error('❌ Erro ao limpar notificações expiradas:', error);
        }
    }

    // ============================================================
    // INTERFACE E RENDERIZAÇÃO
    // ============================================================
    configurarEventos() {
        try {
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
        } catch (error) {
            console.error('❌ Erro ao configurar eventos:', error);
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
            console.error('❌ Erro ao abrir modal:', error);
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
            console.error('❌ Erro ao fechar modal:', error);
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
                        <div class="empty-icon">🔔</div>
                        <p>Nenhuma notificação</p>
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
            console.error('❌ Erro ao renderizar notificações:', error);
        }
    }

    criarItemNotificacao(notificacao) {
        try {
            const template = document.getElementById('template-notification-item');
            if (!template) {
                console.warn('⚠️ Template de notificação não encontrado');
                return this.criarItemNotificacaoFallback(notificacao);
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
        } catch (error) {
            console.error('❌ Erro ao criar item de notificação:', error);
            return this.criarItemNotificacaoFallback(notificacao);
        }
    }

    criarItemNotificacaoFallback(notificacao) {
        const div = document.createElement('div');
        div.className = 'notification-item' + (notificacao.lida ? '' : ' unread');
        div.innerHTML = `
            <span class="notification-icon">${notificacao.icone}</span>
            <div class="notification-content">
                <div class="notification-title">${notificacao.titulo}</div>
                <div class="notification-message">${notificacao.mensagem}</div>
                <div class="notification-time">${this.formatarTempo(notificacao.dataHora)}</div>
            </div>
        `;
        
        div.addEventListener('click', () => {
            this.executarAcaoNotificacao(notificacao);
            if (!notificacao.lida) {
                this.marcarComoLida(notificacao.id);
            }
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
                    
                case 'info':
                default:
                    // Apenas marcar como lida
                    break;
            }
        } catch (error) {
            console.error('❌ Erro ao executar ação da notificação:', error);
        }
    }

    atualizarBadge() {
        try {
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
        } catch (error) {
            console.error('❌ Erro ao atualizar badge:', error);
        }
    }

    // ============================================================
    // PERSISTÊNCIA DE DADOS
    // ============================================================
    salvarNotificacoes() {
        try {
            const usuarioAtual = sessionStorage.getItem('usuarioAtual');
            if (usuarioAtual) {
                const chave = `notificacoes_${usuarioAtual}`;
                localStorage.setItem(chave, JSON.stringify(this.notificacoes));
            }
        } catch (error) {
            console.error('❌ Erro ao salvar notificações:', error);
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
            console.error('❌ Erro ao carregar notificações:', error);
            this.notificacoes = [];
        }
    }

    // ============================================================
    // UTILITÁRIOS SEGUROS
    // ============================================================
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
            console.error('❌ Erro ao formatar tempo:', error);
            return 'Data inválida';
        }
    }

    formatarMoedaSeguro(valor) {
        try {
            if (typeof window.formatarMoeda === 'function') {
                return window.formatarMoeda(valor);
            }
            
            // Fallback simples
            return new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL'
            }).format(valor || 0);
        } catch (error) {
            console.error('❌ Erro ao formatar moeda:', error);
            return `R$ ${(valor || 0).toFixed(2)}`;
        }
    }

    // ============================================================
    // MÉTODOS PÚBLICOS DE INTEGRAÇÃO
    // ============================================================
    
    /**
     * Método público para sistemas externos notificarem transações
     * Deve ser chamado por receitas.js e despesas.js após salvar
     */
    onTransacaoSalva(tipo, transacao) {
        if (!this.inicializado) {
            console.log('⏳ Sistema de notificações não inicializado ainda');
            return;
        }

        try {
            this.notificarTransacaoSalva(tipo, transacao.descricao, transacao.valor);
        } catch (error) {
            console.error('❌ Erro ao notificar transação salva:', error);
        }
    }

    /**
     * Método público para sistemas externos notificarem exclusões
     */
    onTransacaoExcluida(tipo, transacao) {
        if (!this.inicializado) {
            console.log('⏳ Sistema de notificações não inicializado ainda');
            return;
        }

        try {
            this.notificarTransacaoExcluida(tipo, transacao.descricao, transacao.valor);
        } catch (error) {
            console.error('❌ Erro ao notificar transação excluída:', error);
        }
    }

    /**
     * Método público para sistemas externos notificarem pagamentos
     */
    onPagamentoProcessado(despesa, valorPago) {
        if (!this.inicializado) {
            console.log('⏳ Sistema de notificações não inicializado ainda');
            return;
        }

        try {
            this.notificarPagamentoProcessado(despesa, valorPago);
        } catch (error) {
            console.error('❌ Erro ao notificar pagamento:', error);
        }
    }

    /**
     * Método público para sistemas externos notificarem fechamento de mês
     */
    onMesFechado(mes, ano, saldo) {
        if (!this.inicializado) {
            console.log('⏳ Sistema de notificações não inicializado ainda');
            return;
        }

        try {
            this.notificarMesFechado(mes, ano, saldo);
        } catch (error) {
            console.error('❌ Erro ao notificar fechamento de mês:', error);
        }
    }

    // ============================================================
    // DIAGNÓSTICO E DEBUG
    // ============================================================
    diagnostico() {
        return {
            inicializado: this.inicializado,
            verificandoAutomaticamente: this.verificandoAutomaticamente,
            totalNotificacoes: this.notificacoes.length,
            naoLidas: this.notificacoes.filter(n => !n.lida).length,
            dependenciasDisponiveis: {
                dadosFinanceiros: typeof window.dadosFinanceiros !== 'undefined',
                formatarMoeda: typeof window.formatarMoeda === 'function',
                calcularSaldoMes: typeof window.calcularSaldoMes === 'function',
                abrirDetalhesDoMes: typeof window.abrirDetalhesDoMes === 'function'
            },
            elementosDOM: {
                notificationBell: !!document.getElementById('notification-bell'),
                modal: !!document.getElementById('modal-notificacoes'),
                badge: !!document.getElementById('notification-count'),
                template: !!document.getElementById('template-notification-item')
            }
        };
    }

    // ============================================================
    // MÉTODOS DE LIMPEZA
    // ============================================================
    destruir() {
        try {
            this.verificandoAutomaticamente = false;
            this.inicializado = false;
            this.notificacoes = [];
            console.log('🧹 SistemaNotificacoes destruído');
        } catch (error) {
            console.error('❌ Erro ao destruir sistema:', error);
        }
    }
}

// ================================================================
// INSTÂNCIA GLOBAL E INTEGRAÇÃO SEGURA
// ================================================================

// Criar instância global
let sistemaNotificacoes = null;

// Função de inicialização controlada
function inicializarSistemaNotificacoes() {
    if (!sistemaNotificacoes) {
        sistemaNotificacoes = new SistemaNotificacoes();
        
        // Exportar métodos públicos para integração
        window.SistemaNotificacoes = {
            // Métodos para sistemas externos chamarem
            onTransacaoSalva: (tipo, transacao) => sistemaNotificacoes?.onTransacaoSalva(tipo, transacao),
            onTransacaoExcluida: (tipo, transacao) => sistemaNotificacoes?.onTransacaoExcluida(tipo, transacao),
            onPagamentoProcessado: (despesa, valor) => sistemaNotificacoes?.onPagamentoProcessado(despesa, valor),
            onMesFechado: (mes, ano, saldo) => sistemaNotificacoes?.onMesFechado(mes, ano, saldo),
            
            // Métodos de controle
            abrir: () => sistemaNotificacoes?.abrirModal(),
            fechar: () => sistemaNotificacoes?.fecharModal(),
            marcarTodasLidas: () => sistemaNotificacoes?.marcarTodasComoLidas(),
            limparTodas: () => sistemaNotificacoes?.limparTodasNotificacoes(),
            
            // Diagnóstico
            diagnostico: () => sistemaNotificacoes?.diagnostico(),
            
            // Estado
            get inicializado() { return sistemaNotificacoes?.inicializado || false; },
            get totalNotificacoes() { return sistemaNotificacoes?.notificacoes?.length || 0; }
        };
        
        console.log('✅ SistemaNotificacoes instanciado e métodos públicos exportados');
    }
}

// ================================================================
// INICIALIZAÇÃO AUTOMÁTICA SEGURA
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 SistemaNotificacoes: DOM carregado, preparando inicialização...');
    
    // Aguardar um pouco antes de tentar inicializar
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
// INTEGRAÇÃO COM SISTEMAS EXISTENTES (OPCIONAL)
// ================================================================

// Se window.addEventListener estiver disponível, aguardar evento customizado
if (typeof window.addEventListener === 'function') {
    window.addEventListener('sistemaFinanceiroReady', function() {
        console.log('🔔 SistemaNotificacoes: Recebido evento sistemaFinanceiroReady');
        if (!sistemaNotificacoes) {
            inicializarSistemaNotificacoes();
        }
    });
}

console.log('📦 SistemaNotificacoes carregado - aguardando inicialização segura...');