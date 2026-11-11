import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import { formatCnpj } from '../cnpj';
import { openTestContractStore, quietLogger, sampleContract } from '../contractStore/storeTestSupport';
import { tenderCompetitors, tenderNotifications } from '../db/schema';
import { testCnpj } from '../services/apiTestSupport';
import { notifyCompetitorContracts, type NotificationContext } from './contractNotifications';
import type { TenderContractRow } from './contractMapping';
import type { TendersDb } from './database';
import { closeLocalTestDatabase, createTestAccount, createTestUser, databaseTestsSkipReason, withRollback } from './dbTestSupport';

// Aviso de contrato novo dos concorrentes monitorados (plano .plans/licitacoes-4-concorrentes-monitorados.md, migration 0005):
// um aviso por contrato e por pessoa, só para contratos publicados nos últimos 7 dias e no dia do `aviso_desde` ou depois, só
// para contas com acesso e com o aviso ligado, sem repetir. Os contratos vêm de um armazém de exemplo, e os destinatários, do
// banco local. Chama a regra direto, sem a execução da rotina (a trava dos contratos é testada em contractRuns.db.test.ts).
// Os totais globais (`monitored` e `cnpjs`) dependem do que mais houver no banco local; as conferências vão nos avisos das
// contas do teste e nos números que só dependem do armazém de exemplo.

const TODAY = '2026-10-13';
const NOW = new Date(`${TODAY}T12:00:00Z`);
const ALFA = testCnpj(5101);
const BETA = testCnpj(5102);
const FEDERAL_KEY = 'comprasgov-153254-50-00586/2023';
const LONG_AGO = '2026-01-01 00:00:00-03';

async function withContracts(
  tx: TendersDb,
  contracts: readonly TenderContractRow[],
  run: (context: NotificationContext) => Promise<void>,
): Promise<void> {
  const store = await openTestContractStore(contracts, { today: TODAY });
  try {
    await run({ db: tx, contractStore: store.reader, now: () => NOW, logger: quietLogger });
  } finally {
    await store.close();
  }
}

async function noticesOf(tx: TendersDb, accountIds: number[]) {
  const rows = await tx
    .select({
      accountId: tenderNotifications.accountId,
      userId: tenderNotifications.userId,
      contractKey: tenderNotifications.contractKey,
      title: tenderNotifications.title,
      message: tenderNotifications.message,
      link: tenderNotifications.link,
      reference: tenderNotifications.reference,
    })
    .from(tenderNotifications)
    .where(and(eq(tenderNotifications.type, 'CONTRATO_NOVO_CONCORRENTE'), inArray(tenderNotifications.accountId, accountIds)));
  return rows.sort((a, b) => a.userId - b.userId || (a.contractKey ?? '').localeCompare(b.contractKey ?? ''));
}

