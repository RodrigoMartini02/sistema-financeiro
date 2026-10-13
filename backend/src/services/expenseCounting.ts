// Quando a despesa conta nas somas: saldo do mês, Painel, relatórios, orçamento,
// limite do cartão, resumo de membros, copiloto e as somas do assistente. A
// ocorrência mensal em aberto só conta a partir do dia seguinte à data dela — no
// crédito com cartão, a data de compra (a cobrança; sem ela, o vencimento); nas
// outras formas, o vencimento. A paga conta sempre, e a despesa que não é mensal
// também (plano .plans/recorrente-ano-e-contagem.md). As listas continuam
// mostrando a ocorrência futura; só as somas seguem esta regra.
import { sql, type SQL } from 'drizzle-orm';
import { expenses } from '../db/schema';
import { getTodayIsoInTimezone } from '../utils/date';
import { INVOICE_EXPENSE_METHOD } from './cardInvoiceRules';

export interface CountableExpense {
  recurring: boolean;
  paid: boolean;
  paymentMethod: string | null;
  cardId: number | null;
  purchaseDate: string | null;
  dueDate: string;
}

/** A data que decide quando a ocorrência mensal passa a contar. */
export function countingDate(expense: Pick<CountableExpense, 'paymentMethod' | 'cardId' | 'purchaseDate' | 'dueDate'>): string {
  if (expense.paymentMethod === INVOICE_EXPENSE_METHOD && expense.cardId !== null) {
    return expense.purchaseDate ?? expense.dueDate;
  }
  return expense.dueDate;
}

/** Conta nas somas: não é mensal, está paga, ou a data dela já passou (conta a partir do dia seguinte). */
export function isCountedExpense(expense: CountableExpense, today: string): boolean {
  if (!expense.recurring || expense.paid) return true;
  return countingDate(expense) < today;
}

/** A mesma regra de isCountedExpense, como condição das consultas de soma (Drizzle). */
export function countedExpenseCondition(today: string = getTodayIsoInTimezone()): SQL {
  return sql`NOT (
    COALESCE(${expenses.recurring}, false)
    AND NOT COALESCE(${expenses.paid}, false)
    AND (CASE WHEN ${expenses.paymentMethod} = ${INVOICE_EXPENSE_METHOD} AND ${expenses.cardId} IS NOT NULL
      THEN COALESCE(${expenses.purchaseDate}, ${expenses.dueDate})
      ELSE ${expenses.dueDate} END) >= ${today}
  )`;
}

/**
 * A mesma regra para as consultas em SQL cru com a tabela de despesas sob um
 * apelido (`alias`). `todayParam` é o marcador do parâmetro com a data de hoje
 * (ex.: '$6'); a forma de pagamento entra como literal porque é uma constante
 * do sistema, nunca um dado do pedido.
 */
export function countedExpenseSql(alias: string, todayParam: string): string {
  return `NOT (
    COALESCE(${alias}.recorrente, false)
    AND NOT COALESCE(${alias}.pago, false)
    AND (CASE WHEN ${alias}.forma_pagamento = '${INVOICE_EXPENSE_METHOD}' AND ${alias}.cartao_id IS NOT NULL
      THEN COALESCE(${alias}.data_compra, ${alias}.data_vencimento)
      ELSE ${alias}.data_vencimento END) >= ${todayParam}::date
  )`;
}
