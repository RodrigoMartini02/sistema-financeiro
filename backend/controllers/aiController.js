'use strict';

const { query } = require('../config/database');
const { classificarCategoria, salvarAprendizado } = require('../services/categoryAI');
const { processarArquivo } = require('../services/ocrService');
const { analisarDocumentoComIA } = require('../services/visionService');
const { processarQRCodePIX, processarTextoPIX } = require('../services/pixReader');
const { parsearBoleto, encontrarLinhaDigitavel } = require('../services/boletoParser');
const { detectarRecorrencias, salvarRecorrencia, buscarRecorrencias } = require('../services/recurrenceDetector');
const { normalizarData, formatarData } = require('../utils/expenseNormalizer');
const { parsearExtratoComIA } = require('../services/extratoParser');
const secureKeyStore = require('../services/secureKeyStore');
const fs = require('fs');

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── CONFIGURAÇÃO ──────────────────────────────────────────────────

async function buscarConfigIA(usuarioId) {
    try {
        const r = await query('SELECT dados_financeiros FROM usuarios WHERE id = $1', [usuarioId]);
        const df = r.rows[0]?.dados_financeiros || {};
        const provider      = df.ia_provider   || null;
        const apiKeys       = secureKeyStore.decryptKeyMap(df.ia_api_keys || {});
        const legacyApiKey  = secureKeyStore.decryptKey(df.ia_api_key);
        const apiKey        = apiKeys[provider] || legacyApiKey || null;
        const instrucoesGen = df.instrucoes_gen || '';
        return { provider, apiKey, apiKeys, instrucoesGen };
    } catch {
        return { provider: null, apiKey: null, apiKeys: {}, instrucoesGen: '' };
    }
}

let _cartaCache = null;
let _cartaExpira = 0;

async function buscarCartaServicos() {
    if (_cartaCache !== null && Date.now() < _cartaExpira) return _cartaCache;
    try {
        const r = await query(`SELECT dados_financeiros FROM usuarios WHERE tipo = 'master' LIMIT 1`);
        _cartaCache  = r.rows[0]?.dados_financeiros?.carta_servicos || '';
        _cartaExpira = Date.now() + 5 * 60 * 1000;
        return _cartaCache;
    } catch {
        return _cartaCache || '';
    }
}

function invalidarCacheCartaSessoes() {
    _cartaCache  = null;
    _cartaExpira = 0;
}

// ── HISTÓRICO PERSISTIDO ──────────────────────────────────────────

async function carregarHistorico(usuarioId) {
    try {
        const r = await query('SELECT historico FROM ia_sessoes WHERE usuario_id = $1', [usuarioId]);
        return r.rows[0]?.historico || [];
    } catch {
        return [];
    }
}

async function salvarHistorico(usuarioId, historico) {
    const limite = historico.slice(-40);
    try {
        await query(
            `INSERT INTO ia_sessoes (usuario_id, historico, atualizado_em)
             VALUES ($1, $2::jsonb, NOW())
             ON CONFLICT (usuario_id) DO UPDATE
             SET historico = $2::jsonb, atualizado_em = NOW()`,
            [usuarioId, JSON.stringify(limite)]
        );
    } catch (err) {
        console.error('Erro ao salvar histórico IA:', err.message);
    }
}

async function limparHistorico(usuarioId) {
    try {
        await query('DELETE FROM ia_sessoes WHERE usuario_id = $1', [usuarioId]);
    } catch {}
}

// ── DADOS FINANCEIROS ─────────────────────────────────────────────

async function buscarCategorias(usuarioId) {
    try {
        const r = await query('SELECT id, nome FROM categorias WHERE usuario_id = $1 ORDER BY nome', [usuarioId]);
        return r.rows;
    } catch {
        return [];
    }
}

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

function perfilFilterSQL(alias, perfilId, paramIndex, usuarioParamIndex) {
    if (!perfilId) return '';
    return ` AND (${alias}.perfil_id = $${paramIndex} OR (${alias}.perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis p WHERE p.id = $${paramIndex} AND p.tipo = 'pessoal' AND p.usuario_id = $${usuarioParamIndex})))`;
}

async function buscarResumoFinanceiro(usuarioId, mes, ano, perfilId = null) {
    const hoje = new Date();
    const m = mes ?? hoje.getMonth();
    const a = ano ?? hoje.getFullYear();

    const EXCLUIR = `NOT (d.recorrente = true AND LOWER(d.forma_pagamento) IN ('credito', 'crédito', 'cred-merpago', 'créd-merpago'))`;
    const pf      = perfilFilterSQL('d', perfilId, 4, 1);
    const params  = perfilId ? [usuarioId, m, a, perfilId] : [usuarioId, m, a];

    try {
        const [despesas, receitas, pagas] = await Promise.all([
            query(
                `SELECT SUM(COALESCE(valor_pago, valor)) as total, categoria_id,
                        (SELECT nome FROM categorias c WHERE c.id = d.categoria_id) as categoria
                 FROM despesas d WHERE d.usuario_id = $1 AND d.mes = $2 AND d.ano = $3
                   AND ${EXCLUIR}${pf} GROUP BY d.categoria_id`,
                params
            ),
            query(
                `SELECT SUM(r.valor) as total FROM receitas r
                 WHERE r.usuario_id = $1 AND r.mes = $2 AND r.ano = $3${perfilFilterSQL('r', perfilId, 4, 1)}`,
                params
            ),
            query(
                `SELECT SUM(COALESCE(valor_pago, valor)) as pago FROM despesas d
                 WHERE d.usuario_id = $1 AND d.mes = $2 AND d.ano = $3 AND d.pago = true AND ${EXCLUIR}${pf}`,
                params
            ),
        ]);

        const totalDespesas = despesas.rows.reduce((s, r) => s + parseFloat(r.total || 0), 0);
        const totalReceitas = parseFloat(receitas.rows[0]?.total || 0);
        const totalPago     = parseFloat(pagas.rows[0]?.pago || 0);

        return {
            mes: m, ano: a,
            totalDespesas:         parseFloat(totalDespesas.toFixed(2)),
            totalDespesasPago:     parseFloat(totalPago.toFixed(2)),
            totalDespesasEmAberto: parseFloat(Math.max(0, totalDespesas - totalPago).toFixed(2)),
            totalReceitas:         parseFloat(totalReceitas.toFixed(2)),
            saldo:                 parseFloat((totalReceitas - totalDespesas).toFixed(2)),
            porCategoria: despesas.rows.map(r => ({
                categoria: r.categoria || 'Sem categoria',
                total: parseFloat(r.total || 0),
            })),
        };
    } catch {
        return { totalDespesas: 0, totalDespesasPago: 0, totalDespesasEmAberto: 0, totalReceitas: 0, saldo: 0, porCategoria: [] };
    }
}

