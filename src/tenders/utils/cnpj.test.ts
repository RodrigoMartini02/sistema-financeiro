import assert from 'node:assert/strict';
import test from 'node:test';
import { cnpjFromSearchText, cnpjLinkPath, cnpjPagePath, isCnpjFormat } from './cnpj';

// A Diretriz (22493902000140) é o CNPJ da conferência do plano; os outros são válidos de exemplo.
const DIRETRIZ = '22493902000140';

test('isCnpjFormat: exatamente 14 dígitos, mesmo com dígito verificador errado', () => {
  assert.equal(isCnpjFormat(DIRETRIZ), true);
  assert.equal(isCnpjFormat('10337488000192'), true, 'dígito errado também é formato de CNPJ');
  for (const invalid of ['', '1122233300018', '112223330001811', '1122233300018A', '11.222.333/0001-81']) {
    assert.equal(isCnpjFormat(invalid), false, invalid);
  }
});

test('texto da caixa de busca: só CNPJ válido (com ou sem pontuação) vira CNPJ', () => {
  assert.equal(cnpjFromSearchText(DIRETRIZ), DIRETRIZ);
  assert.equal(cnpjFromSearchText('22.493.902/0001-40'), DIRETRIZ);
  assert.equal(cnpjFromSearchText('  22.493.902/0001-40  '), DIRETRIZ);
  assert.equal(cnpjFromSearchText('22 493 902 0001 40'), DIRETRIZ);
});

test('texto da caixa de busca: dígito verificador errado, repetidos, tamanho errado ou texto com letra seguem como busca', () => {
  for (const text of [
    '',
    '   ',
    '10337488000192',
    '00000000000000',
    '11111111111111',
    '2249390200014',
    '224939020001400',
    'limpeza predial',
    'CNPJ 22.493.902/0001-40',
    '22.493.902/0001-40 limpeza',
    '00394460005887-1-000216/2026',
    '12345678',
  ]) {
    assert.equal(cnpjFromSearchText(text), null, text);
  }
});

test('página do CNPJ: o endereço e o link só para CNPJ válido', () => {
  assert.equal(cnpjPagePath(DIRETRIZ), '/cnpj/22493902000140');
  assert.equal(cnpjLinkPath(DIRETRIZ), '/cnpj/22493902000140');
  for (const invalid of [null, undefined, '', '10337488000192', '00000000000000', '***.123.456-**', '123']) {
    assert.equal(cnpjLinkPath(invalid), null, String(invalid));
  }
});
