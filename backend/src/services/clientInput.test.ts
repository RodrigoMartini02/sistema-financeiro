import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import { readClientActiveInput, readClientInput, readClientListQuery } from './clientInput';

const VALID_CPF = '52998224725';
const VALID_CNPJ = '11222333000181';

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.message === message);
}

const company = (overrides: Record<string, unknown> = {}) => ({
  type: 'empresa',
  name: '  Acme Sistemas Ltda ',
  document: '11.222.333/0001-81',
  ...overrides,
});

const publicEntity = (overrides: Record<string, unknown> = {}) => company({
  type: 'orgao_publico',
  name: 'Prefeitura de Campinas',
  sphere: 'municipal',
  agency: ' Secretaria de Saúde ',
  ...overrides,
});

test('pessoa física: CPF só com dígitos, sem esfera e órgão, contato e endereço vazios viram nulo', () => {
  const input = readClientInput({
    type: 'pessoa_fisica',
    name: 'Maria Souza',
    document: '529.982.247-25',
    sphere: 'federal',
    agency: 'Ignorado',
    contactName: '  ',
    contactEmail: '',
    contactPhone: '',
    zipCode: '',
    state: '',
  });
  assert.equal(input.type, 'pessoa_fisica');
  assert.equal(input.document, VALID_CPF);
  assert.equal(input.sphere, null);
  assert.equal(input.agency, null);
  assert.equal(input.contactName, null);
  assert.equal(input.contactEmail, null);
  assert.equal(input.contactPhone, null);
  assert.equal(input.zipCode, null);
  assert.equal(input.state, null);
});

test('empresa: CNPJ, nome aparado e contato e endereço normalizados', () => {
  const input = readClientInput(company({
    contactName: ' João ',
    contactEmail: ' Joao@Acme.com.br ',
    contactPhone: '(19) 3232-1000',
    zipCode: '13015-000',
    street: 'Rua Barão de Jaguara',
    number: '100',
    district: 'Centro',
    city: 'Campinas',
    state: ' sp ',
  }));
  assert.equal(input.name, 'Acme Sistemas Ltda');
  assert.equal(input.document, VALID_CNPJ);
  assert.equal(input.contactName, 'João');
  assert.equal(input.contactEmail, 'joao@acme.com.br');
  assert.equal(input.contactPhone, '1932321000');
  assert.equal(input.zipCode, '13015000');
  assert.equal(input.state, 'SP');
  assert.equal(input.complement, null);
});

test('órgão público exige esfera e órgão ou secretaria', () => {
  const input = readClientInput(publicEntity());
  assert.equal(input.sphere, 'municipal');
  assert.equal(input.agency, 'Secretaria de Saúde');
  assertRejects(() => readClientInput(publicEntity({ sphere: undefined })), 'Informe a esfera: municipal, estadual ou federal');
  assertRejects(() => readClientInput(publicEntity({ sphere: 'distrital' })), 'Informe a esfera: municipal, estadual ou federal');
  assertRejects(() => readClientInput(publicEntity({ agency: ' ' })), 'Informe o órgão ou secretaria');
});

test('documento obrigatório e com dígitos verificadores certos para o tipo', () => {
  assertRejects(() => readClientInput(company({ document: '' })), 'Informe o CNPJ');
  assertRejects(() => readClientInput(company({ document: '11.222.333/0001-82' })), 'CNPJ inválido');
  assertRejects(() => readClientInput(company({ document: '11.111.111/1111-11' })), 'CNPJ inválido');
  assertRejects(() => readClientInput(company({ document: VALID_CPF })), 'CNPJ inválido');
  assertRejects(() => readClientInput(publicEntity({ document: VALID_CPF })), 'CNPJ inválido');
  assertRejects(() => readClientInput({ type: 'pessoa_fisica', name: 'Maria', document: '' }), 'Informe o CPF');
  assertRejects(() => readClientInput({ type: 'pessoa_fisica', name: 'Maria', document: '529.982.247-24' }), 'CPF inválido');
  assertRejects(() => readClientInput({ type: 'pessoa_fisica', name: 'Maria', document: '111.111.111-11' }), 'CPF inválido');
  assertRejects(() => readClientInput({ type: 'pessoa_fisica', name: 'Maria', document: VALID_CNPJ }), 'CPF inválido');
});

test('recusa tipo inválido e nome curto ou longo', () => {
  assertRejects(() => readClientInput(company({ type: 'individual' })), 'Escolha o tipo do cliente: pessoa física, empresa ou órgão público');
  assertRejects(() => readClientInput(company({ name: 'A' })), 'Informe o nome');
  assertRejects(() => readClientInput(company({ name: 'A'.repeat(151) })), 'O nome: até 150 caracteres');
  assertRejects(() => readClientInput(null), 'Dados do cliente inválidos');
});

test('recusa e-mail, telefone, CEP e UF inválidos', () => {
  assertRejects(() => readClientInput(company({ contactEmail: 'joao@' })), 'E-mail inválido');
  assertRejects(() => readClientInput(company({ contactPhone: '3232-1000' })), 'Telefone inválido: informe o DDD e o número');
  assertRejects(() => readClientInput(company({ zipCode: '13015-00' })), 'CEP inválido');
  assertRejects(() => readClientInput(company({ state: 'XX' })), 'UF inválida');
  assertRejects(() => readClientInput(company({ city: 'C'.repeat(81) })), 'Cidade: até 80 caracteres');
});

test('desativar e reativar pedem verdadeiro ou falso', () => {
  assert.equal(readClientActiveInput({ active: false }), false);
  assert.equal(readClientActiveInput({ active: true }), true);
  assertRejects(() => readClientActiveInput({ active: 'false' }), 'Situação inválida');
  assertRejects(() => readClientActiveInput({}), 'Situação inválida');
});

test('filtros da lista: ativos por padrão, tipo e busca opcionais', () => {
  assert.deepEqual(readClientListQuery({}), { search: '', type: null, status: 'active' });
  assert.deepEqual(
    readClientListQuery({ search: '  acme ', type: 'orgao_publico', status: 'inactive' }),
    { search: 'acme', type: 'orgao_publico', status: 'inactive' },
  );
  assertRejects(() => readClientListQuery({ type: 'pessoa' }), 'Tipo de cliente inválido');
  assertRejects(() => readClientListQuery({ status: 'todos' }), 'Situação inválida');
});
