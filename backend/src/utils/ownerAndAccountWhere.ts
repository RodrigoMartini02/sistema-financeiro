import { db, pool } from '../db/client';
import { accountWhere } from './accountFilter';
import { resolveMemberAccountId } from '../middleware/permissions';
import { memberPermissions } from '../db/schema';
import { eq } from 'drizzle-orm';

// Resolve o conjunto de usuario_id visíveis para `userId` dentro da conta
// compartilhada: por padrão, só o próprio autor. Se `userId` for um membro
// com `ver_lancamentos_outros` liberado, expande para todos os autores
// (gestor + demais membros ativos) da mesma conta.
async function resolveVisibleAuthorIds(userId: number): Promise<number[]> {
  const accountId = await resolveMemberAccountId(userId);
  if (accountId === null) return [userId];

  const [permissions] = await db
    .select({ viewOthersEntries: memberPermissions.viewOthersEntries })
    .from(memberPermissions)
    .where(eq(memberPermissions.userId, userId))
    .limit(1);

  if (!permissions?.viewOthersEntries) return [userId];

  const accountOwner = await pool.query('SELECT usuario_id FROM contas WHERE id = $1', [accountId]);
  const ownerId = (accountOwner.rows[0] as { usuario_id: number } | undefined)?.usuario_id;

  const memberRows = await pool.query(
    `SELECT usuario_id FROM conta_membros WHERE conta_id = $1 AND status = 'ativo'`,
    [accountId],
  );

  return [
    ...(ownerId ? [ownerId] : []),
    ...memberRows.rows.map((r: { usuario_id: number }) => r.usuario_id),
  ];
}

// Cláusula WHERE compartilhada por rotas de despesas/receitas: resolve o(s)
// usuário-alvo (permitindo `admin` consultar por outro usuário via query
// param; ou um membro com ver_lancamentos_outros ver todos os autores da
// conta), filtra por mês/ano quando informados, e aplica o filtro de conta
// (delegado a accountWhere, mesma regra de fallback usada em todo o backend).
export async function buildOwnerAndAccountWhere(
  userId: number,
  userType: string,
  queryUserId: string | undefined,
  mes: string | undefined,
  ano: string | undefined,
  contaId: string | undefined,
  tableAlias: string,
): Promise<{ where: string; params: unknown[] }> {
  const params: unknown[] = [];
  let p = 0;

  let where: string;
  if (queryUserId && userType === 'admin') {
    p++;
    where = `WHERE ${tableAlias}.usuario_id = $${p}`;
    params.push(parseInt(queryUserId));
  } else {
    const visibleAuthorIds = await resolveVisibleAuthorIds(userId);
    p++;
    where = `WHERE ${tableAlias}.usuario_id = ANY($${p})`;
    params.push(visibleAuthorIds);
  }

  if (mes !== undefined && ano !== undefined) {
    where += ` AND ${tableAlias}.mes = $${p + 1} AND ${tableAlias}.ano = $${p + 2}`;
    params.push(parseInt(mes), parseInt(ano));
    p += 2;
  }

  const accountId = contaId ? parseInt(contaId) : null;
  const accountClause = accountWhere(accountId, p + 1, tableAlias);
  where += accountClause.clause;
  params.push(...accountClause.params);

  return { where, params };
}
