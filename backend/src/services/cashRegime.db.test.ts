import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import * as dotenv from 'dotenv';
import { eq } from 'drizzle-orm';
import { accounts, categories, expenses, incomeClassifications, incomes, users } from '../db/schema';
import { getMonthYearFromIsoDate } from '../utils/date';
import { expenseCashDateSql, monthRange } from './cashDate';
import { SEM_FILTROS_DESPESA } from './painelCalculos';

// A regra de caixa (cashDate.ts) em todas as telas: o mesmo conjunto de dados dá os mesmos números na lista e
// nos cards de Movimentações, no Painel, nos Relatórios, no Assistente, no Planejamento e na visão geral das
// contas. Só roda pelo script test:finance-db (FINANCE_DB_TESTS=1) e só em banco local; cada teste cria a sua
// pessoa de teste e apaga tudo dela no fim, sem tocar nos dados dos outros.

const LOCAL_DATABASE_URL = /@(localhost|127\.0\.0\.1)(:\d+)?\/[\w-]+$/;

const skipReason = process.env['FINANCE_DB_TESTS'] === '1' ? false : 'teste de banco: rode npm --prefix backend run test:finance-db';

const YEAR = 2026;
const TODAY = '2026-10-19';
const FEB = 1;
const MAR = 2;
const SEP = 8;
const OCT = 9;
const NOV = 10;

// Carregados só depois de conferir que o banco é local: db/client abre a conexão ao ser importado.
async function loadServices() {
  const [client, balance, painel, report, assistant, budget, incomeService, overview, ownerAndAccountWhere] = await Promise.all([
    import('../db/client.js'),
    import('./balanceService.js'),
    import('./painelService.js'),
    import('./reportService.js'),
    import('./assistantQueries.js'),
    import('./budgetService.js'),
    import('./incomeService.js'),
    import('./accountsOverview.js'),
    import('../utils/ownerAndAccountWhere.js'),
  ]);
  return { client, balance, painel, report, assistant, budget, incomeService, overview, ownerAndAccountWhere };
}

let services: Awaited<ReturnType<typeof loadServices>>;

interface Scenario {
  userId: number;
  accountId: number;
  categoryId: number;
  classificationId: number;
}

