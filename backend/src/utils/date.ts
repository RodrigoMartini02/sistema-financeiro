// Data "hoje" fixada em America/Sao_Paulo, no formato YYYY-MM-DD, independente
// do fuso em que o processo Node está rodando (ex: UTC em produção). Mesma
// referência de fuso já usada na conexão do banco (ver db/client.ts).
const TIMEZONE = 'America/Sao_Paulo';

export function getTodayIsoInTimezone(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// Extrai mês (0-11) e ano civis de uma data ISO "YYYY-MM-DD", para que o
// mês/ano de um lançamento sempre corresponda à sua data de referência
// (vencimento/recebimento), nunca ao mês sendo visualizado na tela do client.
export function getMonthYearFromIsoDate(isoDate: string): { mes: number; ano: number } {
  const [ano, mes] = isoDate.split('-').map(Number);
  return { mes: mes! - 1, ano: ano! };
}

/** "2026-09-28" → "28/09/2026"; vazio vira "-". */
export function formatIsoDateBr(isoDate: string | null): string {
  if (!isoDate) return '-';
  const [year, month, day] = isoDate.split('T')[0]!.split('-');
  return `${day}/${month}/${year}`;
}

/** Soma dias a uma data ISO "YYYY-MM-DD" (negativo subtrai), sem depender do fuso do processo. */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

/**
 * Soma meses a uma data ISO "YYYY-MM-DD" mantendo o dia. Quando o mês de destino
 * é mais curto, cai no último dia dele: 31/01 + 1 mês = 28/02. A conta parte
 * sempre da data base, então 31/01 + 2 meses volta a 31/03.
 */
export function addMonthsClamped(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const target = new Date(Date.UTC(year!, month! - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day!, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Quantos meses há do mês da data até o mês `untilMonth` (0-11) de `untilYear`; negativo quando é antes. */
export function countMonthsUntil(isoDate: string, untilMonth: number, untilYear: number): number {
  const [year, month] = isoDate.split('-').map(Number);
  return (untilYear - year!) * 12 + (untilMonth - (month! - 1));
}

/**
 * Uma data por mês depois da data informada, até o mês `untilMonth` (0-11) de
 * `untilYear`, inclusive: o mesmo dia, ou o último dia nos meses mais curtos.
 * Vazio quando o mês final não é posterior ao da data.
 */
export function monthlyDatesUntil(isoDate: string, untilMonth: number, untilYear: number): string[] {
  const count = Math.max(0, countMonthsUntil(isoDate, untilMonth, untilYear));
  return Array.from({ length: count }, (_, index) => addMonthsClamped(isoDate, index + 1));
}
