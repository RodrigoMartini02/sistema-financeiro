import { and, asc, eq, gte, inArray, lt, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db/client';
import { cards, categories, expenses, fixedExpenses, type Expense, type FixedExpense, type NewExpense } from '../db/schema';
import { accountCondition } from '../utils/accountFilter';
import { addMonthsClamped, getMonthYearFromIsoDate, getTodayIsoInTimezone } from '../utils/date';
import { resolveOwnerForWrite, resolveVisibleCardOwnerIds } from '../utils/familyVisibility';
import { RequestInputError } from '../utils/requestInput';
import { BudgetInputError, resolveFinancialAccount } from './budgetService';
import { isExpenseCategoryAllowed } from './expenseCategoryCatalog';
import { resolveEditedPayment } from './expensePayment';
import { fixedConversionRefusal, fixedExpenseRangeDates } from './fixedExpenseSchedule';
import { invoiceEditLockOf, invoiceEditRefusal } from './cardInvoiceRules';
import { paidCreditRefusal, type InvoiceCardDays } from './expenseSeries';
import type { FixedExpenseInput } from './fixedExpenseInput';
import type { UpdateExpenseInput, PaymentMethod } from './expenseInput';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function fixedEndMonth(source: Pick<FixedExpense, 'endMonth' | 'registeredYear' | 'dueDate'>): string {
  return source.endMonth?.slice(0, 7)
    ?? [`${source.registeredYear}-12`, source.dueDate.slice(0, 7)].sort().at(-1)!;
}

export function fixedExpenseDto(source: FixedExpense) {
  return { id: source.id, accountId: source.accountId, userId: source.userId, description: source.description,
    categoryId: source.categoryId, amount: Number(source.amount), paymentMethod: source.paymentMethod,
    cardId: source.cardId, purchaseDate: source.purchaseDate, dueDate: source.dueDate, endMonth: fixedEndMonth(source) };
}

async function accountFor(requesterId: number, accountId: number | null): Promise<number> {
  try {
    return (await resolveFinancialAccount(requesterId, accountId)).id;
  } catch (error) {
    if (error instanceof BudgetInputError) throw new RequestInputError('Conta não encontrada', 404);
    throw error;
  }
}

async function validateFields(requesterId: number, accountId: number, input: Pick<FixedExpenseInput, 'categoryId' | 'paymentMethod' | 'cardId'>,
  preserve: { category?: boolean; card?: boolean } = {}) {
  const [category] = await db.select({ active: categories.ativo }).from(categories).where(eq(categories.id, input.categoryId));
  if (!category || (!preserve.category && (category.active === false || !(await isExpenseCategoryAllowed(requesterId, accountId, input.categoryId))))) {
    throw new RequestInputError('Categoria indisponível para esta conta');
  }
  if (input.cardId === null) {
    if (input.paymentMethod === 'credito') throw new RequestInputError('Escolha o cartão de crédito');
    return null;
  }
  const owners = preserve.card ? [] : await resolveVisibleCardOwnerIds(requesterId, accountId, true);
  const [card] = await db.select({ id: cards.id, userId: cards.userId, accountId: cards.accountId,
    closingDay: cards.closingDay, dueDay: cards.dueDay, active: cards.active, type: cards.type })
    .from(cards).where(and(
      eq(cards.id, input.cardId), preserve.card ? undefined : inArray(cards.userId, owners),
      preserve.card ? undefined : accountCondition(cards.accountId, cards.userId, accountId),
    ));
  if (!card || (!preserve.card && card.active === false) || (card.type && card.type !== 'ambos' && card.type !== input.paymentMethod)) {
    throw new RequestInputError('Cartão indisponível para este lançamento');
  }
  return card;
}

type AuthorizedCard = NonNullable<Awaited<ReturnType<typeof validateFields>>>;

function requireUnchangedCard(locked: AuthorizedCard[], authorized: AuthorizedCard | null, allowInactive = false) {
  if (!authorized) return;
  const current = locked.find(card => card.id === authorized.id);
  if (!current || (!allowInactive && current.active === false) || current.userId !== authorized.userId || current.accountId !== authorized.accountId
    || current.type !== authorized.type || current.closingDay !== authorized.closingDay || current.dueDay !== authorized.dueDay) {
    throw new RequestInputError('O cartão mudou. Atualize a tela antes de salvar.', 409);
  }
}

async function lockCategories(transaction: Transaction, ids: number[], preservedIds: number[] = []) {
  const locked = await transaction.select({ id: categories.id, active: categories.ativo }).from(categories)
    .where(inArray(categories.id, [...new Set(ids)])).orderBy(asc(categories.id)).for('update');
  if (locked.length !== new Set(ids).size || locked.some(category => category.active === false && !preservedIds.includes(category.id))) {
    throw new RequestInputError('Categoria indisponível para esta conta');
  }
}

function sourceScope(source: FixedExpense) {
  return and(eq(fixedExpenses.id, source.id), eq(fixedExpenses.accountId, source.accountId), eq(fixedExpenses.userId, source.userId));
}

function occurrenceScope(source: FixedExpense) {
  return and(eq(expenses.fixedExpenseId, source.id), eq(expenses.userId, source.userId), accountCondition(expenses.accountId, expenses.userId, source.accountId));
}

function scheduledRows(source: FixedExpense, endMonth: string, card: InvoiceCardDays | null): NewExpense[] {
  return fixedExpenseRangeDates(source, endMonth, card).map(item => {
    const { mes, ano } = getMonthYearFromIsoDate(item.dueDate);
    return {
      userId: source.userId, accountId: source.accountId, categoryId: source.categoryId,
      description: source.description, paymentMethod: source.paymentMethod, cardId: source.cardId,
      purchaseDate: item.purchaseDate, dueDate: item.dueDate, month: mes, year: ano,
      originalAmount: source.amount, estimatedAmount: source.amount,
      fixedExpenseId: source.id, fixedCompetence: item.competence,
      status: 'prevista', paid: false, recurring: false, installment: false, deferred: false,
    };
  });
}

async function extendRange(transaction: Transaction, source: FixedExpense, endMonth: string, card: InvoiceCardDays | null, fromDate?: string) {
  const rows = scheduledRows(source, endMonth, card).filter(row => !fromDate || row.dueDate >= fromDate);
  // Inclui canceladas: competências retiradas continuam ocupadas.
  if (rows.length) await transaction.insert(expenses).values(rows).onConflictDoNothing();
}

export async function listPendingFixedExpenses(requesterId: number, requestedAccountId: number | null, month: string, today = getTodayIsoInTimezone()) {
  const accountId = await accountFor(requesterId, requestedAccountId);
  const start = `${month}-01`;
  const end = addMonthsClamped(start, 1);
  const parent = alias(categories, 'fixed_category_parent');
  const rows = await db.select({
    id: expenses.id, userId: expenses.userId, accountId: expenses.accountId, description: expenses.description,
    amount: expenses.originalAmount, estimatedAmount: expenses.estimatedAmount,
    categoryId: expenses.categoryId, categoryName: categories.name, parentCategoryName: parent.name,
    paymentMethod: expenses.paymentMethod, cardId: expenses.cardId, cardName: cards.name,
    purchaseDate: expenses.purchaseDate, dueDate: expenses.dueDate, month: expenses.month, year: expenses.year,
    status: expenses.status, fixedExpenseId: expenses.fixedExpenseId, fixedCompetence: expenses.fixedCompetence,
    deferred: expenses.deferred, sourceEndMonth: fixedExpenses.endMonth, registeredYear: fixedExpenses.registeredYear,
    sourceDueDate: fixedExpenses.dueDate,
    createdAt: expenses.createdAt, attachments: expenses.attachments, invoiceNumber: expenses.numeroNf, invoiceDate: expenses.dataEmissaoNf,
  }).from(expenses)
    .innerJoin(fixedExpenses, and(eq(fixedExpenses.id, expenses.fixedExpenseId), eq(fixedExpenses.userId, expenses.userId)))
    .leftJoin(categories, eq(categories.id, expenses.categoryId)).leftJoin(parent, eq(parent.id, categories.parentId))
    .leftJoin(cards, eq(cards.id, expenses.cardId))
    .where(and(eq(expenses.accountId, accountId), eq(fixedExpenses.accountId, accountId), eq(expenses.userId, requesterId),
      gte(expenses.dueDate, start), lt(expenses.dueDate, end), lte(expenses.purchaseDate, today), eq(expenses.status, 'prevista')))
    .orderBy(asc(expenses.dueDate), asc(expenses.id));
  return rows.map(({ sourceEndMonth, registeredYear, sourceDueDate, ...row }) => ({
    ...row, amount: Number(row.amount), estimatedAmount: row.estimatedAmount === null ? null : Number(row.estimatedAmount),
    endMonth: sourceEndMonth?.slice(0, 7) ?? [`${registeredYear}-12`, sourceDueDate.slice(0, 7)].sort().at(-1)!,
  }));
}

export async function deferFixedExpenses(requesterId: number, requestedAccountId: number | null, ids: number[], deferred: boolean) {
  const accountId = await accountFor(requesterId, requestedAccountId);
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length || uniqueIds.length > 500) throw new RequestInputError('Selecione de 1 a 500 previsões');
  return db.transaction(async transaction => {
    // Mesma ordem do editor: fontes antes das ocorrências. A leitura inicial
    // só descobre os vínculos; tudo é revalidado depois dos locks.
    const identities = await transaction.select({ id: expenses.id, status: expenses.status, fixedExpenseId: expenses.fixedExpenseId })
      .from(expenses).where(and(inArray(expenses.id, uniqueIds), eq(expenses.userId, requesterId), eq(expenses.accountId, accountId)))
      .orderBy(asc(expenses.id));
    if (identities.length !== uniqueIds.length) throw new RequestInputError('Previsão não encontrada', 404);
    if (identities.some(row => row.status !== 'prevista' || row.fixedExpenseId === null)) {
      throw new RequestInputError('Uma previsão já foi lançada ou retirada. Atualize a lista.', 409);
    }
    const sourceIds = [...new Set(identities.map(row => row.fixedExpenseId!))];
    const sources = await transaction.select({ id: fixedExpenses.id }).from(fixedExpenses).where(and(
      inArray(fixedExpenses.id, sourceIds), eq(fixedExpenses.userId, requesterId), eq(fixedExpenses.accountId, accountId),
    )).orderBy(asc(fixedExpenses.id)).for('update');
    if (sources.length !== sourceIds.length) throw new RequestInputError('Previsão não encontrada', 404);
    const rows = await transaction.select({ id: expenses.id, status: expenses.status, fixedExpenseId: expenses.fixedExpenseId })
      .from(expenses).where(and(inArray(expenses.id, uniqueIds), eq(expenses.userId, requesterId), eq(expenses.accountId, accountId)))
      .orderBy(asc(expenses.id)).for('update');
    const sourceByExpense = new Map(identities.map(row => [row.id, row.fixedExpenseId]));
    if (rows.length !== uniqueIds.length || rows.some(row => row.status !== 'prevista' || row.fixedExpenseId !== sourceByExpense.get(row.id))) {
      throw new RequestInputError('Uma previsão mudou. Atualize a lista antes de adiar.', 409);
    }
    await transaction.update(expenses).set({ deferred }).where(and(inArray(expenses.id, uniqueIds),
      eq(expenses.userId, requesterId), eq(expenses.accountId, accountId), eq(expenses.status, 'prevista')));
    return { ids: uniqueIds, deferred };
  });
}

