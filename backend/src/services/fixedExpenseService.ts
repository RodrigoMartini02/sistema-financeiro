import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db/client';
import { cards, categories, expenses, fixedExpenses, type Expense, type FixedExpense, type NewExpense } from '../db/schema';
import { accountCondition } from '../utils/accountFilter';
import { addMonthsClamped, getMonthYearFromIsoDate } from '../utils/date';
import { canEditOthersEntries, resolveOwnerForWrite, resolveVisibleCardOwnerIds } from '../utils/familyVisibility';
import { RequestInputError } from '../utils/requestInput';
import { BudgetInputError, resolveFinancialAccount } from './budgetService';
import { isExpenseCategoryAllowed } from './expenseCategoryCatalog';
import { resolveEditedPayment } from './expensePayment';
import { fixedConversionRefusal, fixedExpenseDates, fixedExpenseYearDates } from './fixedExpenseSchedule';
import type { FixedExpenseInput, FixedExpenseUpdateInput } from './fixedExpenseInput';
import type { UpdateExpenseInput, PaymentMethod } from './expenseInput';
import type { InvoiceCardDays } from './expenseSeries';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const NOT_FOUND = 'Despesa fixa não encontrada';

export function fixedExpenseDto(source: FixedExpense) {
  return { ...source, amount: Number(source.amount), firstMonth: source.firstMonth.slice(0, 7) };
}

async function accountFor(requesterId: number, accountId: number | null): Promise<number> {
  try {
    return (await resolveFinancialAccount(requesterId, accountId)).id;
  } catch (error) {
    if (error instanceof BudgetInputError) throw new RequestInputError('Conta não encontrada', 404);
    throw error;
  }
}

async function validateFields(requesterId: number, accountId: number, input: Pick<FixedExpenseInput, 'categoryId' | 'paymentMethod' | 'cardId'>) {
  const [category] = await db.select({ active: categories.ativo }).from(categories).where(eq(categories.id, input.categoryId));
  if (!category || category.active === false || !(await isExpenseCategoryAllowed(requesterId, accountId, input.categoryId))) {
    throw new RequestInputError('Categoria indisponível para esta conta');
  }
  if (input.cardId === null) {
    if (input.paymentMethod === 'credito') throw new RequestInputError('Escolha o cartão de crédito');
    return null;
  }
  const owners = await resolveVisibleCardOwnerIds(requesterId, accountId, true);
  const [card] = await db.select({ id: cards.id, closingDay: cards.closingDay, dueDay: cards.dueDay, active: cards.active, type: cards.type })
    .from(cards).where(and(
      eq(cards.id, input.cardId), inArray(cards.userId, owners), accountCondition(cards.accountId, cards.userId, accountId),
    ));
  if (!card || card.active === false || (card.type && card.type !== 'ambos' && card.type !== input.paymentMethod)) {
    throw new RequestInputError('Cartão indisponível para este lançamento');
  }
  return card;
}

async function sourceForWrite(requesterId: number, id: number): Promise<FixedExpense> {
  // Só os dados de autorização são lidos antes de verificar conta e autor.
  const [identity] = await db.select({ userId: fixedExpenses.userId, accountId: fixedExpenses.accountId })
    .from(fixedExpenses).where(eq(fixedExpenses.id, id));
  if (!identity) throw new RequestInputError(NOT_FOUND, 404);
  await accountFor(requesterId, identity.accountId);
  if (identity.userId !== requesterId && !(await canEditOthersEntries(requesterId, identity.accountId))) {
    throw new RequestInputError(NOT_FOUND, 404);
  }
  const [source] = await db.select().from(fixedExpenses).where(and(
    eq(fixedExpenses.id, id), eq(fixedExpenses.userId, identity.userId), eq(fixedExpenses.accountId, identity.accountId),
  ));
  if (!source) throw new RequestInputError(NOT_FOUND, 404);
  return source;
}

function sourceScope(source: FixedExpense) {
  return and(eq(fixedExpenses.id, source.id), eq(fixedExpenses.accountId, source.accountId), eq(fixedExpenses.userId, source.userId));
}

function occurrenceScope(source: FixedExpense) {
  return and(eq(expenses.fixedExpenseId, source.id), eq(expenses.userId, source.userId), accountCondition(expenses.accountId, expenses.userId, source.accountId));
}

