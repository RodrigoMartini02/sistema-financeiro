import type { StatusConta } from './assistantQueries';

// Regra de "contas a receber" do assistente, sem acesso a banco. A consulta já
// traz só receitas vigentes (recebidas ou a receber: prevista, faturada); a
// cancelada fica fora antes de chegar aqui.

export interface LiveIncome {
  /** Já entrou (status `ativa`); senão, ainda a receber. */
  received: boolean;
  /** Data de recebimento, 'AAAA-MM-DD'. */
  date: string;
}

/** A receber com data passada. */
export function isOverdueReceivable(income: LiveIncome, today: string): boolean {
  return !income.received && income.date < today;
}

/**
 * Em aberto: a receber com data de hoje em diante. Vencido: a receber com data
 * passada. Todos: recebidas e a receber.
 */
export function matchesReceivableSituation(income: LiveIncome, situation: StatusConta, today: string): boolean {
  if (situation === 'todos') {
    return true;
  }
  if (income.received) {
    return false;
  }
  const overdue = isOverdueReceivable(income, today);
  return situation === 'vencido' ? overdue : !overdue;
}
