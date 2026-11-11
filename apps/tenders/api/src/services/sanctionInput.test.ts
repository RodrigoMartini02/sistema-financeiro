import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import { readSanctionCheckInput } from './sanctionInput';

// Pedido da consulta de sanções (item 6), sem banco: sem corpo é a empresa; `personId` é um inteiro positivo; o documento
// nunca vem do pedido.

function assertInvalid(body: unknown, message: RegExp): void {
  assert.throws(
    () => readSanctionCheckInput(body),
    (error: unknown) => error instanceof RequestInputError && error.status === 400 && message.test(error.message),
  );
}

test('sem corpo, com corpo vazio ou com personId nulo, a consulta é da empresa', () => {
  assert.deepEqual(readSanctionCheckInput(undefined), { personId: null });
  assert.deepEqual(readSanctionCheckInput(null), { personId: null });
  assert.deepEqual(readSanctionCheckInput({}), { personId: null });
  assert.deepEqual(readSanctionCheckInput({ personId: null }), { personId: null });
  assert.deepEqual(readSanctionCheckInput({ personId: undefined }), { personId: null });
});

test('com personId inteiro positivo, a consulta é da pessoa', () => {
  assert.deepEqual(readSanctionCheckInput({ personId: 7 }), { personId: 7 });
  assert.deepEqual(readSanctionCheckInput({ personId: 2_147_483_648 }), { personId: 2_147_483_648 });
});

test('personId inválido é recusado: zero, negativo, decimal, texto, lista ou objeto', () => {
  for (const personId of [0, -1, 1.5, '7', '', true, [7], { id: 7 }, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60]) {
    assertInvalid({ personId }, /Pessoa inválida/);
  }
});

test('o corpo tem de ser um objeto e não aceita campo desconhecido (o documento não vem do pedido)', () => {
  assertInvalid('texto', /Pedido inválido/);
  assertInvalid(12, /Pedido inválido/);
  assertInvalid([], /Pedido inválido/);
  assertInvalid({ personId: 7, cpf: '52998224725' }, /Pedido inválido/);
  assertInvalid({ cnpj: '11222333000181' }, /Pedido inválido/);
  assertInvalid({ document: '11222333000181' }, /Pedido inválido/);
});
