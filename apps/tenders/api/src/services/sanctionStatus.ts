import type { SanctionBase, SanctionRecord, SanctionStatus } from '../domains';

// Situação das bases de sanções (item 6): sem registro, em vigor ou só encerrados, sempre contra uma data de referência (o dia
// de hoje em Brasília na tela; a data de uma sessão de licitação quando o checklist e o Match chegarem). Nada disso é gravado:
// sai dos registros guardados e da data. Funções puras, sem banco.

/** Dentro deste prazo, a consulta guardada vale e a fonte não é chamada de novo. */
export const SANCTION_REUSE_MINUTES = 15;
/** Consulta com mais dias que isto aparece como "antiga": a tela pede nova consulta. */
export const SANCTION_STALE_DAYS = 7;

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/;
const BRAZILIAN_DATE = /^(\d{2})\/(\d{2})\/(\d{4})(?:$|[T\s])/;

function calendarDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Lê a data que a fonte manda, nas duas formas conhecidas (`DD/MM/AAAA` e `AAAA-MM-DD`, com ou sem hora depois), como
 * AAAA-MM-DD. Texto vazio, outra forma ou dia que não existe no calendário: null (a data "não se lê").
 */
export function parseSanctionDate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  const iso = ISO_DATE.exec(text);
  if (iso) {
    return calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const brazilian = BRAZILIAN_DATE.exec(text);
  if (brazilian) {
    return calendarDate(Number(brazilian[3]), Number(brazilian[2]), Number(brazilian[1]));
  }
  return null;
}

/**
 * O registro ainda vale na data de referência? Sem data final (ou com data que não se lê), vale: na dúvida, em vigor. O próprio
 * dia da data final ainda vale; encerrado é só a partir do dia seguinte. AAAA-MM-DD compara como texto.
 */
export function isSanctionRecordInForce(record: Pick<SanctionRecord, 'endDate'>, referenceDate: string): boolean {
  return record.endDate === null || record.endDate >= referenceDate;
}

/**
 * A situação de uma base na data de referência: sem registro; com algum registro que não terminou (em vigor); ou só com
 * registros que já terminaram (encerrada). No CEPIM não há data final: qualquer registro é uma entidade impedida, em vigor.
 * A base nunca consultada (`NAO_CONSULTADO`) é decidida por quem lê, porque aqui não há consulta.
 */
export function sanctionBaseStatusOn(
  base: SanctionBase,
  records: ReadonlyArray<Pick<SanctionRecord, 'endDate'>>,
  referenceDate: string,
): Exclude<SanctionStatus, 'NAO_CONSULTADO'> {
  if (records.length === 0) {
    return 'SEM_REGISTRO';
  }
  if (base === 'CEPIM') {
    return 'EM_VIGOR';
  }
  return records.some((record) => isSanctionRecordInForce(record, referenceDate)) ? 'EM_VIGOR' : 'ENCERRADA';
}

/** Quanto tempo passou desde a consulta, em milissegundos; `checkedAt` é um instante ISO com fuso. Ilegível: NaN. */
function ageOf(checkedAt: string, now: Date): number {
  return now.getTime() - Date.parse(checkedAt);
}

/** A consulta guardada ainda vale (feita há menos de 15 minutos)? Ilegível: não. */
export function isSanctionCheckReusable(checkedAt: string, now: Date): boolean {
  return ageOf(checkedAt, now) < SANCTION_REUSE_MINUTES * MS_PER_MINUTE;
}

/** A consulta guardada é antiga (mais de 7 dias)? Ilegível: sim. */
export function isSanctionCheckStale(checkedAt: string, now: Date): boolean {
  const age = ageOf(checkedAt, now);
  return Number.isNaN(age) || age > SANCTION_STALE_DAYS * MS_PER_DAY;
}
