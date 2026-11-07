import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { body } from 'express-validator';
import { authRateLimiter, isValidCnpj, isValidCpf, validate, validateDocument } from './validation';

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

test('CNPJ: só CNPJ vale, e CPF não passa por CNPJ', () => {
  assert.equal(isValidCnpj(VALID_CNPJ), true);
  assert.equal(isValidCnpj('11222333000181'), true);
  assert.equal(isValidCnpj('11.222.333/0001-82'), false);
  assert.equal(isValidCnpj('00.000.000/0000-00'), false);
  assert.equal(isValidCnpj(VALID_CPF), false);
});

function fakeResponse() {
  const sent: { status?: number; body?: unknown; headers: Record<string, unknown> } = { headers: {} };
  const res = {
    status(code: number) {
      sent.status = code;
      return res;
    },
    json(payload: unknown) {
      sent.body = payload;
      return res;
    },
    setHeader(name: string, value: unknown) {
      sent.headers[name] = value;
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

const MINUTE_MS = 60_000;

/** Limitador com relógio próprio: 5 tentativas em 15 minutos; passou disso, 30 minutos bloqueado. */
function rateLimited(field: 'documento' | 'email') {
  let clock = 1_000_000;
  const middleware = authRateLimiter(field, { now: () => clock });
  return {
    advance: (minutes: number) => { clock += minutes * MINUTE_MS; },
    /** Uma tentativa: o status que o limitador respondeu (200 quando deixou passar) e a mensagem. */
    attempt(ip: string, requestBody: Record<string, unknown>): { status: number; message?: string } {
      const { res, sent } = fakeResponse();
      let passed = false;
      middleware({ ip, body: requestBody, socket: {} } as unknown as Request, res, (() => { passed = true; }) as NextFunction);
      return passed ? { status: 200 } : { status: sent.status!, message: (sent.body as { message: string }).message };
    },
  };
}

test('limitador de tentativas: a sexta tentativa na janela bloqueia por 30 minutos', () => {
  const limiter = rateLimited('documento');
  for (let attempt = 1; attempt <= 5; attempt++) {
    assert.equal(limiter.attempt('1.1.1.1', { documento: VALID_CNPJ }).status, 200, `tentativa ${attempt}`);
  }
  assert.deepEqual(limiter.attempt('1.1.1.1', { documento: VALID_CNPJ }), { status: 429, message: 'Muitas tentativas. Tente de novo em 30 minutos.' });

  limiter.advance(20);
  assert.deepEqual(limiter.attempt('1.1.1.1', { documento: VALID_CNPJ }), { status: 429, message: 'Muitas tentativas. Tente de novo em 10 minutos.' });

  limiter.advance(11);
  assert.equal(limiter.attempt('1.1.1.1', { documento: VALID_CNPJ }).status, 200, 'o bloqueio acabou');
});

test('limitador de tentativas: a janela de 15 minutos zera a contagem', () => {
  const limiter = rateLimited('documento');
  for (let attempt = 1; attempt <= 5; attempt++) {
    limiter.attempt('1.1.1.1', { documento: VALID_CNPJ });
  }
  limiter.advance(16);
  assert.equal(limiter.attempt('1.1.1.1', { documento: VALID_CNPJ }).status, 200);
});

test('limitador de tentativas: cada IP e cada documento têm a sua conta; pontuação não escapa do limite', () => {
  const limiter = rateLimited('documento');
  for (let attempt = 1; attempt <= 5; attempt++) {
    limiter.attempt('1.1.1.1', { documento: VALID_CNPJ });
  }
  assert.equal(limiter.attempt('1.1.1.1', { documento: '11222333000181' }).status, 429, 'mesmo CNPJ sem pontuação');
  assert.equal(limiter.attempt('2.2.2.2', { documento: VALID_CNPJ }).status, 200, 'outro IP');
  assert.equal(limiter.attempt('1.1.1.1', { documento: '12.345.678/0001-95' }).status, 200, 'outro CNPJ');
});

test('limitador de tentativas: no login por e-mail a conta é por e-mail, não um balde só por IP', () => {
  const limiter = rateLimited('documento');
  for (let attempt = 1; attempt <= 5; attempt++) {
    limiter.attempt('1.1.1.1', { documento: 'Maria@Empresa.com' });
  }
  assert.equal(limiter.attempt('1.1.1.1', { documento: ' maria@empresa.com ' }).status, 429, 'mesmo e-mail, em outra grafia');
  assert.equal(limiter.attempt('1.1.1.1', { documento: 'joao@empresa.com' }).status, 200, 'outro e-mail no mesmo IP');
  assert.equal(limiter.attempt('1.1.1.1', { documento: VALID_CNPJ }).status, 200, 'CNPJ no mesmo IP');
});

test('limitador de tentativas: pedido de código conta por e-mail', () => {
  const limiter = rateLimited('email');
  for (let attempt = 1; attempt <= 5; attempt++) {
    limiter.attempt('1.1.1.1', { email: 'maria@empresa.com' });
  }
  assert.equal(limiter.attempt('1.1.1.1', { email: 'MARIA@empresa.com' }).status, 429);
  assert.equal(limiter.attempt('1.1.1.1', { email: 'joao@empresa.com' }).status, 200);
});
