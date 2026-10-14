import type { BackfillStopReason, CollectionRun, ContractsCollection } from '../types';
import { formatIsoDate } from './dates';

// Histórico da coleta (Configurações → Coleta): duração e erros de cada
// execução, e o andamento da carga inicial de contratos.

const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 60 * MINUTE_SECONDS;
const pad = (value: number) => String(value).padStart(2, '0');

/** "45 s", "3 min 05 s" ou "1 h 02 min"; sem fim (executando) ou sem início, "—". */
export function runDurationLabel(run: Pick<CollectionRun, 'startedAt' | 'finishedAt'>): string {
  if (!run.startedAt || !run.finishedAt) return '—';
  const seconds = Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < MINUTE_SECONDS) return `${seconds} s`;
  if (seconds < HOUR_SECONDS) return `${Math.floor(seconds / MINUTE_SECONDS)} min ${pad(seconds % MINUTE_SECONDS)} s`;
  return `${Math.floor(seconds / HOUR_SECONDS)} h ${pad(Math.floor((seconds % HOUR_SECONDS) / MINUTE_SECONDS))} min`;
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Erros guardados nos detalhes, em texto: registro recusado ("controle:
 * motivo"), pedido ao PNCP e falha geral ("mensagem"). Os que passaram do
 * limite aparecem só como total.
 */
export function runErrorLines(run: Pick<CollectionRun, 'details'>): string[] {
  const lines = (run.details.errors ?? []).map((error) => {
    const reason = textOf(error['reason']) ?? textOf(error['message']);
    const controlNumber = textOf(error['controlNumber']);
    if (reason) return controlNumber ? `${controlNumber}: ${reason}` : reason;
    return JSON.stringify(error);
  });
  const omitted = run.details.omittedErrors ?? 0;
  if (omitted > 0) {
    lines.push(`e mais ${omitted.toLocaleString('pt-BR')} ${omitted === 1 ? 'erro' : 'erros'} não guardados`);
  }
  return lines;
}

const BACKFILL_STOP_LABELS: Record<BackfillStopReason, string> = {
  time: 'Parou no limite de tempo do bloco; continua na próxima rotina.',
  space: 'Parou no limite de espaço do banco.',
  pncp: 'Parou porque o PNCP não respondeu; continua na próxima rotina.',
};

export interface BackfillSummary {
  status: 'Carga não iniciada' | 'Carga em andamento' | 'Carga concluída';
  /** "1.234 de 2.100 dias"; sem execução terminada, os dias já carregados. */
  progress: string | null;
  /** O dia mais antigo já carregado e, se parou antes de terminar, o motivo. */
  notes: string[];
}

const dayCount = (days: number) => `${days.toLocaleString('pt-BR')} ${days === 1 ? 'dia' : 'dias'}`;

/** Andamento da carga inicial de contratos, para o bloco "Contratos" da coleta. */
export function backfillSummary(backfill: ContractsCollection['backfill']): BackfillSummary {
  const notes = backfill.oldestDay ? [`Dia mais antigo carregado: ${formatIsoDate(backfill.oldestDay)}.`] : [];
  const run = backfill.lastRun;
  if (!run) {
    if (backfill.completedDays === 0) {
      return { status: 'Carga não iniciada', progress: null, notes };
    }
    const loaded = backfill.completedDays === 1 ? 'carregado' : 'carregados';
    return { status: 'Carga em andamento', progress: `${dayCount(backfill.completedDays)} ${loaded}`, notes };
  }

  const progress = `${(run.totalDays - run.pendingDays).toLocaleString('pt-BR')} de ${dayCount(run.totalDays)}`;
  if (run.finished) {
    return { status: 'Carga concluída', progress, notes };
  }
  return { status: 'Carga em andamento', progress, notes: run.stoppedBy ? [...notes, BACKFILL_STOP_LABELS[run.stoppedBy]] : notes };
}
