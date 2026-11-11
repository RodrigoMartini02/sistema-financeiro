import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import { MAX_DOCUMENT_BYTES, contentDispositionFor, readDocumentUpload, sanitizeFileName } from './documentUpload';

// Arquivo do cofre (item 5): o tipo vale pelo conteúdo (PDF, JPG ou PNG), o tamanho tem teto de 10 MB, o nome é só um rótulo
// limpo e o cabeçalho de abertura leva o nome codificado.

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0];
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function dataUrl(mime: string, header: readonly number[], extraBytes = 16): string {
  const bytes = Buffer.from([...header, ...new Array<number>(extraBytes).fill(7)]);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.status === 400 && error.message === message);
}

const INVALID = 'O arquivo deve ser um PDF, JPG ou PNG';
const TOO_LARGE = 'O arquivo deve ter no máximo 10 MB';
const MISSING = 'Envie o arquivo do documento';

test('arquivo: aceita PDF, JPG e PNG pelo conteúdo, com o tipo e a extensão certos', () => {
  const pdf = readDocumentUpload({ name: 'Certidão FGTS.pdf', data: dataUrl('application/pdf', PDF_HEADER) });
  assert.equal(pdf.contentType, 'application/pdf');
  assert.equal(pdf.extension, 'pdf');
  assert.equal(pdf.bytes.byteLength, PDF_HEADER.length + 16);
  assert.equal(pdf.fileName, 'Certidão FGTS.pdf');
  assert.equal(readDocumentUpload({ name: 'foto', data: dataUrl('image/jpeg', JPEG_HEADER) }).extension, 'jpg');
  assert.equal(readDocumentUpload({ name: 'foto', data: dataUrl('image/png', PNG_HEADER) }).extension, 'png');
});

test('arquivo: o PDF pode ter alguns bytes antes do cabeçalho, até 1024', () => {
  const withLeadingBytes = [...new Array<number>(500).fill(0x20), ...PDF_HEADER];
  assert.equal(readDocumentUpload({ name: 'a.pdf', data: dataUrl('application/pdf', withLeadingBytes) }).extension, 'pdf');
  const tooFar = [...new Array<number>(1500).fill(0x20), ...PDF_HEADER];
  assertRejects(() => readDocumentUpload({ name: 'a.pdf', data: dataUrl('application/pdf', tooFar) }), INVALID);
});

test('arquivo: o tipo declarado precisa bater com o conteúdo; o que não é PDF, JPG ou PNG é recusado', () => {
  assertRejects(() => readDocumentUpload({ name: 'a.pdf', data: dataUrl('application/pdf', JPEG_HEADER) }), INVALID);
  assertRejects(() => readDocumentUpload({ name: 'a.jpg', data: dataUrl('image/jpeg', PDF_HEADER) }), INVALID);
  assertRejects(() => readDocumentUpload({ name: 'a.png', data: dataUrl('image/png', JPEG_HEADER) }), INVALID);
  assertRejects(() => readDocumentUpload({ name: 'a.zip', data: dataUrl('application/zip', [0x50, 0x4b, 0x03, 0x04]) }), INVALID);
  assertRejects(() => readDocumentUpload({ name: 'a.svg', data: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }), INVALID);
  assertRejects(() => readDocumentUpload({ name: 'a.exe', data: dataUrl('application/pdf', [0x4d, 0x5a, 0x90, 0x00]) }), INVALID);
  assertRejects(() => readDocumentUpload({ name: 'a.pdf', data: 'data:application/pdf;base64,' }), INVALID);
  assertRejects(() => readDocumentUpload({ name: 'a.pdf', data: 'não é um data url' }), INVALID);
  assertRejects(() => readDocumentUpload({ name: 'a.pdf', data: 'https://exemplo.test/a.pdf' }), INVALID);
  assertRejects(() => readDocumentUpload({ name: 'a.pdf', data: 'data:application/pdf;base64,JVBERi0x$$$' }), INVALID);
});

