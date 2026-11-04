import type { BackfillStopReason, CollectionRun, ContractsCollection, FederalCollection, FederalSkipReason, FederalStopReason } from '../types';
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

const DAY_MS = 24 * 60 * 60 * 1000;
/** Mais que isso entre o último dia com dado da fonte e hoje já não é fim de semana nem atraso normal. */
const SOURCE_BEHIND_DAYS = 3;

/** Linhas dos vencedores na base (licitação e fornecedor), para o bloco "Vencedores"; sem cópia pronta ou sem publicação, "—". */
export function winnersRowsLabel(rows: number | null): string {
  if (rows === null) return '—';
  return `${rows.toLocaleString('pt-BR')} ${rows === 1 ? 'linha' : 'linhas'}`;
}

export interface WinnersDailySummary {
  /** "14/09/2026 a 26/10/2026": a janela que a coleta diária leu; sem as consultas nem o período nos detalhes, null. */
  period: string | null;
  /** O último dia em que a fonte tinha registro (AAAA-MM-DD); a coleta nunca lê além dele. */
  sourceLastDay: string | null;
  /** Avisos curtos: a fonte atrás do calendário. */
  notes: string[];
}

function daysBetweenIso(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * Coleta diária de vencedores, para o bloco "Vencedores": a janela lida (o início e o fim pedidos à fonte) e o último
 * dia com dado dela. A fonte pode ficar semanas sem registro novo (medido em outubro de 2026): se o último dia com dado
 * está bem atrás de hoje, a nota avisa que a coleta continua de onde a fonte parou.
 */
export function winnersDailySummary(run: Pick<CollectionRun, 'details'>): WinnersDailySummary {
  const queries = Array.isArray(run.details['queries']) ? run.details['queries'].filter(isRecord) : [];
  const query = queries[0];
  const period = isRecord(run.details['period']) ? run.details['period'] : {};
  const from = isoDay(query?.['from']) ?? pncpDayAsIso(period['dataInicial']);
  const to = isoDay(query?.['windowTo']) ?? isoDay(query?.['to']) ?? pncpDayAsIso(period['dataFinal']);
  const sourceLastDay = isoDay(run.details['sourceLastDay']);
  const today = isoDay(run.details['today']);

  const notes: string[] = [];
  if (sourceLastDay && today && daysBetweenIso(sourceLastDay, today) > SOURCE_BEHIND_DAYS) {
    notes.push(`A fonte só tem resultados até ${formatIsoDate(sourceLastDay)}; a coleta continua de onde ela parou.`);
  }
  return { period: from && to ? `${formatIsoDate(from)} a ${formatIsoDate(to)}` : null, sourceLastDay, notes };
}

const FEDERAL_STOP_LABELS: Record<FederalStopReason, string> = {
  time: 'parou no limite de tempo do bloco; continua na próxima rotina.',
  source: 'parou porque a fonte dos dados não respondeu; continua na próxima rotina.',
};

const FEDERAL_SKIP_LABELS: Record<FederalSkipReason, string> = {
  withPncpNumber: 'já constam na base nacional',
  excluded: 'excluídos na origem',
  recent: 'recentes demais (esperam a carência)',
  agencyWithoutCnpj: 'de órgão sem CNPJ',
  termEndsBeforeStart: 'com o fim da vigência antes do início',
  pncpTwin: 'iguais a um contrato da base nacional, sem o vínculo da fonte',
};

const agencyCount = (total: number) => `${total.toLocaleString('pt-BR')} ${total === 1 ? 'órgão' : 'órgãos'}`;

export interface FederalSummary {
  loadStatus: 'Carga não iniciada' | 'Carga em andamento' | 'Carga concluída';
  /** "37 de 1.159 órgãos lidos desde 2021"; sem órgão na lista, null. */
  progress: string | null;
  /** O dia (AAAA-MM-DD) da inclusão mais recente que a fonte tem; sem leitura, null. */
  sourceUntil: string | null;
  /** Avisos curtos: a parada de cada bloco, a fonte atrás do calendário, janelas incompletas e as linhas que não entraram. */
  notes: string[];
}

/**
 * Contratos federais, para o bloco da coleta: o andamento da carga por órgão, até quando a fonte tem dado e as notas das
 * últimas execuções. A fonte pode ficar semanas sem dado novo (parada desde o começo de setembro de 2026): se o último
 * dado está bem atrás de hoje, a nota avisa, sem tratar como falha.
 */
export function federalSummary(federal: FederalCollection, todayIso: string): FederalSummary {
  const progress =
    federal.agencies === 0 ? null : `${federal.loaded.toLocaleString('pt-BR')} de ${agencyCount(federal.agencies)} lidos desde ${federal.fromYear}`;
  const loadStatus: FederalSummary['loadStatus'] =
    federal.agencies > 0 && federal.loaded >= federal.agencies ? 'Carga concluída' : federal.loaded > 0 || federal.load !== null ? 'Carga em andamento' : 'Carga não iniciada';
  const sourceUntil = isoDay(federal.sourceUntil?.slice(0, 10));

  const notes: string[] = [];
  if (federal.load?.stoppedBy) notes.push(`A última carga ${FEDERAL_STOP_LABELS[federal.load.stoppedBy]}`);
  if (federal.cycle?.stoppedBy) notes.push(`O último ciclo ${FEDERAL_STOP_LABELS[federal.cycle.stoppedBy]}`);
  const incomplete = (federal.load?.incompleteWindows ?? 0) + (federal.cycle?.incompleteWindows ?? 0);
  if (incomplete > 0) {
    notes.push(`A fonte não entregou completas ${incomplete.toLocaleString('pt-BR')} ${incomplete === 1 ? 'janela' : 'janelas'}; elas são lidas de novo na próxima rotina.`);
  }
  const skipped = federal.cycle?.skipped ?? federal.load?.skipped ?? null;
  if (skipped) {
    const parts = (Object.keys(FEDERAL_SKIP_LABELS) as FederalSkipReason[])
      .filter((reason) => skipped[reason] > 0)
      .map((reason) => `${skipped[reason].toLocaleString('pt-BR')} ${FEDERAL_SKIP_LABELS[reason]}`);
    if (parts.length > 0) notes.push(`Linhas lidas que não entraram na última execução: ${parts.join(', ')}.`);
  }
  if (sourceUntil && daysBetweenIso(sourceUntil, todayIso) > SOURCE_BEHIND_DAYS) {
    notes.push(`A fonte só tem contratos incluídos até ${formatIsoDate(sourceUntil)}; a coleta continua de onde ela parou.`);
  }
  return { loadStatus, progress, sourceUntil, notes };
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
