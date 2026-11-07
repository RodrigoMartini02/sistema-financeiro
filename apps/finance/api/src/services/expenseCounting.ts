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
  status?: string | null;
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
  if (expense.status === 'prevista' || expense.status === 'cancelada') return false;
  if (!expense.recurring || expense.paid) return true;
  return countingDate(expense) < today;
}

/** A mesma regra de isCountedExpense, como condição das consultas de soma (Drizzle). */
export function countedExpenseCondition(today: string = getTodayIsoInTimezone()): SQL {
  return sql`COALESCE(${expenses.status}, 'ativa') = 'ativa' AND NOT (
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
  return `COALESCE(${alias}.status, 'ativa') = 'ativa' AND NOT (
    COALESCE(${alias}.recorrente, false)
    AND NOT COALESCE(${alias}.pago, false)
    AND (CASE WHEN ${alias}.forma_pagamento = '${INVOICE_EXPENSE_METHOD}' AND ${alias}.cartao_id IS NOT NULL
      THEN COALESCE(${alias}.data_compra, ${alias}.data_vencimento)
      ELSE ${alias}.data_vencimento END) >= ${todayParam}::date
  )`;
}

/**
 * Dívida em aberto do cartão, a mesma que a fatura lista e que ocupa o limite:
 * não paga (pago em branco conta como em aberto, como na mudança de vencimento
 * em routes/cards.ts) e ativa (status em branco é ativa; a coluna só é
 * preenchida ao cancelar). `alias` é o apelido da tabela de despesas.
 */
export function openCardDebtSql(alias: string): string {
  return `NOT COALESCE(${alias}.pago, false) AND COALESCE(${alias}.status, 'ativa') = 'ativa'`;
}

/** A mesma regra de openCardDebtSql, como condição das consultas Drizzle. */
export function openCardDebtCondition(): SQL {
  return sql`NOT COALESCE(${expenses.paid}, false) AND COALESCE(${expenses.status}, 'ativa') = 'ativa'`;
}

/**
 * Que despesa do cartão ocupa o limite, pelo tipo cadastrado do cartão: 'credito'
 * conta o crédito e o lançamento antigo sem forma de pagamento; 'ambos' mistura
 * débito e crédito no mesmo cartao_id, então só o crédito conta; sem tipo, tudo
 * (compatibilidade com lançamentos antigos). `expenseAlias` e `cardAlias` são os
 * apelidos das tabelas de despesas e de cartões.
 */
export function cardLimitPaymentMethodSql(expenseAlias: string, cardAlias: string): string {
  const method = `${expenseAlias}.forma_pagamento`;
  return `(${cardAlias}.tipo IS NULL
    OR (${cardAlias}.tipo = '${INVOICE_EXPENSE_METHOD}' AND (${method} IS NULL OR ${method} = '${INVOICE_EXPENSE_METHOD}'))
    OR (${cardAlias}.tipo = 'ambos' AND ${method} = '${INVOICE_EXPENSE_METHOD}'))`;
}

/**
 * Vencimento da fatura em que a despesa está: o dia de vencimento do cartão no mês do vencimento da
 * despesa, limitado ao último dia do mês (dia 31 em mês de 30 dias vence no dia 30). É a mesma conta
 * de invoiceDueDate (cardInvoiceRules): o "vencida" do Usado e da quitação em lote usam esta regra.
 */
export function invoiceDueDateSql(expenseAlias: string, cardAlias: string): string {
  const month = `date_trunc('month', ${expenseAlias}.data_vencimento)`;
  return `(${month}::date + (LEAST(${cardAlias}.dia_vencimento,
    EXTRACT(DAY FROM (${month} + INTERVAL '1 month' - INTERVAL '1 day'))::int) - 1))`;
}
