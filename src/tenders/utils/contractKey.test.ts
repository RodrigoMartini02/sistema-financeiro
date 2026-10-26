import assert from 'node:assert/strict';
import test from 'node:test';
import { contractKeyFromParam, contractPath, isContractKey } from './contractKey';

const KEY = '03353358000196-2-000216/2026';

const FEDERAL_KEY = 'comprasgov-153254-50-00586/2023';

// Os mesmos casos do teste do backend (contractStore/layout.test.ts).
test('chave do contrato: o número de controle do PNCP ou comprasgov-<unidade>-<tipo>-<número>', () => {
  for (const valid of [KEY, '00394460005887-1-1234567/2021', FEDERAL_KEY, 'comprasgov-153254-99-2024NE000014', 'comprasgov-1-8-A_b.c-1/2']) {
    assert.equal(isContractKey(valid), true, valid);
  }
  const invalid = [
    '',
    '45',
    '03353358000196-2-000216',
    `${KEY}'`,
    'comprasgov-',
    'comprasgov-abc',
    'comprasgov-98765',
    'comprasgov-153254-50',
    'comprasgov-153254-50-',
    `${FEDERAL_KEY}'`,
    'comprasgov-153254-50-00586 2023',
    `${FEDERAL_KEY}\n`,
    `comprasgov-153254-50-${'9'.repeat(41)}`,
    'comprasgov-12345678901-50-1',
    null,
    undefined,
  ];
  for (const value of invalid) {
    assert.equal(isContractKey(value), false, String(value));
  }
});

test('caminho do contrato: a barra da chave vai codificada', () => {
  assert.equal(contractPath(KEY), '/contratos/03353358000196-2-000216%2F2026');
  assert.equal(contractPath(FEDERAL_KEY), '/contratos/comprasgov-153254-50-00586%2F2023');
});

test('parâmetro da rota ou da URL: chave válida decodificada, ou null', () => {
  assert.equal(contractKeyFromParam(KEY), KEY, 'o roteador já devolve decodificado');
  assert.equal(contractKeyFromParam('03353358000196-2-000216%2F2026'), KEY, 'link colado ainda codificado');
  assert.equal(contractKeyFromParam('comprasgov-153254-50-00586%2F2023'), FEDERAL_KEY, 'chave federal colada codificada');
  assert.equal(contractKeyFromParam('45'), null, 'o id numérico antigo não é chave');
  assert.equal(contractKeyFromParam('%E0%A4%A'), null, 'texto ilegível');
  assert.equal(contractKeyFromParam(null), null);
  assert.equal(contractKeyFromParam(undefined), null);
});
