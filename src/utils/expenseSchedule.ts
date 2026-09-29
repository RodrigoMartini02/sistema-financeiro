// Datas e valores do cronograma de uma despesa: fatura do cartão, dia do mês,
// divisão do parcelado e vencimento de cada parcela. O modal de despesa e o
// assistente usam este arquivo, para que os dois gravem o mesmo cronograma.

function toIso(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Dia `day` no mês `monthIndex` (que pode passar de 11), sem transbordar para o mês seguinte. */
function clampedDate(year: number, monthIndex: number, day: number): string {
  const first = new Date(year, monthIndex, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return toIso(first.getFullYear(), first.getMonth(), Math.min(day, lastDay));
}

function dateParts(isoDate: string): [number, number, number] {
  const [year, month, day] = isoDate.split('-').map(Number);
  return [year!, month! - 1, day!];
}

/** Soma meses mantendo o dia; nos meses mais curtos cai no último dia (31/01 + 1 → 28/02). */
export function addMonthsClamped(isoDate: string, months: number): string {
  const [year, monthIndex, day] = dateParts(isoDate);
  return clampedDate(year, monthIndex + months, day);
}

/** O dia `day` no mês da data informada, ou o último dia quando o mês é mais curto. */
export function dateInMonth(isoDate: string, day: number): string {
  const [year, monthIndex] = dateParts(isoDate);
  return clampedDate(year, monthIndex, day);
}

export interface InvoiceCard {
  dia_fechamento?: number | null;
  dia_vencimento?: number | null;
}

/**
 * Vencimento da fatura em que a compra entra. Até o dia de fechamento, a compra
 * entra na fatura do mês; depois dele, na seguinte. Quando o dia de vencimento é
 * menor ou igual ao de fechamento, a fatura vence no mês seguinte ao fechamento.
 */
export function invoiceDueDate(purchaseDate: string, card: InvoiceCard): string {
  const closingDay = card.dia_fechamento ?? 1;
  const dueDay = card.dia_vencimento ?? 10;
  const [year, monthIndex, day] = dateParts(purchaseDate);
  const closingOffset = day > closingDay ? 1 : 0;
  const dueOffset = dueDay <= closingDay ? 1 : 0;
  return clampedDate(year, monthIndex + closingOffset + dueOffset, dueDay);
}

/** Divide o total em parcelas iguais, em centavos, com o resto na última (100,00 em 3 → 33,33 / 33,33 / 33,34). */
export function splitAmountInCents(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, index) => (index === count - 1 ? totalCents - base * (count - 1) : base));
}

/** Vencimento de cada parcela: a 1ª na data informada e as demais, mês a mês. */
export function installmentDueDates(firstDueDate: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addMonthsClamped(firstDueDate, index));
}
