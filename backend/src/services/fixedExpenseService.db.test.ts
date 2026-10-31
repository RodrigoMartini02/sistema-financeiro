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
    paymentMethod: 'pix', cardId: null, purchaseDate: '2026-10-30', dueDate: '2026-11-10', endMonth: '2027-03',
    paid: false, paymentDate: null, amountPaid: null, attachments: null, invoiceNumber: null, invoiceDate: null,
    sourceExpenseId: null, ...patch };
}

function confirmation(scenario: Scenario, patch: Partial<UpdateExpenseInput> = {}): UpdateExpenseInput {
  return { description: 'Energia', categoryId: scenario.categoryId, amount: 120, paymentMethod: 'pix', cardId: null,
    purchaseDate: '2026-11-30', dueDate: '2026-12-10', paid: false, paymentDate: null, amountPaid: null,
    invoiceNumber: null, invoiceDate: null, attachments: null, applyTo: 'this', cashPrice: null, installmentCount: null, ...patch };
}

async function rows(scenario: Scenario) {
  return services.client.db.select().from(expenses).where(and(eq(expenses.userId, scenario.userId), eq(expenses.accountId, scenario.accountId)))
    .orderBy(asc(expenses.fixedCompetence), asc(expenses.id));
}

describe('despesas fixas no lote (banco local)', { skip: databaseTestsSkipReason }, () => {
  before(async () => { assertLocalDatabase(); services = await loadServices(); });
  after(async () => { await services.client.pool.end(); });

  test('primeira fica lançada; próximas previstas até o limite inclusivo entre anos', async () => {
    await withScenario(async scenario => {
      const source = await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario), TODAY);
      const list = await rows(scenario);
      assert.deepEqual(list.map(row => row.fixedCompetence), ['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01']);
      assert.equal(list[0]!.status, 'ativa');
      assert.ok(list.slice(1).every(row => row.status === 'prevista'));
      assert.ok(list.every(row => row.fixedExpenseId === source.id && !row.paid && !row.recurring && !row.installment));
      assert.equal(source.endMonth, '2027-03');
    });
  });

  test('pagamento e comprovantes explícitos ficam apenas na primeira, sem inferir por vencimento', async () => {
    await withScenario(async scenario => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario, {
        dueDate: '2026-10-05', endMonth: '2026-12', paid: true, paymentDate: TODAY, amountPaid: 95,
        invoiceNumber: '123', invoiceDate: TODAY, attachments: [{ name: 'boleto.pdf', url: 'https://example.test/boleto.pdf' }],
      }), TODAY);
      const list = await rows(scenario);
      assert.equal(list[0]!.paid, true);
      assert.equal(list[0]!.amountPaid, '95.00');
      assert.equal(list[0]!.numeroNf, '123');
      assert.ok(list.slice(1).every(row => !row.paid && row.paymentDate === null && row.amountPaid === null
        && row.attachments === null && row.numeroNf === null && row.dataEmissaoNf === null));
    });
    await withScenario(async scenario => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario, { dueDate: '2026-10-05', endMonth: '2026-10' }), TODAY);
      const [first] = await rows(scenario);
      assert.equal(first!.status, 'ativa');
      assert.equal(first!.paid, false);
    });
  });

  test('pendências usam mês de vencimento e compra já chegada, mantendo adiadas visíveis', async () => {
    await withScenario(async scenario => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario), TODAY);
      assert.equal((await services.fixed.listPendingFixedExpenses(scenario.userId, scenario.accountId, '2026-12', '2026-11-29')).length, 0);
      const pending = await services.fixed.listPendingFixedExpenses(scenario.userId, scenario.accountId, '2026-12', '2026-11-30');
      assert.equal(pending.length, 1);
      await services.fixed.deferFixedExpenses(scenario.userId, scenario.accountId, [pending[0]!.id], true);
      const again = await services.fixed.listPendingFixedExpenses(scenario.userId, scenario.accountId, '2026-12', '2026-11-30');
      assert.equal(again[0]!.deferred, true);
      assert.equal(again[0]!.endMonth, '2027-03');
      await services.fixed.moveFixedOccurrence(scenario.userId, pending[0]!.id);
      assert.equal((await services.fixed.listPendingFixedExpenses(scenario.userId, scenario.accountId, '2026-12', '2027-01-01')).length, 0);
      assert.ok((await services.fixed.listPendingFixedExpenses(scenario.userId, scenario.accountId, '2027-01', '2027-01-01'))
        .some(row => row.id === pending[0]!.id && row.fixedCompetence === '2026-12-01'));
    });
  });

  test('adiamento em grupo é atômico, recusa outra conta e não altera as demais', async () => {
    await withScenario(async scenario => withScenario(async other => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario), TODAY);
      await services.fixed.createFixedExpense(other.userId, sourceInput(other), TODAY);
      const list = await rows(scenario);
      const foreign = (await rows(other))[1]!;
      await assert.rejects(() => services.fixed.deferFixedExpenses(scenario.userId, scenario.accountId, [list[1]!.id, foreign.id], true), /não encontrada/);
      assert.ok((await rows(scenario)).every(row => !row.deferred));
      await assert.rejects(() => services.fixed.deferFixedExpenses(scenario.userId, scenario.accountId, [list[0]!.id, list[1]!.id], true), /já foi lançada/);
      assert.ok((await rows(scenario)).every(row => !row.deferred));
      await services.fixed.deferFixedExpenses(scenario.userId, scenario.accountId, list.slice(1).map(row => row.id), true);
      assert.equal((await rows(scenario)).filter(row => row.deferred).length, 4);
      assert.ok((await rows(other)).every(row => !row.deferred));
    }));
  });

  test('adiada não confirma; desmarcada lança pelo mesmo ID e preserva estimativa e outros meses', async () => {
    await withScenario(async scenario => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario), TODAY);
      const list = await rows(scenario);
      const target = list[1]!;
      await services.fixed.deferFixedExpenses(scenario.userId, scenario.accountId, [target.id], true);
      await assert.rejects(() => services.fixed.writeFixedOccurrence(scenario.userId, target.id, confirmation(scenario), true, TODAY), /adiada/);
      await services.fixed.deferFixedExpenses(scenario.userId, scenario.accountId, [target.id], false);
      const updated = await services.fixed.writeFixedOccurrence(scenario.userId, target.id, confirmation(scenario), true, TODAY);
      assert.equal(updated.id, target.id);
      assert.equal(updated.status, 'ativa');
      assert.equal(updated.originalAmount, '120.00');
      assert.equal(updated.estimatedAmount, '100.00');
      assert.equal(updated.paid, false);
      assert.equal((await rows(scenario))[2]!.originalAmount, '100.00');
    });
  });

  test('editar previsão vencida não confirma nem paga por inferência; pagamento exige confirmar', async () => {
    await withScenario(async scenario => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario), TODAY);
      const target = (await rows(scenario))[1]!;
      const edited = await services.fixed.writeFixedOccurrence(scenario.userId, target.id,
        confirmation(scenario, { dueDate: '2026-10-05' }), false, TODAY);
      assert.equal(edited.status, 'prevista');
      assert.equal(edited.paid, false);
      const paid = confirmation(scenario, { paid: true, paymentDate: TODAY, amountPaid: 115 });
      await assert.rejects(() => services.fixed.writeFixedOccurrence(scenario.userId, target.id, paid, false, TODAY), /Confirme a previsão/);
      const confirmed = await services.fixed.writeFixedOccurrence(scenario.userId, target.id, paid, true, TODAY);
      assert.equal(confirmed.amountPaid, '115.00');
      assert.equal(confirmed.paid, true);
    });
  });

  test('confirmações concorrentes e adiamento concorrente não sobrescrevem lançamento', async () => {
    await withScenario(async scenario => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario), TODAY);
      const target = (await rows(scenario))[1]!;
      const results = await Promise.allSettled([110, 130].map(amount =>
        services.fixed.writeFixedOccurrence(scenario.userId, target.id, confirmation(scenario, { amount }), true, TODAY)));
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(results.filter(result => result.status === 'rejected').length, 1);
      const next = (await rows(scenario))[2]!;
      const race = await Promise.allSettled([
        services.fixed.writeFixedOccurrence(scenario.userId, next.id, confirmation(scenario, { dueDate: '2027-01-10' }), true, TODAY),
        services.fixed.deferFixedExpenses(scenario.userId, scenario.accountId, [next.id], true),
      ]);
      assert.equal(race.filter(result => result.status === 'fulfilled').length, 1);
      const saved = (await rows(scenario)).find(row => row.id === next.id)!;
      assert.ok((saved.status === 'ativa' && !saved.deferred) || (saved.status === 'prevista' && saved.deferred));
    });
  });

  test('Até amplia somente ausentes e redução preserva passado, pagas e competências retiradas', async () => {
    await withScenario(async scenario => {
      const { db } = services.client;
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario, { endMonth: '2027-02' }), TODAY);
      let list = await rows(scenario);
      await services.fixed.cancelFixedOccurrence(scenario.userId, list[3]!.id);
      await services.fixed.writeFixedOccurrence(scenario.userId, list[2]!.id,
        confirmation(scenario, { dueDate: '2027-01-10', paid: true, paymentDate: '2027-01-10', amountPaid: 120 }), true, TODAY);
      await services.fixed.writeFixedOccurrence(scenario.userId, list[0]!.id,
        confirmation(scenario, { purchaseDate: '2026-10-30', dueDate: '2026-11-10', amount: 130, endMonth: '2026-11' }), false, '2027-01-01');
      list = await rows(scenario);
      assert.equal(list[0]!.originalAmount, '130.00');
      assert.equal(list[1]!.status, 'prevista');
      assert.equal(list[2]!.status, 'ativa');
      assert.equal(list[2]!.paid, true);
      assert.equal(list[3]!.status, 'cancelada');
      await services.fixed.writeFixedOccurrence(scenario.userId, list[0]!.id,
        confirmation(scenario, { purchaseDate: '2026-10-30', dueDate: '2026-11-10', amount: 130, endMonth: '2027-03' }), false, '2027-01-01');
      list = await rows(scenario);
      assert.equal(list.length, 5);
      assert.equal(list[3]!.status, 'cancelada');
      assert.equal(list[4]!.status, 'prevista');
      assert.equal(list[4]!.originalAmount, '100.00');
      const [source] = await db.select().from(fixedExpenses).where(eq(fixedExpenses.id, list[0]!.fixedExpenseId!));
      assert.equal(source!.endMonth, '2027-03-01');
    });
  });

  test('limite inválido desfaz edição da ocorrência na mesma transação', async () => {
    await withScenario(async scenario => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario), TODAY);
      const list = await rows(scenario);
      await assert.rejects(() => services.fixed.writeFixedOccurrence(scenario.userId, list[0]!.id,
        confirmation(scenario, { amount: 999, dueDate: '2026-11-10', endMonth: '2026-10' }), false, TODAY), /anterior/);
      assert.deepEqual(await rows(scenario), list);
    });
  });

  test('excluir ano conserva identidades e ampliar não ressuscita competências', async () => {
    await withScenario(async scenario => withScenario(async other => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario, { endMonth: '2027-01' }), TODAY);
      await services.fixed.createFixedExpense(other.userId, sourceInput(other), TODAY);
      const before = await rows(scenario);
      await services.client.db.insert(years).values({ userId: scenario.userId, year: 2026 });
      await services.year.deleteUserYear(scenario.userId, 2026);
      const january = (await rows(scenario))[2]!;
      await services.fixed.writeFixedOccurrence(scenario.userId, january.id,
        confirmation(scenario, { dueDate: '2027-01-10', purchaseDate: '2026-12-30', endMonth: '2027-02' }), false, TODAY);
      const list = await rows(scenario);
      assert.equal(list.length, 4);
      assert.deepEqual(list.slice(0, 2).map(row => [row.id, row.status]), before.slice(0, 2).map(row => [row.id, 'cancelada']));
      assert.equal((await services.client.db.select().from(years).where(eq(years.userId, scenario.userId))).length, 0);
      assert.equal((await rows(other))[0]!.status, 'ativa');
    }));
  });

  test('conversão pela edição aplica campos enviados e preserva ID, pagamento e comprovantes explícitos', async () => {
    await withScenario(async scenario => {
      const [original] = await services.client.db.insert(expenses).values({
        userId: scenario.userId, accountId: scenario.accountId, categoryId: scenario.categoryId, description: 'Aluguel antigo',
        originalAmount: '90.00', dueDate: '2026-11-10', purchaseDate: '2026-11-01', month: 10, year: 2026,
        paid: true, paymentDate: '2026-11-01', amountPaid: '85.00', paymentMethod: 'pix',
      }).returning();
      const source = await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario, {
        sourceExpenseId: original!.id, description: 'Aluguel editado', amount: 110, paid: true,
        paymentDate: '2026-11-01', amountPaid: 85, invoiceNumber: '123',
      }), TODAY);
      const list = await rows(scenario);
      assert.equal(list[0]!.id, original!.id);
      assert.equal(list[0]!.fixedExpenseId, source.id);
      assert.equal(list[0]!.description, 'Aluguel editado');
      assert.equal(list[0]!.originalAmount, '110.00');
      assert.equal(list[0]!.amountPaid, '85.00');
      assert.equal(list[0]!.numeroNf, '123');
      assert.ok(list.slice(1).every(row => row.status === 'prevista' && !row.paid && row.numeroNf === null && row.originalAmount === '110.00'));
      await assert.rejects(() => services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario, { sourceExpenseId: original!.id }), TODAY), /já pertence/);
    });
  });

  test('conta alheia, confirmação alheia e categoria/cartão desativados são recusados', async () => {
    await withScenario(async scenario => withScenario(async other => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario), TODAY);
      const target = (await rows(scenario))[1]!;
      await assert.rejects(() => services.fixed.listPendingFixedExpenses(other.userId, scenario.accountId, '2026-12'), /Conta não encontrada/);
      await assert.rejects(() => services.fixed.writeFixedOccurrence(other.userId, target.id, confirmation(scenario), true, TODAY), /não encontrada/);
      await services.client.db.update(categories).set({ ativo: false }).where(eq(categories.id, scenario.categoryId));
      await assert.rejects(() => services.fixed.writeFixedOccurrence(scenario.userId, target.id, confirmation(scenario), true, TODAY), /Categoria indisponível/);
      await services.client.db.update(categories).set({ ativo: true }).where(eq(categories.id, scenario.categoryId));
      await services.client.db.update(cards).set({ active: false }).where(eq(cards.id, scenario.cardId));
      await assert.rejects(() => services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario, { paymentMethod: 'credito', cardId: scenario.cardId }), TODAY), /Cartão indisponível/);
    }));
  });

  test('editar ativa mantém vínculos históricos inativos; confirmar e ampliar continuam estritos', async () => {
    await withScenario(async scenario => {
      const { db } = services.client;
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario, {
        paymentMethod: 'credito', cardId: scenario.cardId, dueDate: '2026-11-09',
      }), TODAY);
      const list = await rows(scenario);
      await db.update(categories).set({ ativo: false }).where(eq(categories.id, scenario.categoryId));
      await db.update(cards).set({ active: false }).where(eq(cards.id, scenario.cardId));
      const edit = confirmation(scenario, { description: 'Descrição corrigida', amount: 100,
        paymentMethod: 'credito', cardId: scenario.cardId, purchaseDate: '2026-10-30', dueDate: '2026-11-09' });
      const saved = await services.fixed.writeFixedOccurrence(scenario.userId, list[0]!.id, edit, false, TODAY);
      assert.equal(saved.description, 'Descrição corrigida');
      assert.equal(saved.categoryId, scenario.categoryId);
      assert.equal(saved.cardId, scenario.cardId);
      await assert.rejects(() => services.fixed.writeFixedOccurrence(scenario.userId, list[1]!.id,
        { ...edit, dueDate: '2026-12-09' }, true, TODAY), /Categoria indisponível/);
      await assert.rejects(() => services.fixed.writeFixedOccurrence(scenario.userId, list[0]!.id,
        { ...edit, endMonth: '2027-04' }, false, TODAY), /Categoria indisponível/);
      await db.update(categories).set({ ativo: true }).where(eq(categories.id, scenario.categoryId));
      await services.fixed.writeFixedOccurrence(scenario.userId, list[0]!.id, { ...edit, description: 'Só cartão inativo' }, false, TODAY);
      await assert.rejects(() => services.fixed.writeFixedOccurrence(scenario.userId, list[1]!.id,
        { ...edit, dueDate: '2026-12-09' }, true, TODAY), /Cartão indisponível/);
      await assert.rejects(() => services.fixed.writeFixedOccurrence(scenario.userId, list[0]!.id,
        { ...edit, endMonth: '2027-04' }, false, TODAY), /Cartão indisponível/);
      const [inactive] = await db.insert(categories).values({ userId: scenario.userId, accountId: scenario.accountId,
        name: 'Categoria antiga', ativo: false }).returning();
      await assert.rejects(() => services.fixed.writeFixedOccurrence(scenario.userId, list[0]!.id,
        { ...edit, categoryId: inactive!.id }, false, TODAY), /Categoria indisponível/);
    });
  });

  test('adiar grupo e encurtar Até travam fonte antes das ocorrências, sem deadlock', { timeout: 10000 }, async () => {
    await withScenario(async scenario => {
      const { db } = services.client;
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario), TODAY);
      const initial = await rows(scenario);
      const first = initial[1]!;
      const second = initial[2]!;
      await services.fixed.moveFixedOccurrence(scenario.userId, first.id);
      assert.equal((await rows(scenario)).find(row => row.id === first.id)!.dueDate, second.dueDate);

      let release!: () => void;
      let locked!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const ready = new Promise<void>(resolve => { locked = resolve; });
      const blocker = db.transaction(async transaction => {
        await transaction.select({ id: expenses.id }).from(expenses)
          .where(and(eq(expenses.id, second.id), eq(expenses.userId, scenario.userId))).for('update');
        locked();
        await gate;
      });
      await ready;
      const editing = Promise.allSettled([services.fixed.writeFixedOccurrence(scenario.userId, second.id,
        confirmation(scenario, { purchaseDate: '2026-12-30', dueDate: second.dueDate, endMonth: '2026-11' }), false, TODAY)]);
      let deferring: Promise<PromiseSettledResult<unknown>[]> | undefined;
      try {
        let sourceLocked = false;
        for (let attempt = 0; attempt < 100 && !sourceLocked; attempt++) {
          try {
            await db.transaction(async transaction => {
              await transaction.select({ id: fixedExpenses.id }).from(fixedExpenses).where(and(
                eq(fixedExpenses.id, second.fixedExpenseId!), eq(fixedExpenses.userId, scenario.userId),
              )).for('update', { noWait: true });
            });
          } catch (error) {
            if (error instanceof Error && 'cause' in error && typeof error.cause === 'object' && error.cause !== null
              && 'code' in error.cause && error.cause.code === '55P03') sourceLocked = true;
            else throw error;
          }
          if (!sourceLocked) await new Promise(resolve => setTimeout(resolve, 5));
        }
        assert.equal(sourceLocked, true, 'o editor precisa ter a fonte antes de esperar pela ocorrência bloqueada');
        deferring = Promise.allSettled([services.fixed.deferFixedExpenses(scenario.userId, scenario.accountId, [first.id, second.id], true)]);
        await new Promise(resolve => setTimeout(resolve, 40));
        release();
        await blocker;
        const [written] = await editing;
        const [deferred] = await deferring;
        assert.equal(written!.status, 'fulfilled');
        assert.equal(deferred!.status, 'rejected');
        assert.equal(deferred!.status === 'rejected' && 'status' in deferred!.reason ? deferred!.reason.status : null, 409);
        const final = await rows(scenario);
        assert.ok(final.filter(row => row.id === first.id || row.id === second.id).every(row => row.status === 'cancelada' && !row.deferred));
      } finally {
        release();
        await blocker;
        await editing;
        if (deferring) await deferring;
      }
    });
  });

  test('somente lançadas ocupam limite/fatura; fixa no crédito não é paga individualmente', async () => {
    await withScenario(async scenario => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario, {
        paymentMethod: 'credito', cardId: scenario.cardId, dueDate: '2026-11-09',
      }), TODAY);
      const list = await rows(scenario);
      assert.equal((await services.limits.getCardLimits(scenario.userId, scenario.accountId, false))[0]!.usado, 100);
      assert.equal((await services.invoices.getCardInvoice(scenario.userId, scenario.cardId, '2026-12-01'))!.openTotal, 0);
      await assert.rejects(() => services.fixed.writeFixedOccurrence(scenario.userId, list[1]!.id,
        confirmation(scenario, { paymentMethod: 'credito', cardId: scenario.cardId, paid: true }), true, TODAY), /paga pela fatura/);
      await services.fixed.writeFixedOccurrence(scenario.userId, list[1]!.id,
        confirmation(scenario, { paymentMethod: 'credito', cardId: scenario.cardId, dueDate: '2026-12-09' }), true, TODAY);
      assert.equal((await services.limits.getCardLimits(scenario.userId, scenario.accountId, false))[0]!.usado, 220);
      assert.equal((await services.invoices.getCardInvoice(scenario.userId, scenario.cardId, '2026-12-01'))!.openTotal, 120);
    });
  });

  test('painel troca previsão por lançamento sem duplicar e adiar não retira a projeção', async () => {
    await withScenario(async scenario => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario), TODAY);
      const target = (await rows(scenario))[1]!;
      const panelInput = { solicitanteId: scenario.userId, escopo: [scenario.userId], accountId: scenario.accountId, tipoConta: 'pessoal' as const,
        filtros: { categoryIds: [], cardIds: [], paymentMethods: [] }, periodo: { de: '2026-12-01', ate: '2026-12-31' }, hoje: TODAY, podeVerPlanejado: false };
      await services.fixed.deferFixedExpenses(scenario.userId, scenario.accountId, [target.id], true);
      let panel = await services.panel.montarPainel(panelInput);
      assert.equal(panel.forecastCount, 1);
      assert.equal(panel.resumo.saiu, 0);
      assert.equal(panel.serie.pontos.reduce((sum, point) => sum + (point.forecast ?? 0), 0), 100);
      await services.fixed.deferFixedExpenses(scenario.userId, scenario.accountId, [target.id], false);
      await services.fixed.writeFixedOccurrence(scenario.userId, target.id, confirmation(scenario), true, TODAY);
      panel = await services.panel.montarPainel(panelInput);
      assert.equal(panel.forecastCount, 0);
      assert.equal(panel.resumo.saiu, 120);
      assert.equal(panel.serie.pontos.reduce((sum, point) => sum + (point.forecast ?? 0), 0), 0);
    });
  });

  test('confirmar versus quitar fatura ou reduzir limite respeita locks e preserva resultado vencedor', async () => {
    await withScenario(async scenario => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario, { paymentMethod: 'credito', cardId: scenario.cardId, dueDate: '2026-11-09' }), TODAY);
      const target = (await rows(scenario))[1]!;
      await services.client.db.insert(expenses).values({
        userId: scenario.userId, accountId: scenario.accountId, categoryId: scenario.categoryId, description: 'Compra confirmada',
        originalAmount: '40.00', dueDate: '2026-12-09', purchaseDate: '2026-11-30', month: 11, year: 2026,
        paymentMethod: 'credito', cardId: scenario.cardId, paid: false,
      });
      await Promise.all([
        services.fixed.writeFixedOccurrence(scenario.userId, target.id,
          confirmation(scenario, { paymentMethod: 'credito', cardId: scenario.cardId, dueDate: '2026-12-09' }), true, TODAY),
        services.invoices.payCardInvoice(scenario.userId, { cardId: scenario.cardId, invoiceMonthStart: '2026-12-01',
          method: 'total', paymentDate: TODAY, amountPaid: null, interestAmount: 0, installmentCount: null }, { payInFull: true }),
      ]);
      const saved = (await rows(scenario)).find(row => row.id === target.id)!;
      assert.equal(saved.status, 'ativa');
      assert.equal((await services.invoices.getCardInvoice(scenario.userId, scenario.cardId, '2026-12-01'))!.openTotal, saved.paid ? 0 : 120);
    });
    await withScenario(async scenario => {
      await services.fixed.createFixedExpense(scenario.userId, sourceInput(scenario), TODAY);
      const list = await rows(scenario);
      const race = await Promise.allSettled([
        services.fixed.writeFixedOccurrence(scenario.userId, list[1]!.id, confirmation(scenario), true, TODAY),
        services.fixed.writeFixedOccurrence(scenario.userId, list[0]!.id,
          confirmation(scenario, { dueDate: '2026-11-10', purchaseDate: '2026-10-30', endMonth: '2026-11' }), false, TODAY),
      ]);
      assert.equal(race[1]!.status, 'fulfilled');
      const saved = (await rows(scenario))[1]!;
      assert.equal(saved.status, race[0]!.status === 'fulfilled' ? 'ativa' : 'cancelada');
    });
  });
});
