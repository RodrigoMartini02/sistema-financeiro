// ================================================================
// EXTRATO PARSER - Importação de extrato bancário em PDF
// Extrai transações usando IA (texto do PDF)
// ================================================================

const PROMPT_EXTRATO = `Você está analisando o texto extraído de um extrato bancário em PDF.

Extraia TODAS as transações encontradas e retorne um array JSON.
Responda APENAS com JSON válido, sem texto extra, sem markdown.

Formato esperado:
[
  {
    "data": "YYYY-MM-DD",
    "descricao": "descrição da transação (loja, empresa, serviço)",
    "valor": 99.90,
    "tipo": "despesa" ou "receita",
    "categoria_sugerida": "Alimentação|Transporte|Moradia|Saúde|Educação|Lazer|Assinaturas|Salário|Outros"
  }
]

Regras:
- tipo="despesa" para débitos, compras, pagamentos, saídas, transferências enviadas
- tipo="receita" para créditos, depósitos, salário, Pix recebido, transferências recebidas
- valor deve ser número positivo (sem sinal)
- data no formato YYYY-MM-DD
- Se a data tiver apenas dia/mês, use o ano do período do extrato
- Ignore saldo, cabeçalhos, rodapés, totais acumulados
- Extraia TODAS as transações, não pule nenhuma
- Se não encontrar transações, retorne []`;

/**
 * Parseia extrato bancário em PDF usando IA externa
 */
async function parsearExtratoComIA(texto, providerConfig) {
    const provider = providerConfig?.provider;
    const apiKey   = providerConfig?.apiKey;

    if (!provider || provider === 'gen' || !apiKey) {
        return parsearExtratoHeuristico(texto);
    }

    try {
        let resultado = null;

        if (provider === 'openai') {
            const OpenAI = require('openai');
            const openai = new OpenAI({ apiKey });
            const r = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: PROMPT_EXTRATO },
                    { role: 'user',   content: texto.slice(0, 8000) } // limita tokens
                ],
                temperature: 0,
                max_tokens: 4000,
                response_format: { type: 'json_object' }
            });
            const raw = r.choices[0]?.message?.content?.trim();
            const parsed = JSON.parse(raw);
            resultado = Array.isArray(parsed) ? parsed : (parsed.transacoes || parsed.transactions || []);

        } else if (provider === 'gemini') {
            const fetch = require('node-fetch');
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: PROMPT_EXTRATO + '\n\n' + texto.slice(0, 8000) }] }],
                    generationConfig: { temperature: 0, maxOutputTokens: 4000 },
                }),
                timeout: 30000,
            });
            if (!r.ok) throw new Error('Gemini HTTP ' + r.status);
            const data  = await r.json();
            const raw2  = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '[]';
            const clean = raw2.replace(/```json\n?|\n?```/g, '').trim();
            const parsed2 = JSON.parse(clean);
            resultado = Array.isArray(parsed2) ? parsed2 : (parsed2.transacoes || parsed2.transactions || []);

        } else if (provider === 'claude') {
            const Anthropic = require('@anthropic-ai/sdk');
            const client = new Anthropic({ apiKey });
            const r = await client.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 4000,
                system: PROMPT_EXTRATO,
                messages: [{ role: 'user', content: texto.slice(0, 8000) }],
            });
            const raw3  = r.content[0]?.text?.trim() || '[]';
            const clean3 = raw3.replace(/```json\n?|\n?```/g, '').trim();
            const parsed3 = JSON.parse(clean3);
            resultado = Array.isArray(parsed3) ? parsed3 : (parsed3.transacoes || parsed3.transactions || []);
        }

        if (Array.isArray(resultado)) {
            return normalizarTransacoes(resultado);
        }
    } catch (err) {
        console.warn('⚠️ IA falhou ao parsear extrato, usando heurística:', err.message);
    }

    return parsearExtratoHeuristico(texto);
}

/**
 * Heurística simples para extratos (fallback sem IA)
 * Detecta padrões comuns de extrato brasileiro
 */
function parsearExtratoHeuristico(texto) {
    const linhas  = texto.split('\n').map(l => l.trim()).filter(Boolean);
    const transacoes = [];
    const anoRef  = new Date().getFullYear();

    // Padrão: DD/MM  DESCRIÇÃO  VALOR (+ ou -)
    const reTransacao = /(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.{3,60?}?)\s+([\-+]?\s*R?\$?\s*[\d.,]+)/;

    linhas.forEach(linha => {
        const m = linha.match(reTransacao);
        if (!m) return;

        const [, dataStr, desc, valorStr] = m;
        const partsData = dataStr.split('/');
        const dia = partsData[0], mes = partsData[1];
        const ano = partsData[2] ? (partsData[2].length === 2 ? '20' + partsData[2] : partsData[2]) : anoRef;
        const data = `${ano}-${mes.padStart(2,'0')}-${dia.padStart(2,'0')}`;

        const valorNum = parseFloat(valorStr.replace(/[R$\s]/g,'').replace(',','.'));
        if (!valorNum || isNaN(valorNum)) return;

        const tipo = valorStr.includes('-') || /d[eé]bito|compra|pagto|pag\b/i.test(linha) ? 'despesa' : 'receita';

        transacoes.push({
            data,
            descricao: desc.trim().replace(/\s{2,}/g, ' '),
            valor: Math.abs(valorNum),
            tipo,
            categoria_sugerida: inferirCategoria(desc),
        });
    });

    return transacoes;
}

function inferirCategoria(descricao) {
    const d = descricao.toLowerCase();
    if (/mercado|supermercado|padaria|açougue|hortifruti|ifood|rappi|delivery/i.test(d)) return 'Alimentação';
    if (/uber|99|taxi|posto|combustível|gasolina|ônibus|metrô|pedágio/i.test(d)) return 'Transporte';
    if (/aluguel|condomínio|luz|energia|água|gás|internet|telefone|tv\s*por/i.test(d)) return 'Moradia';
    if (/farmácia|médico|hospital|plano\s*de\s*saúde|consulta|exame/i.test(d)) return 'Saúde';
    if (/escola|faculdade|curso|livro|mensalidade/i.test(d)) return 'Educação';
    if (/netflix|spotify|amazon|prime|disney|globo|youtube|assinatura/i.test(d)) return 'Assinaturas';
    if (/cinema|teatro|show|game|hobby|academia|esporte/i.test(d)) return 'Lazer';
    if (/salário|salario|holerite|vencimento|remuner/i.test(d)) return 'Salário';
    return 'Outros';
}

function normalizarTransacoes(lista) {
    return lista.map(t => ({
        data:              t.data || new Date().toISOString().split('T')[0],
        descricao:         (t.descricao || 'Transação').trim(),
        valor:             Math.abs(parseFloat(t.valor) || 0),
        tipo:              t.tipo === 'receita' ? 'receita' : 'despesa',
        categoria_sugerida: t.categoria_sugerida || inferirCategoria(t.descricao || ''),
    })).filter(t => t.valor > 0);
}

module.exports = { parsearExtratoComIA };
