import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { closeLocalTestDatabase, databaseTestsSkipReason, withRollback } from '../collector/dbTestSupport';
import { accountMembers, accounts, passwordRecoveryCodes, users } from '../db/identity';
import { tenderEnabledAccounts } from '../db/schema';
import { RequestInputError } from '../utils/requestInput';
import { resolveTenderAccess } from './access';
import { testCnpj, uniqueEmail } from './apiTestSupport';
import { readCompanyAccountInput, type CompanyAccountInput } from './companyAccountInput';
import { signInWithGoogle, signInWithPassword } from './login';
import { issueRecoveryCode, resetPasswordWithCode, verifyRecoveryCode } from './passwordRecovery';
import { createAdminAccount, registerCompany } from './registration';

// Acesso a Licitações no banco local (identidade própria): cadastro da empresa, login, Google, recuperação de
// senha e o admin criado pelo terminal. Cada teste roda numa transação desfeita no fim.

const PASSWORD = 'senha-segura-1';
const NOW = new Date('2026-11-04T12:00:00-03:00');
const MINUTE_MS = 60_000;

const isInputError = (status: number, message?: RegExp) => (error: unknown) =>
  error instanceof RequestInputError && error.status === status && (message === undefined || message.test(error.message));

function company(seed: number, overrides: Record<string, unknown> = {}): CompanyAccountInput {
  return readCompanyAccountInput({
    razao_social: `Empresa ${seed} Ltda`,
    nome_fantasia: `Fantasia ${seed}`,
    documento: testCnpj(seed),
    enquadramento: 'LTDA',
    data_abertura: '2020-05-10',
    ...overrides,
  });
}

async function registerTestCompany(tx: TendersDb, seed: number, email = uniqueEmail(`empresa${seed}`)) {
  const created = await registerCompany(tx, { email, password: PASSWORD, company: company(seed) }, NOW);
  return { ...created, email };
}

async function storedUser(tx: TendersDb, userId: number) {
  const [user] = await tx.select().from(users).where(eq(users.id, userId));
  assert.ok(user, 'usuário gravado');
  return user;
}

