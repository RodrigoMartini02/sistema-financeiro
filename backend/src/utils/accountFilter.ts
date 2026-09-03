// Cláusula de filtro por conta usada em rotas que escopam dados por conta
// (Pessoal/Empresa), com fallback: um registro sem conta_id definido é
// considerado da conta "pessoal" do usuário dono.
export function accountWhere(
  accountId: number | null,
  paramIndex: number,
  tableAlias?: string,
): { clause: string; params: unknown[] } {
  if (!accountId) return { clause: '', params: [] };
  const col = tableAlias ? `${tableAlias}.conta_id` : 'conta_id';
  const ownerCol = tableAlias ? `${tableAlias}.usuario_id` : 'usuario_id';
  return {
    clause: ` AND (${col} = $${paramIndex} OR (${col} IS NULL AND EXISTS (SELECT 1 FROM contas c WHERE c.id = $${paramIndex} AND c.tipo = 'pessoal' AND c.usuario_id = ${ownerCol})))`,
    params: [accountId],
  };
}
