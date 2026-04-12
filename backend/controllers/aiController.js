// ================================================================
// AI CONTROLLER - Gerencia todas as requisições do módulo IA
// ================================================================

const { query } = require('../config/database');
const { parsearDespesa, parsearReceita, responderPerguntaFinanceira, detectarIntencaoComIA } = require('../services/aiParser');
const { classificarCategoria, salvarAprendizado } = require('../services/categoryAI');
const { processarArquivo } = require('../services/ocrService');
const { analisarDocumentoComIA } = require('../services/visionService');
const { processarQRCodePIX, processarTextoPIX } = require('../services/pixReader');
const { parsearBoleto, encontrarLinhaDigitavel } = require('../services/boletoParser');
const { detectarRecorrencias, salvarRecorrencia, buscarRecorrencias } = require('../services/recurrenceDetector');
const { normalizarDespesa, validarCamposObrigatorios, perguntaParaCampo } = require('../utils/expenseNormalizer');
const { parsearExtratoComIA } = require('../services/extratoParser');

const fs = require('fs');

// ── SESSÕES DE CONVERSA (em memória, por usuário) ────────────────
const sessoes = new Map();

function obterSessao(usuarioId) {
    if (!sessoes.has(usuarioId)) {
        sessoes.set(usuarioId, {
            historico: [],
            despesaParcial: null,
            esperandoCampo: null,
            ultimaAcao: null,
            contextoSistema: null,      // { texto, carta, expira }
        });
    }
    return sessoes.get(usuarioId);
}

function limparSessao(usuarioId) {
    sessoes.delete(usuarioId);
}

// ── HELPER: Busca configuração de IA do usuário ───────────────────
async function buscarConfigIA(usuarioId) {
    try {
        const r = await query('SELECT dados_financeiros FROM usuarios WHERE id = $1', [usuarioId]);
        const df = r.rows[0]?.dados_financeiros || {};
        const provider       = df.ia_provider  || null;
        const apiKeys        = df.ia_api_keys  || {};
        const apiKey         = df.ia_api_key   || apiKeys[provider] || null;
        const instrucoesGen  = df.instrucoes_gen || '';
        return { provider, apiKey, apiKeys, instrucoesGen };
    } catch {
        return { provider: null, apiKey: null, apiKeys: {}, instrucoesGen: '' };
    }
}

// ── HELPER: Busca carta de serviços do usuário master no banco ────
async function buscarCartaServicos() {
    try {
        const r = await query(`SELECT dados_financeiros FROM usuarios WHERE tipo = 'master' LIMIT 1`);
        const carta = r.rows[0]?.dados_financeiros?.carta_servicos;
        if (carta) return carta;
        return '';
    } catch {
        return '';
    }
}

// ── Invalida cache da carta em todas as sessões ativas ────────────
function invalidarCacheCartaSessoes() {
    sessoes.forEach(function(sessao) {
        if (sessao.contextoSistema) {
            sessao.contextoSistema.carta = null;
            sessao.contextoSistema.expira = 0; // força refresh
        }
    });
}

// ── HELPER: Busca categorias do usuário ──────────────────────────
async function buscarCategorias(usuarioId) {
    try {
        const r = await query(
            'SELECT id, nome FROM categorias WHERE usuario_id = $1 ORDER BY nome',
            [usuarioId]
        );
        return r.rows;
    } catch {
        return [];
    }
}

// ── HELPER: Busca cartões do usuário ─────────────────────────────
async function buscarCartoes(usuarioId, perfilId = null) {
    try {
        let sql = 'SELECT id, nome FROM cartoes WHERE usuario_id = $1 AND ativo = true';
        const params = [usuarioId];
        if (perfilId) {
            sql += ` AND (perfil_id = $2 OR (perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis p WHERE p.id = $2 AND p.tipo = 'pessoal' AND p.usuario_id = $1)))`;
            params.push(perfilId);
        }
        const r = await query(sql, params);
        return r.rows;
    } catch {
        return [];
    }
}

// ── HELPER: Busca dados financeiros resumidos ─────────────────────
async function buscarResumoFinanceiro(usuarioId, mes, ano) {
    const hoje = new Date();
    const m = mes ?? hoje.getMonth();
    const a = ano ?? hoje.getFullYear();

    // Filtro de exclusão: despesas recorrentes pagas no crédito não entram no total
    // (são "invisíveis" para o saldo — o limite do cartão as absorve separadamente).
    // O mesmo filtro deve ser aplicado tanto no total quanto no valor já pago, para
    // que totalPago nunca seja maior que totalDespesas.
    const EXCLUIR_RECORRENTE_CREDITO = `
      NOT (d.recorrente = true AND LOWER(d.forma_pagamento) IN ('credito', 'crédito', 'cred-merpago', 'créd-merpago'))`;

    try {
        const [despesas, receitas, despesasPago] = await Promise.all([
            query(
                `SELECT SUM(COALESCE(valor_pago, valor)) as total, categoria_id,
                        (SELECT nome FROM categorias c WHERE c.id = d.categoria_id) as categoria
                 FROM despesas d
                 WHERE d.usuario_id = $1 AND d.mes = $2 AND d.ano = $3
                   AND ${EXCLUIR_RECORRENTE_CREDITO}
                 GROUP BY d.categoria_id`,
                [usuarioId, m, a]
            ),
            query(
                'SELECT SUM(valor) as total FROM receitas WHERE usuario_id = $1 AND mes = $2 AND ano = $3',
                [usuarioId, m, a]
            ),
            query(
                `SELECT SUM(COALESCE(valor_pago, valor)) as pago
                 FROM despesas d
                 WHERE d.usuario_id = $1 AND d.mes = $2 AND d.ano = $3
                   AND d.pago = true
                   AND ${EXCLUIR_RECORRENTE_CREDITO}`,
                [usuarioId, m, a]
            )
        ]);

        const totalDespesas = despesas.rows.reduce((s, r) => s + parseFloat(r.total || 0), 0);
        const totalReceitas = parseFloat(receitas.rows[0]?.total || 0);
        const totalPago = parseFloat(despesasPago.rows[0]?.pago || 0);
        const totalEmAberto = Math.max(0, totalDespesas - totalPago);

        return {
            mes: m,
            ano: a,
            totalDespesas: parseFloat(totalDespesas.toFixed(2)),
            totalDespesasPago: parseFloat(totalPago.toFixed(2)),
            totalDespesasEmAberto: parseFloat(totalEmAberto.toFixed(2)),
            totalReceitas: parseFloat(totalReceitas.toFixed(2)),
            saldo: parseFloat((totalReceitas - totalDespesas).toFixed(2)),
            porCategoria: despesas.rows.map(r => ({
                categoria: r.categoria || 'Sem categoria',
                total: parseFloat(r.total || 0),
            }))
        };
    } catch {
        return { totalDespesas: 0, totalDespesasPago: 0, totalDespesasEmAberto: 0, totalReceitas: 0, saldo: 0, porCategoria: [] };
    }
}

