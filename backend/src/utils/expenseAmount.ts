import { sql } from 'drizzle-orm';
import { expenses } from '../db/schema';

/**
 * Valor efetivo da despesa: o que foi pago (com juros ou desconto) quando está
 * paga; o previsto quando não está. Mesma regra do saldo do mês
 * (balanceService) e do painel (painelCalculos.valorEfetivo). Uma expressão
 * nova a cada chamada, para nenhuma consulta alterar a de outra.
 */
export function effectiveExpenseAmount() {
  return sql<string>`CASE WHEN ${expenses.paid} THEN COALESCE(${expenses.amountPaid}, ${expenses.originalAmount}) ELSE ${expenses.originalAmount} END`;
}
