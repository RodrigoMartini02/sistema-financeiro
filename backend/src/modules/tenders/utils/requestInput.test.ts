import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import type { Response } from 'express';
import { RequestInputError, readRecord, sendRequestError } from './requestInput';

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

test('erro do pedido: volta com a mensagem e o status dele, e o padrão é 400', () => {
  const { res, sent } = fakeResponse();
  sendRequestError(res, new RequestInputError('Conta não encontrada', 404), 'contexto', 7, 'genérica');
  assert.equal(sent.status, 404);
  assert.deepEqual(sent.body, { success: false, message: 'Conta não encontrada' });
  assert.equal(new RequestInputError('x').status, 400);
});

test('erro inesperado: registra e volta com a mensagem genérica, sem vazar o erro', () => {
  const logged = mock.method(console, 'error', () => undefined);
  try {
    const { res, sent } = fakeResponse();
    sendRequestError(res, new Error('segredo do banco'), 'Falha ao ler:', 7, 'Tente de novo');
    assert.equal(sent.status, 500);
    assert.deepEqual(sent.body, { success: false, message: 'Tente de novo' });
    assert.equal(logged.mock.callCount(), 1);
  } finally {
    logged.mock.restore();
  }
});

test('readRecord: só objeto vale, e lista, nulo e texto recusam com a mensagem', () => {
  assert.deepEqual(readRecord({ a: 1 }, 'Pedido inválido'), { a: 1 });
  for (const invalid of [null, undefined, [], 'texto', 3]) {
    assert.throws(() => readRecord(invalid, 'Pedido inválido'), (error: unknown) => error instanceof RequestInputError && error.message === 'Pedido inválido');
  }
});
