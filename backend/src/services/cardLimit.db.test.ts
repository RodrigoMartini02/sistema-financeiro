import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import { accountMembers, accounts, cards, categories, expenses, users } from '../db/schema';
import { addDaysToIsoDate, getMonthYearFromIsoDate, getTodayIsoInTimezone } from '../utils/date';
import { assertLocalDatabase, databaseTestsSkipReason } from './financeDbTestSupport';

// "Usado" do cartão (card de limite de Movimentações, Painel e modal de despesa): o limite é do cartão, então
// ocupa o limite toda compra em aberto feita nele, de qualquer pessoa. Roda pelo test:finance-db.

async function loadServices() {
  const [client, cardLimit] = await Promise.all([import('../db/client.js'), import('./cardLimitService.js')]);
  return { client, cardLimit };
}

let services: Awaited<ReturnType<typeof loadServices>>;

interface Scenario {
  ownerId: number;
  memberId: number;
  accountId: number;
  categoryId: number;
  cardId: number;
}

/** Titular com conta pessoal, um membro ativo dela, uma categoria e um cartão de R$ 3.000; tudo é apagado ao fim. */
async function withScenario(cardType: 'credito' | 'ambos', work: (scenario: Scenario) => Promise<void>): Promise<void> {
  const { db } = services.client;
  const newUser = async (name: string) => {
    const [user] = await db
      .insert(users)
      .values({ name, email: `cartao-${randomUUID()}@exemplo.test`, password: 'teste' })
      .returning({ id: users.id });
    return user!.id;
  };
  const ownerId = await newUser('Teste cartão titular');
  const memberId = await newUser('Teste cartão membro');
  try {
    const [account] = await db
      .insert(accounts)
      .values({ userId: ownerId, name: 'Pessoal', type: 'pessoal', isDefault: true })
      .returning({ id: accounts.id });
    await db.insert(accountMembers).values({ accountId: account!.id, userId: memberId, status: 'ativo' });
    const [category] = await db
      .insert(categories)
      .values({ userId: ownerId, name: 'Geral', type: 'pessoal' })
      .returning({ id: categories.id });
    const [card] = await db
      .insert(cards)
      .values({ userId: ownerId, accountId: account!.id, name: 'Cartão A', limit: '3000.00', closingDay: 25, dueDay: 5, type: cardType, active: true })
      .returning({ id: cards.id });
    await work({ ownerId, memberId, accountId: account!.id, categoryId: category!.id, cardId: card!.id });
  } finally {
    await db.delete(expenses).where(inArray(expenses.userId, [ownerId, memberId]));
    await db.delete(cards).where(eq(cards.userId, ownerId));
    await db.delete(categories).where(eq(categories.userId, ownerId));
    await db.delete(accountMembers).where(eq(accountMembers.userId, memberId));
    await db.delete(accounts).where(eq(accounts.userId, ownerId));
    await db.delete(users).where(inArray(users.id, [ownerId, memberId]));
  }
}

interface Purchase {
  authorId: number;
  amount: number;
  /** Padrão: hoje. */
  purchaseDate?: string;
  /** Padrão: a data da compra. */
  dueDate?: string;
  method?: 'credito' | 'debito';
  paid?: boolean;
  status?: 'ativa' | 'cancelada';
  recurring?: boolean;
  installment?: boolean;
}

/** Compra no cartão do cenário, feita por `authorId`, em aberto a não ser que se diga o contrário. */
async function addPurchase(scenario: Scenario, purchase: Purchase): Promise<void> {
  const purchaseDate = purchase.purchaseDate ?? getTodayIsoInTimezone();
  const dueDate = purchase.dueDate ?? purchaseDate;
  const { mes, ano } = getMonthYearFromIsoDate(dueDate);
  const amount = purchase.amount.toFixed(2);
  await services.client.db.insert(expenses).values({
    userId: purchase.authorId,
    accountId: scenario.accountId,
    categoryId: scenario.categoryId,
    cardId: scenario.cardId,
    description: 'Compra de teste',
    paymentMethod: purchase.method ?? 'credito',
    purchaseDate,
    dueDate,
    month: mes,
    year: ano,
    originalAmount: amount,
    paid: purchase.paid ?? false,
    paymentDate: purchase.paid ? purchaseDate : null,
    amountPaid: purchase.paid ? amount : null,
    status: purchase.status ?? 'ativa',
    recurring: purchase.recurring ?? false,
    installment: purchase.installment ?? false,
  });
}

describe('limite usado do cartão (banco local)', { skip: databaseTestsSkipReason }, () => {
  before(async () => {
    assertLocalDatabase();
    services = await loadServices();
  });

  after(async () => {
    await services?.client.pool.end();
  });

  test('a compra de outra pessoa no cartão do titular ocupa o limite, na visão só eu e na família', async () => {
    await withScenario('credito', async (scenario) => {
      await addPurchase(scenario, { authorId: scenario.ownerId, amount: 200 });
      await addPurchase(scenario, { authorId: scenario.memberId, amount: 120 });

      const [onlyMe] = await services.cardLimit.getCardLimits(scenario.ownerId, scenario.accountId, false);
      // O vencido depende do dia em que o teste roda (a compra é de hoje e o cartão vence no dia 5): cardUsage.db.test.ts o cobre.
      assert.deepEqual({ ...onlyMe, vencido: 0 }, { id: scenario.cardId, nome: 'Cartão A', limite: 3000, usado: 320, disponivel: 2680, vencido: 0 });

      const [family] = await services.cardLimit.getCardLimits(scenario.ownerId, scenario.accountId, true);
      assert.equal(family?.usado, 320);
    });
  });

  test('o cartão de outra pessoa não aparece na lista nem entra na soma', async () => {
    await withScenario('credito', async (mine) => {
      await withScenario('credito', async (other) => {
        await addPurchase(other, { authorId: other.ownerId, amount: 500 });
        await addPurchase(mine, { authorId: mine.ownerId, amount: 100 });

        const limits = await services.cardLimit.getCardLimits(mine.ownerId, mine.accountId, false);
        assert.deepEqual(limits.map((limit) => [limit.id, limit.usado]), [[mine.cardId, 100]]);
      });
    });
  });

  test('só a dívida em aberto que já aconteceu ocupa o limite', async () => {
    await withScenario('ambos', async (scenario) => {
      const today = getTodayIsoInTimezone();
      const past = addDaysToIsoDate(today, -10);
      const future = addDaysToIsoDate(today, 10);
      const author = scenario.ownerId;
      await addPurchase(scenario, { authorId: author, amount: 100 });
      // Paga, cancelada e débito no cartão "ambos" não ocupam o limite.
      await addPurchase(scenario, { authorId: author, amount: 50, paid: true });
      await addPurchase(scenario, { authorId: author, amount: 70, status: 'cancelada' });
      await addPurchase(scenario, { authorId: author, amount: 90, method: 'debito' });
      // Parcelado: todas as parcelas em aberto ocupam, desde a compra.
      for (let installment = 0; installment < 3; installment += 1) {
        await addPurchase(scenario, { authorId: author, amount: 40, installment: true });
      }
      // Recorrente: só a cobrança que já ocorreu.
      await addPurchase(scenario, { authorId: author, amount: 30, recurring: true, purchaseDate: past });
      await addPurchase(scenario, { authorId: author, amount: 30, recurring: true, purchaseDate: future });

      const [limit] = await services.cardLimit.getCardLimits(author, scenario.accountId, false);
      assert.equal(limit?.usado, 250);
    });
  });
});
