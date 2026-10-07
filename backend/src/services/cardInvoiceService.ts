// Pagamento da fatura do cartão: listar as faturas do mês por cartão, pagar
// (total, parcial ou parcelado) e desfazer. Pagar e desfazer correm em
// transação, com o cartão e as compras travados (FOR UPDATE): dois pagamentos
// ao mesmo tempo na mesma fatura correm um depois do outro, e o segundo só vê o
// que ficou em aberto.
//
// A fatura é do dono do cartão e inclui as compras que outras pessoas lançaram
// no cartão dele (o mesmo critério da mudança de vencimento em routes/cards.ts).
// Pode pagar quem é dono do cartão ou quem tem a permissão de editar
// lançamentos de outros na conta do cartão. pagamentos_fatura é lida sempre
// pelo cartão autorizado; as linhas geradas, pelo pagamento autorizado.
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import {
  INVOICE_PAYMENT_METHODS,
  accounts,
  cards,
  categories,
  expenses,
  invoicePayments,
  type Card,
  type InvoicePayment,
  type NewExpense,
} from '../db/schema';
import { getMonthYearFromIsoDate } from '../utils/date';
import { RequestInputError } from '../utils/requestInput';
import { canEditOthersEntries, resolveVisibleCardOwnerIds } from '../utils/familyVisibility';
import type { InvoicePaymentInput, InvoicePaymentInputMethod } from './cardInvoiceInput';
import {
  INVOICE_EXPENSE_METHOD,
  computeInvoicePayment,
  invoiceDueDate,
  invoiceMonthEnd,
  invoicePaymentRefusal,
  undoRefusal,
  type GeneratedRowKind,
  type InvoiceItem,
  type PlannedGeneratedRow,
} from './cardInvoiceRules';
import { ACTIVE_STATUS, accountFilter, findPeopleNames, toNumber } from './entryQueries';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = Pick<typeof db, 'select'>;

const CARD_NOT_FOUND = 'Cartão não encontrado';
const PAYMENT_NOT_FOUND = 'Pagamento não encontrado';

/** Categorias criadas na primeira vez que o pagamento da fatura precisa delas. */
const INVOICE_CATEGORIES = {
  renegotiation: { name: 'Renegociação de fatura', color: '#f97316' },
  charges: { name: 'Encargos de cartão', color: '#ef4444' },
} as const;

/** Cartão sem tipo (cadastro antigo), crédito ou "ambos" tem fatura; o de débito, não. */
function hasInvoice(cardType: string | null): boolean {
  return cardType === null || cardType === 'credito' || cardType === 'ambos';
}

const methodByColumn: Record<string, InvoicePaymentInputMethod> = {
  [INVOICE_PAYMENT_METHODS.total]: 'total',
  [INVOICE_PAYMENT_METHODS.partial]: 'partial',
  [INVOICE_PAYMENT_METHODS.installments]: 'installments',
};

function toDecimal(value: number): string {
  return value.toFixed(2);
}

/** Pode pagar a fatura: o dono do cartão, ou quem edita lançamentos de outros na conta do cartão. */
async function canPayCard(requesterId: number, card: Pick<Card, 'userId' | 'accountId'>): Promise<boolean> {
  if (card.userId === requesterId) return true;
  if (card.accountId === null) return false;
  return canEditOthersEntries(requesterId, card.accountId);
}

/**
 * As compras em aberto da fatura: no crédito, do cartão, ativas, não pagas
 * (pago falso ou em branco, como na mudança de vencimento em routes/cards.ts) e
 * vencendo no mês, de qualquer autor.
 */
function openInvoiceItemsCondition(cardIds: number[], invoiceMonthStart: string): SQL | undefined {
  return and(
    inArray(expenses.cardId, cardIds),
    eq(expenses.paymentMethod, INVOICE_EXPENSE_METHOD),
    eq(expenses.status, ACTIVE_STATUS),
    or(eq(expenses.paid, false), isNull(expenses.paid)),
    gte(expenses.dueDate, invoiceMonthStart),
    lte(expenses.dueDate, invoiceMonthEnd(invoiceMonthStart)),
  );
}