async function buscarDespesasFiltradas(usuarioId, mes, ano, categoria, limite, perfilId = null) {
    const hoje = new Date();
    const m = mes ?? hoje.getMonth();
    const a = ano ?? hoje.getFullYear();
    const n = Math.min(Math.max(parseInt(limite) || 20, 1), 50);

    try {
        const params = perfilId ? [usuarioId, m, a, perfilId] : [usuarioId, m, a];
        const pf = perfilFilterSQL('d', perfilId, 4, 1);

        let sql = `SELECT d.descricao, d.valor, d.forma_pagamento, d.data_vencimento, d.pago, d.recorrente,
                          (SELECT nome FROM categorias c WHERE c.id = d.categoria_id) as categoria
                   FROM despesas d WHERE d.usuario_id = $1 AND d.mes = $2 AND d.ano = $3${pf}`;

        if (categoria) {
            params.push(`%${categoria.toLowerCase()}%`);
            sql += ` AND LOWER((SELECT nome FROM categorias c WHERE c.id = d.categoria_id)) LIKE $${params.length}`;
        }

        sql += ` ORDER BY d.criado_em DESC LIMIT $${params.length + 1}`;
        params.push(n);

        const r = await query(sql, params);
        return r.rows;
    } catch {
        return [];
    }
}

async function buscarContextoAtual(usuarioId, mes, ano, perfilId) {
    const hoje = new Date();
    const m = mes ?? hoje.getMonth();
    const a = ano ?? hoje.getFullYear();

    try {
        let nomePerfilAtivo = 'Pessoal';
        if (perfilId) {
            const p = await query('SELECT nome, razao_social, nome_fantasia, tipo FROM perfis WHERE id = $1', [perfilId]);
            if (p.rows[0]) {
                const pr = p.rows[0];
                nomePerfilAtivo = pr.tipo === 'empresa'
                    ? `Empresa "${pr.nome_fantasia || pr.razao_social || pr.nome}"`
                    : 'Pessoal';
            }
        }

        const [categorias, cartoes, resumo] = await Promise.all([
            buscarCategorias(usuarioId),
            buscarCartoes(usuarioId, perfilId),
            buscarResumoFinanceiro(usuarioId, m, a, perfilId),
        ]);

        const linhas = [
            `Perfil: ${nomePerfilAtivo}`,
            `Período atual: ${MESES[m]}/${a}`,
            `Categorias disponíveis: ${categorias.map(c => c.nome).join(', ') || 'nenhuma'}`,
            `Cartões disponíveis: ${cartoes.map(c => c.nome).join(', ') || 'nenhum'}`,
            `Resumo ${MESES[m]}/${a}: Receitas R$ ${resumo.totalReceitas.toFixed(2)} | Despesas R$ ${resumo.totalDespesas.toFixed(2)} | Saldo R$ ${resumo.saldo.toFixed(2)}`,
        ];

        if (resumo.porCategoria.length > 0) {
            linhas.push(`Top categorias: ${resumo.porCategoria.slice(0, 5).map(c => `${c.categoria} R$ ${c.total.toFixed(2)}`).join(', ')}`);
        }

        return { texto: linhas.join('\n'), categorias, cartoes, mes: m, ano: a, perfilId: perfilId || null };
    } catch {
        return { texto: '', categorias: [], cartoes: [], mes: m, ano: a, perfilId: perfilId || null };
    }
}

// ── DEFINIÇÃO DAS FERRAMENTAS ─────────────────────────────────────

