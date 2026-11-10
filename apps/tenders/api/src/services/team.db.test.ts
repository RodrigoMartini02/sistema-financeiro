import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { accountMembers, accounts, users } from '../db/identity';
import { RequestInputError } from '../utils/requestInput';
import { closeLocalTestDatabase, createTestAccount, databaseTestsSkipReason, withRollback } from '../collector/dbTestSupport';
import { createMemoryStorage } from '../objectStorageTestSupport';
import { resolveTenderAccess } from './access';
import { addAccountMember } from './apiTestSupport';
import { readProfile, updateProfile } from './profile';
import { countModuleUsers } from './subscription';
import {
  assertTeamMember,
  createTeamMember,
  listAccountsForTenders,
  listTeam,
  readTeamMember,
  setAccountCourtesy,
  setTeamMemberAccess,
  updateTeamMember,
} from './team';
import { changeUserPhoto, readPhotoUpload } from './userPhoto';

// Usuários do módulo (titular) e cortesia das contas (admin da plataforma).

const isNotFound = (error: unknown) => error instanceof RequestInputError && error.status === 404;
const isBadRequest = (error: unknown) => error instanceof RequestInputError && error.status === 400;
const isUnavailable = (error: unknown) => error instanceof RequestInputError && error.status === 503;
const now = () => new Date();

/** CPFs com os dígitos verificadores certos. */
const CPF_ONE = '52998224725';
const CPF_TWO = '11144477735';

function newMemberInput(label: string) {
  return {
    name: `Usuário ${label}`,
    lastName: null,
    email: `licitacoes-${label}-${Date.now()}@exemplo.test`,
    password: 'senha-forte-1',
    document: null,
    phone: null,
    sector: null,
    jobTitle: null,
    admissionDate: null,
  };
}