export interface InvoiceItemView {
  expenseId: number;
  description: string;
  amount: number;
  dueDate: string;
  authorName: string | null;
  installment: string | null;
}

export interface InvoicePaymentView {
  id: number;
  method: InvoicePaymentInputMethod;
  paymentDate: string;
  purchasesAmount: number;
  paidAmount: number;
  chargesAmount: number;
  interestAmount: number;
  carriedInterest: number;
  carriedForward: number;
  installmentCount: number | null;
  installmentAmount: number | null;
  /** Parcial e parcelado: quando vence a primeira linha que foi para a frente. */
  firstDueDate: string | null;
  createdAt: string;
  registeredByName: string | null;
  reversedAt: string | null;
  reversedByName: string | null;
  canUndo: boolean;
  undoBlockedReason: string | null;
}

export interface CardInvoiceView {
  card: { id: number; name: string; dueDay: number; ownerName: string | null };
  /** Vencimento da fatura: o dia do cartão no mês. */
  dueDate: string;
  openTotal: number;
  openItems: InvoiceItemView[];
  payments: InvoicePaymentView[];
}

/** Faturas do mês dos cartões informados, com as compras em aberto e os pagamentos. */
async function buildInvoices(
  reader: Reader,
  requesterId: number,
  cardRows: Card[],
  invoiceMonthStart: string,
): Promise<CardInvoiceView[]> {
  if (cardRows.length === 0) return [];
  const cardIds = cardRows.map((card) => card.id);
  const { mes, ano } = getMonthYearFromIsoDate(invoiceMonthStart);

  const [itemRows, paymentRows] = await Promise.all([
    reader.select({
      cardId: expenses.cardId,
      expenseId: expenses.id,
      description: expenses.description,
      amount: expenses.originalAmount,
      dueDate: expenses.dueDate,
      authorId: expenses.userId,
      currentInstallment: expenses.currentInstallment,
      numberOfInstallments: expenses.numberOfInstallments,
    })
      .from(expenses)
      .where(openInvoiceItemsCondition(cardIds, invoiceMonthStart))
      .orderBy(asc(expenses.dueDate), asc(expenses.id)),
    reader.select()
      .from(invoicePayments)
      .where(and(inArray(invoicePayments.cardId, cardIds), eq(invoicePayments.year, ano), eq(invoicePayments.month, mes)))
      .orderBy(sql`${invoicePayments.reversedAt} IS NULL DESC`, desc(invoicePayments.createdAt), desc(invoicePayments.id)),
  ]);

  // Escopo: só as linhas geradas pelos pagamentos dos cartões autorizados acima.
  const paymentIds = paymentRows.map((payment) => payment.id);
  const generatedRows = paymentIds.length > 0
    ? await reader.select({
      originId: expenses.invoiceOriginPaymentId,
      paid: expenses.paid,
      invoicePaymentId: expenses.invoicePaymentId,
    }).from(expenses).where(inArray(expenses.invoiceOriginPaymentId, paymentIds))
    : [];

  const peopleIds = new Set<number>(cardRows.map((card) => card.userId));
  for (const item of itemRows) peopleIds.add(item.authorId);
  for (const payment of paymentRows) {
    if (payment.registeredBy !== null) peopleIds.add(payment.registeredBy);
    if (payment.reversedBy !== null) peopleIds.add(payment.reversedBy);
  }
  const names = await findPeopleNames([...peopleIds]);

  const toPaymentView = (payment: InvoicePayment, card: Card): InvoicePaymentView => {
    const method = methodByColumn[payment.method] ?? 'total';
    const reason = payment.reversedAt === null
      ? undoRefusal(payment.id, generatedRows
        .filter((row) => row.originId === payment.id)
        .map((row) => ({ paid: row.paid === true, invoicePaymentId: row.invoicePaymentId })))
      : null;
    return {
      id: payment.id,
      method,
      paymentDate: payment.paymentDate,
      purchasesAmount: toNumber(payment.purchasesAmount),
      paidAmount: toNumber(payment.paidAmount),
      chargesAmount: toNumber(payment.chargesAmount),
      interestAmount: toNumber(payment.interestAmount),
      carriedInterest: toNumber(payment.carriedInterest),
      carriedForward: toNumber(payment.carriedForward),
      installmentCount: payment.installmentCount,
      installmentAmount: payment.installmentAmount === null ? null : toNumber(payment.installmentAmount),
      firstDueDate: method === 'total' ? null : invoiceDueDate(invoiceMonthStart, card.dueDay, 1),
      createdAt: payment.createdAt,
      registeredByName: payment.registeredBy === null ? null : names.get(payment.registeredBy) ?? null,
      reversedAt: payment.reversedAt,
      reversedByName: payment.reversedBy === null ? null : names.get(payment.reversedBy) ?? null,
      canUndo: payment.reversedAt === null && reason === null,
      undoBlockedReason: reason,
    };
  };

  return cardRows
    .map((card): CardInvoiceView => {
      const items = itemRows.filter((item) => item.cardId === card.id);
      return {
        card: {
          id: card.id,
          name: card.name,
          dueDay: card.dueDay,
          ownerName: card.userId === requesterId ? null : names.get(card.userId) ?? null,
        },
        dueDate: invoiceDueDate(invoiceMonthStart, card.dueDay, 0),
        openTotal: items.reduce((sum, item) => sum + Math.round(toNumber(item.amount) * 100), 0) / 100,
        openItems: items.map((item) => ({
          expenseId: item.expenseId,
          description: item.description,
          amount: toNumber(item.amount),
          dueDate: item.dueDate,
          authorName: names.get(item.authorId) ?? null,
          installment: item.currentInstallment && item.numberOfInstallments
            ? `${item.currentInstallment}/${item.numberOfInstallments}`
            : null,
        })),
        payments: paymentRows.filter((payment) => payment.cardId === card.id).map((payment) => toPaymentView(payment, card)),
      };
    })
    // Cartão desativado só aparece quando ainda tem algo na fatura do mês.
    .filter((invoice) => {
      const card = cardRows.find((row) => row.id === invoice.card.id);
      return card?.active !== false || invoice.openItems.length > 0 || invoice.payments.length > 0;
    });
}

