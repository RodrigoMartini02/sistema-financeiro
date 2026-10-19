// Catálogo de categorias de despesa da conta: a despesa só aceita categoria que
// o GET /categories listaria para a mesma conta e que possa receber lançamento
// (catalogRules). Sem isto, o id vindo do pedido podia apontar para a categoria
// de outro usuário (e mostrar o nome dela) ou para um grupo.
import { and, eq, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { accounts, categories } from '../db/schema';
import { resolveAccountOwnerId } from '../utils/familyVisibility';
import { canReceiveEntries, type CatalogAccountType } from './catalogRules';

/** Onde procurar: o tipo da conta e, quando há uma conta, as categorias exclusivas dela. */
export interface CatalogScope {
  type: CatalogAccountType;
  accountId: number | null;
}

/**
 * Linhas do dono que o catálogo enxerga: padrão do tipo da conta, exclusivas da
 * conta e, em conta pessoal, órfãs (sem tipo nem conta). Mesmo critério do GET /categories.
 */
function catalogCondition(ownerId: number, scope: CatalogScope): SQL {
  const visible: SQL[] = [eq(categories.type, scope.type)];
  if (scope.accountId !== null) {
    visible.push(eq(categories.accountId, scope.accountId));
  }
  if (scope.type === 'pessoal') {
    visible.push(and(isNull(categories.type), isNull(categories.accountId))!);
  }
  return and(eq(categories.userId, ownerId), or(...visible))!;
}

/**
 * A categoria precisa ser do dono da conta (o titular, também para membro e
 * colaborador), estar no catálogo dela e poder receber lançamento: em conta PF só
 * subcategoria, em conta PJ a raiz sem subcategoria ativa; nunca a de sistema.
 * Inativas continuam aceitas: desativar uma categoria não pode travar a edição de
 * lançamentos antigos.
 */
export async function isExpenseCategoryAllowed(
  requesterId: number,
  accountId: number | null,
  categoryId: number,
): Promise<boolean> {
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

  const [category] = await db
    .select({ id: categories.id, parentId: categories.parentId, active: categories.ativo, isSystem: categories.isSystem })
    .from(categories)
    .where(and(eq(categories.id, categoryId), catalogCondition(ownerId, { type: account.type, accountId: account.id })))
    .limit(1);
  if (!category) {
    return false;
  }

  const [activeSubcategory] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.parentId, category.id), sql`COALESCE(${categories.ativo}, true)`))
    .limit(1);
  return canReceiveEntries(
    { id: category.id, parentId: category.parentId, active: category.active ?? true, isSystem: category.isSystem },
    activeSubcategory !== undefined,
    account.type,
  );
}

/**
 * Nome já usado no catálogo (padrão ou criada, sem diferenciar maiúsculas),
 * ignorando `exceptId` na edição. É o mesmo critério das classificações de receita.
 */
export async function isCategoryNameTaken(
  ownerId: number,
  scope: CatalogScope,
  name: string,
  exceptId?: number,
): Promise<boolean> {
  const [found] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(
      catalogCondition(ownerId, scope),
      sql`LOWER(${categories.name}) = LOWER(${name.trim()})`,
      exceptId ? ne(categories.id, exceptId) : undefined,
    ))
    .limit(1);
  return found !== undefined;
}
