import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { and, eq, sql } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { closeLocalTestDatabase, createTestAccount, databaseTestsSkipReason, withRollback } from '../collector/dbTestSupport';
import { tenderBillingHistory, tenderEnabledAccounts } from '../db/schema';
import { isAccountMember, resolveTenderAccess } from './access';
import { addAccountMember, addOwnedAccount } from './apiTestSupport';
import { addDays, PAID_PERIOD_DAYS, TRIAL_DAYS } from './billing';
import { BILLING_HISTORY_LIMIT, listBillingEvents, recordRefusedPayment, type PaymentDetails } from './billingHistory';
import {
  applyOneTimePayment,
  applyRecurringCharge,
  clearRecurring,
  parseDbTimestamp,
  readModuleRow,
  setRecurring,
  startTenderTrial,
} from './subscription';

// Assinatura do módulo: a regra de acesso da função licitacoes.fn_conta_com_acesso,
// o teste e os pagamentos.

const ONE_MINUTE_MS = 60_000;

/** O que o Mercado Pago informa de um Pix e de um cartão de R$ 4,99 (o mês de 1 a 2 usuários). */
const PIX_PAYMENT: PaymentDetails = { amountCents: 499, method: 'PIX' };
const CARD_PAYMENT: PaymentDetails = { amountCents: 499, method: 'CARTAO' };

/** O erro do banco sem a tabela do histórico: a consulta que falhou cita o nome dela. */
const HISTORY_TABLE_ERROR = /cobranca_historico/;

async function setModule(tx: TendersDb, accountId: number, values: Partial<typeof tenderEnabledAccounts.$inferInsert>): Promise<void> {
  await tx.update(tenderEnabledAccounts).set(values).where(eq(tenderEnabledAccounts.accountId, accountId));
}

function closeTo(actual: Date | null, expected: Date, message: string): void {
  assert.ok(actual, message);
  assert.ok(Math.abs(actual.getTime() - expected.getTime()) < ONE_MINUTE_MS, `${message}: ${actual.toISOString()} × ${expected.toISOString()}`);
}

