import { and, asc, eq, inArray, ne, or } from 'drizzle-orm';
import { db } from '../db/client';
import { cards, categories, expenses, fixedExpenses, incomes, users } from '../db/schema';
import { RequestInputError } from '../utils/requestInput';

/** O reset individual nunca apaga lançamentos ou configurações de outra pessoa. */
export async function clearUserFinancialData(userId: number): Promise<void> {
  await db.transaction(async transaction => {
    // A fatura trava cartão antes de despesa. As fontes precedem suas
    // ocorrências, como na edição/desativação da fixa. Travar o catálogo
    // também impede que uma nova referência passe entre a checagem e o DELETE.
    await transaction.select({ id: cards.id }).from(cards)
      .where(eq(cards.userId, userId)).orderBy(asc(cards.id)).for('update');
    await transaction.select({ id: fixedExpenses.id }).from(fixedExpenses)
      .where(eq(fixedExpenses.userId, userId)).orderBy(asc(fixedExpenses.id)).for('update');
    await transaction.select({ id: categories.id }).from(categories)
      .where(eq(categories.userId, userId)).orderBy(asc(categories.id)).for('update');

    const ownCategories = transaction.select({ id: categories.id }).from(categories).where(eq(categories.userId, userId));
    const ownCards = transaction.select({ id: cards.id }).from(cards).where(eq(cards.userId, userId));
    const [otherExpense] = await transaction.select({ id: expenses.id }).from(expenses).where(and(
      ne(expenses.userId, userId),
      or(inArray(expenses.categoryId, ownCategories), inArray(expenses.cardId, ownCards)),
    )).limit(1);
    const [otherFixedExpense] = await transaction.select({ id: fixedExpenses.id }).from(fixedExpenses).where(and(
      ne(fixedExpenses.userId, userId),
      or(inArray(fixedExpenses.categoryId, ownCategories), inArray(fixedExpenses.cardId, ownCards)),
    )).limit(1);
    if (otherExpense || otherFixedExpense) {
      throw new RequestInputError('Não é possível limpar os dados: suas categorias ou cartões são usados por outra pessoa.', 409);
    }

    // O vínculo da ocorrência impede excluir a fonte antes das despesas.
    // Uma falha posterior desfaz também as exclusões que já ocorreram.
    await transaction.delete(expenses).where(eq(expenses.userId, userId));
    await transaction.delete(fixedExpenses).where(eq(fixedExpenses.userId, userId));
    await transaction.delete(incomes).where(eq(incomes.userId, userId));
    await transaction.delete(categories).where(eq(categories.userId, userId));
    await transaction.delete(cards).where(eq(cards.userId, userId));
    await transaction.update(users)
      .set({ financialData: null, categories: null, cards: null, updatedAt: new Date() })
      .where(eq(users.id, userId));
  });
}
