import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { AiProviderError, type AiProviderConfig } from './aiProvider';
import { ASSISTANT_TOOLS, type ToolDefinition } from './assistantTools';

// Tool calling nos tres provedores, atras de uma interface unica. Cada um tem
// formato proprio para declarar ferramentas e devolver a chamada; o resto do
// sistema so enxerga ToolCall e ToolTurn.

const MAX_OUTPUT_TOKENS = 1_200;
const REQUEST_TIMEOUT_MS = 30_000;

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolTurn {
  /** Texto final ao usuario; vazio enquanto o modelo ainda pede ferramenta. */
  text: string | null;
  toolCalls: ToolCall[];
  inputTokens: number;
  outputTokens: number;
}

/** Uma rodada da conversa, no formato neutro que os adaptadores traduzem. */
export type ToolMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; text: string | null; toolCalls: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

function jsonSchemaFor(tool: ToolDefinition): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(tool.parameters)) {
    properties[name] = schema.enum
      ? { type: schema.type, description: schema.description, enum: schema.enum }
      : { type: schema.type, description: schema.description };
  }
  return { type: 'object', properties, required: tool.required };
}

function parseArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

// ── Anthropic ────────────────────────────────────────────────────────

function toAnthropicMessages(messages: ToolMessage[]): Anthropic.MessageParam[] {
  return messages.map((message): Anthropic.MessageParam => {
    if (message.role === 'user') return { role: 'user', content: message.content };

    if (message.role === 'tool') {
      // Resultado de ferramenta volta como mensagem do usuario, no formato do SDK.
      return {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: message.toolCallId, content: message.content }],
      };
    }

    const blocks: Anthropic.ContentBlockParam[] = [];
    if (message.text) blocks.push({ type: 'text', text: message.text });
    for (const call of message.toolCalls) {
      blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.arguments });
    }
    return { role: 'assistant', content: blocks };
  });
}

async function runAnthropicTurn(
  config: AiProviderConfig,
  system: string,
  messages: ToolMessage[],
): Promise<ToolTurn> {
  const client = new Anthropic({ apiKey: config.apiKey, timeout: REQUEST_TIMEOUT_MS });
  const response = await client.messages.create({
    model: config.model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system,
    tools: ASSISTANT_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: jsonSchemaFor(tool) as Anthropic.Tool.InputSchema,
    })),
    messages: toAnthropicMessages(messages),
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  const toolCalls = response.content
    .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
    .map((block) => ({ id: block.id, name: block.name, arguments: parseArguments(block.input) }));

  return {
    text: text || null,
    toolCalls,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// ── OpenAI ───────────────────────────────────────────────────────────

function toOpenAiInput(messages: ToolMessage[]): Array<Record<string, unknown>> {
  const input: Array<Record<string, unknown>> = [];
  for (const message of messages) {
    if (message.role === 'user') {
      input.push({ role: 'user', content: message.content });
      continue;
    }
    if (message.role === 'tool') {
      input.push({ type: 'function_call_output', call_id: message.toolCallId, output: message.content });
      continue;
    }
    if (message.text) input.push({ role: 'assistant', content: message.text });
    for (const call of message.toolCalls) {
      input.push({
        type: 'function_call',
        call_id: call.id,
        name: call.name,
        arguments: JSON.stringify(call.arguments),
      });
    }
  }
  return input;
}

async function runOpenAiTurn(
  config: AiProviderConfig,
  system: string,
  messages: ToolMessage[],
): Promise<ToolTurn> {
  const client = new OpenAI({ apiKey: config.apiKey, timeout: REQUEST_TIMEOUT_MS });
  const response = await client.responses.create({
    model: config.model,
    store: false,
    instructions: system,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    tools: ASSISTANT_TOOLS.map((tool) => ({
      type: 'function' as const,
      name: tool.name,
      description: tool.description,
      parameters: jsonSchemaFor(tool),
      strict: false,
    })),
    input: toOpenAiInput(messages) as never,
  });

  const toolCalls: ToolCall[] = [];
  for (const item of response.output ?? []) {
    const record = item as unknown as Record<string, unknown>;
    if (record['type'] !== 'function_call') continue;
    toolCalls.push({
      id: String(record['call_id'] ?? record['id'] ?? ''),
      name: String(record['name'] ?? ''),
      arguments: parseArguments(record['arguments']),
    });
  }

  const usage = response.usage as unknown as Record<string, unknown> | undefined;
  return {
    text: response.output_text?.trim() || null,
    toolCalls,
    inputTokens: Number(usage?.['input_tokens'] ?? 0),
    outputTokens: Number(usage?.['output_tokens'] ?? 0),
  };
}

// ── Gemini ───────────────────────────────────────────────────────────

function toGeminiContents(messages: ToolMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (message.role === 'user') return { role: 'user', parts: [{ text: message.content }] };

    if (message.role === 'tool') {
      // Gemini casa resultado com chamada pelo nome da funcao, nao por id.
      return {
        role: 'user',
        parts: [{
          functionResponse: { name: message.name, response: { resultado: message.content } },
        }],
      };
    }

    const parts: Array<Record<string, unknown>> = [];
    if (message.text) parts.push({ text: message.text });
    for (const call of message.toolCalls) {
      parts.push({ functionCall: { name: call.name, args: call.arguments } });
    }
    return { role: 'model', parts };
  });
}