const FERRAMENTAS = [
    {
        name: 'preparar_lancamento_despesa',
        description: 'Prepara uma despesa para conferência do usuário antes de salvar. Use quando o usuário quiser lançar um gasto, compra ou pagamento. Chame somente com descricao, valor e forma_pagamento. Se forma_pagamento for "credito" ou parcelas > 1, nome_cartao também é obrigatório. Se faltar algum campo obrigatório, pergunte todos de uma vez antes de chamar.',
        parameters: {
            type: 'object',
            properties: {
                descricao:       { type: 'string',  description: 'Nome ou descrição da despesa' },
                valor:           { type: 'number',  description: 'Valor em reais (número positivo)' },
                forma_pagamento: { type: 'string',  description: 'Forma de pagamento', enum: ['dinheiro', 'debito', 'pix', 'credito'] },
                vencimento:      { type: 'string',  description: 'Data de vencimento no formato YYYY-MM-DD' },
                data:            { type: 'string',  description: 'Data da compra no formato YYYY-MM-DD. Padrão: hoje' },
                parcelas:        { type: 'integer', description: 'Número de parcelas. Padrão: 1' },
                nome_cartao:     { type: 'string',  description: 'Nome do cartão. Obrigatório se forma_pagamento for credito ou parcelas > 1' },
                recorrente:      { type: 'boolean', description: 'Se é despesa recorrente mensal. Padrão: false' },
            },
            required: ['descricao', 'valor', 'forma_pagamento'],
        },
    },
    {
        name: 'preparar_lancamento_receita',
        description: 'Prepara uma receita para conferência do usuário antes de salvar. Use quando o usuário mencionar entrada de dinheiro, salário, pagamento recebido ou qualquer receita.',
        parameters: {
            type: 'object',
            properties: {
                descricao: { type: 'string', description: 'Descrição da receita' },
                valor:     { type: 'number', description: 'Valor em reais' },
                data:      { type: 'string', description: 'Data do recebimento no formato YYYY-MM-DD' },
            },
            required: ['descricao', 'valor', 'data'],
        },
    },
    {
        name: 'consultar_resumo_financeiro',
        description: 'Consulta o resumo financeiro de um período: receitas, despesas, saldo, valores pagos/em aberto e gastos por categoria.',
        parameters: {
            type: 'object',
            properties: {
                mes: { type: 'integer', description: 'Mês (0=Janeiro, 11=Dezembro). Padrão: mês atual' },
                ano: { type: 'integer', description: 'Ano com 4 dígitos. Padrão: ano atual' },
            },
        },
    },
    {
        name: 'listar_despesas',
        description: 'Lista despesas com filtros opcionais por período, categoria e limite de resultados.',
        parameters: {
            type: 'object',
            properties: {
                mes:       { type: 'integer', description: 'Mês (0-11). Padrão: mês atual' },
                ano:       { type: 'integer', description: 'Ano. Padrão: ano atual' },
                categoria: { type: 'string',  description: 'Filtrar por nome de categoria' },
                limite:    { type: 'integer', description: 'Número máximo de resultados. Padrão: 20' },
            },
        },
    },
    {
        name: 'comparar_competencias',
        description: 'Compara duas competências financeiras. Útil para perguntas como "gastei mais que mês passado?" ou comparações entre meses/anos.',
        parameters: {
            type: 'object',
            properties: {
                mes1: { type: 'integer', description: 'Mês do primeiro período (0-11)' },
                ano1: { type: 'integer', description: 'Ano do primeiro período' },
                mes2: { type: 'integer', description: 'Mês do segundo período (0-11)' },
                ano2: { type: 'integer', description: 'Ano do segundo período' },
            },
            required: ['mes1', 'ano1', 'mes2', 'ano2'],
        },
    },
    {
        name: 'analisar_historico_categoria',
        description: 'Analisa a evolução de gastos em uma categoria ao longo de vários meses para identificar tendências de consumo.',
        parameters: {
            type: 'object',
            properties: {
                categoria: { type: 'string',  description: 'Nome da categoria' },
                meses:     { type: 'integer', description: 'Número de meses para analisar. Padrão: 6' },
            },
            required: ['categoria'],
        },
    },
];

const FERRAMENTAS_OPENAI = FERRAMENTAS.map(f => ({
    type: 'function',
    function: { name: f.name, description: f.description, parameters: f.parameters },
}));

const FERRAMENTAS_CLAUDE = FERRAMENTAS.map(f => ({
    name: f.name, description: f.description, input_schema: f.parameters,
}));

const FERRAMENTAS_GEMINI = [{
    functionDeclarations: FERRAMENTAS.map(f => ({
        name: f.name, description: f.description, parameters: f.parameters,
    })),
}];

// ── EXECUÇÃO DAS FERRAMENTAS ──────────────────────────────────────

async function executarFerramenta(nome, args, ctx) {
    switch (nome) {
        case 'preparar_lancamento_despesa': return executarCriarDespesa(args, ctx);
        case 'preparar_lancamento_receita': return executarCriarReceita(args, ctx);
        case 'consultar_resumo_financeiro': return executarBuscarResumo(args, ctx);
        case 'listar_despesas':             return executarBuscarDespesas(args, ctx);
        case 'comparar_competencias':       return executarCompararPeriodos(args, ctx);
        case 'analisar_historico_categoria': return executarHistoricoCategoria(args, ctx);
        default:                           return { erro: `Ferramenta desconhecida: ${nome}` };
    }
}

async function executarCriarDespesa(args, ctx) {
    const { descricao, valor, forma_pagamento, vencimento, data, parcelas, nome_cartao, recorrente } = args;
    const nParcelas = parseInt(parcelas) || 1;
    const hoje = formatarData(new Date());

    if (forma_pagamento === 'credito' || nParcelas > 1) {
        if (!nome_cartao) {
            if (ctx.cartoes.length === 0) {
                return { sucesso: false, mensagem: 'Nenhum cartão cadastrado. Cadastre um cartão para usar crédito ou parcelamento.' };
            }
            const motivo = forma_pagamento === 'credito' ? 'pagar no crédito' : 'parcelar';
            return { sucesso: false, mensagem: `Para ${motivo}, qual cartão deseja usar? Disponíveis: ${ctx.cartoes.map(c => c.nome).join(', ')}.` };
        }
    }

    let cartao_id = null;
    if (nome_cartao && ctx.cartoes.length > 0) {
        const cartao = ctx.cartoes.find(c =>
            c.nome.toLowerCase().includes(nome_cartao.toLowerCase()) ||
            nome_cartao.toLowerCase().includes(c.nome.toLowerCase())
        );
        if (cartao) cartao_id = cartao.id;
    }

    const instrucoesClassif = [ctx.carta, ctx.instrucoes].filter(Boolean).join('\n\n');
    const categoria   = await classificarCategoria(descricao, ctx.usuarioId, ctx.categorias.map(c => c.nome), instrucoesClassif);
    const categoriaObj = ctx.categorias.find(c => c.nome.toLowerCase() === categoria.toLowerCase());

    return {
        sucesso: true,
        despesa: {
            descricao:       String(descricao).trim(),
            valor:           parseFloat(valor),
            forma_pagamento,
            vencimento:      vencimento ? normalizarData(vencimento) : null,
            data:            data ? normalizarData(data) : hoje,
            parcelas:        nParcelas,
            nome_cartao:     nome_cartao || null,
            cartao_id,
            recorrente:      !!recorrente,
            categoria,
            categoria_id:    categoriaObj?.id || null,
        },
    };
}

