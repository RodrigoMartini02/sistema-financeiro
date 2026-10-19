import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { sql } from 'drizzle-orm';
import { closeLocalTestDatabase, databaseTestsSkipReason, withRollback } from '../collector/dbTestSupport';
import { sampleContract } from './storeTestSupport';
import { postgresSearchFields, postgresSearchPhrases } from './textSearch';

// Campos de busca do armazém calculados pelo Postgres do banco local: os
// radicais do licitacoes.pt_unaccent (com a marca "_" no lugar das palavras
// ignoradas no meio do texto), os grupos de dígitos e as frases de cada termo
// (fn_frases_termo). O termo bate no texto do contrato quando a busca de hoje
// (fn_tsquery_termos) bate.

const TEXT = 'Contratação de empresa para MANUTENÇÕES PREDIAIS preventivas e serviços de limpeza; material de expediente.';

describe('campos de busca do armazém de contratos (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('radicais do texto nas posições, com "_" no lugar das palavras ignoradas no meio; grupos de dígitos sem zeros à esquerda', async () => {
    await withRollback(async (tx) => {
      const [fields] = await postgresSearchFields(tx).computeSearchFields([
        sampleContract(12, {
          contractObject: TEXT,
          additionalInformation: null,
          contractNumber: '0012/2024',
          processNumber: 'PROC-00045/2024',
          contractYear: 2024,
          purchaseControlNumber: '00394460005887-1-000099/2024',
        }),
      ]);
      assert.deepEqual(fields, {
        stems: ' contrataca _ empres _ manutenco predi prevent _ servic _ limpez material _ expedient ',
        numberGroups: ['12', '2024', '2024'],
        processGroups: ['45', '2024', '2024'],
        controlGroups: ['394460005887', '2', '12', '2024'],
        purchaseGroups: ['394460005887', '1', '99', '2024'],
      });
    });
  });

  test('vários contratos de uma vez, na mesma ordem; informação complementar entra no texto', async () => {
    await withRollback(async (tx) => {
      const fields = await postgresSearchFields(tx).computeSearchFields([
        sampleContract(1, { contractObject: 'Obras', additionalInformation: 'com pavimentação' }),
        sampleContract(2, { contractObject: 'Locação de veículos', additionalInformation: null }),
      ]);
      assert.deepEqual(
        fields.map((field) => field.stems),
        // "Obras" fica "obras" no dicionário (como na busca dos editais); "com" e "de" viram "_".
        [' obras _ pavimentaca ', ' locaca _ veicul '],
      );
    });
  });

  test('termos da busca: as frases de cada termo, com as formas de singular e plural (fn_frases_termo); termo só com palavra ignorada fica sem frase', async () => {
    await withRollback(async (tx) => {
      const [maintenance, cleaning, connector, supplies] = await postgresSearchPhrases(tx).toPhrases(['manutenção predial', 'LIMPEZAS', 'de', 'material de expediente']);
      assert.ok(maintenance?.includes(' manutenca predial ') && maintenance.includes(' manutenco predi '), JSON.stringify(maintenance));
      assert.deepEqual(cleaning, [' limpez ']);
      assert.deepEqual(connector, []);
      assert.deepEqual(supplies, [' materi _ expedient ', ' material _ expedient '], 'material e materiais, com a posição do "de"');
      assert.deepEqual(await postgresSearchPhrases(tx).toPhrases([]), []);
    });
  });

  test('o termo bate no texto quando a busca de hoje (fn_tsquery_termos) bate, inclusive nas distâncias da frase', async () => {
    await withRollback(async (tx) => {
      const texts = [
        TEXT,
        'Reforma e manutenção do prédio sede da Câmara',
        'Aquisição de material didático, expediente e armarinho',
        'Serviços de manutenção predial',
      ];
      const terms = [
        'limpeza', 'manutenção predial', 'manutenções prediais', 'material de expediente', 'materiais de expediente',
        'predial manutenção', 'obra', 'serviço', 'serviços de limpeza', 'serviços limpeza', 'manutenção do prédio', 'de limpeza',
      ];
      const fields = await postgresSearchFields(tx).computeSearchFields(texts.map((text, index) => sampleContract(index + 1, { contractObject: text })));
      const phrases = await postgresSearchPhrases(tx).toPhrases(terms);
      for (const [textIndex, text] of texts.entries()) {
        for (const [index, term] of terms.entries()) {
          const result = await tx.execute<{ bate: boolean }>(
            sql`SELECT to_tsvector('licitacoes.pt_unaccent', ${text}) @@ licitacoes.fn_tsquery_termos(ARRAY[${term}]::text[], 'E') AS bate`,
          );
          const stems = fields[textIndex]?.stems ?? '';
          // A mesma regra do criteria.ts: "_" na frase aceita uma palavra qualquer.
          const matches = (phrases[index] ?? []).some((phrase) =>
            new RegExp(phrase.split(' ').map((token) => (token === '_' ? '[^ ]+' : token)).join(' ')).test(stems),
          );
          assert.equal(matches, result.rows[0]?.bate, `"${term}" em "${text.slice(0, 40)}"`);
        }
      }
    });
  });
});
