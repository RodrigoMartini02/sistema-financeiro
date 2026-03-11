// ================================================================
// AI PARSER - Interpreta linguagem natural para despesas
// Usa OpenAI GPT se OPENAI_API_KEY disponível, caso contrário
// utiliza análise por regex/heurísticas
// ================================================================

const { normalizarDespesa, normalizarValor, normalizarFormaPagamento,
    normalizarData, inferirCategoria } = require('../utils/expenseNormalizer');

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

Regras:
- Para "cartão" sem especificar = cartao_credito
- Para datas relativas como "dia 15" use o mês atual
- Para "amanhã", "hoje" calcule a data real baseado em hoje
- Se algum campo não foi mencionado, use null (exceto parcelas que é 1)
- Retorne APENAS o JSON, sem texto adicional

Exemplos:
Input: "paguei 120 de internet da vivo no cartão vence dia 15"
Output: {"descricao":"Internet Vivo","valor":120,"categoria":"Moradia","forma_pagamento":"cartao_credito","vencimento":"DATA_DIA_15","parcelas":1,"data":"HOJE"}

Input: "netflix 55,90 debito todo mes"
Output: {"descricao":"Netflix","valor":55.90,"categoria":"Assinaturas","forma_pagamento":"cartao_debito","vencimento":null,"parcelas":1,"data":"HOJE"}`;

// ── PARSER COM OPENAI ────────────────────────────────────────────
async function parsearComOpenAI(texto, contextoConversa = []) {
    const openai = getOpenAI();
    if (!openai) throw new Error('OpenAI não configurado');

    const hoje = new Date().toISOString().split('T')[0];
    const systemWithDate = SYSTEM_PROMPT + `\n\nData de hoje: ${hoje}`;

    const messages = [
        { role: 'system', content: systemWithDate },
        ...contextoConversa.slice(-6), // últimas 3 trocas
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

// ── PARSER COM HEURÍSTICAS (fallback) ───────────────────────────
function parsearComHeuristicas(texto) {
    const lower = texto.toLowerCase();
    const result = {
        descricao: null,
        valor: null,
        categoria: null,
        forma_pagamento: null,
        vencimento: null,
        parcelas: 1,
        data: new Date().toISOString().split('T')[0]
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

    // ── Extração de FORMA DE PAGAMENTO ────────────────────────
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
    // Remove palavras-chave e extrai o restante como descrição
    let descricao = texto
        .replace(/R\$\s*[\d.,]+/gi, '')
        .replace(/[\d.,]+\s*reais?/gi, '')
        .replace(/(?:paguei|gastei|comprei|recebi|adicionei|adicione|lançar)\s*/gi, '')
        .replace(/(?:no|na|com|via|pelo|pela)\s+(?:cartão|cartao|pix|dinheiro|débito|debito|crédito|credito|boleto)\s*/gi, '')
        .replace(/vence(?:mento)?\s+(?:dia\s+)?\d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?/gi, '')
        .replace(/em\s+\d+\s*(?:x|vezes?|parcelas?)/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

    // Remove artigos no início
    descricao = descricao.replace(/^(?:de|do|da|um|uma|o|a)\s+/i, '').trim();

    // Capitaliza primeira letra
    if (descricao) {
        result.descricao = descricao.charAt(0).toUpperCase() + descricao.slice(1);
    } else {
        result.descricao = 'Despesa';
    }

    // ── Inferir CATEGORIA ──────────────────────────────────
    result.categoria = inferirCategoria(result.descricao || texto);

    return result;
}

// ── COMPLETAR CAMPOS COM CONTEXTO ────────────────────────────────
function completarComContexto(parcial, contextoChat) {
    if (!contextoChat || contextoChat.length === 0) return parcial;

    const ultimo = contextoChat[contextoChat.length - 1];
    if (!ultimo || !ultimo.despesaParcial) return parcial;

    const base = { ...ultimo.despesaParcial };

    // Mescla campos novos sobre a base anterior
    for (const [key, val] of Object.entries(parcial)) {
        if (val !== null && val !== undefined) {
            base[key] = val;
        }
    }

    return base;
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
 * @returns {Object} { dados, metodo, intencao }
 */
async function parsearDespesa(texto, contextoConversa = [], forcarHeuristica = false) {
    const intencao = detectarIntencao(texto);

    let dados = null;
    let metodo = 'heuristica';

    const openai = getOpenAI();

    if (openai && !forcarHeuristica) {
        try {
            dados = await parsearComOpenAI(texto, contextoConversa);
            metodo = 'openai';
        } catch (err) {
            console.warn('⚠️ OpenAI falhou, usando heurísticas:', err.message);
            dados = parsearComHeuristicas(texto);
        }
    } else {
        dados = parsearComHeuristicas(texto);
    }

    // Normaliza os dados extraídos
    const normalizado = normalizarDespesa(dados);

    return { dados: normalizado, metodo, intencao };
}

// ── CONVERSA FINANCEIRA COM OPENAI ────────────────────────────────
/**
 * Responde perguntas financeiras usando dados do banco
 * @param {string} pergunta
 * @param {Object} dadosFinanceiros - { despesas, receitas, saldo, etc }
 * @param {Array} historico
 */
async function responderPerguntaFinanceira(pergunta, dadosFinanceiros, historico = []) {
    const openai = getOpenAI();

    const hoje = new Date().toISOString().split('T')[0];
    const resumo = JSON.stringify(dadosFinanceiros, null, 2).substring(0, 3000);

    if (!openai) {
        // Resposta baseada em regras simples
        return gerarRespostaSimples(pergunta, dadosFinanceiros);
    }

    const systemMsg = `Você é um assistente financeiro pessoal. Responda de forma clara, concisa e em português brasileiro.
Data de hoje: ${hoje}
Dados financeiros do usuário:
${resumo}

Responda em no máximo 3 frases. Use R$ para valores monetários. Seja direto.`;

    try {
        const response = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemMsg },
                ...historico.slice(-4),
                { role: 'user', content: pergunta }
            ],
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
        return `Suas despesas totalizam R$ ${Number(total).toFixed(2).replace('.', ',')}.`;
    }

    if (lower.includes('receita') || lower.includes('ganho') || lower.includes('entrad')) {
        const total = dados.totalReceitas ?? dados.receitas?.reduce((s, r) => s + (r.valor || 0), 0) ?? 0;
        return `Suas receitas totalizam R$ ${Number(total).toFixed(2).replace('.', ',')}.`;
    }

    return 'Não entendi sua pergunta. Pode reformular?';
}

module.exports = {
    parsearDespesa,
    responderPerguntaFinanceira,
    detectarIntencao,
    parsearComHeuristicas,
};
