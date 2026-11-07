import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import { companyAccountColumns, readCompanyAccountInput, readLoginAccessInput } from './companyAccountInput';

const VALID_CNPJ = '11.222.333/0001-81';

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    razao_social: '  Empresa ABC Ltda  ',
    nome_fantasia: '  ABC Stores ',
    documento: VALID_CNPJ,
    enquadramento: 'LTDA',
    data_abertura: '2020-05-10',
    ...overrides,
  };
}

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.message === message);
}

test('lê o bloco da empresa: apara os nomes e guarda o CNPJ só com dígitos', () => {
  const input = readCompanyAccountInput(body());
  assert.equal(input.legalName, 'Empresa ABC Ltda');
  assert.equal(input.tradeName, 'ABC Stores');
  assert.equal(input.document, '11222333000181');
  assert.equal(input.enquadramento, 'LTDA');
  assert.equal(input.openingDate, '2020-05-10');
});

test('razão social é obrigatória e respeita o tamanho da coluna', () => {
  assertRejects(() => readCompanyAccountInput(body({ razao_social: undefined })), 'Informe a razão social');
  assertRejects(() => readCompanyAccountInput(body({ razao_social: '   ' })), 'Informe a razão social');
  assertRejects(() => readCompanyAccountInput(body({ razao_social: 'x'.repeat(151) })), 'Razão social: até 150 caracteres');
  assert.equal(readCompanyAccountInput(body({ razao_social: 'x'.repeat(150) })).legalName.length, 150);
});

test('nome fantasia é opcional: ausente ou em branco vira null', () => {
  assert.equal(readCompanyAccountInput(body({ nome_fantasia: undefined })).tradeName, null);
  assert.equal(readCompanyAccountInput(body({ nome_fantasia: '   ' })).tradeName, null);
  assertRejects(() => readCompanyAccountInput(body({ nome_fantasia: 'x'.repeat(151) })), 'Nome fantasia: até 150 caracteres');
});

test('CNPJ confere os dígitos verificadores', () => {
  assert.equal(readCompanyAccountInput(body({ documento: '11222333000181' })).document, '11222333000181');
  assertRejects(() => readCompanyAccountInput(body({ documento: '11.222.333/0001-82' })), 'CNPJ inválido');
  assertRejects(() => readCompanyAccountInput(body({ documento: '1122233300018' })), 'CNPJ inválido');
  assertRejects(() => readCompanyAccountInput(body({ documento: '11111111111111' })), 'CNPJ inválido');
  assertRejects(() => readCompanyAccountInput(body({ documento: '529.982.247-25' })), 'CNPJ inválido');
  assertRejects(() => readCompanyAccountInput(body({ documento: 11222333000181 })), 'CNPJ inválido');
  assertRejects(() => readCompanyAccountInput(body({ documento: '' })), 'Informe o CNPJ');
  assertRejects(() => readCompanyAccountInput(body({ documento: undefined })), 'Informe o CNPJ');
});

test('enquadramento é opcional e só aceita os da lista', () => {
  assert.equal(readCompanyAccountInput(body({ enquadramento: undefined })).enquadramento, null);
  assert.equal(readCompanyAccountInput(body({ enquadramento: '' })).enquadramento, null);
  assert.equal(readCompanyAccountInput(body({ enquadramento: 'MEI' })).enquadramento, 'MEI');
  assertRejects(() => readCompanyAccountInput(body({ enquadramento: 'XPTO' })), 'Enquadramento inválido');
  assertRejects(() => readCompanyAccountInput(body({ enquadramento: 'ltda' })), 'Enquadramento inválido');
});

test('data de abertura é opcional e precisa ser uma data válida', () => {
  assert.equal(readCompanyAccountInput(body({ data_abertura: undefined })).openingDate, null);
  assert.equal(readCompanyAccountInput(body({ data_abertura: '' })).openingDate, null);
  assertRejects(() => readCompanyAccountInput(body({ data_abertura: '2026-02-30' })), 'Data de abertura inválida');
  assertRejects(() => readCompanyAccountInput(body({ data_abertura: '10/05/2020' })), 'Data de abertura inválida');
});

test('aporte_inicial de cliente antigo é ignorado: a conta não tem mais saldo de abertura', () => {
  const columns = companyAccountColumns(readCompanyAccountInput(body({ aporte_inicial: 1500.5 })));
  assert.equal('initialContribution' in columns, false);
  assert.doesNotThrow(() => readCompanyAccountInput(body({ aporte_inicial: -1 })));
});

test('nome da conta: nome fantasia ou, sem ele, razão social', () => {
  assert.equal(readCompanyAccountInput(body()).displayName, 'ABC Stores');
  assert.equal(readCompanyAccountInput(body({ nome_fantasia: '' })).displayName, 'Empresa ABC Ltda');
  assert.equal(readCompanyAccountInput(body({ nome_fantasia: undefined, razao_social: 'y'.repeat(150) })).displayName.length, 100);
});

test('colunas da conta saem do bloco lido', () => {
  const columns = companyAccountColumns(readCompanyAccountInput(body({ enquadramento: '', data_abertura: '' })));
  assert.deepEqual(columns, {
    name: 'ABC Stores',
    document: '11222333000181',
    legalName: 'Empresa ABC Ltda',
    tradeName: 'ABC Stores',
    enquadramento: null,
    openingDate: null,
  });
});

test('pedido que não é objeto é recusado', () => {
  assertRejects(() => readCompanyAccountInput(null), 'Pedido inválido');
  assertRejects(() => readCompanyAccountInput([]), 'Pedido inválido');
});

test('acesso da PJ do login: e-mail normalizado e nova senha opcional', () => {
  assert.deepEqual(readLoginAccessInput({ email: '  Contato@Empresa.com ' }), { email: 'contato@empresa.com', newPassword: null });
  assert.deepEqual(readLoginAccessInput({}), { email: undefined, newPassword: null });
  assert.deepEqual(readLoginAccessInput({ nova_senha: '' }), { email: undefined, newPassword: null });
  assert.equal(readLoginAccessInput({ nova_senha: '12345678' }).newPassword, '12345678');
  assertRejects(() => readLoginAccessInput({ email: '' }), 'Informe o e-mail');
  assertRejects(() => readLoginAccessInput({ email: 'sem-arroba' }), 'E-mail inválido');
  assertRejects(() => readLoginAccessInput({ nova_senha: '1234567' }), 'A nova senha precisa ter pelo menos 8 caracteres');
  assertRejects(() => readLoginAccessInput({ nova_senha: 12345678 }), 'Nova senha inválida');
});
