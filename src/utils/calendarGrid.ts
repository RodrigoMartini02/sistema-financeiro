// Calendário dos campos de data: grade do mês, navegação pelo teclado e escolha
// de período. Tudo em texto ISO (aaaa-mm-dd) e com datas locais, porque
// new Date('aaaa-mm-dd') é lido como UTC e mostra o dia anterior no fuso do Brasil.

export interface CalendarDay {
  iso: string;
  day: number;
  /** Falso para os dias dos meses vizinhos, que completam as semanas. */
  inMonth: boolean;
}

export interface DateRange {
  start: string | null;
  end: string | null;
}

/** Mês do calendário, com o mês de 1 a 12. */
export interface CalendarMonth {
  year: number;
  month: number;
}

/** Sempre 6 semanas: o calendário não muda de altura entre um mês e outro. */
export const CALENDAR_DAYS = 42;
export const FIRST_CALENDAR_YEAR = 1900;
export const CALENDAR_YEARS_AHEAD = 20;
/** Semana começando no domingo, como no calendário brasileiro. */
export const WEEKDAY_INITIALS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const;
export const WEEKDAY_NAMES = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'] as const;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Data local ao meio-dia: sem risco de horário de verão trocar o dia, e com anos antes de 100 corretos. */
function localDate(year: number, monthIndex: number, day: number): Date {
  const date = new Date(2000, 0, 1, 12);
  date.setFullYear(year, monthIndex, day);
  return date;
}

function isoFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Data local do texto ISO; nula quando o texto não é uma data que existe. */
function dateFromIso(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = localDate(year, month - 1, day);
  const exists = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return exists ? date : null;
}

export function isValidIso(iso: string): boolean {
  return dateFromIso(iso) !== null;
}

/** Mês da data ISO; o mês de `fallbackIso` quando a data é inválida ou vazia. */
export function monthOfIso(iso: string, fallbackIso: string): CalendarMonth {
  const date = dateFromIso(iso) ?? dateFromIso(fallbackIso);
  if (!date) {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  }
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function daysInMonth(year: number, month: number): number {
  return localDate(year, month, 0).getDate();
}

/** As 42 casas do mês, a partir do domingo da primeira semana. */
export function monthGrid({ year, month }: CalendarMonth): CalendarDay[] {
  const leadingDays = localDate(year, month - 1, 1).getDay();
  return Array.from({ length: CALENDAR_DAYS }, (_, index) => {
    const date = localDate(year, month - 1, 1 + index - leadingDays);
    return { iso: isoFromDate(date), day: date.getDate(), inMonth: date.getMonth() === month - 1 };
  });
}

export function shiftMonth({ year, month }: CalendarMonth, amount: number): CalendarMonth {
  const index = year * 12 + (month - 1) + amount;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** Dias somados (ou tirados) à data, para as setas do teclado. */
export function addDays(iso: string, amount: number): string {
  const date = dateFromIso(iso);
  if (!date) return iso;
  date.setDate(date.getDate() + amount);
  return isoFromDate(date);
}

/** Meses somados à data, com o dia limitado ao fim do mês (31/01 + 1 mês = 28 ou 29/02). */
export function addMonths(iso: string, amount: number): string {
  const date = dateFromIso(iso);
  if (!date) return iso;
  const target = shiftMonth({ year: date.getFullYear(), month: date.getMonth() + 1 }, amount);
  const day = Math.min(date.getDate(), daysInMonth(target.year, target.month));
  return `${target.year}-${pad2(target.month)}-${pad2(day)}`;
}

/**
 * Clique no calendário de período: o primeiro marca o início, o segundo o fim
 * (antes do início, as datas se invertem) e o terceiro recomeça.
 */
export function rangeAfterClick(range: DateRange, clickedIso: string): { range: DateRange; complete: boolean } {
  if (!range.start || range.end) {
    return { range: { start: clickedIso, end: null }, complete: false };
  }
  const [start, end] = clickedIso < range.start ? [clickedIso, range.start] : [range.start, clickedIso];
  return { range: { start, end }, complete: true };
}

/** Dia entre as duas datas, inclusive, em qualquer ordem. */
export function isInRange(iso: string, first: string | null, second: string | null): boolean {
  if (!first || !second) return false;
  const [start, end] = first <= second ? [first, second] : [second, first];
  return iso >= start && iso <= end;
}

/** Anos da lista do calendário: de 1900 a 20 anos à frente, sempre com o ano mostrado. */
export function calendarYears(shownYear: number, currentYear: number): number[] {
  const last = currentYear + CALENDAR_YEARS_AHEAD;
  const years = Array.from({ length: last - FIRST_CALENDAR_YEAR + 1 }, (_, index) => FIRST_CALENDAR_YEAR + index);
  if (shownYear < FIRST_CALENDAR_YEAR) return [shownYear, ...years];
  if (shownYear > last) return [...years, shownYear];
  return years;
}