/** Gemini não aceita `enum` fora de string, nem campos extras no schema. */
function geminiSchemaFor(tool: ToolDefinition): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(tool.parameters)) {
    const type = schema.type === 'number' ? 'NUMBER' : schema.type === 'boolean' ? 'BOOLEAN' : 'STRING';
    properties[name] = schema.enum && schema.type === 'string'
      ? { type, description: schema.description, enum: schema.enum }
      : { type, description: schema.description };
  }
  return { type: 'OBJECT', properties, required: tool.required };
}

async function runGeminiTurn(
  config: AiProviderConfig,
  system: string,
  messages: ToolMessage[],
): Promise<ToolTurn> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: toGeminiContents(messages),
        tools: [{
          functionDeclarations: ASSISTANT_TOOLS.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: geminiSchemaFor(tool),
          })),
        }],
        generationConfig: { temperature: 0, maxOutputTokens: MAX_OUTPUT_TOKENS },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  if (!response.ok) throw new AiProviderError('Nao foi possivel consultar o provedor Gemini.');
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;

  const candidates = Array.isArray(body?.['candidates']) ? body['candidates'] as unknown[] : [];
  const first = (candidates[0] ?? {}) as Record<string, unknown>;
  const content = (first['content'] ?? {}) as Record<string, unknown>;
  const parts = Array.isArray(content['parts']) ? content['parts'] as Array<Record<string, unknown>> : [];

  const textParts: string[] = [];
  const toolCalls: ToolCall[] = [];
  for (const [index, part] of parts.entries()) {
    if (typeof part['text'] === 'string') textParts.push(part['text']);
    const call = part['functionCall'] as Record<string, unknown> | undefined;
    if (call && typeof call['name'] === 'string') {
      toolCalls.push({
        // Gemini nao devolve id: o indice basta para casar resultado e chamada.
        id: `gemini-${index}-${call['name']}`,
        name: call['name'],
        arguments: parseArguments(call['args']),
      });
    }
  }

  const usage = (body?.['usageMetadata'] ?? {}) as Record<string, unknown>;
  return {
    text: textParts.join('\n').trim() || null,
    toolCalls,
    inputTokens: Number(usage['promptTokenCount'] ?? 0),
    outputTokens: Number(usage['candidatesTokenCount'] ?? 0),
  };
}

/**
 * Uma rodada de conversa com ferramentas disponíveis. Devolve texto final ou as
 * chamadas que o modelo pediu — quem orquestra decide o que fazer com elas.
 */
export async function runToolTurn(
  config: AiProviderConfig,
  system: string,
  messages: ToolMessage[],
): Promise<ToolTurn> {
  try {
    if (config.provider === 'openai') return await runOpenAiTurn(config, system, messages);
    if (config.provider === 'anthropic') return await runAnthropicTurn(config, system, messages);
    return await runGeminiTurn(config, system, messages);
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    // Modelo antigo sem suporte a ferramenta cai aqui: quem chama volta ao
    // caminho deterministico em vez de deixar o usuario sem resposta.
    throw new AiProviderError('A IA nao esta disponivel no momento.');
  }
}
