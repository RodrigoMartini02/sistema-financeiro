import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import { readNewMemberInput } from './memberInput';

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.message === message);
}

function newMember(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { nome: '  Maria ', email: ' Maria@Email.com ', senha: '12345678', ...overrides };
}

test('cadastro: apara o nome, normaliza o e-mail e deixa o documento só com dígitos', () => {
  const input = readNewMemberInput(newMember({ sobrenome: ' Souza ', documento: '529.982.247-25', telefone: ' 11 99999-0000 ' }));
  assert.deepEqual(input, {
    name: 'Maria',
    lastName: 'Souza',
    email: 'maria@email.com',
    password: '12345678',
    document: '52998224725',
    telefone: '11 99999-0000',
    dataNascimento: null,
  });
});

test('cadastro: documento, sobrenome, contato e nascimento são opcionais', () => {
  const input = readNewMemberInput(newMember({ documento: '   ', data_nascimento: '1990-05-17' }));
  assert.equal(input.document, null);
  assert.equal(input.lastName, null);
  assert.equal(input.telefone, null);
  assert.equal(input.dataNascimento, '1990-05-17');
});

test('cadastro: setor, cargo e admissão não fazem parte do módulo e são ignorados', () => {
  const input = readNewMemberInput(newMember({ setor_id: 3, cargo_id: 9, data_admissao: '2025-02-01' }));
  assert.equal('sectorId' in input, false);
  assert.equal('jobTitleId' in input, false);
  assert.equal('admissionDate' in input, false);
});

test('cadastro: mensagens em português para nome, e-mail e senha', () => {
  assertRejects(() => readNewMemberInput(newMember({ nome: '   ' })), 'Informe o nome');
  assertRejects(() => readNewMemberInput(newMember({ nome: undefined })), 'Informe o nome');
  assertRejects(() => readNewMemberInput(newMember({ email: 'sem-arroba' })), 'Informe um e-mail válido');
  assertRejects(() => readNewMemberInput(newMember({ email: undefined })), 'Informe um e-mail válido');
  assertRejects(() => readNewMemberInput(newMember({ senha: '1234567' })), 'A senha precisa ter pelo menos 8 caracteres');
  assertRejects(() => readNewMemberInput(newMember({ senha: 12345678 })), 'A senha precisa ter pelo menos 8 caracteres');
  assertRejects(() => readNewMemberInput(null), 'Pedido inválido');
});
