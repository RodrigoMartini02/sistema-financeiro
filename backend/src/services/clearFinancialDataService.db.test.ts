import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { asc, eq, inArray } from 'drizzle-orm';
import { accounts, cards, categories, expenses, fixedExpenses, incomeClassifications, incomes, invoicePayments, users } from '../db/schema';
import { RequestInputError } from '../utils/requestInput';
import { assertLocalDatabase, databaseTestsSkipReason } from './financeDbTestSupport';

async function loadServices() {
  const [client, clear, fixed] = await Promise.all([
    import('../db/client.js'), import('./clearFinancialDataService.js'), import('./fixedExpenseService.js'),
  ]);
  return { client, clear, fixed };
}
let services: Awaited<ReturnType<typeof loadServices>>;

interface Scenario {
  userId: number;
  accountId: number;
  categoryId: number;
  cardId: number;
  classificationId: number;
}

async function withPeople(work: (owner: Scenario, other: Scenario) => Promise<void>): Promise<void> {
  const { db } = services.client;
  const userIds: number[] = [];
  async function createPerson(): Promise<Scenario> {
    const [user] = await db.insert(users).values({ name: 'Teste limpeza financeira',
      email: `clear-finance-${randomUUID()}@example.test`, password: 'teste',
      financialData: { retained: true }, categories: ['anterior'], cards: ['anterior'],
    }).returning({ id: users.id });
    const userId = user!.id;
    userIds.push(userId);
    const [account] = await db.insert(accounts).values({ userId, name: 'Pessoal', type: 'pessoal', isDefault: true }).returning();
    const [parent] = await db.insert(categories).values({ userId, name: 'Moradia', type: 'pessoal' }).returning();
    const [category] = await db.insert(categories).values({ userId, name: 'Aluguel', type: 'pessoal', parentId: parent!.id }).returning();
    const [card] = await db.insert(cards).values({ userId, accountId: account!.id, name: 'Cartão', type: 'credito',
      limit: '3000.00', closingDay: 2, dueDay: 9, active: true }).returning();
    const [classification] = await db.insert(incomeClassifications).values({ userId, name: 'Salário', type: 'pessoal' }).returning();
    const scenario = { userId, accountId: account!.id, categoryId: category!.id, cardId: card!.id, classificationId: classification!.id };
    await services.fixed.createFixedExpense(userId, { accountId: scenario.accountId, description: 'Aluguel', categoryId: scenario.categoryId,
      paymentMethod: 'credito', cardId: scenario.cardId, amount: 100, purchaseDate: '2026-11-01', dueDate: '2026-11-09',
      firstMonth: '2026-11', sourceExpenseId: null });
    await db.insert(incomes).values({ userId, accountId: scenario.accountId, description: 'Salário', netAmount: '500.00', grossAmount: '500.00',
      receiptDate: '2026-11-01', month: 10, year: 2026, classificationId: scenario.classificationId });
    return scenario;
  }
  try {
    await work(await createPerson(), await createPerson());
  } finally {
    if (userIds.length) {
      await db.delete(expenses).where(inArray(expenses.userId, userIds));
      await db.delete(fixedExpenses).where(inArray(fixedExpenses.userId, userIds));
      await db.delete(incomes).where(inArray(incomes.userId, userIds));
      await db.delete(invoicePayments).where(inArray(invoicePayments.userId, userIds));
      await db.delete(cards).where(inArray(cards.userId, userIds));
      await db.delete(categories).where(inArray(categories.userId, userIds));
      await db.delete(incomeClassifications).where(inArray(incomeClassifications.userId, userIds));
      await db.delete(accounts).where(inArray(accounts.userId, userIds));
      await db.delete(users).where(inArray(users.id, userIds));
    }
  }
}

async function snapshot(userId: number) {
  const { db } = services.client;
  const [expenseRows, sources, incomeRows, categoryRows, cardRows, profile] = await Promise.all([
    db.select().from(expenses).where(eq(expenses.userId, userId)).orderBy(asc(expenses.id)),
    db.select().from(fixedExpenses).where(eq(fixedExpenses.userId, userId)).orderBy(asc(fixedExpenses.id)),
    db.select().from(incomes).where(eq(incomes.userId, userId)).orderBy(asc(incomes.id)),
    db.select().from(categories).where(eq(categories.userId, userId)).orderBy(asc(categories.id)),
    db.select().from(cards).where(eq(cards.userId, userId)).orderBy(asc(cards.id)),
    db.select({ financialData: users.financialData, categories: users.categories, cards: users.cards }).from(users).where(eq(users.id, userId)),
  ]);
  return { expenseRows, sources, incomeRows, categoryRows, cardRows, profile };
}

