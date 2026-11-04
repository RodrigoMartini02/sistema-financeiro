import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { body } from 'express-validator';
import { isValidCpf, validate, validateDocument } from './validation';

const VALID_CPF = '529.982.247-25';
const VALID_CNPJ = '11.222.333/0001-81';

test('documento: CPF e CNPJ com dígito verificador valem, com ou sem pontuação', () => {
  assert.equal(validateDocument(VALID_CPF), true);
  assert.equal(validateDocument('52998224725'), true);
  assert.equal(validateDocument(VALID_CNPJ), true);
  assert.equal(validateDocument('11222333000181'), true);
});

test('documento: dígito errado, repetido ou tamanho diferente não valem', () => {
  assert.equal(validateDocument('529.982.247-26'), false);
  assert.equal(validateDocument('111.111.111-11'), false);
  assert.equal(validateDocument('11.222.333/0001-82'), false);
  assert.equal(validateDocument('00.000.000/0000-00'), false);
  assert.equal(validateDocument('1234'), false);
  assert.equal(validateDocument(''), false);
});

test('CPF: só CPF vale, e CNPJ não passa por CPF', () => {
  assert.equal(isValidCpf(VALID_CPF), true);
  assert.equal(isValidCpf(VALID_CNPJ), false);
  assert.equal(isValidCpf('529.982.247-26'), false);
});

function fakeResponse() {
  const sent: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      sent.status = code;
      return res;
    },
    json(payload: unknown) {
      sent.body = payload;
      return res;
    },
  };
  return { res: res as unknown as Response, sent };
}

test('validate: sem erro de validação segue adiante', async () => {
  const req = { body: { nome: 'Maria' } } as unknown as Request;
  await body('nome').notEmpty().run(req);
  const { res, sent } = fakeResponse();
  let called = false;
  validate(req, res, (() => { called = true; }) as NextFunction);
  assert.equal(called, true);
  assert.equal(sent.status, undefined);
});

test('validate: com erro responde 400 com o campo e a mensagem', async () => {
  const req = { body: {} } as unknown as Request;
  await body('nome').notEmpty().withMessage('Informe o nome').run(req);
  const { res, sent } = fakeResponse();
  let called = false;
  validate(req, res, (() => { called = true; }) as NextFunction);
  assert.equal(called, false);
  assert.equal(sent.status, 400);
  assert.deepEqual(sent.body, {
    success: false,
    message: 'Validation error',
    errors: [{ field: 'nome', message: 'Informe o nome' }],
  });
});
