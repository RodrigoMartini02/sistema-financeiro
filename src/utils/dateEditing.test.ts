import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDateEdit, hasEmptyDigit, normalizeDateText, normalizePastedDate } from './dateEditing';

/** Texto com "|" marcando o cursor, ou "[...]" marcando a seleção. */
function stateOf(marked: string) {
  const selectionStart = marked.includes('[') ? marked.indexOf('[') : marked.indexOf('|');
  const text = marked.replace(/[[\]|]/g, '');
  const selectionEnd = marked.includes(']') ? marked.indexOf(']') - 1 : selectionStart;
  return { text, selectionStart, selectionEnd };
}

/** Resultado com "|" no lugar do cursor. */
function edit(marked: string, inputType: string, data: string | null = null): string | null {
  const result = applyDateEdit(stateOf(marked), { inputType, data });
  if (!result) return null;
  return `${result.text.slice(0, result.caret)}|${result.text.slice(result.caret)}`;
}

const type = (marked: string, data: string) => edit(marked, 'insertText', data);
const backspace = (marked: string) => edit(marked, 'deleteContentBackward');

function typeAll(keys: string): string {
  let marked = '|';
  for (const key of keys) {
    marked = type(marked, key)!;
  }
  return marked;
}

test('digitar do zero põe as barras sozinho, como antes', () => {
  assert.equal(typeAll('0'), '0|');
  assert.equal(typeAll('05'), '05|');
  assert.equal(typeAll('051'), '05/1|');
  assert.equal(typeAll('0510'), '05/10|');
  assert.equal(typeAll('05102026'), '05/10/2026|');
});

test('o nono dígito é ignorado', () => {
  assert.equal(type('05/10/2026|', '7'), '05/10/2026|');
});

test('digitar no meio escreve por cima e o resto não anda', () => {
  assert.equal(type('0|5/10/2026', '8'), '08/|10/2026');
  assert.equal(type('|05/10/2026', '1'), '1|5/10/2026');
  assert.equal(type('05/|10/2026', '0'), '05/0|0/2026');
  assert.equal(type('05/10/20|26', '1'), '05/10/201|6');
});

test('digitar logo antes da barra continua na parte seguinte', () => {
  assert.equal(type('05|/10/2026', '1'), '05/1|0/2026');
  assert.equal(type('05|', '1'), '05/1|');
});

test('apagar do fim tira o dígito, como antes', () => {
  assert.equal(backspace('05/10/2026|'), '05/10/202|');
  assert.equal(backspace('05/1|'), '05|');
  assert.equal(backspace('0|'), '|');
});

test('apagar no meio deixa "_" e o cursor fica no lugar', () => {
  assert.equal(backspace('05|/10/2026'), '0|_/10/2026');
  assert.equal(backspace('05/|10/2026'), '0|_/10/2026');
  assert.equal(backspace('05/1|0/2026'), '05/|_0/2026');
  assert.equal(edit('05|/10/2026', 'deleteContentForward'), '05|/_0/2026');
  assert.equal(type('0|_/10/2026', '7'), '07/|10/2026');
});

test('selecionar e digitar troca só a parte selecionada', () => {
  assert.equal(type('[05]/10/2026', '1'), '1|_/10/2026');
  assert.equal(type('1|_/10/2026', '2'), '12/|10/2026');
  assert.equal(type('05/[10]/2026', '1'), '05/1|_/2026');
  assert.equal(type('05/10/[2026]', '2'), '05/10/2|');
  assert.equal(type('[05/10/2026]', '3'), '3|');
});

test('apagar com seleção limpa só a seleção', () => {
  assert.equal(backspace('[05]/10/2026'), '|__/10/2026');
  assert.equal(backspace('05/10/[2026]'), '05/10|');
  assert.equal(backspace('[05/10/2026]'), '|');
  assert.equal(edit('05/[10]/2026', 'deleteByCut'), '05/|__/2026');
});

test('apagar a palavra limpa a parte do cursor; apagar a linha, tudo antes dele', () => {
  assert.equal(edit('05/10|/2026', 'deleteWordBackward'), '05/|__/2026');
  assert.equal(edit('05/|10/2026', 'deleteWordForward'), '05/|__/2026');
  assert.equal(edit('05/10|/2026', 'deleteSoftLineBackward'), '|__/__/2026');
  assert.equal(edit('05/10|/2026', 'deleteSoftLineForward'), '05/10|');
});

test('barra digitada fecha o dia e o mês com zero na frente', () => {
  assert.equal(typeAll('5/'), '05|');
  assert.equal(typeAll('5/1/2026'), '05/01/2026|');
  assert.equal(typeAll('5.1.26'), '05/01/26|');
  assert.equal(type('05|', '/'), '05|');
  assert.equal(type('|', '/'), '|');
  assert.equal(type('05/10/20|', '/'), '05/10/20|');
});

test('colar uma data inteira troca o campo todo', () => {
  assert.equal(edit('|', 'insertFromPaste', '05/10/2026'), '05/10/2026|');
  assert.equal(edit('01/01/2020|', 'insertFromPaste', ' 5/10/26 '), '05/10/2026|');
  assert.equal(edit('|', 'insertFromPaste', '05102026'), '05/10/2026|');
  assert.equal(edit('|', 'insertFromPaste', '2026-10-05'), '05/10/2026|');
  assert.equal(edit('|', 'insertFromPaste', '2026-10-05T13:00:00Z'), '05/10/2026|');
  assert.equal(edit('05/|', 'insertFromPaste', 'abc10x'), '05/10|');
});

test('edições que o campo não trata ficam para o navegador', () => {
  assert.equal(edit('05|', 'historyUndo'), null);
  assert.equal(edit('05|', 'insertLineBreak'), null);
});

test('texto vindo de fora é arrumado no formato do campo', () => {
  assert.equal(normalizeDateText('05/10/2026'), '05/10/2026');
  assert.equal(normalizeDateText('0_/10/2026'), '0_/10/2026');
  assert.equal(normalizeDateText('05102026'), '05/10/2026');
  assert.equal(normalizeDateText('05/10/20261'), '05/10/2026');
  assert.equal(normalizeDateText(''), '');
});

test('data colada: formatos aceitos e o que não é data', () => {
  assert.equal(normalizePastedDate('31/12/1985'), '31/12/1985');
  assert.equal(normalizePastedDate('1-2-2027'), '01/02/2027');
  assert.equal(normalizePastedDate('outubro'), null);
  assert.equal(normalizePastedDate('5/10'), null);
});

test('dígito apagado no meio marca a data como incompleta', () => {
  assert.equal(hasEmptyDigit('0_/10/2026'), true);
  assert.equal(hasEmptyDigit('05/10/2026'), false);
});
