import { and, count, desc, eq, gte, ne } from 'drizzle-orm';
import { db } from '../db/client';
import { aiIntegrations, aiUsageEvents } from '../db/schema';
import { decryptKey, encryptKey, hasDedicatedEncryptionSecret } from './secureKeyStore';
import { classifyCopilotMessage, type AiProviderConfig, type AiProviderName } from './aiProvider';

const PROVIDERS = new Set<AiProviderName>(['openai', 'anthropic', 'gemini']);

export class AiIntegrationInputError extends Error {}
export class AiUsageLimitError extends Error {}

function positiveLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export interface AiIntegrationSettings {
  provider: AiProviderName;
  model: string;
  enabled: boolean;
  primary: boolean;
  hasToken: boolean;
  updatedAt: Date | string | null;
}

function toSettings(row: typeof aiIntegrations.$inferSelect): AiIntegrationSettings {
  return {
    provider: row.provider,
    model: row.model,
    enabled: row.enabled,
    primary: row.primary,
    hasToken: Boolean(decryptKey(row.encryptedApiKey)),
    updatedAt: row.updatedAt,
  };
}

function validateProvider(value: unknown): AiProviderName {
  if (typeof value !== 'string' || !PROVIDERS.has(value as AiProviderName)) {
    throw new AiIntegrationInputError('Selecione um provedor de IA válido.');
  }
  return value as AiProviderName;
}

export async function listAiIntegrationSettings(): Promise<AiIntegrationSettings[]> {
  const rows = await db.select().from(aiIntegrations).orderBy(aiIntegrations.provider);
  return rows.map(toSettings);
}

export async function getActiveAiProvider(): Promise<AiProviderConfig | null> {
  const [integration] = await db
    .select()
    .from(aiIntegrations)
    .where(and(eq(aiIntegrations.enabled, true), eq(aiIntegrations.primary, true)))
    .orderBy(desc(aiIntegrations.updatedAt))
    .limit(1);

  if (!integration) return null;
  const apiKey = decryptKey(integration.encryptedApiKey);
  if (!apiKey) return null;
  return { provider: integration.provider, model: integration.model, apiKey };
}

export async function saveAiIntegration(input: {
  provider: unknown;
  model: unknown;
  apiKey: unknown;
  enabled: unknown;
  primary: unknown;
  updatedByUserId: number;
}): Promise<AiIntegrationSettings> {
  if (!hasDedicatedEncryptionSecret()) {
    throw new AiIntegrationInputError('Defina GEN_KEY_ENCRYPTION_SECRET no ambiente antes de salvar uma chave de IA.');
  }

  const provider = validateProvider(input.provider);
  const model = typeof input.model === 'string' ? input.model.trim().slice(0, 120) : '';
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  const enabled = input.enabled === true;
  const primary = enabled && input.primary === true;
  if (!model) throw new AiIntegrationInputError('Informe o identificador do modelo.');

  const [existing] = await db.select().from(aiIntegrations).where(eq(aiIntegrations.provider, provider)).limit(1);
  const encryptedApiKey = apiKey ? encryptKey(apiKey) : existing?.encryptedApiKey;
  if (!encryptedApiKey) throw new AiIntegrationInputError('Informe uma chave de API para este provedor.');

  if (primary) {
    await db.update(aiIntegrations).set({ enabled: false, primary: false, updatedAt: new Date() });
  }

  const values = {
    provider,
    model,
    encryptedApiKey,
    enabled,
    primary,
    updatedByUserId: input.updatedByUserId,
    updatedAt: new Date(),
  };
  const [saved] = existing
    ? await db.update(aiIntegrations).set(values).where(eq(aiIntegrations.id, existing.id)).returning()
    : await db.insert(aiIntegrations).values(values).returning();

  return toSettings(saved!);
}

export async function testAiIntegration(input: {
  provider: unknown;
  model: unknown;
  apiKey: unknown;
}): Promise<void> {
  const provider = validateProvider(input.provider);
  const model = typeof input.model === 'string' ? input.model.trim().slice(0, 120) : '';
  const suppliedApiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  const [existing] = await db.select().from(aiIntegrations).where(eq(aiIntegrations.provider, provider)).limit(1);
  const apiKey = suppliedApiKey || (existing ? decryptKey(existing.encryptedApiKey) : '');
  if (!model || !apiKey) throw new AiIntegrationInputError('Informe modelo e chave para testar a integração.');
  await classifyCopilotMessage({ provider, model, apiKey }, 'Ola. Responda com a intencao help.');
}

export async function assertAiUsageWithinLimits(userId: number): Promise<void> {
  const since = startOfToday();
  const perUserLimit = positiveLimit(process.env['AI_USER_DAILY_LIMIT'], 20);
  const globalLimit = positiveLimit(process.env['AI_GLOBAL_DAILY_LIMIT'], 500);
  const externalUsage = and(gte(aiUsageEvents.createdAt, since), ne(aiUsageEvents.provider, 'deterministic'));
  const [[userUsage], [globalUsage]] = await Promise.all([
    db.select({ total: count() }).from(aiUsageEvents).where(and(eq(aiUsageEvents.userId, userId), externalUsage)),
    db.select({ total: count() }).from(aiUsageEvents).where(externalUsage),
  ]);
  if ((userUsage?.total ?? 0) >= perUserLimit) {
    throw new AiUsageLimitError('O limite diário de uso de IA deste usuário foi atingido.');
  }
  if ((globalUsage?.total ?? 0) >= globalLimit) {
    throw new AiUsageLimitError('O limite diário global de uso de IA foi atingido.');
  }
}

export async function recordAiUsage(input: {
  userId: number;
  profileId: number;
  provider: AiProviderName | 'deterministic';
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  status: 'success' | 'error' | 'limited';
}): Promise<void> {
  await db.insert(aiUsageEvents).values({
    userId: input.userId,
    profileId: input.profileId,
    provider: input.provider,
    model: input.model ?? null,
    inputTokens: input.inputTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
    status: input.status,
  });
}
