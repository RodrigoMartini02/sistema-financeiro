import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { tenderFederalAgencies } from '../db/schema';
import { closeLocalTestDatabase, databaseTestsSkipReason, withRollback } from './dbTestSupport';
import type { TendersDb } from './database';
import type { FederalAgency } from './federalMapping';
import {
  markFederalCycle,
  markFederalLoad,
  markFederalRemeasure,
  readAllFederalAgencies,
  readCycleAgencies,
  readFederalAgency,
  readFederalProgress,
  readLoadAgencies,
  readRemeasureAgencies,
  syncFederalAgencies,
  type FederalReadMark,
} from './federalProgress';

// O andamento dos contratos federais sobre o banco local, cada teste numa transação desfeita no fim. Precisam da migration
// 0087d no banco local (licitacoes.federal_orgao).

const NOW = new Date('2026-10-26T12:00:00Z');
const FROM_YEAR = 2021;
const UFMG_CNPJ = '17217985005840';

const agency = (code: string, overrides: Partial<FederalAgency> = {}): FederalAgency => ({ code, name: `ÓRGÃO ${code}`, cnpj: UFMG_CNPJ, usesSisg: true, ...overrides });

const mark = (code: string, overrides: Partial<FederalReadMark> = {}): FederalReadMark => ({
  code,
  hadRows: true,
  latestEnd: null,
  lastInclusion: null,
  pncpCnpj: null,
  ...overrides,
});

/** O teste parte da tabela vazia: o banco local pode ter os órgãos de uma conferência. */
async function emptyTable(tx: TendersDb): Promise<void> {
  await tx.delete(tenderFederalAgencies);
}

const codes = (states: ReadonlyArray<{ code: string }>) => states.map((state) => state.code);