// ── HELPER: Constrói contexto do sistema para enriquecer a IA ────
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

async function buscarContextoSistema(usuarioId, mes, ano, perfilId = null) {
    const hoje = new Date();
    const m = mes ?? hoje.getMonth();
    const a = ano ?? hoje.getFullYear();

    // Filtro de perfil — mesmo padrão dos outros routes
    const perfilFilter = perfilId
        ? ` AND (d.perfil_id = $4 OR (d.perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis p WHERE p.id = $4 AND p.tipo = 'pessoal' AND p.usuario_id = d.usuario_id)))`
        : '';
    const perfilFilterReceitas = perfilId
        ? ` AND (r.perfil_id = $4 OR (r.perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis p WHERE p.id = $4 AND p.tipo = 'pessoal' AND p.usuario_id = r.usuario_id)))`
        : '';
    const baseParams = perfilId ? [usuarioId, m, a, perfilId] : [usuarioId, m, a];

    try {
        // Buscar nome do perfil ativo para incluir no contexto
        let nomePerfilAtivo = 'Pessoal';
        let tipoPerfilAtivo = 'pessoal';
        if (perfilId) {
            try {
                const perfilRes = await query('SELECT nome, razao_social, nome_fantasia, tipo FROM perfis WHERE id = $1', [perfilId]);
                if (perfilRes.rows.length > 0) {
                    const p = perfilRes.rows[0];
                    nomePerfilAtivo = p.nome_fantasia || p.razao_social || p.nome;
                    tipoPerfilAtivo = p.tipo;
                }
            } catch { /* silencioso */ }
        }

        const [categorias, cartoes, despesasMes, receitasMes, despesasRecentes] = await Promise.all([
            buscarCategorias(usuarioId),
            buscarCartoes(usuarioId, perfilId),
            query(
                `SELECT SUM(COALESCE(valor_pago, valor)) as total,
                        (SELECT nome FROM categorias c WHERE c.id = d.categoria_id) as categoria
                 FROM despesas d
                 WHERE d.usuario_id = $1 AND d.mes = $2 AND d.ano = $3
                   AND NOT (recorrente = true AND LOWER(forma_pagamento) IN ('credito', 'crédito', 'cred-merpago', 'créd-merpago'))
                   ${perfilFilter}
                 GROUP BY d.categoria_id ORDER BY total DESC LIMIT 5`,
                baseParams
            ),
            query(
                `SELECT SUM(r.valor) as total FROM receitas r
                 WHERE r.usuario_id = $1 AND r.mes = $2 AND r.ano = $3${perfilFilterReceitas}`,
                baseParams
            ),
            query(
                `SELECT d.descricao, d.valor FROM despesas d
                 WHERE d.usuario_id = $1 AND d.mes = $2 AND d.ano = $3${perfilFilter}
                 ORDER BY d.criado_em DESC LIMIT 8`,
                baseParams
            )
        ]);

        const totalDespesas = despesasMes.rows.reduce((s, r) => s + parseFloat(r.total || 0), 0);
        const totalReceitas = parseFloat(receitasMes.rows[0]?.total || 0);

        const despesasPagoCtx = await query(
            `SELECT SUM(COALESCE(valor_pago, valor)) as pago FROM despesas d
             WHERE d.usuario_id = $1 AND d.mes = $2 AND d.ano = $3 AND d.pago = true
               AND NOT (d.recorrente = true AND LOWER(d.forma_pagamento) IN ('credito', 'crédito', 'cred-merpago', 'créd-merpago'))
               ${perfilFilter}`,
            baseParams
        );
        const totalPagoCtx = parseFloat(despesasPagoCtx.rows[0]?.pago || 0);
        const totalEmAbertoCtx = Math.max(0, totalDespesas - totalPagoCtx);

        const linhas = [
            `Perfil ativo: ${tipoPerfilAtivo === 'empresa' ? 'Empresa "' + nomePerfilAtivo + '"' : 'Pessoal'}`,
            `Período atual: ${MESES[m]}/${a}`,
            `Categorias cadastradas: ${categorias.map(c => c.nome).join(', ') || 'nenhuma'}`,
            `Cartões do usuário: ${cartoes.map(c => c.nome).join(', ') || 'nenhum'}`,
            `Resumo do mês: Receitas R$ ${totalReceitas.toFixed(2)} | Despesas total R$ ${totalDespesas.toFixed(2)} (pagas R$ ${totalPagoCtx.toFixed(2)} | em aberto R$ ${totalEmAbertoCtx.toFixed(2)}) | Saldo R$ ${(totalReceitas - totalDespesas).toFixed(2)}`,
        ];

        if (despesasMes.rows.length > 0) {
            linhas.push(`Gastos por categoria: ${despesasMes.rows.map(r => `${r.categoria || 'Outros'} R$ ${parseFloat(r.total).toFixed(2)}`).join(', ')}`);
        }
        if (despesasRecentes.rows.length > 0) {
            linhas.push(`Despesas já registradas este mês: ${despesasRecentes.rows.map(r => `"${r.descricao}" R$ ${parseFloat(r.valor).toFixed(2)}`).join(', ')}`);
        }

        return linhas.join('\n');
    } catch {
        return '';
    }
}

