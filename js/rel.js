
// Sistema de Relatórios em Tela Cheia - Versão Atualizada
class RelatoriosTelaCheia {
    constructor() {
        this.secao = null;
        this.dadosProcessados = null;
        this.filtrosAtuais = {};
        
        this.inicializar();
    }

    inicializar() {
        console.log('📊 Inicializando Sistema de Relatórios em Tela Cheia...');
        this.configurarEventos();
        this.carregarCategorias();
        this.configurarDatasDefault();
    }

    configurarEventos() {
        // Aguardar que o DOM esteja totalmente carregado
        setTimeout(() => {
            this.configurarEventosSecao();
        }, 100);
    }

    configurarEventosSecao() {
        this.secao = document.getElementById('relatorios-section');
        if (!this.secao) {
            console.warn('Seção de relatórios não encontrada');
            return;
        }

        // Período personalizado
        const filtroPeriodo = document.getElementById('filtro-periodo');
        if (filtroPeriodo) {
            filtroPeriodo.addEventListener('change', () => {
                const personalizadoContainer = document.getElementById('periodo-personalizado-container');
                personalizadoContainer.classList.toggle('hidden', filtroPeriodo.value !== 'personalizado');
            });
        }

        // Gerar relatório
        const btnGerar = document.getElementById('btn-gerar-relatorio');
        if (btnGerar) {
            btnGerar.addEventListener('click', () => this.gerarRelatorio());
        }

        // Limpar filtros
        const btnLimpar = document.getElementById('btn-limpar-filtros-relatorio');
        if (btnLimpar) {
            btnLimpar.addEventListener('click', () => this.limparFiltros());
        }

        // Exportar PDF
        const btnPDF = document.getElementById('btn-exportar-pdf-relatorio');
        if (btnPDF) {
            btnPDF.addEventListener('click', () => this.exportarPDF());
        }

        console.log('✅ Eventos da seção de relatórios configurados');
    }

    carregarCategorias() {
        const select = document.getElementById('filtro-categoria-relatorio');
        if (!select || typeof dadosFinanceiros === 'undefined') return;

        const categorias = new Set(['todas']);
        
        // Coletar todas as categorias
        for (const ano in dadosFinanceiros) {
            if (!dadosFinanceiros[ano].meses) continue;
            
            for (let mes = 0; mes < 12; mes++) {
                const dadosMes = dadosFinanceiros[ano].meses[mes];
                if (!dadosMes?.despesas) continue;
                
                dadosMes.despesas.forEach(despesa => {
                    let categoria = despesa.categoria || 'Outros';
                    if (!despesa.formaPagamento && (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito')) {
                        categoria = despesa.categoriaCartao || 'Outros';
                    }
                    categorias.add(categoria);
                });
            }
        }

        select.innerHTML = Array.from(categorias).sort().map(categoria => 
            `<option value="${categoria}">${categoria}</option>`
        ).join('');
    }

    configurarDatasDefault() {
        const hoje = new Date();
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        
        const dataInicio = document.getElementById('data-inicio-relatorio');
        const dataFim = document.getElementById('data-fim-relatorio');
        
        if (dataInicio) dataInicio.value = inicioMes.toISOString().split('T')[0];
        if (dataFim) dataFim.value = hoje.toISOString().split('T')[0];
    }

    obterPeriodoSelecionado() {
        const periodo = document.getElementById('filtro-periodo').value;
        const hoje = new Date();
        let dataInicio, dataFim;

        switch (periodo) {
            case 'mes-atual':
                dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
                dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
                break;
            case 'mes-anterior':
                dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
                dataFim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
                break;
            case 'ultimos-3-meses':
                dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
                dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
                break;
            case 'ultimos-6-meses':
                dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);
                dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
                break;
            case 'ano-atual':
                dataInicio = new Date(hoje.getFullYear(), 0, 1);
                dataFim = new Date(hoje.getFullYear(), 11, 31);
                break;
            case 'ano-anterior':
                dataInicio = new Date(hoje.getFullYear() - 1, 0, 1);
                dataFim = new Date(hoje.getFullYear() - 1, 11, 31);
                break;
            case 'personalizado':
                const dataInicioInput = document.getElementById('data-inicio-relatorio').value;
                const dataFimInput = document.getElementById('data-fim-relatorio').value;
                dataInicio = dataInicioInput ? new Date(dataInicioInput) : new Date(hoje.getFullYear(), 0, 1);
                dataFim = dataFimInput ? new Date(dataFimInput) : hoje;
                break;
            default:
                dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
                dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        }

        return { dataInicio, dataFim };
    }

    coletarFiltros() {
        this.filtrosAtuais = {
            periodo: document.getElementById('filtro-periodo').value,
            tipoRelatorio: document.getElementById('filtro-tipo-relatorio').value,
            categoria: document.getElementById('filtro-categoria-relatorio').value,
            formaPagamento: document.getElementById('filtro-forma-pagamento-relatorio').value,
            status: document.getElementById('filtro-status-relatorio').value,
            ordenacao: document.getElementById('filtro-ordenacao').value
        };
    }

