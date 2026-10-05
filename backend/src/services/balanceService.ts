import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { expenses, incomes } from '../db/schema';
import { expenseBaseConditions, incomeBaseConditions, toNumber } from './entryQueries';

export interface BalanceBreakdown {
  previousBalance: number;
  totalIncomes: number;
  totalExpenses: number;
  /** Só as despesas do mês já pagas — base do Saldo Atual (dinheiro real disponível agora). */
  paidExpenses: number;
  finalBalance: number;
}

// Despesa entra pelo valor pago, quando paga; senão, pelo previsto. Cada
// parcela já grava o próprio valor: soma direta, sem dividir por parcelas.
const expenseValue = sql`CASE WHEN ${expenses.paid} THEN COALESCE(${expenses.amountPaid}, ${expenses.originalAmount}) ELSE ${expenses.originalAmount} END`;

// As despesas contam para quem paga (o dono do cartão, ou quem cadastrou sem
// cartão), como no Painel e nos Relatórios: expenseBaseConditions. Receita é
// de quem a lançou.

// Saldo acumulado de tudo que aconteceu ANTES de (year, month): receitas −
// despesas de todo o histórico anterior. Não há snapshot gravado (tabela
// `meses`, removida), então este valor é sempre recalculado a partir dos
// lançamentos reais. A conta não tem saldo de abertura: o capital dos sócios
// só entra aqui quando é lançado como receita.
export async function calculatePreviousBalance(userId: number, year: number, month: number, accountId: number | null): Promise<number> {
  const monthKey = year * 12 + month;

  const [incomeRows, expenseRows] = await Promise.all([
    db.select({ total: sql<string>`COALESCE(SUM(${incomes.amount}), 0)` }).from(incomes).where(and(
      ...incomeBaseConditions([userId], accountId),
      sql`(${incomes.year} * 12 + ${incomes.month}) < ${monthKey}`,
    )),
    db.select({ total: sql<string>`COALESCE(SUM(${expenseValue}), 0)` }).from(expenses).where(and(
      ...expenseBaseConditions([userId], accountId),
      sql`(${expenses.year} * 12 + ${expenses.month}) < ${monthKey}`,
    )),
  ]);

  return toNumber(incomeRows[0]?.total) - toNumber(expenseRows[0]?.total);
}

// Saldo detalhado de um mês específico: o que veio de antes (calculado em
// tempo real, sem snapshot) + o que aconteceu no próprio mês.
export async function calculateBalanceBreakdown(userId: number, year: number, month: number, accountId: number | null): Promise<BalanceBreakdown> {
  const [incomeRows, expenseRows, previousBalance] = await Promise.all([
    db.select({ total: sql<string>`COALESCE(SUM(${incomes.amount}), 0)` }).from(incomes).where(and(
      ...incomeBaseConditions([userId], accountId),
      eq(incomes.year, year),
      eq(incomes.month, month),
    )),
    // O total pago sai na mesma consulta: base do Saldo Atual.
    db.select({
      total: sql<string>`COALESCE(SUM(${expenseValue}), 0)`,
      paidTotal: sql<string>`COALESCE(SUM(CASE WHEN ${expenses.paid} THEN ${expenseValue} ELSE 0 END), 0)`,
    }).from(expenses).where(and(
      ...expenseBaseConditions([userId], accountId),
      eq(expenses.year, year),
      eq(expenses.month, month),
    )),
    calculatePreviousBalance(userId, year, month, accountId),
  ]);

  const totalIncomes = toNumber(incomeRows[0]?.total);
  const totalExpenses = toNumber(expenseRows[0]?.total);
  const paidExpenses = toNumber(expenseRows[0]?.paidTotal);

  return { previousBalance, totalIncomes, totalExpenses, paidExpenses, finalBalance: previousBalance + totalIncomes - totalExpenses };
}

export async function calculateFinalBalance(userId: number, year: number, month: number, accountId: number | null): Promise<number> {
  const breakdown = await calculateBalanceBreakdown(userId, year, month, accountId);
  return breakdown.finalBalance;
}