async function writeYear(transaction: Transaction, source: FixedExpense, year: number, card: InvoiceCardDays | null, after?: string) {
  const dates = fixedExpenseYearDates(source, year, card).filter(item => !after || item.competence > after);
  if (dates.length === 0) return;
  const rows: NewExpense[] = dates.map(item => {
    const { mes, ano } = getMonthYearFromIsoDate(item.dueDate);
    return {
      userId: source.userId, accountId: source.accountId, categoryId: source.categoryId,
      description: source.description, paymentMethod: source.paymentMethod, cardId: source.cardId,
      purchaseDate: item.purchaseDate, dueDate: item.dueDate, month: mes, year: ano,
      originalAmount: source.amount, estimatedAmount: source.amount,
      fixedExpenseId: source.id, fixedCompetence: item.competence,
      status: 'prevista', paid: false, recurring: false, installment: false,
    };
  });
  // Unicidade inclui canceladas: gerar o ano novamente nunca ressuscita um mês retirado.
  await transaction.insert(expenses).values(rows).onConflictDoNothing();
}

export async function listFixedExpenses(requesterId: number, requestedAccountId: number | null) {
  const accountId = await accountFor(requesterId, requestedAccountId);
  const sources = await db.select().from(fixedExpenses).where(and(
    eq(fixedExpenses.accountId, accountId), eq(fixedExpenses.userId, requesterId),
  )).orderBy(asc(fixedExpenses.description), asc(fixedExpenses.id));
  return sources.map(fixedExpenseDto);
}

export async function listPendingFixedExpenses(requesterId: number, requestedAccountId: number | null, month: string) {
  const accountId = await accountFor(requesterId, requestedAccountId);
  const parent = alias(categories, 'fixed_category_parent');
  const rows = await db.select({
    id: expenses.id, userId: expenses.userId, accountId: expenses.accountId, description: expenses.description,
    amount: expenses.originalAmount, estimatedAmount: expenses.estimatedAmount,
    categoryId: expenses.categoryId, categoryName: categories.name, parentCategoryName: parent.name,
    paymentMethod: expenses.paymentMethod, cardId: expenses.cardId, cardName: cards.name,
    purchaseDate: expenses.purchaseDate, dueDate: expenses.dueDate, month: expenses.month, year: expenses.year,
    status: expenses.status, fixedExpenseId: expenses.fixedExpenseId, fixedCompetence: expenses.fixedCompetence,
    createdAt: expenses.createdAt, attachments: expenses.attachments, invoiceNumber: expenses.numeroNf, invoiceDate: expenses.dataEmissaoNf,
  }).from(expenses)
    .innerJoin(fixedExpenses, and(eq(fixedExpenses.id, expenses.fixedExpenseId), eq(fixedExpenses.userId, expenses.userId)))
    .leftJoin(categories, eq(categories.id, expenses.categoryId)).leftJoin(parent, eq(parent.id, categories.parentId))
    .leftJoin(cards, eq(cards.id, expenses.cardId))
    .where(and(eq(expenses.accountId, accountId), eq(fixedExpenses.accountId, accountId), eq(expenses.userId, requesterId),
      eq(expenses.fixedCompetence, `${month}-01`), eq(expenses.status, 'prevista')))
    .orderBy(asc(expenses.dueDate), asc(expenses.id));
  return rows.map(row => ({ ...row, amount: Number(row.amount), estimatedAmount: row.estimatedAmount === null ? null : Number(row.estimatedAmount) }));
}

