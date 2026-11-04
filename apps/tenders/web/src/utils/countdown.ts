// Contagem regressiva do prazo de proposta (escopo, seção 9.4): âmbar com
// menos de 7 dias, vermelho com menos de 2; sem prazo e encerrado à parte.

export type CountdownTone = 'normal' | 'warning' | 'danger' | 'closed' | 'none';

export interface Countdown {
  label: string;
  tone: CountdownTone;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WARNING_DAYS = 7;
const DANGER_DAYS = 2;

export const NO_DEADLINE_LABEL = 'Sem prazo informado';
export const CLOSED_LABEL = 'Encerrado';

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function remainingLabel(remainingMs: number): string {
  if (remainingMs >= DAY_MS) {
    return `Encerra em ${plural(Math.floor(remainingMs / DAY_MS), 'dia', 'dias')}`;
  }
  if (remainingMs >= HOUR_MS) {
    return `Encerra em ${plural(Math.floor(remainingMs / HOUR_MS), 'hora', 'horas')}`;
  }
  return `Encerra em ${plural(Math.max(1, Math.ceil(remainingMs / MINUTE_MS)), 'minuto', 'minutos')}`;
}

/** Rótulo e tom do prazo (`closesAt` em ISO com fuso) em relação a `now`. */
export function countdownFor(closesAt: string | null | undefined, now: Date): Countdown {
  const closesAtMs = closesAt ? new Date(closesAt).getTime() : Number.NaN;
  if (Number.isNaN(closesAtMs)) {
    return { label: NO_DEADLINE_LABEL, tone: 'none' };
  }
  const remainingMs = closesAtMs - now.getTime();
  if (remainingMs <= 0) {
    return { label: CLOSED_LABEL, tone: 'closed' };
  }
  const tone: CountdownTone = remainingMs < DANGER_DAYS * DAY_MS ? 'danger' : remainingMs < WARNING_DAYS * DAY_MS ? 'warning' : 'normal';
  return { label: remainingLabel(remainingMs), tone };
}
