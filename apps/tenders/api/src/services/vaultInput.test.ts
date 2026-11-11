import assert from 'node:assert/strict';
import test from 'node:test';
import { findDocumentType } from '../domains';
import { RequestInputError } from '../utils/requestInput';
import {
  MAX_DOCUMENT_DESCRIPTION_LENGTH,
  MAX_PERSON_NAME_LENGTH,
  assertDocumentFields,
  readDocumentChanges,
  readNewDocumentInput,
  readPersonChanges,
  readPersonInput,
} from './vaultInput';

// Pedidos do cofre (item 5): pessoas (nome, CPF válido, papéis da lista) e documentos (o tipo do catálogo, a pessoa só nos
// tipos de pessoa, validade obrigatória nos tipos que vencem, descrição nos genéricos, emissão antes da validade).

function assertRejects(read: () => unknown, message: string | RegExp): void {
  assert.throws(
    read,
    (error: unknown) =>
      error instanceof RequestInputError && error.status === 400 && (typeof message === 'string' ? error.message === message : message.test(error.message)),
  );
}

const VALID_CPF = '529.982.247-25';
const PERSON = { name: '  Ana   Souza ', cpf: VALID_CPF, roles: ['SOCIO', 'PROCURADOR'] };

test('pessoa: nome sem espaços sobrando, CPF só com os dígitos, papéis e campos opcionais', () => {
  assert.deepEqual(readPersonInput({ ...PERSON, jobTitle: ' Diretora ', email: ' ANA@Exemplo.com ', phone: '(98) 99999-0000' }), {
    name: 'Ana Souza',
    cpf: '52998224725',
    roles: ['SOCIO', 'PROCURADOR'],
    jobTitle: 'Diretora',
    email: 'ana@exemplo.com',
    phone: '(98) 99999-0000',
  });
  assert.deepEqual(readPersonInput({ ...PERSON, jobTitle: '', email: '  ' }), {
    name: 'Ana Souza',
    cpf: '52998224725',
    roles: ['SOCIO', 'PROCURADOR'],
    jobTitle: null,
    email: null,
    phone: null,
  });
  assert.deepEqual(readPersonInput({ ...PERSON, roles: ['SOCIO', 'SOCIO', 'SOCIO'] }).roles, ['SOCIO'], 'papel repetido vira um só');
});

test('pessoa: recusa nome vazio ou longo, CPF inválido, papel fora da lista ou ausente e e-mail inválido', () => {
  assertRejects(() => readPersonInput({ ...PERSON, name: '   ' }), 'Informe o nome da pessoa');
  assertRejects(() => readPersonInput({ ...PERSON, name: undefined }), 'Informe o nome da pessoa');
  assertRejects(() => readPersonInput({ ...PERSON, name: 'a'.repeat(MAX_PERSON_NAME_LENGTH + 1) }), `Nome: até ${MAX_PERSON_NAME_LENGTH} caracteres`);
  assertRejects(() => readPersonInput({ ...PERSON, cpf: '111.111.111-11' }), 'CPF inválido: confira os 11 dígitos');
  assertRejects(() => readPersonInput({ ...PERSON, cpf: '529.982.247-26' }), 'CPF inválido: confira os 11 dígitos');
  assertRejects(() => readPersonInput({ ...PERSON, cpf: '123' }), 'CPF inválido: confira os 11 dígitos');
  assertRejects(() => readPersonInput({ ...PERSON, cpf: undefined }), 'CPF inválido: confira os 11 dígitos');
  assertRejects(() => readPersonInput({ ...PERSON, cpf: 52998224725 }), 'CPF inválido: confira os 11 dígitos');
  assertRejects(() => readPersonInput({ ...PERSON, roles: [] }), 'Escolha ao menos um papel para a pessoa');
  assertRejects(() => readPersonInput({ ...PERSON, roles: undefined }), 'Escolha ao menos um papel para a pessoa');
  assertRejects(() => readPersonInput({ ...PERSON, roles: 'SOCIO' }), 'Escolha ao menos um papel para a pessoa');
  assertRejects(() => readPersonInput({ ...PERSON, roles: ['SOCIO', 'CHEFE'] }), 'Papel inválido');
  assertRejects(() => readPersonInput({ ...PERSON, roles: [1] }), 'Papel inválido');
  assertRejects(() => readPersonInput({ ...PERSON, email: 'sem-arroba' }), 'Informe um e-mail válido');
  assertRejects(() => readPersonInput({ ...PERSON, jobTitle: 'x'.repeat(81) }), 'Cargo: até 80 caracteres');
  assertRejects(() => readPersonInput({ ...PERSON, phone: '9'.repeat(21) }), 'Telefone: até 20 caracteres');
  assertRejects(() => readPersonInput(null), 'Pedido inválido');
  assertRejects(() => readPersonInput([]), 'Pedido inválido');
});