export async function createFixedExpense(requesterId: number, input: FixedExpenseInput) {
  const accountId = await accountFor(requesterId, input.accountId);
  const card = await validateFields(requesterId, accountId, input);
  const ownerId = input.sourceExpenseId === null ? requesterId : await resolveOwnerForWrite('despesas', input.sourceExpenseId, requesterId);
  if (ownerId === null) throw new RequestInputError('Despesa não encontrada', 404);
  const [sourceIdentity] = input.sourceExpenseId === null ? [] : await db.select({ cardId: expenses.cardId }).from(expenses).where(and(
    eq(expenses.id, input.sourceExpenseId), eq(expenses.userId, ownerId), accountCondition(expenses.accountId, expenses.userId, accountId),
  ));
  return db.transaction(async transaction => {
    const cardIds = [...new Set([input.cardId, sourceIdentity?.cardId ?? null].filter((id): id is number => id !== null))].sort((a, b) => a - b);
    if (cardIds.length) await transaction.select({ id: cards.id }).from(cards).where(inArray(cards.id, cardIds)).orderBy(asc(cards.id)).for('update');
    let original: Expense | undefined;
    if (input.sourceExpenseId !== null) {
      [original] = await transaction.select().from(expenses).where(and(
        eq(expenses.id, input.sourceExpenseId), eq(expenses.userId, ownerId), accountCondition(expenses.accountId, expenses.userId, accountId),
      )).for('update');
      if (!original) throw new RequestInputError('Despesa não encontrada', 404);
      if (original.cardId !== sourceIdentity?.cardId) throw new RequestInputError('A despesa mudou. Atualize a tela antes de criar a fixa.', 409);
      const refusal = fixedConversionRefusal(original);
      if (refusal) throw new RequestInputError(refusal, 409);
    }
    const [source] = await transaction.insert(fixedExpenses).values({
      userId: ownerId, accountId, categoryId: input.categoryId, description: input.description,
      amount: input.amount.toFixed(2), paymentMethod: input.paymentMethod, cardId: input.cardId,
      purchaseDate: input.purchaseDate, dueDate: input.dueDate, firstMonth: `${input.firstMonth}-01`,
      registeredYear: Number(input.firstMonth.slice(0, 4)), active: true,
    }).returning();
    if (!source) throw new Error('Fixed expense insert returned no source');
    if (original) {
      await transaction.update(expenses).set({
        fixedExpenseId: source.id, fixedCompetence: `${input.firstMonth}-01`, estimatedAmount: original.originalAmount,
      }).where(and(eq(expenses.id, original.id), eq(expenses.userId, ownerId)));
    }
    await writeYear(transaction, source, source.registeredYear, card, original ? `${input.firstMonth}-01` : undefined);
    return fixedExpenseDto(source);
  });
}

export async function updateFixedExpense(requesterId: number, id: number, input: FixedExpenseUpdateInput, today: string) {
  const source = await sourceForWrite(requesterId, id);
  if ((input.accountId !== null && input.accountId !== source.accountId) || input.firstMonth !== source.firstMonth.slice(0, 7)) {
    throw new RequestInputError('A conta e o mês inicial da fixa não podem mudar');
  }
  const card = await validateFields(requesterId, source.accountId, input);
  return db.transaction(async transaction => {
    const [locked] = await transaction.select().from(fixedExpenses).where(sourceScope(source)).for('update');
    if (!locked) throw new RequestInputError(NOT_FOUND, 404);
    const [updated] = await transaction.update(fixedExpenses).set({
      description: input.description, categoryId: input.categoryId, amount: input.amount.toFixed(2),
      paymentMethod: input.paymentMethod, cardId: input.cardId, purchaseDate: input.purchaseDate,
      dueDate: input.dueDate, updatedAt: new Date(),
    }).where(sourceScope(source)).returning();
    if (!updated) throw new RequestInputError(NOT_FOUND, 404);
    if (input.applyToFuture) {
      const pending = await transaction.select({ id: expenses.id, competence: expenses.fixedCompetence })
        .from(expenses).where(and(occurrenceScope(source), eq(expenses.status, 'prevista'), gte(expenses.dueDate, today)))
        .orderBy(asc(expenses.id)).for('update');
      for (const occurrence of pending) {
        if (!occurrence.competence) continue;
        const dates = fixedExpenseDates(updated, occurrence.competence, card);
        const { mes, ano } = getMonthYearFromIsoDate(dates.dueDate);
        await transaction.update(expenses).set({
          description: updated.description, categoryId: updated.categoryId, originalAmount: updated.amount, estimatedAmount: updated.amount,
          paymentMethod: updated.paymentMethod, cardId: updated.cardId, purchaseDate: dates.purchaseDate,
          dueDate: dates.dueDate, month: mes, year: ano,
        }).where(and(eq(expenses.id, occurrence.id), occurrenceScope(source), eq(expenses.status, 'prevista')));
      }
    }
    return fixedExpenseDto(updated);
  });
}

export async function deactivateFixedExpense(requesterId: number, id: number, today: string) {
  const source = await sourceForWrite(requesterId, id);
  await db.transaction(async transaction => {
    await transaction.select({ id: fixedExpenses.id }).from(fixedExpenses).where(sourceScope(source)).for('update');
    await transaction.update(fixedExpenses).set({ active: false, updatedAt: new Date() }).where(sourceScope(source));
    await transaction.update(expenses).set({ status: 'cancelada' })
      .where(and(occurrenceScope(source), eq(expenses.status, 'prevista'), gte(expenses.dueDate, today)));
  });
}