// ================================================================
// POST /api/ai/chat
// Endpoint principal do assistente conversacional
// ================================================================
async function chat(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const { mensagem, limpar_sessao, mes_atual, ano_atual, perfil_id } = req.body;

        if (!mensagem?.trim()) {
            return res.status(400).json({ success: false, message: 'Mensagem não pode estar vazia.' });
        }

        if (limpar_sessao) limparSessao(usuarioId);

        const sessao = obterSessao(usuarioId);
        const providerConfig = await buscarConfigIA(usuarioId);

        // ── Contexto do sistema (cache de 5 min, invalidado ao trocar perfil) ─
        const agora = Date.now();
        const perfilMudou = sessao.ultimoPerfilId !== (perfil_id || null);
        if (perfilMudou) sessao.ultimoPerfilId = (perfil_id || null);
        if (!sessao.contextoSistema || agora > sessao.contextoSistema.expira || perfilMudou) {
            const texto = await buscarContextoSistema(usuarioId, mes_atual, ano_atual, perfil_id || null);
            const carta = await buscarCartaServicos();
            sessao.contextoSistema = { texto, carta, expira: agora + 5 * 60 * 1000 };
        }
        // Monta contexto: dados do sistema (separado das instruções personalizadas)
        const instrucoesUsuario = providerConfig.instrucoesGen || '';
        const ctxSistema = sessao.contextoSistema.texto;
        const cartaBase  = sessao.contextoSistema.carta || '';

        // Adiciona ao histórico
        sessao.historico.push({ role: 'user', content: mensagem });

        // Limita histórico a 20 mensagens
        if (sessao.historico.length > 20) {
            sessao.historico = sessao.historico.slice(-20);
        }

        let resposta = '';
        let acao = null;
        let dadosDespesa = null;

        // ── Se estava esperando campo específico ────────────────
        let _estavaCometendoCampo = false;
        if (sessao.esperandoCampo && sessao.despesaParcial) {
            const campo = sessao.esperandoCampo;
            const valor = mensagem.trim();

            // Aplica o valor ao campo esperado
            if (campo === 'valor') {
                const { normalizarValor } = require('../utils/expenseNormalizer');
                sessao.despesaParcial.valor = normalizarValor(valor);
            } else if (campo === 'forma_pagamento') {
                const { normalizarFormaPagamento } = require('../utils/expenseNormalizer');
                sessao.despesaParcial.forma_pagamento = normalizarFormaPagamento(valor);
            } else if (campo === 'vencimento') {
                const { normalizarData } = require('../utils/expenseNormalizer');
                sessao.despesaParcial.vencimento = normalizarData(valor);
            } else if (campo === 'parcelas') {
                sessao.despesaParcial.parcelas = parseInt(valor) || 1;
            } else if (campo === 'categoria') {
                sessao.despesaParcial.categoria = valor;
            } else {
                sessao.despesaParcial[campo] = valor;
            }

            sessao.esperandoCampo = null;
            _estavaCometendoCampo = true;
        }

        // ── Detecta intenção ────────────────────────────────────
        // Se o usuário estava respondendo um campo de despesa parcial, força intenção
        // de despesa para não interromper o fluxo de coleta.
        const intencao = _estavaCometendoCampo && sessao.despesaParcial
            ? 'despesa'
            : await detectarIntencaoComIA(mensagem, sessao.historico, providerConfig);

        if (intencao === 'saudacao') {
            resposta = 'Olá! Sou a Gen, sua IA financeira do IGen - Sistema Financeiro Inteligente. Posso ajudá-lo a:\n\n• Cadastrar despesas (ex: "paguei 150 de mercado no pix")\n• Cadastrar receitas (ex: "recebi salário 3500 hoje")\n• Responder perguntas (ex: "quanto gastei esse mês")\n• Interpretar boletos, PIX e documentos\n\nComo posso ajudar?';
            sessao.historico.push({ role: 'assistant', content: resposta });
            return res.json({ success: true, resposta, acao: 'saudacao' });
        }

        if (intencao === 'encerrar') {
            limparSessao(usuarioId);
            return res.json({ success: true, resposta: 'Até mais! Se precisar de algo, é só chamar. 👋', acao: 'encerrar' });
        }

        if (intencao === 'meta') {
            // Extrai valor e prazo da mensagem
            const valorMatch = mensagem.match(/R?\$?\s*(\d+(?:[.,]\d{1,2})?)/);
            const valor = valorMatch ? parseFloat(valorMatch[1].replace(',', '.')) : null;
            const prazMatch = mensagem.match(/\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\s*(\/|de\s*)?\s*(\d{4})/i);
            let prazo = null;
            if (prazMatch) {
                const mMap = { jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06', jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12' };
                const mKey = prazMatch[1].toLowerCase().slice(0, 3);
                prazo = prazMatch[3] + '-' + (mMap[mKey] || '12');
            }
            // Descrição: tudo que não é número/prazo
            const descricao = mensagem.replace(/R?\$?\s*[\d.,]+/, '').replace(/\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*/gi, '').replace(/\d{4}/g, '').replace(/quero|definir|criar|nova|meta|de|economia|poupança|poupar|economizar|até/gi, '').trim() || 'Meta de economia';

            if (!valor) {
                resposta = 'Para criar uma meta, me diga o valor. Exemplo: "Quero economizar **R$ 3000** até dezembro".';
            } else {
                const { query: qry } = require('../config/database');
                const r = await qry('SELECT dados_financeiros FROM usuarios WHERE id = $1', [usuarioId]);
                const df = r.rows[0]?.dados_financeiros || {};
                const metas = df.metas || [];
                const nova = { id: Date.now(), descricao, valor, prazo };
                metas.push(nova);
                await qry(
                    `UPDATE usuarios SET dados_financeiros = COALESCE(dados_financeiros,'{}'::jsonb) || jsonb_build_object('metas', $1::jsonb) WHERE id = $2`,
                    [JSON.stringify(metas), usuarioId]
                );
                const prazoStr = prazo ? ' até ' + prazo.split('-').reverse().join('/') : '';
                resposta = `✅ Meta salva! Vou acompanhar: **${descricao}** — R$ ${valor.toFixed(2).replace('.', ',')}${prazoStr}.\n\nVocê verá o progresso toda vez que abrir o chat.`;
            }
            sessao.historico.push({ role: 'assistant', content: resposta });
            return res.json({ success: true, resposta, acao: 'meta' });
        }

        if (intencao === 'orcamento') {
            // Extrai limite e categoria da mensagem
            const valorMatch2 = mensagem.match(/R?\$?\s*(\d+(?:[.,]\d{1,2})?)/);
            const limite = valorMatch2 ? parseFloat(valorMatch2[1].replace(',', '.')) : null;

            if (!limite) {
                resposta = 'Para criar um alerta de orçamento, me diga o limite. Exemplo: "Me avisa se gastar mais de **R$ 500** em restaurante".';
            } else {
                // Busca categorias do usuário para detectar qual foi mencionada
                const cats = await buscarCategorias(usuarioId);
                const catMatch = cats.find(c => mensagem.toLowerCase().includes(c.nome.toLowerCase()));
                const categoria = catMatch ? catMatch.nome : (mensagem.replace(/R?\$?\s*[\d.,]+/, '').replace(/me\s+avis[ae]|alert[ae]|limit[ae]|or[cç]amento|se\s+gastar\s+mais\s+de/gi, '').trim() || 'Geral');

                const { query: qry2 } = require('../config/database');
                const r2 = await qry2('SELECT dados_financeiros FROM usuarios WHERE id = $1', [usuarioId]);
                const df2 = r2.rows[0]?.dados_financeiros || {};
                const orcamentos = df2.orcamentos || [];
                const idx = orcamentos.findIndex(o => o.categoria.toLowerCase() === categoria.toLowerCase());
                const item = { id: Date.now(), categoria, limite };
                if (idx >= 0) orcamentos[idx] = item; else orcamentos.push(item);
                await qry2(
                    `UPDATE usuarios SET dados_financeiros = COALESCE(dados_financeiros,'{}'::jsonb) || jsonb_build_object('orcamentos', $1::jsonb) WHERE id = $2`,
                    [JSON.stringify(orcamentos), usuarioId]
                );
                resposta = `✅ Alerta configurado! Vou avisar quando seus gastos em **${categoria}** ultrapassarem 70% de R$ ${limite.toFixed(2).replace('.', ',')}.`;
            }
            sessao.historico.push({ role: 'assistant', content: resposta });
            return res.json({ success: true, resposta, acao: 'orcamento' });
        }

        if (intencao === 'receita') {
            const dadosReceita = await parsearReceita(mensagem, sessao.historico, providerConfig, ctxSistema, cartaBase, instrucoesUsuario);
            const hoje = new Date().toISOString().split('T')[0];
            if (!dadosReceita.data || dadosReceita.data === 'HOJE') dadosReceita.data = hoje;
            if (!dadosReceita.descricao) dadosReceita.descricao = 'Receita';
            resposta = `Encontrei a seguinte receita:\n\n💰 **${dadosReceita.descricao}**\n${dadosReceita.valor ? `💵 Valor: R$ ${Number(dadosReceita.valor).toFixed(2).replace('.', ',')}\n` : ''}📅 Data: ${(dadosReceita.data || hoje).split('-').reverse().join('/')}\n\nDeseja confirmar o cadastro?`;
            sessao.historico.push({ role: 'assistant', content: resposta });
            return res.json({ success: true, resposta, acao: 'confirmar_receita', receita: dadosReceita });
        }

        if (intencao === 'analise') {
            // Detecta se a pergunta menciona um mês/período específico ou "mês passado"
            const msgLower = mensagem.toLowerCase();
            const MESES_NOMES = ['janeiro','fevereiro','março','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
            let mesAnalise = mes_atual ?? new Date().getMonth();
            let anoAnalise = ano_atual ?? new Date().getFullYear();

            // "mês passado" / "mês anterior"
            if (/m[eê]s\s+(passado|anterior|passando)/i.test(msgLower)) {
                mesAnalise = mesAnalise - 1;
                if (mesAnalise < 0) { mesAnalise = 11; anoAnalise--; }
            }
            // Nome de mês explícito: "em março", "de abril", "janeiro"
            else {
                MESES_NOMES.forEach(function(nm, idx) {
                    var mesIdx = idx > 3 ? idx : idx; // marco=marco(2), março=2
                    if (nm === 'marco') return;
                    if (msgLower.includes(nm)) {
                        var m = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'].indexOf(nm === 'marco' ? 'março' : nm);
                        if (m >= 0) mesAnalise = m;
                    }
                });
                if (msgLower.includes('marco')) mesAnalise = 2;
            }
            // Ano explícito: "2025", "2026"
            const anoMatch = msgLower.match(/\b(202\d)\b/);
            if (anoMatch) anoAnalise = parseInt(anoMatch[1]);

            // Busca resumo do período detectado + mês atual para comparação
            const resumo = await buscarResumoFinanceiro(usuarioId, mesAnalise, anoAnalise);
            const contextoHistorico = { resumoAtual: resumo };

            // Se buscou período diferente do atual, adiciona comparação
            if (mesAnalise !== (mes_atual ?? new Date().getMonth()) || anoAnalise !== (ano_atual ?? new Date().getFullYear())) {
                const resumoAtual = await buscarResumoFinanceiro(usuarioId, mes_atual, ano_atual);
                contextoHistorico.resumoComparacao = resumoAtual;
                contextoHistorico.notaContexto = `Analisando período: ${MESES[mesAnalise]}/${anoAnalise} vs atual: ${MESES[mes_atual ?? new Date().getMonth()]}/${ano_atual ?? new Date().getFullYear()}`;
            }

            resposta = await responderPerguntaFinanceira(mensagem, contextoHistorico, sessao.historico.slice(-6), providerConfig, ctxSistema, cartaBase, instrucoesUsuario);
            sessao.historico.push({ role: 'assistant', content: resposta });
            return res.json({ success: true, resposta, acao: 'analise', dados: resumo });
        }

        // ── Parseia despesa ─────────────────────────────────────
        let parsedResult;
        try {
            parsedResult = await parsearDespesa(mensagem, sessao.historico, false, providerConfig, ctxSistema, cartaBase, instrucoesUsuario);
        } catch (err) {
            parsedResult = { dados: null, metodo: 'erro', intencao: 'despesa' };
        }

        let despesa = parsedResult.dados;

        // Mescla com despesa parcial da sessão
        if (despesa && sessao.despesaParcial) {
            for (const [k, v] of Object.entries(sessao.despesaParcial)) {
                if (v !== null && v !== undefined) {
                    despesa[k] = despesa[k] ?? v;
                }
            }
        }

        sessao.despesaParcial = despesa;

        // ── Verifica categorias do usuário ──────────────────────
        const categorias = await buscarCategorias(usuarioId);
        const nomesCategorias = categorias.map(c => c.nome);

        if (!despesa.categoria || despesa.categoria === 'Outros') {
            const instrucoesClassif = [cartaBase, instrucoesUsuario].filter(Boolean).join('\n\n');
            despesa.categoria = await classificarCategoria(
                despesa.descricao, usuarioId, nomesCategorias, instrucoesClassif
            );
        }

        // Mapeia categoria nome para ID
        const categoriaObj = categorias.find(c =>
            c.nome.toLowerCase() === (despesa.categoria || '').toLowerCase()
        );
        if (categoriaObj) despesa.categoria_id = categoriaObj.id;

        // ── Verifica campos obrigatórios ────────────────────────
        const faltando = validarCamposObrigatorios(despesa);

        if (faltando.length > 0) {
            const campo = faltando[0];
            sessao.esperandoCampo = campo;
            resposta = perguntaParaCampo(campo);
            sessao.historico.push({ role: 'assistant', content: resposta });

            return res.json({
                success: true,
                resposta,
                acao: 'aguardando_campo',
                campo_faltando: campo,
                despesa_parcial: despesa,
            });
        }

        // ── Despesa completa - retorna para confirmação ─────────
        acao = 'confirmar_despesa';
        dadosDespesa = despesa;
        sessao.ultimaAcao = 'despesa_completa';
        sessao.despesaParcial = null;
        sessao.esperandoCampo = null;

        const valorFormatado = `R$ ${Number(despesa.valor).toFixed(2).replace('.', ',')}`;
        const forma = formatarFormaPagamento(despesa.forma_pagamento);

        resposta = `Encontrei a seguinte despesa:\n\n📋 **${despesa.descricao}**\n💰 Valor: ${valorFormatado}\n🏷️ Categoria: ${despesa.categoria || 'Outros'}\n💳 Pagamento: ${forma}\n${despesa.vencimento ? `📅 Vencimento: ${formatarData(despesa.vencimento)}\n` : ''}${despesa.parcelas > 1 ? `🔢 Parcelas: ${despesa.parcelas}x\n` : ''}\nDeseja confirmar o cadastro?`;

        sessao.historico.push({ role: 'assistant', content: resposta });

        return res.json({
            success: true,
            resposta,
            acao,
            despesa: dadosDespesa,
            metodo_parser: parsedResult.metodo,
        });

    } catch (err) {
        console.error('Erro no chat IA:', err);
        res.status(500).json({ success: false, message: 'Erro interno do assistente.' });
    }
}