function photoUpload(extra = 0) {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array<number>(8 + extra).fill(1)]);
  return readPhotoUpload({ image: `data:image/jpeg;base64,${bytes.toString('base64')}` });
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

  test('cadastro grava os dados de trabalho no vínculo e a lista os devolve; sem nada, ficam vazios', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'trabalho');
      const complete = await createTeamMember(tx, account.accountId, account.ownerId, {
        ...newMemberInput('trabalho-completo'),
        lastName: 'Souza',
        document: CPF_ONE,
        phone: '11 99999-0000',
        sector: 'financeiro',
        jobTitle: 'gerente',
        admissionDate: '2025-02-01',
      });
      const bare = await createTeamMember(tx, account.accountId, account.ownerId, newMemberInput('trabalho-simples'));

      assert.deepEqual(
        { ...complete, userId: 0, email: '', grantedAt: null },
        {
          userId: 0, name: 'Usuário trabalho-completo', lastName: 'Souza', email: '', document: CPF_ONE, phone: '11 99999-0000',
          sector: 'financeiro', jobTitle: 'gerente', admissionDate: '2025-02-01', photoKey: null, hasAccess: true, grantedAt: null,
        },
      );
      assert.deepEqual(
        [bare.sector, bare.jobTitle, bare.admissionDate, bare.document, bare.phone, bare.photoKey],
        [null, null, null, null, null, null],
      );
      assert.deepEqual((await listTeam(tx, account.accountId)).map((member) => member.userId).sort(), [complete.userId, bare.userId].sort());
    });
  });

  test('cadastro: CPF inválido ou já usado na conta é recusado; conta inexistente ou alheia ao módulo, também', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'cadastro-cpf');
      const other = await createTestAccount(tx, 'cadastro-cpf-outra');
      await createTeamMember(tx, account.accountId, account.ownerId, { ...newMemberInput('cpf-um'), document: CPF_ONE });

      await assert.rejects(
        createTeamMember(tx, account.accountId, account.ownerId, { ...newMemberInput('cpf-invalido'), document: '12345678900' }),
        (error) => isBadRequest(error) && (error as Error).message === 'Informe um CPF válido',
      );
      await assert.rejects(
        createTeamMember(tx, account.accountId, account.ownerId, { ...newMemberInput('cpf-repetido'), document: CPF_ONE }),
        (error) => isBadRequest(error) && (error as Error).message === 'Esta pessoa já tem acesso a esta conta',
      );
      // Em outra conta, a mesma pessoa pode ter o seu acesso (é um login separado).
      await createTeamMember(tx, other.accountId, other.ownerId, { ...newMemberInput('cpf-outra-conta'), document: CPF_ONE });
      await assert.rejects(
        createTeamMember(tx, 999_999_999, account.ownerId, newMemberInput('sem-conta')),
        (error) => isBadRequest(error) && (error as Error).message === 'Licitações aceita somente conta de empresa (CNPJ)',
      );
    });
  });

  test('edição altera só o enviado: pessoa, trabalho, e-mail, CPF e senha; o acesso e a contagem não mudam', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'edicao');
      const created = await createTeamMember(tx, account.accountId, account.ownerId, {
        ...newMemberInput('edicao-membro'),
        lastName: 'Antigo',
        document: CPF_ONE,
        phone: '11 1111-1111',
        sector: 'comercial',
        jobTitle: 'vendedor',
        admissionDate: '2024-03-10',
      });
      const before = await countModuleUsers(tx, account.accountId);

      const renamed = await updateTeamMember(tx, account.accountId, created.userId, { name: 'Novo nome', sector: 'ti' });
      assert.equal(renamed.name, 'Novo nome');
      assert.equal(renamed.sector, 'ti');
      assert.deepEqual(
        [renamed.lastName, renamed.document, renamed.phone, renamed.jobTitle, renamed.admissionDate, renamed.email],
        ['Antigo', CPF_ONE, '11 1111-1111', 'vendedor', '2024-03-10', created.email],
        'campo ausente mantém',
      );

      const cleared = await updateTeamMember(tx, account.accountId, created.userId, {
        lastName: null, phone: null, document: null, sector: null, jobTitle: null, admissionDate: null,
      });
      assert.deepEqual(
        [cleared.lastName, cleared.phone, cleared.document, cleared.sector, cleared.jobTitle, cleared.admissionDate],
        [null, null, null, null, null, null],
        'null limpa',
      );

      const changedLogin = await updateTeamMember(tx, account.accountId, created.userId, {
        email: `novo-${created.email}`, document: CPF_TWO, newPassword: 'outra-senha-1',
      });
      assert.equal(changedLogin.email, `novo-${created.email}`);
      assert.equal(changedLogin.document, CPF_TWO);
      const [stored] = await tx.select({ password: users.password }).from(users).where(eq(users.id, created.userId));
      assert.ok(stored && (await bcrypt.compare('outra-senha-1', stored.password)), 'a senha nova vale');
      assert.ok(!(await bcrypt.compare('senha-forte-1', stored.password)), 'a antiga não vale mais');

      assert.equal(changedLogin.hasAccess, true, 'editar não mexe no acesso');
      assert.equal(await countModuleUsers(tx, account.accountId), before, 'nem no valor da assinatura');
      // O próprio CPF e o próprio e-mail não são conflito.
      await updateTeamMember(tx, account.accountId, created.userId, { email: changedLogin.email, document: CPF_TWO, name: 'Sem conflito' });
    });
  });

  test('edição: e-mail ou CPF de outro acesso, CPF inválido e alvo fora da conta são recusados', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'edicao-conflito');
      const other = await createTestAccount(tx, 'edicao-conflito-outra');
      const first = await createTeamMember(tx, account.accountId, account.ownerId, { ...newMemberInput('conflito-um'), document: CPF_ONE });
      const second = await createTeamMember(tx, account.accountId, account.ownerId, newMemberInput('conflito-dois'));
      const stranger = await createTeamMember(tx, other.accountId, other.ownerId, newMemberInput('conflito-alheio'));
      const formerMember = await addAccountMember(tx, account, 'conflito-ex', { access: false, status: 'inativo' });

      const badRequest = (message: string) => (error: unknown) => isBadRequest(error) && (error as Error).message === message;
      await assert.rejects(updateTeamMember(tx, account.accountId, second.userId, { email: first.email }), badRequest('Este e-mail já está cadastrado'));
      await assert.rejects(updateTeamMember(tx, account.accountId, second.userId, { document: CPF_ONE }), badRequest('Esta pessoa já tem acesso a esta conta'));
      await assert.rejects(updateTeamMember(tx, account.accountId, second.userId, { document: '12345678900' }), badRequest('Informe um CPF válido'));

      await assert.rejects(updateTeamMember(tx, account.accountId, stranger.userId, { name: 'Invasor' }), isNotFound);
      await assert.rejects(updateTeamMember(tx, account.accountId, account.ownerId, { name: 'Titular' }), isNotFound, 'o titular não é colaborador');
      await assert.rejects(updateTeamMember(tx, account.accountId, formerMember, { name: 'Ex' }), isNotFound);
      assert.equal((await readTeamMember(tx, other.accountId, stranger.userId)).name, `Usuário conflito-alheio`, 'nada mudou na outra conta');
      await assert.rejects(assertTeamMember(tx, account.accountId, stranger.userId), isNotFound);
    });
  });

  test('foto do colaborador: grava no R2, aponta a coluna, troca apagando a antiga e tira', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'foto');
      const member = await createTeamMember(tx, account.accountId, account.ownerId, newMemberInput('foto-membro'));
      const { storage, objects, metadata } = createMemoryStorage();

      await changeUserPhoto(tx, storage, member.userId, photoUpload());
      const first = (await readTeamMember(tx, account.accountId, member.userId)).photoKey;
      assert.match(first ?? '', new RegExp(`^usuarios/${member.userId}/[0-9a-f-]{36}\\.jpg$`));
      assert.deepEqual([...objects.keys()], [first]);
      assert.equal(metadata.get(first!)?.contentType, 'image/jpeg');
      assert.equal(metadata.get(first!)?.contentDisposition, 'inline');

      await changeUserPhoto(tx, storage, member.userId, photoUpload(5));
      const second = (await readTeamMember(tx, account.accountId, member.userId)).photoKey;
      assert.notEqual(second, first);
      assert.deepEqual([...objects.keys()], [second], 'a foto antiga saiu do R2');

      await changeUserPhoto(tx, storage, member.userId, null);
      assert.equal((await readTeamMember(tx, account.accountId, member.userId)).photoKey, null);
      assert.equal(objects.size, 0);
      await changeUserPhoto(tx, storage, member.userId, null);
    });
  });

  test('foto: sem R2 o envio responde 503 e nada muda; tirar a foto não depende do R2', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'foto-sem-r2');
      const member = await createTeamMember(tx, account.accountId, account.ownerId, newMemberInput('foto-sem-r2-membro'));
      await assert.rejects(changeUserPhoto(tx, null, member.userId, photoUpload()), isUnavailable);
      assert.equal((await readTeamMember(tx, account.accountId, member.userId)).photoKey, null);

      const { storage } = createMemoryStorage();
      await changeUserPhoto(tx, storage, member.userId, photoUpload());
      const originalError = console.error;
      console.error = () => {};
      try {
        await changeUserPhoto(tx, null, member.userId, null);
      } finally {
        console.error = originalError;
      }
      assert.equal((await readTeamMember(tx, account.accountId, member.userId)).photoKey, null);
      await assert.rejects(changeUserPhoto(tx, storage, 999_999_999, photoUpload()), isNotFound);
    });
  });

  test('foto: se o R2 recusar o envio, a foto atual continua; se recusar a exclusão da antiga, a troca vale', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'foto-falha');
      const member = await createTeamMember(tx, account.accountId, account.ownerId, newMemberInput('foto-falha-membro'));
      const working = createMemoryStorage();
      await changeUserPhoto(tx, working.storage, member.userId, photoUpload());
      const current = (await readTeamMember(tx, account.accountId, member.userId)).photoKey;

      const refusing = createMemoryStorage(() => true);
      await assert.rejects(changeUserPhoto(tx, refusing.storage, member.userId, photoUpload(3)), /R2 fora do ar/);
      assert.equal((await readTeamMember(tx, account.accountId, member.userId)).photoKey, current, 'a foto atual continua');

      const failingDelete = { ...working.storage, deleteObject: async () => { throw new Error('R2 recusou apagar'); } };
      const originalError = console.error;
      console.error = () => {};
      try {
        await changeUserPhoto(tx, failingDelete, member.userId, photoUpload(9));
      } finally {
        console.error = originalError;
      }
      const replaced = (await readTeamMember(tx, account.accountId, member.userId)).photoKey;
      assert.notEqual(replaced, current, 'a troca vale mesmo sem conseguir apagar a antiga');
    });
  });

  test('perfil do titular: lê e altera nome, sobrenome e telefone; o que não vem fica', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'perfil');
      const before = await readProfile(tx, account.ownerId);
      assert.deepEqual([before.lastName, before.phone, before.photoKey], [null, null, null]);

      const updated = await updateProfile(tx, account.ownerId, { name: 'Titular novo', phone: '11 98888-7777' });
      assert.deepEqual([updated.name, updated.phone, updated.lastName, updated.email], ['Titular novo', '11 98888-7777', null, before.email]);
      const cleared = await updateProfile(tx, account.ownerId, { phone: null, lastName: 'Lima' });
      assert.deepEqual([cleared.phone, cleared.lastName, cleared.name], [null, 'Lima', 'Titular novo']);
      await assert.rejects(readProfile(tx, 999_999_999), isNotFound);

      const { storage, objects } = createMemoryStorage();
      await changeUserPhoto(tx, storage, account.ownerId, photoUpload());
      assert.match((await readProfile(tx, account.ownerId)).photoKey ?? '', new RegExp(`^usuarios/${account.ownerId}/`));
      await changeUserPhoto(tx, storage, account.ownerId, null);
      assert.equal(objects.size, 0);
    });
  });
});