export async function renewFixedExpense(requesterId: number, id: number, year: number) {
  const source = await sourceForWrite(requesterId, id);
  const card = await validateFields(requesterId, source.accountId, source as FixedExpense & { paymentMethod: PaymentMethod });
  return db.transaction(async transaction => {
    const [locked] = await transaction.select().from(fixedExpenses).where(sourceScope(source)).for('update');
    if (!locked || !locked.active) throw new RequestInputError('Esta despesa fixa está desativada', 409);
    // O cartão foi autorizado antes da transação. Uma edição que ganhou a
    // corrida pode ter trocado cartão, categoria ou datas; não gerar com a
    // fonte nova e o cartão antigo. Repetir a requisição revalida a versão nova.
    if (locked.cardId !== source.cardId || locked.paymentMethod !== source.paymentMethod
      || locked.purchaseDate !== source.purchaseDate || locked.dueDate !== source.dueDate
      || locked.categoryId !== source.categoryId || locked.amount !== source.amount) {
      throw new RequestInputError('A configuração da fixa mudou. Atualize a tela antes de renovar.', 409);
    }
    if (year !== locked.registeredYear && year !== locked.registeredYear + 1) {
      throw new RequestInputError('Renove a despesa fixa para o próximo ano', 409);
    }
    await writeYear(transaction, locked, year, card);
    const [updated] = await transaction.update(fixedExpenses).set({ registeredYear: Math.max(year, locked.registeredYear), updatedAt: new Date() })
      .where(sourceScope(source)).returning();
    return fixedExpenseDto(updated!);
  });
}

export async function fixedOccurrenceIdentity(requesterId: number, id: number) {
  const ownerId = await resolveOwnerForWrite('despesas', id, requesterId);
  if (ownerId === null) throw new RequestInputError('Despesa não encontrada', 404);
  const [row] = await db.select({ accountId: expenses.accountId, fixedExpenseId: expenses.fixedExpenseId, cardId: expenses.cardId, status: expenses.status })
    .from(expenses).where(and(eq(expenses.id, id), eq(expenses.userId, ownerId)));
  if (!row) throw new RequestInputError('Despesa não encontrada', 404);
  const accountId = await accountFor(requesterId, row.accountId);
  return { ...row, ownerId, accountId };
}

/** Edição de previsão preserva estado; confirmação é a única transição para ativa. */
export async function writeFixedOccurrence(requesterId: number, id: number, input: UpdateExpenseInput, confirm: boolean, today: string) {
  const identity = await fixedOccurrenceIdentity(requesterId, id);
  if (identity.fixedExpenseId === null) throw new RequestInputError('Esta despesa não é uma previsão fixa', 409);
  const fixedId = identity.fixedExpenseId;
  if (input.installmentCount !== null || input.cashPrice !== null || input.applyTo !== 'this') {
    throw new RequestInputError('A previsão fixa é alterada somente neste mês');
  }
  if (!confirm && (input.paid || input.paymentDate !== null || input.amountPaid !== null)) {
    throw new RequestInputError('Confirme a previsão antes de registrar o pagamento');
  }
  if (input.paymentMethod === 'credito' && input.paid) throw new RequestInputError('Despesa no crédito é paga pela fatura do cartão');
  await validateFields(requesterId, identity.accountId, input);
  return db.transaction(async transaction => {
    // A fatura também trava cartão antes das compras. Ordem estável evita inversão entre cartões.
    const cardIds = [...new Set([identity.cardId, input.cardId].filter((value): value is number => value !== null))].sort((a, b) => a - b);
    if (cardIds.length) {
      const lockedCards = await transaction.select({ id: cards.id, active: cards.active }).from(cards)
        .where(inArray(cards.id, cardIds)).orderBy(asc(cards.id)).for('update');
      if (input.cardId !== null && !lockedCards.some(card => card.id === input.cardId && card.active !== false)) {
        throw new RequestInputError('Cartão indisponível para este lançamento');
      }
    }
    const [current] = await transaction.select().from(expenses).where(and(
      eq(expenses.id, id), eq(expenses.userId, identity.ownerId), accountCondition(expenses.accountId, expenses.userId, identity.accountId),
    )).for('update');
    if (!current || current.fixedExpenseId !== identity.fixedExpenseId) throw new RequestInputError('Despesa não encontrada', 404);
    const [source] = await transaction.select({ id: fixedExpenses.id }).from(fixedExpenses).where(and(
      eq(fixedExpenses.id, fixedId), eq(fixedExpenses.userId, identity.ownerId), eq(fixedExpenses.accountId, identity.accountId),
    ));
    if (!source || current.fixedCompetence === null) throw new RequestInputError('Vínculo da despesa fixa inválido', 409);
    if (current.status !== 'prevista') throw new RequestInputError('Esta previsão já foi confirmada ou retirada. Atualize a lista.', 409);
    const { mes, ano } = getMonthYearFromIsoDate(input.dueDate);
    const [updated] = await transaction.update(expenses).set({
      description: input.description, categoryId: input.categoryId, paymentMethod: input.paymentMethod, cardId: input.cardId,
      purchaseDate: input.purchaseDate, dueDate: input.dueDate, month: mes, year: ano,
      originalAmount: input.amount.toFixed(2), attachments: input.attachments, numeroNf: input.invoiceNumber, dataEmissaoNf: input.invoiceDate,
      ...(confirm ? resolveEditedPayment(input, today) : { paid: false, paymentDate: null, amountPaid: null }),
      status: confirm ? 'ativa' : 'prevista',
    }).where(and(eq(expenses.id, id), eq(expenses.userId, identity.ownerId), eq(expenses.status, 'prevista'))).returning();
    return updated!;
  });
}