export async function createFixedExpense(requesterId: number, input: FixedExpenseInput, today = getTodayIsoInTimezone()) {
  if (input.endMonth < input.dueDate.slice(0, 7)) throw new RequestInputError('O mês final não pode ser anterior ao primeiro vencimento');
  if (input.paymentMethod === 'credito' && input.paid) throw new RequestInputError('Despesa no crédito é paga pela fatura do cartão');
  const accountId = await accountFor(requesterId, input.accountId);
  const card = await validateFields(requesterId, accountId, input);
  const ownerId = input.sourceExpenseId === null ? requesterId : await resolveOwnerForWrite('despesas', input.sourceExpenseId, requesterId);
  if (ownerId === null) throw new RequestInputError('Despesa não encontrada', 404);
  const [sourceIdentity] = input.sourceExpenseId === null ? [] : await db.select({ cardId: expenses.cardId }).from(expenses).where(and(
    eq(expenses.id, input.sourceExpenseId), eq(expenses.userId, ownerId), accountCondition(expenses.accountId, expenses.userId, accountId),
  ));
  return db.transaction(async transaction => {
    const cardIds = [...new Set([input.cardId, sourceIdentity?.cardId ?? null].filter((id): id is number => id !== null))].sort((a, b) => a - b);
    if (cardIds.length) {
      const lockedCards = await transaction.select().from(cards)
        .where(inArray(cards.id, cardIds)).orderBy(asc(cards.id)).for('update');
      requireUnchangedCard(lockedCards, card);
    }
    await lockCategories(transaction, [input.categoryId]);
    let original: Expense | undefined;
    if (input.sourceExpenseId !== null) {
      [original] = await transaction.select().from(expenses).where(and(
        eq(expenses.id, input.sourceExpenseId), eq(expenses.userId, ownerId), accountCondition(expenses.accountId, expenses.userId, accountId),
      )).for('update');
      if (!original) throw new RequestInputError('Despesa não encontrada', 404);
      if (original.cardId !== sourceIdentity?.cardId) throw new RequestInputError('A despesa mudou. Atualize a tela antes de criar a fixa.', 409);
      const refusal = fixedConversionRefusal(original);
      if (refusal) throw new RequestInputError(refusal, 409);
      const paymentRefusal = invoiceEditRefusal(invoiceEditLockOf(original), {
        amount: Number(original.originalAmount), dueDate: original.dueDate, paymentMethod: original.paymentMethod, cardId: original.cardId,
        paid: original.paid === true, paymentDate: original.paymentDate, amountPaid: original.amountPaid === null ? null : Number(original.amountPaid),
      }, input) ?? paidCreditRefusal({ paid: original.paid === true, paymentMethod: original.paymentMethod, cardId: original.cardId }, input);
      if (paymentRefusal) throw new RequestInputError(paymentRefusal);
    }
    const dueDate = input.dueDate;
    if (input.endMonth < dueDate.slice(0, 7)) throw new RequestInputError('O mês final não pode ser anterior ao primeiro vencimento');
    const [source] = await transaction.insert(fixedExpenses).values({
      userId: ownerId, accountId, categoryId: input.categoryId,
      description: input.description, amount: input.amount.toFixed(2), paymentMethod: input.paymentMethod,
      cardId: input.cardId, purchaseDate: input.purchaseDate,
      dueDate, firstMonth: `${dueDate.slice(0, 7)}-01`, endMonth: `${input.endMonth}-01`,
      registeredYear: Number(input.endMonth.slice(0, 4)), active: true,
    }).returning();
    if (!source) throw new Error('Fixed expense insert returned no source');
    const { mes, ano } = getMonthYearFromIsoDate(dueDate);
    if (original) {
      await transaction.update(expenses).set({
        accountId, description: input.description, categoryId: input.categoryId,
        originalAmount: input.amount.toFixed(2), paymentMethod: input.paymentMethod, cardId: input.cardId,
        purchaseDate: input.purchaseDate, dueDate, month: mes, year: ano,
        ...resolveEditedPayment(input, today), attachments: input.attachments, numeroNf: input.invoiceNumber, dataEmissaoNf: input.invoiceDate,
        fixedExpenseId: source.id, fixedCompetence: source.firstMonth, estimatedAmount: input.amount.toFixed(2),
      }).where(and(eq(expenses.id, original.id), eq(expenses.userId, ownerId)));
    } else {
      const first = scheduledRows(source, input.endMonth, card)[0];
      if (!first) throw new RequestInputError('Confira o mês final da despesa fixa');
      await transaction.insert(expenses).values({
        ...first, status: 'ativa', ...resolveEditedPayment(input, today),
        attachments: input.attachments, numeroNf: input.invoiceNumber, dataEmissaoNf: input.invoiceDate,
      });
    }
    await extendRange(transaction, source, input.endMonth, card);
    return fixedExpenseDto(source);
  });
}

