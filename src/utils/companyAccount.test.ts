import assert from 'node:assert/strict';
import test from 'node:test';
import { ENQUADRAMENTO_OPTIONS, companyDisplayName } from './companyAccount';

test('nome da empresa: nome fantasia ou, sem ele, razão social', () => {
  assert.equal(companyDisplayName({ nome_fantasia: ' ABC Stores ', razao_social: 'Empresa ABC Ltda' }), 'ABC Stores');
  assert.equal(companyDisplayName({ nome_fantasia: '  ', razao_social: 'Empresa ABC Ltda' }), 'Empresa ABC Ltda');
  assert.equal(companyDisplayName({ nome_fantasia: null, razao_social: null }), '');
});

test('enquadramento: a mesma lista que o servidor aceita', () => {
  assert.deepEqual(ENQUADRAMENTO_OPTIONS.map((option) => option.value), ['MEI', 'ME', 'EPP', 'SLU', 'EIRELI', 'LTDA', 'SA']);
});
