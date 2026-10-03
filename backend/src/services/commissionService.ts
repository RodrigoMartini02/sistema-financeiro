import type { PoolClient } from 'pg';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { expenses } from '../db/schema';
import { ACTIVE_STATUS, CANCELLED_STATUS } from './entryQueries';

interface CreateCommissionExpenseParams {
  client: PoolClient;
  /** Quem lançou a receita: a despesa de comissão fica com ele. */
  authorId: number;
  /** Dono do catálogo da conta (o titular): o representante e a categoria "Comissão" são dele. */
  catalogOwnerId: number;
  representanteId: number;
  valorComissao: number;
  dataRecebimento: string;
  mes: number;
  ano: number;
  contaId: number | null;
  /** Receita que gerou a comissão: a original ou a réplica mensal. */
  incomeId: number;
}

// Cria a despesa de comissão vinculada a uma receita, dentro da mesma
// transação da receita — se qualquer etapa falhar, a receita e a comissão
// são desfeitas juntas (nada de receita salva com comissão órfã).
export async function createCommissionExpense({
  client, authorId, catalogOwnerId, representanteId, valorComissao, dataRecebimento, mes, ano, contaId, incomeId,
}: CreateCommissionExpenseParams): Promise<void> {
  const repResult = await client.query(
    'SELECT nome FROM representantes WHERE id = $1 AND usuario_id = $2',
    [representanteId, catalogOwnerId],
  );
  if (repResult.rows.length === 0) return;

  const repNome = (repResult.rows[0] as { nome: string }).nome;

  // Buscar ou criar categoria "Comissão" CUSTOM, exclusiva da conta da
  // receita que a originou — não se espalha para outras contas do mesmo
  // tipo (mesma regra de qualquer categoria criada pelo usuário/sistema
  // sob demanda, não é uma categoria padrão).
  let catResult = await client.query(
    `SELECT id FROM categorias WHERE usuario_id = $1 AND LOWER(nome) = 'comissão' AND conta_id IS NOT DISTINCT FROM $2 LIMIT 1`,
    [catalogOwnerId, contaId],
  );
  if (catResult.rows.length === 0) {
    catResult = await client.query(
      `INSERT INTO categorias (usuario_id, nome, cor, icone, conta_id) VALUES ($1, 'Comissão', '#f59e0b', 'handshake', $2) RETURNING id`,
      [catalogOwnerId, contaId],
    );
  }
  const categoriaId = (catResult.rows[0] as { id: number }).id;

  // A coluna `numero` guardava um contador sequencial por usuario, calculado
  // com MAX(numero)+1. O valor era gravado e nunca lido de volta: nenhum SELECT,
  // API ou tela o expunha. O `id` da propria tabela ja cumpre o papel de
  // identificador unico, entao a coluna saiu junto com este calculo.
  await client.query(
    `INSERT INTO despesas (usuario_id, descricao, valor_original,
      data_vencimento, mes, ano, categoria_id, forma_pagamento, pago, recorrente, conta_id, receita_origem_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'dinheiro', false, false, $8, $9)`,
    [
      authorId,
      `Comissão - ${repNome}`,
      valorComissao,
      dataRecebimento,
      mes,
      ano,
      categoriaId,
      contaId,
      incomeId,
    ],
  );
}

/**
 * Receita cancelada ou excluída: cancela a comissão que ela gerou, e só se
 * ainda não foi paga — a paga continua, porque o dinheiro já saiu. Comissão
 * antiga sem vínculo com a receita não é tocada.
 */
export async function cancelLinkedCommission(executor: Pick<typeof db, 'update'>, incomeId: number): Promise<void> {
  await executor
    .update(expenses)
    .set({ status: CANCELLED_STATUS })
    .where(and(
      eq(expenses.sourceIncomeId, incomeId),
      eq(expenses.status, ACTIVE_STATUS),
      sql`${expenses.paid} IS NOT TRUE`,
    ));
}
