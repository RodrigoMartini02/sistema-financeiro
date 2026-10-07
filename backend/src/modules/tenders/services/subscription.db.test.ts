import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { RequestInputError } from '../../../utils/requestInput';
import type { TendersDb } from '../collector/database';
import { closeLocalTestDatabase, createTestAccount, databaseTestsSkipReason, withRollback } from '../collector/dbTestSupport';
import { tenderEnabledAccounts } from '../db/schema';
import { resolveTenderAccess } from './access';
import { activateModule, listActivatableAccounts } from './activation';
import { addAccountMember, addOwnedAccount } from './apiTestSupport';
import { addDays, PAID_PERIOD_DAYS, TRIAL_DAYS } from './billing';
import {
  applyOneTimePayment,
  applyRecurringCharge,
  clearRecurring,
  parseDbTimestamp,
  readModuleRow,
  setRecurring,
  startTenderTrial,
} from './subscription';

// Assinatura do módulo (migration 0080): a regra de acesso da função
// licitacoes.fn_conta_com_acesso, o teste, os pagamentos e a ativação.

const isStatus = (status: number) => (error: unknown) => error instanceof RequestInputError && error.status === status;
const ONE_MINUTE_MS = 60_000;

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

      assert.equal(await applyOneTimePayment(tx, account.accountId, 'pag-1', now), true);
      const paid = await readModuleRow(tx, account.accountId);
      closeTo(parseDbTimestamp(paid?.paidUntil ?? null), addDays(now, TRIAL_DAYS + PAID_PERIOD_DAYS), 'não perde os dias do teste');
      assert.equal(paid?.billedUsers, 2);

      assert.equal(await applyOneTimePayment(tx, account.accountId, 'pag-1', now), false, 'aviso repetido');
      const again = await readModuleRow(tx, account.accountId);
      assert.equal(again?.paidUntil, paid?.paidUntil);
    });
  });

  test('recorrente: cobrança só da assinatura da conta; encerrar só a mesma', async () => {
    await withRollback(async (tx) => {
      const now = new Date();
      const account = await createTestAccount(tx, 'recorrente', { enabled: false });
      await startTenderTrial(tx, account.accountId, account.ownerId, now);
      await setRecurring(tx, account.accountId, 'pre-atual', 1, now);

      assert.equal(await applyRecurringCharge(tx, account.accountId, 'pre-antiga', 'pag-x', now), false);
      assert.equal(await applyRecurringCharge(tx, account.accountId, 'pre-atual', 'pag-2', now), true);
      closeTo(parseDbTimestamp((await readModuleRow(tx, account.accountId))?.paidUntil ?? null), addDays(now, PAID_PERIOD_DAYS), 'período do recorrente');

      assert.equal(await clearRecurring(tx, account.accountId, 'pre-antiga', now), false);
      assert.equal(await clearRecurring(tx, account.accountId, 'pre-atual', now), true);
      assert.equal((await readModuleRow(tx, account.accountId))?.recurringId, null);
    });
  });

  test('ativação: só o titular, só conta dele sem o módulo, uma vez', async () => {
    await withRollback(async (tx) => {
      const now = new Date();
      const account = await createTestAccount(tx, 'ativacao', { enabled: false });
      const other = await createTestAccount(tx, 'ativacao-outra', { enabled: false });
      const member = await addAccountMember(tx, other, 'ativacao-membro', { access: false });
      const titular = { id: account.ownerId, type: 'titular' as const };

      assert.deepEqual((await listActivatableAccounts(tx, titular)).map((owned) => owned.id), [account.accountId]);
      assert.deepEqual(await listActivatableAccounts(tx, { id: member, type: 'membro' }), []);
      await assert.rejects(activateModule(tx, { id: member, type: 'membro' }, other.accountId, now), isStatus(403));
      await assert.rejects(activateModule(tx, titular, other.accountId, now), isStatus(404));

      const activated = await activateModule(tx, titular, account.accountId, now);
      assert.equal(activated.id, account.accountId);
      assert.equal((await resolveTenderAccess(tx, titular, null)).allowed, true);
      assert.deepEqual(await listActivatableAccounts(tx, titular), []);
      await assert.rejects(activateModule(tx, titular, account.accountId, now), isStatus(409));
    });
  });
});
