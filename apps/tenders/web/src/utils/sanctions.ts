import { TendersApiError } from '../services/tendersApiError';
import type {
  SanctionBase,
  SanctionBaseResult,
  SanctionCheckResult,
  SanctionOverview,
  SanctionRecord,
  SanctionStatus,
} from '../types';
import { formatIsoDate, formatIsoDateTime } from './dates';

// Aba Sanções (plano .plans/licitacoes-6-sancoes.md): os nomes dos cadastros, os textos e as cores da situação, o resumo de cada
// cartão, quem o "Consultar todos" ainda precisa consultar e o laço que consulta um por vez. A situação (sem registro, em vigor,
// encerrada) vem pronta da API, calculada contra o dia de hoje; aqui só se mostra. Sem React, para ter teste.

/** Aviso fixo da aba: a consulta é automática e não substitui a certidão oficial. */
export const SANCTIONS_DISCLAIMER = 'Consulta automática. Confira sempre a certidão oficial antes da proposta.';
export const SANCTIONS_UNAVAILABLE_TEXT = 'A consulta de sanções está indisponível no momento.';
/** O selo de quem ainda não foi consultado quando a consulta está indisponível (sem a chave do portal). */
export const SANCTIONS_UNAVAILABLE_LABEL = 'Consulta indisponível';
export const SANCTIONS_NO_CNPJ_TEXT = 'Esta conta não tem CNPJ cadastrado, então a empresa não pode ser consultada.';

/** Os cadastros, com o nome por extenso (a tela cita o cadastro, nunca o site da fonte). */
export const SANCTION_BASE_NAMES: Readonly<Record<SanctionBase, { name: string; fullName: string }>> = {
  CEIS: { name: 'CEIS', fullName: 'Cadastro Nacional de Empresas Inidôneas e Suspensas' },
  CNEP: { name: 'CNEP', fullName: 'Cadastro Nacional de Empresas Punidas' },
  CEPIM: { name: 'CEPIM', fullName: 'Cadastro de Entidades Privadas sem Fins Lucrativos Impedidas' },
};

/** Os tons do selo (`Pill`). */
export type SanctionTone = 'success' | 'warning' | 'danger' | 'muted';

export const SANCTION_STATUS_LABELS: Record<SanctionStatus, string> = {
  NAO_CONSULTADO: 'Não consultado',
  SEM_REGISTRO: 'Sem registro encontrado',
  EM_VIGOR: 'Registro em vigor',
  ENCERRADA: 'Registros encerrados',
};

export const SANCTION_STATUS_TONES: Record<SanctionStatus, SanctionTone> = {
  NAO_CONSULTADO: 'muted',
  SEM_REGISTRO: 'success',
  EM_VIGOR: 'danger',
  ENCERRADA: 'warning',
};

/** "Não foi possível consultar o CEIS agora." / "...o CEIS e o CNEP agora." para as bases que falharam. */
export function failedBasesText(failed: readonly SanctionBase[]): string {
  const items = failed.map((base) => `o ${SANCTION_BASE_NAMES[base].name}`);
  const list = items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
  return `Não foi possível consultar ${list} agora. Tente de novo em instantes.`;
}

// --- Resumo de um cartão ----------------------------------------------------------------------------------------------------

export interface SanctionSummary {
  label: string;
  tone: SanctionTone;
}

/**
 * O selo do cartão (a empresa ou uma pessoa), pela pior situação entre as bases: registro em vigor; consulta incompleta (alguma
 * base sem consulta); registros só encerrados; sem registro. Nada consultado ainda: "Não consultado".
 */
export function summarizeSanctionBases(bases: readonly SanctionBaseResult[]): SanctionSummary {
  const statuses = bases.map((base) => base.status);
  if (statuses.includes('EM_VIGOR')) return { label: SANCTION_STATUS_LABELS.EM_VIGOR, tone: 'danger' };
  if (statuses.every((status) => status === 'NAO_CONSULTADO')) return { label: SANCTION_STATUS_LABELS.NAO_CONSULTADO, tone: 'muted' };
  if (statuses.includes('NAO_CONSULTADO')) return { label: 'Consulta incompleta', tone: 'warning' };
  if (statuses.includes('ENCERRADA')) return { label: SANCTION_STATUS_LABELS.ENCERRADA, tone: 'warning' };
  return { label: SANCTION_STATUS_LABELS.SEM_REGISTRO, tone: 'success' };
}

