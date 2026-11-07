import assert from 'node:assert/strict';
import test from 'node:test';
import { isCnpjFormat, isValidCnpj, normalizeCnpj } from './cnpj';

// CNPJ do módulo (plano .plans/licitacoes-pagina-cnpj.md): o formato e os dígitos verificadores, com CNPJs reais.

test('normalizeCnpj: só os dígitos, com ou sem máscara', () => {
  assert.equal(normalizeCnpj('22.493.902/0001-40'), '22493902000140');
  assert.equal(normalizeCnpj(' 22493902000140 '), '22493902000140');
  assert.equal(normalizeCnpj('texto'), '');
});

test('isCnpjFormat: exatamente 14 dígitos, mesmo com dígito verificador errado', () => {
  assert.equal(isCnpjFormat('22493902000140'), true);
  assert.equal(isCnpjFormat('10337488000192'), true, 'formato certo, dígitos errados');
  assert.equal(isCnpjFormat('2249390200014'), false);
  assert.equal(isCnpjFormat('224939020001400'), false);
  assert.equal(isCnpjFormat('22.493.902/0001-40'), false, 'a máscara não entra');
  assert.equal(isCnpjFormat(22493902000140), false);
  assert.equal(isCnpjFormat(null), false);
});

test('isValidCnpj: os dígitos verificadores precisam bater', () => {
  assert.equal(isValidCnpj('22493902000140'), true, 'a Diretriz');
  assert.equal(isValidCnpj('00394460005887'), true);
  assert.equal(isValidCnpj('57507378000365'), true);
  assert.equal(isValidCnpj('11222333000181'), true);
});

test('isValidCnpj: recusa o que tem dígito errado nos dados reais, os 14 dígitos iguais e o tamanho errado', () => {
  assert.equal(isValidCnpj('10337488000192'), false);
  assert.equal(isValidCnpj('00000994567506'), false);
  assert.equal(isValidCnpj('00000000000000'), false);
  assert.equal(isValidCnpj('11111111111111'), false);
  assert.equal(isValidCnpj('22493902000141'), false, 'só o último dígito diferente');
  assert.equal(isValidCnpj('2249390200014'), false);
  assert.equal(isValidCnpj('22.493.902/0001-40'), false, 'sem normalizar, a máscara não vale');
  assert.equal(isValidCnpj(undefined), false);
});