export async function fixedOccurrenceIdentity(requesterId: number, id: number) {
  const ownerId = await resolveOwnerForWrite('despesas', id, requesterId);
  if (ownerId === null) throw new RequestInputError('Despesa não encontrada', 404);
  const [row] = await db.select({ accountId: expenses.accountId, fixedExpenseId: expenses.fixedExpenseId, cardId: expenses.cardId,
    categoryId: expenses.categoryId, paymentMethod: expenses.paymentMethod, status: expenses.status })
    .from(expenses).where(and(eq(expenses.id, id), eq(expenses.userId, ownerId)));
  if (!row) throw new RequestInputError('Despesa não encontrada', 404);
  const accountId = await accountFor(requesterId, row.accountId);
  return { ...row, ownerId, accountId };
}

async function updateRange(transaction: Transaction, source: FixedExpense, endMonth: string, card: InvoiceCardDays | null, today: string) {
  if (endMonth < source.dueDate.slice(0, 7)) throw new RequestInputError('O mês final não pode ser anterior ao primeiro vencimento');
  if (endMonth === fixedEndMonth(source)) return;
  if (endMonth > fixedEndMonth(source)) {
    if (!source.active) throw new RequestInputError('Esta despesa fixa está desativada', 409);
    await extendRange(transaction, source, endMonth, card, today);
  } else {
    await transaction.update(expenses).set({ status: 'cancelada' }).where(and(
      occurrenceScope(source), eq(expenses.status, 'prevista'), gte(expenses.dueDate, today),
      gte(expenses.dueDate, addMonthsClamped(`${endMonth}-01`, 1)),
    ));
  }
  await transaction.update(fixedExpenses).set({ endMonth: `${endMonth}-01`, updatedAt: new Date() }).where(sourceScope(source));
}