test('pessoa, edição: só o que veio; vazio limpa o que pode ficar vazio; sem nada, erro', () => {
  assert.deepEqual(readPersonChanges({ name: ' Ana Maria ' }), { name: 'Ana Maria' });
  assert.deepEqual(readPersonChanges({ cpf: VALID_CPF, roles: ['REPRESENTANTE_LEGAL'] }), { cpf: '52998224725', roles: ['REPRESENTANTE_LEGAL'] });
  assert.deepEqual(readPersonChanges({ jobTitle: '', email: null, phone: '' }), { jobTitle: null, email: null, phone: null });
  assertRejects(() => readPersonChanges({}), 'Informe o que alterar');
  assertRejects(() => readPersonChanges({ roles: [] }), 'Escolha ao menos um papel para a pessoa');
  assertRejects(() => readPersonChanges({ cpf: '000.000.000-00' }), 'CPF inválido: confira os 11 dígitos');
});

test('documento da empresa: tipo do catálogo, sem pessoa, datas conferidas', () => {
  const input = readNewDocumentInput({ type: 'CERTIDAO_FGTS', issuedOn: '2026-11-01', validUntil: '2026-12-01', description: '  Filial   Centro ' });
  assert.equal(input.type.id, 'CERTIDAO_FGTS');
  assert.equal(input.personId, null);
  assert.equal(input.issuedOn, '2026-11-01');
  assert.equal(input.validUntil, '2026-12-01');
  assert.equal(input.description, 'Filial Centro');

  assertRejects(() => readNewDocumentInput({ type: 'INEXISTENTE', validUntil: '2026-12-01' }), 'Tipo de documento inválido');
  assertRejects(() => readNewDocumentInput({ validUntil: '2026-12-01' }), 'Tipo de documento inválido');
  assertRejects(() => readNewDocumentInput({ type: 'CERTIDAO_FGTS', personId: 5, validUntil: '2026-12-01' }), 'Este tipo de documento é da empresa e não tem pessoa');
  assert.equal(readNewDocumentInput({ type: 'CERTIDAO_FGTS', personId: null, validUntil: '2026-12-01' }).personId, null);
});

test('documento: validade obrigatória nos tipos que vencem, descrição nos genéricos, emissão não depois da validade', () => {
  assertRejects(() => readNewDocumentInput({ type: 'CERTIDAO_FEDERAL' }), 'Informe a validade do documento');
  assertRejects(() => readNewDocumentInput({ type: 'CERTIDAO_FEDERAL', validUntil: '' }), 'Informe a validade do documento');
  assert.equal(readNewDocumentInput({ type: 'CONTRATO_SOCIAL' }).validUntil, null, 'contrato social não vence');
  assertRejects(() => readNewDocumentInput({ type: 'OUTRO_EMPRESA' }), 'Descreva o documento');
  assertRejects(() => readNewDocumentInput({ type: 'OUTRO_EMPRESA', description: '   ' }), 'Descreva o documento');
  assert.equal(readNewDocumentInput({ type: 'OUTRO_EMPRESA', description: 'Alvará' }).description, 'Alvará');
  assertRejects(
    () => readNewDocumentInput({ type: 'CERTIDAO_FGTS', issuedOn: '2026-12-02', validUntil: '2026-12-01' }),
    'A emissão não pode ser depois da validade',
  );
  assert.equal(readNewDocumentInput({ type: 'CERTIDAO_FGTS', issuedOn: '2026-12-01', validUntil: '2026-12-01' }).issuedOn, '2026-12-01');
  assertRejects(
    () => readNewDocumentInput({ type: 'ATESTADO_CAPACIDADE', description: 'x'.repeat(MAX_DOCUMENT_DESCRIPTION_LENGTH + 1) }),
    `Descrição: até ${MAX_DOCUMENT_DESCRIPTION_LENGTH} caracteres`,
  );
});