async function executarCriarReceita(args, ctx) {
    if (!args.data) {
        return { sucesso: false, mensagem: 'Para registrar a receita, informe a data de recebimento.' };
    }

    return {
        sucesso: true,
        receita: {
            descricao: String(args.descricao).trim(),
            valor:     parseFloat(args.valor),
            data:      normalizarData(args.data),
        },
    };
}

async function executarBuscarResumo(args, ctx) {
    const resumo = await buscarResumoFinanceiro(ctx.usuarioId, args.mes ?? ctx.mes, args.ano ?? ctx.ano, ctx.perfilId);
    return { ...resumo, nomeMes: MESES[resumo.mes] };
}

async function executarBuscarDespesas(args, ctx) {
    const despesas = await buscarDespesasFiltradas(
        ctx.usuarioId, args.mes ?? ctx.mes, args.ano ?? ctx.ano, args.categoria, args.limite, ctx.perfilId
    );
    return { despesas, total: despesas.length, mes: args.mes ?? ctx.mes, ano: args.ano ?? ctx.ano };
}

async function executarCompararPeriodos(args, ctx) {
    const [p1, p2] = await Promise.all([
        buscarResumoFinanceiro(ctx.usuarioId, args.mes1, args.ano1, ctx.perfilId),
        buscarResumoFinanceiro(ctx.usuarioId, args.mes2, args.ano2, ctx.perfilId),
    ]);
    return {
        periodo1: { ...p1, nomeMes: MESES[p1.mes] },
        periodo2: { ...p2, nomeMes: MESES[p2.mes] },
        variacaoDespesas: parseFloat((p2.totalDespesas - p1.totalDespesas).toFixed(2)),
        variacaoReceitas: parseFloat((p2.totalReceitas - p1.totalReceitas).toFixed(2)),
        variacaoSaldo:    parseFloat((p2.saldo - p1.saldo).toFixed(2)),
    };
}

async function executarHistoricoCategoria(args, ctx) {
    const meses = Math.min(parseInt(args.meses) || 6, 36);
    const hoje  = new Date();
    const dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1), 1);

    const EXCLUIR = `NOT (d.recorrente = true AND LOWER(d.forma_pagamento) IN ('credito', 'crédito', 'cred-merpago', 'créd-merpago'))`;
    const pf      = perfilFilterSQL('d', ctx.perfilId, 3, 1);
    const params  = ctx.perfilId
        ? [ctx.usuarioId, dataInicio.toISOString().split('T')[0], ctx.perfilId]
        : [ctx.usuarioId, dataInicio.toISOString().split('T')[0]];

    try {
        const r = await query(
            `SELECT d.mes, d.ano, SUM(COALESCE(d.valor_pago, d.valor)) as total
             FROM despesas d
             WHERE d.usuario_id = $1
               AND (d.ano > EXTRACT(YEAR FROM $2::date) OR (d.ano = EXTRACT(YEAR FROM $2::date) AND d.mes >= EXTRACT(MONTH FROM $2::date) - 1))
               AND ${EXCLUIR}${pf}
               AND LOWER((SELECT nome FROM categorias c WHERE c.id = d.categoria_id)) LIKE $${params.length + 1}
             GROUP BY d.mes, d.ano
             ORDER BY d.ano, d.mes`,
            [...params, `%${args.categoria.toLowerCase()}%`]
        );

        const mapa = new Map(r.rows.map(row => [`${row.ano}-${row.mes}`, parseFloat(row.total || 0)]));
        const historico = [];

        for (let i = meses - 1; i >= 0; i--) {
            const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
            historico.push({
                mes: d.getMonth(), ano: d.getFullYear(), nomeMes: MESES[d.getMonth()],
                total: mapa.get(`${d.getFullYear()}-${d.getMonth()}`) || 0,
            });
        }

        return { categoria: args.categoria, historico };
    } catch {
        return { categoria: args.categoria, historico: [] };
    }
}

// ── ADAPTADORES DE PROVIDER ───────────────────────────────────────

function historicoParaTexto(historico) {
    return historico.map(m => ({ role: m.role, content: m.content }));
}

function historicoParaGemini(historico) {
    return historico.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
    }));
}

async function chamarOpenAICompativel({ apiKey, baseURL, modelo, systemPrompt, workingMsgs }) {
    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey, ...(baseURL && { baseURL }) });

    const msgs = [{ role: 'system', content: systemPrompt }, ...workingMsgs];
    const r = await client.chat.completions.create({
        model: modelo,
        messages: msgs,
        tools: FERRAMENTAS_OPENAI,
        tool_choice: 'auto',
        temperature: 0.3,
        max_tokens: 1024,
    });

    const msg = r.choices[0].message;
    if (msg.tool_calls?.length > 0) {
        return {
            tipo: 'tool_calls',
            toolCalls: msg.tool_calls.map(tc => ({
                id: tc.id, nome: tc.function.name,
                args: JSON.parse(tc.function.arguments || '{}'),
            })),
            _raw: msg,
        };
    }
    return { tipo: 'texto', texto: msg.content || '' };
}

async function chamarClaude({ apiKey, systemPrompt, workingMsgs }) {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const r = await client.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: workingMsgs,
        tools: FERRAMENTAS_CLAUDE,
        temperature: 0.3,
    });

    if (r.stop_reason === 'tool_use') {
        const toolUses = r.content.filter(b => b.type === 'tool_use');
        return {
            tipo: 'tool_calls',
            toolCalls: toolUses.map(t => ({ id: t.id, nome: t.name, args: t.input })),
            _raw: r.content,
        };
    }

    return { tipo: 'texto', texto: r.content.filter(b => b.type === 'text').map(b => b.text).join('') };
}

