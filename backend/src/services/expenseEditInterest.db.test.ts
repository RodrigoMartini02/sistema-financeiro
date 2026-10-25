import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { asc, eq } from 'drizzle-orm';
import { accounts, categories, expenses, users } from '../db/schema';
import type { CreateExpenseInput, UpdateExpenseInput } from './expenseInput';
import { assertLocalDatabase, databaseTestsSkipReason } from './financeDbTestSupport';

// O valor à vista informado na edição da compra parcelada refaz o juros das parcelas abertas (fatia 5 do plano
// .plans/edicao-despesas-parceladas.md): a paga e a ligada à fatura não mudam, "ausente" não mexe e o valor
// novo da mesma edição já vale na conta. Roda pelo test:finance-db (financeDbTestSupport.ts).

const TODAY = '2026-10-20';

// Carregados só depois de conferir que o banco é local: db/client abre a conexão ao ser importado.
async function loadServices() {
  const [client, service] = await Promise.all([import('../db/client.js'), import('./expenseService.js')]);
  return { client, service };
}

let services: Awaited<ReturnType<typeof loadServices>>;

interface Scenario {
  userId: number;
  accountId: number;
  categoryId: number;
}

/** Pessoa de teste com conta pessoal e categoria; tudo dela é apagado ao fim do teste. */
async function withScenario(work: (scenario: Scenario) => Promise<void>): Promise<void> {
  const { db } = services.client;
  const [user] = await db
    .insert(users)
    .values({ name: 'Teste edição juros', email: `edicao-juros-${randomUUID()}@exemplo.test`, password: 'teste' })
    .returning({ id: users.id });
  const userId = user!.id;
  try {
    const [account] = await db
      .insert(accounts)
      .values({ userId, name: 'Pessoal', type: 'pessoal', isDefault: true })
      .returning({ id: accounts.id });
    const [category] = await db.insert(categories).values({ userId, name: 'Geral', type: 'pessoal' }).returning({ id: categories.id });
    await work({ userId, accountId: account!.id, categoryId: category!.id });
  } finally {
    await db.delete(expenses).where(eq(expenses.userId, userId));
    await db.delete(categories).where(eq(categories.userId, userId));
    await db.delete(accounts).where(eq(accounts.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }
}

/** Compra parcelada no PIX: 3 × R$ 35,00; `paidFirst` marca a primeira como paga. */
async function createPurchase(scenario: Scenario, options: { paidFirst: boolean; cashPrice?: number | null }): Promise<number[]> {
  const input: CreateExpenseInput = {
    accountId: scenario.accountId,
    description: 'Compra parcelada',
    categoryId: scenario.categoryId,
    paymentMethod: 'pix',
    cardId: null,
    purchaseDate: '2026-09-10',
    invoiceNumber: null,
    invoiceDate: null,
    attachments: null,
    billingType: 'installments',
    cashPrice: options.cashPrice ?? null,
    installments: [
      { amount: 35, dueDate: '2026-09-10', paid: options.paidFirst, paymentDate: options.paidFirst ? '2026-09-10' : null, amountPaid: options.paidFirst ? 35 : null },
      { amount: 35, dueDate: '2026-10-10', paid: false, paymentDate: null, amountPaid: null },
      { amount: 35, dueDate: '2026-11-10', paid: false, paymentDate: null, amountPaid: null },
    ],
  };
  await services.service.createExpense(scenario.userId, input, TODAY);
  const rows = await services.client.db
    .select({ id: expenses.id })
    .from(expenses)
    .where(eq(expenses.userId, scenario.userId))
    .orderBy(asc(expenses.currentInstallment));
  return rows.map((row) => row.id);
}

function editInput(scenario: Scenario, overrides: Partial<UpdateExpenseInput> = {}): UpdateExpenseInput {
  return {
    description: 'Compra parcelada',
    categoryId: scenario.categoryId,
    paymentMethod: 'pix',
    cardId: null,
    purchaseDate: '2026-09-10',
    invoiceNumber: null,
    invoiceDate: null,
    attachments: null,
    amount: 35,
    dueDate: '2026-10-10',
    paid: false,
    paymentDate: null,
    amountPaid: null,
    applyTo: 'all',
    cashPrice: null,
    ...overrides,
  };
}

async function edit(scenario: Scenario, expenseId: number, overrides: Partial<UpdateExpenseInput>) {
  const current = await services.service.findExpenseForUpdate(scenario.userId, expenseId);
  assert.ok(current, 'a despesa existe');
  const result = await services.service.updateExpense(scenario.userId, expenseId, editInput(scenario, overrides), current, TODAY);
  assert.ok(result, 'a edição devolveu a despesa');
  return result;
}

async function interests(scenario: Scenario): Promise<Array<string | null>> {
  const rows = await services.client.db
    .select({ interest: expenses.interest })
    .from(expenses)
    .where(eq(expenses.userId, scenario.userId))
    .orderBy(asc(expenses.currentInstallment));
  return rows.map((row) => row.interest);
}

describe('valor à vista na edição da parcelada (banco local)', { skip: databaseTestsSkipReason }, () => {
  before(async () => {
    assertLocalDatabase();
    services = await loadServices();
  });

  after(async () => {
    await services.client.pool.end();
  });

  test('todas abertas: 3 × R$ 35,00 com à vista de R$ 90,00 grava R$ 5,00 em cada parcela', async () => {
    await withScenario(async (scenario) => {
      const ids = await createPurchase(scenario, { paidFirst: false });
      assert.deepEqual(await interests(scenario), [null, null, null]);
      const result = await edit(scenario, ids[1]!, { cashPrice: 90 });
      assert.equal(result.interestUpdated, 3);
      assert.deepEqual(await interests(scenario), ['5.00', '5.00', '5.00']);
    });
  });

  test('a parcela paga mantém o juros (zero) e as abertas levam o total: R$ 7,50 cada', async () => {
    await withScenario(async (scenario) => {
      const ids = await createPurchase(scenario, { paidFirst: true });
      const result = await edit(scenario, ids[1]!, { cashPrice: 90 });
      assert.equal(result.interestUpdated, 2);
      assert.deepEqual(await interests(scenario), [null, '7.50', '7.50']);
    });
  });

  test('valor à vista ausente não mexe no juros que já existe', async () => {
    await withScenario(async (scenario) => {
      const ids = await createPurchase(scenario, { paidFirst: false, cashPrice: 90 });
      assert.deepEqual(await interests(scenario), ['5.00', '5.00', '5.00']);
      const result = await edit(scenario, ids[1]!, { description: 'Outro nome', cashPrice: null });
      assert.equal(result.interestUpdated, 0);
      assert.deepEqual(await interests(scenario), ['5.00', '5.00', '5.00']);
    });
  });

  test('à vista igual ou maior que a soma tira o juros das abertas', async () => {
    await withScenario(async (scenario) => {
      const ids = await createPurchase(scenario, { paidFirst: false, cashPrice: 90 });
      const result = await edit(scenario, ids[0]!, { cashPrice: 105, dueDate: '2026-09-10' });
      assert.equal(result.interestUpdated, 3);
      assert.deepEqual(await interests(scenario), [null, null, null]);
    });
  });

  test('o valor novo da mesma edição já vale na conta: parcelas de R$ 40,00 com à vista de R$ 90,00', async () => {
    await withScenario(async (scenario) => {
      const ids = await createPurchase(scenario, { paidFirst: false });
      // Total R$ 120,00 − R$ 90,00 = R$ 30,00, R$ 10,00 em cada parcela.
      await edit(scenario, ids[1]!, { amount: 40, cashPrice: 90 });
      assert.deepEqual(await interests(scenario), ['10.00', '10.00', '10.00']);
    });
  });

  test('despesa que não é parcelada recusa o valor à vista e não grava nada', async () => {
    await withScenario(async (scenario) => {
      const [single] = await services.client.db
        .insert(expenses)
        .values({
          userId: scenario.userId,
          accountId: scenario.accountId,
          categoryId: scenario.categoryId,
          description: 'Única',
          dueDate: '2026-10-10',
          month: 10,
          year: 2026,
          originalAmount: '35.00',
          paid: false,
        })
        .returning({ id: expenses.id });
      await assert.rejects(() => edit(scenario, single!.id, { cashPrice: 20 }), /só da compra parcelada/);
      assert.deepEqual(await interests(scenario), [null]);
    });
  });
});