describe('aviso de contrato novo dos concorrentes (banco local e armazém de exemplo)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('um aviso por contrato publicado nos últimos 7 dias, com título pelo apelido, trecho, link e referência; sem repetir', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'conc-aviso');
      await tx.insert(tenderCompetitors).values({ accountId: account.accountId, userId: account.ownerId, cnpj: ALFA, nickname: 'Alfa Rival', notifySince: LONG_AGO });
      const today = sampleContract(1, { supplierDocument: ALFA, supplierName: 'Alfa Ltda', contractObject: 'Limpeza predial', publishedAt: `${TODAY}T08:00:00` });
      const sixDaysAgo = sampleContract(2, { supplierDocument: ALFA, contractObject: 'Vigilância armada', publishedAt: '2026-10-07T10:00:00' });
      const firstDayOfWindow = sampleContract(3, { supplierDocument: ALFA, publishedAt: '2026-10-06T23:59:59' });
      const tooOld = sampleContract(4, { supplierDocument: ALFA, publishedAt: '2026-10-05T12:00:00' });
      const notMonitored = sampleContract(5, { supplierDocument: BETA, publishedAt: `${TODAY}T08:00:00` });
      const federal = sampleContract(6, { pncpControlNumber: FEDERAL_KEY, supplierDocument: ALFA, publishedAt: `${TODAY}T09:00:00` });

      await withContracts(tx, [today, sixDaysAgo, firstDayOfWindow, tooOld, notMonitored, federal], async (context) => {
        const summary = await notifyCompetitorContracts(context, TODAY);
        assert.equal(summary.contractsFound, 4, 'os 4 de ALFA dentro da janela; o de 8 dias atrás e o de BETA ficam de fora');
        assert.equal(summary.created, 4);
        assert.ok(summary.monitored >= 1 && summary.cnpjs >= 1);

        const notices = await noticesOf(tx, [account.accountId]);
        assert.deepEqual(
          notices.map((notice) => [notice.contractKey, notice.reference]),
          [
            [federal.pncpControlNumber, TODAY],
            [today.pncpControlNumber, TODAY],
            [sixDaysAgo.pncpControlNumber, '2026-10-07'],
            [firstDayOfWindow.pncpControlNumber, '2026-10-06'],
          ].sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? '')),
          'um aviso por contrato, com o dia da publicação como referência',
        );
        const first = notices.find((notice) => notice.contractKey === today.pncpControlNumber);
        assert.equal(first?.title, 'Novo contrato de Alfa Rival', 'o apelido tem prioridade sobre o nome do contrato');
        assert.equal(first?.message, 'Limpeza predial');
        assert.equal(first?.link, `/contratos/${encodeURIComponent(today.pncpControlNumber)}`);
        assert.ok(first?.link.endsWith('%2F2026'), 'a barra da chave vai codificada no link');
        assert.equal(notices.find((notice) => notice.contractKey === FEDERAL_KEY)?.link, `/contratos/${encodeURIComponent(FEDERAL_KEY)}`, 'a chave federal também avisa');

        const again = await notifyCompetitorContracts(context, TODAY);
        assert.equal(again.created, 0, 'a segunda execução não repete');
        assert.equal((await noticesOf(tx, [account.accountId])).length, 4);
      });
    });
  });

  test('sem apelido o título usa o nome do fornecedor no contrato; sem nome, o CNPJ formatado', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'conc-titulo');
      await tx.insert(tenderCompetitors).values([
        { accountId: account.accountId, userId: account.ownerId, cnpj: ALFA, notifySince: LONG_AGO },
        { accountId: account.accountId, userId: account.ownerId, cnpj: BETA, nickname: '', notifySince: LONG_AGO },
      ]);
      const named = sampleContract(1, { supplierDocument: ALFA, supplierName: 'Alfa Ltda', publishedAt: `${TODAY}T08:00:00` });
      const unnamed = sampleContract(2, { supplierDocument: BETA, supplierName: null, publishedAt: `${TODAY}T08:00:00` });

      await withContracts(tx, [named, unnamed], async (context) => {
        await notifyCompetitorContracts(context, TODAY);
        const titles = new Map((await noticesOf(tx, [account.accountId])).map((notice) => [notice.contractKey, notice.title]));
        assert.equal(titles.get(named.pncpControlNumber), 'Novo contrato de Alfa Ltda');
        assert.equal(titles.get(unnamed.pncpControlNumber), `Novo contrato de ${formatCnpj(BETA)}`);
      });
    });
  });

  test('aviso_desde: só contratos publicados no dia dele (em Brasília) ou depois; cada pessoa recebe o que vale para ela', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'conc-desde');
      const second = await createTestUser(tx, 'conc-desde-segunda');
      const third = await createTestUser(tx, 'conc-desde-terceira');
      await tx.insert(tenderCompetitors).values([
        // O dia 12 em Brasília, à noite: contratos publicados no dia 12 entram, mesmo os mais cedo.
        { accountId: account.accountId, userId: account.ownerId, cnpj: ALFA, notifySince: '2026-10-12 22:30:00-03' },
        // 01:30 de 13/10 em UTC ainda é 12/10 em Brasília (22:30): o dia vale pelo calendário de Brasília.
        { accountId: account.accountId, userId: second, cnpj: ALFA, notifySince: '2026-10-13 01:30:00+00' },
        { accountId: account.accountId, userId: third, cnpj: ALFA, notifySince: '2026-10-13 14:00:00-03' },
      ]);
      const before = sampleContract(1, { supplierDocument: ALFA, publishedAt: '2026-10-11T23:00:00' });
      const sameDayEarlier = sampleContract(2, { supplierDocument: ALFA, publishedAt: '2026-10-12T00:10:00' });
      const today = sampleContract(3, { supplierDocument: ALFA, publishedAt: `${TODAY}T08:00:00` });

      await withContracts(tx, [before, sameDayEarlier, today], async (context) => {
        await notifyCompetitorContracts(context, TODAY);
        const byUser = new Map<number, string[]>();
        for (const notice of await noticesOf(tx, [account.accountId])) {
          byUser.set(notice.userId, [...(byUser.get(notice.userId) ?? []), notice.contractKey ?? '']);
        }
        const expectedTwo = [sameDayEarlier.pncpControlNumber, today.pncpControlNumber].sort();
        assert.deepEqual(byUser.get(account.ownerId)?.sort(), expectedTwo, 'aviso_desde de 12/10 (noite): os de 12 e 13');
        assert.deepEqual(byUser.get(second)?.sort(), expectedTwo, '01:30 UTC de 13/10 é 22:30 de 12/10 em Brasília');
        assert.deepEqual(byUser.get(third), [today.pncpControlNumber], 'aviso_desde de 13/10: só o de 13');
        assert.equal([...byUser.values()].flat().includes(before.pncpControlNumber), false, 'o de 11/10 é anterior ao aviso de todos');
      });
    });
  });

  test('aviso desligado, conta sem o módulo: não recebem; cada pessoa e cada conta recebe o seu aviso do mesmo contrato', async () => {
    await withRollback(async (tx) => {
      const accountA = await createTestAccount(tx, 'conc-dest-a');
      const colleagueA = await createTestUser(tx, 'conc-dest-a-colega');
      const accountB = await createTestAccount(tx, 'conc-dest-b');
      const quiet = await createTestAccount(tx, 'conc-dest-quieta');
      const withoutModule = await createTestAccount(tx, 'conc-dest-sem-modulo', { enabled: false });
      await tx.insert(tenderCompetitors).values([
        { accountId: accountA.accountId, userId: accountA.ownerId, cnpj: ALFA, notifySince: LONG_AGO },
        { accountId: accountA.accountId, userId: colleagueA, cnpj: ALFA, notifySince: LONG_AGO },
        { accountId: accountB.accountId, userId: accountB.ownerId, cnpj: ALFA, notifySince: LONG_AGO },
        { accountId: quiet.accountId, userId: quiet.ownerId, cnpj: ALFA, notify: false, notifySince: LONG_AGO },
        { accountId: withoutModule.accountId, userId: withoutModule.ownerId, cnpj: ALFA, notifySince: LONG_AGO },
      ]);
      const contract = sampleContract(1, { supplierDocument: ALFA, publishedAt: `${TODAY}T08:00:00` });

      await withContracts(tx, [contract], async (context) => {
        const summary = await notifyCompetitorContracts(context, TODAY);
        assert.equal(summary.created, 3, 'a titular e a colega da conta A e a titular da conta B');
        const notices = await noticesOf(tx, [accountA.accountId, accountB.accountId, quiet.accountId, withoutModule.accountId]);
        assert.deepEqual(
          notices.map((notice) => [notice.accountId, notice.userId]).sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!),
          [
            [accountA.accountId, accountA.ownerId],
            [accountA.accountId, colleagueA],
            [accountB.accountId, accountB.ownerId],
          ].sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!),
        );
      });
    });
  });
});