// ================================================================
// POST /api/ai/despesa
// Interpreta texto direto de despesa (sem contexto de conversa)
// ================================================================
async function interpretarDespesa(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const { texto } = req.body;

        if (!texto?.trim()) {
            return res.status(400).json({ success: false, message: 'Texto da despesa não informado.' });
        }

        const providerCfg = await buscarConfigIA(usuarioId);
        const instrucoesGen = providerCfg.instrucoesGen || '';
        const cartaServicos = await buscarCartaServicos();
        const { dados, metodo } = await parsearDespesa(texto, [], false, providerCfg, '', cartaServicos, instrucoesGen);

        // Busca categorias e aplica classificação
        const categorias = await buscarCategorias(usuarioId);
        const nomesCategorias = categorias.map(c => c.nome);
        const instrucoesClassif = [cartaServicos, instrucoesGen].filter(Boolean).join('\n\n');
        dados.categoria = await classificarCategoria(dados.descricao, usuarioId, nomesCategorias, instrucoesClassif);

        const categoriaObj = categorias.find(c =>
            c.nome.toLowerCase() === dados.categoria.toLowerCase()
        );
        if (categoriaObj) dados.categoria_id = categoriaObj.id;

        const faltando = validarCamposObrigatorios(dados);

        return res.json({
            success: true,
            dados,
            campos_faltando: faltando,
            metodo_parser: metodo,
            completo: faltando.length === 0,
        });

    } catch (err) {
        console.error('Erro ao interpretar despesa:', err);
        res.status(500).json({ success: false, message: 'Erro ao interpretar texto.' });
    }
}

