import { z } from 'zod/v4';

export interface ObjectStorageSettings {
  /** Endpoint S3 da conta no R2 (https://<conta>.r2.cloudflarestorage.com). */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Pasta do ambiente no bucket (`producao`, `local`): nada de um ambiente encosta no outro. */
  prefix: string;
}

/** Pasta da produção no bucket: nunca usada a partir do banco local. */
export const PRODUCTION_STORAGE_PREFIX = 'producao';

export class ObjectStorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ObjectStorageConfigError';
  }
}

const storageEnvSchema = z.object({
  R2_ENDPOINT: z.url({ protocol: /^https$/, error: 'deve ser uma URL https://' }).optional(),
  // Regra de nome de bucket do R2: minúsculas, números e hífen, de 3 a 63 caracteres.
  R2_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, 'nome de bucket inválido (minúsculas, números e hífen)')
    .optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_STORAGE_PREFIX: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,30}$/, 'pasta inválida (minúsculas, números e hífen, até 31 caracteres)')
    .optional(),
});

const STORAGE_ENV_KEYS = Object.keys(storageEnvSchema.shape) as Array<keyof z.infer<typeof storageEnvSchema>>;

const STORAGE_ENV_ALIASES = {
  "R2_ENDPOINT": "TENDERS_ARCHIVE_ENDPOINT",
  "R2_BUCKET": "TENDERS_ARCHIVE_BUCKET",
  "R2_ACCESS_KEY_ID": "TENDERS_ARCHIVE_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY": "TENDERS_ARCHIVE_SECRET_ACCESS_KEY",
  "R2_STORAGE_PREFIX": "TENDERS_STORAGE_PREFIX"
} as const;

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Variável vazia vale como não informada. */
function readStorageEnv(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return Object.fromEntries(
    STORAGE_ENV_KEYS.map((key) => {
      const value = env[key]?.trim() || env[STORAGE_ENV_ALIASES[key]]?.trim();
      return [key, value === '' ? undefined : value];
    }),
  );
}

function isLocalDatabase(databaseUrl: string): boolean {
  try {
    return LOCAL_DATABASE_HOSTS.has(new URL(databaseUrl).hostname);
  } catch {
    return false;
  }
}

/**
 * As 5 variáveis do R2 (as 4 da conta e a pasta do ambiente), todas ou nenhuma: sem nenhuma, o R2 fica desligado;
 * parte delas é erro de configuração. Com o banco local, a pasta da produção é recusada: um teste local nunca grava
 * nos dados da produção. As mensagens só citam nomes de variáveis, nunca os valores.
 */
export function loadObjectStorageSettings(env: NodeJS.ProcessEnv, databaseUrl: string): ObjectStorageSettings | null {
  const parsed = storageEnvSchema.safeParse(readStorageEnv(env));
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new ObjectStorageConfigError(`Configuração do R2 inválida: ${problems}`);
  }

  const {
    R2_ENDPOINT: endpoint,
    R2_BUCKET: bucket,
    R2_ACCESS_KEY_ID: accessKeyId,
    R2_SECRET_ACCESS_KEY: secretAccessKey,
    R2_STORAGE_PREFIX: prefix,
  } = parsed.data;
  if (!(endpoint && bucket && accessKeyId && secretAccessKey && prefix)) {
    const missing = STORAGE_ENV_KEYS.filter((key) => !parsed.data[key]);
    if (missing.length === STORAGE_ENV_KEYS.length) {
      return null;
    }
    throw new ObjectStorageConfigError(
      `Configuração do R2 inválida: o R2 precisa das 5 variáveis (todas ou nenhuma); faltam ${missing.join(', ')}`,
    );
  }
  if (prefix === PRODUCTION_STORAGE_PREFIX && isLocalDatabase(databaseUrl)) {
    throw new ObjectStorageConfigError(
      `Configuração do R2 inválida: R2_STORAGE_PREFIX=${PRODUCTION_STORAGE_PREFIX} com o banco local; use outra pasta (ex.: local)`,
    );
  }
  return { endpoint: endpoint.replace(/\/+$/, ''), bucket, accessKeyId, secretAccessKey, prefix };
}
