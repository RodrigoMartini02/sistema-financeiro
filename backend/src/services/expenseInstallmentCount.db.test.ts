import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { and, asc, eq, sql } from 'drizzle-orm';
import { accounts, cards, categories, expenses, invoicePayments, users } from '../db/schema';
import { RequestInputError } from '../utils/requestInput';
import { expenseCashDateColumn } from './cashDate';
import type { CreateExpenseInput, UpdateExpenseInput } from './expenseInput';
import { assertLocalDatabase, databaseTestsSkipReason } from './financeDbTestSupport';

// Mudar o nº de parcelas na edição da compra parcelada e a despesa única que vira parcelada (plano
// .plans/financas-pendencias.md, E4): só parcela aberta entra ou sai, a paga e a da fatura ficam, a recusa não grava
// nada. Roda pelo test:finance-db (financeDbTestSupport.ts).

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
  cardId: number;
}

/** Pessoa de teste com conta pessoal, categoria e cartão; tudo dela é apagado ao fim do teste. */
async function withScenario(work: (scenario: Scenario) => Promise<void>): Promise<void> {
  const { db } = services.client;
  const [user] = await db
    .insert(users)
    .values({ name: 'Teste nº de parcelas', email: `n-parcelas-${randomUUID()}@exemplo.test`, password: 'teste' })
    .returning({ id: users.id });
  const userId = user!.id;
  try {
    const [account] = await db.insert(accounts).values({ userId, name: 'Pessoal', type: 'pessoal', isDefault: true }).returning({ id: accounts.id });
    const [category] = await db.insert(categories).values({ userId, name: 'Geral', type: 'pessoal' }).returning({ id: categories.id });
    const [card] = await db
      .insert(cards)
      .values({ userId, accountId: account!.id, name: 'Cartão', limit: '3000.00', closingDay: 25, dueDay: 10, type: 'credito', active: true })
      .returning({ id: cards.id });
    await work({ userId, accountId: account!.id, categoryId: category!.id, cardId: card!.id });
  } finally {
    await db.delete(expenses).where(eq(expenses.userId, userId));
    await db.delete(invoicePayments).where(eq(invoicePayments.userId, userId));
    await db.delete(cards).where(eq(cards.userId, userId));
    await db.delete(categories).where(eq(categories.userId, userId));
    await db.delete(accounts).where(eq(accounts.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }
}

/** Compra parcelada no PIX de `count` parcelas de R$ 35,00, vencendo todo dia 10 a partir de 10/09/2026; `paid` marca parcelas (1, 2…) como pagas. */
async function createPurchase(scenario: Scenario, count: number, paid: number[] = [], cashPrice: number | null = null): Promise<number[]> {
  const input: CreateExpenseInput = {
    accountId: scenario.accountId,
    description: 'Compra parcelada',
    categoryId: scenario.categoryId,
    paymentMethod: 'pix',
    cardId: null,
    purchaseDate: '2026-09-10',
    invoiceNumber: null,
    invoiceDate: null,
    billingType: 'installments',
    cashPrice,
    installments: Array.from({ length: count }, (_, index) => {
      const isPaid = paid.includes(index + 1);
      const due = new Date(Date.UTC(2026, 8 + index, 10)).toISOString().slice(0, 10);
      return { amount: 35, dueDate: due, paid: isPaid, paymentDate: isPaid ? due : null, amountPaid: isPaid ? 35 : null };
    }),
  };
  await services.service.createExpense(scenario.userId, input, TODAY);
  return (await rows(scenario)).map((row) => row.id);
}

async function insertSingle(scenario: Scenario, overrides: Partial<typeof expenses.$inferInsert> = {}): Promise<number> {
  const [single] = await services.client.db
    .insert(expenses)
    .values({
      userId: scenario.userId,
      accountId: scenario.accountId,
      categoryId: scenario.categoryId,
      description: 'Única',
      paymentMethod: 'pix',
      purchaseDate: '2026-10-05',
      dueDate: '2026-10-31',
      month: 9,
      year: 2026,
      originalAmount: '100.00',
      paid: false,
      ...overrides,
    })
    .returning({ id: expenses.id });
  return single!.id;
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
    amount: 35,
    dueDate: '2026-10-10',
    paid: false,
    paymentDate: null,
    amountPaid: null,
    applyTo: 'all',
    cashPrice: null,
    installmentCount: null,
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

async function rows(scenario: Scenario) {
  return services.client.db
    .select({
      id: expenses.id,
      number: expenses.currentInstallment,
      count: expenses.numberOfInstallments,
      groupId: expenses.installmentGroupId,
      dueDate: expenses.dueDate,
      amount: expenses.originalAmount,
      interest: expenses.interest,
      paid: expenses.paid,
      amountPaid: expenses.amountPaid,
      paymentDate: expenses.paymentDate,
      installment: expenses.installment,
      method: expenses.paymentMethod,
      cardId: expenses.cardId,
    })
    .from(expenses)
    .where(eq(expenses.userId, scenario.userId))
    .orderBy(asc(expenses.currentInstallment), asc(expenses.id));
}

const labels = (list: Awaited<ReturnType<typeof rows>>) => list.map((row) => `${row.number}/${row.count}`);

/** Soma, em centavos, de valores decimais gravados como texto ("33.33"). */
const sumCents = (values: Array<string | null>) => values.reduce((total, value) => total + Math.round(Number(value ?? 0) * 100), 0);

/** O que o caixa conta como pago entre duas datas (regime de caixa: a data do pagamento), em reais. */
async function cashPaidBetween(scenario: Scenario, start: string, end: string): Promise<number> {
  const [row] = await services.client.db
    .select({ total: sql<string>`COALESCE(SUM(${expenses.amountPaid}), 0)` })
    .from(expenses)
    .where(and(
      eq(expenses.userId, scenario.userId),
      eq(expenses.status, 'ativa'),
      eq(expenses.paid, true),
      sql`${expenseCashDateColumn()} BETWEEN ${start} AND ${end}`,
    ));
  return Number(row!.total);
}

describe('nº de parcelas na edição (banco local)', { skip: databaseTestsSkipReason }, () => {
  before(async () => {
    assertLocalDatabase();
    services = await loadServices();
  });

  after(async () => {
    await services.client.pool.end();
  });

  test('aumentar de 3 para 5: cria 4/5 e 5/5 abertas, com o valor da parcela, sem juros, no mesmo grupo', async () => {
    await withScenario(async (scenario) => {
      const ids = await createPurchase(scenario, 3);
      const result = await edit(scenario, ids[1]!, { installmentCount: 5 });
      assert.equal(result.installmentsCreated, 2);
      assert.equal(result.installmentsDeleted, 0);
      const list = await rows(scenario);
      assert.deepEqual(labels(list), ['1/5', '2/5', '3/5', '4/5', '5/5']);
      assert.deepEqual(list.map((row) => row.dueDate), ['2026-09-10', '2026-10-10', '2026-11-10', '2026-12-10', '2027-01-10']);
      assert.ok(list.every((row) => row.groupId === ids[0] && row.installment === true && row.amount === '35.00'));
      assert.deepEqual(list.slice(3).map((row) => [row.paid, row.interest, row.paymentDate]), [[false, null, null], [false, null, null]]);
    });
  });

  test('a parcela paga só ganha o novo rótulo: valor pago, data e vencimento continuam', async () => {
    await withScenario(async (scenario) => {
      const ids = await createPurchase(scenario, 3, [1]);
      await edit(scenario, ids[2]!, { installmentCount: 4, dueDate: '2026-11-10' });
      const [first] = await rows(scenario);
      assert.equal(first!.count, 4);
      assert.equal(first!.paid, true);
      assert.equal(first!.amountPaid, '35.00');
      assert.equal(first!.paymentDate, '2026-09-10');
      assert.equal(first!.dueDate, '2026-09-10');
    });
  });

  test('o "À vista" da mesma edição vale para o novo total: 4 × R$ 35,00 com à vista de R$ 130,00 = R$ 2,50 em cada', async () => {
    await withScenario(async (scenario) => {
      const ids = await createPurchase(scenario, 3);
      const result = await edit(scenario, ids[1]!, { installmentCount: 4, cashPrice: 130 });
      assert.equal(result.installmentsCreated, 1);
      assert.deepEqual((await rows(scenario)).map((row) => row.interest), ['2.50', '2.50', '2.50', '2.50']);
    });
  });

  test('reduzir de 5 para 3: apaga 4/5 e 5/5 abertas e as que ficam viram x/3', async () => {
    await withScenario(async (scenario) => {
      const ids = await createPurchase(scenario, 5);
      const result = await edit(scenario, ids[1]!, { installmentCount: 3 });
      assert.equal(result.installmentsCreated, 0);
      assert.equal(result.installmentsDeleted, 2);
      assert.deepEqual(labels(await rows(scenario)), ['1/3', '2/3', '3/3']);
    });
  });

  test('reduzir com a primeira paga fora da cauda: a paga fica com o novo rótulo', async () => {
    await withScenario(async (scenario) => {
      const ids = await createPurchase(scenario, 4, [1]);
      await edit(scenario, ids[1]!, { installmentCount: 2 });
      const list = await rows(scenario);
      assert.deepEqual(labels(list), ['1/2', '2/2']);
      assert.equal(list[0]!.paid, true);
    });
  });

  test('reduzir com parcela paga na cauda: recusa com o mínimo e não grava nada', async () => {
    await withScenario(async (scenario) => {
      const ids = await createPurchase(scenario, 5, [4]);
      const before = await rows(scenario);
      await assert.rejects(
        () => edit(scenario, ids[1]!, { installmentCount: 2, description: 'Outro nome' }),
        /a parcela 4 já foi paga\. O mínimo é 4 parcelas/,
      );
      assert.deepEqual(await rows(scenario), before);
      const [description] = await services.client.db.select({ description: expenses.description }).from(expenses).where(eq(expenses.id, ids[1]!));
      assert.equal(description!.description, 'Compra parcelada', 'a edição da mesma chamada também foi desfeita');
    });
  });

  test('reduzir com parcela da fatura do cartão na cauda: recusa', async () => {
    await withScenario(async (scenario) => {
      const ids = await createPurchase(scenario, 3);
      const [payment] = await services.client.db
        .insert(invoicePayments)
        .values({
          cardId: scenario.cardId, userId: scenario.userId, registeredBy: scenario.userId, month: 10, year: 2026, method: 'total',
          purchasesAmount: '35.00', paidAmount: '35.00', paymentDate: '2026-11-10',
        })
        .returning({ id: invoicePayments.id });
      await services.client.db.update(expenses).set({ invoicePaymentId: payment!.id, paid: true }).where(eq(expenses.id, ids[2]!));
      await assert.rejects(() => edit(scenario, ids[0]!, { installmentCount: 2 }), /a parcela 3 está numa fatura do cartão/);
      assert.equal((await rows(scenario)).length, 3);
    });
  });

  test('reduzir deixando a parcela editada de fora: recusa', async () => {
    await withScenario(async (scenario) => {
      const ids = await createPurchase(scenario, 3);
      await assert.rejects(() => edit(scenario, ids[2]!, { installmentCount: 2 }), /a parcela 3 é a que você está editando/);
      assert.equal((await rows(scenario)).length, 3);
    });
  });

  test('só "Todas" muda o nº de parcelas da compra parcelada', async () => {
    await withScenario(async (scenario) => {
      const ids = await createPurchase(scenario, 3);
      for (const applyTo of ['this', 'following'] as const) {
        await assert.rejects(() => edit(scenario, ids[0]!, { installmentCount: 4, applyTo }), /escolha "Todas as parcelas"/);
      }
      assert.equal((await rows(scenario)).length, 3);
    });
  });

  test('o mesmo nº de parcelas não muda nada, mesmo com outro alcance', async () => {
    await withScenario(async (scenario) => {
      const ids = await createPurchase(scenario, 3);
      const before = await rows(scenario);
      const result = await edit(scenario, ids[0]!, { installmentCount: 3, applyTo: 'this', dueDate: '2026-09-10' });
      assert.equal(result.installmentsCreated + result.installmentsDeleted, 0);
      assert.deepEqual(await rows(scenario), before);
    });
  });

  test('numeração com falha ("3/10" com 8 linhas): as novas vão de 11 até o novo total', async () => {
    await withScenario(async (scenario) => {
      const ids = await createPurchase(scenario, 10);
      await services.client.db.delete(expenses).where(eq(expenses.id, ids[9]!));
      await services.client.db.delete(expenses).where(eq(expenses.id, ids[8]!));
      await edit(scenario, ids[2]!, { installmentCount: 12 });
      const list = await rows(scenario);
      assert.equal(list.length, 10);
      assert.deepEqual(labels(list).slice(-3), ['8/12', '11/12', '12/12']);
    });
  });

  test('despesa única vira a parcela 1: as parcelas 2 a N vencem mês a mês, no mesmo grupo e sem juros', async () => {
    await withScenario(async (scenario) => {
      const id = await insertSingle(scenario);
      const result = await edit(scenario, id, {
        description: 'Única', amount: 100, dueDate: '2026-10-31', purchaseDate: '2026-10-05', installmentCount: 3, applyTo: 'this',
      });
      assert.equal(result.installmentsCreated, 2);
      const list = await rows(scenario);
      assert.deepEqual(labels(list), ['1/3', '2/3', '3/3']);
      assert.deepEqual(list.map((row) => row.dueDate), ['2026-10-31', '2026-11-30', '2026-12-31']);
      assert.ok(list.every((row) => row.groupId === id && row.amount === '100.00' && row.installment === true && row.interest === null));
      assert.deepEqual(list.map((row) => row.paid), [false, false, false]);
    });
  });

  test('despesa única no crédito vira parcelada no mesmo cartão', async () => {
    await withScenario(async (scenario) => {
      const id = await insertSingle(scenario, { paymentMethod: 'credito', cardId: scenario.cardId });
      await edit(scenario, id, {
        amount: 100, dueDate: '2026-10-31', purchaseDate: '2026-10-05', paymentMethod: 'credito', cardId: scenario.cardId, installmentCount: 2,
      });
      const list = await rows(scenario);
      assert.deepEqual(list.map((row) => [row.method, row.cardId]), [['credito', scenario.cardId], ['credito', scenario.cardId]]);
    });
  });

  test('despesa única em aberto pelo total: R$ 100,00 em 3 = 33,33 + 33,33 + 33,34, todas em aberto, no mesmo grupo', async () => {
    await withScenario(async (scenario) => {
      const id = await insertSingle(scenario);
      await edit(scenario, id, {
        amount: 100, dueDate: '2026-10-31', purchaseDate: '2026-10-05', installmentCount: 3,
        billingType: 'installments', installmentAmountMode: 'total',
      });
      const list = await rows(scenario);
      assert.equal(list[0]!.id, id);
      assert.deepEqual(list.map((row) => row.amount), ['33.33', '33.33', '33.34']);
      assert.deepEqual(list.map((row) => row.paid), [false, false, false]);
      assert.ok(list.every((row) => row.groupId === id && row.amountPaid === null));
    });
  });

  test('despesa única paga vira parcelada pelo total: ID da parcela 1 mantido, pagamento dividido, todas pagas na data original e caixa igual', async () => {
    await withScenario(async (scenario) => {
      const id = await insertSingle(scenario, { paid: true, paymentDate: '2026-10-31', amountPaid: '105.00' });
      assert.equal(await cashPaidBetween(scenario, '2026-10-01', '2026-10-31'), 105);
      const result = await edit(scenario, id, {
        amount: 100, dueDate: '2026-10-31', purchaseDate: '2026-10-05', paid: true, paymentDate: '2026-10-31', amountPaid: 105,
        installmentCount: 3, billingType: 'installments', installmentAmountMode: 'total',
      });
      assert.equal(result.installmentsCreated, 2);
      const list = await rows(scenario);
      assert.equal(list[0]!.id, id);
      assert.deepEqual(labels(list), ['1/3', '2/3', '3/3']);
      assert.deepEqual(list.map((row) => row.dueDate), ['2026-10-31', '2026-11-30', '2026-12-31']);
      assert.deepEqual(list.map((row) => row.amount), ['33.33', '33.33', '33.34']);
      assert.deepEqual(list.map((row) => row.amountPaid), ['34.99', '34.99', '35.02']);
      assert.deepEqual(list.map((row) => row.paymentDate), ['2026-10-31', '2026-10-31', '2026-10-31']);
      assert.deepEqual(list.map((row) => row.paid), [true, true, true]);
      assert.ok(list.every((row) => row.groupId === id && row.installment === true));
      assert.equal(sumCents(list.map((row) => row.amount)), 10000);
      assert.equal(sumCents(list.map((row) => row.amountPaid)), 10500);
      // O caixa não sai do mês do pagamento: nada passa para os vencimentos de novembro e dezembro.
      assert.equal(await cashPaidBetween(scenario, '2026-10-01', '2026-10-31'), 105);
      assert.equal(await cashPaidBetween(scenario, '2026-11-01', '2026-12-31'), 0);
    });
  });

  test('despesa única paga só vira parcelada pelo total: por parcela é recusado e nada é gravado', async () => {
    await withScenario(async (scenario) => {
      const id = await insertSingle(scenario, { paid: true, paymentDate: '2026-10-31', amountPaid: '100.00' });
      const paidEdit = { amount: 100, dueDate: '2026-10-31', paid: true, paymentDate: '2026-10-31', amountPaid: 100, installmentCount: 3 };
      await assert.rejects(() => edit(scenario, id, paidEdit), /dividindo o valor total/);
      await assert.rejects(
        () => edit(scenario, id, { ...paidEdit, billingType: 'installments', installmentAmountMode: 'perInstallment' }),
        /dividindo o valor total/,
      );
      const list = await rows(scenario);
      assert.equal(list.length, 1);
      assert.deepEqual([list[0]!.amount, list[0]!.amountPaid, list[0]!.installment], ['100.00', '100.00', false]);
    });
  });

  test('a conversão não muda o pagamento junto: marcar "paga" na mesma edição é recusado e nada é gravado', async () => {
    await withScenario(async (scenario) => {
      const id = await insertSingle(scenario);
      await assert.rejects(
        () => edit(scenario, id, {
          amount: 100, dueDate: '2026-10-31', paid: true, paymentDate: '2026-10-31', amountPaid: 100, installmentCount: 3,
          billingType: 'installments', installmentAmountMode: 'total',
        }),
        /Salve a mudança do pagamento/,
      );
      const list = await rows(scenario);
      assert.equal(list.length, 1);
      assert.deepEqual([list[0]!.paid, list[0]!.installment], [false, false]);
    });
  });

  test('pedido com a tela velha não parcela outra vez: a despesa já parcelada por outra edição recusa com 409 e nada muda', async () => {
    await withScenario(async (scenario) => {
      const id = await insertSingle(scenario, { paid: true, paymentDate: '2026-10-31', amountPaid: '100.00' });
      const stale = await services.service.findExpenseForUpdate(scenario.userId, id);
      const convert = { amount: 100, dueDate: '2026-10-31', paid: true, paymentDate: '2026-10-31', amountPaid: 100, installmentCount: 3 };
      await edit(scenario, id, { ...convert, billingType: 'installments', installmentAmountMode: 'total' });
      await assert.rejects(
        () => services.service.updateExpense(
          scenario.userId, id, editInput(scenario, { ...convert, billingType: 'installments', installmentAmountMode: 'total' }), stale!, TODAY,
        ),
        (error: unknown) => error instanceof RequestInputError && error.status === 409,
      );
      const list = await rows(scenario);
      assert.deepEqual(list.map((row) => row.amount), ['33.33', '33.33', '33.34']);
      assert.equal(list.length, 3);
    });
  });

  test('despesa única paga no crédito com cartão não vira parcelada: o pagamento é pela fatura', async () => {
    await withScenario(async (scenario) => {
      const id = await insertSingle(scenario, {
        paymentMethod: 'credito', cardId: scenario.cardId, paid: true, paymentDate: '2026-10-31', amountPaid: '100.00',
      });
      await assert.rejects(
        () => edit(scenario, id, {
          amount: 100, dueDate: '2026-10-31', paymentMethod: 'credito', cardId: scenario.cardId, paid: true, paymentDate: '2026-10-31',
          amountPaid: 100, installmentCount: 3, billingType: 'installments', installmentAmountMode: 'total',
        }),
        /paga no crédito com cartão é paga pela fatura/,
      );
      assert.equal((await rows(scenario)).length, 1);
    });
  });

  test('despesa única recorrente ou ligada à fatura não vira parcelada e nada é gravado', async () => {
    await withScenario(async (scenario) => {
      const recurring = await insertSingle(scenario, { recurring: true });
      await assert.rejects(() => edit(scenario, recurring, { amount: 100, dueDate: '2026-10-31', installmentCount: 3 }), /recorrente não tem nº de parcelas/);
      assert.equal((await rows(scenario)).length, 1);
    });
  });
});
