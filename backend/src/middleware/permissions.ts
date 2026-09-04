import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { accountMembers, accounts, memberPermissions } from '../db/schema';

export type PermissionFlag =
  | 'viewOthersEntries'
  | 'editOthersEntries'
  | 'deleteOthersEntries'
  | 'viewAggregateSummary'
  | 'manageCategories'
  | 'manageCards'
  | 'accessOtherMembersData';

// Resolve o conta_id ao qual `userId` está vinculado como membro ativo, ou
// null se ele não for membro de nenhuma conta (ex.: é o próprio gestor).
export async function resolveMemberAccountId(userId: number): Promise<number | null> {
  const [membership] = await db
    .select({ accountId: accountMembers.accountId })
    .from(accountMembers)
    .where(and(eq(accountMembers.userId, userId), eq(accountMembers.status, 'ativo')))
    .limit(1);
  return membership?.accountId ?? null;
}

// Resolve a Conta Padrão de um usuário quando ele é o dono/gestor (não
// membro de ninguém) — mesma noção usada em accountMembers.ts.
async function resolveOwnedAccountId(userId: number): Promise<number | null> {
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.isDefault, true)))
    .limit(1);
  return account?.id ?? null;
}

// Confirma que `viewerUserId` e `targetUserId` pertencem à MESMA conta
// (via conta_membros, ou o viewer sendo o gestor dono dela) — pré-condição
// obrigatória antes de qualquer checagem de permissão: uma permissão nunca
// autoriza acesso a dados fora da conta vinculada.
async function sameAccount(viewerUserId: number, targetUserId: number): Promise<boolean> {
  if (viewerUserId === targetUserId) return true;

  const viewerMembershipAccountId = await resolveMemberAccountId(viewerUserId);
  const targetAccountId = (await resolveMemberAccountId(targetUserId)) ?? (await resolveOwnedAccountId(targetUserId));

  if (targetAccountId === null) return false;

  if (viewerMembershipAccountId !== null) {
    return viewerMembershipAccountId === targetAccountId;
  }

  // Viewer não é membro de ninguém: só pode ser considerado "na mesma
  // conta" do target se for o gestor dono dela.
  const viewerOwnedAccountId = await resolveOwnedAccountId(viewerUserId);
  return viewerOwnedAccountId !== null && viewerOwnedAccountId === targetAccountId;
}

// Resolve o(s) usuario_id que `requesterId` pode editar/excluir um recurso
// pertencente a `resourceOwnerId`: sempre o próprio dono; adicionalmente
// terceiros da mesma conta se `flag` (editOthersEntries/deleteOthersEntries)
// estiver liberado. Usado nos pontos de UPDATE/DELETE de despesas/receitas
// que hoje filtram só por "id = X AND usuario_id = requesterId" — aqui a
// query passa a checar contra o dono real do recurso, não mais assumir que
// dono == requester.
export async function canActOnResource(requesterId: number, resourceOwnerId: number, flag: PermissionFlag): Promise<boolean> {
  if (requesterId === resourceOwnerId) return true;
  return hasPermission(requesterId, resourceOwnerId, flag);
}

// Verifica se `viewerUserId` tem a flag de permissão `flag` liberada pelo
// gestor E que `targetUserId` pertence à mesma conta vinculada — as duas
// condições são obrigatórias, nunca uma sozinha (ver plano Fase 3).
// O gestor (dono da conta do target) sempre passa, sem depender de flags.
export async function hasPermission(viewerUserId: number, targetUserId: number, flag: PermissionFlag): Promise<boolean> {
  if (viewerUserId === targetUserId) return true;

  const inSameAccount = await sameAccount(viewerUserId, targetUserId);
  if (!inSameAccount) return false;

  const viewerMembershipAccountId = await resolveMemberAccountId(viewerUserId);

  // Viewer não é membro (é o gestor dono da conta): acesso total, sem
  // depender de flags — permissões desta fase regulam apenas membros.
  if (viewerMembershipAccountId === null) return true;

  const [permissions] = await db
    .select()
    .from(memberPermissions)
    .where(eq(memberPermissions.userId, viewerUserId))
    .limit(1);

  return !!permissions?.[flag];
}