async function chamarGemini({ apiKey, systemPrompt, workingMsgs }) {
    const fetch = require('node-fetch');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: workingMsgs,
            tools: FERRAMENTAS_GEMINI,
            generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
        }),
        timeout: 20000,
    });

    if (!r.ok) throw new Error(`Gemini HTTP ${r.status}`);
    const data = await r.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const fnCalls = parts.filter(p => p.functionCall);

    if (fnCalls.length > 0) {
        return {
            tipo: 'tool_calls',
            toolCalls: fnCalls.map((p, i) => ({ id: `g${i}`, nome: p.functionCall.name, args: p.functionCall.args || {} })),
            _raw: parts,
        };
    }

    return { tipo: 'texto', texto: parts.filter(p => p.text).map(p => p.text).join('') };
}

function appendToolResults(provider, workingMsgs, resultado, toolResults) {
    if (provider === 'claude') {
        workingMsgs.push({ role: 'assistant', content: resultado._raw });
        workingMsgs.push({
            role: 'user',
            content: toolResults.map(tr => ({
                type: 'tool_result', tool_use_id: tr.id, content: JSON.stringify(tr.resultado),
            })),
        });
    } else if (provider === 'gemini') {
        workingMsgs.push({ role: 'model', parts: resultado._raw });
        workingMsgs.push({
            role: 'user',
            parts: toolResults.map(tr => ({ functionResponse: { name: tr.nome, response: tr.resultado } })),
        });
    } else {
        workingMsgs.push(resultado._raw);
        for (const tr of toolResults) {
            workingMsgs.push({ role: 'tool', tool_call_id: tr.id, content: JSON.stringify(tr.resultado) });
        }
    }
    return workingMsgs;
}

async function chamarProvider(provider, apiKey, systemPrompt, workingMsgs) {
    switch (provider) {
        case 'openai':  return chamarOpenAICompativel({ apiKey, modelo: process.env.OPENAI_MODEL || 'gpt-4o-mini', systemPrompt, workingMsgs });
        case 'groq':    return chamarOpenAICompativel({ apiKey, baseURL: 'https://api.groq.com/openai/v1', modelo: 'llama-3.3-70b-versatile', systemPrompt, workingMsgs });
        case 'claude':  return chamarClaude({ apiKey, systemPrompt, workingMsgs });
        case 'gemini':  return chamarGemini({ apiKey, systemPrompt, workingMsgs });
        default:        throw new Error('provider_nao_configurado');
    }
}

// ── SYSTEM PROMPT ─────────────────────────────────────────────────

function construirSystemPrompt(ctx, carta, instrucoes) {
    const hoje = formatarData(new Date());
    const partes = [
        'Você é Gen, a assistente financeira inteligente do IGen - Sistema Financeiro Inteligente.',
        '',
        'Você ajuda o usuário a registrar despesas e receitas, consultar dados financeiros, comparar períodos e identificar tendências nos gastos.',
        '',
        'REGRAS PARA REGISTRAR DESPESAS:',
        '- Use preparar_lancamento_despesa somente com: descricao, valor e forma_pagamento preenchidos',
        '- Se forma_pagamento for "credito" ou parcelas > 1, nome_cartao também é obrigatório',
        '- Se faltarem campos obrigatórios, pergunte TODOS de uma vez em uma única mensagem',
        '- Nunca invente ou assuma valores que o usuário não informou',
        '',
        'FORMAS DE PAGAMENTO ACEITAS: dinheiro, debito, pix, credito',
        '',
        'REGRAS PARA REGISTRAR RECEITAS:',
        '- Use preparar_lancamento_receita com descricao, valor e data',
        '',
        'REGRAS GERAIS:',
        '- Responda sempre em português brasileiro',
        '- Seja objetivo e natural — é uma conversa, não um formulário',
        '- Ao apresentar valores monetários, use o formato R$ X.XXX,XX',
        '- Após registrar, mencione brevemente se o gasto está acima do habitual (consulte dados se necessário)',
        `- Data de hoje: ${hoje}`,
    ];

    if (ctx.texto) {
        partes.push('', 'CONTEXTO DO USUÁRIO:', ctx.texto);
    }

    if (instrucoes) {
        partes.push('', 'INSTRUÇÕES PERSONALIZADAS (prioridade máxima):', instrucoes);
    }

    if (carta) {
        partes.push('', carta);
    }

    return partes.join('\n');
}

function isSaudacaoSimples(texto) {
    return /^(oi|ol[aá]|bom dia|boa tarde|boa noite|e ai|e aí|opa|hello|hi)[!.?\s]*$/i.test((texto || '').trim());
}

function isInicioCadastroSimples(texto) {
    return /^(quero\s+)?cadastrar\s+(uma\s+)?(despesa|receita)$|^registrar\s+(uma\s+)?(despesa|receita)$|^nova\s+(despesa|receita)$/i.test((texto || '').trim());
}

// ── CHAT ──────────────────────────────────────────────────────────

