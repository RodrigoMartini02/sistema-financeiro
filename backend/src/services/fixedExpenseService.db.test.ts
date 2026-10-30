import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { and, asc, eq } from 'drizzle-orm';
import { accounts, cards, categories, expenses, fixedExpenses, invoicePayments, users, years } from '../db/schema';
import type { FixedExpenseInput } from './fixedExpenseInput';
import type { UpdateExpenseInput } from './expenseInput';
import { assertLocalDatabase, databaseTestsSkipReason } from './financeDbTestSupport';

async function loadServices() {
  const [client, fixed, panel, limits, invoices, year] = await Promise.all([
    import('../db/client.js'), import('./fixedExpenseService.js'), import('./painelService.js'),
    import('./cardLimitService.js'), import('./cardInvoiceService.js'), import('./yearService.js'),
  ]);
  return { client, fixed, panel, limits, invoices, year };
}
let services: Awaited<ReturnType<typeof loadServices>>;
const TODAY = '2026-10-30';

interface Scenario { userId: number; accountId: number; categoryId: number; cardId: number }

async function withScenario(work: (scenario: Scenario) => Promise<void>) {
  const { db } = services.client;
  const [user] = await db.insert(users).values({ name: 'Teste fixa', email: `fixa-${randomUUID()}@example.test`, password: 'teste' }).returning();
  const userId = user!.id;
  try {
    const [account] = await db.insert(accounts).values({ userId, name: 'Pessoal', type: 'pessoal', isDefault: true }).returning();
    const [parent] = await db.insert(categories).values({ userId, name: 'Moradia', type: 'pessoal' }).returning();
    const [category] = await db.insert(categories).values({ userId, name: 'Energia', type: 'pessoal', parentId: parent!.id }).returning();
    const [card] = await db.insert(cards).values({ userId, accountId: account!.id, name: 'Cartão', type: 'credito',
      limit: '3000.00', closingDay: 2, dueDay: 9, active: true }).returning();
    await work({ userId, accountId: account!.id, categoryId: category!.id, cardId: card!.id });
  } finally {
    await db.delete(expenses).where(eq(expenses.userId, userId));
    await db.delete(fixedExpenses).where(eq(fixedExpenses.userId, userId));
    await db.delete(invoicePayments).where(eq(invoicePayments.userId, userId));
    await db.delete(cards).where(eq(cards.userId, userId));
    await db.delete(categories).where(eq(categories.userId, userId));
    await db.delete(years).where(eq(years.userId, userId));
    await db.delete(accounts).where(eq(accounts.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }
}

function sourceInput(scenario: Scenario, patch: Partial<FixedExpenseInput> = {}): FixedExpenseInput {
  return { accountId: scenario.accountId, description: 'Energia', categoryId: scenario.categoryId, amount: 100,
    paymentMethod: 'pix', cardId: null, purchaseDate: '2026-10-30', dueDate: '2026-11-10', firstMonth: '2026-11',
    sourceExpenseId: null, ...patch };
}

function confirmation(scenario: Scenario, patch: Partial<UpdateExpenseInput> = {}): UpdateExpenseInput {
  return { description: 'Energia', categoryId: scenario.categoryId, amount: 120, paymentMethod: 'pix', cardId: null,
    purchaseDate: '2026-10-30', dueDate: '2026-11-10', paid: false, paymentDate: null, amountPaid: null,
    invoiceNumber: null, invoiceDate: null, attachments: null, applyTo: 'this', cashPrice: null, installmentCount: null, ...patch };
}

async function rows(scenario: Scenario) {
  return services.client.db.select().from(expenses).where(and(eq(expenses.userId, scenario.userId), eq(expenses.accountId, scenario.accountId)))
    .orderBy(asc(expenses.fixedCompetence), asc(expenses.id));
}

describe('despesas fixas e confirmação de previsão (banco local)', { skip: databaseTestsSkipReason }, () => {
  before(async () => { assertLocalDatabase(); services = await loadServices(); });
  after(async () => { await services.client.pool.end(); });

  test('cadastro gera primeiro mês e dezembro previstos sem pagamento', async () => {
    await withScenario(async scenario => {
      const source = await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario));
      const list = await rows(scenario);
      assert.deepEqual(list.map(row => row.fixedCompetence), ['2026-11-01', '2026-12-01']);
      assert.ok(list.every(row => row.fixedExpenseId === source.id && row.status === 'prevista' && !row.paid && !row.recurring && !row.installment));
      assert.ok(list.every(row => row.amountPaid === null && row.paymentDate === null && row.estimatedAmount === '100.00'));
      assert.equal((await services.fixed.listPendingFixedExpenses(scenario.userId, scenario.accountId, '2026-11')).length, 1);
    });
  });

  test('confirmar uma ocorrência preserva ID, estimativa e outro mês', async () => {
    await withScenario(async scenario => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario));
      const before = await rows(scenario);
      const updated = await services.fixed.writeFixedOccurrence(scenario.userId, before[0]!.id, confirmation(scenario), true, TODAY);
      assert.equal(updated.id, before[0]!.id);
      assert.equal(updated.status, 'ativa');
      assert.equal(updated.originalAmount, '120.00');
      assert.equal(updated.estimatedAmount, '100.00');
      assert.equal(updated.paid, false);
      assert.equal((await rows(scenario))[1]!.originalAmount, '100.00');
      assert.equal((await services.fixed.listPendingFixedExpenses(scenario.userId, scenario.accountId, '2026-11')).length, 0);
    });
  });

  test('previsão vencida editada não é confirmada nem paga por inferência', async () => {
    await withScenario(async scenario => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario, { firstMonth: '2026-10', dueDate: '2026-10-05' }));
      const [row] = await rows(scenario);
      const edited = await services.fixed.writeFixedOccurrence(scenario.userId, row!.id, confirmation(scenario, { dueDate: '2026-10-05' }), false, TODAY);
      assert.equal(edited.status, 'prevista');
      assert.equal(edited.paid, false);
      const confirmed = await services.fixed.writeFixedOccurrence(scenario.userId, row!.id, confirmation(scenario, { dueDate: '2026-10-05' }), true, TODAY);
      assert.equal(confirmed.paid, false);
      assert.equal(confirmed.paymentDate, null);
    });
  });

  test('pagamento junto à confirmação é explícito; edição de previsão não aceita pagamento', async () => {
    await withScenario(async scenario => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario));
      const [row] = await rows(scenario);
      const paid = confirmation(scenario, { paid: true, paymentDate: '2026-10-30', amountPaid: 115 });
      await assert.rejects(() => services.fixed.writeFixedOccurrence(scenario.userId, row!.id, paid, false, TODAY), /Confirme a previsão/);
      const updated = await services.fixed.writeFixedOccurrence(scenario.userId, row!.id, paid, true, TODAY);
      assert.equal(updated.paid, true);
      assert.equal(updated.amountPaid, '115.00');
      assert.equal(updated.paymentDate, '2026-10-30');
    });
  });

  test('duas confirmações concorrentes preservam uma única ocorrência e não sobrescrevem', async () => {
    await withScenario(async scenario => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario));
      const [row] = await rows(scenario);
      const results = await Promise.allSettled([110, 130].map(amount =>
        services.fixed.writeFixedOccurrence(scenario.userId, row!.id, confirmation(scenario, { amount }), true, TODAY)));
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(results.filter(result => result.status === 'rejected').length, 1);
      const list = await rows(scenario);
      assert.equal(list.length, 2);
      assert.ok(['110.00', '130.00'].includes(list[0]!.originalAmount!));
      await assert.rejects(() => services.fixed.writeFixedOccurrence(scenario.userId, row!.id, confirmation(scenario), true, TODAY), /já foi confirmada/);
    });
  });

  test('retirar mantém competência ocupada e renovação repetida não ressuscita', async () => {
    await withScenario(async scenario => {
      const source = await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario));
      const [row] = await rows(scenario);
      await services.fixed.cancelFixedOccurrence(scenario.userId, row!.id);
      await services.fixed.renewFixedExpense(scenario.userId, source.id, 2026);
      let list = await rows(scenario);
      assert.equal(list.length, 2);
      assert.equal(list[0]!.status, 'cancelada');
      await services.fixed.renewFixedExpense(scenario.userId, source.id, 2027);
      await services.fixed.renewFixedExpense(scenario.userId, source.id, 2027);
      list = await rows(scenario);
      assert.equal(list.length, 14);
      assert.equal(new Set(list.map(item => item.fixedCompetence)).size, 14);
    });
  });

  test('editar fonte só altera futuras pendentes; desativar preserva confirmadas', async () => {
    await withScenario(async scenario => {
      const input = sourceInput(scenario);
      const source = await services.fixed.createFixedExpense(scenario.userId, input);
      const [first] = await rows(scenario);
      await services.fixed.writeFixedOccurrence(scenario.userId, first!.id, confirmation(scenario), true, TODAY);
      await services.fixed.updateFixedExpense(scenario.userId, source.id, { ...input, amount: 150, applyToFuture: false }, TODAY);
      assert.equal((await rows(scenario))[1]!.originalAmount, '100.00');
      await services.fixed.updateFixedExpense(scenario.userId, source.id, { ...input, amount: 150, applyToFuture: true }, TODAY);
      let list = await rows(scenario);
      assert.deepEqual(list.map(item => item.originalAmount), ['120.00', '150.00']);
      await services.fixed.deactivateFixedExpense(scenario.userId, source.id, TODAY);
      list = await rows(scenario);
      assert.deepEqual(list.map(item => item.status), ['ativa', 'cancelada']);
      await assert.rejects(() => services.fixed.renewFixedExpense(scenario.userId, source.id, 2027), /desativada/);
    });
  });

  test('excluir ano retira fixas sem liberar competências nem afetar outro ano ou usuário', async () => {
    await withScenario(async scenario => withScenario(async other => {
      const { db } = services.client;
      const source = await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario));
      await services.fixed.createFixedExpense(other.userId, sourceInput(other));
      const [first, second] = await rows(scenario);
      await services.fixed.cancelFixedOccurrence(scenario.userId, first!.id);
      await services.fixed.writeFixedOccurrence(scenario.userId, second!.id, confirmation(scenario, {
        dueDate: '2026-12-10', paid: true, paymentDate: '2026-12-10', amountPaid: 120,
      }), true, TODAY);
      await services.fixed.renewFixedExpense(scenario.userId, source.id, 2027);
      const [ordinary] = await db.insert(expenses).values({
        userId: scenario.userId, accountId: scenario.accountId, categoryId: scenario.categoryId,
        description: 'Avulsa', originalAmount: '20.00', dueDate: '2026-11-05', month: 10, year: 2026,
      }).returning();
      await db.insert(years).values({ userId: scenario.userId, year: 2026 });

      await services.year.deleteUserYear(scenario.userId, 2026);
      await services.fixed.renewFixedExpense(scenario.userId, source.id, 2027);

      const list = await rows(scenario);
      assert.equal(list.length, 14);
      assert.ok(!list.some(row => row.id === ordinary!.id));
      assert.deepEqual(list.slice(0, 2).map(row => [row.id, row.status]), [
        [first!.id, 'cancelada'], [second!.id, 'cancelada'],
      ]);
      assert.ok(list.slice(2).every(row => row.status === 'prevista' && row.year === 2027));
      assert.ok((await rows(other)).every(row => row.status === 'prevista'));
      assert.equal((await db.select().from(years).where(eq(years.userId, scenario.userId))).length, 0);
    }));
  });

  test('renovar o mesmo ano excluído não ressuscita previsões retiradas', async () => {
    await withScenario(async scenario => {
      const source = await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario));
      const before = await rows(scenario);
      await services.year.deleteUserYear(scenario.userId, 2026);
      await services.fixed.renewFixedExpense(scenario.userId, source.id, 2026);
      assert.deepEqual((await rows(scenario)).map(row => [row.id, row.status]),
        before.map(row => [row.id, 'cancelada']));
    });
  });

  test('conversão de única preserva lançamento pago e prevê somente seguintes', async () => {
    await withScenario(async scenario => {
      const [original] = await services.client.db.insert(expenses).values({
        userId: scenario.userId, accountId: scenario.accountId, categoryId: scenario.categoryId, description: 'Aluguel existente',
        originalAmount: '90.00', dueDate: '2026-11-10', purchaseDate: '2026-11-01', month: 10, year: 2026,
        paid: true, paymentDate: '2026-11-01', amountPaid: '85.00', paymentMethod: 'pix',
      }).returning();
      const source = await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario, { sourceExpenseId: original!.id }));
      const list = await rows(scenario);
      assert.equal(list.length, 2);
      assert.equal(list[0]!.id, original!.id);
      assert.equal(list[0]!.fixedExpenseId, source.id);
      assert.equal(list[0]!.originalAmount, '90.00');
      assert.equal(list[0]!.amountPaid, '85.00');
      assert.equal(list[0]!.paid, true);
      assert.equal(list[1]!.status, 'prevista');
      await assert.rejects(() => services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario, { sourceExpenseId: original!.id })), /já pertence/);
    });
  });

  test('mover mantém competência e não retira a previsão do mês identificado', async () => {
    await withScenario(async scenario => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario));
      const [row] = await rows(scenario);
      const moved = await services.fixed.moveFixedOccurrence(scenario.userId, row!.id);
      assert.equal(moved.fixedCompetence, '2026-11-01');
      assert.equal(moved.dueDate, '2026-12-10');
      assert.equal(moved.status, 'prevista');
      assert.equal((await services.fixed.listPendingFixedExpenses(scenario.userId, scenario.accountId, '2026-11'))[0]!.id, row!.id);
    });
  });

  test('conta alheia, confirmação alheia e categoria/cartão desativados são recusados', async () => {
    await withScenario(async scenario => withScenario(async other => {
      const source = await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario));
      const [row] = await rows(scenario);
      await assert.rejects(() => services.fixed.listFixedExpenses(other.userId, scenario.accountId), /Conta não encontrada/);
      await assert.rejects(() => services.fixed.writeFixedOccurrence(other.userId, row!.id, confirmation(scenario), true, TODAY), /não encontrada/);
      await assert.rejects(() => services.fixed.updateFixedExpense(other.userId, source.id, { ...sourceInput(scenario), applyToFuture: true }, TODAY));
      await services.client.db.update(categories).set({ ativo: false }).where(eq(categories.id, scenario.categoryId));
      await assert.rejects(() => services.fixed.writeFixedOccurrence(scenario.userId, row!.id, confirmation(scenario), true, TODAY), /Categoria indisponível/);
      await services.client.db.update(categories).set({ ativo: true }).where(eq(categories.id, scenario.categoryId));
      await services.client.db.update(cards).set({ active: false }).where(eq(cards.id, scenario.cardId));
      await assert.rejects(() => services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario, { paymentMethod: 'credito', cardId: scenario.cardId })), /Cartão indisponível/);
    }));
  });

  test('previsões no crédito não ocupam limite nem fatura; confirmação passa a ocupar', async () => {
    await withScenario(async scenario => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario, { paymentMethod: 'credito', cardId: scenario.cardId, dueDate: '2026-11-09' }));
      const [row] = await rows(scenario);
      assert.equal((await services.limits.getCardLimits(scenario.userId, scenario.accountId, false))[0]!.usado, 0);
      assert.equal((await services.invoices.getCardInvoice(scenario.userId, scenario.cardId, '2026-11-01'))!.openTotal, 0);
      await assert.rejects(() => services.fixed.writeFixedOccurrence(scenario.userId, row!.id,
        confirmation(scenario, { paymentMethod: 'credito', cardId: scenario.cardId, paid: true }), true, TODAY), /paga pela fatura/);
      await services.fixed.writeFixedOccurrence(scenario.userId, row!.id,
        confirmation(scenario, { paymentMethod: 'credito', cardId: scenario.cardId, dueDate: '2026-11-09' }), true, TODAY);
      assert.equal((await services.limits.getCardLimits(scenario.userId, scenario.accountId, false))[0]!.usado, 120);
      assert.equal((await services.invoices.getCardInvoice(scenario.userId, scenario.cardId, '2026-11-01'))!.openTotal, 120);
    });
  });

  test('painel projeta 300 e depois 320 sem levar estimativas ao gasto confirmado', async () => {
    await withScenario(async scenario => withScenario(async other => {
      for (let index = 0; index < 3; index++) await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario, { description: `Conta ${index}` }));
      await services.fixed.createFixedExpense(other.userId, sourceInput(other, { amount: 999 }));
      const [anotherAccount] = await services.client.db.insert(accounts).values({ userId: scenario.userId, name: 'Outra pessoal', type: 'pessoal' }).returning();
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario, { accountId: anotherAccount!.id, amount: 888 }));
      const panelInput = { solicitanteId: scenario.userId, escopo: [scenario.userId], accountId: scenario.accountId, tipoConta: 'pessoal' as const,
        filtros: { categoryIds: [], cardIds: [], paymentMethods: [] }, periodo: { de: '2026-11-01', ate: '2026-11-30' }, hoje: TODAY, podeVerPlanejado: false };
      let panel = await services.panel.montarPainel(panelInput);
      assert.equal(panel.expenseProjection.total, 300);
      assert.equal(panel.resumo.saiu, 0);
      const [row] = await rows(scenario);
      await services.fixed.writeFixedOccurrence(scenario.userId, row!.id, confirmation(scenario), true, TODAY);
      panel = await services.panel.montarPainel(panelInput);
      assert.equal(panel.expenseProjection.confirmed, 120);
      assert.equal(panel.expenseProjection.planned, 200);
      assert.equal(panel.expenseProjection.total, 320);
      assert.equal(panel.resumo.saiu, 120);
      await services.client.db.update(expenses).set({ paid: true, paymentDate: '2026-12-04', amountPaid: '130.00' }).where(eq(expenses.id, row!.id));
      panel = await services.panel.montarPainel(panelInput);
      assert.equal(panel.expenseProjection.total, 200);
      assert.equal(panel.expenseProjection.confirmed, 0);
      const december = await services.panel.montarPainel({ ...panelInput, periodo: { de: '2026-12-01', ate: '2026-12-31' } });
      assert.equal(december.expenseProjection.total, 430);
      assert.equal(december.expenseProjection.confirmed, 130);
    }));
  });

  test('confirmar versus pagar fatura respeita a ordem de locks sem perder a compra', async () => {
    await withScenario(async scenario => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario, { paymentMethod: 'credito', cardId: scenario.cardId, dueDate: '2026-11-09' }));
      const [forecast] = await rows(scenario);
      await services.client.db.insert(expenses).values({
        userId: scenario.userId, accountId: scenario.accountId, categoryId: scenario.categoryId, description: 'Compra já confirmada',
        originalAmount: '40.00', dueDate: '2026-11-09', purchaseDate: '2026-10-30', month: 10, year: 2026,
        paymentMethod: 'credito', cardId: scenario.cardId, paid: false,
      });
      await Promise.all([
        services.fixed.writeFixedOccurrence(scenario.userId, forecast!.id,
          confirmation(scenario, { paymentMethod: 'credito', cardId: scenario.cardId, dueDate: '2026-11-09' }), true, TODAY),
        services.invoices.payCardInvoice(scenario.userId, { cardId: scenario.cardId, invoiceMonthStart: '2026-11-01',
          method: 'total', paymentDate: TODAY, amountPaid: null, interestAmount: 0, installmentCount: null }, { payInFull: true }),
      ]);
      const [confirmed] = await services.client.db.select().from(expenses).where(eq(expenses.id, forecast!.id));
      const invoice = await services.invoices.getCardInvoice(scenario.userId, scenario.cardId, '2026-11-01');
      assert.equal(confirmed!.status, 'ativa');
      assert.equal(confirmed!.originalAmount, '120.00');
      assert.equal(invoice!.openTotal, confirmed!.paid ? 0 : 120);
      assert.equal((await rows(scenario)).filter(item => item.fixedCompetence === '2026-11-01').length, 1);
    });
  });

  test('desativação concorrente confirma ou cancela, sem sobrescrever confirmação', async () => {
    await withScenario(async scenario => {
      const source = await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario));
      const [forecast] = await rows(scenario);
      const result = await Promise.allSettled([
        services.fixed.writeFixedOccurrence(scenario.userId, forecast!.id, confirmation(scenario), true, TODAY),
        services.fixed.deactivateFixedExpense(scenario.userId, source.id, TODAY),
      ]);
      assert.equal(result[1]!.status, 'fulfilled');
      const [row] = await services.client.db.select().from(expenses).where(eq(expenses.id, forecast!.id));
      assert.ok(row!.status === 'ativa' || row!.status === 'cancelada');
      if (result[0]!.status === 'fulfilled') {
        assert.equal(row!.status, 'ativa');
        assert.equal(row!.originalAmount, '120.00');
      }
    });
  });
});