/** Pessoa de teste com conta pessoal, categoria e classificação; tudo dela é apagado ao fim do teste. */
async function withScenario(work: (scenario: Scenario) => Promise<void>): Promise<void> {
  const { db } = services.client;
  const [user] = await db
    .insert(users)
    .values({ name: 'Teste regra de caixa', email: `caixa-${randomUUID()}@exemplo.test`, password: 'teste' })
    .returning({ id: users.id });
  const userId = user!.id;
  try {
    const [account] = await db
      .insert(accounts)
      .values({ userId, name: 'Pessoal', type: 'pessoal', isDefault: true })
      .returning({ id: accounts.id });
    const [category] = await db
      .insert(categories)
      .values({ userId, name: 'Geral', type: 'pessoal' })
      .returning({ id: categories.id });
    const [classification] = await db
      .insert(incomeClassifications)
      .values({ userId, name: 'Geral', type: 'pessoal' })
      .returning({ id: incomeClassifications.id });
    await work({ userId, accountId: account!.id, categoryId: category!.id, classificationId: classification!.id });
  } finally {
    await db.delete(expenses).where(eq(expenses.userId, userId));
    await db.delete(incomes).where(eq(incomes.userId, userId));
    await db.delete(categories).where(eq(categories.userId, userId));
    await db.delete(incomeClassifications).where(eq(incomeClassifications.userId, userId));
    await db.delete(accounts).where(eq(accounts.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }
}

const money = (value: number) => value.toFixed(2);

async function addExpense(
  scenario: Scenario,
  description: string,
  dueDate: string,
  amount: number,
  payment: { date: string; amount: number } | null,
): Promise<number> {
  const { mes, ano } = getMonthYearFromIsoDate(dueDate);
  const [row] = await services.client.db
    .insert(expenses)
    .values({
      userId: scenario.userId,
      accountId: scenario.accountId,
      categoryId: scenario.categoryId,
      description,
      dueDate,
      paymentDate: payment?.date ?? null,
      month: mes,
      year: ano,
      originalAmount: money(amount),
      amountPaid: payment ? money(payment.amount) : null,
      paid: payment !== null,
    })
    .returning({ id: expenses.id });
  return row!.id;
}

async function addIncome(
  scenario: Scenario,
  description: string,
  receiptDate: string,
  amount: number,
  status: 'ativa' | 'prevista',
): Promise<number> {
  const { mes, ano } = getMonthYearFromIsoDate(receiptDate);
  const [row] = await services.client.db
    .insert(incomes)
    .values({
      userId: scenario.userId,
      accountId: scenario.accountId,
      description,
      netAmount: money(amount),
      grossAmount: money(amount),
      receiptDate,
      month: mes,
      year: ano,
      status,
      classificationId: scenario.classificationId,
    })
    .returning({ id: incomes.id });
  return row!.id;
}

/**
 * Despesas: E5 de fevereiro paga no dia; E1 de março (R$ 400) paga em 19/10 com R$ 450; E2 de setembro em aberto;
 * E3 de novembro paga adiantada em 15/10; E4 de outubro em aberto. Receitas: R3 de fevereiro e R2 de outubro
 * recebidas; R1 de março ainda prevista (R$ 1.000).
 */
async function seedCashScenario(scenario: Scenario): Promise<{ predictedIncomeId: number }> {
  await addExpense(scenario, 'E5 fev paga no dia', '2026-02-10', 150, { date: '2026-02-10', amount: 150 });
  await addExpense(scenario, 'E1 mar paga em out com juros', '2026-03-20', 400, { date: '2026-10-19', amount: 450 });
  await addExpense(scenario, 'E2 set em aberto', '2026-09-10', 200, null);
  await addExpense(scenario, 'E3 nov paga adiantada em out', '2026-11-05', 300, { date: '2026-10-15', amount: 300 });
  await addExpense(scenario, 'E4 out em aberto', '2026-10-25', 100, null);
  await addIncome(scenario, 'R3 recebida em fev', '2026-02-05', 800, 'ativa');
  await addIncome(scenario, 'R2 recebida em out', '2026-10-05', 500, 'ativa');
  const predictedIncomeId = await addIncome(scenario, 'R1 prevista de mar', '2026-03-10', 1000, 'prevista');
  return { predictedIncomeId };
}

interface MonthFigures {
  previous: number;
  incomes: number;
  expenses: number;
  final: number;
}

async function cards(scenario: Scenario, month: number): Promise<MonthFigures> {
  const breakdown = await services.balance.calculateBalanceBreakdown(scenario.userId, YEAR, month, scenario.accountId);
  return {
    previous: breakdown.previousBalance,
    incomes: breakdown.totalIncomes,
    expenses: breakdown.totalExpenses,
    final: breakdown.finalBalance,
  };
}

/** Descrições (só a sigla, E1..E5 / R1..R4) das linhas que a lista de Movimentações mostra no mês. */
async function listedEntries(scenario: Scenario, month: number): Promise<{ expenses: string[]; incomes: string[] }> {
  const { pool } = services.client;
  const { buildOwnerAndAccountWhere } = services.ownerAndAccountWhere;
  const expenseWhere = await buildOwnerAndAccountWhere(
    scenario.userId, 'user', undefined, String(month), String(YEAR), String(scenario.accountId), 'd',
    undefined, undefined, expenseCashDateSql('d'),
  );
  const incomeWhere = await buildOwnerAndAccountWhere(
    scenario.userId, 'user', undefined, String(month), String(YEAR), String(scenario.accountId), 'r',
  );
  const [expenseRows, incomeRows] = await Promise.all([
    pool.query<{ descricao: string }>(`SELECT d.descricao FROM despesas d ${expenseWhere.where} ORDER BY d.descricao`, expenseWhere.params),
    pool.query<{ descricao: string }>(
      `SELECT r.descricao FROM receitas r ${incomeWhere.where} AND r.status = 'ativa' ORDER BY r.descricao`,
      incomeWhere.params,
    ),
  ]);
  const initials = (rows: Array<{ descricao: string }>) => rows.map((row) => row.descricao.split(' ')[0]!);
  return { expenses: initials(expenseRows.rows), incomes: initials(incomeRows.rows) };
}

describe('regra de caixa em todas as telas (banco local)', { skip: skipReason }, () => {
  before(async () => {
    if (process.env['DOTENV_CONFIG_PATH']) {
      dotenv.config({ path: process.env['DOTENV_CONFIG_PATH'] });
    }
    if (!LOCAL_DATABASE_URL.test(process.env['DATABASE_URL'] ?? '')) {
      throw new Error('Os testes de banco só rodam em banco local (localhost ou 127.0.0.1).');
    }
    services = await loadServices();
  });

  after(async () => {
    await services?.client.pool.end();
  });

  test('as seis telas dão os mesmos números em cada mês, depois de confirmar a receita prevista', async () => {
    await withScenario(async (scenario) => {
      const { predictedIncomeId } = await seedCashScenario(scenario);
      const received = await services.incomeService.receiveIncome(
        scenario.userId, predictedIncomeId, { receivedDate: null, receivedAmount: null }, TODAY,
      );
      assert.equal(received?.receiptDate, TODAY);

      const expected: Array<[string, number, MonthFigures]> = [
        ['fevereiro', FEB, { previous: 0, incomes: 800, expenses: 150, final: 650 }],
        ['março', MAR, { previous: 650, incomes: 0, expenses: 0, final: 650 }],
        ['setembro', SEP, { previous: 650, incomes: 0, expenses: 200, final: 450 }],
        ['outubro', OCT, { previous: 450, incomes: 1500, expenses: 850, final: 1100 }],
        ['novembro', NOV, { previous: 1100, incomes: 0, expenses: 0, final: 1100 }],
      ];
      const account = { id: scenario.accountId, type: 'pessoal' as const, name: 'Pessoal' };
      const noFilters = { types: [], expenseStatuses: [], categoryIds: [], paymentMethods: [], cardIds: [], paymentDates: [] };

      for (const [name, month, figures] of expected) {
        const { start, end } = monthRange(month, YEAR);
        const sameAs = { incomes: figures.incomes, expenses: figures.expenses };

        assert.deepEqual(await cards(scenario, month), figures, `cards de Movimentações em ${name}`);

        const painel = await services.painel.montarPainel({
          solicitanteId: scenario.userId,
          escopo: [scenario.userId],
          filtros: SEM_FILTROS_DESPESA,
          accountId: scenario.accountId,
          tipoConta: 'pessoal',
          periodo: { de: start, ate: end },
          hoje: TODAY,
          podeVerPlanejado: false,
        });
        assert.deepEqual(
          { previous: painel.resumo.saldoAnterior, incomes: painel.resumo.entrou, expenses: painel.resumo.saiu, final: painel.resumo.saldoFinal },
          figures,
          `Painel em ${name}`,
        );

        const report = await services.report.buildReport({
          scope: [scenario.userId], accountId: scenario.accountId, period: { start, end }, today: TODAY, filters: noFilters,
        });
        assert.deepEqual({ incomes: report.totals.income, expenses: report.totals.expense }, sameAs, `Relatórios em ${name}`);

        const summary = await services.assistant.resumoPeriodo({ userId: scenario.userId, account }, start, end);
        assert.deepEqual({ incomes: summary.entradas, expenses: summary.saidas }, sameAs, `Assistente em ${name}`);

        const budget = await services.budget.getBudgetOverview({ userId: scenario.userId, accountId: scenario.accountId, month, year: YEAR });
        assert.equal(budget.projectedTotal, figures.expenses, `Planejamento em ${name}`);

        const totals = await services.overview.loadAccountTotals({
          accountIds: [scenario.accountId],
          defaultAccountId: scenario.accountId,
          fallbackAuthorIds: [scenario.userId],
          start,
          end,
          today: TODAY,
        });
        assert.deepEqual(
          { incomes: Number(totals.incomes[0]?.total ?? 0), expenses: Number(totals.expenses[0]?.total ?? 0) },
          sameAs,
          `Visão geral das contas em ${name}`,
        );
      }
    });
  });

  test('a lista do mês traz a despesa paga no mês do pagamento, e a em aberto no mês do vencimento', async () => {
    await withScenario(async (scenario) => {
      const { predictedIncomeId } = await seedCashScenario(scenario);
      await services.incomeService.receiveIncome(scenario.userId, predictedIncomeId, { receivedDate: null, receivedAmount: null }, TODAY);

      assert.deepEqual(await listedEntries(scenario, FEB), { expenses: ['E5'], incomes: ['R3'] });
      // A conta de março foi paga em outubro: sai da lista de março.
      assert.deepEqual(await listedEntries(scenario, MAR), { expenses: [], incomes: [] });
      // Vencida em aberto continua no mês do vencimento até ser paga ou movida.
      assert.deepEqual(await listedEntries(scenario, SEP), { expenses: ['E2'], incomes: [] });
      // Outubro: a de março e a de novembro, pagas no mês, e a que vence em outubro; a receita confirmada em outubro.
      assert.deepEqual(await listedEntries(scenario, OCT), { expenses: ['E1', 'E3', 'E4'], incomes: ['R1', 'R2'] });
      assert.deepEqual(await listedEntries(scenario, NOV), { expenses: [], incomes: [] });
    });
  });

  test('confirmar uma receita prevista de mês fechado não muda os meses fechados', async () => {
    await withScenario(async (scenario) => {
      const { predictedIncomeId } = await seedCashScenario(scenario);
      const closedMonths = [FEB, MAR, SEP];
      const before = await Promise.all(closedMonths.map((month) => cards(scenario, month)));

      const received = await services.incomeService.receiveIncome(
        scenario.userId, predictedIncomeId, { receivedDate: null, receivedAmount: null }, TODAY,
      );
      assert.equal(received?.receiptDate, TODAY);
      assert.equal(received?.month, OCT);
      assert.equal(received?.year, YEAR);

      const after = await Promise.all(closedMonths.map((month) => cards(scenario, month)));
      assert.deepEqual(after, before);
      assert.equal((await cards(scenario, OCT)).incomes, 1500);
    });
  });

  test('confirmar com a data informada leva a receita para o mês dessa data', async () => {
    await withScenario(async (scenario) => {
      const predictedFebruary = await addIncome(scenario, 'R4 prevista de fev', '2026-02-20', 70, 'prevista');
      const before = await Promise.all([FEB, MAR].map((month) => cards(scenario, month)));

      const received = await services.incomeService.receiveIncome(
        scenario.userId, predictedFebruary, { receivedDate: '2026-10-02', receivedAmount: null }, TODAY,
      );
      assert.equal(received?.receiptDate, '2026-10-02');
      assert.equal(received?.month, OCT);

      assert.deepEqual(await Promise.all([FEB, MAR].map((month) => cards(scenario, month))), before);
      assert.equal((await cards(scenario, OCT)).incomes, 70);
    });
  });

  test('receita prevista do mês atual mantém a data prevista ao ser confirmada', async () => {
    await withScenario(async (scenario) => {
      const predictedOctober = await addIncome(scenario, 'R5 prevista de out', '2026-10-25', 300, 'prevista');
      const received = await services.incomeService.receiveIncome(
        scenario.userId, predictedOctober, { receivedDate: null, receivedAmount: null }, TODAY,
      );
      assert.equal(received?.receiptDate, '2026-10-25');
      assert.equal(received?.month, OCT);
      assert.equal((await cards(scenario, OCT)).incomes, 300);
    });
  });
});