async function handleConversation(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const { mensagem, limpar_sessao, mes_atual, ano_atual, perfil_id } = req.body;

        if (!mensagem?.trim()) {
            return res.status(400).json({ success: false, message: 'Mensagem não pode estar vazia.' });
        }

        if (limpar_sessao) {
            await limparHistorico(usuarioId);
            if (mensagem === '_reset_') {
                return res.json({ success: true, resposta: 'Conversa reiniciada.', acao: 'sessao_limpa' });
            }
        }

        if (isSaudacaoSimples(mensagem)) {
            return res.json({
                success: true,
                resposta: 'Oi! Estou por aqui. Você pode cadastrar uma despesa, registrar uma receita ou consultar seu resumo financeiro.',
                acao: 'saudacao',
            });
        }

        if (isInicioCadastroSimples(mensagem)) {
            return res.json({
                success: true,
                resposta: 'Vamos fazer pelo fluxo guiado.',
                acao: /receita/i.test(mensagem) ? 'iniciar_receita' : 'iniciar_despesa',
            });
        }

        const providerConfig = await buscarConfigIA(usuarioId);

        if (!providerConfig.provider || providerConfig.provider === 'gen') {
            return res.json({
                success: true,
                resposta: 'Para usar o assistente, configure uma chave de IA gratuita nas configurações. O **Google Gemini** é gratuito e funciona muito bem em português.',
                acao: 'sem_provider',
            });
        }

        if (!providerConfig.apiKey) {
            return res.json({
                success: true,
                resposta: 'Chave de API não encontrada para esse provedor. Acesse as configurações e salve sua chave novamente.',
                acao: 'erro_provider',
            });
        }

        const historico = await carregarHistorico(usuarioId);
        const ctx = await buscarContextoAtual(usuarioId, mes_atual, ano_atual, perfil_id || null);
        ctx.usuarioId  = usuarioId;
        ctx.instrucoes = providerConfig.instrucoesGen || '';
        ctx.carta      = await buscarCartaServicos();

        const systemPrompt = construirSystemPrompt(ctx, ctx.carta, ctx.instrucoes);

        historico.push({ role: 'user', content: mensagem });

        let workingMsgs = providerConfig.provider === 'gemini'
            ? historicoParaGemini(historico)
            : historicoParaTexto(historico);

        let pendingAction = null;
        const MAX_ITER = 6;

        for (let i = 0; i < MAX_ITER; i++) {
            let resultado;
            try {
                resultado = await chamarProvider(providerConfig.provider, providerConfig.apiKey, systemPrompt, workingMsgs);
            } catch (err) {
                const msg = (err.message || '').toLowerCase();
                const status = err.status || err.statusCode || 0;
                if (msg === 'provider_nao_configurado') {
                    return res.json({ success: true, resposta: 'Nenhum provedor de IA configurado. Acesse as configurações para adicionar sua chave.', acao: 'sem_provider' });
                }
                if (status === 401 || msg.includes('401') || msg.includes('invalid_api_key') || msg.includes('api key') || msg.includes('api_key') || msg.includes('authentication') || msg.includes('unauthorized') || msg.includes('x-api-key')) {
                    return res.json({ success: true, resposta: 'Chave de API inválida ou expirada. Verifique nas configurações e salve a chave novamente.', acao: 'erro_provider' });
                }
                if (status === 429 || msg.includes('429') || msg.includes('rate limit') || msg.includes('too many')) {
                    return res.json({ success: true, resposta: `Limite de requisições do provedor ${providerConfig.provider} atingido. Aguarde alguns instantes e tente novamente.`, acao: 'erro_provider' });
                }
                throw err;
            }

            if (resultado.tipo === 'texto') {
                historico.push({ role: 'assistant', content: resultado.texto });
                await salvarHistorico(usuarioId, historico);

                const respJson = { success: true, resposta: resultado.texto };
                if (pendingAction) {
                    respJson.acao               = `confirmar_${pendingAction.tipo}`;
                    respJson[pendingAction.tipo] = pendingAction.dados;
                }
                return res.json(respJson);
            }

            const toolResults = [];
            for (const tc of resultado.toolCalls) {
                const toolRes = await executarFerramenta(tc.nome, tc.args, ctx);
                toolResults.push({ id: tc.id, nome: tc.nome, resultado: toolRes });

                if ((tc.nome === 'preparar_lancamento_despesa' || tc.nome === 'preparar_lancamento_receita') && toolRes.sucesso && !pendingAction) {
                    pendingAction = {
                        tipo:  tc.nome === 'preparar_lancamento_despesa' ? 'despesa' : 'receita',
                        dados: toolRes.despesa || toolRes.receita,
                    };
                }
            }

            workingMsgs = appendToolResults(providerConfig.provider, workingMsgs, resultado, toolResults);
        }

        return res.json({ success: true, resposta: 'Não consegui processar sua solicitação. Tente novamente.' });

    } catch (err) {
        console.error('Erro no chat IA:', err);
        res.status(500).json({ success: false, message: 'Erro interno do assistente.' });
    }
}

// ── INTERPRETAR DESPESA ───────────────────────────────────────────

async function parseExpenseDraft(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const { texto }  = req.body;

        if (!texto?.trim()) {
            return res.status(400).json({ success: false, message: 'Texto da despesa não informado.' });
        }

        const providerConfig    = await buscarConfigIA(usuarioId);
        const cartaServicos     = await buscarCartaServicos();
        const categorias        = await buscarCategorias(usuarioId);
        const nomesCategorias   = categorias.map(c => c.nome);
        const instrucoesClassif = [cartaServicos, providerConfig.instrucoesGen].filter(Boolean).join('\n\n');

        const categoria    = await classificarCategoria(texto, usuarioId, nomesCategorias, instrucoesClassif);
        const categoriaObj = categorias.find(c => c.nome.toLowerCase() === categoria.toLowerCase());

        return res.json({
            success: true,
            dados: { descricao: texto.trim(), categoria, categoria_id: categoriaObj?.id || null },
            campos_faltando: ['valor', 'forma_pagamento'],
            completo: false,
        });

    } catch (err) {
        console.error('Erro ao interpretar despesa:', err);
        res.status(500).json({ success: false, message: 'Erro ao interpretar texto.' });
    }
}

// ── ARQUIVO ───────────────────────────────────────────────────────

async function analyzeFinancialDocument(req, res) {
    const filePath = req.file?.path;

    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });
        }

        if (req.file.size > 10 * 1024 * 1024) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ success: false, message: 'Arquivo muito grande (máx 10MB).' });
        }

        const providerConfig = await buscarConfigIA(req.usuario.id);
        const visionResult   = await analisarDocumentoComIA(filePath, req.file.mimetype, providerConfig);

        let resultado;
        if (visionResult) {
            resultado = { sucesso: true, ...visionResult };
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
            resultado = await processarArquivo(filePath, req.file.mimetype);
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

        return res.json({
            success: true,
            fonte: visionResult ? 'vision_ia' : 'ocr',
            arquivo: { nome: req.file.originalname, tipo: req.file.mimetype, tamanho: req.file.size },
            resultado,
            despesa_sugerida: {
                descricao:  resultado.descricao || resultado.empresa || 'Documento financeiro',
                valor:      resultado.valor || null,
                vencimento: resultado.vencimento || null,
                data:       resultado.data || formatarData(new Date()),
                parcelas:   1,
                categoria:  resultado.categoria_sugerida || null,
            },
        });

    } catch (err) {
        console.error('Erro ao processar arquivo:', err);
        res.status(500).json({ success: false, message: 'Erro ao processar arquivo.' });
    } finally {
        if (filePath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch {}
        }
    }
}