// ================================================================
// POST /api/ai/arquivo
// Processa upload de documento financeiro (imagem/PDF)
// ================================================================
async function processarArquivoUpload(req, res) {
    const filePath = req.file?.path;

    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });
        }

        const mimeType = req.file.mimetype;
        const tamanhoMax = 10 * 1024 * 1024; // 10MB

        if (req.file.size > tamanhoMax) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ success: false, message: 'Arquivo muito grande (máx 10MB).' });
        }

        // ── 1. Tenta análise com IA Vision (mais precisa) ─────────
        const providerConfig = await buscarConfigIA(req.usuario.id);
        const visionResult = await analisarDocumentoComIA(filePath, mimeType, providerConfig);

        let resultado;
        if (visionResult) {
            // Usa resultado da IA Vision
            resultado = { sucesso: true, ...visionResult };
            // Se a IA extraiu linha digitável, confirma via parser para garantir valor/vencimento
            if (visionResult.linha_digitavel) {
                const boleto = parsearBoleto(visionResult.linha_digitavel);
                if (boleto.sucesso) {
                    resultado.boleto = boleto;
                    if (!resultado.valor && boleto.valor) resultado.valor = boleto.valor;
                    if (!resultado.vencimento && boleto.vencimento) resultado.vencimento = boleto.vencimento;
                    resultado.tipo = 'boleto';
                }
            }
        } else {
            // ── 2. Fallback: OCR + regex ──────────────────────────
            resultado = await processarArquivo(filePath, mimeType);
            // Tenta extrair linha digitável de boleto do texto OCR
            if (resultado.texto_bruto) {
                const linhaDigitavel = encontrarLinhaDigitavel(resultado.texto_bruto);
                if (linhaDigitavel) {
                    const boleto = parsearBoleto(linhaDigitavel);
                    if (boleto.sucesso) {
                        resultado.boleto = boleto;
                        if (!resultado.valor && boleto.valor) resultado.valor = boleto.valor;
                        if (!resultado.vencimento && boleto.vencimento) resultado.vencimento = boleto.vencimento;
                        resultado.tipo = 'boleto';
                    }
                }
            }
        }

        // ── Monta sugestão de despesa ─────────────────────────────
        const despesaSugerida = {
            descricao:  resultado.descricao || resultado.empresa || 'Documento financeiro',
            valor:      resultado.valor || null,
            vencimento: resultado.vencimento || null,
            data:       resultado.data || new Date().toISOString().split('T')[0],
            parcelas:   1,
            categoria:  resultado.categoria_sugerida || null,
        };

        return res.json({
            success: true,
            fonte: visionResult ? 'vision_ia' : 'ocr',
            arquivo: {
                nome: req.file.originalname,
                tipo: mimeType,
                tamanho: req.file.size,
            },
            resultado,
            despesa_sugerida: despesaSugerida,
        });

    } catch (err) {
        console.error('Erro ao processar arquivo:', err);
        res.status(500).json({ success: false, message: 'Erro ao processar arquivo.' });
    } finally {
        // Remove arquivo temporário
        if (filePath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch {}
        }
    }
}

