import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryStorage } from '../objectStorageTestSupport';
import { RequestInputError } from '../utils/requestInput';
import { DOCUMENT_LINK_TTL_SECONDS } from './documentUpload';
import { DOCUMENT_STORAGE_PREFIX, removeDocumentFiles, requireDocumentStorage, signDocumentFileLink, storeDocumentFile } from './vaultFiles';

// Os arquivos do cofre no R2 (item 5), com o R2 simulado: a chave do objeto, os cabeçalhos gravados, a limpeza que não
// derruba a operação e o link de vida curta.

const UPLOAD = {
  bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]),
  contentType: 'application/pdf',
  extension: 'pdf',
  fileName: 'Certidão FGTS.pdf',
};

function silenceErrors<T>(run: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  return run().finally(() => {
    console.error = original;
  });
}

test('envio: a chave tem a conta e um identificador novo, nunca o nome do arquivo; o objeto abre na própria aba com o nome', async () => {
  const { storage, objects, metadata } = createMemoryStorage();
  const first = await storeDocumentFile(storage, 15, UPLOAD);
  const second = await storeDocumentFile(storage, 15, UPLOAD);
  assert.match(first, new RegExp(`^${DOCUMENT_STORAGE_PREFIX}/15/[0-9a-f-]{36}\\.pdf$`));
  assert.notEqual(first, second, 'cada envio tem a sua chave');
  assert.ok(!first.includes('FGTS'), 'o nome do arquivo não vira caminho');
  assert.deepEqual([...objects.get(first)!], [...UPLOAD.bytes]);
  assert.equal(metadata.get(first)?.contentType, 'application/pdf');
  assert.equal(metadata.get(first)?.cacheControl, 'private, max-age=3600');
  assert.match(metadata.get(first)?.contentDisposition ?? '', /^inline; filename="Certid_o FGTS\.pdf"; filename\*=UTF-8''Certid%C3%A3o%20FGTS\.pdf$/);
});

test('envio: falha do R2 sobe o erro (a operação não grava a linha)', async () => {
  const { storage } = createMemoryStorage(() => true);
  await assert.rejects(storeDocumentFile(storage, 15, UPLOAD), /R2 fora do ar/);
});

test('limpeza: apaga os objetos; falha ou R2 ausente fica só registrada, sem derrubar a operação', async () => {
  const { storage, objects } = createMemoryStorage();
  const keyA = await storeDocumentFile(storage, 1, UPLOAD);
  const keyB = await storeDocumentFile(storage, 1, UPLOAD);
  await removeDocumentFiles(storage, [keyA]);
  assert.deepEqual([...objects.keys()], [keyB]);

  const broken = { ...storage, deleteObject: async () => { throw new Error('sem permissão'); } };
  await silenceErrors(() => removeDocumentFiles(broken, [keyB]));
  assert.equal(objects.size, 1, 'o objeto fica, e a operação segue');
  await silenceErrors(() => removeDocumentFiles(null, [keyB]));
  await removeDocumentFiles(storage, []);
});

test('R2 ausente: 503 com mensagem em português; com R2, devolve o próprio', () => {
  const { storage } = createMemoryStorage();
  assert.equal(requireDocumentStorage(storage), storage);
  assert.throws(
    () => requireDocumentStorage(null),
    (error: unknown) => error instanceof RequestInputError && error.status === 503 && /não estão disponíveis agora/.test(error.message),
  );
});

test('link de abertura: assinado e de vida curta; cliente que não assina dá 503', async () => {
  const { storage } = createMemoryStorage();
  assert.deepEqual(await signDocumentFileLink(storage, 'documentos/15/a.pdf'), {
    url: `memory://documentos/15/a.pdf?expires=${DOCUMENT_LINK_TTL_SECONDS}`,
    expiresInSeconds: DOCUMENT_LINK_TTL_SECONDS,
  });
  assert.equal(DOCUMENT_LINK_TTL_SECONDS, 120);
  const unsigned = { ...storage, signedGetUrl: undefined };
  await assert.rejects(
    signDocumentFileLink(unsigned, 'documentos/15/a.pdf'),
    (error: unknown) => error instanceof RequestInputError && error.status === 503,
  );
});
