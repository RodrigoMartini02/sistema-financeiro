import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { expenses, incomes, years } from '../db/schema';
import { collectYearEntryAttachmentKeys } from './attachmentService';
import { removeAttachmentObjects } from './attachmentStorage';
import { returnStockOfYear } from './incomeService';

export async function deleteUserYear(userId: number, year: number): Promise<void> {
  const removedKeys = await db.transaction(async (transaction) => {
    await returnStockOfYear(transaction, userId, year);
    // As linhas dos anexos saem com os lançamentos (cascata); os arquivos no R2 saem depois, pelas chaves colhidas aqui.
    const attachmentKeys = await collectYearEntryAttachmentKeys(userId, year, transaction);
    await transaction.delete(incomes).where(and(eq(incomes.userId, userId), eq(incomes.year, year), isNull(incomes.fixedClassificationId)));
    await transaction.update(incomes).set({ status: 'cancelada' }).where(and(eq(incomes.userId, userId), eq(incomes.year, year), isNotNull(incomes.fixedClassificationId)));
    // Remove comuns primeiro: uma conversão concorrente para fixa precisa ser
    // preservada e cancelada pelo update seguinte, sem liberar sua competência.
    await transaction.delete(expenses).where(and(
      eq(expenses.userId, userId), eq(expenses.year, year), isNull(expenses.fixedExpenseId),
    ));
    await transaction.update(expenses).set({ status: 'cancelada' }).where(and(
      eq(expenses.userId, userId), eq(expenses.year, year), isNotNull(expenses.fixedExpenseId),
    ));
    await transaction.delete(years).where(and(eq(years.userId, userId), eq(years.year, year)));
    return attachmentKeys;
  });
  await removeAttachmentObjects(removedKeys);
}
