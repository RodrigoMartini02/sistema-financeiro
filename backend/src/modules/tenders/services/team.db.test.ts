import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { accounts } from '../../../db/schema/accounts';
import { RequestInputError } from '../../../utils/requestInput';
import { closeLocalTestDatabase, createTestAccount, databaseTestsSkipReason, withRollback } from '../collector/dbTestSupport';
import { resolveTenderAccess } from './access';
import { addAccountMember } from './apiTestSupport';
import { listAccountsForTenders, listTeam, setAccountEnabled, setTeamMemberAccess } from './team';

// Equipe (titular) e habilitação de conta (admin da plataforma), seção 8.4 do escopo.

const isNotFound = (error: unknown) => error instanceof RequestInputError && error.status === 404;

describe('equipe e habilitação (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('titular concede e retira o acesso de colaborador ativo; quem não é da conta não existe', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'equipe');
      const other = await createTestAccount(tx, 'equipe-outra');
      const member = await addAccountMember(tx, account, 'equipe-membro', { access: false });
      const formerMember = await addAccountMember(tx, account, 'equipe-ex', { access: false, status: 'inativo' });
      const otherMember = await addAccountMember(tx, other, 'equipe-alheio', { access: false });

      const team = await listTeam(tx, account.accountId);
      assert.deepEqual(team.map(({ userId, hasAccess }) => ({ userId, hasAccess })), [{ userId: member, hasAccess: false }]);

      const granted = await setTeamMemberAccess(tx, account.accountId, account.ownerId, member, true);
      assert.equal(granted.hasAccess, true);
      assert.ok(granted.grantedAt);
      const memberAccess = await resolveTenderAccess(tx, { id: member, type: 'membro' }, null);
      assert.equal(memberAccess.allowed, true);

      await setTeamMemberAccess(tx, account.accountId, account.ownerId, member, true);
      const revoked = await setTeamMemberAccess(tx, account.accountId, account.ownerId, member, false);
      assert.equal(revoked.hasAccess, false);
      assert.deepEqual(await resolveTenderAccess(tx, { id: member, type: 'membro' }, null), {
        allowed: false,
        reason: 'memberWithoutAccess',
      });

      await assert.rejects(setTeamMemberAccess(tx, account.accountId, account.ownerId, formerMember, true), isNotFound);
      await assert.rejects(setTeamMemberAccess(tx, account.accountId, account.ownerId, otherMember, true), isNotFound);
      await assert.rejects(setTeamMemberAccess(tx, account.accountId, account.ownerId, account.ownerId, true), isNotFound);
    });
  });

  test('admin habilita e desabilita o módulo numa conta; conta inexistente: não encontrada', async () => {
    await withRollback(async (tx) => {
      const admin = await createTestAccount(tx, 'admin');
      const client = await createTestAccount(tx, 'admin-cliente', { enabled: false });
      const requester = { id: client.ownerId, type: 'titular' as const };
      assert.equal((await resolveTenderAccess(tx, requester, null)).allowed, false);

      const enabled = await setAccountEnabled(tx, admin.ownerId, client.accountId, true);
      assert.equal(enabled.active, true);
      assert.equal(enabled.accountId, client.accountId);
      assert.equal((await resolveTenderAccess(tx, requester, null)).allowed, true);

      await setAccountEnabled(tx, admin.ownerId, client.accountId, false);
      assert.equal((await resolveTenderAccess(tx, requester, null)).allowed, false);

      await assert.rejects(setAccountEnabled(tx, admin.ownerId, 999_999_999, true), isNotFound);
    });
  });

  test('lista do admin: habilitadas primeiro, depois PJ, depois o nome; conta inativa fica de fora', async () => {
    await withRollback(async (tx) => {
      const admin = await createTestAccount(tx, 'lista-admin');
      const enabledPj = await createTestAccount(tx, 'lista-habilitada');
      const plainPj = await createTestAccount(tx, 'lista-pj', { enabled: false });
      const disabledPj = await createTestAccount(tx, 'lista-desabilitada');
      await setAccountEnabled(tx, admin.ownerId, disabledPj.accountId, false);
      const [personal] = await tx
        .insert(accounts)
        .values({ userId: plainPj.ownerId, name: 'Conta lista-pessoal', type: 'pessoal' })
        .returning({ id: accounts.id });
      const [inactive] = await tx
        .insert(accounts)
        .values({ userId: plainPj.ownerId, name: 'Conta lista-inativa', type: 'empresa', active: false })
        .returning({ id: accounts.id });
      assert.ok(personal && inactive);
      await setAccountEnabled(tx, admin.ownerId, inactive.id, true);

      const testIds = new Set([enabledPj.accountId, plainPj.accountId, disabledPj.accountId, personal.id, inactive.id]);
      const listed = (await listAccountsForTenders(tx)).filter((row) => testIds.has(row.accountId));

      assert.deepEqual(
        listed.map(({ accountId, accountType, enabled }) => ({ accountId, accountType, enabled })),
        [
          { accountId: enabledPj.accountId, accountType: 'empresa', enabled: true },
          { accountId: disabledPj.accountId, accountType: 'empresa', enabled: false },
          { accountId: plainPj.accountId, accountType: 'empresa', enabled: false },
          { accountId: personal.id, accountType: 'pessoal', enabled: false },
        ],
      );
      const [first, disabled, plain] = listed;
      assert.equal(first?.accountName, 'Conta lista-habilitada');
      assert.equal(first?.ownerName, 'Teste licitações lista-habilitada-titular');
      assert.match(first?.ownerEmail ?? '', /^licitacoes-lista-habilitada-titular-.+@exemplo\.test$/);
      assert.ok(disabled?.changedAt, 'desabilitada guarda a data da mudança');
      assert.equal(plain?.changedAt, null);
    });
  });
});
