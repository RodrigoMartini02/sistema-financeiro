// ================================================================
// VISION SERVICE - Análise de documentos financeiros via IA
// Usa a API de visão do provedor configurado pelo usuário
// Fallback: ocrService (Tesseract + regex)
// ================================================================

const fs = require('fs');

const PROMPT_EXTRACAO = `Analise este documento financeiro e extraia as informações em JSON.
Responda APENAS com JSON válido, sem texto extra.

Campos a extrair:
{
  "descricao": "nome do estabelecimento/serviço (ex: Condomínio Montmartre, Netflix, Conta de Luz)",
  "empresa": "razão social ou nome completo do beneficiário",
  "valor": número (valor total a pagar, sem R$),
  "vencimento": "YYYY-MM-DD" ou null,
  "data": "YYYY-MM-DD" (data de emissão/compra) ou null,
  "tipo": "boleto" | "nota_fiscal" | "comprovante_pix" | "recibo" | "fatura" | "documento",
  "forma_pagamento": "pix" | "cartao_credito" | "cartao_debito" | "dinheiro" | null,
  "linha_digitavel": "somente dígitos da linha digitável, se boleto" ou null,
  "categoria_sugerida": "categoria provável (ex: Moradia, Alimentação, Transporte, Saúde, Educação, Lazer, Serviços)" ou null
}

Regras:
- valor deve ser o valor FINAL a pagar (não parcelas, não subtotal)
- Se for comprovante de pagamento já efetuado, forma_pagamento pode ser inferida
- Se for boleto, linha_digitavel deve ter apenas números (sem pontos/espaços)
- Para documentos sem informação, use null`;

/**
 * Analisa documento via OpenAI Vision (GPT-4o)
 */
async function analisarComOpenAI(filePath, mimeType, apiKey) {
    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey });

    if (mimeType === 'application/pdf') return null; // OpenAI não suporta PDF direto

    const base64 = fs.readFileSync(filePath).toString('base64');
    const response = await client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 500,
        messages: [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } },
                { type: 'text', text: PROMPT_EXTRACAO }
            ]
        }]
    });

    const texto = response.choices[0]?.message?.content || '';
    return _parsearResposta(texto);
}

/**
 * Analisa documento via Gemini Vision (suporta imagem e PDF)
 */
async function analisarComGemini(filePath, mimeType, apiKey) {
    const fetch = require('node-fetch');
    const base64 = fs.readFileSync(filePath).toString('base64');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const body = {
        contents: [{
            parts: [
                { inline_data: { mime_type: mimeType, data: base64 } },
                { text: PROMPT_EXTRACAO }
            ]
        }],
        generationConfig: { maxOutputTokens: 500, temperature: 0.1 }
    };

    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    const texto = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return _parsearResposta(texto);
}

/**
 * Analisa documento via Claude Vision (suporta imagem e PDF)
 */
async function analisarComClaude(filePath, mimeType, apiKey) {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const base64 = fs.readFileSync(filePath).toString('base64');

    const sourceType = mimeType === 'application/pdf' ? 'document' : 'base64';
    const contentItem = mimeType === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: mimeType, data: base64 } }
        : { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } };

    const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
            role: 'user',
            content: [contentItem, { type: 'text', text: PROMPT_EXTRACAO }]
        }]
    });

    const texto = response.content[0]?.text || '';
    return _parsearResposta(texto);
}

/**
 * Extrai JSON da resposta da IA
 */
function _parsearResposta(texto) {
    try {
        const match = texto.match(/\{[\s\S]*\}/);
        if (!match) return null;
        const obj = JSON.parse(match[0]);
        // Valida campos mínimos
        if (obj.valor === undefined && obj.descricao === undefined) return null;
        return obj;
    } catch {
        return null;
    }
}

/**
 * Tenta analisar o documento com IA Vision usando o provedor configurado.
 * Retorna null se não disponível ou falhar (fallback para OCR).
 */
async function analisarDocumentoComIA(filePath, mimeType, providerConfig) {
    if (!providerConfig?.provider || providerConfig.provider === 'gen') return null;

    try {
        if (providerConfig.provider === 'openai' && providerConfig.apiKey) {
            return await analisarComOpenAI(filePath, mimeType, providerConfig.apiKey);
        }
        if (providerConfig.provider === 'gemini' && providerConfig.apiKey) {
            return await analisarComGemini(filePath, mimeType, providerConfig.apiKey);
        }
        if (providerConfig.provider === 'claude' && providerConfig.apiKey) {
            return await analisarComClaude(filePath, mimeType, providerConfig.apiKey);
        }
    } catch (err) {
        console.warn('⚠️ Vision IA falhou, usando OCR:', err.message);
    }
    return null;
}

module.exports = { analisarDocumentoComIA };