/** Faturas do mês dos cartões de crédito da conta que a pessoa pode pagar. */
export async function listCardInvoices(
  requesterId: number,
  accountId: number | null,
  invoiceMonthStart: string,
): Promise<CardInvoiceView[]> {
  const owners = await resolveVisibleCardOwnerIds(requesterId, accountId, true);
  const cardRows = await db.select().from(cards).where(and(
    inArray(cards.userId, owners),
    accountFilter(cards.accountId, cards.userId, accountId),
  )).orderBy(asc(cards.name), asc(cards.id));

  const payable: Card[] = [];
  for (const card of cardRows) {
    if (hasInvoice(card.type) && await canPayCard(requesterId, card)) payable.push(card);
  }
  return buildInvoices(db, requesterId, payable, invoiceMonthStart);
}

/** A fatura de um cartão no mês, para devolver depois de pagar ou desfazer; null sem permissão. */
export async function getCardInvoice(
  requesterId: number,
  cardId: number,
  invoiceMonthStart: string,
): Promise<CardInvoiceView | null> {
  const [card] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!card || !hasInvoice(card.type) || !(await canPayCard(requesterId, card))) return null;
  const [invoice] = await buildInvoices(db, requesterId, [card], invoiceMonthStart);
  return invoice ?? null;
}

