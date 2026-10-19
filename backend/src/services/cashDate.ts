// A data em que um lançamento conta nas somas por mês (regime de caixa). Uma regra só para todas as
// telas e serviços (plano .plans/regime-de-caixa-todas-as-telas.md):
// - despesa paga conta no dia do pagamento, pelo valor pago; sem data de pagamento, no vencimento;
// - despesa em aberto (e a cancelada) conta no vencimento, até ser paga ou movida;
// - receita conta no dia do recebimento (incomes.receiptDate).
// O frontend tem o espelho em src/utils/cashDate.ts, com os mesmos casos de teste.
import { sql, type SQL } from 'drizzle-orm';
import { expenses } from '../db/schema';

export interface CashDateFields {
  pago: boolean;
  dataPagamento: string | null;
  dataVencimento: string;
}

/** O dia em que a despesa conta: o do pagamento, se paga; senão o vencimento. */
export function expenseCashDate(expense: CashDateFields): string {
  return expense.pago ? (expense.dataPagamento ?? expense.dataVencimento) : expense.dataVencimento;
}

/**
 * A mesma regra em SQL cru; `alias` é o apelido da tabela de despesas. A despesa
 * cancelada continua no vencimento (está na lista, mas fora das somas).
 */
export function expenseCashDateSql(alias: string): string {
  return `(CASE WHEN COALESCE(${alias}.pago, false) AND COALESCE(${alias}.status, 'ativa') = 'ativa'
    THEN COALESCE(${alias}.data_pagamento, ${alias}.data_vencimento) ELSE ${alias}.data_vencimento END)`;
}

/** A mesma regra para as consultas Drizzle sobre `expenses`. */
export function expenseCashDateColumn(): SQL<string> {
  return sql<string>`(CASE WHEN COALESCE(${expenses.paid}, false) AND ${expenses.status} = 'ativa'
    THEN COALESCE(${expenses.paymentDate}, ${expenses.dueDate}) ELSE ${expenses.dueDate} END)`;
}

/** Primeiro e último dia ('AAAA-MM-DD') do mês; `month` de 0 (janeiro) a 11, como no resto do sistema. */
export function monthRange(month: number, year: number): { start: string; end: string } {
  return {
    start: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10),
  };
}

/**
 * A data do recebimento quando quem confirma não informa: a prevista, se ela é do mês atual; senão,
 * hoje. Assim a confirmação nunca cai sozinha num mês que já fechou (nem num mês que ainda não chegou).
 */
export function defaultReceiptDate(plannedDate: string, today: string): string {
  return plannedDate.slice(0, 7) === today.slice(0, 7) ? plannedDate.slice(0, 10) : today;
}
