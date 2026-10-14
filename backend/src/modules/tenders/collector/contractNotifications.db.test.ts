import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import { uniqueToken } from '../services/apiTestSupport';
import { tenderContractFavorites, tenderContractSavedSearches, tenderContracts, tenderNotifications } from '../db/schema';
import { notifyContractExpirations } from './contractNotifications';
import { addCalendarDays } from './dates';
import type { TendersDb } from './database';
import { closeLocalTestDatabase, createTestAccount, databaseTestsSkipReason, insertTestContract, withRollback } from './dbTestSupport';

// Avisos de vencimento dos contratos (plano dos contratos a vencer, Parte B):
// janelas de 90 e 30 dias nas buscas salvas e nos favoritos, sem repetir, só
// para contas com acesso, e aviso de novo quando o vencimento muda. Chama a
// regra direto, sem a execução: a trava dos contratos é testada em
// contractRuns.db.test.ts, porque os arquivos de teste rodam em paralelo.

const TODAY = '2026-10-13';
const inDays = (days: number) => addCalendarDays(TODAY, days);

async function noticesOf(tx: TendersDb, contractIds: number[]) {
  const rows = await tx
    .select({
      contractId: tenderNotifications.contractId,
      accountId: tenderNotifications.accountId,
      type: tenderNotifications.type,
      title: tenderNotifications.title,
      reference: tenderNotifications.reference,
    })
    .from(tenderNotifications)
    .where(inArray(tenderNotifications.contractId, contractIds));
  return rows.sort((a, b) => (a.contractId ?? 0) - (b.contractId ?? 0) || a.type.localeCompare(b.type));
}

