import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, test } from 'node:test';
import { and, count, eq } from 'drizzle-orm';
import { RequestInputError } from '../../../utils/requestInput';
import type { TenderContractRow } from '../collector/contractMapping';
import {
  closeLocalTestDatabase,
  createTestAccount,
  databaseTestsSkipReason,
  insertTestNotice,
  withRollback,
} from '../collector/dbTestSupport';
import type { TendersDb } from '../collector/database';
import { ContractStoreUnavailableError } from '../contractStore/reader';
import { openTestContractStore, sampleContract } from '../contractStore/storeTestSupport';
import { tenderContractFavorites } from '../db/schema';
import { requesterOf } from './apiTestSupport';
import {
  addContractFavorite,
  getContractDetail,
  parseContractKey,
  purchasePncpLink,
  removeContractFavorite,
} from './contractDetail';
import type { ContractContext } from './contractSearch';

// Detalhe do contrato e favoritos (planos dos contratos a vencer, Parte B, e dos
// contratos no R2, Parte R2): edital de origem na base e fora dela, aditivos,
// favorito idempotente pela chave, 404 e armazém sem cópia pronta.

const NOW = new Date('2026-10-19T12:00:00Z');

async function withContracts(
  tx: TendersDb,
  contracts: readonly TenderContractRow[],
  run: (context: ContractContext) => Promise<void>,
): Promise<void> {
  const store = await openTestContractStore(contracts);
  try {
    await run({ db: tx, contractStore: store.reader, now: () => NOW });
  } finally {
    await store.close();
  }
}

const notFound = (error: unknown) => error instanceof RequestInputError && error.status === 404;

