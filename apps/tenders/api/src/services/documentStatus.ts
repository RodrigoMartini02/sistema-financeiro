import type { DocumentStatus, TenderNotificationType } from '../domains';

// Situação dos documentos do cofre (item 5): válido, vencendo ou vencido, sempre contra uma data de referência (o dia de hoje
// em Brasília nas telas e nos avisos; a data de uma sessão de licitação quando o checklist e o Match chegarem). Nada disso é
// gravado: sai da validade e da data. Funções puras, sem banco.

/** Faltando até 30 dias (inclusive), o documento está "vencendo". */
export const DOCUMENT_WARNING_DAYS = 30;
/** Faltando até 7 dias (inclusive), o aviso é o urgente. */
export const DOCUMENT_URGENT_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcDay(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

/** Quantos dias de calendário vão de `from` até `to` (AAAA-MM-DD); negativo quando `to` é antes de `from`. */
export function calendarDaysBetween(from: string, to: string): number {
  return Math.round((utcDay(to) - utcDay(from)) / MS_PER_DAY);
}

export interface DocumentStanding {
  status: DocumentStatus;
  /** Dias até o vencimento: 0 no próprio dia, negativo depois de vencer; nulo sem validade. */
  daysToExpire: number | null;
}

/**
 * A situação do documento na data de referência. Sem validade, o documento não vence: válido. O próprio dia da validade
 * ainda vale (vencendo, com 0 dia); vencido é só a partir do dia seguinte. Faltando até `warningDays` dias, vencendo.
 */
export function documentStatusOn(
  validUntil: string | null,
  referenceDate: string,
  warningDays: number = DOCUMENT_WARNING_DAYS,
): DocumentStanding {
  if (validUntil === null) {
    return { status: 'VALID', daysToExpire: null };
  }
  const daysToExpire = calendarDaysBetween(referenceDate, validUntil);
  if (daysToExpire < 0) {
    return { status: 'EXPIRED', daysToExpire };
  }
  return { status: daysToExpire <= warningDays ? 'EXPIRING' : 'VALID', daysToExpire };
}

/**
 * O aviso do sino para o documento que vence em `daysToExpire` dias: de 0 a 7 dias, o urgente; de 8 a 30, o primeiro aviso;
 * fora disso (ainda longe, ou já vencido), nenhum. Quem entra a menos de 8 dias do vencimento só recebe o urgente.
 */
export function expiryNoticeType(daysToExpire: number): Extract<TenderNotificationType, 'DOCUMENTO_VENCE_30D' | 'DOCUMENTO_VENCE_7D'> | null {
  if (daysToExpire < 0 || daysToExpire > DOCUMENT_WARNING_DAYS) {
    return null;
  }
  return daysToExpire <= DOCUMENT_URGENT_DAYS ? 'DOCUMENTO_VENCE_7D' : 'DOCUMENTO_VENCE_30D';
}