test('documento: datas inválidas ou fora de 1900 a 2100 são recusadas', () => {
  assertRejects(() => readNewDocumentInput({ type: 'CERTIDAO_FGTS', validUntil: '2026-02-30' }), 'Data de validade inválida');
  assertRejects(() => readNewDocumentInput({ type: 'CERTIDAO_FGTS', validUntil: '01/12/2026' }), 'Data de validade inválida');
  assertRejects(() => readNewDocumentInput({ type: 'CERTIDAO_FGTS', validUntil: 20261201 }), 'Data de validade inválida');
  assertRejects(() => readNewDocumentInput({ type: 'CERTIDAO_FGTS', validUntil: '0026-12-01' }), 'Data de validade inválida');
  assertRejects(() => readNewDocumentInput({ type: 'CERTIDAO_FGTS', validUntil: '2126-12-01' }), 'Data de validade inválida');
  assertRejects(() => readNewDocumentInput({ type: 'CONTRATO_SOCIAL', issuedOn: '1899-12-31' }), 'Data de emissão inválida');
  assert.equal(readNewDocumentInput({ type: 'CONTRATO_SOCIAL', issuedOn: '1998-05-20' }).issuedOn, '1998-05-20');
});

test('documento de pessoa: a pessoa é obrigatória e precisa ser um inteiro positivo', () => {
  assert.equal(readNewDocumentInput({ type: 'DOCUMENTO_IDENTIDADE', personId: 7 }).personId, 7);
  assertRejects(() => readNewDocumentInput({ type: 'DOCUMENTO_IDENTIDADE' }), 'Escolha a pessoa do documento');
  assertRejects(() => readNewDocumentInput({ type: 'DOCUMENTO_IDENTIDADE', personId: null }), 'Escolha a pessoa do documento');
  assertRejects(() => readNewDocumentInput({ type: 'DOCUMENTO_IDENTIDADE', personId: 0 }), 'Escolha a pessoa do documento');
  assertRejects(() => readNewDocumentInput({ type: 'DOCUMENTO_IDENTIDADE', personId: 1.5 }), 'Escolha a pessoa do documento');
  assertRejects(() => readNewDocumentInput({ type: 'DOCUMENTO_IDENTIDADE', personId: '7' }), 'Escolha a pessoa do documento');
  assertRejects(() => readNewDocumentInput({ type: 'OUTRO_PESSOA', personId: 7 }), 'Descreva o documento');
});

test('documento, edição: só o que veio, vazio limpa, e um arquivo novo conta como alteração', () => {
  assert.deepEqual(readDocumentChanges({ validUntil: '2027-01-01' }), { changes: { validUntil: '2027-01-01' }, hasFile: false });
  assert.deepEqual(readDocumentChanges({ description: '', issuedOn: null, validUntil: '' }), {
    changes: { description: null, issuedOn: null, validUntil: null },
    hasFile: false,
  });
  assert.deepEqual(readDocumentChanges({ file: { name: 'a.pdf', data: 'x' } }), { changes: {}, hasFile: true });
  assert.deepEqual(readDocumentChanges({ type: 'CARTAO_CNPJ', personId: 9, validUntil: '2027-01-01' }), {
    changes: { validUntil: '2027-01-01' },
    hasFile: false,
  });
  assertRejects(() => readDocumentChanges({}), 'Informe o que alterar');
  assertRejects(() => readDocumentChanges({ type: 'CARTAO_CNPJ' }), 'Informe o que alterar');
  assertRejects(() => readDocumentChanges({ validUntil: '2027-13-01' }), 'Data de validade inválida');
  assertRejects(() => readDocumentChanges(null), 'Pedido inválido');
});

test('regras do tipo sobre o que ficaria gravado (edição): a validade de uma certidão não pode ser apagada', () => {
  const certificate = findDocumentType('CERTIDAO_FGTS');
  const generic = findDocumentType('OUTRO_EMPRESA');
  assert.ok(certificate && generic);
  assert.doesNotThrow(() => assertDocumentFields(certificate, { description: null, issuedOn: null, validUntil: '2026-12-01' }));
  assertRejects(() => assertDocumentFields(certificate, { description: null, issuedOn: null, validUntil: null }), 'Informe a validade do documento');
  assertRejects(() => assertDocumentFields(generic, { description: null, issuedOn: null, validUntil: null }), 'Descreva o documento');
  assertRejects(
    () => assertDocumentFields(certificate, { description: null, issuedOn: '2027-01-01', validUntil: '2026-12-01' }),
    'A emissão não pode ser depois da validade',
  );
});