/** Edição preserva o estado; somente confirmação explícita transforma previsão em lançamento. */
export async function writeFixedOccurrence(requesterId: number, id: number, input: UpdateExpenseInput, confirm: boolean, today: string) {
  const identity = await fixedOccurrenceIdentity(requesterId, id);
  if (identity.fixedExpenseId === null) throw new RequestInputError('Esta despesa não é fixa', 409);
  if (input.installmentCount !== null || input.cashPrice !== null || input.applyTo !== 'this') {
    throw new RequestInputError('A despesa fixa é alterada somente neste mês');
  }
  const [source] = await db.select().from(fixedExpenses).where(and(
    eq(fixedExpenses.id, identity.fixedExpenseId), eq(fixedExpenses.userId, identity.ownerId), eq(fixedExpenses.accountId, identity.accountId),
  ));
  if (!source) throw new RequestInputError('Vínculo da despesa fixa inválido', 409);
  const historical = !confirm && identity.status === 'ativa';
  const preserveCategory = historical && input.categoryId === identity.categoryId;
  const preserveCard = historical && input.cardId === identity.cardId && input.paymentMethod === identity.paymentMethod;
  const inputCard = await validateFields(requesterId, identity.accountId, input, { category: preserveCategory, card: preserveCard });
  const widening = input.endMonth != null && input.endMonth > fixedEndMonth(source);
  const sourceCard = widening
    ? await validateFields(requesterId, source.accountId, source as FixedExpense & { paymentMethod: PaymentMethod })
    : null;
  return db.transaction(async transaction => {
    const cardIds = [...new Set([identity.cardId, input.cardId, widening ? source.cardId : null].filter((value): value is number => value !== null))].sort((a, b) => a - b);
    if (cardIds.length) {
      const lockedCards = await transaction.select().from(cards)
        .where(inArray(cards.id, cardIds)).orderBy(asc(cards.id)).for('update');
      requireUnchangedCard(lockedCards, inputCard, preserveCard);
      requireUnchangedCard(lockedCards, sourceCard);
    }
    const [lockedSource] = await transaction.select().from(fixedExpenses).where(sourceScope(source)).for('update');
    if (!lockedSource) throw new RequestInputError('Vínculo da despesa fixa inválido', 409);
    if (input.endMonth != null && fixedEndMonth(lockedSource) !== fixedEndMonth(source)) {
      throw new RequestInputError('O limite da fixa mudou. Atualize a tela antes de salvar.', 409);
    }
    if (widening && (lockedSource.cardId !== source.cardId || lockedSource.paymentMethod !== source.paymentMethod
      || lockedSource.purchaseDate !== source.purchaseDate || lockedSource.dueDate !== source.dueDate
      || lockedSource.categoryId !== source.categoryId || lockedSource.amount !== source.amount)) {
      throw new RequestInputError('A configuração da fixa mudou. Atualize a tela antes de salvar.', 409);
    }
    await lockCategories(transaction, widening ? [input.categoryId, source.categoryId] : [input.categoryId],
      preserveCategory && (!widening || input.categoryId !== source.categoryId) ? [input.categoryId] : []);
    const [current] = await transaction.select().from(expenses).where(and(
      eq(expenses.id, id), eq(expenses.userId, identity.ownerId), accountCondition(expenses.accountId, expenses.userId, identity.accountId),
    )).for('update');
    if (!current || current.fixedExpenseId !== source.id || current.fixedCompetence === null || current.status === 'cancelada') {
      throw new RequestInputError('Despesa não encontrada', 404);
    }
    if ((!confirm && current.status !== identity.status)
      || (preserveCategory && current.categoryId !== input.categoryId)
      || (preserveCard && (current.cardId !== input.cardId || current.paymentMethod !== input.paymentMethod))) {
      throw new RequestInputError('A despesa mudou. Atualize a tela antes de salvar.', 409);
    }
    if (confirm && (current.status !== 'prevista' || current.deferred)) {
      throw new RequestInputError(current.deferred ? 'Esta previsão está adiada. Desmarque Adiar antes de lançar.' : 'Esta previsão já foi confirmada ou retirada. Atualize a lista.', 409);
    }
    if (!confirm && current.status === 'prevista' && (input.paid || input.paymentDate !== null || input.amountPaid !== null)) {
      throw new RequestInputError('Confirme a previsão antes de registrar o pagamento');
    }
    if (current.status === 'prevista' && input.paymentMethod === 'credito' && input.paid) {
      throw new RequestInputError('Despesa no crédito é paga pela fatura do cartão');
    }
    if (current.status === 'ativa') {
      const refusal = invoiceEditRefusal(invoiceEditLockOf(current), {
        amount: Number(current.originalAmount), dueDate: current.dueDate, paymentMethod: current.paymentMethod, cardId: current.cardId,
        paid: current.paid === true, paymentDate: current.paymentDate, amountPaid: current.amountPaid === null ? null : Number(current.amountPaid),
      }, input) ?? paidCreditRefusal({ paid: current.paid === true, paymentMethod: current.paymentMethod, cardId: current.cardId }, input);
      if (refusal) throw new RequestInputError(refusal);
    }
    const { mes, ano } = getMonthYearFromIsoDate(input.dueDate);
    const [updated] = await transaction.update(expenses).set({
      description: input.description, categoryId: input.categoryId, paymentMethod: input.paymentMethod, cardId: input.cardId,
      purchaseDate: input.purchaseDate, dueDate: input.dueDate, month: mes, year: ano,
      originalAmount: input.amount.toFixed(2), attachments: input.attachments, numeroNf: input.invoiceNumber, dataEmissaoNf: input.invoiceDate,
      ...(confirm || current.status === 'ativa' ? resolveEditedPayment(input, today) : { paid: false, paymentDate: null, amountPaid: null }),
      status: confirm ? 'ativa' : current.status, ...(confirm ? { deferred: false } : {}),
    }).where(and(eq(expenses.id, id), eq(expenses.userId, identity.ownerId))).returning();
    if (input.endMonth != null) {
      // A fonte permanece travada antes da ocorrência; intervalo e edição são uma operação só.
      if (input.endMonth > fixedEndMonth(lockedSource) && !widening) throw new RequestInputError('O limite da fixa mudou. Atualize a tela antes de salvar.', 409);
      await updateRange(transaction, lockedSource, input.endMonth, sourceCard, today);
      const [final] = await transaction.select().from(expenses).where(and(eq(expenses.id, id), eq(expenses.userId, identity.ownerId)));
      return final!;
    }
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
