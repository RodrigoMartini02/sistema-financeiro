import assert from 'node:assert/strict';
import test from 'node:test';
import { contractKeyFromParam, contractPath, isContractKey } from './contractKey';

const KEY = '03353358000196-2-000216/2026';

test('chave do contrato: o número de controle do PNCP ou comprasgov-<id>', () => {
  assert.equal(isContractKey(KEY), true);
  assert.equal(isContractKey('comprasgov-12345'), true);
  for (const invalid of ['', '45', '03353358000196-2-000216', `${KEY}'`, 'comprasgov-', null, undefined]) {
    assert.equal(isContractKey(invalid), false, String(invalid));
  }
});

test('caminho do contrato: a barra da chave vai codificada', () => {
  assert.equal(contractPath(KEY), '/contratos/03353358000196-2-000216%2F2026');
});

test('parâmetro da rota ou da URL: chave válida decodificada, ou null', () => {
  assert.equal(contractKeyFromParam(KEY), KEY, 'o roteador já devolve decodificado');
  assert.equal(contractKeyFromParam('03353358000196-2-000216%2F2026'), KEY, 'link colado ainda codificado');
  assert.equal(contractKeyFromParam('45'), null, 'o id numérico antigo não é chave');
  assert.equal(contractKeyFromParam('%E0%A4%A'), null, 'texto ilegível');
  assert.equal(contractKeyFromParam(null), null);
  assert.equal(contractKeyFromParam(undefined), null);
});