// ── PIX ───────────────────────────────────────────────────────────

async function parsePixPayload(req, res) {
    const filePath = req.file?.path;
    try {
        let resultado;
        if (req.file) {
            resultado = await processarQRCodePIX(req.file.path);
        } else if (req.body.payload) {
            resultado = processarTextoPIX(req.body.payload);
        } else {
            return res.status(400).json({ success: false, message: 'Envie uma imagem com QR Code ou o payload PIX em texto.' });
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

// ── BOLETO ────────────────────────────────────────────────────────

async function parseBoletoPayload(req, res) {
    try {
        const { linha_digitavel, texto } = req.body;
        const linha = linha_digitavel || (texto ? encontrarLinhaDigitavel(texto) : null);

        if (!linha) {
            return res.status(400).json({ success: false, message: 'Informe a linha digitável do boleto.' });
        }

        return res.json({ success: true, ...parsearBoleto(linha) });
    } catch (err) {
        console.error('Erro ao interpretar boleto:', err);
        res.status(500).json({ success: false, message: 'Erro ao processar boleto.' });
    }
}

// ── RECORRÊNCIAS ──────────────────────────────────────────────────

async function listRecurrenceInsights(req, res) {
    try {
        const usuarioId = req.usuario.id;
        if (req.query.detectar === 'true') {
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

async function confirmRecurrenceInsight(req, res) {
    try {
        if (!req.body.descricao || !req.body.valor_medio) {
            return res.status(400).json({ success: false, message: 'Dados incompletos.' });
        }
        const ok = await salvarRecorrencia(req.usuario.id, req.body);
        return res.json({ success: ok, message: ok ? 'Recorrência salva!' : 'Erro ao salvar.' });
    } catch (err) {
        console.error('Erro ao confirmar recorrência:', err);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
}

// ── APRENDIZADO ───────────────────────────────────────────────────

async function saveCategoryLearning(req, res) {
    try {
        const { texto, categoria } = req.body;
        if (!texto || !categoria) {
            return res.status(400).json({ success: false, message: 'texto e categoria são obrigatórios.' });
        }
        await salvarAprendizado(req.usuario.id, texto, categoria);
        return res.json({ success: true, message: 'Aprendizado salvo!' });
    } catch (err) {
        console.error('Erro ao salvar aprendizado:', err);
        res.status(500).json({ success: false, message: 'Erro ao salvar aprendizado.' });
    }
}

// ── CONFIGURAÇÃO DE PROVIDER ──────────────────────────────────────

async function saveProviderConfiguration(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const { provider, api_key } = req.body;

        const provedoresValidos = ['gen', 'openai', 'gemini', 'claude', 'groq'];
        if (!provider || !provedoresValidos.includes(provider)) {
            return res.status(400).json({ success: false, message: 'Provedor inválido. Use: gen, openai, gemini, claude ou groq.' });
        }

        const current    = await buscarConfigIA(usuarioId);
        const apiKeys    = current.apiKeys || {};
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
            apiKeys[provider] = api_key;
        }

        const storedApiKeys = secureKeyStore.encryptKeyMap(apiKeys);
        const storedApiKey  = provider === 'gen' ? null : secureKeyStore.encryptKey(chaveAtual);

        await query(
            `UPDATE usuarios SET dados_financeiros = COALESCE(dados_financeiros, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
            [JSON.stringify({ ia_provider: provider, ia_api_key: storedApiKey, ia_api_keys: storedApiKeys }), usuarioId]
        );

        const nomes = {
            gen: 'Gen aguardando provedor', openai: 'OpenAI GPT-4o mini',
            gemini: 'Google Gemini 2.0 Flash', claude: 'Anthropic Claude Sonnet',
            groq: 'Groq Llama 3.3 70B',
        };
        return res.json({ success: true, message: `Configuração salva! Usando: ${nomes[provider]}` });

    } catch (err) {
        console.error('Erro ao salvar config IA:', err);
        res.status(500).json({ success: false, message: 'Erro ao salvar configuração.' });
    }
}

async function getProviderConfiguration(req, res) {
    try {
        const config   = await buscarConfigIA(req.usuario.id);
        const provider = config?.provider || 'gen';
        const apiKeys  = config?.apiKeys  || {};
        const nomes    = {
            gen: 'Gen aguardando provedor', openai: 'OpenAI GPT-4o mini',
            gemini: 'Google Gemini 2.0 Flash', claude: 'Anthropic Claude Sonnet',
            groq: 'Groq Llama 3.3 70B',
        };
        const has_keys     = { openai: !!apiKeys.openai, gemini: !!apiKeys.gemini, claude: !!apiKeys.claude, groq: !!apiKeys.groq };
        const maskKey      = k => k ? k.slice(0, 6) + '********' : null;
        const key_previews = { openai: maskKey(apiKeys.openai), gemini: maskKey(apiKeys.gemini), claude: maskKey(apiKeys.claude), groq: maskKey(apiKeys.groq) };

        return res.json({ success: true, provider, nome: nomes[provider] || provider, tem_chave: !!config?.apiKey, has_keys, key_previews });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao buscar configuração.' });
    }
}

async function validateProviderConfiguration(req, res) {
    try {
        const config   = await buscarConfigIA(req.usuario.id);
        const provider = config?.provider || 'gen';

        if (!provider || provider === 'gen') {
            return res.json({ success: true, online: false, provider: 'gen', mensagem: 'Configure um provedor para ativar o chat inteligente.' });
        }

        const apiKey = config?.apiKey;
        if (!apiKey) {
            return res.json({ success: false, online: false, provider, mensagem: 'Nenhuma chave de API configurada.' });
        }

        // Valida apenas o formato da chave — sem chamar a API para não consumir quota
        const formatosValidos = {
            openai:  k => k.startsWith('sk-'),
            groq:    k => k.startsWith('gsk_'),
            claude:  k => k.startsWith('sk-ant-'),
            gemini:  k => k.length > 10,
        };
        const valida = formatosValidos[provider] ? formatosValidos[provider](apiKey) : true;
        if (!valida) {
            return res.json({ success: false, online: false, provider, mensagem: 'Formato de chave inválido.' });
        }

        return res.json({ success: true, online: true, provider, mensagem: `${provider} configurado.` });

    } catch (err) {
        res.status(500).json({ success: false, online: false, mensagem: 'Erro ao testar conexão.' });
    }
}

// ── RESUMO FINANCEIRO ─────────────────────────────────────────────

async function getAssistantFinancialOverview(req, res) {
    try {
        const usuarioId = req.usuario.id;
        const hoje      = new Date();
        const mes       = parseInt(req.query.mes ?? hoje.getMonth());
        const ano       = parseInt(req.query.ano ?? hoje.getFullYear());
        const perfilId  = req.query.perfil_id ? parseInt(req.query.perfil_id) : null;

        const resumo    = await buscarResumoFinanceiro(usuarioId, mes, ano, perfilId);

        const dataHoje = formatarData(hoje);
        const data7d   = formatarData(new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000));
        const pf       = perfilFilterSQL('d', perfilId, 4, 1);
        const paramsProximas = perfilId
            ? [usuarioId, dataHoje, data7d, perfilId]
            : [usuarioId, dataHoje, data7d];
        const proximas = await query(
            `SELECT descricao, COALESCE(valor_pago, valor) as valor, data_vencimento
             FROM despesas d WHERE usuario_id = $1 AND pago = false
               AND data_vencimento BETWEEN $2 AND $3${pf}
             ORDER BY data_vencimento ASC LIMIT 5`,
            paramsProximas
        );

        let mesAnt = mes - 1, anoAnt = ano;
        if (mesAnt < 0) { mesAnt = 11; anoAnt--; }
        const resumoAnt = await buscarResumoFinanceiro(usuarioId, mesAnt, anoAnt, perfilId);

        const dfUser     = await query('SELECT dados_financeiros FROM usuarios WHERE id = $1', [usuarioId]);
        const dadosFinanc = dfUser.rows[0]?.dados_financeiros || {};
        const metas       = dadosFinanc.metas     || [];
        const orcamentos  = dadosFinanc.orcamentos || [];

        const alertasOrcamento = orcamentos.map(o => {
            const catGastos = resumo.porCategoria.find(c => c.categoria?.toLowerCase() === o.categoria.toLowerCase());
            const gasto = catGastos ? catGastos.total : 0;
            return { categoria: o.categoria, limite: o.limite, gasto, excedido: gasto > o.limite, percentual: o.limite > 0 ? Math.round(gasto / o.limite * 100) : 0 };
        }).filter(a => a.percentual >= 70);

        return res.json({
            success: true, mes, ano, resumo,
            resumoMesAnterior: { mes: mesAnt, ano: anoAnt, totalDespesas: resumoAnt.totalDespesas },
            proximasVencer: proximas.rows.map(r => ({ descricao: r.descricao, valor: parseFloat(r.valor), vencimento: r.data_vencimento })),
            metas,
            alertasOrcamento,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao buscar resumo.' });
    }
}

// ── EXTRATO ───────────────────────────────────────────────────────

async function importStatementWithAI(req, res) {
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
        const transacoes     = await parsearExtratoComIA(texto, providerConfig);

        if (!transacoes.length) {
            return res.json({ success: true, transacoes: [], mensagem: 'Nenhuma transação encontrada no extrato.' });
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

// ── STATUS ────────────────────────────────────────────────────────

async function getAssistantHealth(req, res) {
    res.json({
        success: true,
        modulo_ia: 'Gen Finance Assistant',
        versao: '2.1.0',
        arquitetura: 'tool-calling com adaptadores de provedores e confirmacao antes de gravar',
        providers_suportados: ['openai', 'gemini', 'claude', 'groq'],
        endpoints_recomendados: {
            conversa: '/api/ai/conversation',
            provedores: '/api/ai/providers',
            documentos: '/api/ai/documents',
            resumo: '/api/ai/financial-summary',
        },
        funcionalidades: {
            chat: true,
            tool_use: true,
            historico_persistido: true,
            parser_texto: true,
            ocr: true,
            qr_code_pix: true,
            boleto: true,
            deteccao_recorrencia: true,
            aprendizado_categoria: true,
            analise_financeira: true,
        },
    });
}

module.exports = {
    handleConversation,
    parseExpenseDraft,
    analyzeFinancialDocument,
    parsePixPayload,
    parseBoletoPayload,
    listRecurrenceInsights,
    confirmRecurrenceInsight,
    saveCategoryLearning,
    saveProviderConfiguration,
    getProviderConfiguration,
    validateProviderConfiguration,
    getAssistantFinancialOverview,
    importStatementWithAI,
    getAssistantHealth,
    chat: handleConversation,
    interpretarDespesa: parseExpenseDraft,
    processarArquivoUpload: analyzeFinancialDocument,
    interpretarPIX: parsePixPayload,
    interpretarBoleto: parseBoletoPayload,
    listarRecorrencias: listRecurrenceInsights,
    confirmarRecorrencia: confirmRecurrenceInsight,
    salvarAprendizadoCategoria: saveCategoryLearning,
    salvarConfigChave: saveProviderConfiguration,
    obterConfigIA: getProviderConfiguration,
    testarConexaoIA: validateProviderConfiguration,
    resumoFinanceiro: getAssistantFinancialOverview,
    importarExtrato: importStatementWithAI,
    status: getAssistantHealth,
    buscarConfigIA,
    buscarCartaServicos,
    invalidarCacheCartaSessoes,
};
