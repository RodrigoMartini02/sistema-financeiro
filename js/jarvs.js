/**
 * ================================================================
 * JARVS - SISTEMA COMPLETO COM TODAS AS FUNCIONALIDADES
 * ================================================================
 */

console.log('🤖 Carregando Jarvs Completo...');

// ================================================================
// MÓDULO 1: GERENCIAMENTO DE DADOS E USUÁRIO
// ================================================================

function getUsuarioAtual() {
    const usuarioAtualDoc = sessionStorage.getItem('usuarioAtual');
    if (!usuarioAtualDoc) return null;
    
    try {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        return usuarios.find(u => u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtualDoc);
    } catch (e) {
        console.error("Erro ao ler usuários do localStorage:", e);
        return null;
    }
}

// ================================================================
// MÓDULO 2: CLASSE DE ANÁLISE FINANCEIRA COMPLETA
// ================================================================

class AnaliseFinanceiraAvancada {
    constructor() {
        this.nomeUsuario = "Usuário";
        this.apiKey = "AIzaSyCKiPzehfpybeI76whY0i1EwhowGrCQwqA";
        this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`;
        this.carregarNomeUsuario();
        
        this.cacheAnalises = new Map();
        this.ultimaAtualizacao = null;
    }

    carregarNomeUsuario() {
        if (typeof getUsuarioAtual === 'function') {
            const usuario = getUsuarioAtual();
            if (usuario && usuario.nome) {
                this.nomeUsuario = usuario.nome.split(' ')[0];
            }
        }
    }

    formatarMoeda(valor) {
        if (typeof valor !== 'number') valor = 0;
        return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    formatarData(dataString) {
        if (!dataString) return 'Data não informada';
        const data = new Date(dataString);
        return data.toLocaleDateString('pt-BR');
    }

    formatarPorcentagem(valor) {
        return `${valor.toFixed(1)}%`;
    }

    obterNomeMes(index) {
        const nomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        return nomes[index] || 'Mês inválido';
    }

    obterDadosAno(ano = null) {
        if (!ano) ano = typeof anoAtual !== 'undefined' ? anoAtual : new Date().getFullYear();
        return dadosFinanceiros[ano] || null;
    }

    getValorRealDespesa(despesa) {
        if (!despesa) return 0;
        
        if (despesa.valorPago !== null && despesa.valorPago !== undefined && despesa.valorPago > 0) {
            return parseFloat(despesa.valorPago);
        }
        
        return parseFloat(despesa.valor) || 0;
    }

    calcularTotalReceitas(receitas) {
        if (!receitas || !Array.isArray(receitas)) return 0;
        return receitas.reduce((acc, r) => acc + (parseFloat(r.valor) || 0), 0);
    }

    calcularTotalDespesas(despesas) {
        if (!despesas || !Array.isArray(despesas)) return 0;
        return despesas.reduce((acc, d) => acc + this.getValorRealDespesa(d), 0);
    }

    // ANÁLISE COMPLETA DO PERÍODO
    analisarPeriodoCompleto(anoParam = null) {
        const ano = anoParam || (typeof anoAtual !== 'undefined' ? anoAtual : new Date().getFullYear());
        const dados = this.obterDadosAno(ano);
        
        if (!dados) return null;

        let analise = {
            ano: ano,
            totalReceitas: 0,
            totalDespesas: 0,
            saldoFinal: 0,
            meses: [],
            categorias: new Map(),
            formasPagamento: new Map(),
            parcelamentos: [],
            despesasAtrasadas: [],
            despesasPagas: [],
            despesasPendentes: [],
            jurosTotal: 0,
            estatisticas: {}
        };

        const hoje = new Date();

        for (let mes = 0; mes < 12; mes++) {
            const dadosMes = dados.meses[mes];
            if (!dadosMes) continue;

            const receitasMes = this.calcularTotalReceitas(dadosMes.receitas || []);
            const despesasMes = this.calcularTotalDespesas(dadosMes.despesas || []);
            const saldoMes = receitasMes - despesasMes;

            analise.totalReceitas += receitasMes;
            analise.totalDespesas += despesasMes;

            analise.meses[mes] = {
                receitas: receitasMes,
                despesas: despesasMes,
                saldo: saldoMes,
                qtdReceitas: (dadosMes.receitas || []).length,
                qtdDespesas: (dadosMes.despesas || []).length
            };

            (dadosMes.despesas || []).forEach(despesa => {
                const categoria = despesa.categoria || 'Sem categoria';
                const forma = despesa.formaPagamento || 'Não informado';
                const valor = this.getValorRealDespesa(despesa);

                analise.categorias.set(categoria, (analise.categorias.get(categoria) || 0) + valor);
                analise.formasPagamento.set(forma, (analise.formasPagamento.get(forma) || 0) + valor);

                if (despesa.parcelado) {
                    analise.parcelamentos.push({
                        ...despesa,
                        mes: mes,
                        nomeMes: this.obterNomeMes(mes)
                    });
                }

                if (despesa.quitado) {
                    analise.despesasPagas.push({
                        ...despesa,
                        mes: mes,
                        nomeMes: this.obterNomeMes(mes)
                    });
                } else {
                    const dataVencimento = new Date(despesa.dataVencimento || despesa.data);
                    if (dataVencimento < hoje) {
                        const diasAtraso = Math.floor((hoje - dataVencimento) / (1000 * 60 * 60 * 24));
                        analise.despesasAtrasadas.push({
                            ...despesa,
                            mes: mes,
                            nomeMes: this.obterNomeMes(mes),
                            diasAtraso: diasAtraso
                        });
                    } else {
                        analise.despesasPendentes.push({
                            ...despesa,
                            mes: mes,
                            nomeMes: this.obterNomeMes(mes)
                        });
                    }
                }

                if (despesa.metadados && despesa.metadados.totalJuros) {
                    analise.jurosTotal += despesa.metadados.jurosPorParcela || despesa.metadados.totalJuros;
                } else if (despesa.valorPago && despesa.valorPago > despesa.valor) {
                    analise.jurosTotal += (despesa.valorPago - despesa.valor);
                }
            });
        }

        analise.saldoFinal = analise.totalReceitas - analise.totalDespesas;
        this.calcularEstatisticas(analise);
        return analise;
    }

    calcularEstatisticas(analise) {
        let maiorReceita = { valor: -1, mes: -1 };
        let menorReceita = { valor: Number.POSITIVE_INFINITY, mes: -1 };
        let maiorDespesa = { valor: -1, mes: -1 };
        let menorDespesa = { valor: Number.POSITIVE_INFINITY, mes: -1 };
        let melhorSaldo = { valor: Number.NEGATIVE_INFINITY, mes: -1 };
        let piorSaldo = { valor: Number.POSITIVE_INFINITY, mes: -1 };

        analise.meses.forEach((dadosMes, mes) => {
            if (!dadosMes) return;

            if (dadosMes.receitas > maiorReceita.valor) {
                maiorReceita = { valor: dadosMes.receitas, mes };
            }
            if (dadosMes.receitas < menorReceita.valor && dadosMes.receitas > 0) {
                menorReceita = { valor: dadosMes.receitas, mes };
            }

            if (dadosMes.despesas > maiorDespesa.valor) {
                maiorDespesa = { valor: dadosMes.despesas, mes };
            }
            if (dadosMes.despesas < menorDespesa.valor && dadosMes.despesas > 0) {
                menorDespesa = { valor: dadosMes.despesas, mes };
            }

            if (dadosMes.saldo > melhorSaldo.valor) {
                melhorSaldo = { valor: dadosMes.saldo, mes };
            }
            if (dadosMes.saldo < piorSaldo.valor) {
                piorSaldo = { valor: dadosMes.saldo, mes };
            }
        });

        analise.estatisticas = {
            maiorReceita,
            menorReceita,
            maiorDespesa,
            menorDespesa,
            melhorSaldo,
            piorSaldo,
            mediaReceitasMensal: analise.totalReceitas / 12,
            mediaDespesasMensal: analise.totalDespesas / 12,
            taxaPoupanca: analise.totalReceitas > 0 ? ((analise.saldoFinal / analise.totalReceitas) * 100) : 0
        };
    }

    // PROCESSAMENTO INTELIGENTE DE PERGUNTAS
    async processarPergunta(pergunta) {
        const p = pergunta.toLowerCase().trim();
        this.carregarNomeUsuario();
        
        const ano = typeof anoAtual !== 'undefined' ? anoAtual : new Date().getFullYear();
        const analise = this.analisarPeriodoCompleto(ano);
        
        if (!analise) {
            return `<p>Desculpe, ${this.nomeUsuario}, mas não encontrei dados financeiros para o ano de ${ano}. Por favor, adicione algumas receitas ou despesas para começar.</p>`;
        }

        // Análise de meses específicos
        const meses = {
            'janeiro': 0, 'fevereiro': 1, 'março': 2, 'abril': 3, 'maio': 4, 'junho': 5,
            'julho': 6, 'agosto': 7, 'setembro': 8, 'outubro': 9, 'novembro': 10, 'dezembro': 11
        };
        
        let mesEspecifico = -1;
        for (const [nome, index] of Object.entries(meses)) {
            if (p.includes(nome)) {
                mesEspecifico = index;
                break;
            }
        }

        if (mesEspecifico !== -1) {
            return this.analisarMesEspecifico(mesEspecifico, analise);
        }

        // Comparações entre meses
        if (p.includes('comparar')) {
            const mesesNaPergunta = Object.keys(meses).filter(m => p.includes(m));
            if (mesesNaPergunta.length === 2) {
                return this.compararMeses(meses[mesesNaPergunta[0]], meses[mesesNaPergunta[1]], analise);
            }
        }

        // Perguntas sobre categorias
        if (p.includes('categoria')) {
            if (p.includes('maior') || p.includes('mais gastei')) {
                return this.analisarCategorias(analise, 'maior');
            }
            if (p.includes('menor') || p.includes('menos gastei')) {
                return this.analisarCategorias(analise, 'menor');
            }
            if (p.includes('todas') || p.includes('listar')) {
                return this.listarTodasCategorias(analise);
            }
            return this.analisarCategorias(analise, 'completa');
        }

        // Perguntas sobre formas de pagamento
        if (p.includes('forma de pagamento') || p.includes('pix') || p.includes('débito') || p.includes('crédito')) {
            return this.analisarFormasPagamento(analise);
        }

        // Perguntas sobre parcelamentos
        if (p.includes('parcela') || p.includes('parcelamento')) {
            return this.analisarParcelamentos(analise);
        }

        // Perguntas sobre despesas atrasadas/pagas/pendentes
        if (p.includes('atrasad')) {
            return this.analisarDespesasAtrasadas(analise);
        }
        if (p.includes('paga') || p.includes('quitad')) {
            return this.analisarDespesasPagas(analise);
        }
        if (p.includes('pendente')) {
            return this.analisarDespesasPendentes(analise);
        }

        // Perguntas sobre juros
        if (p.includes('juros')) {
            return this.analisarJuros(analise);
        }

        // Perguntas sobre saúde financeira
        if (p.includes('saúde financeira') || p.includes('como está') || p.includes('situação financeira')) {
            return this.verificarSaudeFinanceira(analise);
        }

        // Perguntas sobre resumos
        if (p.includes('resumo') || p.includes('total do ano') || p.includes('balanço')) {
            return this.gerarResumoCompleto(analise);
        }

        // Perguntas sobre estatísticas
        if (p.includes('maior receita') || p.includes('mês que mais ganhei')) {
            return this.responderEstatistica(analise, 'maiorReceita');
        }
        if (p.includes('menor receita') || p.includes('mês que menos ganhei')) {
            return this.responderEstatistica(analise, 'menorReceita');
        }
        if (p.includes('maior despesa') || p.includes('mês que mais gastei')) {
            return this.responderEstatistica(analise, 'maiorDespesa');
        }
        if (p.includes('menor despesa') || p.includes('mês que menos gastei')) {
            return this.responderEstatistica(analise, 'menorDespesa');
        }
        if (p.includes('melhor saldo') || p.includes('melhor mês')) {
            return this.responderEstatistica(analise, 'melhorSaldo');
        }
        if (p.includes('pior saldo') || p.includes('pior mês')) {
            return this.responderEstatistica(analise, 'piorSaldo');
        }

        // Perguntas sobre médias
        if (p.includes('média') || p.includes('em média')) {
            return this.analisarMedias(analise);
        }

        // Se não encontrou padrão específico, usar IA do Gemini
        return await this.callJarvsAPI(pergunta, analise);
    }

    // ANALISAR MÊS ESPECÍFICO
    analisarMesEspecifico(mes, analise) {
        const nomeMes = this.obterNomeMes(mes);
        const dadosMes = analise.meses[mes];
        
        if (!dadosMes || (dadosMes.qtdReceitas === 0 && dadosMes.qtdDespesas === 0)) {
            return `<p>📅 ${this.nomeUsuario}, não há dados para ${nomeMes} de ${analise.ano}.</p>`;
        }

        const dados = this.obterDadosAno(analise.ano);
        const mesData = dados.meses[mes];
        
        let detalhesReceitas = '';
        if (mesData.receitas && mesData.receitas.length > 0) {
            detalhesReceitas = `
                <p><strong>💰 Receitas (${mesData.receitas.length}):</strong></p>
                <ul>
                    ${mesData.receitas.slice(0, 5).map(r => 
                        `<li>${r.descricao}: ${this.formatarMoeda(r.valor)} - ${this.formatarData(r.data)}</li>`
                    ).join('')}
                    ${mesData.receitas.length > 5 ? `<li><em>...e mais ${mesData.receitas.length - 5} receitas</em></li>` : ''}
                </ul>
            `;
        }

        let detalhesDespesas = '';
        if (mesData.despesas && mesData.despesas.length > 0) {
            detalhesDespesas = `
                <p><strong>💸 Despesas (${mesData.despesas.length}):</strong></p>
                <ul>
                    ${mesData.despesas.slice(0, 5).map(d => 
                        `<li>${d.descricao}: ${this.formatarMoeda(this.getValorRealDespesa(d))} - ${d.categoria || 'Sem categoria'}</li>`
                    ).join('')}
                    ${mesData.despesas.length > 5 ? `<li><em>...e mais ${mesData.despesas.length - 5} despesas</em></li>` : ''}
                </ul>
            `;
        }

        return `
            <p><strong>📊 Análise de ${nomeMes} ${analise.ano}:</strong></p>
            <ul>
                <li>💰 <strong>Total de Receitas:</strong> ${this.formatarMoeda(dadosMes.receitas)}</li>
                <li>💸 <strong>Total de Despesas:</strong> ${this.formatarMoeda(dadosMes.despesas)}</li>
                <li>${dadosMes.saldo >= 0 ? '✅' : '❌'} <strong>Saldo:</strong> ${this.formatarMoeda(dadosMes.saldo)}</li>
            </ul>
            ${detalhesReceitas}
            ${detalhesDespesas}
        `;
    }

    // COMPARAR MESES
    compararMeses(mes1, mes2, analise) {
        const nome1 = this.obterNomeMes(mes1);
        const nome2 = this.obterNomeMes(mes2);
        const dados1 = analise.meses[mes1];
        const dados2 = analise.meses[mes2];

        if (!dados1 || !dados2) {
            return `<p>Não tenho dados suficientes para comparar ${nome1} e ${nome2}.</p>`;
        }

        const calcularVariacao = (val1, val2) => {
            if (val2 === 0) return val1 > 0 ? '+∞%' : '0%';
            const variacao = ((val1 - val2) / val2) * 100;
            const sinal = variacao >= 0 ? '+' : '';
            return `${sinal}${variacao.toFixed(1)}%`;
        };

        return `
            <p><strong>🔄 Comparativo: ${nome1} vs ${nome2}</strong></p>
            
            <p><strong>${nome1}:</strong></p>
            <ul>
                <li>Receitas: ${this.formatarMoeda(dados1.receitas)}</li>
                <li>Despesas: ${this.formatarMoeda(dados1.despesas)}</li>
                <li>Saldo: ${this.formatarMoeda(dados1.saldo)}</li>
            </ul>
            
            <p><strong>${nome2}:</strong></p>
            <ul>
                <li>Receitas: ${this.formatarMoeda(dados2.receitas)} (${calcularVariacao(dados2.receitas, dados1.receitas)})</li>
                <li>Despesas: ${this.formatarMoeda(dados2.despesas)} (${calcularVariacao(dados2.despesas, dados1.despesas)})</li>
                <li>Saldo: ${this.formatarMoeda(dados2.saldo)} (${calcularVariacao(dados2.saldo, dados1.saldo)})</li>
            </ul>
        `;
    }

    // ANALISAR CATEGORIAS
    analisarCategorias(analise, tipo = 'completa') {
        if (analise.categorias.size === 0) {
            return `<p>${this.nomeUsuario}, você ainda não possui categorias de despesas cadastradas.</p>`;
        }

        const categoriasArray = Array.from(analise.categorias.entries())
            .sort(([,a], [,b]) => b - a);

        if (tipo === 'maior') {
            const [categoria, valor] = categoriasArray[0];
            const percentual = (valor / analise.totalDespesas) * 100;
            
            return `
                <p><strong>🏆 Categoria com maior gasto em ${analise.ano}:</strong></p>
                <ul>
                    <li><strong>${categoria}:</strong> ${this.formatarMoeda(valor)}</li>
                    <li><strong>Percentual do total:</strong> ${this.formatarPorcentagem(percentual)}</li>
                </ul>
                <p><strong>💡 Dica do Jarvs:</strong> Esta é sua principal área de gastos. Vale a pena revisar se há oportunidades de economia!</p>
            `;
        }

        if (tipo === 'menor') {
            const [categoria, valor] = categoriasArray[categoriasArray.length - 1];
            const percentual = (valor / analise.totalDespesas) * 100;
            
            return `
                <p><strong>📉 Categoria com menor gasto em ${analise.ano}:</strong></p>
                <ul>
                    <li><strong>${categoria}:</strong> ${this.formatarMoeda(valor)}</li>
                    <li><strong>Percentual do total:</strong> ${this.formatarPorcentagem(percentual)}</li>
                </ul>
            `;
        }

        return `
            <p><strong>🏷️ Análise completa por categorias (${categoriasArray.length}):</strong></p>
            <ul>
                ${categoriasArray.slice(0, 8).map(([cat, valor], i) => {
                    const percentual = (valor / analise.totalDespesas) * 100;
                    return `<li>${i + 1}. <strong>${cat}:</strong> ${this.formatarMoeda(valor)} (${this.formatarPorcentagem(percentual)})</li>`;
                }).join('')}
                ${categoriasArray.length > 8 ? `<li><em>...e mais ${categoriasArray.length - 8} categorias</em></li>` : ''}
            </ul>
        `;
    }

    // ANALISAR FORMAS DE PAGAMENTO
    analisarFormasPagamento(analise) {
        if (analise.formasPagamento.size === 0) {
            return `<p>${this.nomeUsuario}, não encontrei formas de pagamento cadastradas.</p>`;
        }

        const formasArray = Array.from(analise.formasPagamento.entries())
            .sort(([,a], [,b]) => b - a);

        const formasNomes = {
            'pix': '📱 PIX',
            'debito': '💳 Débito',
            'credito': '🏦 Crédito',
            'dinheiro': '💵 Dinheiro'
        };

        return `
            <p><strong>💳 Análise por forma de pagamento em ${analise.ano}:</strong></p>
            <ul>
                ${formasArray.map(([forma, valor]) => {
                    const percentual = (valor / analise.totalDespesas) * 100;
                    const icone = formasNomes[forma] || `❓ ${forma}`;
                    return `<li><strong>${icone}:</strong> ${this.formatarMoeda(valor)} (${this.formatarPorcentagem(percentual)})</li>`;
                }).join('')}
            </ul>
            <p><strong>Total:</strong> ${this.formatarMoeda(analise.totalDespesas)}</p>
        `;
    }

    // ANALISAR PARCELAMENTOS
    analisarParcelamentos(analise) {
        if (analise.parcelamentos.length === 0) {
            return `<p>🎉 ${this.nomeUsuario}, você não possui parcelamentos ativos em ${analise.ano}!</p>`;
        }

        const totalParcelado = analise.parcelamentos.reduce((acc, p) => acc + this.getValorRealDespesa(p), 0);
        const comprasUnicas = new Set(analise.parcelamentos.map(p => p.descricao));

        return `
            <p><strong>💳 Análise de parcelamentos em ${analise.ano}:</strong></p>
            <ul>
                <li><strong>Total de parcelas:</strong> ${analise.parcelamentos.length}</li>
                <li><strong>Compras parceladas:</strong> ${comprasUnicas.size}</li>
                <li><strong>Valor total:</strong> ${this.formatarMoeda(totalParcelado)}</li>
            </ul>
            
            <p><strong>Principais parcelamentos:</strong></p>
            <ul>
                ${analise.parcelamentos.slice(0, 5).map(p => 
                    `<li><strong>${p.descricao}:</strong> ${this.formatarMoeda(this.getValorRealDespesa(p))} - ${p.parcela} (${p.nomeMes})</li>`
                ).join('')}
                ${analise.parcelamentos.length > 5 ? `<li><em>...e mais ${analise.parcelamentos.length - 5} parcelas</em></li>` : ''}
            </ul>
        `;
    }

    // ANALISAR DESPESAS ATRASADAS
    analisarDespesasAtrasadas(analise) {
        if (analise.despesasAtrasadas.length === 0) {
            return `<p>✅ ${this.nomeUsuario}, parabéns! Você não possui despesas atrasadas.</p>`;
        }

        const totalAtrasado = analise.despesasAtrasadas.reduce((acc, d) => acc + this.getValorRealDespesa(d), 0);
        analise.despesasAtrasadas.sort((a, b) => b.diasAtraso - a.diasAtraso);

        return `
            <p><strong>⚠️ Despesas atrasadas (${analise.despesasAtrasadas.length}):</strong></p>
            <p><strong>Total em atraso:</strong> ${this.formatarMoeda(totalAtrasado)}</p>
            <ul>
                ${analise.despesasAtrasadas.slice(0, 5).map(d => 
                    `<li><strong>${d.descricao}:</strong> ${this.formatarMoeda(this.getValorRealDespesa(d))} - ${d.diasAtraso} dias (${d.nomeMes})</li>`
                ).join('')}
                ${analise.despesasAtrasadas.length > 5 ? `<li><em>...e mais ${analise.despesasAtrasadas.length - 5} despesas</em></li>` : ''}
            </ul>
            <p><strong>🚨 Ação recomendada:</strong> Priorize o pagamento das despesas mais antigas para evitar juros!</p>
        `;
    }

    // ANALISAR DESPESAS PAGAS
    analisarDespesasPagas(analise) {
        if (analise.despesasPagas.length === 0) {
            return `<p>${this.nomeUsuario}, você ainda não possui despesas pagas registradas este ano.</p>`;
        }

        const totalPago = analise.despesasPagas.reduce((acc, d) => acc + this.getValorRealDespesa(d), 0);

        return `
            <p><strong>✅ Despesas pagas (${analise.despesasPagas.length}):</strong></p>
            <p><strong>Total pago:</strong> ${this.formatarMoeda(totalPago)}</p>
            <ul>
                ${analise.despesasPagas.slice(0, 5).map(d => 
                    `<li><strong>${d.descricao}:</strong> ${this.formatarMoeda(this.getValorRealDespesa(d))} - ${d.nomeMes}</li>`
                ).join('')}
                ${analise.despesasPagas.length > 5 ? `<li><em>...e mais ${analise.despesasPagas.length - 5} despesas</em></li>` : ''}
            </ul>
        `;
    }

    // ANALISAR DESPESAS PENDENTES
    analisarDespesasPendentes(analise) {
        if (analise.despesasPendentes.length === 0) {
            return `<p>🎉 ${this.nomeUsuario}, você não possui despesas pendentes!</p>`;
        }

        const totalPendente = analise.despesasPendentes.reduce((acc, d) => acc + this.getValorRealDespesa(d), 0);

        return `
            <p><strong>⏳ Despesas pendentes (${analise.despesasPendentes.length}):</strong></p>
            <p><strong>Total pendente:</strong> ${this.formatarMoeda(totalPendente)}</p>
            <ul>
                ${analise.despesasPendentes.slice(0, 5).map(d => 
                    `<li><strong>${d.descricao}:</strong> ${this.formatarMoeda(this.getValorRealDespesa(d))} - ${d.nomeMes}</li>`
                ).join('')}
                ${analise.despesasPendentes.length > 5 ? `<li><em>...e mais ${analise.despesasPendentes.length - 5} despesas</em></li>` : ''}
            </ul>
        `;
    }

    // ANALISAR JUROS
    analisarJuros(analise) {
        if (analise.jurosTotal === 0) {
            return `<p>👍 ${this.nomeUsuario}, excelente! Você não pagou juros este ano.</p>`;
        }

        const percentualJuros = (analise.jurosTotal / analise.totalDespesas) * 100;

        return `
            <p><strong>💸 Análise de Juros em ${analise.ano}:</strong></p>
            <ul>
                <li><strong>Total gasto com juros:</strong> ${this.formatarMoeda(analise.jurosTotal)}</li>
                <li><strong>Percentual das despesas:</strong> ${this.formatarPorcentagem(percentualJuros)}</li>
            </ul>
            <p><strong>💡 Dica do Jarvs:</strong> ${percentualJuros > 5 ? 
                'Seus juros estão altos! Considere quitar dívidas e evitar o rotativo do cartão.' : 
                'Você mantém seus juros sob controle. Parabéns!'}</p>
        `;
    }

    // VERIFICAR SAÚDE FINANCEIRA
    verificarSaudeFinanceira(analise) {
        const taxaPoupanca = analise.estatisticas.taxaPoupanca;
        let nivel, emoji, conselho;

        if (taxaPoupanca >= 20) {
            nivel = "Excelente";
            emoji = "🏆";
            conselho = "Você está no caminho certo! Considere diversificar seus investimentos.";
        } else if (taxaPoupanca >= 10) {
            nivel = "Boa";
            emoji = "👍";
            conselho = "Situação positiva! Tente aumentar gradualmente sua taxa de poupança.";
        } else if (taxaPoupanca > 0) {
            nivel = "Atenção";
            emoji = "⚠️";
            conselho = "Cuidado! Revise seus gastos e crie metas de economia.";
        } else {
            nivel = "Crítica";
            emoji = "🚨";
            conselho = "Alerta! Você está gastando mais do que ganha. Ação urgente necessária!";
        }

        return `
            <p><strong>${emoji} Saúde Financeira de ${analise.ano}:</strong></p>
            <ul>
                <li><strong>Diagnóstico:</strong> ${nivel}</li>
                <li><strong>Taxa de Poupança:</strong> ${this.formatarPorcentagem(taxaPoupanca)}</li>
                <li><strong>Receitas Totais:</strong> ${this.formatarMoeda(analise.totalReceitas)}</li>
                <li><strong>Despesas Totais:</strong> ${this.formatarMoeda(analise.totalDespesas)}</li>
                <li><strong>Saldo Final:</strong> ${this.formatarMoeda(analise.saldoFinal)}</li>
            </ul>
            <p><strong>💡 Conselho do Jarvs:</strong> ${conselho}</p>
        `;
    }

    // GERAR RESUMO COMPLETO
    gerarResumoCompleto(analise) {
        const stats = analise.estatisticas;
        
        return `
            <p><strong>📊 Resumo Financeiro Completo de ${analise.ano}:</strong></p>
            
            <p><strong>💰 Visão Geral:</strong></p>
            <ul>
                <li>Total de Receitas: ${this.formatarMoeda(analise.totalReceitas)}</li>
                <li>Total de Despesas: ${this.formatarMoeda(analise.totalDespesas)}</li>
                <li>Saldo Final: ${this.formatarMoeda(analise.saldoFinal)}</li>
                <li>Taxa de Poupança: ${this.formatarPorcentagem(stats.taxaPoupanca)}</li>
            </ul>
            
            <p><strong>📈 Estatísticas dos Meses:</strong></p>
            <ul>
                <li>Melhor mês (saldo): ${this.obterNomeMes(stats.melhorSaldo.mes)} (${this.formatarMoeda(stats.melhorSaldo.valor)})</li>
                <li>Pior mês (saldo): ${this.obterNomeMes(stats.piorSaldo.mes)} (${this.formatarMoeda(stats.piorSaldo.valor)})</li>
                <li>Maior receita: ${this.obterNomeMes(stats.maiorReceita.mes)} (${this.formatarMoeda(stats.maiorReceita.valor)})</li>
                <li>Maior despesa: ${this.obterNomeMes(stats.maiorDespesa.mes)} (${this.formatarMoeda(stats.maiorDespesa.valor)})</li>
            </ul>
            
            <p><strong>🏷️ Resumo por Status:</strong></p>
            <ul>
                <li>Despesas Pagas: ${analise.despesasPagas.length}</li>
                <li>Despesas Pendentes: ${analise.despesasPendentes.length}</li>
                <li>Despesas Atrasadas: ${analise.despesasAtrasadas.length}</li>
                <li>Parcelamentos Ativos: ${analise.parcelamentos.length}</li>
            </ul>
        `;
    }

    // RESPONDER ESTATÍSTICA
    responderEstatistica(analise, tipo) {
        const stats = analise.estatisticas;
        const stat = stats[tipo];
        
        if (stat.mes === -1) {
            return `<p>${this.nomeUsuario}, não encontrei dados suficientes para essa estatística.</p>`;
        }

        const nomeMes = this.obterNomeMes(stat.mes);
        const tipoTexto = {
            'maiorReceita': '💰 Mês com maior receita',
            'menorReceita': '📉 Mês com menor receita', 
            'maiorDespesa': '💸 Mês com maior despesa',
            'menorDespesa': '📈 Mês com menor despesa',
            'melhorSaldo': '🏆 Melhor mês (saldo)',
            'piorSaldo': '📉 Pior mês (saldo)'
        };

        return `
            <p><strong>${tipoTexto[tipo]} em ${analise.ano}:</strong></p>
            <ul>
                <li><strong>Mês:</strong> ${nomeMes}</li>
                <li><strong>Valor:</strong> ${this.formatarMoeda(stat.valor)}</li>
            </ul>
        `;
    }

    // ANALISAR MÉDIAS
    analisarMedias(analise) {
        const stats = analise.estatisticas;
        
        return `
            <p><strong>📊 Análise de Médias em ${analise.ano}:</strong></p>
            <ul>
                <li><strong>Receita média mensal:</strong> ${this.formatarMoeda(stats.mediaReceitasMensal)}</li>
                <li><strong>Despesa média mensal:</strong> ${this.formatarMoeda(stats.mediaDespesasMensal)}</li>
                <li><strong>Saldo médio mensal:</strong> ${this.formatarMoeda(stats.mediaReceitasMensal - stats.mediaDespesasMensal)}</li>
            </ul>
            <p><strong>💡 Insight:</strong> Suas ${stats.mediaReceitasMensal > stats.mediaDespesasMensal ? 
                'receitas superam suas despesas em média. Ótimo controle!' : 
                'despesas estão próximas ou superiores às receitas. Atenção ao orçamento!'}</p>
        `;
    }

    // LISTAR TODAS AS CATEGORIAS
    listarTodasCategorias(analise) {
        if (analise.categorias.size === 0) {
            return `<p>${this.nomeUsuario}, você ainda não possui categorias cadastradas.</p>`;
        }

        const categorias = Array.from(analise.categorias.keys()).sort();
        
        return `
            <p><strong>🏷️ Todas as suas categorias (${categorias.length}):</strong></p>
            <ul>
                ${categorias.map(cat => `<li>${cat}</li>`).join('')}
            </ul>
        `;
    }

    // ================================================================
    // INTEGRAÇÃO COM IA EXTERNA (GEMINI)
    // ================================================================

    async callJarvsAPI(prompt, analise = null) {
        if (!this.apiKey) {
            return `<p><strong>⚠️ Atenção:</strong> A chave de API para o assistente Jarvs não foi configurada.</p>`;
        }

        let contextoFinanceiro = '';
        if (analise) {
            contextoFinanceiro = `
            Contexto financeiro do usuário (${analise.ano}):
            - Total de receitas: R$ ${analise.totalReceitas.toFixed(2)}
            - Total de despesas: R$ ${analise.totalDespesas.toFixed(2)}
            - Saldo: R$ ${analise.saldoFinal.toFixed(2)}
            - Taxa de poupança: ${analise.estatisticas.taxaPoupanca.toFixed(1)}%
            - Categorias principais: ${Array.from(analise.categorias.keys()).slice(0, 5).join(', ')}
            - Despesas atrasadas: ${analise.despesasAtrasadas.length}
            - Parcelamentos ativos: ${analise.parcelamentos.length}
            `;
        }

        const promptCompleto = `
        Você é o Jarvs, um assistente financeiro virtual especializado. O usuário se chama ${this.nomeUsuario}.
        
        ${contextoFinanceiro}
        
        Responda à pergunta de forma clara, útil e personalizada. Use emojis apropriados e mantenha o tom amigável.
        
        Pergunta: "${prompt}"
        `;

        try {
            const payload = {
                contents: [{
                    parts: [{ text: promptCompleto }]
                }]
            };

            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                return `<p>Desculpe, ${this.nomeUsuario}, estou com problemas de conexão. Tente novamente em alguns minutos.</p>`;
            }

            const result = await response.json();
            const text = result.candidates[0]?.content?.parts[0]?.text || 
                        "Não consegui formular uma resposta adequada. Pode reformular a pergunta?";
            
            return `<p>${text}</p>`;
            
        } catch (error) {
            console.error("Erro ao chamar API do Jarvs:", error);
            return `<p>Ocorreu um problema técnico. Verifique sua conexão e tente novamente.</p>`;
        }
    }
}

// ================================================================
// MÓDULO 3: INTERFACE COMPLETA DO JARVS
// ================================================================

let jarvsInstance = null;

document.addEventListener('DOMContentLoaded', function() {
    console.log('🤖 Iniciando Jarvs Completo...');
    
    setTimeout(function() {
        const fabButton = document.getElementById('jarvs-fab');
        const modal = document.getElementById('ai-assistant-modal');
        
        console.log('FAB encontrado:', !!fabButton);
        console.log('Modal encontrado:', !!modal);
        
        if (!fabButton || !modal) {
            console.error('❌ Elementos do Jarvs não encontrados');
            return;
        }

        // Criar instância única da IA
        if (!jarvsInstance) {
            jarvsInstance = new AnaliseFinanceiraAvancada();
            console.log('✅ Instância Jarvs criada');
        }

        const closeModalBtn = modal.querySelector('.close');
        const sendBtn = document.getElementById('ai-send-btn');
        const inputField = document.getElementById('ai-input');
        const messagesContainer = document.getElementById('ai-messages');
        const typingIndicator = document.getElementById('ai-typing');

        // ================================================================
        // FUNÇÕES DA INTERFACE
        // ================================================================

        const openModal = () => {
            console.log('🎯 Abrindo modal Jarvs...');
            modal.style.display = 'block';
            modal.style.visibility = 'visible';
            modal.style.opacity = '1';
            
            if (inputField) inputField.focus();
            jarvsInstance.carregarNomeUsuario();
            
            // Mensagem de boas-vindas se for a primeira vez
            if (messagesContainer && messagesContainer.children.length === 0) {
                addBotMessage(`
                    <p>Olá, ${jarvsInstance.nomeUsuario}! 👋</p>
                    <p>Sou o Jarvs, seu assistente financeiro inteligente. Posso ajudar com análises sobre:</p>
                    <ul>
                        <li>📊 Receitas e despesas por período</li>
                        <li>🏷️ Categorias e formas de pagamento</li>
                        <li>💳 Parcelamentos e juros</li>
                        <li>📈 Saúde financeira e comparações</li>
                        <li>⚠️ Despesas atrasadas e pendentes</li>
                    </ul>
                    <p>O que gostaria de saber sobre suas finanças?</p>
                `);
            }
        };

        const closeModal = () => {
            console.log('❌ Fechando modal Jarvs...');
            modal.style.display = 'none';
        };

        const scrollToBottom = () => {
            if (messagesContainer) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        };
        
        const showTyping = () => {
            if (typingIndicator) typingIndicator.style.display = 'flex';
            if (sendBtn) sendBtn.disabled = true;
            scrollToBottom();
        };
        
        const hideTyping = () => {
            if (typingIndicator) typingIndicator.style.display = 'none';
            if (sendBtn) sendBtn.disabled = false;
            if (inputField) inputField.focus();
        };

        const addUserMessage = (text) => {
            const messageEl = document.createElement('div');
            messageEl.className = 'ai-message ai-message-user';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'ai-content';
            contentDiv.innerHTML = `<p>${text}</p>`;

            messageEl.innerHTML = `
                <div class="ai-avatar">
                    <i class="fas fa-user"></i>
                </div>
            `;
            messageEl.appendChild(contentDiv);
            messagesContainer.appendChild(messageEl);
            scrollToBottom();
        };

        const addBotMessage = (html) => {
            const messageEl = document.createElement('div');
            messageEl.className = 'ai-message ai-message-bot';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'ai-content';
            contentDiv.innerHTML = html;

            messageEl.innerHTML = `
                <div class="ai-avatar">
                    <i class="fas fa-robot"></i>
                </div>
            `;
            messageEl.appendChild(contentDiv);
            messagesContainer.appendChild(messageEl);
            scrollToBottom();
        };

        const handleSendMessage = async () => {
            const userText = inputField.value.trim();
            if (!userText || sendBtn.disabled) return;

            console.log('📤 Enviando pergunta:', userText);
            
            addUserMessage(userText);
            inputField.value = '';
            showTyping();

            try {
                const botResponseHtml = await jarvsInstance.processarPergunta(userText);
                console.log('✅ Resposta recebida');
                addBotMessage(botResponseHtml);
            } catch (error) {
                console.error("❌ Erro ao processar pergunta:", error);
                addBotMessage(`
                    <p>Desculpe, ${jarvsInstance.nomeUsuario}, ocorreu um erro inesperado.</p>
                    <p>Tente reformular sua pergunta ou verifique sua conexão.</p>
                `);
            } finally {
                hideTyping();
            }
        };

        // ================================================================
        // EVENT LISTENERS - LIMPOS E FUNCIONAIS
        // ================================================================

        // Limpar event listeners anteriores do FAB
        const newFab = fabButton.cloneNode(true);
        fabButton.parentNode.replaceChild(newFab, fabButton);
        
        // Event listener principal do FAB
        newFab.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🎯 FAB clicado - abrindo Jarvs');
            openModal();
        });

        // Event listeners dos outros elementos
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', closeModal);
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', handleSendMessage);
        }

        if (inputField) {
            inputField.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                }
            });

            inputField.placeholder = "Converse com Jarvs";
        }

        // Fechar modal clicando fora
        window.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeModal();
            }
        });

        console.log('✅ Jarvs Completo configurado com sucesso!');
        
    }, 1000); // Aguardar 1 segundo para garantir que tudo carregou
});

// ================================================================
// FUNÇÕES GLOBAIS PARA TESTE
// ================================================================

window.testarJarvs = function() {
    console.log('🧪 Testando Jarvs...');
    const modal = document.getElementById('ai-assistant-modal');
    if (modal) {
        modal.style.display = 'block';
        modal.style.visibility = 'visible';
        modal.style.opacity = '1';
        console.log('✅ Modal aberto via teste');
        return true;
    } else {
        console.log('❌ Modal não encontrado');
        return false;
    }
};

window.testarIA = async function(pergunta = "Como está minha saúde financeira?") {
    if (jarvsInstance) {
        console.log('🤖 Testando IA com pergunta:', pergunta);
        try {
            const resposta = await jarvsInstance.processarPergunta(pergunta);
            console.log('✅ Resposta da IA:', resposta);
            return resposta;
        } catch (error) {
            console.error('❌ Erro ao testar IA:', error);
            return null;
        }
    } else {
        console.log('❌ Instância Jarvs não encontrada');
        return null;
    }
};

// ================================================================
// EXPORTAR PARA USO GLOBAL
// ================================================================

window.JarvsAnaliseFinanceira = AnaliseFinanceiraAvancada;
window.jarvsInstance = jarvsInstance;

console.log('📦 Jarvs Completo carregado com todas as funcionalidades!');