import { brasiliaDate } from '../modules/tenders/collector/dates';

// Etapas da rotina diária (o Cron Job do Render roda `npm run daily-jobs` uma
// vez por dia). Parte pura: a execução fica em dailyJobs.ts.

export const DAILY_JOB_STEPS = ['plan-lifecycle', 'tenders-sweep', 'tenders-deadline-reminders', 'tenders-cleanup'] as const;
export type DailyJobStep = (typeof DAILY_JOB_STEPS)[number];

const DEFAULT_BACKEND_URL = 'https://sistema-financeiro-backend-o199.onrender.com';
const PLAN_LIFECYCLE_PATH = '/api/internal-jobs/plan-lifecycle';

/** Domingo no calendário de Brasília: a limpeza do coletor é semanal. */
function isSundayInBrasilia(instant: Date): boolean {
  const [year, month, day] = brasiliaDate(instant).split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay() === 0;
}

/**
 * Etapas do dia, na ordem: a rotina de planos (rápida) primeiro, depois a
 * varredura de Licitações, os lembretes de prazo e, aos domingos, a limpeza.
 */
export function dailyJobSteps(now: Date): DailyJobStep[] {
  const steps: DailyJobStep[] = ['plan-lifecycle', 'tenders-sweep', 'tenders-deadline-reminders'];
  if (isSundayInBrasilia(now)) {
    steps.push('tenders-cleanup');
  }
  return steps;
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