test('arquivo: sem arquivo ou com corpo inválido é recusado', () => {
  assertRejects(() => readDocumentUpload(undefined), MISSING);
  assertRejects(() => readDocumentUpload(null), MISSING);
  assertRejects(() => readDocumentUpload([]), MISSING);
  assertRejects(() => readDocumentUpload('texto'), MISSING);
  assertRejects(() => readDocumentUpload({ name: 'a.pdf' }), MISSING);
  assertRejects(() => readDocumentUpload({ name: 'a.pdf', data: '' }), MISSING);
  assertRejects(() => readDocumentUpload({ name: 'a.pdf', data: 42 }), MISSING);
});

test('arquivo: acima de 10 MB é recusado e exatamente 10 MB passa', () => {
  assertRejects(() => readDocumentUpload({ name: 'a.pdf', data: dataUrl('application/pdf', PDF_HEADER, MAX_DOCUMENT_BYTES) }), TOO_LARGE);
  const hugeText = `data:application/pdf;base64,${'A'.repeat(MAX_DOCUMENT_BYTES * 2)}`;
  assertRejects(() => readDocumentUpload({ name: 'a.pdf', data: hugeText }), TOO_LARGE);
  const atLimit = readDocumentUpload({
    name: 'a.pdf',
    data: dataUrl('application/pdf', PDF_HEADER, MAX_DOCUMENT_BYTES - PDF_HEADER.length),
  });
  assert.equal(atLimit.bytes.byteLength, MAX_DOCUMENT_BYTES);
});

test('nome do arquivo: sem caminho, sem caracteres reservados, com a extensão do conteúdo', () => {
  assert.equal(sanitizeFileName('C:\\Users\\ana\\Documentos\\Certidão federal.pdf', 'pdf'), 'Certidão federal.pdf');
  assert.equal(sanitizeFileName('../../etc/passwd', 'pdf'), 'passwd.pdf');
  assert.equal(sanitizeFileName('a<b>c:"d"|e?f*.pdf', 'pdf'), 'abcdef.pdf');
  assert.equal(sanitizeFileName('foto.JPEG', 'jpg'), 'foto.jpg', 'a extensão que o cliente mandou não vale: a do conteúdo, sim');
  assert.equal(sanitizeFileName('sem extensão', 'png'), 'sem extensão.png');
  assert.equal(sanitizeFileName('  muitos    espaços  .pdf', 'pdf'), 'muitos espaços.pdf');
  assert.equal(sanitizeFileName('linha\nnova\t.pdf', 'pdf'), 'linhanova.pdf');
  assert.equal(sanitizeFileName('.oculto.pdf', 'pdf'), 'oculto.pdf');
  assert.equal(sanitizeFileName('...', 'pdf'), 'documento.pdf');
  assert.equal(sanitizeFileName('', 'pdf'), 'documento.pdf');
  assert.equal(sanitizeFileName(undefined, 'jpg'), 'documento.jpg');
  assert.equal(sanitizeFileName(42, 'jpg'), 'documento.jpg');
  const long = sanitizeFileName(`${'a'.repeat(300)}.pdf`, 'pdf');
  assert.equal(long.length, 120 + '.pdf'.length, 'até 120 caracteres além da extensão');
});

test('cabeçalho de abertura: inline, com o nome codificado (RFC 5987) e uma cópia só ASCII', () => {
  assert.equal(
    contentDispositionFor('Certidão FGTS.pdf'),
    `inline; filename="Certid_o FGTS.pdf"; filename*=UTF-8''Certid%C3%A3o%20FGTS.pdf`,
  );
  assert.equal(contentDispositionFor('simples.pdf'), `inline; filename="simples.pdf"; filename*=UTF-8''simples.pdf`);
  // Apóstrofo, parênteses e asterisco não podem ficar soltos no valor codificado; aspas não podem estar na cópia ASCII.
  const awkward = contentDispositionFor(`o'brien (1) *final* "x".pdf`);
  assert.match(awkward, /filename\*=UTF-8''o%27brien%20%281%29%20%2Afinal%2A%20%22x%22\.pdf$/);
  assert.ok(!awkward.includes(`filename="o'brien (1) *final* "x"`), 'aspas dentro da cópia ASCII seriam um cabeçalho quebrado');
  // Só ASCII visível no cabeçalho inteiro.
  assert.match(contentDispositionFor('çãõ ü.pdf'), /^[\x20-\x7e]+$/);
});
