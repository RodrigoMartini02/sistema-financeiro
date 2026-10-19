// Despesas vencidas e não pagas, e o "Mover" delas para o mês atual. Fica de fora a compra no
// crédito com cartão: ela se paga pela fatura (cardInvoiceService), e não se move de mês.
// Mover grava o vencimento de antes em data_vencimento_original (só na primeira vez), para o
// atraso continuar visível no painel mesmo depois de a conta ir para o mês atual.
import { pool } from '../db/client';
import { accountWhere } from '../utils/accountFilter';
import { getMonthYearFromIsoDate } from '../utils/date';
import { INVOICE_EXPENSE_METHOD } from './cardInvoiceRules';
import { moveTargetDate } from './overdueExpenseRules';

export const MAX_MOVE_BATCH = 200;

export interface OverdueExpense {
  id: number;
  description: string;
  amount: number;
  dueDate: string;
  categoryName: string | null;
  installment: string | null;
}

interface OverdueRow {
  id: number;
  descricao: string;
  valor_original: string | null;
  data_vencimento: string;
  categoria_nome: string | null;
  parcela_atual: number | null;
  numero_parcelas: number | null;
}

// Vencida (antes de hoje), ativa, não paga (pago em branco conta como em aberto) e fora do crédito com cartão.
const OVERDUE_CONDITION = `NOT COALESCE(d.pago, false)
  AND COALESCE(d.status, 'ativa') = 'ativa'
  AND d.data_vencimento < $2::date
  AND NOT (d.forma_pagamento = '${INVOICE_EXPENSE_METHOD}' AND d.cartao_id IS NOT NULL)`;

export async function listOverdueExpenses(userId: number, accountId: number | null, today: string): Promise<OverdueExpense[]> {
  const params: unknown[] = [userId, today];
  const account = accountWhere(accountId, params.length + 1, 'd');
  params.push(...account.params);
  const result = await pool.query<OverdueRow>(
    `SELECT d.id, d.descricao, d.valor_original, d.data_vencimento, c.nome AS categoria_nome,
            d.parcela_atual, d.numero_parcelas
     FROM despesas d
     LEFT JOIN categorias c ON c.id = d.categoria_id
     WHERE d.usuario_id = $1 AND ${OVERDUE_CONDITION}${account.clause}
     ORDER BY d.data_vencimento ASC, d.id ASC`,
    params,
  );
  return result.rows.map((row) => ({
    id: row.id,
    description: row.descricao,
    amount: Number(row.valor_original ?? 0),
    dueDate: row.data_vencimento,
    categoryName: row.categoria_nome,
    installment: row.numero_parcelas && row.parcela_atual ? `${row.parcela_atual}/${row.numero_parcelas}` : null,
  }));
}

/** Move as vencidas pedidas para o mês atual; as que não são vencidas, pagas ou de outra pessoa são ignoradas. Devolve quantas moveu. */
export async function moveOverdueExpenses(userId: number, accountId: number | null, ids: number[], today: string): Promise<number> {
  const params: unknown[] = [userId, today, ids];
  const account = accountWhere(accountId, params.length + 1, 'd');
  params.push(...account.params);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows = await client.query<{ id: number; data_vencimento: string }>(
      `SELECT d.id, d.data_vencimento FROM despesas d
       WHERE d.usuario_id = $1 AND d.id = ANY($3::int[]) AND ${OVERDUE_CONDITION}${account.clause}
       FOR UPDATE OF d`,
      params,
    );
    for (const row of rows.rows) {
      const target = moveTargetDate(row.data_vencimento, today);
      const { mes, ano } = getMonthYearFromIsoDate(target);
      await client.query(
        `UPDATE despesas
         SET data_vencimento_original = COALESCE(data_vencimento_original, data_vencimento),
             data_vencimento = $1, mes = $2, ano = $3
         WHERE id = $4`,
        [target, mes, ano, row.id],
      );
    }
    await client.query('COMMIT');
    return rows.rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
