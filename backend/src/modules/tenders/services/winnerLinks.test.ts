import assert from 'node:assert/strict';
import test from 'node:test';
import { purchaseLink } from './winnerLinks';

test('endereço da compra: o CNPJ do órgão, o ano e o sequencial sem zeros à esquerda', () => {
  assert.equal(purchaseLink('03353358000196-1-000216/2026'), 'https://pncp.gov.br/app/editais/03353358000196/2026/216');
  assert.equal(purchaseLink('00394460005887-1-1234567/2021'), 'https://pncp.gov.br/app/editais/00394460005887/2021/1234567');
  assert.equal(purchaseLink('formato-diferente'), '');
});