describe('detalhe do contrato (banco local e armazém de exemplo)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('edital de origem na base: abre no app; fora da base: a compra no PNCP', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-detalhe');
      // Número de controle próprio: o banco local tem editais reais.
      const purchase = `TESTE-COMPRA-${randomUUID().slice(0, 8)}`;
      const noticeId = await insertTestNotice(tx, { pncpControlNumber: purchase });
      const withNotice = sampleContract(1, { purchaseControlNumber: purchase });
      const withoutNotice = sampleContract(2, { purchaseControlNumber: '99999999000199-1-000216/2026' });
      await withContracts(tx, [withNotice, withoutNotice], async (context) => {
        const detail = await getContractDetail(context, requesterOf(account), withNotice.pncpControlNumber);
        assert.equal(detail.pncpControlNumber, withNotice.pncpControlNumber);
        assert.equal(detail.originNoticeId, noticeId);
        assert.equal(detail.originPncpLink, null);
        assert.equal(detail.pncpLink, 'https://pncp.gov.br/app/contratos/00394460005887/2026/1');
        assert.equal(detail.amendments, null, 'sem termos conferidos');
        assert.equal(detail.publishedAt, '2026-01-12T10:00:00-03:00');
        assert.equal(detail.lastCollectedAt, '2026-10-19T09:00:00-03:00', 'a coleta fica em UTC no arquivo e vai em Brasília na API');

        const other = await getContractDetail(context, requesterOf(account), withoutNotice.pncpControlNumber);
        assert.equal(other.originNoticeId, null);
        assert.equal(other.originPncpLink, 'https://pncp.gov.br/app/editais/99999999000199/2026/216');
      });
    });
  });

  test('os campos do contrato chegam como no cadastro: valores em número, datas e tipo com o nome curto', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-campos');
      const contract = sampleContract(5, { initialValue: '1000.50', globalValue: '2500.75', contractTypeId: 7, contractTypeName: 'Empenho', state: 'MA' });
      await withContracts(tx, [contract], async (context) => {
        const detail = await getContractDetail(context, requesterOf(account), contract.pncpControlNumber);
        assert.equal(detail.initialValue, 1000.5);
        assert.equal(detail.globalValue, 2500.75);
        assert.equal(detail.contractTypeName, 'Empenho');
        assert.equal(detail.state, 'MA');
        assert.equal(detail.expiresOn, '2027-01-10');
        assert.equal(detail.isExtended, false);
        assert.equal(detail.isFavorite, false);
      });
    });
  });

  test('aditivos com o valor acrescido em número, e prorrogado', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-aditivos');
      const extended = sampleContract(3, {
        originalTermEnd: '2027-01-01',
        expiresOn: '2028-01-01',
        amendments: [
          { type: 'Termo Aditivo', number: '1', sequence: 1, signedAt: '2026-12-01', endDate: '2028-01-01', addedValue: '1500.50', changesTerm: true },
        ],
        amendmentsReference: '2026-12-02T10:00:00',
      });
      await withContracts(tx, [extended], async (context) => {
        const detail = await getContractDetail(context, requesterOf(account), extended.pncpControlNumber);
        assert.equal(detail.isExtended, true);
        assert.equal(detail.amendments?.[0]?.addedValue, 1500.5);
        assert.equal(detail.amendments?.[0]?.changesTerm, true);
      });
    });
  });

  test('favoritar repetido não duplica; tirar dos favoritos; contrato fora do armazém dá 404', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-favorito');
      const requester = requesterOf(account);
      const contract = sampleContract(1);
      const key = contract.pncpControlNumber;
      await withContracts(tx, [contract], async (context) => {
        assert.deepEqual(await addContractFavorite(context, requester, key), { pncpControlNumber: key, isFavorite: true });
        await addContractFavorite(context, requester, key);
        const [row] = await tx
          .select({ total: count() })
          .from(tenderContractFavorites)
          .where(and(eq(tenderContractFavorites.accountId, account.accountId), eq(tenderContractFavorites.contractKey, key)));
        assert.equal(row?.total, 1);
        assert.equal((await getContractDetail(context, requester, key)).isFavorite, true);

        const other = await createTestAccount(tx, 'contrato-favorito-outra');
        assert.equal((await getContractDetail(context, requesterOf(other), key)).isFavorite, false, 'o favorito é só de quem marcou');

        assert.deepEqual(await removeContractFavorite(tx, requester, key), { pncpControlNumber: key, isFavorite: false });
        assert.equal((await getContractDetail(context, requester, key)).isFavorite, false);
        await removeContractFavorite(tx, requester, key);

        const unknown = '99999999999999-2-999999/2026';
        await assert.rejects(getContractDetail(context, requester, unknown), notFound);
        await assert.rejects(addContractFavorite(context, requester, unknown), notFound);
      });
    });
  });

  test('sem cópia do armazém: o detalhe e o favoritar esperam, mas tirar o favorito vale', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-sem-copia');
      const requester = requesterOf(account);
      const key = sampleContract(1).pncpControlNumber;
      await tx.insert(tenderContractFavorites).values({ accountId: account.accountId, userId: account.ownerId, contractKey: key });
      const updating: ContractContext = {
        db: tx,
        contractStore: {
          query: () => Promise.reject(new ContractStoreUnavailableError()),
          status: () => ({ ready: false, revision: null, publishedAt: null, today: null, totals: null }),
        },
        now: () => NOW,
      };
      await assert.rejects(getContractDetail(updating, requester, key), ContractStoreUnavailableError);
      await assert.rejects(addContractFavorite(updating, requester, key), ContractStoreUnavailableError);
      assert.deepEqual(await removeContractFavorite(tx, requester, key), { pncpControlNumber: key, isFavorite: false });
    });
  });

  test('a chave da URL: o número de controle (com a barra) ou comprasgov-<id>; qualquer outra coisa é "não encontrado"', () => {
    assert.equal(parseContractKey('03353358000196-2-000216/2026'), '03353358000196-2-000216/2026');
    assert.equal(parseContractKey('comprasgov-123456'), 'comprasgov-123456');
    for (const invalid of ['', '1', "03353358000196-2-000216/2026'; DROP TABLE x", '03353358000196-2-000216', undefined, 42, '../etc/passwd', 'a'.repeat(80)]) {
      assert.throws(() => parseContractKey(invalid), notFound);
    }
  });

  test('link da compra no PNCP pelo número de controle; formato desconhecido, sem link', () => {
    assert.equal(purchasePncpLink('83102277000152-1-000028/2024'), 'https://pncp.gov.br/app/editais/83102277000152/2024/28');
    assert.equal(purchasePncpLink(null), null);
    assert.equal(purchasePncpLink('sem formato'), null);
  });
});
