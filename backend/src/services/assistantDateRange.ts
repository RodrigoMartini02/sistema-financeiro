import { getTodayIsoInTimezone } from '../utils/date';

// Resolucao de periodo relativo ("esse mes", "ultimos 3 meses") em datas
// absolutas. Fica no backend de proposito: a spec exige que o modelo receba
// datas ja resolvidas, e a data de hoje vem do fuso do usuario, nao do relogio
// do processo.

export interface DateRange {
  inicio: string;
  fim: string;
  /** Como dizer o periodo na resposta, para o usuario poder corrigir. */
  label: string;
}

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const MAX_RANGE_YEARS = 5;

function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Hoje como partes civis, no fuso do usuario. */
function todayParts(today = getTodayIsoInTimezone()): { year: number; month: number; day: number } {
  const [year, month, day] = today.split('-').map(Number);
  return { year: year!, month: month! - 1, day: day! };
}

function monthRange(year: number, month: number): DateRange {
  // Normaliza mes fora de 0-11 para o ano vizinho.
  const normalizedYear = year + Math.floor(month / 12);
  const normalizedMonth = ((month % 12) + 12) % 12;
  return {
    inicio: toIso(normalizedYear, normalizedMonth, 1),
    fim: toIso(normalizedYear, normalizedMonth, lastDayOfMonth(normalizedYear, normalizedMonth)),
    label: `${MONTH_NAMES[normalizedMonth]} de ${normalizedYear}`,
  };
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return toIso(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function currentMonthRange(today?: string): DateRange {
  const { year, month } = todayParts(today);
  return monthRange(year, month);
}

/**
 * Periodo dito em linguagem natural, ou `null` quando a frase nao menciona
 * nenhum. Quem chama decide o padrao — a spec manda assumir o mes corrente e
 * dizer isso na resposta.
 */
export function resolveDateRange(text: string, today = getTodayIsoInTimezone()): DateRange | null {
  const lower = normalize(text);
  const { year, month, day } = todayParts(today);

  if (/\bhoje\b/.test(lower)) {
    return { inicio: today, fim: today, label: 'hoje' };
  }

  if (/\bontem\b/.test(lower)) {
    const yesterday = addDays(today, -1);
    return { inicio: yesterday, fim: yesterday, label: 'ontem' };
  }

  if (/\b(?:esse|este|deste|neste|do)\s+mes\b|\bmes\s+atual\b|\bmes\s+corrente\b/.test(lower)) {
    return monthRange(year, month);
  }

  if (/\bmes\s+passado\b|\bmes\s+anterior\b|\bultimo\s+mes\b/.test(lower)) {
    return monthRange(year, month - 1);
  }

  if (/\b(?:essa|esta|nesta|desta)\s+semana\b/.test(lower)) {
    // Semana civil: segunda a domingo, como se fala no Brasil.
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    const offsetToMonday = weekday === 0 ? -6 : 1 - weekday;
    const inicio = addDays(today, offsetToMonday);
    return { inicio, fim: addDays(inicio, 6), label: 'esta semana' };
  }

  if (/\bsemana\s+passada\b/.test(lower)) {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    const offsetToMonday = weekday === 0 ? -6 : 1 - weekday;
    const inicio = addDays(today, offsetToMonday - 7);
    return { inicio, fim: addDays(inicio, 6), label: 'semana passada' };
  }

  const lastMonths = lower.match(/\bultimos?\s+(\d{1,2})\s+meses\b/);
  if (lastMonths?.[1]) {
    const count = Math.min(Math.max(Number(lastMonths[1]), 1), 24);
    const start = monthRange(year, month - (count - 1));
    const end = monthRange(year, month);
    return { inicio: start.inicio, fim: end.fim, label: `últimos ${count} meses` };
  }

  const lastDays = lower.match(/\bultimos?\s+(\d{1,3})\s+dias\b/);
  if (lastDays?.[1]) {
    const count = Math.min(Math.max(Number(lastDays[1]), 1), 365);
    return { inicio: addDays(today, -(count - 1)), fim: today, label: `últimos ${count} dias` };
  }

  // O ano passado vem antes: "no ano passado" tambem casa com "no ano".
  if (/\bano\s+passado\b|\bano\s+anterior\b|\bultimo\s+ano\b/.test(lower)) {
    return { inicio: toIso(year - 1, 0, 1), fim: toIso(year - 1, 11, 31), label: `${year - 1}` };
  }

  if (/\b(?:esse|este|neste|no)\s+ano\b|\bano\s+atual\b/.test(lower)) {
    return { inicio: toIso(year, 0, 1), fim: toIso(year, 11, 31), label: `${year}` };
  }

  // Mes pelo nome: "em julho", "de setembro". Mes futuro no ano corrente e
  // lido como do ano passado, que e o que a pergunta costuma querer.
  for (let index = 0; index < MONTH_NAMES.length; index += 1) {
    const name = normalize(MONTH_NAMES[index]!);
    if (!new RegExp(`\\b${name}\\b`).test(lower)) continue;
    const explicitYear = lower.match(new RegExp(`${name}\\s+(?:de\\s+)?(\\d{4})`));
    if (explicitYear?.[1]) return monthRange(Number(explicitYear[1]), index);
    return monthRange(index > month ? year - 1 : year, index);
  }

  void day;
  return null;
}

export class DateRangeError extends Error {}

/**
 * Valida um periodo vindo do modelo. Datas fora de formato, invertidas ou com
 * janela absurda sao recusadas antes de virar consulta.
 */
export function assertValidRange(inicio: string, fim: string): void {
  const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoPattern.test(inicio) || !isoPattern.test(fim)) {
    throw new DateRangeError('Período inválido.');
  }
  if (inicio > fim) {
    throw new DateRangeError('A data inicial não pode ser depois da final.');
  }
  const years = (Number(fim.slice(0, 4)) - Number(inicio.slice(0, 4)));
  if (years > MAX_RANGE_YEARS) {
    throw new DateRangeError('O período pedido é longo demais.');
  }
}

/** Rotulo legivel de um periodo arbitrario, para a resposta citar o que usou. */
export function describeRange(inicio: string, fim: string): string {
  const [startYear, startMonth, startDay] = inicio.split('-').map(Number);
  const [endYear, endMonth, endDay] = fim.split('-').map(Number);

  if (inicio === fim) return `${startDay} de ${MONTH_NAMES[startMonth! - 1]}`;

  const coversWholeMonth = startDay === 1
    && endDay === lastDayOfMonth(endYear!, endMonth! - 1)
    && startYear === endYear
    && startMonth === endMonth;
  if (coversWholeMonth) return `${MONTH_NAMES[startMonth! - 1]} de ${startYear}`;

  if (startYear === endYear) {
    return `${startDay} de ${MONTH_NAMES[startMonth! - 1]} a ${endDay} de ${MONTH_NAMES[endMonth! - 1]} de ${endYear}`;
  }
  return `${startDay} de ${MONTH_NAMES[startMonth! - 1]} de ${startYear} a ${endDay} de ${MONTH_NAMES[endMonth! - 1]} de ${endYear}`;
}