describe('assinatura de Licitações (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('acesso: cortesia, teste, período pago e recorrente valem; vencida e desligada não', async () => {
    await withRollback(async (tx) => {
      const now = new Date();
      const account = await createTestAccount(tx, 'acesso-regra');
      const titular = { id: account.ownerId, type: 'titular' as const };
      const expectAllowed = async (message: string) => assert.equal((await resolveTenderAccess(tx, titular, null)).allowed, true, message);
      const expectExpired = async (message: string) => {
        const result = await resolveTenderAccess(tx, titular, null);
        assert.equal(!result.allowed && result.reason, 'subscriptionExpired', message);
      };

      await expectAllowed('cortesia');
      await setModule(tx, account.accountId, { accessType: 'assinatura', trialUntil: addDays(now, 1).toISOString() });
      await expectAllowed('teste valendo');
      await setModule(tx, account.accountId, { trialUntil: addDays(now, -1).toISOString() });
      await expectExpired('teste vencido');
      await setModule(tx, account.accountId, { paidUntil: addDays(now, 3).toISOString() });
      await expectAllowed('período pago valendo');
      await setModule(tx, account.accountId, { paidUntil: addDays(now, -3).toISOString() });
      await expectExpired('período pago vencido');
      await setModule(tx, account.accountId, { recurringId: 'pre-teste' });
      await expectAllowed('recorrente ativo');
      await setModule(tx, account.accountId, { active: false, accessType: 'cortesia' });
      assert.deepEqual(await resolveTenderAccess(tx, titular, null), { allowed: false, reason: 'notFound' }, 'desligada');
    });
  });

  test('vencida: o colaborador com acesso recebe a mesma recusa; o titular entra pela conta que vale', async () => {
    await withRollback(async (tx) => {
      const now = new Date();
      const account = await createTestAccount(tx, 'acesso-vencida');
      const member = await addAccountMember(tx, account, 'acesso-vencida-membro', { access: true });
      const memberWithoutAccess = await addAccountMember(tx, account, 'acesso-vencida-sem', { access: false });
      await setModule(tx, account.accountId, { accessType: 'assinatura', trialUntil: addDays(now, -1).toISOString() });

      const memberResult = await resolveTenderAccess(tx, { id: member, type: 'membro' }, null);
      assert.equal(!memberResult.allowed && memberResult.reason === 'subscriptionExpired' && memberResult.role, 'COLABORADOR');
      assert.deepEqual(
        await resolveTenderAccess(tx, { id: memberWithoutAccess, type: 'membro' }, null),
        { allowed: false, reason: 'memberWithoutAccess' },
      );

      const valid = await addOwnedAccount(tx, account.ownerId, { enabled: true, name: 'Conta que vale' });
      const titular = await resolveTenderAccess(tx, { id: account.ownerId, type: 'titular' }, null);
      assert.ok(titular.allowed);
      assert.equal(titular.access.account.id, valid);
      assert.deepEqual(titular.access.availableAccounts.map((owned) => owned.id), [valid]);
      const chosenExpired = await resolveTenderAccess(tx, { id: account.ownerId, type: 'titular' }, account.accountId);
      assert.equal(!chosenExpired.allowed && chosenExpired.reason, 'subscriptionExpired');
    });
  });

  test('teste de 15 dias: um por conta', async () => {
    await withRollback(async (tx) => {
      const now = new Date();
      const account = await createTestAccount(tx, 'teste-inicio', { enabled: false });

      assert.equal(await startTenderTrial(tx, account.accountId, account.ownerId, now), true);
      const row = await readModuleRow(tx, account.accountId);
      assert.equal(row?.accessType, 'assinatura');
      closeTo(parseDbTimestamp(row?.trialUntil ?? null), addDays(now, TRIAL_DAYS), 'fim do teste');
      assert.equal(await startTenderTrial(tx, account.accountId, account.ownerId, now), false);
    });
  });

  test('pagamento avulso soma ao teste e ignora o mesmo aviso repetido', async () => {
    await withRollback(async (tx) => {
      const now = new Date();
      const account = await createTestAccount(tx, 'pagamento-avulso', { enabled: false });
      await startTenderTrial(tx, account.accountId, account.ownerId, now);
      await addAccountMember(tx, account, 'pagamento-avulso-membro', { access: true });

      assert.equal(await applyOneTimePayment(tx, account.accountId, 'pag-1', now, PIX_PAYMENT), true);
      const paid = await readModuleRow(tx, account.accountId);
      closeTo(parseDbTimestamp(paid?.paidUntil ?? null), addDays(now, TRIAL_DAYS + PAID_PERIOD_DAYS), 'não perde os dias do teste');
      assert.equal(paid?.billedUsers, 2);

      assert.equal(await applyOneTimePayment(tx, account.accountId, 'pag-1', now, PIX_PAYMENT), false, 'aviso repetido');
      const again = await readModuleRow(tx, account.accountId);
      assert.equal(again?.paidUntil, paid?.paidUntil);

      const events = await listBillingEvents(tx, account.accountId);
      assert.deepEqual(
        events.map((event) => [event.type, event.status, event.method, event.amountCents, event.users]),
        [['PAGAMENTO', 'APROVADO', 'PIX', 499, 2]],
        'o aviso repetido não gravou outra linha',
      );
    });
  });

  test('pagamento já gravado não estende o acesso de novo, nem depois de outro pagamento ter sido aplicado', async () => {
    await withRollback(async (tx) => {
      const now = new Date();
      const account = await createTestAccount(tx, 'pagamento-repetido', { enabled: false });
      await startTenderTrial(tx, account.accountId, account.ownerId, now);

      assert.equal(await applyOneTimePayment(tx, account.accountId, 'pag-1', now, PIX_PAYMENT), true);
      assert.equal(await applyOneTimePayment(tx, account.accountId, 'pag-2', now, CARD_PAYMENT), true);
      const afterSecond = await readModuleRow(tx, account.accountId);

      assert.equal(await applyOneTimePayment(tx, account.accountId, 'pag-1', now, PIX_PAYMENT), false, 'o último pagamento aplicado já era outro');
      assert.equal((await readModuleRow(tx, account.accountId))?.paidUntil, afterSecond?.paidUntil);
      assert.equal((await listBillingEvents(tx, account.accountId)).length, 2);
    });
  });

  test('se o evento do histórico não puder ser gravado, o pagamento não é aplicado pela metade (nem a ativação, nem o cancelamento)', async () => {
    await withRollback(async (tx) => {
      const now = new Date();
      const account = await createTestAccount(tx, 'atomico', { enabled: false });
      await startTenderTrial(tx, account.accountId, account.ownerId, now);
      await setRecurring(tx, account.accountId, 'pre-atomico', 1, now, 499);
      const before = await readModuleRow(tx, account.accountId);

      // Sem a tabela (migration 0004 não aplicada), gravar o evento falha: o que já tinha mudado volta junto.
      await tx.execute(sql`DROP TABLE licitacoes.cobranca_historico`);
      await assert.rejects(applyOneTimePayment(tx, account.accountId, 'pag-atomico', now, PIX_PAYMENT), HISTORY_TABLE_ERROR);
      await assert.rejects(applyRecurringCharge(tx, account.accountId, 'pre-atomico', 'pag-atomico-2', now, 499), HISTORY_TABLE_ERROR);
      await assert.rejects(clearRecurring(tx, account.accountId, 'pre-atomico', now, 'TITULAR'), HISTORY_TABLE_ERROR);
      await assert.rejects(setRecurring(tx, account.accountId, 'pre-novo', 1, now, 499), HISTORY_TABLE_ERROR);

      const after = await readModuleRow(tx, account.accountId);
      assert.deepEqual(
        [after?.paidUntil, after?.lastPaymentId, after?.recurringId, after?.billedUsers],
        [before?.paidUntil, before?.lastPaymentId, before?.recurringId, before?.billedUsers],
        'nada mudou na assinatura',
      );
    });
  });

  test('recorrente: cobrança só da assinatura da conta; encerrar só a mesma', async () => {
    await withRollback(async (tx) => {
      const now = new Date();
      const account = await createTestAccount(tx, 'recorrente', { enabled: false });
      await startTenderTrial(tx, account.accountId, account.ownerId, now);
      await setRecurring(tx, account.accountId, 'pre-atual', 1, now, 499);

      assert.equal(await applyRecurringCharge(tx, account.accountId, 'pre-antiga', 'pag-x', now, 499), false);
      assert.equal(await applyRecurringCharge(tx, account.accountId, 'pre-atual', 'pag-2', now, 499), true);
      closeTo(parseDbTimestamp((await readModuleRow(tx, account.accountId))?.paidUntil ?? null), addDays(now, PAID_PERIOD_DAYS), 'período do recorrente');

      assert.equal(await clearRecurring(tx, account.accountId, 'pre-antiga', now, 'MERCADO_PAGO'), false);
      assert.equal(await clearRecurring(tx, account.accountId, 'pre-atual', now, 'MERCADO_PAGO'), true);
      assert.equal((await readModuleRow(tx, account.accountId))?.recurringId, null);
    });
  });

  test('histórico: ativação, cobrança, recusa e cancelamento, do mais novo ao mais antigo; o que não mudou nada não grava', async () => {
    await withRollback(async (tx) => {
      const start = new Date('2026-11-10T15:00:00.000Z');
      const at = (minutes: number) => new Date(start.getTime() + minutes * ONE_MINUTE_MS);
      const account = await createTestAccount(tx, 'historico-fluxo', { enabled: false });
      await startTenderTrial(tx, account.accountId, account.ownerId, start);

      await setRecurring(tx, account.accountId, 'pre-1', 1, at(0), 499);
      assert.equal(await applyRecurringCharge(tx, account.accountId, 'pre-1', 'pag-r1', at(1), 499), true);
      assert.equal(await recordRefusedPayment(tx, { accountId: account.accountId, paymentId: 'pag-rej', details: CARD_PAYMENT, detail: 'cc_rejected_insufficient_amount', now: at(2) }), true);
      assert.equal(
        await recordRefusedPayment(tx, { accountId: account.accountId, paymentId: 'pag-rej', details: CARD_PAYMENT, detail: 'cc_rejected_insufficient_amount', now: at(3) }),
        false,
        'o mesmo aviso de recusa não duplica',
      );
      assert.equal(await clearRecurring(tx, account.accountId, 'pre-antiga', at(4), 'MERCADO_PAGO'), false, 'aviso de uma assinatura que já não é a da conta');
      assert.equal(await clearRecurring(tx, account.accountId, null, at(5), 'COBRANCA_RECUSADA'), true);
      assert.equal(await clearRecurring(tx, account.accountId, null, at(6), 'TITULAR'), false, 'sem assinatura recorrente não há o que cancelar');

      const events = await listBillingEvents(tx, account.accountId);
      assert.deepEqual(
        events.map((event) => [event.type, event.status, event.method, event.origin, event.amountCents, event.users]),
        [
          ['CANCELAMENTO', 'CANCELADA', null, 'COBRANCA_RECUSADA', null, null],
          ['PAGAMENTO', 'RECUSADO', 'CARTAO', null, 499, null],
          ['PAGAMENTO', 'APROVADO', 'RECORRENTE', null, 499, 1],
          ['ASSINATURA', 'ATIVADA', null, null, 499, 1],
        ],
      );
      assert.equal(events[0]?.occurredAt, '2026-11-10T12:05:00-03:00', 'data de Brasília');

      // Os identificadores do Mercado Pago e o código da recusa ficam no banco, mas não saem na lista.
      const text = JSON.stringify(events);
      for (const hidden of ['pag-rej', 'pag-r1', 'pre-1', 'cc_rejected']) {
        assert.equal(text.includes(hidden), false, hidden);
      }
      const [refused] = await tx
        .select({ paymentId: tenderBillingHistory.paymentId, detail: tenderBillingHistory.detail })
        .from(tenderBillingHistory)
        .where(and(eq(tenderBillingHistory.accountId, account.accountId), eq(tenderBillingHistory.status, 'RECUSADO')));
      assert.deepEqual(refused, { paymentId: 'pag-rej', detail: 'cc_rejected_insufficient_amount' });
    });
  });

  test('histórico: cada conta vê só os seus eventos, e a lista traz no máximo os 200 mais recentes', async () => {
    await withRollback(async (tx) => {
      const start = new Date('2026-01-01T12:00:00.000Z');
      const first = await createTestAccount(tx, 'historico-a', { enabled: false });
      const second = await createTestAccount(tx, 'historico-b', { enabled: false });
      await startTenderTrial(tx, first.accountId, first.ownerId, start);
      await startTenderTrial(tx, second.accountId, second.ownerId, start);

      assert.equal(await applyOneTimePayment(tx, second.accountId, 'pag-b', start, PIX_PAYMENT), true);
      const rows = Array.from({ length: BILLING_HISTORY_LIMIT + 5 }, (_, index) => ({
        accountId: first.accountId,
        type: 'PAGAMENTO' as const,
        status: 'APROVADO' as const,
        amountCents: 100 + index,
        occurredAt: new Date(start.getTime() + index * ONE_MINUTE_MS).toISOString(),
      }));
      await tx.insert(tenderBillingHistory).values(rows);

      const firstEvents = await listBillingEvents(tx, first.accountId);
      assert.equal(firstEvents.length, BILLING_HISTORY_LIMIT);
      assert.equal(firstEvents[0]?.amountCents, 100 + BILLING_HISTORY_LIMIT + 4, 'o mais recente primeiro');
      assert.equal(firstEvents.at(-1)?.amountCents, 105, 'os 5 mais antigos ficaram de fora');
      assert.equal(firstEvents.every((event) => event.method !== 'PIX'), true, 'nada da outra conta');

      const secondEvents = await listBillingEvents(tx, second.accountId);
      assert.deepEqual(secondEvents.map((event) => [event.method, event.amountCents]), [['PIX', 499]]);
    });
  });

  test('colaborador: só o vínculo ativo conta; o titular e o colaborador inativo não', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'colaborador-ativo');
      const active = await addAccountMember(tx, account, 'colaborador-ativo-membro', { access: false });
      const inactive = await addAccountMember(tx, account, 'colaborador-inativo', { access: false, status: 'inativo' });

      assert.equal(await isAccountMember(tx, active), true);
      assert.equal(await isAccountMember(tx, inactive), false);
      assert.equal(await isAccountMember(tx, account.ownerId), false);
    });
  });
});
