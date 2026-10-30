import { databaseHost } from '../modules/tenders/collector/config';
import { runContractReminders, runContractsBackfill, runContractsDaily } from '../modules/tenders/collector/contractRuns';
import { runFederalCycle, runFederalLoad } from '../modules/tenders/collector/federalRuns';
import { createCollectorLogger, type CollectorLogger } from '../modules/tenders/collector/logger';
import { runResultsBackfill, runResultsDaily } from '../modules/tenders/collector/resultRuns';
import { runCleanup, runDeadlineReminders, runSweep, type CollectorContext, type RunOutcome } from '../modules/tenders/collector/runs';
import { createCollectorRuntime, type CollectorRuntime } from '../modules/tenders/collector/runtime';
import type { ObjectStorageMetrics } from '../modules/tenders/objectStorage';
import { FEDERAL_STEPS, WINNERS_STEPS, dailyJobSteps, planLifecycleUrl, type DailyJobStep } from './dailyJobSteps';

// Rotina diária do Cron Job do Render (`npm run daily-jobs`, scripts/dailyJobs.ts).
// As etapas rodam em sequência; uma etapa que falha não impede as seguintes.
// O log sai em JSON, uma linha por evento, como o do coletor.

export type TendersStep = Exclude<DailyJobStep, 'plan-lifecycle'>;

/** O que cada etapa recebe além do contexto: o instante em que a rotina inteira precisa ter acabado. */
export interface StepLimits {
  deadlineAt: number;
}

const TENDERS_RUNS: Record<TendersStep, (context: CollectorContext, limits: StepLimits) => Promise<RunOutcome>> = {
  'tenders-sweep': runSweep,
  'tenders-deadline-reminders': runDeadlineReminders,
  'tenders-contracts-daily': (context, { deadlineAt }) => runContractsDaily(context, { deadlineAt }),
  'tenders-contract-reminders': runContractReminders,
  // Só com TENDERS_WINNERS_ENABLED=1 (ver runTendersStep).
  'tenders-winners-daily': runResultsDaily,
  'tenders-cleanup': runCleanup,
  // Sem o R2 configurado, sem dia pendente ou sem tempo na rotina, a etapa é pulada com o motivo no log.
  'tenders-contracts-backfill': (context, { deadlineAt }) => runContractsBackfill(context, { deadlineAt }),
  // Só com TENDERS_FEDERAL_ENABLED=1 (ver runTendersStep). Usam só o tempo que sobrar da rotina.
  'tenders-federal-cycle': (context, { deadlineAt }) => runFederalCycle(context, { deadlineAt }),
  'tenders-federal-backfill': (context, { deadlineAt }) => runFederalLoad(context, { deadlineAt }),
  // A carga dos vencedores usa só o tempo que sobrar da rotina, e sem tempo a etapa é pulada (não falha).
  'tenders-winners-backfill': (context, { deadlineAt }) => runResultsBackfill(context, { deadlineAt }),
};

const PLAN_LIFECYCLE_TIMEOUT_MS = 120_000;
/**
 * Prazo da rotina inteira para as cargas em blocos: o Cron Job do Render tem limite de 12 h por execução, e esta é a
 * margem de 30 min antes dele. A carga de contratos e as etapas dos federais e dos vencedores usam só o tempo que
 * sobrar (menos a folga de cada bloco), e uma etapa sem tempo é pulada, sem falhar.
 */
const ROUTINE_DEADLINE_MINUTES = 690;
const BYTES_PER_MB = 1024 * 1024;

export type StepResult = 'success' | 'skipped';

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

/** Memória residente do processo em MB: a rotina roda todas as etapas no mesmo processo, e é o que o log acompanha. */
function rssMb(): number {
  return Math.round(process.memoryUsage().rss / BYTES_PER_MB);
}

/** Só métricas: uma falha de medição não impede uma etapa independente. */
export async function collectorResourceMetrics(context: CollectorContext, phase: string) {
  if (context.resourceBudget) {
    try {
      await context.resourceBudget.sample(phase);
    } catch {
      // A admissão do trabalho faz sua própria verificação estrita de capacidade.
      // O resumo conserva a falha de medição e o último valor conhecido.
    }
  }
  return {
    resources: context.resourceBudget?.summary() ?? null,
    storage: context.storage?.metrics?.() ?? null,
  };
}

function storageDifference(after: ObjectStorageMetrics | null, before: ObjectStorageMetrics | null): ObjectStorageMetrics | null {
  if (!after) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(after).map(([key, value]) => [key, value - (before?.[key as keyof ObjectStorageMetrics] ?? 0)]),
  ) as unknown as ObjectStorageMetrics;
}

/**
 * Uma execução do coletor. FALHA vira erro; coleta pulada (trava ocupada) não. As etapas dos vencedores só rodam com
 * TENDERS_WINNERS_ENABLED=1 e as dos contratos federais, com TENDERS_FEDERAL_ENABLED=1; desligadas, são puladas com o
 * motivo no log (os comandos da CLI funcionam sempre).
 */
export async function runTendersStep(step: TendersStep, context: CollectorContext, limits: StepLimits): Promise<StepResult> {
  if (WINNERS_STEPS.has(step) && !context.config.winners.enabled) {
    context.logger.info('Vencedores desligados: etapa pulada', { step });
    return 'skipped';
  }
  if (FEDERAL_STEPS.has(step) && !context.config.federal.enabled) {
    context.logger.info('Contratos federais desligados: etapa pulada', { step });
    return 'skipped';
  }
  const outcome = await TENDERS_RUNS[step](context, limits);
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
  const limits: StepLimits = { deadlineAt: now.getTime() + ROUTINE_DEADLINE_MINUTES * 60_000 };
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
      const storageBefore = collector.runtime?.context.storage?.metrics?.() ?? null;
      const before = collector.runtime ? await collectorResourceMetrics(collector.runtime.context, `${step}:inicio`) : {};
      logger.info('Etapa iniciada', { step, rssMb: rssMb(), ...before });
      try {
        const result =
          step === 'plan-lifecycle' ? await runPlanLifecycle(env, logger) : await runTendersStep(step, collectorContext(), limits);
        // O rssMb de cada etapa mostra, em produção, se a memória do processo volta ao nível de antes entre elas.
        const metrics = collector.runtime ? await collectorResourceMetrics(collector.runtime.context, `${step}:fim`) : null;
        logger.info('Etapa finalizada', {
          step,
          result,
          durationMs: Date.now() - startedAt,
          rssMb: rssMb(),
          ...metrics,
          storageDelta: storageDifference(metrics?.storage ?? null, storageBefore),
        });
      } catch (error) {
        failedSteps.push(step);
        const metrics = collector.runtime ? await collectorResourceMetrics(collector.runtime.context, `${step}:falha`) : null;
        logger.error('Etapa falhou', {
          step,
          durationMs: Date.now() - startedAt,
          error,
          ...metrics,
          storageDelta: storageDifference(metrics?.storage ?? null, storageBefore),
        });
      }
    }
  } finally {
    if (collector.runtime) {
      await collector.runtime.close();
    }
  }

  const metrics = collector.runtime ? await collectorResourceMetrics(collector.runtime.context, 'rotina:fim') : {};
  logger.info('Rotina diária finalizada', { failedSteps, ...metrics });
  return failedSteps.length === 0;
}
