// Datas da API em ISO com o fuso de Brasília (ex.: 2026-10-20T09:30:00-03:00).
// A tela mostra o relógio de Brasília como veio, sem converter para o fuso do
// navegador; a contagem regressiva usa o instante (utils/countdown).

const ISO_PARTS = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY = '—';

/** "20/10/2026"; sem data, "—". */
export function formatIsoDate(iso: string | null | undefined): string {
  const parts = iso ? ISO_PARTS.exec(iso) : null;
  if (!parts) return EMPTY;
  const [, year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

/** "20/10/2026 09:30"; só a data quando não há hora; sem data, "—". */
export function formatIsoDateTime(iso: string | null | undefined): string {
  const parts = iso ? ISO_PARTS.exec(iso) : null;
  if (!parts) return EMPTY;
  const [, year, month, day, hour, minute] = parts;
  const date = `${day}/${month}/${year}`;
  return hour !== undefined && minute !== undefined ? `${date} ${hour}:${minute}` : date;
}

/** Data de calendário válida em AAAA-MM-DD (o que a API aceita nos filtros). */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** AAAA-MM-DD somado de dias de calendário. */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
