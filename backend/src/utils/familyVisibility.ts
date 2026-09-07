import { pool } from '../db/client';

/**
 * Resolve quais usuários um solicitante pode enxergar numa conta.
 *
 * Regra: em conta PESSOAL, o gestor e os membros vinculados compartilham a
 * mesma carteira — desde que o solicitante tenha a permissão
 * `acesso_lancamentos_familia`. Fora disso, cada um vê apenas o que cadastrou.
 *
 * Conta EMPRESA nunca compartilha: colaboradores seguem isolados. Membros
 * da família só existem em conta pessoal.
 *
 * Retorna sempre uma lista que contém pelo menos o próprio solicitante — em
 * nenhum caminho de erro ela volta vazia ou aberta, para que uma falha aqui
 * restrinja o acesso em vez de ampliá-lo.
 */
export async function resolveVisibleUserIds(
  requesterId: number,
  accountId: number | null,
): Promise<number[]> {
  const sozinho = [requesterId];
  if (!accountId) return sozinho;

  const conta = await pool.query(
    `SELECT tipo, usuario_id FROM contas WHERE id = $1`,
    [accountId],
  );
  const row = conta.rows[0] as { tipo: string; usuario_id: number } | undefined;
  if (!row || row.tipo !== 'pessoal') return sozinho;

  // O solicitante precisa pertencer à conta: ou é o dono, ou é membro ativo.
  // Sem esta checagem, informar um conta_id alheio abriria a carteira de outro
  // usuário.
  const dono = row.usuario_id;
  if (requesterId !== dono) {
    const vinculo = await pool.query(
      `SELECT 1 FROM conta_membros
        WHERE conta_id = $1 AND usuario_id = $2 AND status = 'ativo' LIMIT 1`,
      [accountId, requesterId],
    );
    if (vinculo.rows.length === 0) return sozinho;
  }

  // O dono da conta sempre enxerga a carteira inteira; o membro depende da
  // permissão que o gestor liberou.
  if (requesterId !== dono) {
    const perm = await pool.query(
      `SELECT acesso_lancamentos_familia FROM membro_permissoes WHERE usuario_id = $1`,
      [requesterId],
    );
    const liberado = (perm.rows[0] as { acesso_lancamentos_familia: boolean } | undefined)
      ?.acesso_lancamentos_familia;
    if (!liberado) return sozinho;
  }

  const membros = await pool.query(
    `SELECT usuario_id FROM conta_membros WHERE conta_id = $1 AND status = 'ativo'`,
    [accountId],
  );
  const ids = new Set<number>([dono, requesterId]);
  for (const m of membros.rows as { usuario_id: number }[]) ids.add(m.usuario_id);
  return [...ids];
}

/**
 * Diz se o solicitante pode alterar ou excluir um lançamento de outra pessoa
 * na mesma conta. O próprio autor sempre pode mexer no que é dele — isso é
 * verificado por quem chama, comparando o `usuario_id` do registro.
 */
export async function canEditOthersEntries(requesterId: number, accountId: number | null): Promise<boolean> {
  if (!accountId) return false;

  const conta = await pool.query(`SELECT tipo, usuario_id FROM contas WHERE id = $1`, [accountId]);
  const row = conta.rows[0] as { tipo: string; usuario_id: number } | undefined;
  if (!row || row.tipo !== 'pessoal') return false;

  // Dono da conta edita o que quiser dentro dela.
  if (requesterId === row.usuario_id) return true;

  const vinculo = await pool.query(
    `SELECT 1 FROM conta_membros
      WHERE conta_id = $1 AND usuario_id = $2 AND status = 'ativo' LIMIT 1`,
    [accountId, requesterId],
  );
  if (vinculo.rows.length === 0) return false;

  const perm = await pool.query(
    `SELECT editar_lancamentos_familia FROM membro_permissoes WHERE usuario_id = $1`,
    [requesterId],
  );
  return (perm.rows[0] as { editar_lancamentos_familia: boolean } | undefined)
    ?.editar_lancamentos_familia === true;
}

/**
 * Guard para as rotas de escrita: diz se o solicitante pode alterar o registro.
 *
 * Retorna o id do dono quando permitido, ou null quando o registro nao existe
 * ou o solicitante nao pode toca-lo. As queries de escrita continuam filtrando
 * por `usuario_id` — aqui apenas se resolve QUAL usuario usar nesse filtro,
 * para nao reescrever as sete rotas de update/delete existentes.
 */
export async function resolveOwnerForWrite(
  tabela: 'despesas' | 'receitas',
  registroId: number,
  requesterId: number,
): Promise<number | null> {
  const reg = await pool.query(
    `SELECT usuario_id, conta_id FROM ${tabela} WHERE id = `,
    [registroId],
  );
  const row = reg.rows[0] as { usuario_id: number; conta_id: number | null } | undefined;
  if (!row) return null;

  // Caso comum: o registro e do proprio solicitante.
  if (row.usuario_id === requesterId) return requesterId;

  // Registro de outra pessoa: so passa com a permissao de editar a carteira
  // da familia, e apenas dentro da mesma conta pessoal.
  const pode = await canEditOthersEntries(requesterId, row.conta_id);
  return pode ? row.usuario_id : null;
}
