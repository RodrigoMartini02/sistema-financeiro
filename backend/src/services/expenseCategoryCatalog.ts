// Catálogo de categorias de despesa da conta: a despesa só aceita categoria que
// o GET /categories listaria para a mesma conta. Sem isto, o id vindo do pedido
// podia apontar para a categoria de outro usuário (e mostrar o nome dela).
import { and, eq, isNull, or, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { accounts, categories } from '../db/schema';
import { resolveAccountOwnerId } from '../utils/familyVisibility';

/**
 * Categoria nula é válida (despesa sem categoria). Senão, ela precisa ser do
 * dono da conta (o titular, também para membro e colaborador) e uma destas:
 * padrão do tipo da conta, exclusiva da conta ou, em conta pessoal, órfã (sem
 * tipo nem conta). Inativas continuam aceitas: desativar uma categoria não pode
 * travar a edição de lançamentos antigos.
 */
export async function isExpenseCategoryAllowed(
  requesterId: number,
  accountId: number | null,
  categoryId: number | null,
): Promise<boolean> {
  if (categoryId === null) {
    return true;
  }

  const ownerId = await resolveAccountOwnerId(requesterId, accountId);
  const [account] = await db
    .select({ id: accounts.id, type: accounts.type })
    .from(accounts)
    .where(accountId
      ? and(eq(accounts.id, accountId), eq(accounts.userId, ownerId))
      : and(eq(accounts.userId, ownerId), eq(accounts.isDefault, true)))
    .limit(1);
  if (!account) {
    return false;
  }

  const accountCatalog: SQL[] = [eq(categories.type, account.type), eq(categories.accountId, account.id)];
  if (account.type === 'pessoal') {
    accountCatalog.push(and(isNull(categories.type), isNull(categories.accountId))!);
  }

  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, ownerId), or(...accountCatalog)))
    .limit(1);
  return category !== undefined;
}
