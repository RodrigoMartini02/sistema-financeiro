import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { accounts } from '../../../db/schema/accounts';
import { closeLocalTestDatabase, createTestAccount, databaseTestsSkipReason, withRollback } from '../collector/dbTestSupport';
import { tenderEnabledAccounts } from '../db/schema';
import { resolveTenderAccess } from './access';
import { addAccountMember, addOwnedAccount } from './apiTestSupport';

// As duas travas do módulo e a conta da requisição (plano da Fase 2, decisão 2).

describe('acesso ao módulo (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('titular com conta habilitada entra como TITULAR', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'acesso-titular');
      const result = await resolveTenderAccess(tx, { id: account.ownerId, type: 'titular' }, null);
      assert.equal(result.allowed, true);
      if (result.allowed) {
        assert.equal(result.access.account.id, account.accountId);
        assert.equal(result.access.role, 'TITULAR');
        assert.equal(result.access.isPlatformAdmin, false);
        assert.deepEqual(result.access.availableAccounts.map((item) => item.id), [account.accountId]);
      }
    });
  });

  test('titular com duas contas habilitadas: sem accountId vale a padrão; com accountId, a escolhida; conta alheia não existe', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'acesso-duas');
      const defaultAccountId = await addOwnedAccount(tx, account.ownerId, { enabled: true, isDefault: true, name: 'Padrão' });
      const other = await createTestAccount(tx, 'acesso-alheia');
      const requester = { id: account.ownerId, type: 'titular' as const };

      const withoutChoice = await resolveTenderAccess(tx, requester, null);
      assert.equal(withoutChoice.allowed && withoutChoice.access.account.id, defaultAccountId);
      assert.equal(withoutChoice.allowed && withoutChoice.access.availableAccounts.length, 2);

      const chosen = await resolveTenderAccess(tx, requester, account.accountId);
      assert.equal(chosen.allowed && chosen.access.account.id, account.accountId);

      assert.deepEqual(await resolveTenderAccess(tx, requester, other.accountId), { allowed: false, reason: 'notFound' });
    });
  });

  test('sem padrão, vale a conta habilitada mais antiga; conta não habilitada não conta', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'acesso-antiga');
      await addOwnedAccount(tx, account.ownerId, { enabled: false, isDefault: true });
      await addOwnedAccount(tx, account.ownerId, { enabled: true });
      const result = await resolveTenderAccess(tx, { id: account.ownerId, type: 'titular' }, null);
      assert.equal(result.allowed && result.access.account.id, account.accountId);
    });
  });

  test('conta não habilitada, desabilitada ou inativa: não encontrada', async () => {
    await withRollback(async (tx) => {
      const notEnabled = await createTestAccount(tx, 'acesso-sem', { enabled: false });
      assert.deepEqual(await resolveTenderAccess(tx, { id: notEnabled.ownerId, type: 'titular' }, null), {
        allowed: false,
        reason: 'notFound',
      });

      const disabled = await createTestAccount(tx, 'acesso-desabilitada');
      await tx.update(tenderEnabledAccounts).set({ active: false }).where(eq(tenderEnabledAccounts.accountId, disabled.accountId));
      assert.deepEqual(await resolveTenderAccess(tx, { id: disabled.ownerId, type: 'titular' }, null), {
        allowed: false,
        reason: 'notFound',
      });

      const inactive = await createTestAccount(tx, 'acesso-inativa');
      await tx.update(accounts).set({ active: false }).where(eq(accounts.id, inactive.accountId));
      assert.deepEqual(await resolveTenderAccess(tx, { id: inactive.ownerId, type: 'titular' }, null), {
        allowed: false,
        reason: 'notFound',
      });
    });
  });

  test('colaborador: com acesso entra na conta do vínculo; sem acesso, 403; outra conta pedida, não encontrada', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'acesso-equipe');
      const other = await createTestAccount(tx, 'acesso-equipe-outra');
      const withAccess = await addAccountMember(tx, account, 'acesso-com', { access: true });
      const withoutAccess = await addAccountMember(tx, account, 'acesso-semlib', { access: false });

      const allowed = await resolveTenderAccess(tx, { id: withAccess, type: 'membro' }, null);
      assert.equal(allowed.allowed && allowed.access.role, 'COLABORADOR');
      assert.equal(allowed.allowed && allowed.access.account.id, account.accountId);

      const sameAccount = await resolveTenderAccess(tx, { id: withAccess, type: 'membro' }, account.accountId);
      assert.equal(sameAccount.allowed, true);

      assert.deepEqual(await resolveTenderAccess(tx, { id: withAccess, type: 'membro' }, other.accountId), {
        allowed: false,
        reason: 'notFound',
      });
      assert.deepEqual(await resolveTenderAccess(tx, { id: withoutAccess, type: 'membro' }, null), {
        allowed: false,
        reason: 'memberWithoutAccess',
      });
    });
  });

  test('colaborador de conta não habilitada: não encontrada, mesmo com acesso concedido', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'acesso-equipe-sem', { enabled: false });
      const member = await addAccountMember(tx, account, 'acesso-equipe-sem-membro', { access: true });
      assert.deepEqual(await resolveTenderAccess(tx, { id: member, type: 'membro' }, null), { allowed: false, reason: 'notFound' });
    });
  });

  test('vínculo inativo não dá acesso à conta de que a pessoa saiu', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'acesso-ex');
      const formerMember = await addAccountMember(tx, account, 'acesso-ex-membro', { access: true, status: 'inativo' });
      assert.deepEqual(await resolveTenderAccess(tx, { id: formerMember, type: 'membro' }, account.accountId), {
        allowed: false,
        reason: 'notFound',
      });
    });
  });

  test('admin da plataforma usa as próprias contas, com a marca de admin', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'acesso-admin');
      const result = await resolveTenderAccess(tx, { id: account.ownerId, type: 'admin' }, null);
      assert.equal(result.allowed && result.access.isPlatformAdmin, true);
      assert.equal(result.allowed && result.access.role, 'TITULAR');
    });
  });
});