    filtrarDados() {
        const { dataInicio, dataFim } = this.obterPeriodoSelecionado();
        let receitas = [];
        let despesas = [];

        // Percorrer todos os dados
        for (const ano in dadosFinanceiros) {
            if (!dadosFinanceiros[ano].meses) continue;

            for (let mes = 0; mes < 12; mes++) {
                const dadosMes = dadosFinanceiros[ano].meses[mes];
                if (!dadosMes) continue;

                const dataMes = new Date(parseInt(ano), mes, 15);
                
                if (dataMes >= dataInicio && dataMes <= dataFim) {
                    // Processar receitas
                    if (dadosMes.receitas && ['completo', 'apenas-receitas'].includes(this.filtrosAtuais.tipoRelatorio)) {
                        receitas.push(...dadosMes.receitas.map(r => ({
                            ...r,
                            ano: parseInt(ano),
                            mes: mes,
                            tipo: 'receita',
                            data: r.data || `${ano}-${String(mes + 1).padStart(2, '0')}-15`
                        })));
                    }

                    // Processar despesas
                    if (dadosMes.despesas && ['completo', 'apenas-despesas', 'por-categoria', 'por-forma-pagamento', 'parcelamentos'].includes(this.filtrosAtuais.tipoRelatorio)) {
                        let despesasMes = dadosMes.despesas.map(d => ({
                            ...d,
                            ano: parseInt(ano),
                            mes: mes,
                            tipo: 'despesa',
                            data: d.dataCompra || d.data || `${ano}-${String(mes + 1).padStart(2, '0')}-15`
                        }));

                        // Aplicar filtros
                        despesasMes = this.aplicarFiltrosDespesas(despesasMes);
                        despesas.push(...despesasMes);
                    }
                }
            }
        }

        return { receitas, despesas };
    }

