import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { createMemoryStorage } from '../modules/tenders/objectStorageTestSupport';
import type { ObjectStorage } from '../modules/tenders/objectStorage';
import { RequestInputError } from '../utils/requestInput';
import { ATTACHMENT_LINK_TTL_SECONDS } from './attachmentRules';
import {
  ATTACHMENT_STORAGE_UNAVAILABLE_MESSAGE, attachmentStorageKey, createAttachmentLink, createAttachmentStorage, putAttachmentObject,
  removeStoredObjects,
} from './attachmentStorage';

const ID = '3f1b9e1c-8d52-4b8e-9d0e-0a1b2c3d4e5f';

const R2_ENV = {
  TENDERS_ARCHIVE_ENDPOINT: 'https://conta.r2.cloudflarestorage.com',
  TENDERS_ARCHIVE_BUCKET: 'bucket-de-teste',
  TENDERS_ARCHIVE_ACCESS_KEY_ID: 'chave-de-teste',
  TENDERS_ARCHIVE_SECRET_ACCESS_KEY: 'segredo-de-teste',
  TENDERS_STORAGE_PREFIX: 'local',
};

test('a chave do arquivo fica na subpasta anexos da pasta do ambiente', () => {
  assert.equal(attachmentStorageKey(ID), `anexos/${ID}`);
});

test('grava com o tipo e o cabeçalho de download: PDF abre no navegador, planilha baixa, nada fica em cache', async () => {
  const { storage, objects, metadata } = createMemoryStorage();
  const key = await putAttachmentObject(storage, ID, {
    content: Buffer.from('%PDF-1.7'),
    contentType: 'application/pdf',
    originalName: 'Relatório.pdf',
    inline: true,
  });
  assert.equal(key, `anexos/${ID}`);
  assert.equal(Buffer.from(objects.get(key) ?? []).toString(), '%PDF-1.7');
  assert.deepEqual(metadata.get(key), {
    contentType: 'application/pdf',
    contentDisposition: `inline; filename="Relatorio.pdf"; filename*=UTF-8''Relat%C3%B3rio.pdf`,
    cacheControl: 'private, no-store',
  });

  const otherKey = await putAttachmentObject(storage, 'outro', {
    content: Buffer.from('xlsx'),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    originalName: 'planilha.xlsx',
    inline: false,
  });
  assert.match(metadata.get(otherKey)?.contentDisposition ?? '', /^attachment; filename="planilha.xlsx"/);
});

test('apaga os arquivos do R2 e conta os que falharam, deixando a falha no log', async () => {
  const { storage, objects } = createMemoryStorage();
  objects.set('anexos/a', Buffer.from('a'));
  objects.set('anexos/b', Buffer.from('b'));
  objects.set('anexos/c', Buffer.from('c'));
  const failing: ObjectStorage = {
    ...storage,
    async deleteObject(key) {
      if (key === 'anexos/b') {
        throw new Error('R2 fora do ar');
      }
      await storage.deleteObject(key);
    },
  };
  const logged = mock.method(console, 'error', () => {});
  try {
    assert.equal(await removeStoredObjects(failing, ['anexos/a', 'anexos/b', 'anexos/c']), 1);
    assert.equal(logged.mock.callCount(), 1);
    assert.equal(logged.mock.calls[0]?.arguments[0], 'Remove attachment object error:');
    assert.deepEqual((logged.mock.calls[0]?.arguments[1] as { key: string }).key, 'anexos/b');
  } finally {
    logged.mock.restore();
  }
  assert.deepEqual([...objects.keys()], ['anexos/b'], 'os outros dois foram apagados mesmo com a falha no meio');
  assert.equal(await removeStoredObjects(storage, []), 0);
});

test('o link de leitura vale 2 minutos e informa quando expira', async () => {
  const { storage } = createMemoryStorage();
  const now = new Date('2026-11-03T12:00:00.000Z');
  const link = await createAttachmentLink(storage, `anexos/${ID}`, now);
  assert.equal(ATTACHMENT_LINK_TTL_SECONDS, 120);
  assert.equal(link.url, `memory://anexos/${ID}?expires=120`);
  assert.equal(link.expiresAt, '2026-11-03T12:02:00.000Z');
});

test('armazenamento que não assina links não serve para abrir anexos', async () => {
  const { storage } = createMemoryStorage();
  const { signedGetUrl: _signedGetUrl, ...withoutSigning } = storage;
  await assert.rejects(createAttachmentLink(withoutSigning, `anexos/${ID}`), /cannot sign/);
});

test('o R2 dos anexos vem das variáveis do armazém das Licitações, com o cliente que assina links', () => {
  const storage = createAttachmentStorage({ ...R2_ENV, DATABASE_URL: 'postgres://u:p@localhost:5433/sistema_financas_dev' });
  try {
    assert.equal(typeof storage.signedGetUrl, 'function');
  } finally {
    storage.close();
  }
});

test('sem as variáveis do R2, ou com elas incompletas, só os anexos ficam indisponíveis (503)', () => {
  const logged = mock.method(console, 'error', () => {});
  try {
    for (const env of [
      {},
      { TENDERS_ARCHIVE_BUCKET: 'bucket-de-teste' },
      { ...R2_ENV, TENDERS_STORAGE_PREFIX: 'producao', DATABASE_URL: 'postgres://u:p@localhost:5433/sistema_financas_dev' },
    ]) {
      assert.throws(
        () => createAttachmentStorage(env),
        (error: unknown) =>
          error instanceof RequestInputError && error.status === 503 && error.message === ATTACHMENT_STORAGE_UNAVAILABLE_MESSAGE,
      );
    }
    assert.equal(logged.mock.callCount(), 3);
    assert.doesNotMatch(JSON.stringify(logged.mock.calls.map((call) => call.arguments)), /segredo-de-teste|chave-de-teste/);
  } finally {
    logged.mock.restore();
  }
});
