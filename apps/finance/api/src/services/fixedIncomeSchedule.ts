// Regras de agenda da receita fixa, sem banco: tudo em datas ISO (AAAA-MM-DD)
// no fuso do sistema, para os testes cobrirem virada de mês e meses curtos.

const pad = (value: number) => String(value).padStart(2, '0');

/** Maior ampliação do limite numa só edição: o mesmo teto de volume da criação. */
export const MAX_END_MONTH_GROWTH = 36;

export interface FixedIncomeDate {
  /** Primeiro dia do mês da ocorrência. */
  competence: string;
  receiptDate: string;
}

/** Datas mensais ancoradas na referência, inclusive o último mês informado. */
export function fixedIncomeRangeDates(referenceDate: string, endMonth: string): FixedIncomeDate[] {
  const [year, month, day] = referenceDate.split('-').map(Number);
  const months = (Number(endMonth.slice(0, 4)) - year!) * 12 + Number(endMonth.slice(5, 7)) - month!;
  if (months < 0 || months > 1212) return [];
  return Array.from({ length: months + 1 }, (_, index) => {
    const date = new Date(Date.UTC(year!, month! - 1 + index, 1));
    const finalDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    const prefix = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
    return { competence: `${prefix}-01`, receiptDate: `${prefix}-${pad(Math.min(day!, finalDay))}` };
  });
}

/** Primeiro dia do mês seguinte a `month` (AAAA-MM). */
export function competenceAfter(month: string): string {
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5, 7));
  return number === 12 ? `${year + 1}-01-01` : `${year}-${pad(number + 1)}-01`;
}

export interface FixedIncomeEndChangePlan {
  /** Meses ausentes que passam a existir como previstas, só de hoje em diante. */
  create: FixedIncomeDate[];
  /** Previstas futuras desta competência em diante saem da série; nulo quando o limite não diminui. */
  removeFromCompetence: string | null;
}

/**
 * Efeito de mudar o último mês da fixa. Ampliar cria só os meses depois do
 * limite antigo; reduzir tira as previstas futuras além do novo limite.
 * Recebidas, faturadas, passadas e canceladas à mão ficam por conta de quem
 * grava: a competência cancelada continua ocupada e nunca volta sozinha.
 */
export function planFixedIncomeEndChange(input: {
  referenceDate: string;
  oldEnd: string;
  newEnd: string;
  today: string;
}): { refusal: string } | { plan: FixedIncomeEndChangePlan } {
  const { referenceDate, oldEnd, newEnd, today } = input;
  const range = fixedIncomeRangeDates(referenceDate, newEnd);
  const growth = (Number(newEnd.slice(0, 4)) - Number(oldEnd.slice(0, 4))) * 12 + Number(newEnd.slice(5, 7)) - Number(oldEnd.slice(5, 7));
  if (range.length === 0 || growth > MAX_END_MONTH_GROWTH) {
    return { refusal: `O limite não pode ser anterior ao primeiro mês nem ampliar mais de ${MAX_END_MONTH_GROWTH} meses por vez` };
  }
  return {
    plan: {
      create: newEnd > oldEnd ? range.filter((item) => item.competence > `${oldEnd}-01` && item.receiptDate >= today) : [],
      removeFromCompetence: newEnd < oldEnd ? competenceAfter(newEnd) : null,
    },
  };
}
