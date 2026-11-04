import assert from 'node:assert/strict';
import test from 'node:test';
import { brDateToIso, completeBrDate, isoToBrDate, isoToShortBrDate } from './date';

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

test('data com dígito apagado no meio ("_") fica incompleta: não completa nem converte', () => {
  assert.equal(completeBrDate('0_/10/2026', '2026-10-05'), '0_/10/2026');
  assert.equal(completeBrDate('05/__/2026', '2026-10-05'), '05/__/2026');
  assert.equal(brDateToIso('0_/10/2026'), '');
  assert.equal(brDateToIso('05/10/__26'), '');
});
