import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { accounts, expenses, incomes, months, reserves } from '../db/schema';
import { ensureDefaultCategories } from './defaultCategories';

export interface AccountBackfillResult {
  created: boolean;
  migrated?: { incomes: number; expenses: number; months: number; reserves: number };
}

// Contas criadas antes da feature de Contas existir nunca ganharam a linha
// correspondente em `contas` — cadastros novos (POST /auth/register) já criam
// isso automaticamente. Esta função garante a mesma invariante ("todo usuário
// tem ao menos uma Conta ativa") de forma retroativa e idempotente, chamada a
// partir de GET /auth/verify.
export async function ensureUserHasAccount(userId: number): Promise<AccountBackfillResult> {
  const [existing] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.active, true)))
    .limit(1);

  if (existing) return { created: false };

  return db.transaction(async (transaction) => {
    const [created] = await transaction
      .insert(accounts)
      .values({ userId, type: 'pessoal', name: 'Pessoal', active: true, isDefault: true })
      .returning({ id: accounts.id });

    const accountId = created!.id;

    await ensureDefaultCategories(userId, 'pessoal', transaction);

    const [r1, r2, r3, r4] = await Promise.all([
      transaction.update(incomes).set({ accountId }).where(and(eq(incomes.userId, userId), isNull(incomes.accountId))),
      transaction.update(expenses).set({ accountId }).where(and(eq(expenses.userId, userId), isNull(expenses.accountId))),
      transaction.update(months).set({ accountId }).where(and(eq(months.userId, userId), isNull(months.accountId))),
      transaction.update(reserves).set({ accountId }).where(and(eq(reserves.userId, userId), isNull(reserves.accountId))),
    ]);

    return {
      created: true,
      migrated: { incomes: r1.rowCount ?? 0, expenses: r2.rowCount ?? 0, months: r3.rowCount ?? 0, reserves: r4.rowCount ?? 0 },
    };
  });
}
