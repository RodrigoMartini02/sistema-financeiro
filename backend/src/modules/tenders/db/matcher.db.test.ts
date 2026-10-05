import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { sql } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import {
  closeLocalTestDatabase,
  createTestAccount,
  databaseTestsSkipReason,
  insertSavedSearch,
  insertTestNotice,
  withRollback,
} from '../collector/dbTestSupport';
import type { TenderNoticeRow } from '../collector/mapping';

// licitacoes.fn_edital_bate (migration 0074): a regra única "edital bate com
// a busca salva", usada pelo coletor e pela API. Banco local, tudo desfeito.

type SearchCriteria = Omit<Parameters<typeof insertSavedSearch>[1], 'accountId' | 'userId'>;

const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

async function noticeMatches(
  tx: TendersDb,
  owner: { accountId: number; ownerId: number },
  notice: Partial<TenderNoticeRow>,
  criteria: SearchCriteria,
): Promise<boolean> {
  const noticeId = await insertTestNotice(tx, notice);
  const searchId = await insertSavedSearch(tx, { accountId: owner.accountId, userId: owner.ownerId, ...criteria });
  const result = await tx.execute(sql`
    SELECT licitacoes.fn_edital_bate(e, b) AS matches
      FROM licitacoes.edital e, licitacoes.busca_salva b
     WHERE e.id = ${noticeId} AND b.id = ${searchId}`);
  return result.rows[0]?.['matches'] === true;
}

describe('fn_edital_bate (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('termo com ou sem acento bate do mesmo jeito', async () => {
    await withRollback(async (tx) => {
      const owner = await createTestAccount(tx, 'acento');
      const notice = { procurementObject: 'Contratação de sistema de gestão tributária municipal' };
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['tributaria'] }), true);
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['tributária'] }), true);
      assert.equal(await noticeMatches(tx, owner, { procurementObject: 'Gestão TRIBUTÁRIA' }, { terms: ['gestao tributaria'] }), true);
    });
  });

  test('plural e singular batem pelo radical', async () => {
    await withRollback(async (tx) => {
      const owner = await createTestAccount(tx, 'radical');
      const notice = { procurementObject: 'Locação de licenças de uso de software de gestão' };
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['licença de uso'] }), true);
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['softwares'] }), true);
    });
  });

  test('modo OU basta um termo; modo E exige todos; frase exige a ordem', async () => {
    await withRollback(async (tx) => {
      const owner = await createTestAccount(tx, 'modo');
      const notice = { procurementObject: 'Serviço de digitalização e guarda de documentos' };
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['ISSQN', 'digitalização'], termsMode: 'OU' }), true);
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['ISSQN', 'digitalização'], termsMode: 'E' }), false);
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['guarda de documentos', 'digitalização'], termsMode: 'E' }), true);
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['documentos de guarda'] }), false);
    });
  });

  test('termo de exclusão tira o edital', async () => {
    await withRollback(async (tx) => {
      const owner = await createTestAccount(tx, 'exclusao');
      const notice = { procurementObject: 'Aquisição de combustível para veículos da secretaria de gestão tributária' };
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['gestão tributária'] }), true);
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['gestão tributária'], excludedTerms: ['combustível'] }), false);
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['gestão tributária'], excludedTerms: ['impressora'] }), true);
    });
  });

  test('faixa de valor e edital sem valor estimado', async () => {
    await withRollback(async (tx) => {
      const owner = await createTestAccount(tx, 'valor');
      const withValue = { estimatedTotalValue: '100000.00' };
      assert.equal(await noticeMatches(tx, owner, withValue, { minValue: '50000', maxValue: '150000' }), true);
      assert.equal(await noticeMatches(tx, owner, withValue, { minValue: '100000', maxValue: '100000' }), true);
      assert.equal(await noticeMatches(tx, owner, withValue, { minValue: '200000' }), false);
      assert.equal(await noticeMatches(tx, owner, withValue, { maxValue: '50000' }), false);

      const withoutValue = { estimatedTotalValue: null };
      assert.equal(await noticeMatches(tx, owner, withoutValue, { minValue: '1' }), false, 'sem valor fica fora do filtro de valor');
      assert.equal(await noticeMatches(tx, owner, withoutValue, { maxValue: '999999' }), false);
      assert.equal(await noticeMatches(tx, owner, withoutValue, {}), true, 'sem filtro de valor, entra');
    });
  });

  test('encerrado não bate; aberto e sem data de encerramento batem', async () => {
    await withRollback(async (tx) => {
      const owner = await createTestAccount(tx, 'prazo');
      assert.equal(await noticeMatches(tx, owner, { proposalClosesAt: inHours(-1) }, {}), false);
      assert.equal(await noticeMatches(tx, owner, { proposalClosesAt: inHours(1) }, {}), true);
      assert.equal(await noticeMatches(tx, owner, { proposalClosesAt: null }, {}), true);
    });
  });

  test('só a situação 1 (divulgada) bate; sem situação vale como 1', async () => {
    await withRollback(async (tx) => {
      const owner = await createTestAccount(tx, 'situacao');
      assert.equal(await noticeMatches(tx, owner, { situationId: 1 }, {}), true);
      assert.equal(await noticeMatches(tx, owner, { situationId: 4 }, {}), false);
      assert.equal(await noticeMatches(tx, owner, { situationId: 2 }, {}), false);
      assert.equal(await noticeMatches(tx, owner, { situationId: null }, {}), true);
    });
  });

  test('UF, modalidade, órgão, município e SRP', async () => {
    await withRollback(async (tx) => {
      const owner = await createTestAccount(tx, 'filtros');
      const notice = { state: 'MA', modalityId: 6, agencyCnpj: '06307102000130', cityIbgeCode: '2111300', isPriceRegistration: true };
      assert.equal(await noticeMatches(tx, owner, notice, { states: ['MA', 'PI'], modalities: [6, 8] }), true);
      assert.equal(await noticeMatches(tx, owner, notice, { states: ['SP'] }), false);
      assert.equal(await noticeMatches(tx, owner, notice, { modalities: [8] }), false);
      assert.equal(await noticeMatches(tx, owner, notice, { agencyCnpjs: ['06307102000130'], cityIbgeCodes: ['2111300'] }), true);
      assert.equal(await noticeMatches(tx, owner, notice, { cityIbgeCodes: ['2100055'] }), false);
      assert.equal(await noticeMatches(tx, owner, notice, { onlyPriceRegistration: true }), true);
      assert.equal(await noticeMatches(tx, owner, notice, { onlyPriceRegistration: false }), false);
      assert.equal(await noticeMatches(tx, owner, notice, { onlyPriceRegistration: null }), true, 'SRP indiferente');
    });
  });
});
