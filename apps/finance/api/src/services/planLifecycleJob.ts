// Rotina de vencimento de planos de Finanças: chama a rota interna que o Cron Job do Render chamava com curl,
// com o segredo da rotina. Não abre banco. Fazia parte da rotina diária de Licitações; agora é um job de Finanças
// (`npm run finance:daily-jobs`, scripts/financeDailyJobs.ts). Plano .plans/separar-etapa-1-fronteiras-backend.md.

const DEFAULT_BACKEND_URL = 'https://sistema-financeiro-backend-o199.onrender.com';
const PLAN_LIFECYCLE_PATH = '/api/internal-jobs/plan-lifecycle';
const PLAN_LIFECYCLE_TIMEOUT_MS = 120_000;

type LogLevel = 'info' | 'error';
type LogContext = Record<string, unknown>;

export interface JobLogger {
  info(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

type LogWriter = (line: string, level: LogLevel) => void;

const writeToConsole: LogWriter = (line, level) => {
  if (level === 'error') {
    console.error(line);
    return;
  }
  console.log(line);
};

/** Erros viram { name, message }: o JSON.stringify de um Error sai vazio. */
function serializeContext(context: LogContext): LogContext {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      value instanceof Error ? { name: value.name, message: value.message } : value,
    ]),
  );
}

/** Log em JSON, uma linha por evento, no mesmo formato do coletor (os logs do Render leem a saída padrão). */
export function createJobLogger(write: LogWriter = writeToConsole): JobLogger {
  const log = (level: LogLevel, message: string, context: LogContext = {}) => {
    write(JSON.stringify({ level, time: new Date().toISOString(), msg: message, ...serializeContext(context) }), level);
  };
  return {
    info: (message, context) => log('info', message, context),
    error: (message, context) => log('error', message, context),
  };
}

/** Endereço da rotina de planos no backend. `BACKEND_URL` vazia vale o padrão; inválida dá erro. */
export function planLifecycleUrl(backendUrl: string | undefined): string {
  const base = backendUrl?.trim() || DEFAULT_BACKEND_URL;
  const url = `${base.replace(/\/+$/, '')}${PLAN_LIFECYCLE_PATH}`;
  if (!URL.canParse(url) || !/^https?:$/.test(new URL(url).protocol)) {
    throw new Error('BACKEND_URL inválida: use o endereço do backend, como https://exemplo.onrender.com');
  }
  return url;
}

/** Chama a rotina de planos. Falha (sem segredo, resposta que não é 2xx ou rede) vira erro. */
export async function runPlanLifecycleJob(
  env: NodeJS.ProcessEnv,
  logger: JobLogger,
  fetchFunction: typeof fetch = fetch,
): Promise<void> {
  const secret = env['BILLING_CRON_SECRET']?.trim();
  if (!secret) {
    throw new Error('BILLING_CRON_SECRET não definida: a rotina de planos não foi chamada');
  }

  const response = await fetchFunction(planLifecycleUrl(env['BACKEND_URL']), {
    method: 'POST',
    headers: { 'x-billing-cron-secret': secret },
    signal: AbortSignal.timeout(PLAN_LIFECYCLE_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => null)) as { data?: unknown } | null;
  if (!response.ok) {
    throw new Error(`A rotina de planos respondeu HTTP ${response.status}`);
  }

  // A resposta só traz contadores (planos vencidos e avisos enviados).
  logger.info('Rotina de planos concluída', { result: payload?.data ?? null });
}
