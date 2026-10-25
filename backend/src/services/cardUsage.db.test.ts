import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import { accountMembers, accounts, cards, categories, expenses, invoicePayments, users } from '../db/schema';
import { getTodayIsoInTimezone } from '../utils/date';
import { invoiceDueDate } from './cardInvoiceRules';
import { assertLocalDatabase, databaseTestsSkipReason } from './financeDbTestSupport';

// A composição do "Usado" do cartão, o vencido e a quitação em lote das faturas vencidas (plano
// .plans/financas-pendencias.md, E3). O cartão vence no dia 31 (limitado ao último dia do mês): a fatura do mês
// atual nunca está vencida em nenhum dia do teste, e as dos meses anteriores sempre estão. Roda pelo test:finance-db.

async function loadServices() {
  const [client, limit, invoices] = await Promise.all([
    import('../db/client.js'),
    import('./cardLimitService.js'),
    import('./cardInvoiceService.js'),
  ]);
  return { client, limit, invoices };
}

let services: Awaited<ReturnType<typeof loadServices>>;

interface Scenario {
  ownerId: number;
  memberId: number;
  accountId: number;
  categoryId: number;
  cardId: number;
  /** 1º dia do mês atual e dos dois anteriores, 'AAAA-MM-01'. */
  months: { current: string; previous: string; beforePrevious: string; next: string };
}

function firstOfMonth(offset: number): string {
  const today = getTodayIsoInTimezone();
  const base = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + offset, 1));
  return base.toISOString().slice(0, 10);
}

