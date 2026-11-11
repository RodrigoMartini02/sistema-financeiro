import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import { addCalendarDays } from '../collector/dates';
import type { TendersDb } from '../collector/database';
import { closeLocalTestDatabase, createTestAccount, createTestUser, databaseTestsSkipReason, withRollback } from '../collector/dbTestSupport';
import { ContractStoreUnavailableError, type ContractStoreAccess } from '../contractStore/reader';
import { openTestContractStore, sampleContract } from '../contractStore/storeTestSupport';
import { tenderCompetitors } from '../db/schema';
import { RequestInputError } from '../utils/requestInput';
import { requesterOf, testCnpj } from './apiTestSupport';
import {
  MAX_COMPETITORS_PER_USER,
  addCompetitor,
  listCompetitors,
  readCompetitorSummaries,
  removeCompetitor,
  updateCompetitor,
} from './competitors';

// Concorrentes monitorados (plano .plans/licitacoes-4-concorrentes-monitorados.md, migration 0005): salvar, apelido, aviso,
// remover, limite por pessoa, isolamento entre pessoas e contas e os números do armazém. O banco é o local, numa transação
// desfeita; o armazém é um armazém de exemplo.

const ALFA = testCnpj(11);
const BETA = testCnpj(22);
const GAMA = testCnpj(33);
const TODAY = '2026-10-13';
const NOW = new Date(`${TODAY}T12:00:00Z`);

async function rowOf(tx: TendersDb, requester: { accountId: number; userId: number }, cnpj: string) {
  const [row] = await tx
    .select()
    .from(tenderCompetitors)
    .where(and(eq(tenderCompetitors.accountId, requester.accountId), eq(tenderCompetitors.userId, requester.userId), eq(tenderCompetitors.cnpj, cnpj)));
  return row;
}

async function rejectedWith(run: Promise<unknown>): Promise<RequestInputError> {
  try {
    await run;
  } catch (error) {
    assert.ok(error instanceof RequestInputError, `esperava RequestInputError, veio ${String(error)}`);
    return error;
  }
  throw new Error('devia recusar');
}

