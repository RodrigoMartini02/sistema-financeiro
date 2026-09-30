import assert from 'node:assert/strict';
import test from 'node:test';
import { brDateToIso, completeBrDate, isoToBrDate, isoToShortBrDate, maskBrDate } from './date';

test('máscara põe as barras enquanto digita e ignora o que não é dígito', () => {
  assert.equal(maskBrDate('0'), '0');
  assert.equal(maskBrDate('051'), '05/1');
  assert.equal(maskBrDate('0510'), '05/10');
  assert.equal(maskBrDate('05102026'), '05/10/2026');
  assert.equal(maskBrDate('05/10/2026999'), '05/10/2026');
  assert.equal(maskBrDate('ab05c'), '05');
});

test('complemento usa o mês e o ano de hoje no que faltar', () => {
  assert.equal(completeBrDate('5', '2026-09-29'), '05/09/2026');
  assert.equal(completeBrDate('0510', '2026-09-29'), '05/10/2026');
  assert.equal(completeBrDate('05/10', '2026-09-29'), '05/10/2026');
  assert.equal(completeBrDate('051026', '2026-09-29'), '05/10/2026');
  assert.equal(completeBrDate('05/10/2027', '2026-09-29'), '05/10/2027');
  assert.equal(completeBrDate('', '2026-09-29'), '');
});

test('conversão entre dd/mm/aaaa e ISO recusa data que não existe', () => {
  assert.equal(brDateToIso('05/10/2026'), '2026-10-05');
  assert.equal(brDateToIso('29/02/2028'), '2028-02-29');
  assert.equal(brDateToIso('30/02/2026'), '');
  assert.equal(brDateToIso('31/04/2026'), '');
  assert.equal(brDateToIso('05/10'), '');
  assert.equal(isoToBrDate('2026-10-05'), '05/10/2026');
  assert.equal(isoToBrDate(null), '');
  assert.equal(isoToShortBrDate('2026-10-05'), '05/10');
});
