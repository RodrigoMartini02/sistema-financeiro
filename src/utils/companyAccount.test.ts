import assert from 'node:assert/strict';
import test from 'node:test';
import { ENQUADRAMENTO_OPTIONS, companyDisplayName, isValidCnpj, parseInitialBalance } from './companyAccount';

test('nome da empresa: nome fantasia ou, sem ele, razão social', () => {
  assert.equal(companyDisplayName({ nome_fantasia: ' ABC Stores ', razao_social: 'Empresa ABC Ltda' }), 'ABC Stores');
  assert.equal(companyDisplayName({ nome_fantasia: '  ', razao_social: 'Empresa ABC Ltda' }), 'Empresa ABC Ltda');
  assert.equal(companyDisplayName({ nome_fantasia: null, razao_social: null }), '');
});

test('CNPJ confere os dígitos verificadores', () => {
  assert.equal(isValidCnpj('11.222.333/0001-81'), true);
  assert.equal(isValidCnpj('11222333000181'), true);
  assert.equal(isValidCnpj('11.444.777/0001-61'), true);
  assert.equal(isValidCnpj('11.222.333/0001-82'), false);
  assert.equal(isValidCnpj('11.222.333/0001-18'), false);
  assert.equal(isValidCnpj('1122233300018'), false);
  assert.equal(isValidCnpj('11111111111111'), false);
  assert.equal(isValidCnpj('529.982.247-25'), false);
  assert.equal(isValidCnpj(''), false);
});

test('saldo inicial digitado: vírgula ou ponto; vazio ou zero vira null', () => {
  assert.equal(parseInitialBalance('1.500,50'), 1500.5);
  assert.equal(parseInitialBalance('1500.5'), 1500.5);
  assert.equal(parseInitialBalance('R$ 200'), 200);
  assert.equal(parseInitialBalance(''), null);
  assert.equal(parseInitialBalance('0,00'), null);
  assert.equal(parseInitialBalance('abc'), null);
});

test('enquadramento: a mesma lista que o servidor aceita', () => {
  assert.deepEqual(ENQUADRAMENTO_OPTIONS.map((option) => option.value), ['MEI', 'ME', 'EPP', 'SLU', 'EIRELI', 'LTDA', 'SA']);
});