describe('acesso de Licitações (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('cadastro: titular da empresa, conta padrão e teste de 15 dias, tudo de uma vez', async () => {
    await withRollback(async (tx) => {
      const email = uniqueEmail('Cadastro');
      const created = await registerCompany(tx, { email, password: PASSWORD, company: company(101) }, NOW);

      assert.equal(created.user.type, 'titular');
      assert.equal(created.user.status, 'ativo');
      assert.equal(created.user.email, email.toLowerCase());
      assert.equal(created.user.document, testCnpj(101));
      assert.equal(created.user.name, 'Fantasia 101');
      assert.equal(created.user.lastName, null);

      const stored = await storedUser(tx, created.user.id);
      assert.notEqual(stored.password, PASSWORD);
      assert.equal(await bcrypt.compare(PASSWORD, stored.password), true);

      const [account] = await tx.select().from(accounts).where(eq(accounts.userId, created.user.id));
      assert.equal(account?.id, created.accountId);
      assert.equal(account?.type, 'empresa');
      assert.equal(account?.isDefault, true);
      assert.equal(account?.active, true);
      assert.equal(account?.document, testCnpj(101));
      assert.equal(account?.legalName, 'Empresa 101 Ltda');
      assert.equal(account?.enquadramento, 'LTDA');
      assert.equal(account?.openingDate, '2020-05-10');

      const [module] = await tx.select().from(tenderEnabledAccounts).where(eq(tenderEnabledAccounts.accountId, created.accountId));
      assert.equal(module?.accessType, 'assinatura');
      assert.equal(module?.enabledBy, created.user.id);
      assert.ok(module?.trialUntil, 'teste com data de fim');

      const access = await resolveTenderAccess(tx, { id: created.user.id, type: 'titular' }, null);
      assert.ok(access.allowed, 'entra no módulo logo depois do cadastro');
      assert.equal(access.access.role, 'TITULAR');
    });
  });

  test('cadastro: e-mail e CNPJ repetidos são recusados; CNPJ só de colaborador não impede', async () => {
    await withRollback(async (tx) => {
      const first = await registerTestCompany(tx, 102, uniqueEmail('Repetido'));

      await assert.rejects(
        registerCompany(tx, { email: first.email.toUpperCase(), password: PASSWORD, company: company(103) }, NOW),
        isInputError(400, /e-mail já está cadastrado/),
      );
      await assert.rejects(
        registerCompany(tx, { email: uniqueEmail('outro'), password: PASSWORD, company: company(102) }, NOW),
        isInputError(400, /CNPJ já está cadastrado/),
      );

      // O documento de um colaborador é de outro login, criado por um titular: não ocupa o CNPJ.
      await tx.insert(users).values({ name: 'Colaborador', email: uniqueEmail('colab'), password: 'x', type: 'membro', document: testCnpj(104) });
      const created = await registerCompany(tx, { email: uniqueEmail('livre'), password: PASSWORD, company: company(104) }, NOW);
      assert.equal(created.user.document, testCnpj(104));
    });
  });

  test('cadastro: se uma etapa falha, o usuário não fica gravado sem conta', async () => {
    await withRollback(async (tx) => {
      const email = uniqueEmail('Atomico');
      const broken: CompanyAccountInput = { ...company(105), enquadramento: 'XX' as never };
      await assert.rejects(registerCompany(tx, { email, password: PASSWORD, company: broken }, NOW));

      assert.deepEqual(await tx.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase())), []);
      assert.deepEqual(await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.document, testCnpj(105))), []);
    });
  });

  test('login: por e-mail (em qualquer grafia) ou CNPJ com ou sem pontuação; sem expor a senha', async () => {
    await withRollback(async (tx) => {
      const { user, email } = await registerTestCompany(tx, 110);

      const byEmail = await signInWithPassword(tx, ` ${email.toUpperCase()} `, PASSWORD);
      assert.equal(byEmail.id, user.id);
      assert.deepEqual(Object.keys(byEmail).sort(), ['document', 'email', 'id', 'lastName', 'name', 'status', 'type']);

      const cnpj = testCnpj(110);
      const masked = `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
      assert.equal((await signInWithPassword(tx, cnpj, PASSWORD)).id, user.id);
      assert.equal((await signInWithPassword(tx, masked, PASSWORD)).id, user.id);
    });
  });

  test('login: senha errada e quem não existe dão 401; conta bloqueada ou desativada, 403 só depois da senha', async () => {
    await withRollback(async (tx) => {
      const { user, email } = await registerTestCompany(tx, 111);

      await assert.rejects(signInWithPassword(tx, email, 'senha-errada'), isInputError(401, /Senha incorreta/));
      await assert.rejects(signInWithPassword(tx, uniqueEmail('naoexiste'), PASSWORD), isInputError(401, /não cadastrado/));
      await assert.rejects(signInWithPassword(tx, testCnpj(999), PASSWORD), isInputError(401, /não cadastrado/));

      await tx.update(users).set({ status: 'bloqueado' }).where(eq(users.id, user.id));
      await assert.rejects(signInWithPassword(tx, email, PASSWORD), isInputError(403, /Conta bloqueada/));
      await assert.rejects(signInWithPassword(tx, email, 'senha-errada'), isInputError(401, /Senha incorreta/), 'o status só aparece para quem sabe a senha');

      await tx.update(users).set({ status: 'inativo' }).where(eq(users.id, user.id));
      await assert.rejects(signInWithPassword(tx, email, PASSWORD), isInputError(403, /Acesso desativado/));
    });
  });

  test('login por documento: o acesso próprio vence o de colaborador; só colaboradores ativos em dobro pedem o e-mail', async () => {
    await withRollback(async (tx) => {
      const { user, accountId } = await registerTestCompany(tx, 112);
      const cnpj = testCnpj(112);
      const addMember = async (label: string, document: string, status: 'ativo' | 'inativo' = 'ativo') => {
        const [member] = await tx
          .insert(users)
          .values({ name: label, email: uniqueEmail(label), password: await bcrypt.hash(PASSWORD, 4), type: 'membro', document, status })
          .returning({ id: users.id });
        await tx.insert(accountMembers).values({ accountId, userId: member!.id });
        return member!.id;
      };

      await addMember('colab-mesmo-cnpj', cnpj);
      assert.equal((await signInWithPassword(tx, cnpj, PASSWORD)).id, user.id, 'o titular, não o colaborador');

      const cpf = '52998224725';
      const first = await addMember('colab-a', cpf);
      assert.equal((await signInWithPassword(tx, cpf, PASSWORD)).id, first, 'único colaborador com o CPF');
      await addMember('colab-b', cpf);
      await assert.rejects(signInWithPassword(tx, cpf, PASSWORD), isInputError(400, /Este CPF tem mais de um acesso\. Entre com o e-mail\./));
    });
  });

  test('Google: só entra quem já tem acesso; guarda o id do Google uma vez e respeita o bloqueio', async () => {
    await withRollback(async (tx) => {
      const { user, email } = await registerTestCompany(tx, 120);

      await assert.rejects(signInWithGoogle(tx, { email: uniqueEmail('desconhecido'), googleId: 'g-0' }), isInputError(403, /não tem acesso a Licitações/));

      assert.equal((await signInWithGoogle(tx, { email: email.toLowerCase(), googleId: 'g-1' })).id, user.id);
      assert.equal((await storedUser(tx, user.id)).googleId, 'g-1');
      await signInWithGoogle(tx, { email: email.toLowerCase(), googleId: 'g-2' });
      assert.equal((await storedUser(tx, user.id)).googleId, 'g-1', 'não troca o id já guardado');

      await tx.update(users).set({ status: 'bloqueado' }).where(eq(users.id, user.id));
      await assert.rejects(signInWithGoogle(tx, { email: email.toLowerCase(), googleId: 'g-1' }), isInputError(403, /Conta bloqueada/));
    });
  });

  test('recuperação: o código novo vale 15 minutos, substitui o anterior e zera as tentativas', async () => {
    await withRollback(async (tx) => {
      const { user } = await registerTestCompany(tx, 130);

      const first = await issueRecoveryCode(tx, user.id, NOW);
      assert.match(first, /^\d{6}$/);
      const [stored] = await tx.select().from(passwordRecoveryCodes).where(eq(passwordRecoveryCodes.userId, user.id));
      assert.equal(stored?.code, first);
      assert.equal(stored?.attempts, 0);
      assert.equal(new Date(stored!.expiresAt).getTime() - NOW.getTime(), 15 * MINUTE_MS);

      await tx.update(passwordRecoveryCodes).set({ attempts: 2 }).where(eq(passwordRecoveryCodes.userId, user.id));
      const second = await issueRecoveryCode(tx, user.id, new Date(NOW.getTime() + MINUTE_MS));
      const rows = await tx.select().from(passwordRecoveryCodes).where(eq(passwordRecoveryCodes.userId, user.id));
      assert.equal(rows.length, 1, 'um código por usuário');
      assert.equal(rows[0]?.code, second);
      assert.equal(rows[0]?.attempts, 0);
    });
  });

  test('recuperação: código certo confirma sem gastar tentativa; errado diz quantas restam; 3 erros travam o código', async () => {
    await withRollback(async (tx) => {
      const { user, email } = await registerTestCompany(tx, 131);
      const attemptsOf = async () => (await tx.select().from(passwordRecoveryCodes).where(eq(passwordRecoveryCodes.userId, user.id)))[0]?.attempts;

      const code = await issueRecoveryCode(tx, user.id, new Date());
      await verifyRecoveryCode(tx, email, code);
      assert.equal(await attemptsOf(), 0, 'acerto devolve a tentativa');
      await verifyRecoveryCode(tx, email.toUpperCase(), ` ${code} `);

      const wrong = code === '000000' ? '111111' : '000000';
      await assert.rejects(verifyRecoveryCode(tx, email, wrong), isInputError(400, /Restam 2 tentativas/));
      await assert.rejects(verifyRecoveryCode(tx, email, wrong), isInputError(400, /Resta 1 tentativa/));
      await assert.rejects(verifyRecoveryCode(tx, email, wrong), isInputError(400, /usou as 3 tentativas/));
      assert.equal(await attemptsOf(), 3);

      await assert.rejects(verifyRecoveryCode(tx, email, code), isInputError(400, /Muitas tentativas com este código/), 'nem o certo passa depois dos 3 erros');
      for (let extra = 0; extra < 5; extra++) {
        await assert.rejects(verifyRecoveryCode(tx, email, wrong));
      }
      assert.equal(await attemptsOf(), 3, 'a contagem nunca passa do limite');

      const renewed = await issueRecoveryCode(tx, user.id, new Date());
      await verifyRecoveryCode(tx, email, renewed);
    });
  });

  test('recuperação: sem código, vencido ou e-mail desconhecido dão cada um o seu motivo', async () => {
    await withRollback(async (tx) => {
      const { user, email } = await registerTestCompany(tx, 132);

      await assert.rejects(verifyRecoveryCode(tx, uniqueEmail('naoexiste'), '123456'), isInputError(404, /E-mail não cadastrado/));
      await assert.rejects(verifyRecoveryCode(tx, email, '123456'), isInputError(400, /Nenhum código foi pedido/));

      const code = await issueRecoveryCode(tx, user.id, new Date());
      await tx.update(passwordRecoveryCodes).set({ expiresAt: new Date(Date.now() - MINUTE_MS).toISOString() }).where(eq(passwordRecoveryCodes.userId, user.id));
      await assert.rejects(verifyRecoveryCode(tx, email, code), isInputError(400, /Código expirado/));
      await assert.rejects(resetPasswordWithCode(tx, { email, code, newPassword: 'nova-senha-1' }), isInputError(400, /Código expirado/));
    });
  });

  test('recuperação: a senha só muda com o código certo, e o código vale uma vez só', async () => {
    await withRollback(async (tx) => {
      const { user, email } = await registerTestCompany(tx, 133);
      const code = await issueRecoveryCode(tx, user.id, new Date());
      const wrong = code === '000000' ? '111111' : '000000';

      await assert.rejects(resetPasswordWithCode(tx, { email, code: wrong, newPassword: 'nova-senha-1' }), isInputError(400, /Código incorreto/));
      assert.equal(await bcrypt.compare(PASSWORD, (await storedUser(tx, user.id)).password), true, 'senha intacta com o código errado');

      await verifyRecoveryCode(tx, email, code);
      await resetPasswordWithCode(tx, { email: email.toUpperCase(), code, newPassword: 'nova-senha-1' });
      assert.equal(await bcrypt.compare('nova-senha-1', (await storedUser(tx, user.id)).password), true);
      assert.deepEqual(await tx.select().from(passwordRecoveryCodes).where(eq(passwordRecoveryCodes.userId, user.id)), [], 'o código some com a troca');

      await assert.rejects(resetPasswordWithCode(tx, { email, code, newPassword: 'outra-senha-2' }), isInputError(400, /Nenhum código foi pedido/));
      await assert.rejects(signInWithPassword(tx, email, PASSWORD), isInputError(401, /Senha incorreta/));
      assert.equal((await signInWithPassword(tx, email, 'nova-senha-1')).id, user.id);
    });
  });

  test('recuperação: dois pedidos que reservaram o mesmo código não conseguem usá-lo duas vezes', async () => {
    await withRollback(async (tx) => {
      const { user, email } = await registerTestCompany(tx, 134);
      const code = await issueRecoveryCode(tx, user.id, new Date());

      // Os dois pedidos precisam passar pela reserva antes do consumo. Na
      // conexão única deste teste, serializar as transações evita sobrepor
      // savepoints; em produção, o DELETE faz essa disputa entre conexões.
      let entered = 0;
      let releaseBoth: () => void = () => { throw new Error('Barrier not initialized'); };
      const bothReserved = new Promise<void>((resolve) => { releaseBoth = resolve; });
      let pending = Promise.resolve();
      const racingDatabase = new Proxy(tx, {
        get(target, property, receiver) {
          if (property !== 'transaction') {
            return Reflect.get(target, property, receiver);
          }
          return (run: Parameters<TendersDb['transaction']>[0]) => {
            entered++;
            if (entered === 2) releaseBoth();
            const result = pending.then(async () => {
              await bothReserved;
              return target.transaction(run);
            });
            pending = result.then(() => undefined, () => undefined);
            return result;
          };
        },
      });
      const results = await Promise.allSettled([
        resetPasswordWithCode(racingDatabase, { email, code, newPassword: 'concurrent-password-a' }),
        resetPasswordWithCode(racingDatabase, { email, code, newPassword: 'concurrent-password-b' }),
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      const rejected = results.find((result) => result.status === 'rejected');
      assert.ok(rejected?.status === 'rejected');
      assert.ok(rejected.reason instanceof RequestInputError);
      assert.match(rejected.reason.message, /já utilizado/);
      const winner = results[0]?.status === 'fulfilled' ? 'concurrent-password-a' : 'concurrent-password-b';
      assert.equal(await bcrypt.compare(winner, (await storedUser(tx, user.id)).password), true);
      assert.deepEqual(await tx.select().from(passwordRecoveryCodes).where(eq(passwordRecoveryCodes.userId, user.id)), []);
    });
  });

  test('admin pelo terminal: tipo admin, conta da empresa como padrão e módulo em cortesia', async () => {
    await withRollback(async (tx) => {
      const email = uniqueEmail('admin');
      const created = await createAdminAccount(tx, { email, password: PASSWORD, company: company(140) }, NOW);

      assert.equal(created.user.type, 'admin');
      assert.equal((await signInWithPassword(tx, email, PASSWORD)).type, 'admin');

      const [account] = await tx.select().from(accounts).where(eq(accounts.userId, created.user.id));
      assert.equal(account?.isDefault, true);
      const [module] = await tx.select().from(tenderEnabledAccounts).where(eq(tenderEnabledAccounts.accountId, created.accountId));
      assert.equal(module?.accessType, 'cortesia');
      assert.equal(module?.trialUntil, null, 'cortesia não tem prazo');

      const access = await resolveTenderAccess(tx, { id: created.user.id, type: 'admin' }, null);
      assert.ok(access.allowed);
      assert.equal(access.access.isPlatformAdmin, true);

      await assert.rejects(createAdminAccount(tx, { email, password: PASSWORD, company: company(141) }, NOW), isInputError(400, /e-mail já está cadastrado/));
    });
  });
});
