import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export type AiProviderName = 'openai' | 'anthropic' | 'gemini';
export type CopilotIntent = 'summary' | 'categories' | 'transactions' | 'upcoming' | 'budget' | 'register' | 'help';

export interface AiProviderConfig {
  provider: AiProviderName;
  apiKey: string;
  model: string;
}

export interface AiProviderDecision {
  intent: CopilotIntent;
  categoryName: string | null;
  searchTerm: string | null;
  reply: string | null;
  inputTokens: number;
  outputTokens: number;
}

export class AiProviderError extends Error {}

const VALID_INTENTS = new Set<CopilotIntent>([
  'summary', 'categories', 'transactions', 'upcoming', 'budget', 'register', 'help',
]);

const SYSTEM_INSTRUCTION = [
  'Voce classifica mensagens de um copiloto financeiro brasileiro.',
  'Escolha apenas uma intencao: summary, categories, transactions, upcoming, budget, register ou help.',
  'summary consulta receitas, despesas e saldo do periodo.',
  'categories consulta gastos por categoria.',
  'transactions lista lancamentos ou busca por descricao.',
  'upcoming consulta despesas a vencer.',
  'budget consulta metas pessoais de orcamento.',
  'register prepara um rascunho de receita ou despesa para revisao humana.',
  'help explica o que o copiloto pode fazer.',
  'Nunca invente numeros, transacoes, saldos ou conselho de investimento.',
  'Responda somente JSON valido com intent, categoryName, searchTerm e reply.',
].join(' ');

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textFromUnknown(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberFromUnknown(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDecision(content: string, usage: { inputTokens: number; outputTokens: number }): AiProviderDecision {
  const match = content.match(/\{[\s\S]*\}/);
  const parsed = match ? JSON.parse(match[0]) as unknown : {};
  const value = recordFromUnknown(parsed);
  const intent = textFromUnknown(value['intent']) as CopilotIntent | null;

  if (!intent || !VALID_INTENTS.has(intent)) {
    throw new AiProviderError('O provedor de IA nao retornou uma intencao valida.');
  }

  return {
    intent,
    categoryName: textFromUnknown(value['categoryName']),
    searchTerm: textFromUnknown(value['searchTerm']),
    reply: textFromUnknown(value['reply']),
    ...usage,
  };
}

function extractOpenAiUsage(value: unknown): { inputTokens: number; outputTokens: number } {
  const usage = recordFromUnknown(value);
  return {
    inputTokens: numberFromUnknown(usage['input_tokens']),
    outputTokens: numberFromUnknown(usage['output_tokens']),
  };
}

function extractGeminiText(value: unknown): string {
  const root = recordFromUnknown(value);
  const candidates = Array.isArray(root['candidates']) ? root['candidates'] : [];
  const candidate = recordFromUnknown(candidates[0]);
  const content = recordFromUnknown(candidate['content']);
  const parts = Array.isArray(content['parts']) ? content['parts'] : [];
  return parts
    .map((part) => textFromUnknown(recordFromUnknown(part)['text']) ?? '')
    .join('\n')
    .trim();
}

function extractGeminiUsage(value: unknown): { inputTokens: number; outputTokens: number } {
  const usage = recordFromUnknown(recordFromUnknown(value)['usageMetadata']);
  return {
    inputTokens: numberFromUnknown(usage['promptTokenCount']),
    outputTokens: numberFromUnknown(usage['candidatesTokenCount']),
  };
}

async function classifyWithOpenAi(config: AiProviderConfig, message: string): Promise<AiProviderDecision> {
  const client = new OpenAI({ apiKey: config.apiKey });
  const response = await client.responses.create({
    model: config.model,
    store: false,
    instructions: SYSTEM_INSTRUCTION,
    input: message,
  });
  return parseDecision(response.output_text, extractOpenAiUsage(response.usage));
}

async function classifyWithAnthropic(config: AiProviderConfig, message: string): Promise<AiProviderDecision> {
  const client = new Anthropic({ apiKey: config.apiKey });
  const response = await client.messages.create({
    model: config.model,
    max_tokens: 250,
    system: SYSTEM_INSTRUCTION,
    messages: [{ role: 'user', content: message }],
  });
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
  return parseDecision(text, {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });
}

async function classifyWithGemini(config: AiProviderConfig, message: string): Promise<AiProviderDecision> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: message }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 250, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    throw new AiProviderError('Nao foi possivel consultar o provedor Gemini.');
  }
  return parseDecision(extractGeminiText(body), extractGeminiUsage(body));
}

export async function classifyCopilotMessage(config: AiProviderConfig, message: string): Promise<AiProviderDecision> {
  try {
    if (config.provider === 'openai') return await classifyWithOpenAi(config, message);
    if (config.provider === 'anthropic') return await classifyWithAnthropic(config, message);
    return await classifyWithGemini(config, message);
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    throw new AiProviderError('A IA nao esta disponivel no momento.');
  }
}
