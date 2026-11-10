import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import { readMemberUpdateInput, readNewMemberInput, readProfileUpdateInput } from './memberInput';

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.message === message);
}

function newMember(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: '  Maria ', email: ' Maria@Email.com ', password: '12345678', ...overrides };
}

test('cadastro: apara o nome, normaliza o e-mail e deixa o documento só com dígitos', () => {
  const input = readNewMemberInput(newMember({
    lastName: ' Souza ',
    document: '529.982.247-25',
    phone: ' 11 99999-0000 ',
    sector: 'financeiro',
    jobTitle: 'gerente',
    admissionDate: '2025-02-01',
  }));
  assert.deepEqual(input, {
    name: 'Maria',
    lastName: 'Souza',
    email: 'maria@email.com',
    password: '12345678',
    document: '52998224725',
    phone: '11 99999-0000',
    sector: 'financeiro',
    jobTitle: 'gerente',
    admissionDate: '2025-02-01',
  });
});

test('cadastro: documento, sobrenome, contato e dados de trabalho são opcionais', () => {
  const input = readNewMemberInput(newMember({ document: '   ', sector: '', jobTitle: null, admissionDate: '' }));
  assert.equal(input.document, null);
  assert.equal(input.lastName, null);
  assert.equal(input.phone, null);
  assert.equal(input.sector, null);
  assert.equal(input.jobTitle, null);
  assert.equal(input.admissionDate, null);
  assert.equal(readNewMemberInput(newMember({ document: 'abc' })).document, null, 'sem nenhum dígito, é sem documento');
});

test('cadastro: a data de nascimento e os campos em português não fazem parte do módulo e são ignorados', () => {
  const input = readNewMemberInput(newMember({ birthDate: '1990-05-17', data_nascimento: '1990-05-17', setor_id: 3, nome: 'Outro' }));
  assert.equal('birthDate' in input, false);
  assert.equal('dataNascimento' in input, false);
  assert.equal(input.sector, null);
  assert.equal(input.name, 'Maria');
});

test('cadastro: mensagens em português para nome, e-mail, senha, setor, cargo e admissão', () => {
  assertRejects(() => readNewMemberInput(newMember({ name: '   ' })), 'Informe o nome');
  assertRejects(() => readNewMemberInput(newMember({ name: undefined })), 'Informe o nome');
  assertRejects(() => readNewMemberInput(newMember({ name: 'a'.repeat(256) })), 'Nome: até 255 caracteres');
  assertRejects(() => readNewMemberInput(newMember({ email: 'sem-arroba' })), 'Informe um e-mail válido');
  assertRejects(() => readNewMemberInput(newMember({ email: undefined })), 'Informe um e-mail válido');
  assertRejects(() => readNewMemberInput(newMember({ password: '1234567' })), 'A senha precisa ter pelo menos 8 caracteres');
  assertRejects(() => readNewMemberInput(newMember({ password: 12345678 })), 'A senha precisa ter pelo menos 8 caracteres');
  assertRejects(() => readNewMemberInput(newMember({ sector: 'nao-existe' })), 'Setor inválido');
  assertRejects(() => readNewMemberInput(newMember({ sector: 3 })), 'Setor inválido');
  assertRejects(() => readNewMemberInput(newMember({ jobTitle: 'chefe' })), 'Cargo inválido');
  assertRejects(() => readNewMemberInput(newMember({ admissionDate: '2025-02-30' })), 'Data de admissão inválida');
  assertRejects(() => readNewMemberInput(newMember({ phone: '1'.repeat(21) })), 'Telefone: até 20 caracteres');
  assertRejects(() => readNewMemberInput(newMember({ document: 123 })), 'Documento inválido');
  assertRejects(() => readNewMemberInput(null), 'Pedido inválido');
});

test('edição: campo ausente mantém e vazio limpa o que pode ficar vazio', () => {
  assert.deepEqual(readMemberUpdateInput({ name: ' Ana ' }), { name: 'Ana' });
  assert.deepEqual(
    readMemberUpdateInput({ lastName: '', phone: ' ', document: '', sector: '', jobTitle: null, admissionDate: '' }),
    { lastName: null, phone: null, document: null, sector: null, jobTitle: null, admissionDate: null },
  );
  assert.deepEqual(
    readMemberUpdateInput({ email: ' Ana@Email.com ', document: '529.982.247-25', sector: 'ti', jobTitle: 'analista', admissionDate: '2024-01-15' }),
    { email: 'ana@email.com', document: '52998224725', sector: 'ti', jobTitle: 'analista', admissionDate: '2024-01-15' },
  );
});

test('edição: senha vazia mantém a atual; curta é recusada; sem nada para alterar é recusado', () => {
  assert.deepEqual(readMemberUpdateInput({ name: 'Ana', newPassword: '' }), { name: 'Ana' });
  assert.equal(readMemberUpdateInput({ newPassword: 'senha-forte-1' }).newPassword, 'senha-forte-1');
  assertRejects(() => readMemberUpdateInput({ newPassword: '1234567' }), 'A nova senha precisa ter pelo menos 8 caracteres');
  assertRejects(() => readMemberUpdateInput({ newPassword: 12345678 }), 'A nova senha precisa ter pelo menos 8 caracteres');
  assertRejects(() => readMemberUpdateInput({}), 'Informe o que alterar');
  assertRejects(() => readMemberUpdateInput({ newPassword: '' }), 'Informe o que alterar');
  assertRejects(() => readMemberUpdateInput({ unknown: 1 }), 'Informe o que alterar');
});

test('edição: nome, e-mail, setor, cargo e admissão presentes são conferidos', () => {
  assertRejects(() => readMemberUpdateInput({ name: '  ' }), 'Informe o nome');
  assertRejects(() => readMemberUpdateInput({ email: '' }), 'Informe um e-mail válido');
  assertRejects(() => readMemberUpdateInput({ sector: 'x' }), 'Setor inválido');
  assertRejects(() => readMemberUpdateInput({ jobTitle: 'x' }), 'Cargo inválido');
  assertRejects(() => readMemberUpdateInput({ admissionDate: 'ontem' }), 'Data de admissão inválida');
  assertRejects(() => readMemberUpdateInput([]), 'Pedido inválido');
});

test('perfil do titular: só nome, sobrenome e telefone; o resto é ignorado', () => {
  assert.deepEqual(readProfileUpdateInput({ name: ' Rita ', lastName: ' Lima ', phone: '' }), { name: 'Rita', lastName: 'Lima', phone: null });
  assert.deepEqual(readProfileUpdateInput({ email: 'x@y.com', document: '1', name: 'Rita' }), { name: 'Rita' });
  assertRejects(() => readProfileUpdateInput({ email: 'x@y.com' }), 'Informe o que alterar');
  assertRejects(() => readProfileUpdateInput({ name: '' }), 'Informe o nome');
  assertRejects(() => readProfileUpdateInput(null), 'Pedido inválido');
});
