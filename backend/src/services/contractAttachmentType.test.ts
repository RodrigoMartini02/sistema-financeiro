import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import {
  ATTACHMENT_SIZE_MESSAGE, ATTACHMENT_TYPE_MESSAGE, checkAttachmentUpload, contentDisposition, detectAttachmentKind,
} from './contractAttachmentType';
import { MAX_ATTACHMENT_BYTES } from './contractTypes';

const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n', 'latin1');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const HTML = Buffer.from('<!doctype html><script>alert(1)</script>');

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.message === message);
}

test('o tipo vem dos primeiros bytes: PDF, PNG e JPEG', () => {
  assert.equal(detectAttachmentKind(PDF), 'pdf');
  assert.equal(detectAttachmentKind(PNG), 'png');
  assert.equal(detectAttachmentKind(JPEG), 'jpg');
  assert.equal(detectAttachmentKind(HTML), null);
  assert.equal(detectAttachmentKind(Buffer.from('%PD')), null);
});

test('aceita PDF, JPG e PNG com a extensão do mesmo tipo, guardando só o nome', () => {
  assert.deepEqual(checkAttachmentUpload({ originalName: 'Contrato assinado.PDF', content: PDF }), {
    kind: 'pdf', originalName: 'Contrato assinado.PDF', size: PDF.length,
  });
  assert.equal(checkAttachmentUpload({ originalName: 'foto.jpeg', content: JPEG }).kind, 'jpg');
  assert.equal(checkAttachmentUpload({ originalName: 'C:\\docs\\nota.png', content: PNG }).originalName, 'nota.png');
  assert.equal(checkAttachmentUpload({ originalName: '../../etc/aditivo.pdf', content: PDF }).originalName, 'aditivo.pdf');
});

test('recusa HTML disfarçado de PDF, extensão trocada e arquivo vazio', () => {
  assertRejects(() => checkAttachmentUpload({ originalName: 'contrato.pdf', content: HTML }), ATTACHMENT_TYPE_MESSAGE);
  assertRejects(() => checkAttachmentUpload({ originalName: 'contrato.html', content: PDF }), ATTACHMENT_TYPE_MESSAGE);
  assertRejects(() => checkAttachmentUpload({ originalName: 'foto.png', content: JPEG }), ATTACHMENT_TYPE_MESSAGE);
  assertRejects(() => checkAttachmentUpload({ originalName: 'vazio.pdf', content: Buffer.alloc(0) }), ATTACHMENT_TYPE_MESSAGE);
});

test('recusa arquivo acima de 20 MB', () => {
  const big = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1);
  PDF.copy(big);
  assertRejects(() => checkAttachmentUpload({ originalName: 'grande.pdf', content: big }), ATTACHMENT_SIZE_MESSAGE);
});

test('cabeçalho do arquivo: abre na tela, com o nome original codificado', () => {
  assert.equal(
    contentDisposition('Contrato nº 1 "final".pdf'),
    `inline; filename="Contrato no 1 final.pdf"; filename*=UTF-8''${encodeURIComponent('Contrato nº 1 "final".pdf')}`,
  );
});
