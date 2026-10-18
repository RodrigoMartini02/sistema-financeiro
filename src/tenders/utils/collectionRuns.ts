import type { BackfillStopReason, CollectionRun, ContractsCollection } from '../types';
import { formatIsoDate } from './dates';

// Histórico da coleta (Configurações → Coleta): duração e erros de cada
// execução, o andamento da carga inicial de contratos, o período lido pela
// coleta diária de contratos, com a recuperação de dias e a reconsulta dos
// aditivos, e o arquivo bruto de cada coleta.

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
  pncp: 'Parou porque a fonte dos dados não respondeu; continua na próxima rotina.',
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

export interface DailyCollectionSummary {
  /** "12/10/2026 a 13/10/2026"; sem as consultas nem o período nos detalhes, null. */
  period: string | null;
  /** Recuperação de dias sem coleta e reconsulta dos aditivos, quando houver. */
  notes: string[];
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const PNCP_DAY = /^(\d{4})(\d{2})(\d{2})$/;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isoDay = (value: unknown): string | null => (typeof value === 'string' && ISO_DAY.test(value) ? value : null);
const countOf = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);
const contractCount = (total: number) => `${total.toLocaleString('pt-BR')} ${total === 1 ? 'contrato' : 'contratos'}`;

/** Dia do PNCP (AAAAMMDD) em AAAA-MM-DD; fora do formato, null. */
function pncpDayAsIso(value: unknown): string | null {
  const parts = typeof value === 'string' ? PNCP_DAY.exec(value) : null;
  return parts ? `${parts[1]}-${parts[2]}-${parts[3]}` : null;
}

/** Reconsulta dos aditivos que falharam antes, em texto; sem nada a dizer, nenhuma linha. */
function termsRetryNotes(retry: unknown): string[] {
  if (!isRecord(retry)) return [];
  const checked = countOf(retry['checked']);
  const remaining = Math.max(0, countOf(retry['pendingAtStart']) - countOf(retry['resolved']));
  const notes: string[] = [];
  if (checked > 0) {
    const pending = remaining === 0 ? 'nenhum pendente' : `${remaining.toLocaleString('pt-BR')} ainda ${remaining === 1 ? 'pendente' : 'pendentes'}`;
    notes.push(`Aditivos reconsultados em ${contractCount(checked)}; ${pending}.`);
  } else if (remaining > 0) {
    notes.push(`${contractCount(remaining)} com aditivos pendentes; reconsulta na próxima rotina.`);
  }
  if (retry['stoppedByFailures'] === true) {
    notes.push('A reconsulta dos aditivos parou porque a fonte dos dados não respondeu; continua na próxima rotina.');
  }
  return notes;
}

/**
 * Coleta diária de contratos, para o bloco "Contratos" da coleta: o período
 * lido (das consultas gravadas; execução antiga, do período) e as notas. Uma
 * consulta que terminou antes de hoje está recuperando dias sem coleta.
 */
export function dailyCollectionSummary(run: Pick<CollectionRun, 'details'>): DailyCollectionSummary {
  const queries = Array.isArray(run.details['queries']) ? run.details['queries'].filter(isRecord) : [];
  const starts = queries.map((query) => isoDay(query['from'])).filter((day): day is string => day !== null).sort();
  const ends = queries.map((query) => isoDay(query['to'])).filter((day): day is string => day !== null).sort();
  const period = isRecord(run.details['period']) ? run.details['period'] : {};
  const from = starts[0] ?? pncpDayAsIso(period['dataInicial']);
  const to = ends.at(-1) ?? pncpDayAsIso(period['dataFinal']);

  const notes: string[] = [];
  const today = isoDay(run.details['today']);
  const earliestEnd = ends[0];
  if (today && earliestEnd && earliestEnd < today) {
    notes.push(`Recuperando dias sem coleta: lido até ${formatIsoDate(earliestEnd)}; continua na próxima rotina.`);
  }
  notes.push(...termsRetryNotes(run.details['termsRetry']));

  return { period: from && to ? `${formatIsoDate(from)} a ${formatIsoDate(to)}` : null, notes };
}

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = 1024 * 1024;

/** "512 KB" abaixo de 1 MB; acima, "12,4 MB". */
function sizeLabel(bytes: number): string {
  if (bytes < BYTES_PER_MB) {
    return `${Math.max(1, Math.round(bytes / BYTES_PER_KB)).toLocaleString('pt-BR')} KB`;
  }
  return `${(bytes / BYTES_PER_MB).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

/**
 * Arquivo bruto da execução (`detalhes.archive`), em texto: "Desligado",
 * "Nenhum arquivo" ou "3 arquivos · 12,4 MB", com as falhas de envio. Sem o
 * resumo (execução antiga, ou que não grava no arquivo), null.
 */
export function archiveSummaryLabel(run: Pick<CollectionRun, 'details'>): string | null {
  const archive = run.details['archive'];
  if (!isRecord(archive) || typeof archive['enabled'] !== 'boolean') {
    return null;
  }
  if (!archive['enabled']) {
    return 'Desligado';
  }
  const files = countOf(archive['files']);
  const failures = countOf(archive['failures']);
  const sent = files === 0 ? 'Nenhum arquivo' : `${files.toLocaleString('pt-BR')} ${files === 1 ? 'arquivo' : 'arquivos'} · ${sizeLabel(countOf(archive['bytes']))}`;
  if (failures === 0) {
    return sent;
  }
  return `${sent} · ${failures.toLocaleString('pt-BR')} ${failures === 1 ? 'falha' : 'falhas'} no envio`;
}