/** "Consultado em 11/11/2026 15:30", com o aviso quando a consulta tem mais de `staleDays` dias; nunca consultado: "Ainda não consultado." */
export function checkedAtText(base: Pick<SanctionBaseResult, 'checkedAt' | 'stale'>, staleDays: number): string {
  if (base.checkedAt === null) return 'Ainda não consultado.';
  const text = `Consultado em ${formatIsoDateTime(base.checkedAt)}`;
  return base.stale ? `${text} (há mais de ${staleDays} dias; consulte de novo)` : text;
}

// --- Registros -----------------------------------------------------------------------------------------------------------

/** O título do registro: o tipo da sanção (ou o motivo, no CEPIM). */
export function recordTitle(record: Pick<SanctionRecord, 'category'>): string {
  return record.category ?? 'Registro sem descrição';
}

/** O período da sanção: "De 01/01/2025 até 31/12/2026", "Desde 01/01/2025, sem data final"... O CEPIM não tem datas: null. */
export function recordPeriodText(record: Pick<SanctionRecord, 'startDate' | 'endDate'>, base: SanctionBase): string | null {
  if (base === 'CEPIM') return null;
  if (record.startDate !== null && record.endDate !== null) {
    return `De ${formatIsoDate(record.startDate)} até ${formatIsoDate(record.endDate)}`;
  }
  if (record.startDate !== null) return `Desde ${formatIsoDate(record.startDate)}, sem data final`;
  if (record.endDate !== null) return `Até ${formatIsoDate(record.endDate)}`;
  return 'Sem datas informadas';
}

/** As linhas de detalhe de um registro, na ordem em que a tela as mostra. */
export function recordDetailLines(record: SanctionRecord, base: SanctionBase): string[] {
  return [
    record.organ === null ? null : `Órgão: ${record.organ}`,
    recordPeriodText(record, base),
    record.legalBasis === null ? null : `Fundamento: ${record.legalBasis}`,
    record.process === null ? null : `Processo: ${record.process}`,
    record.note,
  ].filter((line): line is string => line !== null && line !== '');
}

/** "Ver 2 registros"; o plural e o singular. */
export function recordsToggleText(count: number): string {
  return count === 1 ? 'Ver 1 registro' : `Ver ${count} registros`;
}

// --- Quem consultar ------------------------------------------------------------------------------------------------------

export interface SanctionSubjectRef {
  /** Nulo: a empresa. */
  personId: number | null;
  /** O nome na tela (o progresso e o resultado do "Consultar todos"). */
  label: string;
}

const MS_PER_MINUTE = 60 * 1000;

/** Todas as bases foram consultadas há menos de `reuseMinutes` minutos (a API reaproveitaria o resultado)? */
export function isFreshlyChecked(bases: readonly SanctionBaseResult[], now: Date, reuseMinutes: number): boolean {
  return bases.every((base) => base.checkedAt !== null && now.getTime() - Date.parse(base.checkedAt) < reuseMinutes * MS_PER_MINUTE);
}

/**
 * Quem o "Consultar todos" ainda precisa consultar: a empresa (se a conta tem CNPJ) e cada pessoa que o titular vê, menos
 * quem foi consultado há menos de 15 minutos (a API reaproveitaria, e o limite por usuário não é gasto à toa).
 */
export function subjectsToCheck(overview: SanctionOverview, now: Date): SanctionSubjectRef[] {
  const subjects: SanctionSubjectRef[] = [];
  if (overview.company.cnpj !== null && !isFreshlyChecked(overview.company.bases, now, overview.reuseMinutes)) {
    subjects.push({ personId: null, label: 'Empresa' });
  }
  for (const person of overview.people ?? []) {
    if (!isFreshlyChecked(person.bases, now, overview.reuseMinutes)) {
      subjects.push({ personId: person.id, label: person.name });
    }
  }
  return subjects;
}

