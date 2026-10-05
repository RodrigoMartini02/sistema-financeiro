import { z } from 'zod/v4';
import { BRAZILIAN_STATES, DEFAULT_COLLECTED_MODALITIES, TENDER_MODALITY_IDS, type BrazilianState } from '../domains';
import { LOG_LEVELS, type LogLevel } from './logger';

// Configuração do coletor, só por variáveis de ambiente (seção 6.2 do escopo).
// A URL do banco é obrigatória; as do PNCP têm padrão.

export interface PncpSettings {
  baseUrl: string;
  modalities: number[];
  states: BrazilianState[];
  horizonDays: number;
  pageSize: number;
  requestIntervalMs: number;
  timeoutMs: number;
  maxAttempts: number;
}

export interface CollectorConfig {
  databaseUrl: string;
  pncp: PncpSettings;
  logLevel: LogLevel;
}

export class CollectorConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectorConfigError';
  }
}

const splitList = (raw: string): string[] =>
  raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const collectorEnvSchema = z.object({
  TENDERS_COLLECTOR_DATABASE_URL: z
    .string({ error: 'obrigatória' })
    .regex(/^postgres(ql)?:\/\//, 'deve ser uma URL postgres://'),
  PNCP_BASE_URL: z.url().default('https://pncp.gov.br/api/consulta'),
  PNCP_MODALITIES: z
    .string()
    .default(DEFAULT_COLLECTED_MODALITIES.join(','))
    .transform((raw) => splitList(raw).map(Number))
    .pipe(
      z
        .array(
          z
            .number()
            .int()
            .refine((id) => TENDER_MODALITY_IDS.includes(id), 'modalidade desconhecida (1 a 13)'),
        )
        .min(1, 'informe ao menos uma modalidade'),
    ),
  PNCP_STATES: z
    .string()
    .default('')
    .transform((raw) => splitList(raw).map((state) => state.toUpperCase()))
    .pipe(z.array(z.enum(BRAZILIAN_STATES))),
  PNCP_HORIZON_DAYS: z.coerce.number().int().min(1).max(365).default(60),
  PNCP_PAGE_SIZE: z.coerce.number().int().min(10).max(50).default(50),
  PNCP_REQUEST_INTERVAL_MS: z.coerce.number().int().min(0).max(60_000).default(400),
  PNCP_TIMEOUT_S: z.coerce.number().int().min(1).max(300).default(30),
  PNCP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  TENDERS_COLLECTOR_LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

const ENV_KEYS = Object.keys(collectorEnvSchema.shape);

/** Lê e valida as variáveis do coletor. Variável vazia vale como não informada. */
export function loadCollectorConfig(env: NodeJS.ProcessEnv): CollectorConfig {
  const input = Object.fromEntries(
    ENV_KEYS.map((key) => {
      const value = env[key]?.trim();
      return [key, value === '' ? undefined : value];
    }),
  );

  const parsed = collectorEnvSchema.safeParse(input);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new CollectorConfigError(`Configuração do coletor inválida: ${problems}`);
  }

  const values = parsed.data;
  return {
    databaseUrl: values.TENDERS_COLLECTOR_DATABASE_URL,
    pncp: {
      baseUrl: values.PNCP_BASE_URL.replace(/\/+$/, ''),
      modalities: values.PNCP_MODALITIES,
      states: values.PNCP_STATES,
      horizonDays: values.PNCP_HORIZON_DAYS,
      pageSize: values.PNCP_PAGE_SIZE,
      requestIntervalMs: values.PNCP_REQUEST_INTERVAL_MS,
      timeoutMs: values.PNCP_TIMEOUT_S * 1000,
      maxAttempts: values.PNCP_MAX_ATTEMPTS,
    },
    logLevel: values.TENDERS_COLLECTOR_LOG_LEVEL,
  };
}

/** Host do banco para o log de partida, sem usuário nem senha. */
export function databaseHost(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    return `${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
  } catch {
    return 'URL do banco ilegível';
  }
}
