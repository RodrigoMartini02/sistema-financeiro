import assert from 'node:assert/strict';
import test from 'node:test';
import type { TendersDb } from '../collector/database';
import { createMemoryStorage } from '../objectStorageTestSupport';
import type { DocumentUpload } from './documentUpload';
import { createDocument, type VaultActor } from './vaultDocuments';
import { readNewDocumentInput } from './vaultInput';

// Guardar documento, sem banco: a linha já gravada nunca fica sem o arquivo. Se só a leitura da resposta falhar depois do
// insert, o objeto no R2 continua (apagá-lo deixaria um documento que aponta para um arquivo que não existe).

const PDF: DocumentUpload = {
  bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]),
  contentType: 'application/pdf',
  extension: 'pdf',
  fileName: 'certidao.pdf',
};
const ACTOR: VaultActor = { accountId: 7, userId: 9, role: 'TITULAR' };

/** Um construtor de consulta que se resolve (ou falha) quando é esperado, com os métodos encadeados do Drizzle que o serviço usa. */
function query(outcome: unknown): Record<string, unknown> {
  const builder: Record<string, unknown> = {
    from: () => builder,
    where: () => builder,
    orderBy: () => builder,
    limit: () => builder,
    then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) => (outcome instanceof Error ? reject(outcome) : resolve(outcome)),
  };
  return builder;
}

test('guardar documento: se só a leitura da resposta falha depois do insert, o arquivo continua no R2', async () => {
  const { storage, objects } = createMemoryStorage();
  let selects = 0;
  let inserts = 0;
  const db = {
    // 1ª leitura: a contagem do limite da conta; 2ª: a lista da resposta, que falha.
    select: () => query((selects += 1) === 1 ? [{ total: 0 }] : new Error('leitura falhou')),
    insert: () => ({ values: () => ({ returning: async () => [{ id: (inserts += 1) + 40 }] }) }),
  } as unknown as TendersDb;

  await assert.rejects(
    createDocument({ db, storage, now: () => new Date('2026-11-11T12:00:00-03:00') }, ACTOR, readNewDocumentInput({ type: 'CONTRATO_SOCIAL' }), PDF),
    /leitura falhou/,
  );
  assert.equal(inserts, 1, 'a linha foi gravada');
  assert.equal(objects.size, 1, 'o arquivo da linha gravada não pode ser apagado');
});

test('guardar documento: se o insert falha, o arquivo enviado é apagado', async () => {
  const { storage, objects } = createMemoryStorage();
  const originalError = console.error;
  console.error = () => {};
  let selects = 0;
  const db = {
    select: () => query((selects += 1) === 1 ? [{ total: 0 }] : []),
    insert: () => ({ values: () => ({ returning: async () => { throw new Error('insert falhou'); } }) }),
  } as unknown as TendersDb;
  try {
    await assert.rejects(
      createDocument({ db, storage, now: () => new Date() }, ACTOR, readNewDocumentInput({ type: 'CONTRATO_SOCIAL' }), PDF),
      /insert falhou/,
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(objects.size, 0);
});