    aplicarFiltrosDespesas(despesas) {
        return despesas.filter(despesa => {
            // Filtro por categoria
            if (this.filtrosAtuais.categoria !== 'todas') {
                let categoria = despesa.categoria || 'Outros';
                if (!despesa.formaPagamento && (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito')) {
                    categoria = despesa.categoriaCartao || 'Outros';
                }
                if (categoria !== this.filtrosAtuais.categoria) return false;
            }

            // Filtro por forma de pagamento
            if (this.filtrosAtuais.formaPagamento !== 'todas') {
                let forma = despesa.formaPagamento || 'debito';
                if (!despesa.formaPagamento && (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito')) {
                    forma = 'credito';
                }
                if (forma !== this.filtrosAtuais.formaPagamento) return false;
            }

            // Filtro por status
            if (this.filtrosAtuais.status !== 'todos') {
                const status = this.obterStatusDespesa(despesa);
                if (status !== this.filtrosAtuais.status) return false;
            }

            return true;
        });
    }

    obterStatusDespesa(despesa) {
        if (despesa.quitado) return 'quitadas';
        
        const hoje = new Date();
        const vencimento = new Date(despesa.dataVencimento || despesa.data);
        
        if (vencimento < hoje) return 'atrasadas';
        return 'pendentes';
    }

    gerarRelatorio() {
        this.mostrarLoading(true);
        this.coletarFiltros();

        // Scroll suave para o topo da seção
        this.secao.scrollIntoView({ behavior: 'smooth', block: 'start' });

        setTimeout(() => {
            const dados = this.filtrarDados();
            this.dadosProcessados = dados;
            this.processarDados(dados);
            this.mostrarLoading(false);
            
            // Habilitar botão de PDF
            const btnPDF = document.getElementById('btn-exportar-pdf-relatorio');
            if (btnPDF) btnPDF.disabled = false;
        }, 500);
    }

    processarDados(dados) {
        const { receitas, despesas } = dados;
        
        // Esconder todas as seções primeiro
        this.esconderTodasSecoes();

        // Mostrar seções relevantes baseado no tipo de relatório
        switch (this.filtrosAtuais.tipoRelatorio) {
            case 'completo':
                this.mostrarResumoExecutivo(receitas, despesas);
                this.mostrarDetalhamentoCategorias(receitas, despesas);
                this.mostrarDetalhamentoPagamento(despesas);
                this.mostrarListaTransacoes([...receitas, ...despesas]);
                break;
            case 'apenas-receitas':
                this.mostrarResumoExecutivo(receitas, []);
                this.mostrarListaTransacoes(receitas);
                break;
            case 'apenas-despesas':
                this.mostrarResumoExecutivo([], despesas);
                this.mostrarListaTransacoes(despesas);
                break;
            case 'por-categoria':
                this.mostrarDetalhamentoCategorias(receitas, despesas);
                break;
            case 'por-forma-pagamento':
                this.mostrarDetalhamentoPagamento(despesas);
                break;
            case 'parcelamentos':
                this.mostrarDetalhamentoParcelamentos(despesas);
                break;
        }

        // Verificar se há dados
        if (receitas.length === 0 && despesas.length === 0) {
            this.mostrarMensagemSemDados();
        }
    }

    esconderTodasSecoes() {
        const secoes = [
            'resumo-executivo',
            'detalhamento-categorias', 
            'detalhamento-pagamento',
            'lista-transacoes',
            'detalhamento-parcelamentos',
            'sem-dados-mensagem'
        ];
        
        secoes.forEach(id => {
            const elemento = document.getElementById(id);
            if (elemento) elemento.classList.add('hidden');
        });
    }

    mostrarResumoExecutivo(receitas, despesas) {
        const secao = document.getElementById('resumo-executivo');
        if (!secao) return;

        const totalReceitas = receitas.reduce((sum, r) => sum + (r.valor || 0), 0);
        const totalDespesas = despesas.reduce((sum, d) => sum + (d.valor || 0), 0);
        const saldoLiquido = totalReceitas - totalDespesas;
        const totalJuros = this.calcularJuros(despesas);
        const economia = totalReceitas > 0 ? ((saldoLiquido / totalReceitas) * 100) : 0;

        document.getElementById('resumo-total-receitas').textContent = this.formatarMoeda(totalReceitas);
        document.getElementById('resumo-count-receitas').textContent = `${receitas.length} transações`;
        
        document.getElementById('resumo-total-despesas').textContent = this.formatarMoeda(totalDespesas);
        document.getElementById('resumo-count-despesas').textContent = `${despesas.length} transações`;
        
        const saldoElement = document.getElementById('resumo-saldo-liquido');
        saldoElement.textContent = this.formatarMoeda(saldoLiquido);
        saldoElement.className = `card-valor ${saldoLiquido >= 0 ? 'positivo' : 'negativo'}`;
        
        document.getElementById('resumo-economia').textContent = `${economia.toFixed(1)}% de economia`;
        document.getElementById('resumo-total-juros').textContent = this.formatarMoeda(totalJuros);
        
        const percentJuros = totalDespesas > 0 ? ((totalJuros / totalDespesas) * 100) : 0;
        document.getElementById('resumo-percent-juros').textContent = `${percentJuros.toFixed(1)}% do total`;

        secao.classList.remove('hidden');
    }

    mostrarDetalhamentoCategorias(receitas, despesas) {
        const secao = document.getElementById('detalhamento-categorias');
        const tbody = document.getElementById('tabela-categorias-body');
        if (!secao || !tbody) return;

        const categorias = {};
        
        // Processar receitas
        receitas.forEach(receita => {
            const categoria = 'Receitas';
            if (!categorias[categoria]) {
                categorias[categoria] = { receitas: 0, despesas: 0, transacoes: 0 };
            }
            categorias[categoria].receitas += receita.valor || 0;
            categorias[categoria].transacoes += 1;
        });

        // Processar despesas
        despesas.forEach(despesa => {
            let categoria = despesa.categoria || 'Outros';
            if (!despesa.formaPagamento && (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito')) {
                categoria = despesa.categoriaCartao || 'Outros';
            }
            
            if (!categorias[categoria]) {
                categorias[categoria] = { receitas: 0, despesas: 0, transacoes: 0 };
            }
            categorias[categoria].despesas += despesa.valor || 0;
            categorias[categoria].transacoes += 1;
        });

        const totalGeral = Object.values(categorias).reduce((sum, cat) => sum + cat.despesas, 0);

        tbody.innerHTML = Object.entries(categorias)
            .sort((a, b) => (b[1].receitas + b[1].despesas) - (a[1].receitas + a[1].despesas))
            .map(([categoria, dados]) => {
                const saldo = dados.receitas - dados.despesas;
                const percentual = totalGeral > 0 ? ((dados.despesas / totalGeral) * 100) : 0;
                
                return `
                    <tr>
                        <td><strong>${categoria}</strong></td>
                        <td class="valor-positivo">${this.formatarMoeda(dados.receitas)}</td>
                        <td class="valor-negativo">${this.formatarMoeda(dados.despesas)}</td>
                        <td class="${saldo >= 0 ? 'valor-positivo' : 'valor-negativo'}">${this.formatarMoeda(saldo)}</td>
                        <td>${percentual.toFixed(1)}%</td>
                        <td>${dados.transacoes}</td>
                    </tr>
                `;
            }).join('');

        secao.classList.remove('hidden');
    }

    mostrarDetalhamentoPagamento(despesas) {
        const secao = document.getElementById('detalhamento-pagamento');
        if (!secao) return;

        const formas = { pix: 0, debito: 0, credito: 0 };
        const contadores = { pix: 0, debito: 0, credito: 0 };

        despesas.forEach(despesa => {
            let forma = despesa.formaPagamento || 'debito';
            if (!despesa.formaPagamento && (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito')) {
                forma = 'credito';
            }
            
            if (formas.hasOwnProperty(forma)) {
                formas[forma] += despesa.valor || 0;
                contadores[forma] += 1;
            }
        });

        const totalGeral = Object.values(formas).reduce((sum, val) => sum + val, 0);

        Object.keys(formas).forEach(forma => {
            const valor = formas[forma];
            const count = contadores[forma];
            const percent = totalGeral > 0 ? ((valor / totalGeral) * 100) : 0;

            document.getElementById(`pagamento-${forma}-valor`).textContent = this.formatarMoeda(valor);
            document.getElementById(`pagamento-${forma}-count`).textContent = `${count} transações`;
            document.getElementById(`pagamento-${forma}-percent`).textContent = `${percent.toFixed(1)}%`;
        });

        secao.classList.remove('hidden');
    }

    mostrarListaTransacoes(transacoes) {
        const secao = document.getElementById('lista-transacoes');
        const tbody = document.getElementById('tabela-transacoes-body');
        const info = document.getElementById('transacoes-count-info');
        if (!secao || !tbody) return;

        // Ordenar transações
        transacoes = this.ordenarTransacoes(transacoes);

        info.textContent = `Mostrando ${transacoes.length} transações`;

        tbody.innerHTML = transacoes.map(transacao => {
            const data = new Date(transacao.data).toLocaleDateString('pt-BR');
            const tipo = transacao.tipo === 'receita' ? 'Receita' : 'Despesa';
            const categoria = this.obterCategoriaLimpa(transacao);
            const formaPagamento = this.obterFormaPagamento(transacao);
            const status = transacao.tipo === 'receita' ? 'Recebida' : this.obterStatusDespesa(transacao);
            
            const classeValor = transacao.tipo === 'receita' ? 'valor-positivo' : 'valor-negativo';
            const classeTipo = transacao.tipo === 'receita' ? 'badge-receita' : 'badge-despesa';
            const classeStatus = this.obterClasseStatus(status);

            return `
                <tr>
                    <td>${data}</td>
                    <td><span class="badge ${classeTipo}">${tipo}</span></td>
                    <td>${transacao.descricao || 'Sem descrição'}</td>
                    <td>${categoria}</td>
                    <td>${formaPagamento}</td>
                    <td class="${classeValor}">${this.formatarMoeda(transacao.valor || 0)}</td>
                    <td><span class="badge ${classeStatus}">${status}</span></td>
                </tr>
            `;
        }).join('');

        secao.classList.remove('hidden');
    }

    mostrarDetalhamentoParcelamentos(despesas) {
        const secao = document.getElementById('detalhamento-parcelamentos');
        const tbody = document.getElementById('tabela-parcelamentos-body');
        if (!secao || !tbody) return;

        const parcelamentos = this.processarParcelamentos(despesas);

        tbody.innerHTML = parcelamentos.map(p => `
            <tr>
                <td>${p.descricao}</td>
                <td>${this.formatarMoeda(p.valorTotal)}</td>
                <td>${p.totalParcelas}</td>
                <td>${this.formatarMoeda(p.valorParcela)}</td>
                <td>${p.parcelasPagas}</td>
                <td>${p.parcelasRestantes}</td>
                <td><span class="badge ${p.classe}">${p.status}</span></td>
            </tr>
        `).join('');

        secao.classList.remove('hidden');
    }

    processarParcelamentos(despesas) {
        const grupos = {};
        
        despesas.forEach(despesa => {
            if (despesa.parcelado && despesa.idGrupoParcelamento) {
                const id = despesa.idGrupoParcelamento;
                
                if (!grupos[id]) {
                    grupos[id] = {
                        descricao: despesa.descricao,
                        valorTotal: 0,
                        totalParcelas: despesa.totalParcelas || 1,
                        parcelasPagas: 0,
                        valorParcela: despesa.valor || 0
                    };
                }
                
                grupos[id].valorTotal += despesa.valor || 0;
                if (despesa.quitado) {
                    grupos[id].parcelasPagas += 1;
                }
            }
        });

        return Object.values(grupos).map(grupo => {
            const parcelasRestantes = grupo.totalParcelas - grupo.parcelasPagas;
            let status, classe;
            
            if (parcelasRestantes === 0) {
                status = 'Quitado';
                classe = 'badge-success';
            } else if (parcelasRestantes === grupo.totalParcelas) {
                status = 'Não Iniciado';
                classe = 'badge-warning';
            } else {
                status = 'Em Andamento';
                classe = 'badge-info';
            }

            return {
                ...grupo,
                parcelasRestantes,
                status,
                classe
            };
        });
    }

    mostrarMensagemSemDados() {
        const mensagem = document.getElementById('sem-dados-mensagem');
        if (mensagem) mensagem.classList.remove('hidden');
    }

    ordenarTransacoes(transacoes) {
        switch (this.filtrosAtuais.ordenacao) {
            case 'data':
                return transacoes.sort((a, b) => new Date(b.data) - new Date(a.data));
            case 'valor-desc':
                return transacoes.sort((a, b) => (b.valor || 0) - (a.valor || 0));
            case 'valor-asc':
                return transacoes.sort((a, b) => (a.valor || 0) - (b.valor || 0));
            case 'categoria':
                return transacoes.sort((a, b) => this.obterCategoriaLimpa(a).localeCompare(this.obterCategoriaLimpa(b)));
            case 'descricao':
                return transacoes.sort((a, b) => (a.descricao || '').localeCompare(b.descricao || ''));
            default:
                return transacoes;
        }
    }

    obterCategoriaLimpa(transacao) {
        if (transacao.tipo === 'receita') return 'Receita';
        
        let categoria = transacao.categoria || 'Outros';
        if (!transacao.formaPagamento && (transacao.categoria === 'Cartão' || transacao.categoria === 'Cartão de Crédito')) {
            categoria = transacao.categoriaCartao || 'Outros';
        }
        return categoria;
    }

    obterFormaPagamento(transacao) {
        if (transacao.tipo === 'receita') return '-';
        
        if (transacao.formaPagamento) {
            return transacao.formaPagamento.toUpperCase();
        }
        if (transacao.categoria === 'Cartão' || transacao.categoria === 'Cartão de Crédito') {
            return 'CRÉDITO';
        }
        return 'DÉBITO';
    }

    obterClasseStatus(status) {
        switch (status) {
            case 'quitadas':
            case 'Recebida':
                return 'badge-success';
            case 'atrasadas':
                return 'badge-danger';
            case 'pendentes':
                return 'badge-warning';
            default:
                return 'badge-secondary';
        }
    }

    calcularJuros(despesas) {
        return despesas.reduce((total, despesa) => {
            if (despesa.valorPago && despesa.valor && despesa.valorPago > despesa.valor) {
                return total + (despesa.valorPago - despesa.valor);
            }
            if (despesa.metadados?.jurosPorParcela) {
                return total + despesa.metadados.jurosPorParcela;
            }
            return total;
        }, 0);
    }

    formatarMoeda(valor) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(valor || 0);
    }

    mostrarLoading(mostrar) {
        const loading = document.getElementById('relatorios-loading');
        if (loading) {
            loading.classList.toggle('hidden', !mostrar);
        }
    }

    limparFiltros() {
        document.getElementById('filtro-periodo').value = 'mes-atual';
        document.getElementById('filtro-tipo-relatorio').value = 'completo';
        document.getElementById('filtro-categoria-relatorio').value = 'todas';
        document.getElementById('filtro-forma-pagamento-relatorio').value = 'todas';
        document.getElementById('filtro-status-relatorio').value = 'todos';
        document.getElementById('filtro-ordenacao').value = 'data';
        
        document.getElementById('periodo-personalizado-container').classList.add('hidden');
        this.esconderTodasSecoes();
        
        const btnPDF = document.getElementById('btn-exportar-pdf-relatorio');
        if (btnPDF) btnPDF.disabled = true;
    }

    exportarPDF() {
        if (!this.dadosProcessados) {
            alert('Gere um relatório primeiro!');
            return;
        }

        console.log('📄 Gerando PDF...');
        this.mostrarLoading(true);

        setTimeout(() => {
            this.gerarPDF();
            this.mostrarLoading(false);
        }, 1000);
    }

    gerarPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Configurações
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 20;
        let yPosition = margin;

        // Cabeçalho principal
        this.adicionarCabecalhoPDF(doc, yPosition);
        yPosition += 40;

        // Informações do relatório
        yPosition = this.adicionarInfoRelatorio(doc, yPosition);
        yPosition += 15;

        // Conteúdo baseado no tipo de relatório
        switch (this.filtrosAtuais.tipoRelatorio) {
            case 'completo':
                yPosition = this.adicionarResumoExecutivoPDF(doc, yPosition);
                yPosition = this.verificarNovaPagePDF(doc, yPosition, 80);
                yPosition = this.adicionarTabelaCategoriasPDF(doc, yPosition);
                yPosition = this.verificarNovaPagePDF(doc, yPosition, 100);
                yPosition = this.adicionarTabelaTransacoesPDF(doc, yPosition);
                break;
            case 'apenas-receitas':
                yPosition = this.adicionarTabelaTransacoesPDF(doc, yPosition, 'receitas');
                break;
            case 'apenas-despesas':
                yPosition = this.adicionarTabelaTransacoesPDF(doc, yPosition, 'despesas');
                break;
            case 'por-categoria':
                yPosition = this.adicionarTabelaCategoriasPDF(doc, yPosition);
                break;
            case 'por-forma-pagamento':
                yPosition = this.adicionarTabelaFormaPagamentoPDF(doc, yPosition);
                break;
            case 'parcelamentos':
                yPosition = this.adicionarTabelaParcelamentosPDF(doc, yPosition);
                break;
        }

        // Rodapé
        this.adicionarRodapePDF(doc);

        // Salvar arquivo
        const nomeArquivo = this.gerarNomeArquivo();
        doc.save(nomeArquivo);
        
        console.log('✅ PDF gerado com sucesso:', nomeArquivo);
    }

    adicionarCabecalhoPDF(doc, y) {
       // Fundo do cabeçalho
       doc.setFillColor(52, 73, 94);
       doc.rect(0, 0, doc.internal.pageSize.width, 35, 'F');
       
       // Título principal
       doc.setTextColor(255, 255, 255);
       doc.setFontSize(18);
       doc.setFont('helvetica', 'bold');
       doc.text('RELATÓRIO FINANCEIRO', 20, 15);
       
       // Data de geração
       doc.setFontSize(10);
       doc.setFont('helvetica', 'normal');
       const agora = new Date().toLocaleString('pt-BR');
       doc.text(`Gerado em: ${agora}`, 20, 25);
       
       // Reset cor
       doc.setTextColor(0, 0, 0);
   }

   adicionarInfoRelatorio(doc, y) {
       const { dataInicio, dataFim } = this.obterPeriodoSelecionado();
       
       // Box de informações
       doc.setDrawColor(200, 200, 200);
       doc.setFillColor(248, 249, 250);
       doc.rect(20, y, doc.internal.pageSize.width - 40, 25, 'FD');
       
       doc.setFontSize(12);
       doc.setFont('helvetica', 'bold');
       doc.text('INFORMAÇÕES DO RELATÓRIO', 25, y + 8);
       
       doc.setFontSize(10);
       doc.setFont('helvetica', 'normal');
       
       const periodo = `Período: ${dataInicio.toLocaleDateString('pt-BR')} até ${dataFim.toLocaleDateString('pt-BR')}`;
       const tipo = `Tipo: ${this.obterNomeTipoRelatorio()}`;
       const filtros = this.obterResumoFiltros();
       
       doc.text(periodo, 25, y + 15);
       doc.text(tipo, 25, y + 20);
       
       if (filtros) {
           doc.text(filtros, 120, y + 15);
       }
       
       return y + 25;
   }

   adicionarResumoExecutivoPDF(doc, y) {
       const { receitas, despesas } = this.dadosProcessados;
       
       const totalReceitas = receitas.reduce((sum, r) => sum + (r.valor || 0), 0);
       const totalDespesas = despesas.reduce((sum, d) => sum + (d.valor || 0), 0);
       const saldoLiquido = totalReceitas - totalDespesas;
       const totalJuros = this.calcularJuros(despesas);
       
       // Título da seção
       doc.setFontSize(14);
       doc.setFont('helvetica', 'bold');
       doc.text('RESUMO EXECUTIVO', 20, y + 10);
       
       // Grid de valores
       const startY = y + 20;
       const boxHeight = 15;
       const boxWidth = 42;
       
       // Receitas
       doc.setFillColor(40, 167, 69);
       doc.rect(20, startY, boxWidth, boxHeight, 'F');
       doc.setTextColor(255, 255, 255);
       doc.setFontSize(8);
       doc.text('RECEITAS', 22, startY + 5);
       doc.setFontSize(10);
       doc.setFont('helvetica', 'bold');
       doc.text(this.formatarMoedaPDF(totalReceitas), 22, startY + 10);
       doc.setFont('helvetica', 'normal');
       doc.text(`${receitas.length} transações`, 22, startY + 13);
       
       // Despesas
       doc.setFillColor(220, 53, 69);
       doc.rect(67, startY, boxWidth, boxHeight, 'F');
       doc.text('DESPESAS', 69, startY + 5);
       doc.setFontSize(10);
       doc.setFont('helvetica', 'bold');
       doc.text(this.formatarMoedaPDF(totalDespesas), 69, startY + 10);
       doc.setFont('helvetica', 'normal');
       doc.text(`${despesas.length} transações`, 69, startY + 13);
       
       // Saldo
       const corSaldo = saldoLiquido >= 0 ? [40, 167, 69] : [220, 53, 69];
       doc.setFillColor(...corSaldo);
       doc.rect(114, startY, boxWidth, boxHeight, 'F');
       doc.text('SALDO', 116, startY + 5);
       doc.setFontSize(10);
       doc.setFont('helvetica', 'bold');
       doc.text(this.formatarMoedaPDF(saldoLiquido), 116, startY + 10);
       
       // Juros
       doc.setFillColor(255, 193, 7);
       doc.setTextColor(0, 0, 0);
       doc.rect(161, startY, boxWidth, boxHeight, 'F');
       doc.setFontSize(8);
       doc.text('JUROS PAGOS', 163, startY + 5);
       doc.setFontSize(10);
       doc.setFont('helvetica', 'bold');
       doc.text(this.formatarMoedaPDF(totalJuros), 163, startY + 10);
       
       // Reset
       doc.setTextColor(0, 0, 0);
       
       return startY + boxHeight + 10;
   }

   adicionarTabelaCategoriasPDF(doc, y) {
       const { receitas, despesas } = this.dadosProcessados;
       
       // Processar dados por categoria
       const categorias = {};
       
       receitas.forEach(receita => {
           const categoria = 'Receitas';
           if (!categorias[categoria]) {
               categorias[categoria] = { receitas: 0, despesas: 0, transacoes: 0 };
           }
           categorias[categoria].receitas += receita.valor || 0;
           categorias[categoria].transacoes += 1;
       });

       despesas.forEach(despesa => {
           let categoria = despesa.categoria || 'Outros';
           if (!despesa.formaPagamento && (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito')) {
               categoria = despesa.categoriaCartao || 'Outros';
           }
           
           if (!categorias[categoria]) {
               categorias[categoria] = { receitas: 0, despesas: 0, transacoes: 0 };
           }
           categorias[categoria].despesas += despesa.valor || 0;
           categorias[categoria].transacoes += 1;
       });

       // Título
       doc.setFontSize(14);
       doc.setFont('helvetica', 'bold');
       doc.text('ANÁLISE POR CATEGORIA', 20, y + 10);
       
       // Cabeçalho da tabela
       const tableY = y + 20;
       doc.setFillColor(52, 73, 94);
       doc.rect(20, tableY, 170, 8, 'F');
       
       doc.setTextColor(255, 255, 255);
       doc.setFontSize(9);
       doc.setFont('helvetica', 'bold');
       doc.text('Categoria', 22, tableY + 5);
       doc.text('Receitas', 65, tableY + 5);
       doc.text('Despesas', 90, tableY + 5);
       doc.text('Saldo', 115, tableY + 5);
       doc.text('%', 140, tableY + 5);
       doc.text('Qtd', 155, tableY + 5);
       
       // Dados da tabela
       let rowY = tableY + 8;
       doc.setTextColor(0, 0, 0);
       doc.setFont('helvetica', 'normal');
       doc.setFontSize(8);
       
       const totalGeral = Object.values(categorias).reduce((sum, cat) => sum + cat.despesas, 0);
       
       Object.entries(categorias)
           .sort((a, b) => (b[1].receitas + b[1].despesas) - (a[1].receitas + a[1].despesas))
           .slice(0, 15) // Limitar para caber na página
           .forEach(([categoria, dados], index) => {
               const isEven = index % 2 === 0;
               if (isEven) {
                   doc.setFillColor(248, 249, 250);
                   doc.rect(20, rowY, 170, 6, 'F');
               }
               
               const saldo = dados.receitas - dados.despesas;
               const percentual = totalGeral > 0 ? ((dados.despesas / totalGeral) * 100) : 0;
               
               doc.text(categoria.substring(0, 20), 22, rowY + 4);
               doc.text(this.formatarMoedaPDF(dados.receitas), 65, rowY + 4);
               doc.text(this.formatarMoedaPDF(dados.despesas), 90, rowY + 4);
               doc.text(this.formatarMoedaPDF(saldo), 115, rowY + 4);
               doc.text(`${percentual.toFixed(1)}%`, 140, rowY + 4);
               doc.text(dados.transacoes.toString(), 155, rowY + 4);
               
               rowY += 6;
           });
       
       // Borda da tabela
       doc.setDrawColor(200, 200, 200);
       doc.rect(20, tableY, 170, rowY - tableY);
       
       return rowY + 10;
   }

   adicionarTabelaTransacoesPDF(doc, y, filtroTipo = null) {
       let { receitas, despesas } = this.dadosProcessados;
       let transacoes = [];
       
       if (filtroTipo === 'receitas') {
           transacoes = receitas;
       } else if (filtroTipo === 'despesas') {
           transacoes = despesas;
       } else {
           transacoes = [...receitas, ...despesas];
       }
       
       // Ordenar e limitar
       transacoes = this.ordenarTransacoes(transacoes).slice(0, 30);
       
       // Título
       doc.setFontSize(14);
       doc.setFont('helvetica', 'bold');
       const titulo = filtroTipo === 'receitas' ? 'LISTA DE RECEITAS' : 
                     filtroTipo === 'despesas' ? 'LISTA DE DESPESAS' : 'LISTA DE TRANSAÇÕES';
       doc.text(titulo, 20, y + 10);
       
       if (transacoes.length === 0) {
           doc.setFont('helvetica', 'normal');
           doc.text('Nenhuma transação encontrada.', 20, y + 25);
           return y + 35;
       }
       
       // Cabeçalho da tabela
       const tableY = y + 20;
       doc.setFillColor(52, 73, 94);
       doc.rect(20, tableY, 170, 8, 'F');
       
       doc.setTextColor(255, 255, 255);
       doc.setFontSize(8);
       doc.setFont('helvetica', 'bold');
       doc.text('Data', 22, tableY + 5);
       doc.text('Tipo', 40, tableY + 5);
       doc.text('Descrição', 55, tableY + 5);
       doc.text('Categoria', 105, tableY + 5);
       doc.text('Valor', 140, tableY + 5);
       doc.text('Status', 165, tableY + 5);
       
       // Dados
       let rowY = tableY + 8;
       doc.setTextColor(0, 0, 0);
       doc.setFont('helvetica', 'normal');
       doc.setFontSize(7);
       
       transacoes.forEach((transacao, index) => {
           const isEven = index % 2 === 0;
           if (isEven) {
               doc.setFillColor(248, 249, 250);
               doc.rect(20, rowY, 170, 5, 'F');
           }
           
           const data = new Date(transacao.data).toLocaleDateString('pt-BR');
           const tipo = transacao.tipo === 'receita' ? 'REC' : 'DESP';
           const descricao = (transacao.descricao || 'Sem descrição').substring(0, 25);
           const categoria = this.obterCategoriaLimpa(transacao).substring(0, 15);
           const valor = this.formatarMoedaPDF(transacao.valor || 0);
           const status = transacao.tipo === 'receita' ? 'OK' : this.obterStatusDespesa(transacao).substring(0, 8);
           
           doc.text(data, 22, rowY + 3);
           doc.text(tipo, 40, rowY + 3);
           doc.text(descricao, 55, rowY + 3);
           doc.text(categoria, 105, rowY + 3);
           doc.text(valor, 140, rowY + 3);
           doc.text(status, 165, rowY + 3);
           
           rowY += 5;
           
           // Nova página se necessário
           if (rowY > doc.internal.pageSize.height - 30) {
               doc.addPage();
               rowY = 20;
           }
       });
       
       // Borda da tabela
       doc.setDrawColor(200, 200, 200);
       doc.rect(20, tableY, 170, Math.min(rowY - tableY, doc.internal.pageSize.height - tableY - 30));
       
       return rowY + 10;
   }

   adicionarTabelaFormaPagamentoPDF(doc, y) {
       const { despesas } = this.dadosProcessados;
       
       const formas = { pix: 0, debito: 0, credito: 0 };
       const contadores = { pix: 0, debito: 0, credito: 0 };

       despesas.forEach(despesa => {
           let forma = despesa.formaPagamento || 'debito';
           if (!despesa.formaPagamento && (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito')) {
               forma = 'credito';
           }
           
           if (formas.hasOwnProperty(forma)) {
               formas[forma] += despesa.valor || 0;
               contadores[forma] += 1;
           }
       });

       // Título
       doc.setFontSize(14);
       doc.setFont('helvetica', 'bold');
       doc.text('ANÁLISE POR FORMA DE PAGAMENTO', 20, y + 10);
       
       const totalGeral = Object.values(formas).reduce((sum, val) => sum + val, 0);
       
       // Cards de forma de pagamento
       const cardY = y + 25;
       const cardWidth = 50;
       const cardHeight = 20;
       
       const coresPagamento = {
           pix: [22, 160, 133],
           debito: [52, 152, 219],
           credito: [231, 76, 60]
       };
       
       Object.keys(formas).forEach((forma, index) => {
           const x = 20 + (index * 55);
           const valor = formas[forma];
           const count = contadores[forma];
           const percent = totalGeral > 0 ? ((valor / totalGeral) * 100) : 0;
           
           // Fundo do card
           doc.setFillColor(...coresPagamento[forma]);
           doc.rect(x, cardY, cardWidth, cardHeight, 'F');
           
           // Texto do card
           doc.setTextColor(255, 255, 255);
           doc.setFontSize(10);
           doc.setFont('helvetica', 'bold');
           doc.text(forma.toUpperCase(), x + 2, cardY + 6);
           
           doc.setFontSize(9);
           doc.setFont('helvetica', 'normal');
           doc.text(this.formatarMoedaPDF(valor), x + 2, cardY + 12);
           doc.text(`${count} transações`, x + 2, cardY + 16);
           doc.text(`${percent.toFixed(1)}%`, x + 35, cardY + 16);
       });
       
       doc.setTextColor(0, 0, 0);
       
       return cardY + cardHeight + 15;
   }

   adicionarTabelaParcelamentosPDF(doc, y) {
       const { despesas } = this.dadosProcessados;
       const parcelamentos = this.processarParcelamentos(despesas);
       
       // Título
       doc.setFontSize(14);
       doc.setFont('helvetica', 'bold');
       doc.text('PARCELAMENTOS', 20, y + 10);
       
       if (parcelamentos.length === 0) {
           doc.setFont('helvetica', 'normal');
           doc.text('Nenhum parcelamento encontrado.', 20, y + 25);
           return y + 35;
       }
       
       // Cabeçalho da tabela
       const tableY = y + 20;
       doc.setFillColor(52, 73, 94);
       doc.rect(20, tableY, 170, 8, 'F');
       
       doc.setTextColor(255, 255, 255);
       doc.setFontSize(8);
       doc.setFont('helvetica', 'bold');
       doc.text('Descrição', 22, tableY + 5);
       doc.text('Valor Total', 70, tableY + 5);
       doc.text('Parcelas', 100, tableY + 5);
       doc.text('Pagas', 125, tableY + 5);
       doc.text('Restantes', 145, tableY + 5);
       doc.text('Status', 170, tableY + 5);
       
       // Dados
       let rowY = tableY + 8;
       doc.setTextColor(0, 0, 0);
       doc.setFont('helvetica', 'normal');
       doc.setFontSize(7);
       
       parcelamentos.forEach((p, index) => {
           const isEven = index % 2 === 0;
           if (isEven) {
               doc.setFillColor(248, 249, 250);
               doc.rect(20, rowY, 170, 6, 'F');
           }
           
           doc.text(p.descricao.substring(0, 25), 22, rowY + 4);
           doc.text(this.formatarMoedaPDF(p.valorTotal), 70, rowY + 4);
           doc.text(p.totalParcelas.toString(), 100, rowY + 4);
           doc.text(p.parcelasPagas.toString(), 125, rowY + 4);
           doc.text(p.parcelasRestantes.toString(), 145, rowY + 4);
           doc.text(p.status.substring(0, 8), 170, rowY + 4);
           
           rowY += 6;
       });
       
       // Borda da tabela
       doc.setDrawColor(200, 200, 200);
       doc.rect(20, tableY, 170, rowY - tableY);
       
       return rowY + 10;
   }

   verificarNovaPagePDF(doc, y, espacoNecessario) {
       if (y + espacoNecessario > doc.internal.pageSize.height - 30) {
           doc.addPage();
           return 20; // Margin top da nova página
       }
       return y;
   }

   adicionarRodapePDF(doc) {
       const pageCount = doc.internal.getNumberOfPages();
       
       for (let i = 1; i <= pageCount; i++) {
           doc.setPage(i);
           
           // Linha separadora
           doc.setDrawColor(200, 200, 200);
           doc.line(20, doc.internal.pageSize.height - 20, doc.internal.pageSize.width - 20, doc.internal.pageSize.height - 20);
           
           // Texto do rodapé
           doc.setFontSize(8);
           doc.setFont('helvetica', 'normal');
           doc.setTextColor(128, 128, 128);
           
           doc.text('Sistema de Controle Financeiro', 20, doc.internal.pageSize.height - 15);
           doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.width - 40, doc.internal.pageSize.height - 15);
           
           const agora = new Date().toLocaleDateString('pt-BR');
           doc.text(`Gerado em ${agora}`, 20, doc.internal.pageSize.height - 10);
       }
   }

   formatarMoedaPDF(valor) {
       return new Intl.NumberFormat('pt-BR', {
           style: 'currency',
           currency: 'BRL',
           minimumFractionDigits: 2,
           maximumFractionDigits: 2
       }).format(valor || 0).replace('R$', 'R$').substring(0, 12);
   }

   obterNomeTipoRelatorio() {
       const tipos = {
           'completo': 'Relatório Completo',
           'apenas-receitas': 'Apenas Receitas',
           'apenas-despesas': 'Apenas Despesas',
           'por-categoria': 'Por Categoria',
           'por-forma-pagamento': 'Por Forma de Pagamento',
           'parcelamentos': 'Parcelamentos'
       };
       return tipos[this.filtrosAtuais.tipoRelatorio] || 'Relatório';
   }

   obterResumoFiltros() {
       const filtros = [];
       
       if (this.filtrosAtuais.categoria !== 'todas') {
           filtros.push(`Cat: ${this.filtrosAtuais.categoria}`);
       }
       
       if (this.filtrosAtuais.formaPagamento !== 'todas') {
           filtros.push(`Pag: ${this.filtrosAtuais.formaPagamento.toUpperCase()}`);
       }
       
       if (this.filtrosAtuais.status !== 'todos') {
           filtros.push(`Status: ${this.filtrosAtuais.status}`);
       }
       
       return filtros.length > 0 ? `Filtros: ${filtros.join(', ')}` : null;
   }

   gerarNomeArquivo() {
       const agora = new Date();
       const data = agora.toISOString().split('T')[0].replace(/-/g, '');
       const hora = agora.toTimeString().split(':').slice(0, 2).join('');
       const tipo = this.filtrosAtuais.tipoRelatorio.replace(/-/g, '_');
       
       return `relatorio_financeiro_${tipo}_${data}_${hora}.pdf`;
   }
}

// Inicialização e integração com o sistema existente
document.addEventListener('DOMContentLoaded', function() {
   setTimeout(() => {
       // Inicializar o sistema de relatórios
       window.sistemaRelatoriosTelaCheia = new RelatoriosTelaCheia();
       
       // Integrar com a navegação existente
       const navLinks = document.querySelectorAll('.nav-link');
       navLinks.forEach(link => {
           link.addEventListener('click', function(e) {
               if (this.getAttribute('data-section') === 'relatorios') {
                   e.preventDefault();
                   
                   // Remover active de todos os links
                   navLinks.forEach(l => l.classList.remove('active'));
                   
                   // Adicionar active ao link clicado
                   this.classList.add('active');
                   
                   // Esconder todas as seções
                   const sections = document.querySelectorAll('.dashboard-section, .meses-section, .config-section, .relatorios-section');
                   sections.forEach(section => section.classList.remove('active'));
                   
                   // Mostrar seção de relatórios
                   const relatoriosSection = document.getElementById('relatorios-section');
                   if (relatoriosSection) {
                       relatoriosSection.classList.add('active');
                   }
               }
           });
       });
       
       console.log('✅ Sistema de Relatórios em Tela Cheia inicializado e integrado!');
   }, 1000);
});

// Exportar para uso global
window.RelatoriosTelaCheia = RelatoriosTelaCheia;