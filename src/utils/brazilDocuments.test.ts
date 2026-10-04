import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatCep, formatCnpj, formatCpf, formatDocument, formatPhone, isValidCnpj, isValidCpf, onlyDigits,
} from './brazilDocuments';

test('máscaras de CPF e CNPJ enquanto se digita', () => {
  assert.equal(formatCpf('529'), '529');
  assert.equal(formatCpf('5299822'), '529.982.2');
  assert.equal(formatCpf('52998224725'), '529.982.247-25');
  assert.equal(formatCpf('529.982.247-2599'), '529.982.247-25');
  assert.equal(formatCnpj('112223'), '11.222.3');
  assert.equal(formatCnpj('112223330001'), '11.222.333/0001');
  assert.equal(formatCnpj('11222333000181'), '11.222.333/0001-81');
  assert.equal(formatDocument('52998224725'), '529.982.247-25');
  assert.equal(formatDocument('11222333000181'), '11.222.333/0001-81');
});

test('CPF: dígitos verificadores, pontuação ignorada e todos os dígitos iguais recusados', () => {
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('52998224724'), false);
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.equal(isValidCpf('5299822472'), false);
  assert.equal(isValidCpf('123'), false);
});

test('CNPJ: dígitos verificadores, pontuação ignorada e todos os dígitos iguais recusados', () => {
  assert.equal(isValidCnpj('11.222.333/0001-81'), true);
  assert.equal(isValidCnpj('11.444.777/0001-61'), true);
  assert.equal(isValidCnpj('11222333000182'), false);
  assert.equal(isValidCnpj('11.222.333/0001-18'), false);
  assert.equal(isValidCnpj('1122233300018'), false);
  assert.equal(isValidCnpj('11.111.111/1111-11'), false);
  assert.equal(isValidCnpj('52998224725'), false);
  assert.equal(isValidCnpj(''), false);
});

test('telefone e CEP', () => {
  assert.equal(formatPhone('19'), '(19');
  assert.equal(formatPhone('1932321000'), '(19) 3232-1000');
  assert.equal(formatPhone('19987654321'), '(19) 98765-4321');
  assert.equal(formatPhone('119'), '(11) 9');
  assert.equal(formatCep('13015000'), '13015-000');
  assert.equal(onlyDigits('(19) 3232-1000'), '1932321000');
});