// ================================================================
// POST /api/ai/pix
// Interpreta QR Code PIX de imagem ou texto
// ================================================================
async function interpretarPIX(req, res) {
    const filePath = req.file?.path;

    try {
        let resultado;

        if (req.file) {
            // QR Code em imagem
            resultado = await processarQRCodePIX(req.file.path);
        } else if (req.body.payload) {
            // Payload PIX em texto
            resultado = processarTextoPIX(req.body.payload);
        } else {
            return res.status(400).json({
                success: false,
                message: 'Envie uma imagem com QR Code ou o payload PIX em texto.'
            });
        }

        return res.json({ success: true, ...resultado });

    } catch (err) {
        console.error('Erro ao interpretar PIX:', err);
        res.status(500).json({ success: false, message: 'Erro ao processar PIX.' });
    } finally {
        if (filePath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch {}
        }
    }
}

// ================================================================
// POST /api/ai/boleto
// Interpreta linha digitável de boleto
// ================================================================
async function interpretarBoleto(req, res) {
    try {
        const { linha_digitavel, texto } = req.body;

        let linha = linha_digitavel;

        // Se veio como texto livre, tenta extrair a linha
        if (!linha && texto) {
            linha = encontrarLinhaDigitavel(texto);
        }

        if (!linha) {
            return res.status(400).json({
                success: false,
                message: 'Informe a linha digitável do boleto.'
            });
        }

        const resultado = parsearBoleto(linha);
        return res.json({ success: true, ...resultado });

    } catch (err) {
        console.error('Erro ao interpretar boleto:', err);
        res.status(500).json({ success: false, message: 'Erro ao processar boleto.' });
    }
}


// ================================================================
// GET /api/ai/recorrencias
// Detecta e lista despesas recorrentes
// ================================================================
async function listarRecorrencias(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const { detectar } = req.query;

        if (detectar === 'true') {
            const sugestoes = await detectarRecorrencias(usuarioId);
            return res.json({ success: true, sugestoes, total: sugestoes.length });
        }

        const recorrencias = await buscarRecorrencias(usuarioId);
        return res.json({ success: true, recorrencias, total: recorrencias.length });

    } catch (err) {
        console.error('Erro ao listar recorrências:', err);
        res.status(500).json({ success: false, message: 'Erro ao buscar recorrências.' });
    }
}

// ================================================================
// POST /api/ai/recorrencias
// Salva uma recorrência confirmada pelo usuário
// ================================================================
async function confirmarRecorrencia(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const recorrencia = req.body;

        if (!recorrencia.descricao || !recorrencia.valor_medio) {
            return res.status(400).json({ success: false, message: 'Dados incompletos.' });
        }

        const ok = await salvarRecorrencia(usuarioId, recorrencia);
        return res.json({ success: ok, message: ok ? 'Recorrência salva!' : 'Erro ao salvar.' });

    } catch (err) {
        console.error('Erro ao confirmar recorrência:', err);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
}

// ================================================================
// POST /api/ai/aprendizado
// Salva correção de categoria do usuário
// ================================================================
async function salvarAprendizadoCategoria(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const { texto, categoria } = req.body;

        if (!texto || !categoria) {
            return res.status(400).json({ success: false, message: 'texto e categoria são obrigatórios.' });
        }

        await salvarAprendizado(usuarioId, texto, categoria);

        return res.json({ success: true, message: 'Aprendizado salvo! Usarei essa categoria no futuro.' });

    } catch (err) {
        console.error('Erro ao salvar aprendizado:', err);
        res.status(500).json({ success: false, message: 'Erro ao salvar aprendizado.' });
    }
}

