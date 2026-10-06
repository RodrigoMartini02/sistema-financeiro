import { databaseHost } from '../modules/tenders/collector/config';
import { createCollectorLogger, type CollectorLogger } from '../modules/tenders/collector/logger';
import { runCleanup, runDeadlineReminders, runSweep, type CollectorContext, type RunOutcome } from '../modules/tenders/collector/runs';
import { createCollectorRuntime, type CollectorRuntime } from '../modules/tenders/collector/runtime';
import { dailyJobSteps, planLifecycleUrl, type DailyJobStep } from './dailyJobSteps';

// Rotina diária do Cron Job do Render (`npm run daily-jobs`, scripts/dailyJobs.ts).
// As etapas rodam em sequência; uma etapa que falha não impede as seguintes.
// O log sai em JSON, uma linha por evento, como o do coletor.

type TendersStep = Exclude<DailyJobStep, 'plan-lifecycle'>;

const TENDERS_RUNS: Record<TendersStep, (context: CollectorContext) => Promise<RunOutcome>> = {
  'tenders-sweep': runSweep,
  'tenders-deadline-reminders': runDeadlineReminders,
  'tenders-cleanup': runCleanup,
};

const PLAN_LIFECYCLE_TIMEOUT_MS = 120_000;

type StepResult = 'success' | 'skipped';

/** Rotina de vencimento de planos: a mesma rota que o Cron Job chamava com curl. */
async function runPlanLifecycle(env: NodeJS.ProcessEnv, logger: CollectorLogger): Promise<StepResult> {
  const secret = env['BILLING_CRON_SECRET']?.trim();
  if (!secret) {
    throw new Error('BILLING_CRON_SECRET não definida: a rotina de planos não foi chamada');
  }

  const response = await fetch(planLifecycleUrl(env['BACKEND_URL']), {
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
  return 'success';
}

/** Uma execução do coletor. FALHA vira erro; coleta pulada (trava ocupada) não. */
async function runTendersStep(step: TendersStep, context: CollectorContext): Promise<StepResult> {
  const outcome = await TENDERS_RUNS[step](context);
  if (outcome.skipped) {
    context.logger.warn('Etapa pulada', { step, reason: outcome.reason });
    return 'skipped';
  }
  if (outcome.status === 'FALHA') {
    throw new Error(`A execução ${outcome.runId} do coletor terminou com FALHA`);
  }
  return 'success';
}

/** Roda as etapas do dia. Devolve true se nenhuma falhou. */
export async function runDailyJobs(env: NodeJS.ProcessEnv, now: Date = new Date()): Promise<boolean> {
  const logger = createCollectorLogger('info');
  const steps = dailyJobSteps(now);
  const failedSteps: DailyJobStep[] = [];
  const collector: { runtime: CollectorRuntime | null } = { runtime: null };

  // O banco do coletor só é aberto na primeira etapa de Licitações.
  const collectorContext = (): CollectorContext => {
    if (!collector.runtime) {
      collector.runtime = createCollectorRuntime(env);
      logger.info('Coletor de licitações', { database: databaseHost(collector.runtime.context.config.databaseUrl) });
    }
    return collector.runtime.context;
  };

  logger.info('Rotina diária iniciada', { steps });
  try {
    for (const step of steps) {
      const startedAt = Date.now();
      logger.info('Etapa iniciada', { step });
      try {
        const result =
          step === 'plan-lifecycle' ? await runPlanLifecycle(env, logger) : await runTendersStep(step, collectorContext());
        logger.info('Etapa finalizada', { step, result, durationMs: Date.now() - startedAt });
      } catch (error) {
        failedSteps.push(step);
        logger.error('Etapa falhou', { step, durationMs: Date.now() - startedAt, error });
      }
    }
  } finally {
    if (collector.runtime) {
      await collector.runtime.close();
    }
  }

  logger.info('Rotina diária finalizada', { failedSteps });
  return failedSteps.length === 0;
}