/**
 * Categoria automática no catálogo do dono do cartão, no tipo da conta do
 * cartão. SQL cru pelo ON CONFLICT no índice único funcional (usuario_id,
 * LOWER(nome), tipo), que o Drizzle não expressa — o mesmo de
 * ensureDefaultCategories.
 */
async function findOrCreateInvoiceCategory(
  transaction: Transaction,
  ownerId: number,
  accountType: string,
  category: { name: string; color: string },
): Promise<number> {
  await transaction.execute(sql`
    INSERT INTO categorias (usuario_id, nome, cor, icone, parent_id, tipo)
    VALUES (${ownerId}, ${category.name}, ${category.color}, NULL, NULL, ${accountType})
    ON CONFLICT (usuario_id, LOWER(nome), tipo) WHERE conta_id IS NULL DO NOTHING
  `);
  const [row] = await transaction.select({ id: categories.id }).from(categories).where(and(
    eq(categories.userId, ownerId),
    eq(categories.type, accountType),
    isNull(categories.accountId),
    sql`LOWER(${categories.name}) = LOWER(${category.name})`,
  )).limit(1);
  if (!row) {
    throw new Error(`Categoria automática não encontrada depois de criada: ${category.name}`);
  }
  return row.id;
}

async function cardAccountType(transaction: Transaction, card: Card): Promise<string> {
  if (card.accountId === null) return 'pessoal';
  const [account] = await transaction.select({ type: accounts.type }).from(accounts).where(eq(accounts.id, card.accountId)).limit(1);
  return account?.type ?? 'pessoal';
}

function generatedRow(
  card: Card,
  row: PlannedGeneratedRow,
  categoryId: number,
  paymentId: number,
  paymentDate: string,
): NewExpense {
  const { mes, ano } = getMonthYearFromIsoDate(row.dueDate);
  return {
    userId: card.userId,
    accountId: card.accountId,
    categoryId,
    cardId: card.id,
    description: row.description,
    paymentMethod: INVOICE_EXPENSE_METHOD,
    dueDate: row.dueDate,
    month: mes,
    year: ano,
    purchaseDate: paymentDate,
    paid: row.paid,
    paymentDate: row.paid ? paymentDate : null,
    amountPaid: row.paid ? toDecimal(row.amount) : null,
    originalAmount: toDecimal(row.amount),
    installment: row.installmentNumber !== null,
    numberOfInstallments: row.installmentCount,
    currentInstallment: row.installmentNumber,
    recurring: false,
    status: ACTIVE_STATUS,
    invoicePaymentId: row.paid ? paymentId : null,
    invoiceOriginPaymentId: paymentId,
    invoiceInterest: toDecimal(row.interestAmount),
  };
}

/** Grava as linhas geradas. As parcelas formam um grupo: a 1ª aponta para si mesma, como em createExpense. */
async function insertGeneratedRows(transaction: Transaction, rows: NewExpense[]): Promise<void> {
  const installments = rows.filter((row) => row.installment === true);
  const others = rows.filter((row) => row.installment !== true);
  if (others.length > 0) {
    await transaction.insert(expenses).values(others);
  }
  const [firstRow, ...otherInstallments] = installments;
  if (!firstRow) return;
  const [first] = await transaction.insert(expenses).values(firstRow).returning({ id: expenses.id });
  await transaction.update(expenses).set({ installmentGroupId: first!.id }).where(eq(expenses.id, first!.id));
  if (otherInstallments.length > 0) {
    await transaction.insert(expenses).values(otherInstallments.map((row) => ({ ...row, installmentGroupId: first!.id })));
  }
}

