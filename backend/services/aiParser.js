// ================================================================
// AI PARSER - Interpreta linguagem natural para despesas
// Usa OpenAI GPT se OPENAI_API_KEY disponível, caso contrário
// utiliza a Gen (IA interna do Fin-Gerence)
// ================================================================

const { normalizarDespesa, normalizarValor, normalizarFormaPagamento,
    normalizarData, inferirCategoria } = require('../utils/expenseNormalizer');

function extrairRegrasCategoriaParaGen(texto) {
    if (!texto) return [];
    const regras = [];
    const patterns = [
        /palavras?\s+como\s+([\s\S]+?)\s+deve[nm]?\s+ser\s+classificad[ao]s?\s+como\s+categor[ií]a\s+([\w\sÀ-ÿ]+?)(?:\.|,|$|\n)/gi,
        /classifique\s+([\s\S]+?)\s+como\s+(?:categor[ií]a\s+)?([\w\sÀ-ÿ]+?)(?:\.|,|$|\n)/gi,
        /([\s\S]+?)\s+s[ãa]o\s+(?:da\s+)?categor[ií]a\s+([\w\sÀ-ÿ]+?)(?:\.|,|$|\n)/gi,
        /([\s\S]+?)\s+deve[nm]?\s+ser\s+(?:da\s+)?categor[ií]a\s+([\w\sÀ-ÿ]+?)(?:\.|,|$|\n)/gi,
    ];
    for (const pattern of patterns) {
        let m;
        while ((m = pattern.exec(texto)) !== null) {
            const palavrasRaw = m[1];
            const categoria = m[2].trim().replace(/\s+/g, ' ');
            const palavras = [];
            const quotedMatches = [...palavrasRaw.matchAll(/['"""''`]([^'"""''`]+)['"""''`]/g)];
            for (const qm of quotedMatches) palavras.push(qm[1].toLowerCase().trim());
            if (palavras.length === 0) {
                for (const p of palavrasRaw.split(/,|\s+e\s+/i)) {
                    const limpo = p.replace(/['"""''`]/g, '').trim().toLowerCase();
                    if (limpo.length > 1) palavras.push(limpo);
                }
            }
            if (palavras.length > 0 && categoria.length > 1) regras.push({ palavras, categoria });
        }
    }
    return regras;
}

