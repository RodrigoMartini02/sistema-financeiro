import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { inArray } from 'drizzle-orm';
import { ContractStoreTimeoutError } from '../contractStore/reader';
import { openTestContractStore, quietLogger, sampleContract } from '../contractStore/storeTestSupport';
import { postgresSearchFields } from '../contractStore/textSearch';
import { tenderContractFavorites, tenderContractSavedSearches, tenderNotifications } from '../db/schema';
import {
  notifyChangedContractExpiry,
  notifyContractExpirations,
  updateSavedSearchTotals,
  type NotificationContext,
} from './contractNotifications';
import type { TenderContractRow } from './contractMapping';
import { addCalendarDays } from './dates';
import type { TendersDb } from './database';
import { closeLocalTestDatabase, createTestAccount, databaseTestsSkipReason, withRollback } from './dbTestSupport';

// Avisos de vencimento dos contratos (planos dos contratos a vencer, Parte B, e
// dos contratos no R2, Parte R2): janelas de 90 e 30 dias nas buscas salvas e nos
// favoritos, sem repetir, só para contas com acesso, e aviso de novo quando o
// vencimento muda. Os contratos vêm de um armazém de exemplo, e os destinatários,
// do banco local. Chama a regra direto, sem a execução: a trava dos contratos é
// testada em contractRuns.db.test.ts, porque os arquivos de teste rodam em
// paralelo.

const TODAY = '2026-10-13';
const NOW = new Date(`${TODAY}T12:00:00Z`);
const inDays = (days: number) => addCalendarDays(TODAY, days);

async function withContracts(
  tx: TendersDb,
  contracts: readonly TenderContractRow[],
  run: (context: NotificationContext) => Promise<void>,
): Promise<void> {
  const store = await openTestContractStore(contracts, { searchFields: postgresSearchFields(tx), today: TODAY });
  try {
    await run({ db: tx, contractStore: store.reader, now: () => NOW, logger: quietLogger });
  } finally {
    await store.close();
  }
}

async function noticesOf(tx: TendersDb, keys: string[]) {
  const rows = await tx
    .select({
      contractKey: tenderNotifications.contractKey,
      accountId: tenderNotifications.accountId,
      type: tenderNotifications.type,
      title: tenderNotifications.title,
      link: tenderNotifications.link,
      reference: tenderNotifications.reference,
    })
    .from(tenderNotifications)
    .where(inArray(tenderNotifications.contractKey, keys));
  return rows.sort((a, b) => (a.contractKey ?? '').localeCompare(b.contractKey ?? '') || a.type.localeCompare(b.type));
}

const byKeyAndType = (a: [string, string], b: [string, string]) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]);

