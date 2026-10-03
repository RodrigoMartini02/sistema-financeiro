import { pool } from '../db/client';
import { accountWhere } from '../utils/accountFilter';

export interface BalanceBreakdown {
  previousBalance: number;
  totalIncomes: number;
  totalExpenses: number;
  /** Só as despesas do mês já pagas — base do Saldo Atual (dinheiro real disponível agora). */
  paidExpenses: number;
  finalBalance: number;
}

// Saldo acumulado de tudo que aconteceu ANTES de (year, month): receitas −
// despesas de todo o histórico anterior. Não há snapshot gravado (tabela
// `meses`, removida), então este valor é sempre recalculado a partir dos
// lançamentos reais. A conta não tem saldo de abertura: o capital dos sócios
// só entra aqui quando é lançado como receita.
export async function calculatePreviousBalance(userId: number, year: number, month: number, accountId: number | null): Promise<number> {
  const { clause, params: extra } = accountWhere(accountId, 3);
  const chave = year * 12 + month;

  const [incomes, expenses_] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(valor), 0) AS total FROM receitas WHERE usuario_id = $1 AND (ano * 12 + mes) < $2 AND status = 'ativa'${clause}`,
      [userId, chave, ...extra],
    ),
    pool.query(
      `SELECT COALESCE(SUM(CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE valor_original END), 0) AS total FROM despesas WHERE usuario_id = $1 AND (ano * 12 + mes) < $2 AND status = 'ativa'${clause}`,
      [userId, chave, ...extra],
    ),
  ]);

  const totalIncomes = parseFloat((incomes.rows[0] as { total: string }).total);
  const totalExpenses = parseFloat((expenses_.rows[0] as { total: string }).total);

  return totalIncomes - totalExpenses;
}

// Saldo detalhado de um mês específico: o que veio de antes (calculado em
// tempo real, sem snapshot) + o que aconteceu no próprio mês.
export async function calculateBalanceBreakdown(userId: number, year: number, month: number, accountId: number | null): Promise<BalanceBreakdown> {
  const { clause, params: extra } = accountWhere(accountId, 4);

  const [incomes, expenses_, previousBalance] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(valor), 0) AS total FROM receitas WHERE usuario_id = $1 AND ano = $2 AND mes = $3 AND status = 'ativa'${clause}`,
      [userId, year, month, ...extra],
    ),
    // Cada parcela ja grava o proprio valor individual (digitado direto ou
    // derivado do preco a vista dividido no formulario) — soma direta, sem
    // dividir de novo por numero_parcelas. Mesma formula usada no historico.
    // paid_total soma so as ja pagas, na mesma query — base do Saldo Atual.
    pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE valor_original END), 0) AS total,
         COALESCE(SUM(CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE 0 END), 0) AS paid_total
       FROM despesas WHERE usuario_id = $1 AND ano = $2 AND mes = $3 AND status = 'ativa'${clause}`,
      [userId, year, month, ...extra],
    ),
    calculatePreviousBalance(userId, year, month, accountId),
  ]);

  const totalIncomes = parseFloat((incomes.rows[0] as { total: string }).total);
  const expensesRow = expenses_.rows[0] as { total: string; paid_total: string };
  const totalExpenses = parseFloat(expensesRow.total);
  const paidExpenses = parseFloat(expensesRow.paid_total);

  return { previousBalance, totalIncomes, totalExpenses, paidExpenses, finalBalance: previousBalance + totalIncomes - totalExpenses };
}

export async function calculateFinalBalance(userId: number, year: number, month: number, accountId: number | null): Promise<number> {
  const breakdown = await calculateBalanceBreakdown(userId, year, month, accountId);
  return breakdown.finalBalance;
}
