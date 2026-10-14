import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, test } from 'node:test';
import { and, count, eq } from 'drizzle-orm';
import { RequestInputError } from '../../../utils/requestInput';
import {
  closeLocalTestDatabase,
  createTestAccount,
  databaseTestsSkipReason,
  insertTestContract,
  insertTestNotice,
  withRollback,
} from '../collector/dbTestSupport';
import { tenderContractFavorites } from '../db/schema';
import { requesterOf } from './apiTestSupport';
import { addContractFavorite, getContractDetail, purchasePncpLink, removeContractFavorite } from './contractDetail';

// Detalhe do contrato e favoritos (plano dos contratos a vencer, Parte B):
// edital de origem na base e fora dela, aditivos, favorito idempotente e 404.

describe('detalhe do contrato (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('edital de origem na base: abre no app; fora da base: a compra no PNCP', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-detalhe');
      // Número de controle próprio: o banco local tem editais reais.
      const purchase = `TESTE-COMPRA-${randomUUID().slice(0, 8)}`;
      const noticeId = await insertTestNotice(tx, { pncpControlNumber: purchase });
      const withNotice = await insertTestContract(tx, { purchaseControlNumber: purchase });
      const withoutNotice = await insertTestContract(tx, { purchaseControlNumber: '99999999000199-1-000216/2026' });

      const detail = await getContractDetail(tx, requesterOf(account), withNotice);
      assert.equal(detail.originNoticeId, noticeId);
      assert.equal(detail.originPncpLink, null);
      assert.equal(detail.pncpLink, 'https://pncp.gov.br/app/contratos/03353358000196/2026/1');
      assert.equal(detail.amendments, null, 'sem termos conferidos');

      const other = await getContractDetail(tx, requesterOf(account), withoutNotice);
      assert.equal(other.originNoticeId, null);
      assert.equal(other.originPncpLink, 'https://pncp.gov.br/app/editais/99999999000199/2026/216');
    });
  });

  test('aditivos com o valor acrescido em número, e prorrogado', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-aditivos');
      const contractId = await insertTestContract(tx, {
        originalTermEnd: '2027-01-01',
        expiresOn: '2028-01-01',
        amendments: [
          { type: 'Termo Aditivo', number: '1', sequence: 1, signedAt: '2026-12-01', endDate: '2028-01-01', addedValue: '1500.50', changesTerm: true },
        ],
        amendmentsReference: '2026-12-02T10:00:00',
      });
      const detail = await getContractDetail(tx, requesterOf(account), contractId);
      assert.equal(detail.isExtended, true);
      assert.equal(detail.amendments?.[0]?.addedValue, 1500.5);
    });
  });

  test('favoritar repetido não duplica; tirar dos favoritos; contrato inexistente dá 404', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-favorito');
      const requester = requesterOf(account);
      const contractId = await insertTestContract(tx);

      assert.deepEqual(await addContractFavorite(tx, requester, contractId), { contractId, isFavorite: true });
      await addContractFavorite(tx, requester, contractId);
      const [row] = await tx
        .select({ total: count() })
        .from(tenderContractFavorites)
        .where(and(eq(tenderContractFavorites.accountId, account.accountId), eq(tenderContractFavorites.contractId, contractId)));
      assert.equal(row?.total, 1);
      assert.equal((await getContractDetail(tx, requester, contractId)).isFavorite, true);

      const other = await createTestAccount(tx, 'contrato-favorito-outra');
      assert.equal((await getContractDetail(tx, requesterOf(other), contractId)).isFavorite, false, 'o favorito é só de quem marcou');

      assert.deepEqual(await removeContractFavorite(tx, requester, contractId), { contractId, isFavorite: false });
      assert.equal((await getContractDetail(tx, requester, contractId)).isFavorite, false);

      for (const call of [getContractDetail, addContractFavorite, removeContractFavorite]) {
        await assert.rejects(call(tx, requester, 999_999_999), (error: unknown) => error instanceof RequestInputError && error.status === 404);
      }
    });
  });

  test('link da compra no PNCP pelo número de controle; formato desconhecido, sem link', () => {
    assert.equal(purchasePncpLink('83102277000152-1-000028/2024'), 'https://pncp.gov.br/app/editais/83102277000152/2024/28');
    assert.equal(purchasePncpLink(null), null);
    assert.equal(purchasePncpLink('sem formato'), null);
  });
});
