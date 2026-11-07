// Regras do "Mover" das despesas vencidas, sem acesso ao banco (o serviço é overdueExpenses).

/**
 * Para onde a despesa vencida vai: o mesmo dia do mês atual (ou o último dia dele, se o mês não
 * tiver esse dia) e nunca antes de hoje, para a conta não continuar vencida depois de movida.
 */
export function moveTargetDate(dueDate: string, today: string): string {
  const [year, month] = today.split('-').map(Number) as [number, number];
  const dueDay = Number(dueDate.split('-')[2]);
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(dueDay, lastDay);
  const sameDay = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return sameDay < today ? today : sameDay;
}