describe('concorrentes monitorados (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('adicionar: apelido sem espaços sobrando; o mesmo CNPJ de novo não muda nada; a lista põe o apelido primeiro e depois o CNPJ', async () => {
    await withRollback(async (tx) => {
      const requester = requesterOf(await createTestAccount(tx, 'conc-adicionar'));

      const first = await addCompetitor(tx, requester, { cnpj: ALFA, nickname: '  Alfa   Rival  ' });
      assert.equal(first.created, true);
      assert.deepEqual({ cnpj: first.competitor.cnpj, nickname: first.competitor.nickname, notify: first.competitor.notify }, { cnpj: ALFA, nickname: 'Alfa Rival', notify: true });
      assert.match(first.competitor.createdAt ?? '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/);

      const again = await addCompetitor(tx, requester, { cnpj: ALFA, nickname: 'Outro apelido' });
      assert.equal(again.created, false);
      assert.equal(again.competitor.nickname, 'Alfa Rival', 'quem já acompanha continua como está');

      await addCompetitor(tx, requester, { cnpj: GAMA });
      await addCompetitor(tx, requester, { cnpj: BETA, nickname: '   ' });
      await addCompetitor(tx, requester, { cnpj: testCnpj(44), nickname: 'Beta' });

      const list = await listCompetitors(tx, requester);
      assert.equal(list.limit, MAX_COMPETITORS_PER_USER);
      assert.deepEqual(
        list.items.map((item) => [item.cnpj, item.nickname]),
        [
          [ALFA, 'Alfa Rival'],
          [testCnpj(44), 'Beta'],
          [BETA, null],
          [GAMA, null],
        ],
        'com apelido primeiro, em ordem alfabética; depois os sem apelido, pelo CNPJ (apelido em branco vira sem apelido)',
      );
    });
  });

  test('limite de 30 por pessoa: o 31º dá erro 400, repetir um que já existe não, e cada pessoa tem o seu limite', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'conc-limite');
      const requester = requesterOf(account);
      const colleague = { accountId: account.accountId, userId: await createTestUser(tx, 'conc-limite-colega') };
      await tx.insert(tenderCompetitors).values(
        Array.from({ length: MAX_COMPETITORS_PER_USER }, (_, index) => ({ ...requester, cnpj: testCnpj(1000 + index) })),
      );

      const error = await rejectedWith(addCompetitor(tx, requester, { cnpj: ALFA }));
      assert.equal(error.status, 400);
      assert.match(error.message, /30 concorrentes/);
      assert.equal((await addCompetitor(tx, requester, { cnpj: testCnpj(1000) })).created, false, 'já acompanha: idempotente, mesmo no limite');
      assert.equal((await listCompetitors(tx, requester)).items.length, MAX_COMPETITORS_PER_USER);

      assert.equal((await addCompetitor(tx, colleague, { cnpj: ALFA })).created, true, 'a colega tem o limite dela');
    });
  });

  test('alterar: apelido (vazio limpa), aviso; religar recomeça o aviso_desde, desligar não mexe; campo ausente mantém', async () => {
    await withRollback(async (tx) => {
      const requester = requesterOf(await createTestAccount(tx, 'conc-alterar'));
      await addCompetitor(tx, requester, { cnpj: ALFA, nickname: 'Alfa' });
      const OLD = '2026-01-01 10:00:00-03';
      await tx.update(tenderCompetitors).set({ notifySince: OLD }).where(eq(tenderCompetitors.cnpj, ALFA));
      const since = async () => (await rowOf(tx, requester, ALFA))?.notifySince;
      const oldSince = await since();

      assert.equal((await updateCompetitor(tx, requester, ALFA, { notify: false })).notify, false);
      assert.equal(await since(), oldSince, 'desligar não mexe no aviso_desde');
      assert.equal((await updateCompetitor(tx, requester, ALFA, {})).notify, false, 'sem campo, mantém');
      assert.equal((await updateCompetitor(tx, requester, ALFA, { nickname: 'Alfa Nova' })).nickname, 'Alfa Nova');
      assert.equal((await rowOf(tx, requester, ALFA))?.notify, false, 'mudar o apelido não religa o aviso');

      const rearmed = await updateCompetitor(tx, requester, ALFA, { notify: true });
      assert.equal(rearmed.notify, true);
      assert.notEqual(await since(), oldSince, 'religar recomeça o aviso_desde');
      const restarted = await since();
      await updateCompetitor(tx, requester, ALFA, { notify: true });
      assert.equal(await since(), restarted, 'ligado de novo, já ligado: nada muda');

      assert.equal((await updateCompetitor(tx, requester, ALFA, { nickname: '' })).nickname, null, 'vazio limpa o apelido');
      assert.equal((await updateCompetitor(tx, requester, ALFA, { nickname: null })).nickname, null);
    });
  });

  test('de outra pessoa, de outra conta ou inexistente: alterar dá 404 e remover não apaga nada alheio; remover é idempotente', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'conc-isolamento');
      const other = await createTestAccount(tx, 'conc-isolamento-outra');
      const owner = requesterOf(account);
      const colleague = { accountId: account.accountId, userId: await createTestUser(tx, 'conc-isolamento-colega') };
      const outsider = requesterOf(other);
      await addCompetitor(tx, owner, { cnpj: ALFA, nickname: 'Meu' });
      await addCompetitor(tx, colleague, { cnpj: ALFA, nickname: 'Dela' });
      await addCompetitor(tx, outsider, { cnpj: ALFA, nickname: 'Da outra conta' });

      for (const requester of [colleague, outsider]) {
        assert.equal((await listCompetitors(tx, requester)).items.length, 1, 'cada pessoa vê só o seu');
      }
      assert.deepEqual((await listCompetitors(tx, owner)).items.map((item) => item.nickname), ['Meu']);

      assert.equal((await rejectedWith(updateCompetitor(tx, owner, GAMA, { nickname: 'x' }))).status, 404, 'inexistente');
      const nobody = { accountId: account.accountId, userId: await createTestUser(tx, 'conc-isolamento-ninguem') };
      assert.equal((await rejectedWith(updateCompetitor(tx, nobody, ALFA, { nickname: 'x' }))).status, 404, 'o CNPJ existe, mas não é dessa pessoa');
      assert.equal((await rejectedWith(updateCompetitor(tx, { ...owner, accountId: other.accountId }, ALFA, { nickname: 'x' }))).status, 404, 'nem na conta alheia');

      await removeCompetitor(tx, colleague, ALFA);
      await removeCompetitor(tx, colleague, ALFA);
      await removeCompetitor(tx, nobody, ALFA);
      assert.equal((await rowOf(tx, owner, ALFA))?.nickname, 'Meu', 'o dela não apagou o meu');
      assert.equal((await rowOf(tx, outsider, ALFA))?.nickname, 'Da outra conta');
      assert.equal(await rowOf(tx, colleague, ALFA), undefined);

      await removeCompetitor(tx, owner, ALFA);
      assert.deepEqual((await listCompetitors(tx, owner)).items, []);
    });
  });

  test('o banco só aceita CNPJ com 14 dígitos (CHECK da tabela, porque o CNPJ vira literal nas consultas do armazém)', async () => {
    await withRollback(async (tx) => {
      const requester = requesterOf(await createTestAccount(tx, 'conc-formato'));
      for (const invalid of ['123', '1122233300018x', `${ALFA}') OR true --`]) {
        // Numa subtransação, para o erro não derrubar a transação do teste.
        await assert.rejects(
          tx.transaction(async (inner) => {
            await inner.insert(tenderCompetitors).values({ ...requester, cnpj: invalid });
          }),
          // Com o nome da restrição (a mensagem do Postgres sai no idioma do servidor) ou, para o texto mais longo que a coluna, o limite do tipo.
          (error: unknown) => /concorrente_monitorado_cnpj_check|value too long|muito longo/.test(`${String(error)} ${String((error as { cause?: unknown }).cause ?? '')}`),
          invalid,
        );
      }
    });
  });

  test('resumo: um item por concorrente na ordem da lista, com os números do armazém e zeros para quem não tem contrato', async () => {
    await withRollback(async (tx) => {
      const requester = requesterOf(await createTestAccount(tx, 'conc-resumo'));
      await addCompetitor(tx, requester, { cnpj: ALFA, nickname: 'Alfa' });
      await addCompetitor(tx, requester, { cnpj: GAMA });
      const contracts = [
        sampleContract(1, { supplierDocument: ALFA, supplierName: 'Alfa Antiga Ltda', publishedAt: '2026-08-01T10:00:00', expiresOn: null, originalTermEnd: null }),
        sampleContract(2, { supplierDocument: ALFA, supplierName: 'Alfa Ltda', publishedAt: '2026-10-01T10:00:00', expiresOn: addCalendarDays(TODAY, 20) }),
        sampleContract(3, { supplierDocument: ALFA, supplierName: 'Alfa Ltda', publishedAt: '2026-10-12T09:30:00', expiresOn: addCalendarDays(TODAY, -3), originalTermEnd: addCalendarDays(TODAY, -3) }),
        sampleContract(4, { supplierDocument: BETA, supplierName: 'Beta SA', publishedAt: '2026-10-12T09:30:00' }),
      ];
      const store = await openTestContractStore(contracts, { today: TODAY });
      try {
        const summary = await readCompetitorSummaries({ db: tx, contractStore: store.reader, now: () => NOW }, requester);
        assert.deepEqual(summary.items, [
          { cnpj: ALFA, name: 'Alfa Ltda', total: 3, active: 1, last30Days: 2, lastPublishedAt: '2026-10-12T09:30:00-03:00' },
          { cnpj: GAMA, name: null, total: 0, active: 0, last30Days: 0, lastPublishedAt: null },
        ]);
      } finally {
        await store.close();
      }
    });
  });

  test('resumo: sem concorrentes não consulta o armazém; com o armazém atualizando, a lista continua e o resumo recusa', async () => {
    await withRollback(async (tx) => {
      const requester = requesterOf(await createTestAccount(tx, 'conc-atualizando'));
      const updating: ContractStoreAccess = {
        query: () => Promise.reject(new ContractStoreUnavailableError()),
        status: () => ({ ready: false, revision: null, publishedAt: null, today: null, totals: null }),
      };
      assert.deepEqual(await readCompetitorSummaries({ db: tx, contractStore: updating, now: () => NOW }, requester), { items: [] });

      await addCompetitor(tx, requester, { cnpj: ALFA });
      assert.equal((await listCompetitors(tx, requester)).items.length, 1, 'a lista só usa o Postgres');
      await assert.rejects(readCompetitorSummaries({ db: tx, contractStore: updating, now: () => NOW }, requester), ContractStoreUnavailableError);
    });
  });
});