/** Paga a fatura do cartão no mês. Devolve o id do pagamento. */
export async function payCardInvoice(requesterId: number, input: InvoicePaymentInput): Promise<number> {
  return db.transaction(async (transaction) => {
    const [card] = await transaction.select().from(cards).where(eq(cards.id, input.cardId)).limit(1).for('update');
    if (!card || !hasInvoice(card.type) || !(await canPayCard(requesterId, card))) {
      throw new RequestInputError(CARD_NOT_FOUND, 404);
    }

    const itemRows = await transaction
      .select({ expenseId: expenses.id, amount: expenses.originalAmount, invoiceInterest: expenses.invoiceInterest })
      .from(expenses)
      .where(openInvoiceItemsCondition([card.id], input.invoiceMonthStart))
      .orderBy(asc(expenses.dueDate), asc(expenses.id))
      .for('update');
    const items: InvoiceItem[] = itemRows.map((row) => ({
      expenseId: row.expenseId,
      amount: toNumber(row.amount),
      invoiceInterest: row.invoiceInterest === null ? null : toNumber(row.invoiceInterest),
    }));

    const refusal = invoicePaymentRefusal(items, input);
    if (refusal) {
      throw new RequestInputError(refusal.message, refusal.status);
    }
    const plan = computeInvoicePayment(items, input, input.invoiceMonthStart, { name: card.name, dueDay: card.dueDay });
    const { mes, ano } = getMonthYearFromIsoDate(input.invoiceMonthStart);

    const [payment] = await transaction.insert(invoicePayments).values({
      cardId: card.id,
      userId: card.userId,
      registeredBy: requesterId,
      month: mes,
      year: ano,
      method: INVOICE_PAYMENT_METHODS[input.method],
      purchasesAmount: toDecimal(plan.purchasesAmount),
      paidAmount: toDecimal(plan.paidAmount),
      chargesAmount: toDecimal(plan.chargesAmount),
      interestAmount: toDecimal(plan.interestAmount),
      carriedInterest: toDecimal(plan.carriedInterest),
      carriedForward: toDecimal(plan.carriedForward),
      installmentCount: plan.installmentCount,
      installmentAmount: plan.installmentAmount === null ? null : toDecimal(plan.installmentAmount),
      paymentDate: input.paymentDate,
    }).returning({ id: invoicePayments.id });
    const paymentId = payment!.id;

    // As compras ficam pagas: pelo próprio valor (total), pela parte proporcional (parcial) ou com 0 (parcelado).
    const purchaseIds = plan.purchases.map((purchase) => purchase.expenseId);
    const paidColumns = { paid: true, paymentDate: input.paymentDate, invoicePaymentId: paymentId };
    if (input.method === 'total') {
      await transaction.update(expenses)
        .set({ ...paidColumns, amountPaid: sql`${expenses.originalAmount}` })
        .where(inArray(expenses.id, purchaseIds));
    } else if (input.method === 'installments') {
      await transaction.update(expenses)
        .set({ ...paidColumns, amountPaid: toDecimal(0) })
        .where(inArray(expenses.id, purchaseIds));
    } else {
      for (const purchase of plan.purchases) {
        await transaction.update(expenses)
          .set({ ...paidColumns, amountPaid: toDecimal(purchase.paidAmount) })
          .where(eq(expenses.id, purchase.expenseId));
      }
    }

    if (plan.generated.length > 0) {
      const accountType = await cardAccountType(transaction, card);
      const categoryByKind = new Map<GeneratedRowKind, number>();
      for (const kind of new Set(plan.generated.map((row) => row.kind))) {
        const category = kind === 'charges' ? INVOICE_CATEGORIES.charges : INVOICE_CATEGORIES.renegotiation;
        categoryByKind.set(kind, await findOrCreateInvoiceCategory(transaction, card.userId, accountType, category));
      }
      await insertGeneratedRows(transaction, plan.generated.map((row) => (
        generatedRow(card, row, categoryByKind.get(row.kind)!, paymentId, input.paymentDate)
      )));
    }
    return paymentId;
  });
}