describe('avisos de vencimento dos contratos (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('busca salva com Notificar: 90 dias entre hoje + 84 e + 90; 30 dias entre hoje + 24 e + 30', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'aviso-busca');
      const token = uniqueToken();
      await tx.insert(tenderContractSavedSearches).values({ accountId: account.accountId, userId: account.ownerId, name: 'Limpeza', terms: [token] });
      const contract = (days: number) => insertTestContract(tx, { contractObject: `Limpeza ${token}`, expiresOn: inDays(days) });
      const at84 = await contract(84);
      const at90 = await contract(90);
      const at83 = await contract(83);
      const at91 = await contract(91);
      const at24 = await contract(24);
      const at30 = await contract(30);
      const at23 = await contract(23);

      await notifyContractExpirations(tx, TODAY);
      const notices = await noticesOf(tx, [at84, at90, at83, at91, at24, at30, at23]);
      assert.deepEqual(
        notices.map((notice) => [notice.contractId, notice.type]),
        [
          [at84, 'CONTRATO_VENCE_90D'],
          [at90, 'CONTRATO_VENCE_90D'],
          [at24, 'CONTRATO_VENCE_30D'],
          [at30, 'CONTRATO_VENCE_30D'],
        ],
      );
      assert.equal(notices[0]?.title, 'Contrato vence em até 90 dias: Limpeza');
      assert.equal(notices[0]?.reference, inDays(84));
    });
  });

  test('busca salva pausada ou sem Notificar não avisa; conta sem acesso também não', async () => {
    await withRollback(async (tx) => {
      const token = uniqueToken();
      const paused = await createTestAccount(tx, 'aviso-pausada');
      const quiet = await createTestAccount(tx, 'aviso-quieta');
      const withoutModule = await createTestAccount(tx, 'aviso-sem-modulo', { enabled: false });
      await tx.insert(tenderContractSavedSearches).values([
        { accountId: paused.accountId, userId: paused.ownerId, name: 'Pausada', terms: [token], active: false },
        { accountId: quiet.accountId, userId: quiet.ownerId, name: 'Quieta', terms: [token], notify: false },
        { accountId: withoutModule.accountId, userId: withoutModule.ownerId, name: 'Sem módulo', terms: [token] },
      ]);
      const contractId = await insertTestContract(tx, { contractObject: `Vigilância ${token}`, expiresOn: inDays(87) });
      await tx.insert(tenderContractFavorites).values({ accountId: withoutModule.accountId, userId: withoutModule.ownerId, contractId });

      await notifyContractExpirations(tx, TODAY);
      assert.deepEqual(await noticesOf(tx, [contractId]), []);
    });
  });

  test('favoritos: 90 dias entre hoje + 31 e + 90, 30 dias até hoje + 30; um aviso por janela, sem repetir', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'aviso-favorito');
      const favorite = async (days: number) => {
        const id = await insertTestContract(tx, { expiresOn: inDays(days) });
        await tx.insert(tenderContractFavorites).values({ accountId: account.accountId, userId: account.ownerId, contractId: id });
        return id;
      };
      const at31 = await favorite(31);
      const at60 = await favorite(60);
      const at0 = await favorite(0);
      const at30 = await favorite(30);
      const at91 = await favorite(91);

      assert.equal(await notifyContractExpirations(tx, TODAY), 4);
      const notices = await noticesOf(tx, [at31, at60, at0, at30, at91]);
      assert.deepEqual(
        notices.map((notice) => [notice.contractId, notice.type]),
        [
          [at31, 'CONTRATO_VENCE_90D'],
          [at60, 'CONTRATO_VENCE_90D'],
          [at0, 'CONTRATO_VENCE_30D'],
          [at30, 'CONTRATO_VENCE_30D'],
        ].sort((a, b) => Number(a[0]) - Number(b[0]) || String(a[1]).localeCompare(String(b[1]))),
      );
      assert.ok(notices.every((notice) => notice.title.startsWith('Contrato favorito vence em até')));

      // No mesmo dia, nada se repete.
      assert.equal(await notifyContractExpirations(tx, TODAY), 0);
      // No dia seguinte, as janelas andam: avisam só os que entraram nelas (o de + 91 entra
      // na de 90 dias, e o de + 31, na de 30); os que já tinham aviso da janela não repetem.
      assert.equal(await notifyContractExpirations(tx, addCalendarDays(TODAY, 1)), 2);
      const nextDay = await noticesOf(tx, [at31, at60, at0, at30, at91]);
      assert.deepEqual(
        nextDay.filter((notice) => notice.contractId === at91 || notice.contractId === at31).map((notice) => [notice.contractId, notice.type]),
        [
          [at31, 'CONTRATO_VENCE_30D'],
          [at31, 'CONTRATO_VENCE_90D'],
          [at91, 'CONTRATO_VENCE_90D'],
        ].sort((a, b) => Number(a[0]) - Number(b[0]) || String(a[1]).localeCompare(String(b[1]))),
      );
      assert.equal(nextDay.length, 6);
    });
  });

  test('vencimento novo gera os avisos de novo; favorito e busca salva no mesmo contrato avisam uma vez', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'aviso-novo-vencimento');
      const token = uniqueToken();
      const contractId = await insertTestContract(tx, { contractObject: `Locação ${token}`, expiresOn: inDays(20) });
      await tx.insert(tenderContractFavorites).values({ accountId: account.accountId, userId: account.ownerId, contractId });
      await tx.insert(tenderContractSavedSearches).values({ accountId: account.accountId, userId: account.ownerId, name: 'Locação', terms: [token] });

      await notifyContractExpirations(tx, TODAY);
      assert.equal((await noticesOf(tx, [contractId])).length, 1);

      // Prorrogado: o vencimento novo (hoje + 25) cai de novo na janela de 30 dias.
      await tx.update(tenderContracts).set({ expiresOn: inDays(25) }).where(eq(tenderContracts.id, contractId));
      await notifyContractExpirations(tx, TODAY);
      const notices = await noticesOf(tx, [contractId]);
      assert.deepEqual(
        notices.map((notice) => notice.reference).sort(),
        [inDays(20), inDays(25)],
        'um aviso por vencimento',
      );
      assert.ok(notices.every((notice) => notice.title === 'Contrato favorito vence em até 30 dias'), 'o favorito avisa primeiro');
    });
  });
});
