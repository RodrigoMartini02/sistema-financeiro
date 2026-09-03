import type { PoolClient } from 'pg';

interface CreateCommissionExpenseParams {
  client: PoolClient;
  userId: number;
  representanteId: number;
  valorComissao: number;
  dataRecebimento: string;
  mes: number;
  ano: number;
  contaId: number | null;
}

// Cria a despesa de comissão vinculada a uma receita, dentro da mesma
// transação da receita — se qualquer etapa falhar, a receita e a comissão
// são desfeitas juntas (nada de receita salva com comissão órfã).
export async function createCommissionExpense({
  client, userId, representanteId, valorComissao, dataRecebimento, mes, ano, contaId,
}: CreateCommissionExpenseParams): Promise<void> {
  const repResult = await client.query(
    'SELECT nome FROM representantes WHERE id = $1 AND usuario_id = $2',
    [representanteId, userId],
  );
  if (repResult.rows.length === 0) return;

  const repNome = (repResult.rows[0] as { nome: string }).nome;

  // Buscar ou criar categoria "Comissão" CUSTOM, exclusiva da conta da
  // receita que a originou — não se espalha para outras contas do mesmo
  // tipo (mesma regra de qualquer categoria criada pelo usuário/sistema
  // sob demanda, não é uma categoria padrão).
  let catResult = await client.query(
    `SELECT id FROM categorias WHERE usuario_id = $1 AND LOWER(nome) = 'comissão' AND conta_id IS NOT DISTINCT FROM $2 LIMIT 1`,
    [userId, contaId],
  );
  if (catResult.rows.length === 0) {
    catResult = await client.query(
      `INSERT INTO categorias (usuario_id, nome, cor, icone, conta_id) VALUES ($1, 'Comissão', '#f59e0b', 'handshake', $2) RETURNING id`,
      [userId, contaId],
    );
  }
  const categoriaId = (catResult.rows[0] as { id: number }).id;

  const numResult = await client.query(
    'SELECT COALESCE(MAX(numero), 0) + 1 AS proximo FROM despesas WHERE usuario_id = $1',
    [userId],
  );
  const proximoNumero = (numResult.rows[0] as { proximo: number }).proximo;

  await client.query(
    `INSERT INTO despesas (usuario_id, descricao, valor_original, valor_final,
      data_vencimento, mes, ano, categoria_id, forma_pagamento, pago, recorrente, conta_id, numero)
     VALUES ($1, $2, $3, $3, $4, $5, $6, $7, 'dinheiro', false, false, $8, $9)`,
    [
      userId,
      `Comissão - ${repNome}`,
      valorComissao,
      dataRecebimento,
      mes,
      ano,
      categoriaId,
      contaId,
      proximoNumero,
    ],
  );
}
