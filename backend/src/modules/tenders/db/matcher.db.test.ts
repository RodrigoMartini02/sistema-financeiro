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

// licitacoes.fn_edital_bate (migrations 0074 a 0076): a regra única "edital
// bate com a busca salva", usada pelo coletor e pela API. Banco local, tudo
// desfeito.

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

  test('plural e singular regulares batem pelo radical', async () => {
    await withRollback(async (tx) => {
      const owner = await createTestAccount(tx, 'radical');
      const notice = { procurementObject: 'Locação de licenças de uso de sistema de gestão' };
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['licença de uso'] }), true);
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['sistemas'] }), true);
      assert.equal(await noticeMatches(tx, owner, { procurementObject: 'Prestação de serviços de digitalização' }, { terms: ['serviço'] }), true);
    });
  });

  // Pares medidos em 05/10/2026: radicais diferentes entre singular e plural, porque a
  // configuração tira o acento antes do radical. A 0075 (e o ajuste da 0077) buscam as duas formas.
  test('singular e plural de radical diferente batem nos dois sentidos (0075 e 0077)', async () => {
    const pairs: Array<[string, string]> = [
      ['licitação', 'licitações'],
      ['contratação', 'contratações'],
      ['gestão', 'gestões'],
      ['órgão', 'órgãos'],
      ['pão', 'pães'],
      ['material', 'materiais'],
      ['municipal', 'municipais'],
      ['papel', 'papéis'],
      ['imóvel', 'imóveis'],
      ['combustível', 'combustíveis'],
      ['farol', 'faróis'],
      ['barril', 'barris'],
      ['civil', 'civis'],
      ['item', 'itens'],
      ['bem', 'bens'],
      ['imagem', 'imagens'],
      ['software', 'softwares'],
      ['scanner', 'scanners'],
      ['computador', 'computadores'],
    ];
    await withRollback(async (tx) => {
      const owner = await createTestAccount(tx, 'variantes');
      for (const [singular, plural] of pairs) {
        const pluralNotice = { procurementObject: `Fornecimento de ${plural} para a secretaria` };
        const singularNotice = { procurementObject: `Fornecimento de ${singular} para a secretaria` };
        assert.equal(await noticeMatches(tx, owner, pluralNotice, { terms: [singular] }), true, `${singular} → ${plural}`);
        assert.equal(await noticeMatches(tx, owner, singularNotice, { terms: [plural] }), true, `${plural} → ${singular}`);
      }
    });
  });

  test('variantes dentro de frase, com palavra de ligação, mantêm a ordem (0075)', async () => {
    await withRollback(async (tx) => {
      const owner = await createTestAccount(tx, 'variantes-frase');
      const notice = { procurementObject: 'Aquisição de materiais de limpeza para as licitações municipais' };
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['material de limpeza'] }), true);
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['licitação municipal'] }), true, 'duas palavras trocadas');
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['limpeza de material'] }), false, 'ordem invertida');
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['material', 'licitação'], termsMode: 'E' }), true);
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['material', 'impressora'], termsMode: 'E' }), false);
    });
  });

  test('exclusão também pega a outra forma; exclusão só com palavra de ligação não tira nada (0075)', async () => {
    await withRollback(async (tx) => {
      const owner = await createTestAccount(tx, 'variantes-exclusao');
      const notice = { procurementObject: 'Sistema de gestão de licitações e contratos' };
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['sistema'], excludedTerms: ['licitação'] }), false);
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['sistema'], excludedTerms: ['de'] }), true);
      assert.equal(await noticeMatches(tx, owner, notice, { terms: ['de'] }), false, 'termo só com palavra de ligação não bate, como antes');
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

  test('incluir sem valor: com faixa de valor, o edital sem valor entra só com a opção (0076)', async () => {
    await withRollback(async (tx) => {
      const owner = await createTestAccount(tx, 'sem-valor');
      const withoutValue = { estimatedTotalValue: null };
      const withValue = { estimatedTotalValue: '100000.00' };
      assert.equal(await noticeMatches(tx, owner, withoutValue, { minValue: '1', includeWithoutValue: true }), true);
      assert.equal(await noticeMatches(tx, owner, withoutValue, { maxValue: '50000', includeWithoutValue: true }), true);
      assert.equal(await noticeMatches(tx, owner, withoutValue, { includeWithoutValue: true }), true);
      assert.equal(await noticeMatches(tx, owner, withValue, { minValue: '200000', includeWithoutValue: true }), false, 'a opção não muda quem tem valor');
      assert.equal(await noticeMatches(tx, owner, withValue, { minValue: '50000', includeWithoutValue: true }), true);
    });
  });

  test('as duas partes da regra: critérios sem filtros (NULL) aceitam tudo; aberto exige prazo e situação 1 (0076)', async () => {
    await withRollback(async (tx) => {
      const closedId = await insertTestNotice(tx, { proposalClosesAt: inHours(-1) });
      const suspendedId = await insertTestNotice(tx, { situationId: 4 });
      const openId = await insertTestNotice(tx, { proposalClosesAt: inHours(1) });
      const result = await tx.execute(sql`
        SELECT e.id,
               licitacoes.fn_edital_atende_criterios(e, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL) AS criterios,
               licitacoes.fn_edital_aberto(e) AS aberto
          FROM licitacoes.edital e
         WHERE e.id IN (${closedId}, ${suspendedId}, ${openId})`);
      const byId = new Map(result.rows.map((row) => [Number(row['id']), row]));
      for (const id of [closedId, suspendedId, openId]) {
        assert.equal(byId.get(id)?.['criterios'], true);
      }
      assert.equal(byId.get(closedId)?.['aberto'], false);
      assert.equal(byId.get(suspendedId)?.['aberto'], false);
      assert.equal(byId.get(openId)?.['aberto'], true);
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
