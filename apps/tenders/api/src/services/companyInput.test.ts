import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import { readCompanyUpdateInput } from './companyInput';

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.status === 400 && error.message === message);
}

test('edição: apara, normaliza e só devolve o que veio', () => {
  assert.deepEqual(
    readCompanyUpdateInput({
      legalName: '  Empresa Exemplo Ltda ',
      tradeName: ' Exemplo ',
      openingDate: '2004-09-01',
      size: 'EPP',
      legalType: 'SLU',
      zipCode: '04538-133',
      street: ' Avenida Brigadeiro Faria Lima ',
      number: ' 3477 ',
      complement: ' Andar 17 ',
      district: ' Itaim Bibi ',
      city: ' São Paulo ',
      state: ' sp ',
      phone: ' (11) 2395-8400 ',
      email: ' Contato@Exemplo.com.br ',
    }),
    {
      legalName: 'Empresa Exemplo Ltda',
      tradeName: 'Exemplo',
      openingDate: '2004-09-01',
      size: 'EPP',
      legalType: 'SLU',
      zipCode: '04538133',
      street: 'Avenida Brigadeiro Faria Lima',
      number: '3477',
      complement: 'Andar 17',
      district: 'Itaim Bibi',
      city: 'São Paulo',
      state: 'SP',
      phone: '(11) 2395-8400',
      email: 'contato@exemplo.com.br',
    },
  );
  assert.deepEqual(readCompanyUpdateInput({ city: 'Campinas' }), { city: 'Campinas' });
});

test('edição: vazio ou null limpa o que pode ficar vazio', () => {
  assert.deepEqual(
    readCompanyUpdateInput({
      tradeName: '', openingDate: '', size: '', legalType: null, zipCode: '', street: '  ', number: null,
      complement: '', district: '', city: '', state: '', phone: '', email: '',
    }),
    {
      tradeName: null, openingDate: null, size: null, legalType: null, zipCode: null, street: null, number: null,
      complement: null, district: null, city: null, state: null, phone: null, email: null,
    },
  );
});

test('edição: razão social obrigatória, no tamanho da coluna', () => {
  assertRejects(() => readCompanyUpdateInput({ legalName: '' }), 'Informe a razão social');
  assertRejects(() => readCompanyUpdateInput({ legalName: '   ' }), 'Informe a razão social');
  assertRejects(() => readCompanyUpdateInput({ legalName: null }), 'Informe a razão social');
  assertRejects(() => readCompanyUpdateInput({ legalName: 'x'.repeat(151) }), 'Razão social: até 150 caracteres');
  assert.equal(readCompanyUpdateInput({ legalName: 'x'.repeat(150) }).legalName?.length, 150);
});

test('edição: porte, tipo jurídico, CEP, UF, e-mail e data são conferidos', () => {
  assertRejects(() => readCompanyUpdateInput({ size: 'GRANDE' }), 'Porte inválido');
  assertRejects(() => readCompanyUpdateInput({ size: 'me' }), 'Porte inválido');
  assertRejects(() => readCompanyUpdateInput({ size: 1 }), 'Porte inválido');
  assertRejects(() => readCompanyUpdateInput({ legalType: 'MEI' }), 'Tipo jurídico inválido');
  assertRejects(() => readCompanyUpdateInput({ zipCode: '1234567' }), 'CEP inválido');
  assertRejects(() => readCompanyUpdateInput({ zipCode: 'abcdefgh' }), 'CEP inválido');
  assertRejects(() => readCompanyUpdateInput({ state: 'XX' }), 'UF inválida');
  assertRejects(() => readCompanyUpdateInput({ email: 'sem-arroba' }), 'Informe um e-mail válido');
  assertRejects(() => readCompanyUpdateInput({ email: `${'a'.repeat(250)}@b.com` }), 'Informe um e-mail válido');
  assertRejects(() => readCompanyUpdateInput({ openingDate: '2026-02-30' }), 'Data de abertura inválida');
  assertRejects(() => readCompanyUpdateInput({ openingDate: '01/09/2004' }), 'Data de abertura inválida');
});

test('edição: textos acima do tamanho da coluna são recusados com o nome do campo', () => {
  assertRejects(() => readCompanyUpdateInput({ tradeName: 'x'.repeat(151) }), 'Nome fantasia: até 150 caracteres');
  assertRejects(() => readCompanyUpdateInput({ street: 'x'.repeat(201) }), 'Logradouro: até 200 caracteres');
  assertRejects(() => readCompanyUpdateInput({ number: 'x'.repeat(21) }), 'Número: até 20 caracteres');
  assertRejects(() => readCompanyUpdateInput({ complement: 'x'.repeat(201) }), 'Complemento: até 200 caracteres');
  assertRejects(() => readCompanyUpdateInput({ district: 'x'.repeat(101) }), 'Bairro: até 100 caracteres');
  assertRejects(() => readCompanyUpdateInput({ city: 'x'.repeat(101) }), 'Cidade: até 100 caracteres');
  assertRejects(() => readCompanyUpdateInput({ phone: 'x'.repeat(21) }), 'Telefone: até 20 caracteres');
  assertRejects(() => readCompanyUpdateInput({ city: 42 }), 'Cidade inválido');
});

test('edição: o CNPJ e os fatos da Receita não se editam; sem nada a alterar, ou corpo que não é objeto, é recusado', () => {
  const ignored = {
    document: '11222333000181', registrationStatus: 'BAIXADA', mainCnae: { code: '1', description: 'x' }, secondaryCnaes: [],
    legalNature: { code: '2062' }, lookedUpAt: '2026-01-01T00:00:00-03:00', accountId: 99,
  };
  assertRejects(() => readCompanyUpdateInput(ignored), 'Informe o que alterar');
  assert.deepEqual(readCompanyUpdateInput({ ...ignored, phone: '1' }), { phone: '1' });
  assertRejects(() => readCompanyUpdateInput({}), 'Informe o que alterar');
  assertRejects(() => readCompanyUpdateInput(null), 'Pedido inválido');
  assertRejects(() => readCompanyUpdateInput([]), 'Pedido inválido');
  assertRejects(() => readCompanyUpdateInput('texto'), 'Pedido inválido');
});
