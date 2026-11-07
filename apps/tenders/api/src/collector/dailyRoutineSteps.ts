import { brasiliaDate } from './dates';

// Etapas da rotina diária de Licitações (`npm run daily-jobs`, uma vez por dia: no
// Cron Job do Render ou na máquina própria). Parte pura: a execução fica em
// dailyRoutine.ts. A rotina de planos de Finanças não faz parte dela.

export const DAILY_JOB_STEPS = [
  'tenders-sweep',
  'tenders-deadline-reminders',
  'tenders-contracts-daily',
  'tenders-federal-cycle',
  'tenders-contract-reminders',
  'tenders-winners-daily',
  'tenders-cleanup',
  'tenders-contracts-backfill',
  'tenders-federal-backfill',
  'tenders-winners-backfill',
] as const;
export type DailyJobStep = (typeof DAILY_JOB_STEPS)[number];

/** Domingo no calendário de Brasília: a limpeza do coletor é semanal. */
function isSundayInBrasilia(instant: Date): boolean {
  const [year, month, day] = brasiliaDate(instant).split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay() === 0;
}

/** As etapas dos vencedores (plano .plans/licitacoes-vencedores.md): só rodam com TENDERS_WINNERS_ENABLED=1. */
export const WINNERS_STEPS: ReadonlySet<DailyJobStep> = new Set(['tenders-winners-daily', 'tenders-winners-backfill']);

/** As etapas dos contratos federais (plano .plans/licitacoes-contratos-federais.md): só rodam com TENDERS_FEDERAL_ENABLED=1. */
export const FEDERAL_STEPS: ReadonlySet<DailyJobStep> = new Set(['tenders-federal-cycle', 'tenders-federal-backfill']);

/**
 * Etapas do dia, na ordem: a varredura de Licitações, os lembretes de prazo, as
 * atualizações PNCP e federal dos contratos, os avisos de vencimento e a coleta diária dos vencedores (curta e
 * diária: vai antes das cargas, que passam de 9 h), aos domingos a limpeza dos
 * editais, a carga inicial de contratos (a mais longa: só roda com dias
 * pendentes e com o R2 configurado) e, por último, as cargas dos
 * contratos federais e dos vencedores, que se adaptam ao tempo que
 * sobrar na rotina (planos dos vencedores e dos federais). Os contratos não
 * têm limpeza: os encerrados ficam na base (plano
 * .plans/licitacoes-base-nacional.md).
 */
export function dailyJobSteps(now: Date): DailyJobStep[] {
  const steps: DailyJobStep[] = [
    'tenders-sweep',
    'tenders-deadline-reminders',
    'tenders-contracts-daily',
    'tenders-federal-cycle',
    'tenders-contract-reminders',
    'tenders-winners-daily',
  ];
  if (isSundayInBrasilia(now)) {
    steps.push('tenders-cleanup');
  }
  steps.push('tenders-contracts-backfill', 'tenders-federal-backfill', 'tenders-winners-backfill');
  return steps;
}