describe('andamento dos contratos federais (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('sincronização: os novos entram sem andamento; nome e CNPJ mudados são corrigidos; o que saiu da lista fica', async () => {
    await withRollback(async (tx) => {
      await emptyTable(tx);
      assert.deepEqual(await syncFederalAgencies(tx, [agency('26238'), agency('52121', { cnpj: null })]), { total: 2, inserted: 2, updated: 0 });
      const first = await readFederalAgency(tx, '26238');
      assert.deepEqual(
        { ...first },
        {
          code: '26238',
          name: 'ÓRGÃO 26238',
          registeredCnpj: UFMG_CNPJ,
          pncpCnpj: null,
          hasData: null,
          oldestLoadedYear: null,
          cycleReadAt: null,
          latestEnd: null,
          measuredAt: null,
          lastInclusion: null,
        },
      );
      assert.equal((await readFederalAgency(tx, '52121'))?.registeredCnpj, null);

      await markFederalLoad(tx, { ...mark('26238'), oldestYear: 2025, finished: false }, NOW);
      // Nada mudou: nada é regravado. Mudou o nome de um e o CNPJ de outro: só esses; o órgão que sumiu da lista continua.
      assert.deepEqual(await syncFederalAgencies(tx, [agency('26238'), agency('52121', { cnpj: null })]), { total: 2, inserted: 0, updated: 0 });
      assert.deepEqual(await syncFederalAgencies(tx, [agency('26238', { name: 'UFMG' }), agency('52121', { cnpj: '00394452000103' }), agency('36000')]), {
        total: 3,
        inserted: 1,
        updated: 2,
      });
      assert.equal((await readFederalAgency(tx, '26238'))?.name, 'UFMG');
      assert.equal((await readFederalAgency(tx, '26238'))?.oldestLoadedYear, 2025, 'o andamento não se perde');
      assert.equal((await readFederalAgency(tx, '52121'))?.registeredCnpj, '00394452000103');

      assert.deepEqual(await syncFederalAgencies(tx, [agency('36000')]), { total: 3, inserted: 0, updated: 0 });
      assert.equal((await readAllFederalAgencies(tx)).length, 3);
      assert.equal(await readFederalAgency(tx, '99999'), null);
    });
  });

  test('carga pendente: sem andamento ou com o ano mais antigo depois do ano de início, em ordem numérica de código', async () => {
    await withRollback(async (tx) => {
      await emptyTable(tx);
      await syncFederalAgencies(tx, [agency('100'), agency('9'), agency('26238'), agency('10'), agency('1000')]);
      assert.deepEqual(codes(await readLoadAgencies(tx, FROM_YEAR)), ['9', '10', '100', '1000', '26238'], 'o código é texto, mas a ordem é a numérica');

      await markFederalLoad(tx, { ...mark('9'), oldestYear: 2021, finished: true }, NOW);
      await markFederalLoad(tx, { ...mark('10'), oldestYear: 2024, finished: false }, NOW);
      assert.deepEqual(codes(await readLoadAgencies(tx, FROM_YEAR)), ['10', '100', '1000', '26238'], 'o órgão lido até 2021 sai');
      assert.deepEqual(codes(await readLoadAgencies(tx, 2024)), ['100', '1000', '26238'], 'com o início em 2024, o lido até 2024 também sai');
    });
  });

  test('marca da carga: o ano mais antigo só desce; com contrato vira "com dado"; terminada sem contrato vira "sem dado" e medida', async () => {
    await withRollback(async (tx) => {
      await emptyTable(tx);
      await syncFederalAgencies(tx, [agency('1'), agency('2'), agency('3')]);

      await markFederalLoad(tx, { ...mark('1', { latestEnd: '2027-05-01', lastInclusion: '2026-09-03T10:00:00', pncpCnpj: '17217985000104' }), oldestYear: 2025, finished: false }, NOW);
      await markFederalLoad(tx, { ...mark('1', { latestEnd: '2026-01-01', lastInclusion: '2026-01-02T10:00:00', hadRows: false }), oldestYear: 2023, finished: false }, NOW);
      // Uma marca de ano mais novo (repetição de um reparo) não faz o andamento subir.
      await markFederalLoad(tx, { ...mark('1', { hadRows: false }), oldestYear: 2026, finished: false }, NOW);
      const one = await readFederalAgency(tx, '1');
      assert.deepEqual(
        [one?.oldestLoadedYear, one?.hasData, one?.latestEnd, one?.lastInclusion, one?.pncpCnpj, one?.measuredAt],
        [2023, true, '2027-05-01', '2026-09-03 10:00:00', '17217985000104', null],
        'o maior fim e a maior inclusão só sobem, e o CNPJ do PNCP fica',
      );

      // Sem contrato nenhum e a carga chegou ao ano de início: não tem dado, e a medição fica registrada.
      await markFederalLoad(tx, { ...mark('2', { hadRows: false }), oldestYear: 2025, finished: false }, NOW);
      assert.equal((await readFederalAgency(tx, '2'))?.hasData, null, 'ainda não terminou: pode ter dado nos anos mais antigos');
      await markFederalLoad(tx, { ...mark('2', { hadRows: false }), oldestYear: 2021, finished: true }, NOW);
      const two = await readFederalAgency(tx, '2');
      assert.deepEqual([two?.hasData, two?.oldestLoadedYear], [false, 2021]);
      assert.ok(two?.measuredAt, 'medido');

      // Um órgão com dado que termina a carga sem contrato nos anos mais antigos continua com dado.
      await markFederalLoad(tx, { ...mark('3'), oldestYear: 2025, finished: false }, NOW);
      await markFederalLoad(tx, { ...mark('3', { hadRows: false }), oldestYear: 2021, finished: true }, NOW);
      assert.equal((await readFederalAgency(tx, '3'))?.hasData, true);
    });
  });

  test('ciclo: só órgãos com dado e sem ciclo há 7 dias, os nunca lidos e os mais atrasados primeiro', async () => {
    await withRollback(async (tx) => {
      await emptyTable(tx);
      await syncFederalAgencies(tx, [agency('1'), agency('2'), agency('3'), agency('4'), agency('5')]);
      for (const code of ['1', '2', '3', '4']) {
        await markFederalLoad(tx, { ...mark(code), oldestYear: 2021, finished: true }, NOW);
      }
      // 5 não foi medido; 4 foi lido há 2 dias; 3 há 8 dias; 2 há 30 dias; 1 nunca.
      await markFederalCycle(tx, mark('4'), new Date('2026-10-24T12:00:00Z'));
      await markFederalCycle(tx, mark('3'), new Date('2026-10-18T12:00:00Z'));
      await markFederalCycle(tx, mark('2'), new Date('2026-09-26T12:00:00Z'));

      assert.deepEqual(codes(await readCycleAgencies(tx, NOW)), ['1', '2', '3']);
      assert.deepEqual(codes(await readCycleAgencies(tx, new Date('2026-11-05T12:00:00Z'))), ['1', '2', '3', '4'], 'dez dias depois, o 4 também venceu');
      assert.ok((await readFederalAgency(tx, '4'))?.cycleReadAt);
    });
  });

  test('medição: só órgãos sem dado, medidos há mais de 90 dias; com contrato nos anos medidos, passam a ter dado', async () => {
    await withRollback(async (tx) => {
      await emptyTable(tx);
      await syncFederalAgencies(tx, [agency('1'), agency('2'), agency('3')]);
      await markFederalLoad(tx, { ...mark('1', { hadRows: false }), oldestYear: 2021, finished: true }, NOW);
      await markFederalLoad(tx, { ...mark('2', { hadRows: false }), oldestYear: 2021, finished: true }, NOW);
      await markFederalLoad(tx, { ...mark('3'), oldestYear: 2021, finished: true }, NOW);
      await tx.update(tenderFederalAgencies).set({ measuredAt: '2026-06-01T12:00:00Z' }).where(eq(tenderFederalAgencies.agencyCode, '1'));

      // O 1 foi medido em 01/06 (147 dias); o 2, agora; o 3 tem dado.
      assert.deepEqual(codes(await readRemeasureAgencies(tx, NOW)), ['1']);
      await markFederalRemeasure(tx, mark('1', { hadRows: false }), NOW);
      assert.deepEqual(codes(await readRemeasureAgencies(tx, NOW)), []);
      assert.equal((await readFederalAgency(tx, '1'))?.hasData, false);

      await markFederalRemeasure(tx, mark('2', { latestEnd: '2027-12-31', lastInclusion: '2026-08-01T09:00:00' }), NOW);
      const two = await readFederalAgency(tx, '2');
      assert.deepEqual([two?.hasData, two?.latestEnd, two?.lastInclusion], [true, '2027-12-31', '2026-08-01 09:00:00']);
      assert.deepEqual(codes(await readCycleAgencies(tx, NOW)), ['2', '3'], 'o 2 entra no ciclo depois de medido com dado');
    });
  });

  test('o andamento agregado conta órgãos com dado, sem dado, não medidos e carregados, e a última inclusão da fonte', async () => {
    await withRollback(async (tx) => {
      await emptyTable(tx);
      assert.deepEqual(await readFederalProgress(tx, FROM_YEAR), { agencies: 0, withData: 0, withoutData: 0, notMeasured: 0, loaded: 0, lastInclusion: null });
      await syncFederalAgencies(tx, [agency('1'), agency('2'), agency('3'), agency('4')]);
      await markFederalLoad(tx, { ...mark('1', { lastInclusion: '2026-09-03T14:00:00' }), oldestYear: 2021, finished: true }, NOW);
      await markFederalLoad(tx, { ...mark('2', { lastInclusion: '2026-08-01T10:00:00' }), oldestYear: 2024, finished: false }, NOW);
      await markFederalLoad(tx, { ...mark('3', { hadRows: false }), oldestYear: 2021, finished: true }, NOW);
      assert.deepEqual(await readFederalProgress(tx, FROM_YEAR), {
        agencies: 4,
        withData: 2,
        withoutData: 1,
        notMeasured: 1,
        loaded: 2,
        lastInclusion: '2026-09-03 14:00:00',
      });
    });
  });
});
