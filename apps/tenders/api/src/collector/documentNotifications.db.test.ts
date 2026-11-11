import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, test } from 'node:test';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { tenderDocuments, tenderEnabledAccounts, tenderNotifications, tenderPeople, tenderUsersWithAccess } from '../db/schema';
import { accounts, users } from '../db/identity';
import type { DocumentTypeId } from '../domains';
import { addAccountMember, testCpf, type TestAccount } from '../services/apiTestSupport';
import type { TendersDb } from './database';
import { addCalendarDays } from './dates';
import { closeLocalTestDatabase, createTestAccount, createTestCollectorContext, databaseTestsSkipReason, localTestPool, withRollback } from './dbTestSupport';
import { notifyExpiringDocuments } from './documentNotifications';
import { runDeadlineReminders } from './runs';

// Aviso de vencimento dos documentos do cofre (plano .plans/licitacoes-5-cofre-de-documentos.md, migration 0006): as faixas de
// 8 a 30 e de 0 a 7 dias, sem repetir, a validade nova que avisa de novo, os destinatários (titular e colaboradores com acesso
// para a empresa; só o titular para a pessoa), só o documento vigente, só contas com acesso valendo, o texto e o destino, a view
// de quem pode usar o módulo e a etapa de lembretes da rotina. Banco local, cada teste numa transação desfeita. As conferências
// olham só as contas do teste, nunca a contagem global.

const TODAY = '2026-11-11';
const NOW = new Date(`${TODAY}T12:00:00-03:00`);
const inDays = (days: number) => addCalendarDays(TODAY, days);
const DOCUMENT_TYPES_OF_NOTICE = ['DOCUMENTO_VENCE_30D', 'DOCUMENTO_VENCE_7D'] as const;

async function insertDocument(
  tx: TendersDb,
  account: TestAccount,
  values: { type: DocumentTypeId; validUntil: string | null; issuedOn?: string | null; personId?: number | null; description?: string | null },
): Promise<number> {
  const [row] = await tx
    .insert(tenderDocuments)
    .values({
      accountId: account.accountId,
      personId: null,
      issuedOn: null,
      description: null,
      fileKey: `documentos/${account.accountId}/${randomUUID()}.pdf`,
      fileName: 'a.pdf',
      fileType: 'application/pdf',
      fileSize: 10,
      createdBy: account.ownerId,
      ...values,
    })
    .returning({ id: tenderDocuments.id });
  if (!row) {
    throw new Error('documento de teste não criado');
  }
  return row.id;
}

async function insertPerson(tx: TendersDb, account: TestAccount, seed: number, name: string): Promise<number> {
  const [row] = await tx
    .insert(tenderPeople)
    .values({ accountId: account.accountId, name, cpf: testCpf(seed), roles: ['SOCIO'] })
    .returning({ id: tenderPeople.id });
  if (!row) {
    throw new Error('pessoa de teste não criada');
  }
  return row.id;
}

async function noticesOf(tx: TendersDb, accountIds: number[]) {
  return tx
    .select({
      accountId: tenderNotifications.accountId,
      userId: tenderNotifications.userId,
      type: tenderNotifications.type,
      title: tenderNotifications.title,
      message: tenderNotifications.message,
      link: tenderNotifications.link,
      documentId: tenderNotifications.documentId,
      reference: tenderNotifications.reference,
    })
    .from(tenderNotifications)
    .where(and(inArray(tenderNotifications.type, [...DOCUMENT_TYPES_OF_NOTICE]), inArray(tenderNotifications.accountId, accountIds)))
    .orderBy(asc(tenderNotifications.documentId), asc(tenderNotifications.userId), asc(tenderNotifications.id));
}

