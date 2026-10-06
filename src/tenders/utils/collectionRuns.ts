import type { CollectionRun } from '../types';

// Histórico da coleta (Configurações → Coleta): duração e erros de cada execução.

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
