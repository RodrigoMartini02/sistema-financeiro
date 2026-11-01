import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { asc, eq } from 'drizzle-orm';
import { accounts, categories, expenses, incomeClassificationFixes, incomeClassifications, incomes, users } from '../db/schema';
import { RequestInputError } from '../utils/requestInput';
import type { CreateIncomeInput, UpdateIncomeInput } from './incomeInput';
import { assertLocalDatabase, databaseTestsSkipReason } from './financeDbTestSupport';

// Exigem o banco local com a migration 0091 aplicada (colunas novas da fonte e `adiada`). O teste de duas séries na
// mesma categoria muda de comportamento conforme a 0092 esteja ou não aplicada.

async function loadServices() {
  const [client, incomeService, fixed, year] = await Promise.all([
    import('../db/client.js'), import('./incomeService.js'), import('./fixedIncomes.js'), import('./yearService.js'),
  ]);
  return { client, incomeService, fixed, year };
}
let services: Awaited<ReturnType<typeof loadServices>>;
const TODAY = '2026-11-01';

interface Scenario { userId: number; accountId: number; classificationId: number; expenseCategoryId: number }

async function withScenario(work: (scenario: Scenario) => Promise<void>) {
  const { db } = services.client;
  const [user] = await db.insert(users).values({ name: 'Teste receita fixa', email: `receita-fixa-${randomUUID()}@example.test`, password: 'teste' }).returning();
  const userId = user!.id;
  try {
    const [account] = await db.insert(accounts).values({ userId, name: 'Pessoal', type: 'pessoal', isDefault: true }).returning();
    const [classification] = await db.insert(incomeClassifications).values({ userId, name: 'Salário', type: 'pessoal' }).returning();
    const [category] = await db.insert(categories).values({ userId, name: 'Comissão', type: 'pessoal' }).returning();
    await work({ userId, accountId: account!.id, classificationId: classification!.id, expenseCategoryId: category!.id });
  } finally {
    await db.delete(expenses).where(eq(expenses.userId, userId));
    await db.delete(incomes).where(eq(incomes.userId, userId));
    await db.delete(incomeClassificationFixes).where(eq(incomeClassificationFixes.userId, userId));
    await db.delete(categories).where(eq(categories.userId, userId));
    await db.delete(incomeClassifications).where(eq(incomeClassifications.userId, userId));
    await db.delete(accounts).where(eq(accounts.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }
}

function newFixed(scenario: Scenario, patch: Partial<CreateIncomeInput> = {}): CreateIncomeInput {
  return { accountId: scenario.accountId, description: 'Salário', categoryId: scenario.classificationId, grossAmount: 1000, netAmount: 1000,
    receiptDate: '2026-11-10', clientId: null, representativeId: null, attachments: null, repeatUntil: null, productSale: null,
    billableHours: null, billingType: 'fixed', endMonth: '2027-02', received: false, ...patch };
}

function edited(scenario: Scenario, patch: Partial<UpdateIncomeInput> = {}): UpdateIncomeInput {
  return { description: 'Salário', categoryId: scenario.classificationId, grossAmount: 1000, netAmount: 1000, receiptDate: '2026-11-10',
    clientId: null, representativeId: null, attachments: null, ...patch };
}

async function create(scenario: Scenario, patch: Partial<CreateIncomeInput> = {}) {
  return services.incomeService.createIncome(scenario.userId, scenario.userId, newFixed(scenario, patch));
}

async function edit(scenario: Scenario, incomeId: number, patch: Partial<UpdateIncomeInput>) {
  const current = await services.incomeService.findIncomeForUpdate(scenario.userId, incomeId);
  return services.incomeService.updateIncome(scenario.userId, incomeId, current!, edited(scenario, patch), TODAY);
}

async function series(scenario: Scenario) {
  return services.client.db.select().from(incomes).where(eq(incomes.userId, scenario.userId))
    .orderBy(asc(incomes.fixedCompetence), asc(incomes.id));
}

async function sourcesOf(scenario: Scenario) {
  return services.client.db.select().from(incomeClassificationFixes).where(eq(incomeClassificationFixes.userId, scenario.userId))
    .orderBy(asc(incomeClassificationFixes.id));
}

/** A despesa de comissão que uma réplica mensal geraria, ligada à receita. */
async function seedCommission(scenario: Scenario, incomeId: number, paid: boolean) {
  const [commission] = await services.client.db.insert(expenses).values({ userId: scenario.userId, accountId: scenario.accountId,
    categoryId: scenario.expenseCategoryId, description: 'Comissão - Teste', dueDate: '2027-01-10', purchaseDate: '2027-01-10', month: 0,
    year: 2027, originalAmount: '50.00', paymentMethod: 'dinheiro', sourceIncomeId: incomeId,
    ...(paid ? { paid: true, paymentDate: '2026-11-01', amountPaid: '50.00' } : {}) }).returning();
  return commission!;
}

const competencesAndStatus = (rows: Awaited<ReturnType<typeof series>>) => rows.map(row => [row.fixedCompetence, row.status]);
const refusedWith = (status: number) => (error: unknown) => error instanceof RequestInputError && error.status === status;

describe('receitas fixas no lançamento (banco local)', { skip: databaseTestsSkipReason }, () => {
  before(async () => { assertLocalDatabase(); services = await loadServices(); });
  after(async () => { await services.client.pool.end(); });

  test('a atual nasce recebida ou prevista conforme a marcação; as próximas, sempre previstas até o limite inclusivo', async () => {
    await withScenario(async scenario => {
      const first = await create(scenario, { received: true });
      const list = await series(scenario);
      assert.deepEqual(competencesAndStatus(list), [['2026-11-01', 'ativa'], ['2026-12-01', 'prevista'], ['2027-01-01', 'prevista'], ['2027-02-01', 'prevista']]);
      assert.ok(list.every(row => row.fixedClassificationId === first.fixedClassificationId && !row.deferred));
      const [source] = await sourcesOf(scenario);
      assert.equal(source!.id, first.fixedClassificationId);
      assert.equal(source!.endMonth, '2027-02-01');
      assert.equal(source!.referenceDate, '2026-11-10');
    });
    await withScenario(async scenario => {
      await create(scenario, { received: false });
      assert.deepEqual((await series(scenario)).map(row => row.status), ['prevista', 'prevista', 'prevista', 'prevista']);
    });
  });

  test('dia 31 cai no último dia dos meses curtos, sem perder a ancoragem', async () => {
    await withScenario(async scenario => {
      await create(scenario, { receiptDate: '2026-12-31', endMonth: '2027-03' });
      assert.deepEqual((await series(scenario)).map(row => row.receiptDate), ['2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31']);
    });
  });

  test('reduzir apaga as previstas além do limite; excluir à mão cancela; ampliar recria só o que falta', async () => {
    await withScenario(async scenario => {
      const first = await create(scenario, { received: true });
      await edit(scenario, first.id, { endMonth: '2026-12' });
      let list = await series(scenario);
      assert.deepEqual(competencesAndStatus(list), [['2026-11-01', 'ativa'], ['2026-12-01', 'prevista']]);
      assert.equal((await sourcesOf(scenario))[0]!.endMonth, '2026-12-01');
      await services.incomeService.deleteIncome(scenario.userId, list[1]!.id);
      await edit(scenario, first.id, { endMonth: '2027-02' });
      list = await series(scenario);
      assert.deepEqual(competencesAndStatus(list),
        [['2026-11-01', 'ativa'], ['2026-12-01', 'cancelada'], ['2027-01-01', 'prevista'], ['2027-02-01', 'prevista']]);
      assert.equal((await sourcesOf(scenario))[0]!.endMonth, '2027-02-01');
    });
  });

  test('limite antes da própria ocorrência editada é recusado e nada muda', async () => {
    await withScenario(async scenario => {
      await create(scenario);
      const december = (await series(scenario))[1]!;
      await assert.rejects(edit(scenario, december.id, { receiptDate: december.receiptDate, endMonth: '2026-11', description: 'Mudou' }),
        (error: unknown) => error instanceof RequestInputError && /depois do novo limite/.test(error.message));
      const list = await series(scenario);
      assert.equal(list.length, 4);
      assert.ok(list.every(row => row.description === 'Salário'));
      assert.equal((await sourcesOf(scenario))[0]!.endMonth, '2027-02-01');
    });
  });

  test('reduzir cancela a comissão não paga da previsão; comissão já paga impede a redução', async () => {
    await withScenario(async scenario => {
      const first = await create(scenario, { received: true });
      const january = (await series(scenario)).find(row => row.fixedCompetence === '2027-01-01')!;
      const commission = await seedCommission(scenario, january.id, false);
      await edit(scenario, first.id, { endMonth: '2026-12' });
      const [after] = await services.client.db.select().from(expenses).where(eq(expenses.id, commission.id));
      assert.equal(after!.status, 'cancelada');
      assert.equal(after!.sourceIncomeId, null);
      assert.deepEqual((await series(scenario)).map(row => row.fixedCompetence), ['2026-11-01', '2026-12-01']);
    });
    await withScenario(async scenario => {
      const first = await create(scenario, { received: true });
      const january = (await series(scenario)).find(row => row.fixedCompetence === '2027-01-01')!;
      const commission = await seedCommission(scenario, january.id, true);
      await assert.rejects(edit(scenario, first.id, { endMonth: '2026-12' }), refusedWith(409));
      assert.equal((await series(scenario)).length, 4);
      assert.equal((await sourcesOf(scenario))[0]!.endMonth, '2027-02-01');
      const [after] = await services.client.db.select().from(expenses).where(eq(expenses.id, commission.id));
      assert.equal(after!.status, 'ativa');
      assert.equal(after!.sourceIncomeId, january.id);
    });
  });

  test('editar uma ocorrência não espalha valor, descrição ou data para as demais', async () => {
    await withScenario(async scenario => {
      await create(scenario);
      const december = (await series(scenario))[1]!;
      await edit(scenario, december.id, { receiptDate: '2026-12-12', grossAmount: 1200, netAmount: 1200, description: 'Salário dezembro' });
      const list = await series(scenario);
      assert.deepEqual([list[1]!.netAmount, list[1]!.description, list[1]!.receiptDate, list[1]!.fixedCompetence],
        ['1200.00', 'Salário dezembro', '2026-12-12', '2026-12-01']);
      assert.ok([list[0]!, list[2]!, list[3]!].every(row => row.netAmount === '1000.00' && row.description === 'Salário'));
    });
  });

  test('Adiar persiste só nas previstas e uma adiada não pode ser confirmada', async () => {
    await withScenario(async scenario => {
      await create(scenario, { received: true });
      const [current, december, january] = await series(scenario);
      await services.fixed.deferIncomes(scenario.userId, scenario.accountId, [december!.id, january!.id], true);
      assert.deepEqual((await series(scenario)).map(row => row.deferred), [false, true, true, false]);
      await assert.rejects(services.incomeService.receiveIncome(scenario.userId, december!.id, { receivedDate: null, receivedAmount: null }, TODAY),
        refusedWith(409));
      assert.equal((await series(scenario))[1]!.status, 'prevista');
      await assert.rejects(services.fixed.deferIncomes(scenario.userId, scenario.accountId, [current!.id], true), refusedWith(409));
      await assert.rejects(services.fixed.deferIncomes(scenario.userId, scenario.accountId, [987_654_321], true), refusedWith(404));
      await services.fixed.deferIncomes(scenario.userId, scenario.accountId, [december!.id], false);
      const received = await services.incomeService.receiveIncome(scenario.userId, december!.id,
        { receivedDate: '2026-12-10', receivedAmount: null }, '2026-12-10');
      assert.equal(received!.status, 'ativa');
      await assert.rejects(services.fixed.deferIncomes(scenario.userId, scenario.accountId, [december!.id], true), refusedWith(409));
    });
  });

  test('confirmar pela lista edita e recebe no mesmo ID, sem espalhar o valor', async () => {
    await withScenario(async scenario => {
      await create(scenario);
      const december = (await series(scenario))[1]!;
      const received = await services.incomeService.receiveIncome(scenario.userId, december.id, {
        receivedDate: null, receivedAmount: null,
        changes: edited(scenario, { description: 'Salário confirmado', grossAmount: 1100, netAmount: 1100, receiptDate: '2026-12-05' }),
      }, '2026-12-05');
      assert.deepEqual([received!.id, received!.status, received!.netAmount, received!.receiptDate, received!.month, received!.year],
        [december.id, 'ativa', '1100.00', '2026-12-05', 11, 2026]);
      const list = await series(scenario);
      assert.equal(list.length, 4);
      assert.ok([list[0]!, list[2]!, list[3]!].every(row => row.status === 'prevista' && row.netAmount === '1000.00'));
    });
  });

  test('pendências do mês: previstas a partir da data, com as adiadas, só da pessoa e da conta', async () => {
    await withScenario(async scenario => {
      await withScenario(async other => {
        await create(scenario);
        await create(other);
        assert.deepEqual(await services.fixed.listPendingIncomes(scenario.userId, scenario.accountId, '2026-11', '2026-11-09'), []);
        const pending = await services.fixed.listPendingIncomes(scenario.userId, scenario.accountId, '2026-11', '2026-11-10');
        assert.equal(pending.length, 1);
        assert.deepEqual([pending[0]!.userId, pending[0]!.endMonth, pending[0]!.deferred], [scenario.userId, '2027-02', false]);
        await services.fixed.deferIncomes(scenario.userId, scenario.accountId, [pending[0]!.id], true);
        const deferred = await services.fixed.listPendingIncomes(scenario.userId, scenario.accountId, '2026-11', '2026-11-30');
        assert.deepEqual(deferred.map(row => row.deferred), [true]);
        assert.deepEqual(await services.fixed.listPendingIncomes(scenario.userId, scenario.accountId, '2026-12', '2026-11-30'), []);
      });
    });
  });

  test('duas séries na mesma categoria são aceitas e ficam independentes (exige a 0092)', async () => {
    await withScenario(async scenario => {
      await create(scenario);
      await create(scenario, { description: 'Bônus', receiptDate: '2026-11-20', endMonth: '2026-12' });
      const sources = await sourcesOf(scenario);
      assert.equal(sources.length, 2);
      const list = await series(scenario);
      assert.equal(list.filter(row => row.fixedClassificationId === sources[0]!.id).length, 4);
      assert.equal(list.filter(row => row.fixedClassificationId === sources[1]!.id).length, 2);
    });
  });

  test('excluir um ano cancela as fixas do ano, preserva o seguinte e apaga as comuns', async () => {
    await withScenario(async scenario => {
      await create(scenario);
      await create(scenario, { billingType: 'single', endMonth: null, description: 'Avulsa', receiptDate: '2026-11-20' });
      await services.year.deleteUserYear(scenario.userId, 2026);
      assert.deepEqual((await series(scenario)).map(row => [row.description, row.fixedCompetence, row.status]), [
        ['Salário', '2026-11-01', 'cancelada'], ['Salário', '2026-12-01', 'cancelada'],
        ['Salário', '2027-01-01', 'prevista'], ['Salário', '2027-02-01', 'prevista'],
      ]);
    });
  });
});