/** O resultado de uma consulta posto na leitura que a tela já tem: troca a empresa ou a pessoa consultada. */
export function applyCheckResult(overview: SanctionOverview, result: SanctionCheckResult): SanctionOverview {
  if (result.company !== null) {
    return { ...overview, company: result.company };
  }
  const person = result.person;
  if (person === null || overview.people === null) return overview;
  return { ...overview, people: overview.people.map((current) => (current.id === person.id ? person : current)) };
}

// --- O laço do "Consultar todos" -----------------------------------------------------------------------------------------

export interface SanctionRunOutcome {
  /** Quantas consultas terminaram (inteiras ou com alguma base que falhou). */
  completed: number;
  /** Os assuntos em que alguma base falhou: as outras foram guardadas. */
  partial: string[];
  /** Os assuntos que não puderam ser consultados. */
  failed: string[];
  /** Por que o laço parou antes do fim; nulo: foi até o fim. */
  stoppedBy: 'limit' | 'unavailable' | 'cancelled' | null;
  /** A mensagem da API que parou o laço. */
  message: string | null;
}

/**
 * Consulta um assunto por vez, na ordem dada. Para no limite de consultas (429) e quando a fonte ou a rede não respondem (503,
 * 401 ou sem resposta): insistir só gastaria o limite. Outro erro (pessoa que saiu do cofre, por exemplo) falha só aquele
 * assunto, e o laço segue. O que já foi consultado fica guardado pela API.
 */
export async function runSanctionChecks(
  subjects: readonly SanctionSubjectRef[],
  check: (personId: number | null) => Promise<SanctionCheckResult>,
  options: { onProgress?: (done: number, total: number, current: string) => void; isCancelled?: () => boolean } = {},
): Promise<SanctionRunOutcome> {
  const outcome: SanctionRunOutcome = { completed: 0, partial: [], failed: [], stoppedBy: null, message: null };
  for (const [index, subject] of subjects.entries()) {
    if (options.isCancelled?.() === true) {
      outcome.stoppedBy = 'cancelled';
      break;
    }
    options.onProgress?.(index, subjects.length, subject.label);
    try {
      const result = await check(subject.personId);
      outcome.completed += 1;
      if (result.failed.length > 0) outcome.partial.push(subject.label);
    } catch (error) {
      outcome.failed.push(subject.label);
      const status = error instanceof TendersApiError ? error.status : 0;
      const message = error instanceof Error ? error.message : null;
      if (status === 429) {
        outcome.stoppedBy = 'limit';
        outcome.message = message;
        break;
      }
      if (status === 503 || status === 401 || status === 0) {
        outcome.stoppedBy = 'unavailable';
        outcome.message = message;
        break;
      }
    }
  }
  return outcome;
}

/** O texto do resultado do "Consultar todos"; null quando tudo deu certo e não há o que dizer. */
export function runOutcomeText(outcome: SanctionRunOutcome): string | null {
  if (outcome.stoppedBy === 'cancelled') return null;
  if (outcome.stoppedBy === 'limit') {
    return `${outcome.message ?? 'Limite de consultas atingido.'} O que já foi consultado ficou guardado.`;
  }
  if (outcome.stoppedBy === 'unavailable') {
    return `${outcome.message ?? SANCTIONS_UNAVAILABLE_TEXT} O que já foi consultado ficou guardado.`;
  }
  const problems = [...new Set([...outcome.failed, ...outcome.partial])];
  if (problems.length === 0) return null;
  return `Não foi possível consultar tudo de: ${problems.join(', ')}. Tente de novo em instantes.`;
}

/** "Consultando 2 de 5: Ana Souza…" para o botão e a faixa de andamento (a contagem é de quem já terminou, mais o atual). */
export function progressText(done: number, total: number, current: string): string {
  return `Consultando ${Math.min(done + 1, total)} de ${total}: ${current}…`;
}