/** Tombstone ocupa a competência inclusive após a ação Excluir. */
export async function cancelFixedOccurrence(requesterId: number, id: number): Promise<boolean> {
  const identity = await fixedOccurrenceIdentity(requesterId, id);
  if (identity.fixedExpenseId === null) return false;
  const fixedId = identity.fixedExpenseId;
  return db.transaction(async transaction => {
    if (identity.cardId !== null) await transaction.select({ id: cards.id }).from(cards).where(eq(cards.id, identity.cardId)).for('update');
    const [row] = await transaction.select().from(expenses).where(and(
      eq(expenses.id, id), eq(expenses.userId, identity.ownerId), accountCondition(expenses.accountId, expenses.userId, identity.accountId),
    )).for('update');
    if (!row || row.fixedExpenseId === null) throw new RequestInputError('Despesa não encontrada', 404);
    if (row.invoicePaymentId !== null || row.invoiceOriginPaymentId !== null) {
      throw new RequestInputError('Esta despesa faz parte de um pagamento de fatura. Desfaça o pagamento da fatura.');
    }
    await transaction.update(expenses).set({ status: 'cancelada' })
      .where(and(eq(expenses.id, id), eq(expenses.userId, identity.ownerId), eq(expenses.fixedExpenseId, fixedId)));
    return true;
  });
}

/** Move só a data de caixa; a identidade mensal permanece ocupada. */
export async function moveFixedOccurrence(requesterId: number, id: number) {
  const identity = await fixedOccurrenceIdentity(requesterId, id);
  if (identity.fixedExpenseId === null) throw new RequestInputError('Despesa fixa não encontrada', 404);
  return db.transaction(async transaction => {
    if (identity.cardId !== null) await transaction.select({ id: cards.id }).from(cards).where(eq(cards.id, identity.cardId)).for('update');
    const [row] = await transaction.select().from(expenses).where(and(
      eq(expenses.id, id), eq(expenses.userId, identity.ownerId), accountCondition(expenses.accountId, expenses.userId, identity.accountId),
    )).for('update');
    if (!row || row.fixedExpenseId === null) throw new RequestInputError('Despesa não encontrada', 404);
    if (row.paid || row.status === 'cancelada' || row.invoicePaymentId !== null || row.invoiceOriginPaymentId !== null) {
      throw new RequestInputError('Esta ocorrência não pode ser movida');
    }
    const dueDate = addMonthsClamped(row.dueDate, 1);
    const { mes, ano } = getMonthYearFromIsoDate(dueDate);
    const [updated] = await transaction.update(expenses).set({
      originalDueDate: row.originalDueDate ?? row.dueDate, dueDate, month: mes, year: ano,
    }).where(and(eq(expenses.id, id), eq(expenses.userId, identity.ownerId))).returning();
    return updated!;
  });
}