describe('aviso de vencimento dos documentos do cofre (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('faixas: de 8 a 30 dias o primeiro aviso, de 0 a 7 o urgente; a 31 dias, vencido e sem validade, nenhum; sem repetir', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'aviso-faixas');
      // Atestados convivem: todos vigentes, cada um com a sua validade.
      const byDays = new Map<number, number>();
      for (const days of [31, 30, 8, 7, 0, -1]) {
        byDays.set(days, await insertDocument(tx, account, { type: 'ATESTADO_CAPACIDADE', validUntil: inDays(days), description: `Atestado ${days}` }));
      }
      await insertDocument(tx, account, { type: 'ATESTADO_CAPACIDADE', validUntil: null, description: 'Sem validade' });

      const first = await notifyExpiringDocuments(tx, TODAY);
      assert.ok(first.expiring >= 4 && first.created >= 4);
      const notices = await noticesOf(tx, [account.accountId]);
      assert.deepEqual(
        notices.map((notice) => [notice.documentId, notice.type, notice.reference]),
        [
          [byDays.get(30), 'DOCUMENTO_VENCE_30D', inDays(30)],
          [byDays.get(8), 'DOCUMENTO_VENCE_30D', inDays(8)],
          [byDays.get(7), 'DOCUMENTO_VENCE_7D', inDays(7)],
          [byDays.get(0), 'DOCUMENTO_VENCE_7D', inDays(0)],
        ].sort((a, b) => (a[0] as number) - (b[0] as number)),
        'só 0 a 30 dias, na faixa certa; 31 dias, vencido e sem validade não avisam',
      );
      assert.ok(notices.every((notice) => notice.userId === account.ownerId && notice.accountId === account.accountId));

      const second = await notifyExpiringDocuments(tx, TODAY);
      assert.equal(second.created, 0, 'rodar de novo não duplica');
      assert.equal((await noticesOf(tx, [account.accountId])).length, 4);
    });
  });

  test('o dia seguinte: o documento que já tinha o aviso de 30 dias recebe o urgente quando chega a 7 dias; não antes', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'aviso-dias');
      const documentId = await insertDocument(tx, account, { type: 'ATESTADO_CAPACIDADE', validUntil: inDays(20), description: 'Atestado' });

      await notifyExpiringDocuments(tx, TODAY);
      assert.deepEqual((await noticesOf(tx, [account.accountId])).map((notice) => notice.type), ['DOCUMENTO_VENCE_30D']);

      await notifyExpiringDocuments(tx, inDays(12));
      assert.equal((await noticesOf(tx, [account.accountId])).length, 1, 'a 8 dias ainda é a mesma faixa, sem aviso novo');
      await notifyExpiringDocuments(tx, inDays(13));
      assert.deepEqual(
        (await noticesOf(tx, [account.accountId])).map((notice) => [notice.documentId, notice.type]),
        [[documentId, 'DOCUMENTO_VENCE_30D'], [documentId, 'DOCUMENTO_VENCE_7D']],
        'a 7 dias, o urgente',
      );
    });
  });

  test('validade nova (a data foi editada) avisa de novo; a mesma validade não', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'aviso-nova-validade');
      const documentId = await insertDocument(tx, account, { type: 'ATESTADO_CAPACIDADE', validUntil: inDays(20), description: 'Atestado' });
      await notifyExpiringDocuments(tx, TODAY);
      assert.equal((await noticesOf(tx, [account.accountId])).length, 1);

      await tx.update(tenderDocuments).set({ validUntil: inDays(5) }).where(eq(tenderDocuments.id, documentId));
      assert.ok((await notifyExpiringDocuments(tx, TODAY)).created >= 1);
      const notices = await noticesOf(tx, [account.accountId]);
      assert.deepEqual(notices.map((notice) => [notice.type, notice.reference]), [['DOCUMENTO_VENCE_30D', inDays(20)], ['DOCUMENTO_VENCE_7D', inDays(5)]]);
    });
  });

  test('destinatários: documento da empresa vai ao titular e aos colaboradores com acesso; documento de pessoa, só ao titular', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'aviso-destinatarios');
      const withAccess = await addAccountMember(tx, account, 'aviso-com-acesso', { access: true });
      const withoutAccess = await addAccountMember(tx, account, 'aviso-sem-acesso', { access: false });
      const inactive = await addAccountMember(tx, account, 'aviso-inativo', { access: true, status: 'inativo' });
      const other = await createTestAccount(tx, 'aviso-outra-conta');
      const otherMember = await addAccountMember(tx, other, 'aviso-colega-da-outra', { access: true });
      const personId = await insertPerson(tx, account, 2100, 'Ana Souza');
      const company = await insertDocument(tx, account, { type: 'CERTIDAO_FGTS', issuedOn: inDays(-20), validUntil: inDays(10) });
      const personal = await insertDocument(tx, account, { type: 'PROCURACAO', personId, validUntil: inDays(10), description: 'Pregão 4/2026' });

      await notifyExpiringDocuments(tx, TODAY);
      const notices = await noticesOf(tx, [account.accountId, other.accountId]);
      const recipientsOf = (documentId: number) => notices.filter((notice) => notice.documentId === documentId).map((notice) => notice.userId).sort((a, b) => a - b);
      assert.deepEqual(recipientsOf(company), [account.ownerId, withAccess].sort((a, b) => a - b), 'titular e colaborador com acesso');
      assert.deepEqual(recipientsOf(personal), [account.ownerId], 'documento de pessoa é só do titular');
      for (const excluded of [withoutAccess, inactive, other.ownerId, otherMember]) {
        assert.ok(!notices.some((notice) => notice.userId === excluded), `o usuário ${excluded} não devia ser avisado`);
      }
      assert.equal(notices.filter((notice) => notice.accountId === other.accountId).length, 0);
    });
  });

  test('só contas com acesso valendo recebem: conta não habilitada, habilitação inativa e assinatura vencida ficam de fora; teste valendo e cortesia recebem', async () => {
    await withRollback(async (tx) => {
      const day = 24 * 3_600_000;
      const notEnabled = await createTestAccount(tx, 'aviso-sem-modulo', { enabled: false });
      const inactiveEnabling = await createTestAccount(tx, 'aviso-habilitacao-inativa');
      await tx.update(tenderEnabledAccounts).set({ active: false }).where(eq(tenderEnabledAccounts.accountId, inactiveEnabling.accountId));
      const expired = await createTestAccount(tx, 'aviso-vencida');
      await tx.update(tenderEnabledAccounts).set({ accessType: 'assinatura', trialUntil: new Date(Date.now() - day).toISOString() }).where(eq(tenderEnabledAccounts.accountId, expired.accountId));
      const trial = await createTestAccount(tx, 'aviso-teste');
      await tx.update(tenderEnabledAccounts).set({ accessType: 'assinatura', trialUntil: new Date(Date.now() + day).toISOString() }).where(eq(tenderEnabledAccounts.accountId, trial.accountId));
      const courtesy = await createTestAccount(tx, 'aviso-cortesia');

      const all = [notEnabled, inactiveEnabling, expired, trial, courtesy];
      for (const account of all) {
        await insertDocument(tx, account, { type: 'CERTIDAO_FGTS', issuedOn: inDays(-20), validUntil: inDays(10) });
      }
      await notifyExpiringDocuments(tx, TODAY);
      const notified = (await noticesOf(tx, all.map((account) => account.accountId))).map((notice) => notice.accountId).sort((a, b) => a - b);
      assert.deepEqual(notified, [trial.accountId, courtesy.accountId].sort((a, b) => a - b));
    });
  });

  test('só o documento vigente avisa: a certidão antiga, substituída por uma nova, não avisa; atestados, que convivem, avisam', async () => {
    await withRollback(async (tx) => {
      const renewedAccount = await createTestAccount(tx, 'aviso-renovou');
      // A antiga vence em 5 dias, mas a nova (emitida depois) vence daqui a 100: a certidão está em dia, ninguém avisa.
      await insertDocument(tx, renewedAccount, { type: 'CERTIDAO_FGTS', issuedOn: inDays(-25), validUntil: inDays(5) });
      await insertDocument(tx, renewedAccount, { type: 'CERTIDAO_FGTS', issuedOn: inDays(-1), validUntil: inDays(100) });

      const dueAccount = await createTestAccount(tx, 'aviso-vencendo');
      await insertDocument(tx, dueAccount, { type: 'CERTIDAO_FGTS', issuedOn: inDays(-25), validUntil: inDays(5) });
      const currentDue = await insertDocument(tx, dueAccount, { type: 'CERTIDAO_FGTS', issuedOn: inDays(-10), validUntil: inDays(20) });

      const attestations = await createTestAccount(tx, 'aviso-atestados');
      const attestationA = await insertDocument(tx, attestations, { type: 'ATESTADO_CAPACIDADE', validUntil: inDays(5), description: 'A' });
      const attestationB = await insertDocument(tx, attestations, { type: 'ATESTADO_CAPACIDADE', validUntil: inDays(25), description: 'B' });

      await notifyExpiringDocuments(tx, TODAY);
      assert.deepEqual(await noticesOf(tx, [renewedAccount.accountId]), [], 'renovou: o documento antigo não avisa');
      assert.deepEqual((await noticesOf(tx, [dueAccount.accountId])).map((notice) => [notice.documentId, notice.type]), [[currentDue, 'DOCUMENTO_VENCE_30D']], 'só o vigente');
      assert.deepEqual(
        (await noticesOf(tx, [attestations.accountId])).map((notice) => [notice.documentId, notice.type]),
        [[attestationA, 'DOCUMENTO_VENCE_7D'], [attestationB, 'DOCUMENTO_VENCE_30D']],
        'os dois atestados avisam',
      );
    });
  });

  test('texto e destino: o nome do tipo e a data no título, a descrição na mensagem; a pessoa leva à aba Pessoas', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'aviso-texto');
      const personId = await insertPerson(tx, account, 2200, 'Ana Souza');
      const company = await insertDocument(tx, account, { type: 'ATESTADO_CAPACIDADE', validUntil: inDays(10), description: 'Prefeitura de Imperatriz' });
      const generic = await insertDocument(tx, account, { type: 'OUTRO_EMPRESA', validUntil: inDays(11), description: 'Alvará de funcionamento' });
      const personal = await insertDocument(tx, account, { type: 'DOCUMENTO_IDENTIDADE', personId, validUntil: inDays(12) });

      await notifyExpiringDocuments(tx, TODAY);
      const notices = await noticesOf(tx, [account.accountId]);
      const of = (documentId: number) => notices.find((notice) => notice.documentId === documentId);
      const day = (days: number) => inDays(days).split('-').reverse().join('/');
      assert.deepEqual(
        { title: of(company)?.title, message: of(company)?.message, link: of(company)?.link },
        { title: `Atestado de capacidade técnica vence em ${day(10)}`, message: 'Prefeitura de Imperatriz', link: '/documentacao' },
      );
      assert.deepEqual(
        { title: of(generic)?.title, message: of(generic)?.message },
        { title: `Alvará de funcionamento vence em ${day(11)}`, message: null },
      );
      assert.deepEqual(
        { title: of(personal)?.title, link: of(personal)?.link },
        { title: `Documento de identificação (RG ou CNH) de Ana Souza vence em ${day(12)}`, link: '/documentacao?aba=pessoas' },
      );
    });
  });

  test('view usuario_com_acesso: o titular e os colaboradores ativos com acesso, e mais ninguém', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'view-acesso');
      const withAccess = await addAccountMember(tx, account, 'view-com-acesso', { access: true });
      await addAccountMember(tx, account, 'view-sem-acesso', { access: false });
      await addAccountMember(tx, account, 'view-inativo', { access: true, status: 'inativo' });
      const blockedUser = await addAccountMember(tx, account, 'view-bloqueado', { access: true });
      await tx.update(users).set({ status: 'bloqueado' }).where(eq(users.id, blockedUser));
      const inactiveAccount = await createTestAccount(tx, 'view-conta-inativa');
      await tx.update(accounts).set({ active: false }).where(eq(accounts.id, inactiveAccount.accountId));

      const rows = await tx
        .select({ userId: tenderUsersWithAccess.userId, role: tenderUsersWithAccess.role })
        .from(tenderUsersWithAccess)
        .where(eq(tenderUsersWithAccess.accountId, account.accountId))
        .orderBy(asc(tenderUsersWithAccess.userId));
      assert.deepEqual(rows, [{ userId: account.ownerId, role: 'TITULAR' }, { userId: withAccess, role: 'COLABORADOR' }].sort((a, b) => a.userId - b.userId));
      const none = await tx.select().from(tenderUsersWithAccess).where(eq(tenderUsersWithAccess.accountId, inactiveAccount.accountId));
      assert.deepEqual(none, [], 'conta inativa não tem ninguém com acesso');
    });
  });

  test('a etapa de lembretes de prazo da rotina cria os avisos de documento e registra o resumo nos detalhes', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'aviso-rotina');
      const documentId = await insertDocument(tx, account, { type: 'CERTIDAO_FGTS', issuedOn: inDays(-20), validUntil: inDays(7) });
      const context = createTestCollectorContext(tx, {
        contractsFetch: async () => new Response('{}', { status: 500 }),
        now: () => NOW,
      });

      const outcome = await runDeadlineReminders(context);
      assert.equal(outcome.skipped, false);
      if (outcome.skipped) {
        return;
      }
      assert.equal(outcome.status, 'SUCESSO');
      assert.ok(outcome.notificationCount >= 1, 'conta os avisos de documento');
      const documents = outcome.details['documents'] as { expiring: number; created: number };
      assert.ok(documents.expiring >= 1 && documents.created >= 1);
      assert.deepEqual((await noticesOf(tx, [account.accountId])).map((notice) => [notice.documentId, notice.type]), [[documentId, 'DOCUMENTO_VENCE_7D']]);
    });
  });

  test('com o usuário restrito do coletor (se existir neste banco): lê só o que precisa e não lê a identidade', async (t) => {
    const roleExists = await localTestPool().query("select 1 from pg_roles where rolname = 'licitacoes_coletor'");
    if (roleExists.rowCount === 0) {
      t.skip('o papel licitacoes_coletor não existe neste banco (no banco local, o coletor usa o usuário do app)');
      return;
    }
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'aviso-restrito');
      const withAccess = await addAccountMember(tx, account, 'aviso-restrito-colega', { access: true });
      const personId = await insertPerson(tx, account, 2300, 'Ana Souza');
      const company = await insertDocument(tx, account, { type: 'CERTIDAO_FGTS', issuedOn: inDays(-20), validUntil: inDays(10) });
      const personal = await insertDocument(tx, account, { type: 'PROCURACAO', personId, validUntil: inDays(10), description: 'x' });

      await tx.execute(sql`set local role licitacoes_coletor`);
      const summary = await notifyExpiringDocuments(tx, TODAY);
      assert.ok(summary.created >= 3, 'o titular e o colega recebem o da empresa; o titular, o da pessoa');

      // A identidade em `public` continua fechada para o papel (num savepoint, para o resto do teste seguir).
      const canReadIdentity = await tx.execute(sql`select has_table_privilege('licitacoes_coletor', 'public.contas', 'SELECT') as allowed`);
      if (canReadIdentity.rows[0]?.['allowed'] === false) {
        // 42501 = insufficient_privilege (o texto do Postgres sai no idioma do servidor; o código não muda).
        await assert.rejects(
          tx.transaction(async (inner) => inner.execute(sql`select id from public.contas limit 1`)),
          (error: unknown) => (error as { cause?: { code?: string } }).cause?.code === '42501',
        );
      }
      await tx.execute(sql`reset role`);

      const notices = await noticesOf(tx, [account.accountId]);
      assert.deepEqual(
        notices.map((notice) => [notice.documentId, notice.userId]).sort((a, b) => (a[0] as number) - (b[0] as number) || (a[1] as number) - (b[1] as number)),
        [[company, account.ownerId], [company, withAccess], [personal, account.ownerId]].sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!),
      );
    });
  });
});
