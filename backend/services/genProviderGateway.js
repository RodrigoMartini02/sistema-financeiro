'use strict';

const DEFAULT_MODELS = {
    openai: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    groq: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    claude: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
    gemini: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
};

function hasExternalProvider(providerConfig) {
    return !!providerConfig?.provider && providerConfig.provider !== 'gen' && !!providerConfig?.apiKey;
}

function stripMarkdownJson(texto) {
    return String(texto || '').replace(/```json\n?|\n?```/g, '').trim();
}

function parseJsonFromText(texto, fallback = null) {
    const clean = stripMarkdownJson(texto);
    if (!clean) return fallback;
    try {
        return JSON.parse(clean);
    } catch {
        const match = clean.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (!match) return fallback;
        try { return JSON.parse(match[0]); } catch { return fallback; }
    }
}

async function generateText(providerConfig, options = {}) {
    if (!hasExternalProvider(providerConfig)) {
        throw new Error('provider_nao_configurado');
    }

    const provider = providerConfig.provider;
    const apiKey = providerConfig.apiKey;
    const system = options.system || '';
    const prompt = options.prompt || '';
    const temperature = options.temperature ?? 0.2;
    const maxTokens = options.maxTokens || 1024;

    if (provider === 'openai' || provider === 'groq') {
        const OpenAI = require('openai');
        const client = new OpenAI({
            apiKey,
            ...(provider === 'groq' && { baseURL: 'https://api.groq.com/openai/v1' }),
        });
        const response = await client.chat.completions.create({
            model: provider === 'groq' ? DEFAULT_MODELS.groq : DEFAULT_MODELS.openai,
            messages: [
                ...(system ? [{ role: 'system', content: system }] : []),
                { role: 'user', content: prompt },
            ],
            temperature,
            max_tokens: maxTokens,
            ...(options.json && provider === 'openai' ? { response_format: { type: 'json_object' } } : {}),
        });
        return response.choices[0]?.message?.content || '';
    }

    if (provider === 'gemini') {
        const fetch = require('node-fetch');
        const model = DEFAULT_MODELS.gemini;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...(system && { system_instruction: { parts: [{ text: system }] } }),
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature, maxOutputTokens: maxTokens },
            }),
            timeout: options.timeout || 30000,
        });
        if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.filter(p => p.text).map(p => p.text).join('') || '';
    }

    if (provider === 'claude') {
        const Anthropic = require('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
            model: DEFAULT_MODELS.claude,
            max_tokens: maxTokens,
            ...(system && { system }),
            messages: [{ role: 'user', content: prompt }],
            temperature,
        });
        return response.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
    }

    throw new Error(`provider_nao_suportado:${provider}`);
}

async function generateJson(providerConfig, options = {}, fallback = null) {
    const text = await generateText(providerConfig, { ...options, json: true });
    return parseJsonFromText(text, fallback);
}

module.exports = {
    DEFAULT_MODELS,
    hasExternalProvider,
    generateText,
    generateJson,
    parseJsonFromText,
    stripMarkdownJson,
};
