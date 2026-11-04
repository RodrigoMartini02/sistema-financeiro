export interface ReportPeriod {
  start: string;
  end: string;
}

export type PeriodPreset = 'current_month' | 'previous_month' | 'quarter' | 'current_year';

export const PERIOD_PRESETS: Array<{ id: PeriodPreset; label: string }> = [
  { id: 'current_month', label: 'Este mês' },
  { id: 'previous_month', label: 'Mês anterior' },
  { id: 'quarter', label: 'Trimestre' },
  { id: 'current_year', label: 'Este ano' },
];

const pad = (value: number) => String(value).padStart(2, '0');

/** Mês inteiro; `month` de 1 a 12. */
function monthPeriod(year: number, month: number): ReportPeriod {
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(lastDay)}` };
}

/** Período de cada atalho; o trimestre são os três últimos meses, contando o atual. */
export function presetPeriod(preset: PeriodPreset, today: Date = new Date()): ReportPeriod {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  if (preset === 'current_month') return monthPeriod(year, month);
  if (preset === 'previous_month') return month === 1 ? monthPeriod(year - 1, 12) : monthPeriod(year, month - 1);
  if (preset === 'quarter') {
    const startMonth = month - 2 <= 0 ? month + 10 : month - 2;
    const startYear = month - 2 <= 0 ? year - 1 : year;
    return { start: monthPeriod(startYear, startMonth).start, end: monthPeriod(year, month).end };
  }
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export function samePeriod(a: ReportPeriod | null, b: ReportPeriod | null): boolean {
  return !!a && !!b && a.start === b.start && a.end === b.end;
}