describe('avisos de vencimento dos contratos (banco local e armazém de exemplo)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('busca salva com Notificar: 90 dias entre hoje + 84 e + 90; 30 dias entre hoje + 24 e + 30', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'aviso-busca');
      await tx.insert(tenderContractSavedSearches).values({ accountId: account.accountId, userId: account.ownerId, name: 'Limpeza', terms: ['limpeza'] });
      const contract = (sequence: number, days: number) => sampleContract(sequence, { contractObject: 'Limpeza predial', expiresOn: inDays(days) });
      const at84 = contract(1, 84);
      const at90 = contract(2, 90);
      const at83 = contract(3, 83);
      const at91 = contract(4, 91);
      const at24 = contract(5, 24);
      const at30 = contract(6, 30);
      const at23 = contract(7, 23);
      const all = [at84, at90, at83, at91, at24, at30, at23];

      await withContracts(tx, all, async (context) => {
        await notifyContractExpirations(context, TODAY);
        const notices = await noticesOf(tx, all.map((item) => item.pncpControlNumber));
        assert.deepEqual(
          notices.map((notice) => [notice.contractKey, notice.type] as [string, string]).sort(byKeyAndType),
          (
            [
              [at84.pncpControlNumber, 'CONTRATO_VENCE_90D'],
              [at90.pncpControlNumber, 'CONTRATO_VENCE_90D'],
              [at24.pncpControlNumber, 'CONTRATO_VENCE_30D'],
              [at30.pncpControlNumber, 'CONTRATO_VENCE_30D'],
            ] as Array<[string, string]>
          ).sort(byKeyAndType),
        );
        const first = notices.find((notice) => notice.contractKey === at84.pncpControlNumber);
        assert.equal(first?.title, 'Contrato vence em até 90 dias: Limpeza');
        assert.equal(first?.reference, inDays(84));
        assert.equal(first?.link, `/contratos/${encodeURIComponent(at84.pncpControlNumber)}`);
        assert.ok(first?.link.endsWith('%2F2026'), 'a barra da chave vai codificada no link');
      });
    });
  });

  test('busca salva pausada ou sem Notificar não avisa; conta sem acesso também não', async () => {
    await withRollback(async (tx) => {
      const paused = await createTestAccount(tx, 'aviso-pausada');
      const quiet = await createTestAccount(tx, 'aviso-quieta');
      const withoutModule = await createTestAccount(tx, 'aviso-sem-modulo', { enabled: false });
      await tx.insert(tenderContractSavedSearches).values([
        { accountId: paused.accountId, userId: paused.ownerId, name: 'Pausada', terms: ['vigilância'], active: false },
        { accountId: quiet.accountId, userId: quiet.ownerId, name: 'Quieta', terms: ['vigilância'], notify: false },
        { accountId: withoutModule.accountId, userId: withoutModule.ownerId, name: 'Sem módulo', terms: ['vigilância'] },
      ]);
      const contract = sampleContract(1, { contractObject: 'Vigilância armada', expiresOn: inDays(87) });
      await tx.insert(tenderContractFavorites).values({ accountId: withoutModule.accountId, userId: withoutModule.ownerId, contractKey: contract.pncpControlNumber });

      await withContracts(tx, [contract], async (context) => {
        assert.equal(await notifyContractExpirations(context, TODAY), 0);
        assert.deepEqual(await noticesOf(tx, [contract.pncpControlNumber]), []);
      });
    });
  });

  test('favoritos: 90 dias entre hoje + 31 e + 90, 30 dias até hoje + 30; um aviso por janela, sem repetir', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'aviso-favorito');
      const at31 = sampleContract(1, { expiresOn: inDays(31) });
      const at60 = sampleContract(2, { expiresOn: inDays(60) });
      const at0 = sampleContract(3, { expiresOn: inDays(0) });
      const at30 = sampleContract(4, { expiresOn: inDays(30) });
      const at91 = sampleContract(5, { expiresOn: inDays(91) });
      const all = [at31, at60, at0, at30, at91];
      await tx
        .insert(tenderContractFavorites)
        .values(all.map((item) => ({ accountId: account.accountId, userId: account.ownerId, contractKey: item.pncpControlNumber })));
      const keys = all.map((item) => item.pncpControlNumber);

      await withContracts(tx, all, async (context) => {
        assert.equal(await notifyContractExpirations(context, TODAY), 4);
        const notices = await noticesOf(tx, keys);
        assert.deepEqual(
          notices.map((notice) => [notice.contractKey, notice.type] as [string, string]).sort(byKeyAndType),
          (
            [
              [at31.pncpControlNumber, 'CONTRATO_VENCE_90D'],
              [at60.pncpControlNumber, 'CONTRATO_VENCE_90D'],
              [at0.pncpControlNumber, 'CONTRATO_VENCE_30D'],
              [at30.pncpControlNumber, 'CONTRATO_VENCE_30D'],
            ] as Array<[string, string]>
          ).sort(byKeyAndType),
        );
        assert.ok(notices.every((notice) => notice.title.startsWith('Contrato favorito vence em até')));

        // No mesmo dia, nada se repete.
        assert.equal(await notifyContractExpirations(context, TODAY), 0);
        // No dia seguinte, as janelas andam: avisam só os que entraram nelas (o de + 91 entra
        // na de 90 dias, e o de + 31, na de 30); os que já tinham aviso da janela não repetem.
        assert.equal(await notifyContractExpirations(context, addCalendarDays(TODAY, 1)), 2);
        const nextDay = await noticesOf(tx, keys);
        assert.deepEqual(
          nextDay
            .filter((notice) => notice.contractKey === at91.pncpControlNumber || notice.contractKey === at31.pncpControlNumber)
            .map((notice) => [notice.contractKey, notice.type] as [string, string])
            .sort(byKeyAndType),
          (
            [
              [at31.pncpControlNumber, 'CONTRATO_VENCE_30D'],
              [at31.pncpControlNumber, 'CONTRATO_VENCE_90D'],
              [at91.pncpControlNumber, 'CONTRATO_VENCE_90D'],
            ] as Array<[string, string]>
          ).sort(byKeyAndType),
        );
        assert.equal(nextDay.length, 6);
      });
    });
  });

  test('vencimento novo gera os avisos de novo; favorito e busca salva no mesmo contrato avisam uma vez', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'aviso-novo-vencimento');
      const before = sampleContract(1, { contractObject: 'Locação de veículos', expiresOn: inDays(20) });
      const after = { ...before, expiresOn: inDays(25) };
      await tx.insert(tenderContractFavorites).values({ accountId: account.accountId, userId: account.ownerId, contractKey: before.pncpControlNumber });
      await tx.insert(tenderContractSavedSearches).values({ accountId: account.accountId, userId: account.ownerId, name: 'Locação', terms: ['locação'] });

      await withContracts(tx, [before], async (context) => {
        await notifyContractExpirations(context, TODAY);
        assert.equal((await noticesOf(tx, [before.pncpControlNumber])).length, 1);
      });

      // Prorrogado: o vencimento novo (hoje + 25) cai de novo na janela de 30 dias.
      await withContracts(tx, [after], async (context) => {
        await notifyContractExpirations(context, TODAY);
        const notices = await noticesOf(tx, [before.pncpControlNumber]);
        assert.deepEqual(notices.map((notice) => notice.reference).sort(), [inDays(20), inDays(25)], 'um aviso por vencimento');
        assert.ok(notices.every((notice) => notice.title === 'Contrato favorito vence em até 30 dias'), 'o favorito avisa primeiro');
      });
    });
  });

  test('CONTRATO_ALTERADO: só para quem favoritou e tem acesso, com o vencimento novo; sem vencimento não avisa; sem repetir', async () => {
    await withRollback(async (tx) => {
      const fan = await createTestAccount(tx, 'alterado-favorito');
      const bystander = await createTestAccount(tx, 'alterado-sem-favorito');
      const withoutModule = await createTestAccount(tx, 'alterado-sem-modulo', { enabled: false });
      const changed = sampleContract(1, { contractObject: 'Manutenção de elevadores' });
      const noLongerDated = sampleContract(2, { contractObject: 'Contrato sem data' });
      for (const account of [fan, withoutModule]) {
        await tx.insert(tenderContractFavorites).values([
          { accountId: account.accountId, userId: account.ownerId, contractKey: changed.pncpControlNumber },
          { accountId: account.accountId, userId: account.ownerId, contractKey: noLongerDated.pncpControlNumber },
        ]);
      }

      const changes = [
        { controlNumber: changed.pncpControlNumber, expiresOn: '2026-12-31', contractObject: changed.contractObject },
        { controlNumber: noLongerDated.pncpControlNumber, expiresOn: null, contractObject: noLongerDated.contractObject },
      ];
      assert.equal(await notifyChangedContractExpiry(tx, changes), 1);
      const notices = await noticesOf(tx, [changed.pncpControlNumber, noLongerDated.pncpControlNumber]);
      assert.deepEqual(notices, [
        {
          contractKey: changed.pncpControlNumber,
          accountId: fan.accountId,
          type: 'CONTRATO_ALTERADO',
          title: 'Vencimento de contrato favorito mudou para 31/12/2026',
          link: `/contratos/${encodeURIComponent(changed.pncpControlNumber)}`,
          reference: '2026-12-31',
        },
      ]);
      assert.equal(notices.some((notice) => notice.accountId === bystander.accountId), false);

      assert.equal(await notifyChangedContractExpiry(tx, changes), 0, 'mesmo vencimento: sem aviso novo');
      assert.equal(await notifyChangedContractExpiry(tx, []), 0);
      assert.equal(await notifyChangedContractExpiry(tx, [{ ...changes[0]!, expiresOn: '2027-03-31' }]), 1, 'vencimento novo: aviso novo');
    });
  });

  test('total "vigentes agora": atualiza todas as buscas das contas com acesso (as pausadas também) e conta a que o armazém não conseguiu', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'aviso-totais');
      const withoutModule = await createTestAccount(tx, 'aviso-totais-sem-modulo', { enabled: false });
      const [limpeza, pausada, outraConta] = await tx
        .insert(tenderContractSavedSearches)
        .values([
          { accountId: account.accountId, userId: account.ownerId, name: 'Limpeza', terms: ['limpeza'] },
          { accountId: account.accountId, userId: account.ownerId, name: 'Pausada', terms: ['vigilância'], active: false },
          { accountId: withoutModule.accountId, userId: withoutModule.ownerId, name: 'Outra', terms: ['limpeza'] },
        ])
        .returning();
      const contracts = [
        sampleContract(1, { contractObject: 'Limpeza predial', expiresOn: inDays(200) }),
        sampleContract(2, { contractObject: 'Limpeza urbana', expiresOn: inDays(300) }),
        sampleContract(3, { contractObject: 'Vigilância armada', expiresOn: inDays(100) }),
        sampleContract(4, { contractObject: 'Limpeza vencida', termStart: '2024-01-01', originalTermEnd: inDays(-5), expiresOn: inDays(-5) }),
      ];
      await withContracts(tx, contracts, async (context) => {
        const summary = await updateSavedSearchTotals(context);
        assert.deepEqual(summary, { searches: 2, updated: 2, failed: 0 });
        const rows = await tx
          .select({ id: tenderContractSavedSearches.id, total: tenderContractSavedSearches.activeTotal, at: tenderContractSavedSearches.activeTotalAt })
          .from(tenderContractSavedSearches)
          .where(inArray(tenderContractSavedSearches.id, [limpeza!.id, pausada!.id, outraConta!.id]));
        const totals = new Map(rows.map((row) => [row.id, row]));
        assert.equal(totals.get(limpeza!.id)?.total, 2, 'só os vigentes');
        assert.ok(totals.get(limpeza!.id)?.at);
        assert.equal(totals.get(pausada!.id)?.total, 1);
        assert.equal(totals.get(outraConta!.id)?.total, null, 'conta sem acesso fica como está');

        // Uma consulta lenta demais não derruba a rotina: a busca fica com o total anterior.
        const slow: NotificationContext = {
          ...context,
          contractStore: { ...context.contractStore, query: () => Promise.reject(new ContractStoreTimeoutError()) },
        };
        assert.deepEqual(await updateSavedSearchTotals(slow), { searches: 2, updated: 0, failed: 2 });
      });
    });
  });
});
