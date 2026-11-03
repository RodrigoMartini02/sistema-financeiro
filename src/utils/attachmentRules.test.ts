import assert from 'node:assert/strict';
import test from 'node:test';
import { ATTACHMENT_RULES, attachmentProblem, extensionOf, formatFileSize } from './attachmentRules';

const MEGABYTE = 1024 * 1024;

test('as regras de cada tipo de dono repetem as do servidor: tipos e tamanho', () => {
  assert.deepEqual(ATTACHMENT_RULES.contract.extensions, ['pdf', 'jpg', 'jpeg', 'png']);
  assert.equal(ATTACHMENT_RULES.contract.maxBytes, 20 * MEGABYTE);
  assert.deepEqual(ATTACHMENT_RULES.product.extensions, ['jpg', 'jpeg', 'png', 'webp']);
  assert.equal(ATTACHMENT_RULES.product.maxBytes, 8 * MEGABYTE);
  assert.deepEqual(ATTACHMENT_RULES.expense, ATTACHMENT_RULES.income);
  assert.equal(ATTACHMENT_RULES.expense.maxBytes, 10 * MEGABYTE);
  assert.deepEqual(ATTACHMENT_RULES.expense.extensions, ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'xls', 'xlsx', 'doc', 'docx', 'txt']);
});

test('o seletor de arquivos e a dica saem das mesmas regras', () => {
  assert.equal(ATTACHMENT_RULES.contract.accept, '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png');
  assert.equal(ATTACHMENT_RULES.product.accept, '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp');
  assert.equal(ATTACHMENT_RULES.contract.hint, 'PDF, JPG ou PNG, até 20 MB.');
  assert.equal(ATTACHMENT_RULES.product.hint, 'JPG, PNG ou WebP, até 8 MB.');
  assert.equal(ATTACHMENT_RULES.expense.hint, 'PDF, imagem, planilha, DOC ou TXT, até 10 MB.');
});

test('a extensão vem do fim do nome, em minúsculas', () => {
  assert.equal(extensionOf('Nota Fiscal.PDF'), 'pdf');
  assert.equal(extensionOf('arquivo.tar.gz'), 'gz');
  assert.equal(extensionOf('semextensao'), '');
});

test('confere o arquivo antes de enviar: tipo, vazio e tamanho', () => {
  assert.equal(attachmentProblem('contract', { name: 'contrato.pdf', size: 1000 }), '');
  assert.equal(attachmentProblem('contract', { name: 'foto.JPG', size: 20 * MEGABYTE }), '');
  assert.equal(attachmentProblem('contract', { name: 'foto.png', size: 20 * MEGABYTE + 1 }), '"foto.png" passa de 20 MB.');
  assert.equal(attachmentProblem('contract', { name: 'planilha.xlsx', size: 10 }), '"planilha.xlsx": envie PDF, JPG ou PNG.');
  assert.equal(attachmentProblem('contract', { name: 'vazio.pdf', size: 0 }), '"vazio.pdf" está vazio.');
  assert.equal(attachmentProblem('product', { name: 'camiseta.webp', size: 8 * MEGABYTE }), '');
  assert.equal(attachmentProblem('product', { name: 'camiseta.gif', size: 10 }), '"camiseta.gif": envie JPG, PNG ou WebP.');
  assert.equal(attachmentProblem('expense', { name: 'recibo.docx', size: 10 * MEGABYTE }), '');
  assert.equal(attachmentProblem('income', { name: 'recibo.txt', size: 10 * MEGABYTE + 1 }), '"recibo.txt" passa de 10 MB.');
  assert.equal(attachmentProblem('expense', { name: 'virus.exe', size: 10 }), '"virus.exe": envie PDF, imagem, planilha, DOC ou TXT.');
});

test('mostra o tamanho em KB abaixo de 1 MB e em MB depois, com vírgula', () => {
  assert.equal(formatFileSize(10), '1 KB');
  assert.equal(formatFileSize(1536), '2 KB');
  assert.equal(formatFileSize(MEGABYTE), '1,0 MB');
  assert.equal(formatFileSize(Math.round(2.5 * MEGABYTE)), '2,5 MB');
});
