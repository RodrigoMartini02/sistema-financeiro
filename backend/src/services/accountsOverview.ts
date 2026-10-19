// Totais de despesa e receita de cada conta no período, para a visão geral das contas (Painel, "Todas as
// contas"). A despesa conta pela data de caixa (cashDate.ts), como no resto do sistema.
import { pool } from '../db/client';
import { expenseCashDateSql } from './cashDate';
import { countedExpenseSql } from './expenseCounting';

export interface AccountTotal {
  conta_id: number;
  total: string;
}

export interface AccountsOverviewInput {
  accountIds: number[];
  /** Conta padrão do dono: recebe os registros antigos sem conta_id. */
  defaultAccountId: number | null;
  /** Autores cujos registros sem conta_id entram na conta padrão. */
  fallbackAuthorIds: number[];
  start: string;
  end: string;
  /** Hoje: a mensal em aberto só entra depois da data dela (expenseCounting). */
  today: string;
}

export async function loadAccountTotals(input: AccountsOverviewInput): Promise<{ expenses: AccountTotal[]; incomes: AccountTotal[] }> {
  const baseParams = [input.accountIds, input.defaultAccountId, input.fallbackAuthorIds, input.start, input.end];
  const [expensesResult, incomesResult] = await Promise.all([
    // Despesas de TODOS os autores das contas listadas, somadas por conta —
    // conta_id nunca vem do client, so da lista ja resolvida pela rota. Fallback
    // (conta_id nulo) so entra quando a conta padrao do dono esta no
    // conjunto pedido, e so pelos autores vinculados a ela. Recorrente em
    // aberto so entra depois da data dela ($6 = hoje; expenseCounting).
    pool.query<AccountTotal>(
      `SELECT COALESCE(d.conta_id, $2) AS conta_id,
              COALESCE(SUM(CASE WHEN d.pago THEN COALESCE(d.valor_pago, d.valor_original) ELSE d.valor_original END), 0) AS total
       FROM despesas d
       WHERE d.status = 'ativa' AND ${expenseCashDateSql('d')} BETWEEN $4::date AND $5::date
         AND (
           d.conta_id = ANY($1)
           OR (d.conta_id IS NULL AND $2::int IS NOT NULL AND $2 = ANY($1) AND d.usuario_id = ANY($3))
         )
         AND ${countedExpenseSql('d', '$6')}
       GROUP BY COALESCE(d.conta_id, $2)`,
      [...baseParams, input.today],
    ),
    pool.query<AccountTotal>(
      `SELECT COALESCE(r.conta_id, $2) AS conta_id, COALESCE(SUM(r.valor_liquido), 0) AS total
       FROM receitas r
       WHERE r.status = 'ativa' AND r.data_recebimento BETWEEN $4::date AND $5::date
         AND (
           r.conta_id = ANY($1)
           OR (r.conta_id IS NULL AND $2::int IS NOT NULL AND $2 = ANY($1) AND r.usuario_id = ANY($3))
         )
       GROUP BY COALESCE(r.conta_id, $2)`,
      baseParams,
    ),
  ]);
  return { expenses: expensesResult.rows, incomes: incomesResult.rows };
}
