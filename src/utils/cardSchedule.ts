// Vigência de um novo dia de vencimento do cartão: o mês sugerido no modal e o
// formato que o servidor recebe ('AAAA-MM'). As despesas não pagas dessa
// fatura em diante passam para o dia novo (backend/src/routes/cards.ts).

/** Mês 0–11, como no `MonthYearPicker`. */
export interface MonthOfYear {
  month: number;
  year: number;
}

/**
 * Mês da próxima fatura ainda não vencida, pelo dia de vencimento salvo: o
 * deste mês se o dia ainda não passou (dia 31 vale como o último do mês);
 * senão, o seguinte.
 */
export function nextOpenInvoiceMonth(todayIso: string, dueDay: number): MonthOfYear {
  const [year, month, day] = todayIso.split('-').map(Number) as [number, number, number];
  const lastDay = new Date(year, month, 0).getDate();
  if (day <= Math.min(dueDay, lastDay)) {
    return { month: month - 1, year };
  }
  return month === 12 ? { month: 0, year: year + 1 } : { month, year };
}

/** 'AAAA-MM' do mês de vigência, como o servidor recebe. */
export function effectiveMonthParam({ month, year }: MonthOfYear): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}
