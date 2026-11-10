import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryStorage } from '../objectStorageTestSupport';
import { RequestInputError } from '../utils/requestInput';
import { MAX_PHOTO_BYTES, PHOTO_LINK_TTL_SECONDS, photoLink, readPhotoUpload } from './userPhoto';

// Fotos de perfil: leitura do recorte do app (tipo pelo conteúdo, tamanho) e link assinado. A troca no R2 e na
// coluna do banco é testada com o banco local em team.db.test.ts.

const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0];
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_HEADER = [0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];

function dataUrl(mime: string, header: readonly number[], extraBytes = 16): string {
  const bytes = Buffer.from([...header, ...new Array<number>(extraBytes).fill(7)]);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.status === 400 && error.message === message);
}

test('foto: aceita JPEG, PNG e WebP pelo conteúdo, com o tipo e a extensão certos', () => {
  const jpeg = readPhotoUpload({ image: dataUrl('image/jpeg', JPEG_HEADER) });
  assert.equal(jpeg.contentType, 'image/jpeg');
  assert.equal(jpeg.extension, 'jpg');
  assert.equal(jpeg.bytes.byteLength, JPEG_HEADER.length + 16);
  assert.equal(readPhotoUpload({ image: dataUrl('image/png', PNG_HEADER) }).extension, 'png');
  assert.equal(readPhotoUpload({ image: dataUrl('image/webp', WEBP_HEADER) }).extension, 'webp');
});

test('foto: o tipo declarado precisa bater com o conteúdo; arquivo que não é imagem é recusado', () => {
  const invalid = 'Envie uma imagem JPG, PNG ou WebP';
  assertRejects(() => readPhotoUpload({ image: dataUrl('image/png', JPEG_HEADER) }), invalid);
  assertRejects(() => readPhotoUpload({ image: dataUrl('image/jpeg', [0x25, 0x50, 0x44, 0x46]) }), invalid);
  assertRejects(() => readPhotoUpload({ image: dataUrl('image/webp', [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20]) }), invalid);
  assertRejects(() => readPhotoUpload({ image: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }), invalid);
  assertRejects(() => readPhotoUpload({ image: 'data:image/jpeg;base64,' }), invalid);
  assertRejects(() => readPhotoUpload({ image: 'não é um data url' }), invalid);
  assertRejects(() => readPhotoUpload({ image: 'https://exemplo.test/foto.jpg' }), invalid);
});

test('foto: sem imagem ou com corpo inválido, e acima de 1 MB, é recusada', () => {
  assertRejects(() => readPhotoUpload({}), 'Envie a imagem da foto');
  assertRejects(() => readPhotoUpload({ image: '' }), 'Envie a imagem da foto');
  assertRejects(() => readPhotoUpload({ image: 42 }), 'Envie a imagem da foto');
  assertRejects(() => readPhotoUpload(null), 'Pedido inválido');
  assertRejects(() => readPhotoUpload({ image: dataUrl('image/jpeg', JPEG_HEADER, MAX_PHOTO_BYTES) }), 'A imagem deve ter no máximo 1 MB');
  const hugeText = `data:image/jpeg;base64,${'A'.repeat(MAX_PHOTO_BYTES * 2)}`;
  assertRejects(() => readPhotoUpload({ image: hugeText }), 'A imagem deve ter no máximo 1 MB');
});

test('foto: exatamente no limite de 1 MB passa', () => {
  const upload = readPhotoUpload({ image: dataUrl('image/jpeg', JPEG_HEADER, MAX_PHOTO_BYTES - JPEG_HEADER.length) });
  assert.equal(upload.bytes.byteLength, MAX_PHOTO_BYTES);
});

test('link da foto: assinado e de vida curta; sem chave ou sem R2 não há link', async () => {
  const { storage } = createMemoryStorage();
  assert.equal(await photoLink(storage, 'usuarios/7/a.jpg'), `memory://usuarios/7/a.jpg?expires=${PHOTO_LINK_TTL_SECONDS}`);
  assert.equal(await photoLink(storage, null), null);
  assert.equal(await photoLink(null, 'usuarios/7/a.jpg'), null);
  const unsigned = { ...storage, signedGetUrl: undefined };
  assert.equal(await photoLink(unsigned, 'usuarios/7/a.jpg'), null);
});

test('link da foto: falha ao assinar não derruba a lista, vira "sem link"', async () => {
  const { storage } = createMemoryStorage();
  const broken = { ...storage, signedGetUrl: async () => { throw new Error('sem chave'); } };
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(await photoLink(broken, 'usuarios/7/a.jpg'), null);
  } finally {
    console.error = originalError;
  }
});
