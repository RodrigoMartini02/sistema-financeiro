import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import { readMemberUpdateInput, readNewMemberInput } from './memberInput';

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.message === message);
}

function newMember(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { nome: '  Maria ', email: ' Maria@Email.com ', senha: '12345678', ...overrides };
}

test('cadastro: apara o nome, normaliza o e-mail e deixa o documento só com dígitos', () => {
  const input = readNewMemberInput(newMember({ sobrenome: ' Souza ', documento: '529.982.247-25', telefone: ' 11 99999-0000 ' }));
  assert.equal(input.name, 'Maria');
  assert.equal(input.lastName, 'Souza');
  assert.equal(input.email, 'maria@email.com');
  assert.equal(input.password, '12345678');
  assert.equal(input.document, '52998224725');
  assert.equal(input.telefone, '11 99999-0000');
  assert.equal(input.dataNascimento, null);
});

test('cadastro: documento, sobrenome e contato são opcionais', () => {
  const input = readNewMemberInput(newMember({ documento: '   ' }));
  assert.equal(input.document, null);
  assert.equal(input.lastName, null);
  assert.equal(input.telefone, null);
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

test('edição: campo ausente mantém; vazio ou null limpa', () => {
  const kept = readMemberUpdateInput({ nome: 'Maria' });
  assert.deepEqual(kept, {
    name: 'Maria', lastName: undefined, telefone: undefined, dataNascimento: undefined,
    country: undefined, state: undefined, city: undefined,
  });

  const cleared = readMemberUpdateInput({ nome: 'Maria', sobrenome: '', telefone: null, foto: null });
  assert.equal(cleared.lastName, null);
  assert.equal(cleared.telefone, null);
  assert.equal(cleared.photo, null);
});

test('edição: e-mail, documento e senha vazios mantêm o gravado', () => {
  const input = readMemberUpdateInput({ nome: 'Maria', email: '', documento: '', nova_senha: '' });
  assert.equal(input.email, undefined);
  assert.equal(input.document, undefined);
  assert.equal(input.newPassword, undefined);
});

test('edição: lê e confere e-mail, documento e nova senha', () => {
  const input = readMemberUpdateInput({ nome: 'Maria', email: ' Nova@Email.com', documento: '529.982.247-25', nova_senha: 'abcdefgh' });
  assert.equal(input.email, 'nova@email.com');
  assert.equal(input.document, '52998224725');
  assert.equal(input.newPassword, 'abcdefgh');

  assertRejects(() => readMemberUpdateInput({ nome: '' }), 'Informe o nome');
  assertRejects(() => readMemberUpdateInput({ nome: 'Maria', email: 'invalido' }), 'Informe um e-mail válido');
  assertRejects(() => readMemberUpdateInput({ nome: 'Maria', nova_senha: '123' }), 'A nova senha precisa ter pelo menos 8 caracteres');
  assertRejects(() => readMemberUpdateInput({ nome: 'Maria', foto: 10 }), 'Foto inválida');
});