async function withScenario(work: (scenario: Scenario) => Promise<void>): Promise<void> {
  const { db } = services.client;
  const newUser = async (name: string) => {
    const [user] = await db.insert(users).values({ name, email: `uso-${randomUUID()}@exemplo.test`, password: 'teste' }).returning({ id: users.id });
    return user!.id;
  };
  const ownerId = await newUser('Teste uso titular');
  const memberId = await newUser('Teste uso membro');
  try {
    const [account] = await db.insert(accounts).values({ userId: ownerId, name: 'Pessoal', type: 'pessoal', isDefault: true }).returning({ id: accounts.id });
    await db.insert(accountMembers).values({ accountId: account!.id, userId: memberId, status: 'ativo' });
    const [category] = await db.insert(categories).values({ userId: ownerId, name: 'Geral', type: 'pessoal' }).returning({ id: categories.id });
    const [card] = await db
      .insert(cards)
      .values({ userId: ownerId, accountId: account!.id, name: 'Cartão A', limit: '3000.00', closingDay: 25, dueDay: 31, type: 'credito', active: true })
      .returning({ id: cards.id });
    await work({
      ownerId,
      memberId,
      accountId: account!.id,
      categoryId: category!.id,
      cardId: card!.id,
      months: { current: firstOfMonth(0), previous: firstOfMonth(-1), beforePrevious: firstOfMonth(-2), next: firstOfMonth(1) },
    });
  } finally {
    await db.delete(expenses).where(inArray(expenses.userId, [ownerId, memberId]));
    await db.delete(invoicePayments).where(eq(invoicePayments.userId, ownerId));
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
  /** 1º dia do mês do vencimento; o dia é o 15. */
  month: string;
  method?: 'credito' | null;
  recurring?: boolean;
  installment?: boolean;
  originPaymentId?: number;
}

async function addPurchase(scenario: Scenario, purchase: Purchase): Promise<void> {
  const dueDate = `${purchase.month.slice(0, 8)}15`;
  const amount = purchase.amount.toFixed(2);
  await services.client.db.insert(expenses).values({
    userId: purchase.authorId,
    accountId: scenario.accountId,
    categoryId: scenario.categoryId,
    cardId: scenario.cardId,
    description: 'Compra de teste',
    paymentMethod: purchase.method === undefined ? 'credito' : purchase.method,
    // A recorrente em aberto só conta depois da data de compra: compra bem antes de hoje.
    purchaseDate: purchase.recurring ? firstOfMonth(-6) : dueDate,
    dueDate,
    month: Number(dueDate.slice(5, 7)) - 1,
    year: Number(dueDate.slice(0, 4)),
    originalAmount: amount,
    paid: false,
    status: 'ativa',
    recurring: purchase.recurring ?? false,
    installment: purchase.installment ?? false,
    invoiceOriginPaymentId: purchase.originPaymentId ?? null,
  });
}

const money = (value: number) => Math.round(value * 100) / 100;

/** Cenário padrão: duas faturas vencidas, a do mês atual e a do próximo, de vários tipos e autores. */
async function seed(scenario: Scenario): Promise<void> {
  const { ownerId, memberId, months } = scenario;
  const [payment] = await services.client.db
    .insert(invoicePayments)
    .values({
      cardId: scenario.cardId, userId: ownerId, registeredBy: ownerId, month: 1, year: 2020, method: 'parcial',
      purchasesAmount: '100.00', paidAmount: '50.00', paymentDate: '2020-02-01',
    })
    .returning({ id: invoicePayments.id });
  // Fatura de dois meses atrás (vencida): única do titular, parcela e uma compra antiga sem forma de pagamento.
  await addPurchase(scenario, { authorId: ownerId, amount: 100, month: months.beforePrevious });
  await addPurchase(scenario, { authorId: ownerId, amount: 50, month: months.beforePrevious, installment: true });
  await addPurchase(scenario, { authorId: ownerId, amount: 33.33, month: months.beforePrevious, method: null });
  // Fatura do mês passado (vencida): do membro, recorrente e a linha gerada por pagamento de fatura.
  await addPurchase(scenario, { authorId: memberId, amount: 80, month: months.previous });
  await addPurchase(scenario, { authorId: ownerId, amount: 55.9, month: months.previous, recurring: true });
  await addPurchase(scenario, { authorId: ownerId, amount: 20, month: months.previous, originPaymentId: payment!.id });
  // Faturas que ainda não venceram.
  await addPurchase(scenario, { authorId: ownerId, amount: 200, month: months.current });
  await addPurchase(scenario, { authorId: ownerId, amount: 300, month: months.next, installment: true });
}

describe('composição do Usado, vencido e quitação em lote (banco local)', { skip: databaseTestsSkipReason }, () => {
  before(async () => {
    assertLocalDatabase();
    services = await loadServices();
  });

  after(async () => {
    await services.client.pool.end();
  });

  test('o vencido do cartão soma só as faturas cujo vencimento já passou', async () => {
    await withScenario(async (scenario) => {
      await seed(scenario);
      const [card] = await services.limit.getCardLimitsForOwners([scenario.ownerId], scenario.accountId);
      // 100 + 50 + 33,33 + 80 + 55,90 + 20 + 200 + 300
      assert.equal(money(card!.usado), 839.23);
      assert.equal(money(card!.vencido), 339.23);
      assert.equal(money(card!.disponivel), money(3000 - 839.23));
    });
  });

  test('a composição soma o Usado, separa por fatura e por tipo e marca as vencidas', async () => {
    await withScenario(async (scenario) => {
      await seed(scenario);
      const usage = await services.limit.getCardUsageForOwners([scenario.ownerId], scenario.accountId, scenario.cardId);
      assert.ok(usage);
      assert.equal(money(usage.usado), 839.23);
      assert.deepEqual(usage.porTipo, { unicas: 413.33, parcelas: 350, recorrentes: 55.9, renegociacao: 20 });
      assert.equal(money(Object.values(usage.porTipo).reduce((sum, value) => sum + value, 0)), 839.23);

      assert.deepEqual(usage.faturas.map((fatura) => fatura.mes), [
        scenario.months.beforePrevious.slice(0, 7), scenario.months.previous.slice(0, 7), scenario.months.current.slice(0, 7), scenario.months.next.slice(0, 7),
      ]);
      assert.deepEqual(usage.faturas.map((fatura) => fatura.vencida), [true, true, false, false]);
      assert.deepEqual(usage.faturas.map((fatura) => fatura.total), [183.33, 155.9, 200, 300]);
      assert.deepEqual(usage.faturas[0]!.porTipo, { unicas: 133.33, parcelas: 50, recorrentes: 0, renegociacao: 0 });
      assert.deepEqual(usage.faturas[1]!.porTipo, { unicas: 80, parcelas: 0, recorrentes: 55.9, renegociacao: 20 });
      // O vencimento da fatura é o dia 31 limitado ao fim do mês, a mesma conta de invoiceDueDate.
      for (const fatura of usage.faturas) {
        assert.equal(fatura.vencimento, invoiceDueDate(`${fatura.mes}-01`, 31, 0));
      }
      assert.equal(usage.hoje, getTodayIsoInTimezone());
      // A compra antiga sem forma de pagamento está no vencido, mas "Pagar fatura" não a alcança.
      assert.equal(money(usage.vencido), 339.23);
      assert.equal(money(usage.vencidoQuitavel), 305.9);
    });
  });

  test('a composição de um cartão que a pessoa não vê é nula', async () => {
    await withScenario(async (scenario) => {
      await seed(scenario);
      assert.equal(await services.limit.getCardUsageForOwners([scenario.memberId], scenario.accountId, scenario.cardId), null);
      assert.equal(await services.limit.getCardUsageForOwners([scenario.ownerId], scenario.accountId, 999_999_999), null);
    });
  });

  test('as faturas vencidas e em aberto saem da mais antiga para a mais nova, com o que "Pagar fatura" quitaria', async () => {
    await withScenario(async (scenario) => {
      await seed(scenario);
      const overdue = await services.invoices.listOverdueCardInvoices(scenario.ownerId, scenario.accountId, getTodayIsoInTimezone());
      assert.deepEqual(overdue.map((item) => [item.card.id, item.invoiceMonth, item.openTotal, item.itemCount]), [
        [scenario.cardId, scenario.months.beforePrevious, 150, 2],
        [scenario.cardId, scenario.months.previous, 155.9, 3],
      ]);
      assert.deepEqual(overdue.map((item) => item.dueDate), [
        invoiceDueDate(scenario.months.beforePrevious, 31, 0), invoiceDueDate(scenario.months.previous, 31, 0),
      ]);
      assert.equal(overdue[0]!.card.ownerName, null);
      // Quem não pode pagar a fatura do cartão não vê nada.
      assert.deepEqual(await services.invoices.listOverdueCardInvoices(scenario.memberId, scenario.accountId, getTodayIsoInTimezone()), []);
    });
  });

  test('quitar em lote paga o total de cada fatura na data escolhida e libera o limite', async () => {
    await withScenario(async (scenario) => {
      await seed(scenario);
      const before = (await services.limit.getCardLimitsForOwners([scenario.ownerId], scenario.accountId))[0]!;
      const result = await services.invoices.payCardInvoicesInFull(scenario.ownerId, [
        { cardId: scenario.cardId, invoiceMonthStart: scenario.months.beforePrevious, paymentDate: invoiceDueDate(scenario.months.beforePrevious, 31, 0) },
        { cardId: scenario.cardId, invoiceMonthStart: scenario.months.previous, paymentDate: '2026-01-10' },
      ]);
      assert.equal(result.failed.length, 0);
      assert.equal(result.paid.length, 2);

      const paid = await services.client.db.select().from(expenses).where(eq(expenses.userId, scenario.ownerId));
      const byDate = (month: string) => paid.filter((row) => row.dueDate.startsWith(month.slice(0, 7)) && row.paid === true);
      // Três compras no crédito do mês de dois atrás: a sem forma de pagamento continua em aberto.
      assert.equal(byDate(scenario.months.beforePrevious).length, 2);
      assert.ok(byDate(scenario.months.beforePrevious).every((row) => row.paymentDate === invoiceDueDate(scenario.months.beforePrevious, 31, 0)));
      assert.ok(byDate(scenario.months.beforePrevious).every((row) => row.amountPaid === row.originalAmount && row.invoicePaymentId !== null));
      assert.ok(paid.filter((row) => row.dueDate.startsWith(scenario.months.previous.slice(0, 7))).every((row) => row.paid === true && row.paymentDate === '2026-01-10'));

      const after = (await services.limit.getCardLimitsForOwners([scenario.ownerId], scenario.accountId))[0]!;
      assert.equal(money(before.usado - after.usado), 150 + 155.9);
      assert.equal(money(after.vencido), 33.33);
      assert.deepEqual(await services.invoices.listOverdueCardInvoices(scenario.ownerId, scenario.accountId, getTodayIsoInTimezone()), []);
    });
  });

  test('uma fatura que já foi paga falha sem derrubar as outras do lote, e sem permissão nada é pago', async () => {
    await withScenario(async (scenario) => {
      await seed(scenario);
      const day = getTodayIsoInTimezone();
      await services.invoices.payCardInvoicesInFull(scenario.ownerId, [
        { cardId: scenario.cardId, invoiceMonthStart: scenario.months.beforePrevious, paymentDate: day },
      ]);
      const result = await services.invoices.payCardInvoicesInFull(scenario.ownerId, [
        { cardId: scenario.cardId, invoiceMonthStart: scenario.months.beforePrevious, paymentDate: day },
        { cardId: scenario.cardId, invoiceMonthStart: scenario.months.previous, paymentDate: day },
      ]);
      assert.deepEqual(result.paid.map((item) => item.invoiceMonthStart), [scenario.months.previous]);
      assert.deepEqual(result.failed.map((item) => [item.invoiceMonthStart, item.message]), [
        [scenario.months.beforePrevious, 'Esta fatura não tem valor em aberto.'],
      ]);

      await withScenario(async (other) => {
        await seed(other);
        const denied = await services.invoices.payCardInvoicesInFull(other.memberId, [
          { cardId: other.cardId, invoiceMonthStart: other.months.previous, paymentDate: day },
        ]);
        assert.equal(denied.paid.length, 0);
        assert.deepEqual(denied.failed.map((item) => item.message), ['Cartão não encontrado']);
      });
    });
  });
});
