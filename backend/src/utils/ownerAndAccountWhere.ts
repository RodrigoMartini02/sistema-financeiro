import { accountWhere } from './accountFilter';

// Cláusula WHERE compartilhada por rotas de despesas/receitas: resolve o
// usuário-alvo (permitindo `master` consultar por outro usuário via query
// param), filtra por mês/ano quando informados, e aplica o filtro de conta
// (delegado a accountWhere, mesma regra de fallback usada em todo o backend).
export function buildOwnerAndAccountWhere(
  userId: number,
  userType: string,
  queryUserId: string | undefined,
  mes: string | undefined,
  ano: string | undefined,
  contaId: string | undefined,
  tableAlias: string,
): { where: string; params: unknown[] } {
  const params: unknown[] = [];
  let p = 0;

  const targetUserId = queryUserId && userType === 'master' ? parseInt(queryUserId) : userId;
  p++;
  let where = `WHERE ${tableAlias}.usuario_id = $${p}`;
  params.push(targetUserId);

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