// Lazy-load OpenAI (só inicializa se a chave existir)
let openaiClient = null;
function getOpenAI() {
    if (!process.env.OPENAI_API_KEY) return null;
    if (!openaiClient) {
        const OpenAI = require('openai');
        openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return openaiClient;
}

// ── SISTEMA PROMPT ──────────────────────────────────────────────
const SYSTEM_PROMPT = `Você é um assistente financeiro brasileiro especialista em interpretar despesas em linguagem natural.

Sua tarefa é extrair informações de despesas a partir de texto em português e retornar APENAS um JSON válido.

Campos a extrair:
- descricao: nome/descrição da despesa (string)
- valor: valor numérico em reais (number, sem R$)
- categoria: uma das categorias: Alimentação, Transporte, Moradia, Saúde, Educação, Lazer, Assinaturas, Vestuário, Finanças, Outros
- forma_pagamento: cartao_credito, cartao_debito, pix, dinheiro, transferencia, boleto
- vencimento: data de vencimento no formato YYYY-MM-DD ou null
- parcelas: número de parcelas (number, padrão 1)
- data: data da despesa no formato YYYY-MM-DD (padrão: hoje)

REGRA CRÍTICA — VÍRGULA COMO DELIMITADOR DE DESCRIÇÃO (prioridade máxima):
- Quando a primeira palavra do texto é seguida de vírgula, essa primeira palavra (antes da vírgula) é OBRIGATORIAMENTE a descrição do lançamento.
- Ignore qualquer outra heurística de extração de descrição quando houver vírgula após a primeira palavra.
- Exemplos OBRIGATÓRIOS:
  * "Hiper, 150 de mercado no pix" → descricao="Hiper", valor=150, forma_pagamento="pix"
  * "Posto, 80 gasolina débito" → descricao="Posto", valor=80, forma_pagamento="cartao_debito"
  * "Netflix, 55,90 no cartão" → descricao="Netflix", valor=55.90, forma_pagamento="cartao_credito"
- NUNCA inclua o texto após a vírgula na descrição quando essa regra se aplicar.

Demais regras:
- Para "cartão" sem especificar = cartao_credito
- Para datas relativas como "dia 15" use o mês atual
- Para "amanhã", "hoje" calcule a data real baseado em hoje
- Se algum campo não foi mencionado, use null (exceto parcelas que é 1)
- Retorne APENAS o JSON, sem texto adicional

Exemplos:
Input: "paguei 120 de internet da vivo no cartão vence dia 15"
Output: {"descricao":"Internet Vivo","valor":120,"categoria":"Moradia","forma_pagamento":"cartao_credito","vencimento":"DATA_DIA_15","parcelas":1,"data":"HOJE"}

Input: "netflix 55,90 debito todo mes"
Output: {"descricao":"Netflix","valor":55.90,"categoria":"Assinaturas","forma_pagamento":"cartao_debito","vencimento":null,"parcelas":1,"data":"HOJE"}

Input: "Hiper, 150 de mercado no pix"
Output: {"descricao":"Hiper","valor":150,"categoria":"Alimentação","forma_pagamento":"pix","vencimento":null,"parcelas":1,"data":"HOJE"}`;

// ── PARSER COM OPENAI ────────────────────────────────────────────
async function parsearComOpenAI(texto, contextoConversa = [], apiKeyOverride, ctxSistema = '', cartaBase = '', instrucoesUsuario = '') {
    let openai = apiKeyOverride
        ? (() => { const OpenAI = require('openai'); return new OpenAI({ apiKey: apiKeyOverride }); })()
        : getOpenAI();
    if (!openai) throw new Error('OpenAI não configurado');

    const hoje = new Date().toISOString().split('T')[0];
    const ctxExtra = ctxSistema ? `\n\nContexto do sistema do usuário:\n${ctxSistema}` : '';
    const instrucoesPrio = instrucoesUsuario
        ? `\n\n=== INSTRUÇÕES PERSONALIZADAS DO USUÁRIO (PRIORIDADE MÁXIMA — sobrepõem qualquer outra regra) ===\n${instrucoesUsuario}\n=== FIM DAS INSTRUÇÕES PERSONALIZADAS ===`
        : '';
    const systemWithDate = `${SYSTEM_PROMPT}\n\nData de hoje: ${hoje}${ctxExtra}${instrucoesPrio}${cartaBase ? '\n\n---\n' + cartaBase : ''}`;

    const messages = [
        { role: 'system', content: systemWithDate },
        ...contextoConversa.slice(-6),
        { role: 'user', content: texto }
    ];

    const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages,
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    return JSON.parse(content);
}

// ── PARSER COM GEMINI ─────────────────────────────────────────────
async function parsearComGemini(texto, contextoConversa = [], apiKey, ctxSistema = '', cartaBase = '', instrucoesUsuario = '') {
    if (!apiKey) throw new Error('Gemini API key não configurada');
    const fetch = require('node-fetch');
    const hoje = new Date().toISOString().split('T')[0];
    const ctxExtra = ctxSistema ? `\n\nContexto do sistema do usuário:\n${ctxSistema}` : '';
    const instrucoesPrio = instrucoesUsuario
        ? `\n\n=== INSTRUÇÕES PERSONALIZADAS DO USUÁRIO (PRIORIDADE MÁXIMA — sobrepõem qualquer outra regra) ===\n${instrucoesUsuario}\n=== FIM DAS INSTRUÇÕES PERSONALIZADAS ===`
        : '';
    const prompt = `${SYSTEM_PROMPT}\n\nData de hoje: ${hoje}${ctxExtra}${instrucoesPrio}${cartaBase ? '\n\n---\n' + cartaBase : ''}\n\nTexto do usuário: ${texto}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 500, responseMimeType: 'application/json' }
    };

    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('Gemini HTTP ' + r.status);
    const data = await r.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('Resposta vazia do Gemini');
    return JSON.parse(content);
}

// ── PARSER COM CLAUDE ─────────────────────────────────────────────
async function parsearComClaude(texto, contextoConversa = [], apiKey, ctxSistema = '', cartaBase = '', instrucoesUsuario = '') {
    if (!apiKey) throw new Error('Anthropic API key não configurada');
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const hoje = new Date().toISOString().split('T')[0];
    const ctxExtra = ctxSistema ? `\n\nContexto do sistema do usuário:\n${ctxSistema}` : '';
    const instrucoesPrio = instrucoesUsuario
        ? `\n\n=== INSTRUÇÕES PERSONALIZADAS DO USUÁRIO (PRIORIDADE MÁXIMA — sobrepõem qualquer outra regra) ===\n${instrucoesUsuario}\n=== FIM DAS INSTRUÇÕES PERSONALIZADAS ===`
        : '';

    const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: `${SYSTEM_PROMPT}\n\nData de hoje: ${hoje}${ctxExtra}${instrucoesPrio}${cartaBase ? '\n\n---\n' + cartaBase : ''}\n\nResponda APENAS com JSON válido.`,
        messages: [{ role: 'user', content: texto }]
    });

    const content = response.content[0]?.text;
    if (!content) throw new Error('Resposta vazia do Claude');
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON não encontrado na resposta do Claude');
    return JSON.parse(jsonMatch[0]);
}

// ── GEN — PARSER INTERNO (fallback) ─────────────────────────────
// Bancos conhecidos para resolução de nome de cartão
const BANCOS_CONHECIDOS = [
    'nubank', 'nu', 'itaú', 'itau', 'bradesco', 'santander', 'inter',
    'caixa', 'bb', 'banco do brasil', 'sicoob', 'sicredi', 'c6', 'neon',
    'next', 'original', 'pan', 'safra', 'modal', 'bmg', 'mercado pago',
    'picpay', 'pagbank', 'will bank', 'xp', 'rico', 'clear'
];

function parsearComGen(texto, cartaBase = '', instrucoesUsuario = '') {
    const lower = texto.toLowerCase();
    const result = {
        descricao: null,
        valor: null,
        categoria: null,
        forma_pagamento: null,
        nome_cartao: null,
        vencimento: null,
        parcelas: 1,
        data: new Date().toISOString().split('T')[0],
        ja_pago: false,
        recorrente: false
    };

    // ── Extração de VALOR ──────────────────────────────────────
    // Padrões: R$ 120,50 | 120,50 | 120.50 | 120 reais
    const valorPatterns = [
        /R\$\s*([\d.,]+)/i,
        /([\d.,]+)\s*reais?/i,
        /(?:paguei|gastei|comprei|cobrado|valor\s+de?)\s+(?:R\$\s*)?([\d.,]+)/i,
        /(?:de|no valor de)\s+R?\$?\s*([\d.,]+)/i,
        /\b(\d{1,4}(?:[.,]\d{2})?)\b/,
    ];

    for (const pattern of valorPatterns) {
        const m = lower.match(pattern);
        if (m) {
            const v = normalizarValor(m[1]);
            if (v && v > 0) {
                result.valor = v;
                break;
            }
        }
    }

    // ── Já pago ────────────────────────────────────────────────
    if (/(?:já\s+)?paguei|já\s+pago|quitei|quitado|pago\s+hoje/i.test(texto)) {
        result.ja_pago = true;
    }

    // ── Recorrente ────────────────────────────────────────────
    if (/todo\s+m[eê]s|mensal|recorrente|fixo|mensalidade|sempre|toda\s+semana|semanal/i.test(texto)) {
        result.recorrente = true;
    }

    // ── Extração de FORMA DE PAGAMENTO + NOME DO CARTÃO ───────
    if (/cartão\s+de?\s+crédito|cartao\s+credito|crédito|credito/i.test(texto)) {
        result.forma_pagamento = 'cartao_credito';
    } else if (/cartão\s+de?\s+débito|cartao\s+debito|débito|debito/i.test(texto)) {
        result.forma_pagamento = 'cartao_debito';
    } else if (/\bpix\b/i.test(texto)) {
        result.forma_pagamento = 'pix';
    } else if (/\bcartão\b|\bcartao\b/i.test(texto)) {
        result.forma_pagamento = 'cartao_credito';
    } else if (/\bdinheiro\b|\bespécie\b|\bespecie\b/i.test(texto)) {
        result.forma_pagamento = 'dinheiro';
    } else if (/\btransferência\b|\btransferencia\b|\bted\b|\bdoc\b/i.test(texto)) {
        result.forma_pagamento = 'transferencia';
    } else if (/\bboleto\b/i.test(texto)) {
        result.forma_pagamento = 'boleto';
    }

    // ── Nome do cartão/banco mencionado ───────────────────────
    for (const banco of BANCOS_CONHECIDOS) {
        if (lower.includes(banco)) {
            result.nome_cartao = banco;
            // Se mencionou banco sem forma explícita, assume crédito
            if (!result.forma_pagamento) result.forma_pagamento = 'cartao_credito';
            break;
        }
    }

    // ── Extração de VENCIMENTO ───────────────────────────────
    // "vence dia 15", "vencimento 15", "dia 15", "15/03"
    const vencPatterns = [
        /vence(?:mento)?\s+(?:dia\s+)?(\d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?)/i,
        /(?:dia|vencimento)\s+(\d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?)/i,
    ];

    for (const pattern of vencPatterns) {
        const m = texto.match(pattern);
        if (m) {
            result.vencimento = normalizarData(m[1]);
            break;
        }
    }

    // ── Extração de PARCELAS ────────────────────────────────
    const parcelasM = texto.match(/(\d+)\s*[xX×]\s*(?:de\s+)?[\d.,]+/);
    if (parcelasM) {
        result.parcelas = parseInt(parcelasM[1]);
    } else {
        const parM2 = texto.match(/(?:em\s+)?(\d+)\s*parcelas?/i);
        if (parM2) result.parcelas = parseInt(parM2[1]);
    }

    // ── Extração de DESCRIÇÃO ────────────────────────────────
    // REGRA PRIORITÁRIA: Se a primeira palavra é seguida de vírgula, ela É a descrição
    const virgulaPrioMatch = texto.match(/^([\w\u00C0-\u017F]+),\s*/);
    let descricaoFixadaPorVirgula = false;
    if (virgulaPrioMatch) {
        result.descricao = virgulaPrioMatch[1].charAt(0).toUpperCase() + virgulaPrioMatch[1].slice(1);
        descricaoFixadaPorVirgula = true;
    }

    // Remove palavras-chave e extrai o restante como descrição (apenas se a regra da vírgula não se aplicou)
    let descricao = texto
        .replace(/R\$\s*[\d.,]+/gi, '')
        .replace(/[\d.,]+\s*reais?/gi, '')
        .replace(/(?:já\s+)?paguei|já\s+pago|quitei|quitado/gi, '')
        .replace(/(?:gastei|comprei|recebi|adicionei|adicione|lançar)\s*/gi, '')
        .replace(/(?:no|na|com|via|pelo|pela)\s+(?:cartão|cartao|pix|dinheiro|débito|debito|crédito|credito|boleto)\s*/gi, '')
        .replace(/todo\s+m[eê]s|mensal(?:idade)?|recorrente|fixo|toda\s+semana|semanal/gi, '')
        .replace(/vence(?:mento)?\s+(?:dia\s+)?\d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?/gi, '')
        .replace(/em\s+\d+\s*(?:x|vezes?|parcelas?)/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

    // Remove artigos no início
    descricao = descricao.replace(/^(?:de|do|da|um|uma|o|a)\s+/i, '').trim();

    // Capitaliza primeira letra (apenas se descrição NÃO foi fixada pela regra da vírgula)
    if (!descricaoFixadaPorVirgula) {
        if (descricao) {
            result.descricao = descricao.charAt(0).toUpperCase() + descricao.slice(1);
        } else {
            result.descricao = 'Despesa';
        }
    }

    // ── Inferir CATEGORIA ──────────────────────────────────
    const textoInstrucoes = [cartaBase, instrucoesUsuario].filter(Boolean).join('\n\n');
    const regrasCartas = extrairRegrasCategoriaParaGen(textoInstrucoes);
    const descLower = (result.descricao || texto).toLowerCase();
    const regaEncontrada = regrasCartas.find(r => r.palavras.some(p => descLower.includes(p)));
    result.categoria = regaEncontrada ? regaEncontrada.categoria : inferirCategoria(result.descricao || texto);

    return result;
}


// ── DETECTAR INTENÇÃO DA MENSAGEM ────────────────────────────────
function detectarIntencao(texto) {
    const lower = texto.toLowerCase();

    // Análise financeira / pergunta
    if (/quanto\s+(?:gastei|gast|tenho|sobrou|fica)/i.test(lower) ||
        /(?:meu\s+)?saldo/i.test(lower) ||
        /resumo|relatório|relatorio|analise|análise/i.test(lower)) {
        return 'analise';
    }

    // Receita
    if (/(?:recebi|ganhei|entrou|salário|salario|freelance|renda|pagamento\s+recebido|receita)/i.test(lower)) {
        return 'receita';
    }

    // Despesa
    if (/(?:paguei|gastei|comprei|adicionei|adicione|lançar|lancei|registre?|cobr)/i.test(lower) ||
        /R\$|reais|\d+,\d{2}/.test(lower)) {
        return 'despesa';
    }

    // Listar
    if (/(?:list|mostr|exib|ver|veja|mostrar)\s+(?:minhas?|as?|os?|todas?|todos?)/i.test(lower)) {
        return 'listar';
    }

    // Saudação
    if (/^(?:oi|olá|ola|bom\s+dia|boa\s+tarde|boa\s+noite|hello|hi)\b/i.test(lower)) {
        return 'saudacao';
    }

    return 'despesa'; // padrão
}

// ── FUNÇÃO PRINCIPAL ─────────────────────────────────────────────
/**
 * Parseia texto de despesa
 * @param {string} texto - Texto do usuário
 * @param {Array} contextoConversa - Histórico do chat (msgs OpenAI format)
 * @param {boolean} forcarHeuristica - Forçar uso de heurísticas
 * @param {{ provider: string, apiKey: string }} providerConfig - Config do usuário
 * @returns {Object} { dados, metodo, intencao }
 */
async function parsearDespesa(texto, contextoConversa = [], forcarHeuristica = false, providerConfig = null, ctxSistema = '', cartaBase = '', instrucoesUsuario = '') {
    const intencao = detectarIntencao(texto);

    let dados = null;
    let metodo = 'gen';

    if (!forcarHeuristica && providerConfig?.provider && providerConfig.provider !== 'gen') {
        try {
            if (providerConfig.provider === 'openai') {
                dados = await parsearComOpenAI(texto, contextoConversa, providerConfig.apiKey, ctxSistema, cartaBase, instrucoesUsuario);
                metodo = 'openai';
            } else if (providerConfig.provider === 'gemini') {
                dados = await parsearComGemini(texto, contextoConversa, providerConfig.apiKey, ctxSistema, cartaBase, instrucoesUsuario);
                metodo = 'gemini';
            } else if (providerConfig.provider === 'claude') {
                dados = await parsearComClaude(texto, contextoConversa, providerConfig.apiKey, ctxSistema, cartaBase, instrucoesUsuario);
                metodo = 'claude';
            }
        } catch (err) {
            console.warn(`⚠️ ${providerConfig.provider} falhou, usando Gen:`, err.message);
            dados = parsearComGen(texto, cartaBase, instrucoesUsuario);
        }
    } else if (!forcarHeuristica && getOpenAI()) {
        // fallback para chave env do servidor
        try {
            dados = await parsearComOpenAI(texto, contextoConversa, undefined, ctxSistema, cartaBase, instrucoesUsuario);
            metodo = 'openai';
        } catch (err) {
            console.warn('⚠️ OpenAI falhou, usando Gen:', err.message);
            dados = parsearComGen(texto, cartaBase, instrucoesUsuario);
        }
    } else {
        dados = parsearComGen(texto, cartaBase, instrucoesUsuario);
    }

    const normalizado = normalizarDespesa(dados);
    return { dados: normalizado, metodo, intencao };
}

// ── CONVERSA FINANCEIRA COM IA EXTERNA ───────────────────────────
/**
 * Responde perguntas financeiras usando dados do banco
 * @param {string} pergunta
 * @param {Object} dadosFinanceiros - { despesas, receitas, saldo, etc }
 * @param {Array} historico
 * @param {{ provider: string, apiKey: string }} providerConfig
 */
async function responderPerguntaFinanceira(pergunta, dadosFinanceiros, historico = [], providerConfig = null, ctxSistema = '', cartaBase = '') {
    const hoje = new Date().toISOString().split('T')[0];
    const resumo = JSON.stringify(dadosFinanceiros, null, 2).substring(0, 2000);
    const ctxExtra = ctxSistema ? `\nContexto adicional do sistema:\n${ctxSistema}\n` : '';
    const systemMsg = `Você é um assistente financeiro pessoal. Responda de forma clara, concisa e em português brasileiro.\nData de hoje: ${hoje}\n${ctxExtra}\nDados financeiros do usuário:\n${resumo}\n\nResponda em no máximo 3 frases. Use R$ para valores monetários. Seja direto.${cartaBase ? '\n\n---\nInstruções de comportamento:\n' + cartaBase : ''}`;

    const provider = providerConfig?.provider;
    const apiKey   = providerConfig?.apiKey;

    try {
        if (provider === 'gemini' && apiKey) {
            const fetch = require('node-fetch');
            const url   = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            const r = await fetch(url, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: systemMsg + '\n\nPergunta: ' + pergunta }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 300 } })
            });
            if (!r.ok) throw new Error('Gemini HTTP ' + r.status);
            const data = await r.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || gerarRespostaSimples(pergunta, dadosFinanceiros);
        }

        if (provider === 'claude' && apiKey) {
            const Anthropic = require('@anthropic-ai/sdk');
            const client = new Anthropic({ apiKey });
            const response = await client.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 300,
                system: systemMsg,
                messages: [...historico.slice(-4), { role: 'user', content: pergunta }]
            });
            return response.content[0]?.text || gerarRespostaSimples(pergunta, dadosFinanceiros);
        }

        // OpenAI (chave do usuário ou env)
        const openai = (provider === 'openai' && apiKey)
            ? (() => { const OpenAI = require('openai'); return new OpenAI({ apiKey }); })()
            : getOpenAI();

        if (!openai) return gerarRespostaSimples(pergunta, dadosFinanceiros);

        const response = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [{ role: 'system', content: systemMsg }, ...historico.slice(-4), { role: 'user', content: pergunta }],
            temperature: 0.3,
            max_tokens: 300,
        });
        return response.choices[0].message.content;

    } catch (err) {
        console.error('Erro ao responder pergunta financeira:', err.message);
        return gerarRespostaSimples(pergunta, dadosFinanceiros);
    }
}

function gerarRespostaSimples(pergunta, dados) {
    const lower = pergunta.toLowerCase();

    if (!dados) return 'Não consegui acessar seus dados financeiros no momento.';

    if (lower.includes('saldo')) {
        const saldo = dados.saldo ?? dados.saldoFinal ?? 0;
        return `Seu saldo atual é R$ ${Number(saldo).toFixed(2).replace('.', ',')}.`;
    }

    if (lower.includes('despesa') || lower.includes('gast')) {
        const total = dados.totalDespesas ?? dados.despesas?.reduce((s, d) => s + (d.valor || 0), 0) ?? 0;
        const pago = dados.totalDespesasPago ?? null;
        const aberto = dados.totalDespesasEmAberto ?? null;
        if (pago !== null && aberto !== null) {
            const mes = dados.mes !== undefined ? ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][dados.mes] : null;
            const prefixo = mes ? `Suas despesas de ${mes}` : 'Suas despesas';
            return `${prefixo} totalizam R$ ${Number(total).toFixed(2).replace('.', ',')} — sendo R$ ${Number(pago).toFixed(2).replace('.', ',')} já pagas e R$ ${Number(aberto).toFixed(2).replace('.', ',')} em aberto.`;
        }
        return `Suas despesas totalizam R$ ${Number(total).toFixed(2).replace('.', ',')}.`;
    }

    if (lower.includes('receita') || lower.includes('ganho') || lower.includes('entrad')) {
        const total = dados.totalReceitas ?? dados.receitas?.reduce((s, r) => s + (r.valor || 0), 0) ?? 0;
        return `Suas receitas totalizam R$ ${Number(total).toFixed(2).replace('.', ',')}.`;
    }

    return 'Não entendi sua pergunta. Pode reformular?';
}

// ── REVISAR / ATUALIZAR CARTA DE SERVIÇOS COM IA ─────────────────
async function revisarCarta(cartaAtual, novaInstrucao, providerConfig = null) {
    const prompt = `Você é um editor técnico especializado em documentação de IA.

Abaixo está a Carta de Serviços da IA Gen (assistente financeira).
O usuário master quer incorporar a seguinte instrução/regra:

"${novaInstrucao}"

Instruções para edição:
- Se a instrução se relaciona com uma seção existente, atualize essa seção incorporando a nova regra
- Se é um tópico novo sem seção relacionada, crie uma nova seção numerada ao final (antes do comentário HTML de instruções personalizadas)
- Mantenha EXATAMENTE o formato markdown existente (##, ###, -, **)
- Não remova nenhuma regra existente a menos que a nova instrução explicitamente substitua
- Não adicione comentários explicativos sobre o que mudou — apenas o documento atualizado
- Retorne APENAS o documento markdown completo, sem texto adicional antes ou depois

Carta atual:
${cartaAtual}`;

    const provider = providerConfig?.provider;
    const apiKey   = providerConfig?.apiKey;

    try {
        if (provider === 'gemini' && apiKey) {
            const fetch = require('node-fetch');
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            const r = await fetch(url, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: 4000 }
                })
            });
            if (!r.ok) throw new Error('Gemini HTTP ' + r.status);
            const data = await r.json();
            const texto = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (texto) return texto.trim();
        }

        if (provider === 'claude' && apiKey) {
            const Anthropic = require('@anthropic-ai/sdk');
            const client = new Anthropic({ apiKey });
            const response = await client.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 4000,
                messages: [{ role: 'user', content: prompt }]
            });
            const texto = response.content[0]?.text;
            if (texto) return texto.trim();
        }

        const openai = (provider === 'openai' && apiKey)
            ? (() => { const OpenAI = require('openai'); return new OpenAI({ apiKey }); })()
            : getOpenAI();

        if (openai) {
            const response = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.2,
                max_tokens: 4000,
            });
            const texto = response.choices[0].message.content;
            if (texto) return texto.trim();
        }
    } catch (err) {
        console.error('Erro ao revisar carta com IA:', err.message);
    }

    // Fallback: acrescenta instrução como novo item na seção 8
    return cartaAtual + '\n- ' + novaInstrucao;
}

// ── SYSTEM PROMPT PARA RECEITAS ───────────────────────────────────
const SYSTEM_PROMPT_RECEITA = `Você é um assistente financeiro brasileiro especialista em interpretar receitas em linguagem natural.

Sua tarefa é extrair informações de receitas a partir de texto em português e retornar APENAS um JSON válido.

Campos a extrair:
- descricao: nome/descrição da receita (string)
- valor: valor numérico (number)
- data: data no formato YYYY-MM-DD (padrão: hoje)

REGRA CRÍTICA — VÍRGULA COMO DELIMITADOR DE DESCRIÇÃO (prioridade máxima):
- Quando a primeira palavra do texto é seguida de vírgula, essa primeira palavra (antes da vírgula) é OBRIGATORIAMENTE a descrição.
- Exemplos OBRIGATÓRIOS:
  * "salário, caiu 3500 hoje" → descricao="Salário", valor=3500
  * "freelance, recebi 1200" → descricao="Freelance", valor=1200
- NUNCA inclua o texto após a vírgula na descrição.

Demais regras:
- Ignore palavras de contexto como "caiu", "entrou", "recebi", "chegou", "hoje", "ontem"
- Para "amanhã", "hoje" calcule a data real baseado em hoje
- Se não houver data explícita, use hoje
- Retorne APENAS o JSON, sem texto adicional

Exemplos:
Input: "salário, caiu 3500 hoje"
Output: {"descricao":"Salário","valor":3500,"data":"HOJE"}

Input: "recebi freelance 1500 ontem"
Output: {"descricao":"Freelance","valor":1500,"data":"ONTEM"}`;

/**
 * Parseia receita usando IA externa ou heurística, lendo carta/instrucoes
 */
async function parsearReceita(texto, contextoConversa = [], providerConfig = null, ctxSistema = '', cartaBase = '', instrucoesUsuario = '') {
    const hoje = new Date().toISOString().split('T')[0];
    const ctxExtra = ctxSistema ? `\n\nContexto do sistema:\n${ctxSistema}` : '';
    const instrucoesPrio = instrucoesUsuario
        ? `\n\n=== INSTRUÇÕES PERSONALIZADAS DO USUÁRIO (PRIORIDADE MÁXIMA) ===\n${instrucoesUsuario}\n=== FIM ===`
        : '';
    const systemFull = `${SYSTEM_PROMPT_RECEITA}\n\nData de hoje: ${hoje}${ctxExtra}${instrucoesPrio}${cartaBase ? '\n\n---\n' + cartaBase : ''}`;

    // Tenta IA externa
    if (providerConfig?.provider && providerConfig.provider !== 'gen') {
        try {
            const fetch = require('node-fetch');
            let dados = null;

            if (providerConfig.provider === 'gemini') {
                const prompt = `${systemFull}\n\nTexto do usuário: ${texto}`;
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${providerConfig.apiKey}`;
                const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 300 } };
                const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                const json = await r.json();
                const content = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
                const match = content.match(/\{[\s\S]*\}/);
                if (match) dados = JSON.parse(match[0]);
            } else if (providerConfig.provider === 'openai') {
                const OpenAI = require('openai');
                const openai = new OpenAI({ apiKey: providerConfig.apiKey });
                const response = await openai.chat.completions.create({
                    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                    messages: [{ role: 'system', content: systemFull }, ...contextoConversa.slice(-4), { role: 'user', content: texto }],
                    temperature: 0.1, max_tokens: 300, response_format: { type: 'json_object' }
                });
                dados = JSON.parse(response.choices[0].message.content);
            }

            if (dados) return dados;
        } catch (err) {
            console.warn('⚠️ IA falhou no parser de receita, usando heurística:', err.message);
        }
    }

    // Heurística com regra da vírgula e instrucoes
    const partes = texto.split(',');
    let descricao, valor, data = hoje;

    if (partes.length >= 2) {
        // Regra da vírgula
        descricao = partes[0].trim();
        const resto = partes.slice(1).join(',');
        const valorMatch = resto.match(/(\d+(?:[.,]\d{1,2})?)/);
        valor = valorMatch ? parseFloat(valorMatch[1].replace(',', '.')) : null;
    } else {
        const valorMatch = texto.match(/(\d+(?:[.,]\d{1,2})?)/);
        valor = valorMatch ? parseFloat(valorMatch[1].replace(',', '.')) : null;
        descricao = texto
            .replace(/recebi|ganhei|entrou|salário|salario|freelance|renda|caiu|chegou/gi, '')
            .replace(/R\$\s*[\d.,]+/gi, '').replace(/[\d.,]+\s*reais?/gi, '')
            .replace(/pix|dinheiro|hoje|ontem/gi, '').replace(/\s{2,}/g, ' ').trim();
        descricao = descricao.replace(/^(?:de|do|da|um|uma|o|a)\s+/i, '').trim();
    }

    if (!descricao) descricao = 'Receita';
    descricao = descricao.charAt(0).toUpperCase() + descricao.slice(1);

    return { descricao, valor, data };
}

module.exports = {
    parsearDespesa,
    parsearReceita,
    responderPerguntaFinanceira,
    detectarIntencao,
    parsearComGen,
    revisarCarta,
};
