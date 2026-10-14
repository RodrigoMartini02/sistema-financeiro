import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import { tenderContracts } from '../db/schema';
import {
  databaseSizeMb,
  deleteExpiredContracts,
  markBackfillDayCompleted,
  readCompletedBackfillDays,
  readNewestBackfillDay,
  readStoredContracts,
  upsertContractPage,
} from './contractRepository';
import { buildContractRow, closeLocalTestDatabase, databaseTestsSkipReason, insertTestContract, withRollback } from './dbTestSupport';

describe('repositório de contratos (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('upsert: novo, inalterado e atualizado (pelo hash ou pelo vencimento)', async () => {
    await withRollback(async (tx) => {
      const first = buildContractRow({ contractObject: 'Manutenção predial' });
      const second = buildContractRow({ contractObject: 'Locação de veículos' });

      assert.deepEqual(await upsertContractPage(tx, [first, second]), { insertedCount: 2, updatedCount: 0, unchangedCount: 0 });
      assert.deepEqual(await upsertContractPage(tx, [first, second]), { insertedCount: 0, updatedCount: 0, unchangedCount: 2 });

      const newHash = buildContractRow({ ...first, contractObject: 'Manutenção predial e elétrica', payloadHash: 'b'.repeat(64) });
      assert.deepEqual(await upsertContractPage(tx, [newHash]), { insertedCount: 0, updatedCount: 1, unchangedCount: 0 });

      const extended = { ...second, expiresOn: '2028-01-01', amendments: [], amendmentsReference: '2026-10-09T10:00:00' };
      assert.deepEqual(await upsertContractPage(tx, [extended]), { insertedCount: 0, updatedCount: 1, unchangedCount: 0 });

      const stored = await tx
        .select({ object: tenderContracts.contractObject, expiresOn: tenderContracts.expiresOn })
        .from(tenderContracts)
        .where(inArray(tenderContracts.pncpControlNumber, [first.pncpControlNumber, second.pncpControlNumber]))
        .orderBy(tenderContracts.id);
      assert.deepEqual(stored, [
        { object: 'Manutenção predial e elétrica', expiresOn: '2027-01-01' },
        { object: 'Locação de veículos', expiresOn: '2028-01-01' },
      ]);
    });
  });

  test('upsert: o mesmo contrato duas vezes na página fica o último', async () => {
    await withRollback(async (tx) => {
      const row = buildContractRow();
      const result = await upsertContractPage(tx, [row, { ...row, contractObject: 'Versão mais nova' }]);
      assert.equal(result.insertedCount, 1);
      const [stored] = await tx
        .select({ object: tenderContracts.contractObject })
        .from(tenderContracts)
        .where(eq(tenderContracts.pncpControlNumber, row.pncpControlNumber));
      assert.equal(stored?.object, 'Versão mais nova');
    });
  });

  test('leitura em lote: a conferência dos termos volta no formato da data do PNCP, para comparar', async () => {
    await withRollback(async (tx) => {
      const checked = buildContractRow({ amendments: [], amendmentsReference: '2026-10-09T10:20:30', expiresOn: '2027-06-30' });
      const unchecked = buildContractRow();
      await upsertContractPage(tx, [checked, unchecked]);

      const stored = await readStoredContracts(tx, [checked.pncpControlNumber, unchecked.pncpControlNumber, 'NAO-EXISTE']);
      assert.equal(stored.size, 2);
      assert.deepEqual(stored.get(checked.pncpControlNumber), {
        amendments: [],
        amendmentsReference: '2026-10-09T10:20:30',
        expiresOn: '2027-06-30',
      });
      assert.deepEqual(stored.get(unchecked.pncpControlNumber), { amendments: null, amendmentsReference: null, expiresOn: '2027-01-01' });
      assert.equal((await readStoredContracts(tx, [])).size, 0);
    });
  });

  test('dias da carga: só os concluídos da faixa e o mais recente', async () => {
    await withRollback(async (tx) => {
      await markBackfillDayCompleted(tx, '2019-03-01', { recordsRead: 10, storedCount: 2, termsChecked: 1 });
      await markBackfillDayCompleted(tx, '2019-03-03', { recordsRead: 5, storedCount: 1, termsChecked: 0 });
      // Marcar de novo o mesmo dia só atualiza os números.
      await markBackfillDayCompleted(tx, '2019-03-03', { recordsRead: 6, storedCount: 1, termsChecked: 0 });

      assert.deepEqual([...(await readCompletedBackfillDays(tx, '2019-03-01', '2019-03-02'))], ['2019-03-01']);
      assert.deepEqual([...(await readCompletedBackfillDays(tx, '2019-03-01', '2019-03-31'))].sort(), ['2019-03-01', '2019-03-03']);
      const newest = await readNewestBackfillDay(tx);
      assert.ok(newest !== null && newest >= '2019-03-03');
    });
  });

  test('limpeza: apaga só os contratos com vencimento antes de hoje', async () => {
    await withRollback(async (tx) => {
      const expired = await insertTestContract(tx, { expiresOn: '2026-10-12' });
      const dueToday = await insertTestContract(tx, { expiresOn: '2026-10-13' });
      const future = await insertTestContract(tx, { expiresOn: '2027-01-01' });

      const removed = await deleteExpiredContracts(tx, '2026-10-13');
      assert.ok(removed >= 1);
      const remaining = await tx
        .select({ id: tenderContracts.id })
        .from(tenderContracts)
        .where(inArray(tenderContracts.id, [expired, dueToday, future]));
      assert.deepEqual(remaining.map((row) => row.id).sort((a, b) => a - b), [dueToday, future].sort((a, b) => a - b));
    });
  });

  test('tamanho do banco em MB, como a carga confere', async () => {
    await withRollback(async (tx) => {
      assert.ok((await databaseSizeMb(tx)) > 1);
    });
  });

  // A trava dos contratos é testada em contractRuns.db.test.ts: os arquivos de
  // teste rodam em paralelo, e segurá-la aqui faria aquelas execuções saírem.
});
