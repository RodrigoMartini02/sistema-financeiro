import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { legacyAttachmentId, prepareLegacyAttachment } from './attachmentLegacy';

const PDF_BASE64 = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n').toString('base64');
const FALLBACK = new Date('2026-05-01T12:00:00.000Z');

test('o id do anexo migrado é o md5 do tipo, da linha e da posição, no formato de UUID', () => {
  const hex = createHash('md5').update('legacy:expense:42:1').digest('hex');
  assert.equal(
    legacyAttachmentId('expense', 42, 1),
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
  );
  assert.match(legacyAttachmentId('income', 7, 3), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(legacyAttachmentId('expense', 42, 1), legacyAttachmentId('expense', 42, 1), 'determinístico: rodar de novo não duplica');
  const ids = new Set([
    legacyAttachmentId('expense', 42, 1), legacyAttachmentId('expense', 42, 2), legacyAttachmentId('expense', 43, 1),
    legacyAttachmentId('income', 42, 1),
  ]);
  assert.equal(ids.size, 4, 'tipo, linha e posição mudam o id');
});

test('item válido vira cópia com o tipo do conteúdo, a data de envio e o nome limpo', async () => {
  const result = await prepareLegacyAttachment('expense', 42, 1, {
    id: 'anexo_1', nome: 'Nota fiscal.pdf', tipo: 'application/pdf', tamanho: 10, dados: PDF_BASE64, dataUpload: '2026-03-10T10:00:00.000Z',
  }, FALLBACK);
  assert.ok(result.ok);
  assert.equal(result.copy.id, legacyAttachmentId('expense', 42, 1));
  assert.equal(result.copy.originalName, 'Nota fiscal.pdf');
  assert.equal(result.copy.contentType, 'application/pdf');
  assert.equal(result.copy.inline, true);
  assert.equal(result.copy.unchecked, false);
  assert.equal(Buffer.from(result.copy.content).toString().startsWith('%PDF-'), true);
  assert.equal(result.copy.createdAt?.toISOString(), '2026-03-10T10:00:00.000Z');
});

test('sem data de envio válida, vale a data da linha; cada posição ganha 1 ms para manter a ordem', async () => {
  const first = await prepareLegacyAttachment('income', 7, 1, { nome: 'recibo.pdf', dados: PDF_BASE64, dataUpload: 'ontem' }, FALLBACK);
  const third = await prepareLegacyAttachment('income', 7, 3, { nome: 'recibo.pdf', dados: PDF_BASE64 }, FALLBACK);
  assert.ok(first.ok && third.ok);
  assert.equal(first.copy.createdAt?.toISOString(), FALLBACK.toISOString());
  assert.equal(third.copy.createdAt?.toISOString(), new Date(FALLBACK.getTime() + 2).toISOString());
  const withoutFallback = await prepareLegacyAttachment('income', 7, 2, { nome: 'recibo.pdf', dados: PDF_BASE64 }, null);
  assert.ok(withoutFallback.ok);
  assert.equal(withoutFallback.copy.createdAt, null);
});

test('conteúdo que não bate com o tipo de hoje é guardado só para baixar, e marcado', async () => {
  const html = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
  const renamed = await prepareLegacyAttachment('expense', 5, 1, { nome: 'boleto.pdf', dados: html }, FALLBACK);
  assert.ok(renamed.ok);
  assert.equal(renamed.copy.unchecked, true);
  assert.equal(renamed.copy.contentType, 'application/octet-stream');
  assert.equal(renamed.copy.inline, false, 'nunca abre no navegador');
  assert.equal(renamed.copy.originalName, 'boleto.pdf');

  const oldFormat = await prepareLegacyAttachment('expense', 5, 2, { nome: 'foto.heic', dados: PDF_BASE64 }, FALLBACK);
  assert.ok(oldFormat.ok);
  assert.equal(oldFormat.copy.unchecked, true);

  const pathName = await prepareLegacyAttachment('expense', 5, 3, { nome: 'C:\\fakepath\\..\\xml.xml', dados: html }, FALLBACK);
  assert.ok(pathName.ok);
  assert.equal(pathName.copy.originalName, 'xml.xml', 'o nome nunca leva pasta');
});

test('item que não dá para copiar volta com o motivo, nunca some', async () => {
  const reasons = [
    await prepareLegacyAttachment('expense', 1, 1, 'texto', FALLBACK),
    await prepareLegacyAttachment('expense', 1, 2, null, FALLBACK),
    await prepareLegacyAttachment('expense', 1, 3, ['a'], FALLBACK),
    await prepareLegacyAttachment('expense', 1, 4, { dados: PDF_BASE64 }, FALLBACK),
    await prepareLegacyAttachment('expense', 1, 5, { nome: 'a.pdf' }, FALLBACK),
    await prepareLegacyAttachment('expense', 1, 6, { nome: 'a.pdf', dados: '###não é base64###' }, FALLBACK),
    await prepareLegacyAttachment('expense', 1, 7, { nome: 'a.pdf', dados: '====' }, FALLBACK),
    await prepareLegacyAttachment('expense', 1, 8, { nome: '   ', dados: PDF_BASE64 }, FALLBACK),
  ].map((result) => (result.ok ? 'ok' : result.reason));
  assert.deepEqual(reasons, [
    'o item não é um objeto', 'o item não é um objeto', 'o item não é um objeto', 'item sem nome', 'item sem conteúdo',
    'o conteúdo não é base64', 'o conteúdo não é base64', 'item sem nome',
  ]);
});