// ================================================================
// POST /api/ai/config/chave
// Salva provedor e chave de IA por usuário
// ================================================================
async function salvarConfigChave(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const { provider, api_key } = req.body;

        const provedoresValidos = ['gen', 'openai', 'gemini', 'claude'];
        if (!provider || !provedoresValidos.includes(provider)) {
            return res.status(400).json({ success: false, message: 'Provedor inválido. Use: gen, openai, gemini ou claude.' });
        }

        // Busca chaves já salvas para manter as de outros provedores
        const current   = await buscarConfigIA(usuarioId);
        const apiKeys   = current.apiKeys || {};

        // Chave vazia = manter a existente para este provedor
        const chaveAtual = api_key || apiKeys[provider] || null;

        if (provider !== 'gen' && !chaveAtual) {
            return res.status(400).json({ success: false, message: 'Chave de API obrigatória para esse provedor.' });
        }

        if (api_key) {
            if (provider === 'openai' && !api_key.startsWith('sk-')) {
                return res.status(400).json({ success: false, message: 'Chave OpenAI inválida. Deve começar com sk-' });
            }
            if (provider === 'claude' && !api_key.startsWith('sk-ant-')) {
                return res.status(400).json({ success: false, message: 'Chave Anthropic inválida. Deve começar com sk-ant-' });
            }
            // Atualiza chave deste provedor no mapa
            apiKeys[provider] = api_key;
        }

        const config = {
            ia_provider:  provider,
            ia_api_key:   provider === 'gen' ? null : chaveAtual,
            ia_api_keys:  apiKeys
        };

        await query(
            `UPDATE usuarios SET dados_financeiros = COALESCE(dados_financeiros, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
            [JSON.stringify(config), usuarioId]
        );

        const nomes = { gen: 'Gen (IA interna)', openai: 'OpenAI GPT-4o mini', gemini: 'Google Gemini', claude: 'Anthropic Claude Haiku' };
        return res.json({ success: true, message: `Configuração salva! Usando: ${nomes[provider]}` });

    } catch (err) {
        console.error('Erro ao salvar config IA:', err);
        res.status(500).json({ success: false, message: 'Erro ao salvar configuração.' });
    }
}

// ================================================================
// POST /api/ai/extrato
// Importação de extrato bancário em PDF
// ================================================================
async function importarExtrato(req, res) {
    const filePath = req.file?.path;
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Envie o arquivo PDF do extrato.' });
        }

        const { extrairTextoPDF } = require('../services/ocrService');
        const texto = await extrairTextoPDF(filePath);

        if (!texto || texto.trim().length < 50) {
            return res.status(422).json({ success: false, message: 'Não foi possível ler o conteúdo do PDF. Verifique se o arquivo não está protegido.' });
        }

        const providerConfig = await buscarConfigIA(req.usuario.id);
        const transacoes = await parsearExtratoComIA(texto, providerConfig);

        if (!transacoes.length) {
            return res.json({ success: true, transacoes: [], mensagem: 'Nenhuma transação encontrada no extrato. O formato pode não ser suportado.' });
        }

        return res.json({ success: true, transacoes, total: transacoes.length });

    } catch (err) {
        console.error('Erro ao importar extrato:', err);
        res.status(500).json({ success: false, message: 'Erro ao processar o extrato: ' + err.message });
    } finally {
        if (filePath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch {}
        }
    }
}

// ================================================================
// GET /api/ai/resumo
// Resumo financeiro do mês atual + alertas proativos
// ================================================================
async function resumoFinanceiro(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const hoje = new Date();
        const mes = parseInt(req.query.mes ?? hoje.getMonth());
        const ano = parseInt(req.query.ano ?? hoje.getFullYear());
        const perfilId = req.query.perfil_id ? parseInt(req.query.perfil_id) : null;

        const perfilFilter = perfilId ? 'AND d.perfil_id = ' + perfilId : '';
        const perfilFilterR = perfilId ? 'AND r.perfil_id = ' + perfilId : '';

        const EXCL = `NOT (d.recorrente = true AND LOWER(d.forma_pagamento) IN ('credito', 'crédito', 'cred-merpago', 'créd-merpago'))`;

        // Resumo do mês atual
        const resumo = await buscarResumoFinanceiro(usuarioId, mes, ano);

        // Despesas vencendo nos próximos 7 dias (não pagas)
        const dataHoje = hoje.toISOString().split('T')[0];
        const data7d   = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const proximas = await query(
            `SELECT descricao, COALESCE(valor_pago, valor) as valor, data_vencimento
             FROM despesas d
             WHERE usuario_id = $1 AND pago = false
               AND data_vencimento BETWEEN $2 AND $3
               ${perfilFilter}
             ORDER BY data_vencimento ASC LIMIT 5`,
            [usuarioId, dataHoje, data7d]
        );

        // Total despesas do mês anterior (para comparar)
        let mesAnt = mes - 1, anoAnt = ano;
        if (mesAnt < 0) { mesAnt = 11; anoAnt--; }
        const resumoAnt = await buscarResumoFinanceiro(usuarioId, mesAnt, anoAnt);

        // Metas e orçamentos do usuário
        const dfUser = await query('SELECT dados_financeiros FROM usuarios WHERE id = $1', [usuarioId]);
        const dadosFinanc = dfUser.rows[0]?.dados_financeiros || {};
        const metas     = dadosFinanc.metas     || [];
        const orcamentos = dadosFinanc.orcamentos || [];

        // Verifica alertas de orçamento por categoria
        const alertasOrcamento = orcamentos.map(o => {
            const catGastos = resumo.porCategoria.find(c => c.categoria?.toLowerCase() === o.categoria.toLowerCase());
            const gasto = catGastos ? catGastos.total : 0;
            return { categoria: o.categoria, limite: o.limite, gasto, excedido: gasto > o.limite, percentual: o.limite > 0 ? Math.round(gasto / o.limite * 100) : 0 };
        }).filter(a => a.percentual >= 70); // só alerta se >= 70% do limite

        return res.json({
            success: true,
            mes, ano,
            resumo,
            resumoMesAnterior: { mes: mesAnt, ano: anoAnt, totalDespesas: resumoAnt.totalDespesas },
            proximasVencer: proximas.rows.map(r => ({
                descricao: r.descricao,
                valor: parseFloat(r.valor),
                vencimento: r.data_vencimento,
            })),
            metas,
            alertasOrcamento,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao buscar resumo.' });
    }
}

// ================================================================
// GET /api/ai/test
// Testa conexão real com a IA externa configurada
// ================================================================
async function testarConexaoIA(req, res) {
    try {
        const config = await buscarConfigIA(req.usuario.id);
        const provider = config?.provider || 'gen';

        if (!provider || provider === 'gen') {
            return res.json({ success: true, online: true, provider: 'gen', mensagem: 'Gen ativa — IA interna funcionando.' });
        }

        const apiKey = config?.apiKey;
        if (!apiKey) {
            return res.json({ success: false, online: false, provider, mensagem: 'Nenhuma chave de API configurada.' });
        }

        // Faz um teste mínimo com a IA externa
        const TESTE_PROMPT = 'Responda apenas com a palavra "ok".';
        let resposta = null;

        try {
            if (provider === 'openai') {
                const OpenAI = require('openai');
                const openai = new OpenAI({ apiKey });
                const r = await openai.chat.completions.create({
                    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                    messages: [{ role: 'user', content: TESTE_PROMPT }],
                    temperature: 0,
                    max_tokens: 5,
                });
                resposta = r.choices[0]?.message?.content?.trim();
            } else if (provider === 'gemini') {
                const fetch = require('node-fetch');
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
                const r = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: TESTE_PROMPT }] }],
                        generationConfig: { temperature: 0, maxOutputTokens: 5 },
                    }),
                    timeout: 8000,
                });
                if (!r.ok) throw new Error('HTTP ' + r.status);
                const data = await r.json();
                resposta = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            } else if (provider === 'claude') {
                const Anthropic = require('@anthropic-ai/sdk');
                const client = new Anthropic({ apiKey });
                const r = await client.messages.create({
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: 5,
                    messages: [{ role: 'user', content: TESTE_PROMPT }],
                });
                resposta = r.content[0]?.text?.trim();
            }

            if (resposta) {
                return res.json({ success: true, online: true, provider, mensagem: `${provider} respondendo corretamente.` });
            }
            return res.json({ success: false, online: false, provider, mensagem: 'IA não retornou resposta válida.' });

        } catch (err) {
            const msg = err.message || '';
            let detalhe = 'Erro de conexão com a IA externa.';
            if (msg.includes('401') || msg.includes('invalid') || msg.includes('API key')) detalhe = 'Chave de API inválida ou expirada.';
            else if (msg.includes('429')) detalhe = 'Limite de requisições atingido.';
            else if (msg.includes('403')) detalhe = 'Acesso negado — verifique a chave de API.';
            return res.json({ success: false, online: false, provider, mensagem: detalhe });
        }

    } catch (err) {
        res.status(500).json({ success: false, online: false, mensagem: 'Erro ao testar conexão.' });
    }
}

// ================================================================
// GET /api/ai/config
// Retorna configuração de IA do usuário autenticado
// ================================================================
async function obterConfigIA(req, res) {
    try {
        const config   = await buscarConfigIA(req.usuario.id);
        const provider = config?.provider || 'gen';
        const apiKeys  = config?.apiKeys  || {};
        const nomes    = { gen: 'Gen (IA interna)', openai: 'OpenAI GPT-4o mini', gemini: 'Google Gemini 2.0 Flash', claude: 'Anthropic Claude Haiku' };
        // has_keys: mapa de quais provedores têm chave salva (sem expor as chaves)
        const has_keys = { openai: !!apiKeys.openai, gemini: !!apiKeys.gemini, claude: !!apiKeys.claude };
        // key_previews: primeiros 6 chars + "••••••••" para cada provedor com chave
        const maskKey = (k) => k ? k.slice(0, 6) + '••••••••' : null;
        const key_previews = {
            openai: maskKey(apiKeys.openai),
            gemini: maskKey(apiKeys.gemini),
            claude: maskKey(apiKeys.claude)
        };
        return res.json({ success: true, provider, nome: nomes[provider] || provider, tem_chave: !!config?.apiKey, has_keys, key_previews });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao buscar configuração.' });
    }
}

// ================================================================
// GET /api/ai/status
// Status do módulo IA
// ================================================================
async function status(req, res) {
    const openaiAtivo = !!process.env.OPENAI_API_KEY;

    res.json({
        success: true,
        modulo_ia: 'Gen',
        versao: '1.0.0',
        gen: {
            ativo: true,
            descricao: 'IA interna IGen - Sistema Financeiro Inteligente',
        },
        openai: {
            ativo: openaiAtivo,
            modelo: openaiAtivo ? (process.env.OPENAI_MODEL || 'gpt-4o-mini') : null,
        },
        funcionalidades: {
            chat: true,
            parser_texto: true,
            ocr: true,
            qr_code_pix: true,
            boleto: true,
            deteccao_recorrencia: true,
            aprendizado_categoria: true,
            analise_financeira: true,
        }
    });
}

// ── HELPERS ──────────────────────────────────────────────────────
function formatarFormaPagamento(forma) {
    const mapa = {
        'cartao_credito': 'Cartão de Crédito',
        'cartao_debito': 'Cartão de Débito',
        'pix': 'PIX',
        'dinheiro': 'Dinheiro',
        'transferencia': 'Transferência',
        'boleto': 'Boleto',
    };
    return mapa[forma] || forma || 'Dinheiro';
}

function formatarData(data) {
    if (!data) return '';
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
}

module.exports = {
    chat,
    interpretarDespesa,
    processarArquivoUpload,
    interpretarPIX,
    interpretarBoleto,
    listarRecorrencias,
    confirmarRecorrencia,
    salvarAprendizadoCategoria,
    salvarConfigChave,
    obterConfigIA,
    testarConexaoIA,
    resumoFinanceiro,
    importarExtrato,
    status,
    buscarConfigIA,
    buscarCartaServicos,
    invalidarCacheCartaSessoes,
};
