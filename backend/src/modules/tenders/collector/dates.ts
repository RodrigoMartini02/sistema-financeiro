// Datas do coletor no fuso de Brasília. O PNCP recebe datas como AAAAMMDD e
// devolve data e hora sem fuso, no horário de Brasília (ex.: 2026-10-20T09:30:00).

const BRASILIA_TIME_ZONE = 'America/Sao_Paulo';

const brasiliaFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BRASILIA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function brasiliaParts(instant: Date): Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string> {
  const parts = Object.fromEntries(brasiliaFormatter.formatToParts(instant).map((part) => [part.type, part.value]));
  return {
    year: parts['year'] ?? '',
    month: parts['month'] ?? '',
    day: parts['day'] ?? '',
    hour: parts['hour'] ?? '',
    minute: parts['minute'] ?? '',
    second: parts['second'] ?? '',
  };
}

/** Data de Brasília do instante, em AAAA-MM-DD. */
export function brasiliaDate(instant: Date): string {
  const { year, month, day } = brasiliaParts(instant);
  return `${year}-${month}-${day}`;
}

/** Data e hora de Brasília do instante, em AAAA-MM-DDTHH:mm:ss (o formato das datas do PNCP). */
export function brasiliaDateTime(instant: Date): string {
  const { year, month, day, hour, minute, second } = brasiliaParts(instant);
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

/** Soma dias a uma data AAAA-MM-DD pelo calendário (sem depender do fuso da máquina). */
export function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return shifted.toISOString().slice(0, 10);
}

/** AAAA-MM-DD → AAAAMMDD, o formato dos parâmetros de data da API do PNCP. */
export function toPncpDate(date: string): string {
  return date.replaceAll('-', '');
}