describe('limpeza financeira com despesas fixas (banco local)', { skip: databaseTestsSkipReason }, () => {
  before(async () => { assertLocalDatabase(); services = await loadServices(); });
  after(async () => { await services.client.pool.end(); });

  test('apaga ocorrências antes das fontes e do catálogo, preservando outro usuário', async () => {
    await withPeople(async (owner, other) => {
      const otherBefore = await snapshot(other.userId);
      await services.clear.clearUserFinancialData(owner.userId);
      assert.deepEqual(await snapshot(owner.userId), { expenseRows: [], sources: [], incomeRows: [], categoryRows: [], cardRows: [],
        profile: [{ financialData: null, categories: null, cards: null }] });
      assert.deepEqual(await snapshot(other.userId), otherBefore);
    });
  });

  for (const sharedField of ['categoryId', 'cardId'] as const) {
    test(`recusa reset inteiro quando fixa de outro usuário usa ${sharedField}`, async () => {
      await withPeople(async (owner, other) => {
        const { db } = services.client;
        await db.update(fixedExpenses).set({ [sharedField]: owner[sharedField] }).where(eq(fixedExpenses.userId, other.userId));
        // A fonte continua dependendo do catálogo mesmo sem ocorrências.
        await db.delete(expenses).where(eq(expenses.userId, other.userId));
        const ownerBefore = await snapshot(owner.userId);
        const otherBefore = await snapshot(other.userId);
        await assert.rejects(services.clear.clearUserFinancialData(owner.userId),
          (error: unknown) => error instanceof RequestInputError && error.status === 409);
        assert.deepEqual(await snapshot(owner.userId), ownerBefore);
        assert.deepEqual(await snapshot(other.userId), otherBefore);
      });
    });
  }

  test('recusa reset inteiro quando despesa de outro usuário usa cartão próprio', async () => {
    await withPeople(async (owner, other) => {
      const { db } = services.client;
      await db.update(expenses).set({ cardId: owner.cardId }).where(eq(expenses.userId, other.userId));
      const ownerBefore = await snapshot(owner.userId);
      const otherBefore = await snapshot(other.userId);
      await assert.rejects(services.clear.clearUserFinancialData(owner.userId),
        (error: unknown) => error instanceof RequestInputError && error.status === 409);
      assert.deepEqual(await snapshot(owner.userId), ownerBefore);
      assert.deepEqual(await snapshot(other.userId), otherBefore);
    });
  });

  test('falha de integridade posterior desfaz exclusões anteriores e preserva perfil', async () => {
    await withPeople(async (owner, other) => {
      const { db } = services.client;
      const [source] = await db.select({ id: fixedExpenses.id }).from(fixedExpenses).where(eq(fixedExpenses.userId, owner.userId));
      // Simula vínculo legado inconsistente que não passa pela API: o FK
      // RESTRICT falhará ao apagar a fonte, depois do DELETE das despesas próprias.
      await db.insert(expenses).values({ userId: other.userId, accountId: other.accountId, categoryId: other.categoryId,
        description: 'Vínculo legado', paymentMethod: 'pix', purchaseDate: '2026-11-01', dueDate: '2026-11-10', month: 10, year: 2026,
        originalAmount: '100.00', status: 'prevista', fixedExpenseId: source!.id, fixedCompetence: '2027-01-01' });
      const ownerBefore = await snapshot(owner.userId);
      const otherBefore = await snapshot(other.userId);
      await assert.rejects(services.clear.clearUserFinancialData(owner.userId), (error: unknown) =>
        error instanceof Error && 'cause' in error && typeof error.cause === 'object' && error.cause !== null
        && 'constraint' in error.cause && error.cause.constraint === 'despesas_despesa_fixa_id_fkey');
      assert.deepEqual(await snapshot(owner.userId), ownerBefore);
      assert.deepEqual(await snapshot(other.userId), otherBefore);
    });
  });
});
