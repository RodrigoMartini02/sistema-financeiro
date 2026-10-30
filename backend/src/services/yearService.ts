import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { expenses, incomes, years } from '../db/schema';
import { returnStockOfYear } from './incomeService';

export async function deleteUserYear(userId: number, year: number): Promise<void> {
  await db.transaction(async (transaction) => {
    await returnStockOfYear(transaction, userId, year);
    await transaction.delete(incomes).where(and(eq(incomes.userId, userId), eq(incomes.year, year)));
    // Remove comuns primeiro: uma conversão concorrente para fixa precisa ser
    // preservada e cancelada pelo update seguinte, sem liberar sua competência.
    await transaction.delete(expenses).where(and(
      eq(expenses.userId, userId), eq(expenses.year, year), isNull(expenses.fixedExpenseId),
    ));
    await transaction.update(expenses).set({ status: 'cancelada' }).where(and(
      eq(expenses.userId, userId), eq(expenses.year, year), isNotNull(expenses.fixedExpenseId),
    ));
    await transaction.delete(years).where(and(eq(years.userId, userId), eq(years.year, year)));
  });
}