/**
 * Desfaz o pagamento da fatura: recusa se alguma linha gerada já foi paga por
 * outro pagamento; exclui as linhas geradas; devolve as compras para não pagas;
 * deixa o registro como estornado. Devolve o cartão e o mês, para a rota
 * mostrar a fatura atualizada.
 */
export async function undoInvoicePayment(
  requesterId: number,
  paymentId: number,
): Promise<{ cardId: number; invoiceMonthStart: string }> {
  return db.transaction(async (transaction) => {
    const [payment] = await transaction.select().from(invoicePayments)
      .where(eq(invoicePayments.id, paymentId)).limit(1).for('update');
    if (!payment || payment.reversedAt !== null) {
      throw new RequestInputError(PAYMENT_NOT_FOUND, 404);
    }
    const [card] = await transaction.select().from(cards).where(eq(cards.id, payment.cardId)).limit(1).for('update');
    if (!card || !(await canPayCard(requesterId, card))) {
      throw new RequestInputError(PAYMENT_NOT_FOUND, 404);
    }

    const generated = await transaction
      .select({ id: expenses.id, paid: expenses.paid, invoicePaymentId: expenses.invoicePaymentId })
      .from(expenses)
      .where(eq(expenses.invoiceOriginPaymentId, payment.id))
      .for('update');
    const refusal = undoRefusal(payment.id, generated.map((row) => ({ paid: row.paid === true, invoicePaymentId: row.invoicePaymentId })));
    if (refusal) {
      throw new RequestInputError(refusal, 409);
    }

    if (generated.length > 0) {
      await transaction.delete(expenses).where(inArray(expenses.id, generated.map((row) => row.id)));
    }
    await transaction.update(expenses)
      .set({ paid: false, paymentDate: null, amountPaid: null, invoicePaymentId: null })
      .where(eq(expenses.invoicePaymentId, payment.id));
    // now() no fuso da conexão (America/Sao_Paulo), como data_criacao.
    await transaction.update(invoicePayments)
      .set({ reversedAt: sql`now()`, reversedBy: requesterId })
      .where(eq(invoicePayments.id, payment.id));

    const month = String(payment.month + 1).padStart(2, '0');
    return { cardId: payment.cardId, invoiceMonthStart: `${payment.year}-${month}-01` };
  });
}

/** Linhas que as rotas de cancelar e excluir vão atingir: as pedidas, ou o grupo inteiro da parcela âncora. */
export type ExpenseRowsScope = { ids: number[] } | { groupAnchorId: number };

function scopeCondition(scope: ExpenseRowsScope): SQL | undefined {
  if ('ids' in scope) {
    return inArray(expenses.id, scope.ids);
  }
  return or(eq(expenses.id, scope.groupAnchorId), eq(expenses.installmentGroupId, scope.groupAnchorId));
}

/** Alguma das linhas está paga pela fatura ou foi gerada por ela (isInvoiceProtected): cancelar e excluir recusam. */
export async function hasInvoiceProtectedRows(ownerId: number, scope: ExpenseRowsScope): Promise<boolean> {
  const [row] = await db.select({ id: expenses.id }).from(expenses).where(and(
    eq(expenses.userId, ownerId),
    scopeCondition(scope),
    or(isNotNull(expenses.invoicePaymentId), isNotNull(expenses.invoiceOriginPaymentId)),
  )).limit(1);
  return row !== undefined;
}

/** Despesa no crédito com cartão: o "Marcar como pago" simples (POST /pay) recusa. */
export async function isCreditWithCardExpense(ownerId: number, expenseId: number): Promise<boolean> {
  const [row] = await db.select({ id: expenses.id }).from(expenses).where(and(
    eq(expenses.id, expenseId),
    eq(expenses.userId, ownerId),
    eq(expenses.paymentMethod, INVOICE_EXPENSE_METHOD),
    isNotNull(expenses.cardId),
  )).limit(1);
  return row !== undefined;
}
