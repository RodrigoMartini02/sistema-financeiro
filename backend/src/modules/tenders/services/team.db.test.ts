import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { accountMembers, accounts, users } from '../db/identity';
import { RequestInputError } from '../utils/requestInput';
import { closeLocalTestDatabase, createTestAccount, databaseTestsSkipReason, withRollback } from '../collector/dbTestSupport';
import { resolveTenderAccess } from './access';
import { addAccountMember } from './apiTestSupport';
import { countModuleUsers } from './subscription';
import { createTeamMember, listAccountsForTenders, listTeam, setAccountCourtesy, setTeamMemberAccess } from './team';

// Usuários do módulo (titular) e cortesia das contas (admin da plataforma).

const isNotFound = (error: unknown) => error instanceof RequestInputError && error.status === 404;
const isBadRequest = (error: unknown) => error instanceof RequestInputError && error.status === 400;
const now = () => new Date();

function newMemberInput(label: string) {
  return {
    name: `Usuário ${label}`,
    lastName: null,
    email: `licitacoes-${label}-${Date.now()}@exemplo.test`,
    password: 'senha-forte-1',
    document: null,
    telefone: null,
    dataNascimento: null,
  };
}

describe('usuários e cortesia (banco local)', { skip: databaseTestsSkipReason }, () => {
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
      assert.equal(await countModuleUsers(tx, account.accountId), 2, 'o titular e o colaborador com acesso');
      const memberAccess = await resolveTenderAccess(tx, { id: member, type: 'membro' }, null);
      assert.equal(memberAccess.allowed, true);

      await setTeamMemberAccess(tx, account.accountId, account.ownerId, member, true);
      const revoked = await setTeamMemberAccess(tx, account.accountId, account.ownerId, member, false);
      assert.equal(revoked.hasAccess, false);
      assert.equal(await countModuleUsers(tx, account.accountId), 1);
      assert.deepEqual(await resolveTenderAccess(tx, { id: member, type: 'membro' }, null), {
        allowed: false,
        reason: 'memberWithoutAccess',
      });

      await assert.rejects(setTeamMemberAccess(tx, account.accountId, account.ownerId, formerMember, true), isNotFound);
      await assert.rejects(setTeamMemberAccess(tx, account.accountId, account.ownerId, otherMember, true), isNotFound);
      await assert.rejects(setTeamMemberAccess(tx, account.accountId, account.ownerId, account.ownerId, true), isNotFound);
    });
  });

  test('usuário cadastrado pelo módulo já entra com acesso ao módulo, como membro ativo da conta', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'equipe-cadastro');
      const input = newMemberInput('equipe-cadastro-usuario');

      const created = await createTeamMember(tx, account.accountId, account.ownerId, input);
      assert.equal(created.hasAccess, true);
      assert.equal(created.email, input.email);
      assert.equal(await countModuleUsers(tx, account.accountId), 2);
      assert.equal((await resolveTenderAccess(tx, { id: created.userId, type: 'membro' }, null)).allowed, true);

      const [member] = await tx.select({ status: accountMembers.status, type: users.type }).from(accountMembers)
        .innerJoin(users, eq(users.id, accountMembers.userId)).where(eq(accountMembers.userId, created.userId));
      assert.deepEqual(member, { status: 'ativo', type: 'membro' });

      await assert.rejects(createTeamMember(tx, account.accountId, account.ownerId, input), isBadRequest, 'e-mail já cadastrado');
    });
  });

  test('admin liga e desliga a cortesia; desligada, a conta segue pela assinatura', async () => {
    await withRollback(async (tx) => {
      const admin = await createTestAccount(tx, 'admin');
      const client = await createTestAccount(tx, 'admin-cliente', { enabled: false });
      const requester = { id: client.ownerId, type: 'titular' as const };
      assert.deepEqual(await resolveTenderAccess(tx, requester, null), { allowed: false, reason: 'notFound' });

      const courtesy = await setAccountCourtesy(tx, admin.ownerId, client.accountId, true, now());
      assert.equal(courtesy.courtesy, true);
      assert.equal(courtesy.accountId, client.accountId);
      assert.equal((await resolveTenderAccess(tx, requester, null)).allowed, true);

      const paying = await setAccountCourtesy(tx, admin.ownerId, client.accountId, false, now());
      assert.equal(paying.courtesy, false);
      const expired = await resolveTenderAccess(tx, requester, null);
      assert.equal(expired.allowed, false);
      assert.equal(!expired.allowed && expired.reason, 'subscriptionExpired', 'sem teste nem período pago, vencida');

      await assert.rejects(setAccountCourtesy(tx, admin.ownerId, 999_999_999, true, now()), isNotFound);
    });
  });

  test('lista do admin: com o módulo primeiro, depois o nome; conta inativa fica de fora', async () => {
    await withRollback(async (tx) => {
      const admin = await createTestAccount(tx, 'lista-admin');
      const courtesyPj = await createTestAccount(tx, 'lista-habilitada');
      const plainPj = await createTestAccount(tx, 'lista-pj', { enabled: false });
      const payingPj = await createTestAccount(tx, 'lista-desabilitada');
      await setAccountCourtesy(tx, admin.ownerId, payingPj.accountId, false, now());
      const [another] = await tx
        .insert(accounts)
        .values({ userId: plainPj.ownerId, name: 'Conta lista-outra', type: 'empresa' })
        .returning({ id: accounts.id });
      const [inactive] = await tx
        .insert(accounts)
        .values({ userId: plainPj.ownerId, name: 'Conta lista-inativa', type: 'empresa', active: false })
        .returning({ id: accounts.id });
      assert.ok(another && inactive);
      await setAccountCourtesy(tx, admin.ownerId, inactive.id, true, now());

      const testIds = new Set([courtesyPj.accountId, plainPj.accountId, payingPj.accountId, another.id, inactive.id]);
      const listed = (await listAccountsForTenders(tx, now())).filter((row) => testIds.has(row.accountId));

      assert.deepEqual(
        listed.map(({ accountId, accountType, courtesy, situation }) => ({ accountId, accountType, courtesy, situation })),
        [
          { accountId: payingPj.accountId, accountType: 'empresa', courtesy: false, situation: 'vencida' },
          { accountId: courtesyPj.accountId, accountType: 'empresa', courtesy: true, situation: 'cortesia' },
          { accountId: another.id, accountType: 'empresa', courtesy: false, situation: null },
          { accountId: plainPj.accountId, accountType: 'empresa', courtesy: false, situation: null },
        ],
      );
      const [paying, first, plain] = listed;
      assert.equal(first?.accountName, 'Conta lista-habilitada');
      assert.equal(first?.ownerName, 'Teste licitações lista-habilitada-titular');
      assert.match(first?.ownerEmail ?? '', /^licitacoes-lista-habilitada-titular-.+@exemplo\.test$/);
      assert.ok(paying?.changedAt, 'a mudança guarda a data');
      assert.equal(plain?.changedAt, null);
    });
  });
});
