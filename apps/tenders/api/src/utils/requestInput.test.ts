import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import type { Response } from 'express';
import {
  RequestInputError,
  isValidIsoDate,
  readIsoDate,
  readOptionalIsoDate,
  readOptionalText,
  readRecord,
  sendRequestError,
} from './requestInput';

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

const isInputError = (message: string) => (error: unknown) => error instanceof RequestInputError && error.message === message;

test('data ISO: só dia que existe no calendário vale', () => {
  assert.equal(isValidIsoDate('2024-02-29'), true);
  assert.equal(isValidIsoDate('2026-02-29'), false);
  assert.equal(isValidIsoDate('2026-02-30'), false);
  assert.equal(isValidIsoDate('2026-13-01'), false);
  assert.equal(isValidIsoDate('10/05/2020'), false);
  assert.equal(isValidIsoDate('2026-5-1'), false);
  assert.equal(isValidIsoDate(''), false);
});

test('readIsoDate e readOptionalIsoDate: texto válido passa; ausente só vale no opcional', () => {
  assert.equal(readIsoDate('2020-05-10', 'Data inválida'), '2020-05-10');
  assert.throws(() => readIsoDate('2020-05-32', 'Data inválida'), isInputError('Data inválida'));
  assert.throws(() => readIsoDate(20200510, 'Data inválida'), isInputError('Data inválida'));
  assert.throws(() => readIsoDate(undefined, 'Data inválida'), isInputError('Data inválida'));

  assert.equal(readOptionalIsoDate(undefined, 'Data inválida'), null);
  assert.equal(readOptionalIsoDate(null, 'Data inválida'), null);
  assert.equal(readOptionalIsoDate('2020-05-10', 'Data inválida'), '2020-05-10');
  assert.throws(() => readOptionalIsoDate('', 'Data inválida'), isInputError('Data inválida'));
  assert.throws(() => readOptionalIsoDate('ontem', 'Data inválida'), isInputError('Data inválida'));
});

test('readOptionalText: apara, vazio vira null e respeita o tamanho', () => {
  assert.equal(readOptionalText('  ABC  ', 'Nome fantasia', 10), 'ABC');
  assert.equal(readOptionalText('   ', 'Nome fantasia', 10), null);
  assert.equal(readOptionalText(undefined, 'Nome fantasia', 10), null);
  assert.equal(readOptionalText(null, 'Nome fantasia', 10), null);
  assert.equal(readOptionalText('x'.repeat(10), 'Nome fantasia', 10), 'x'.repeat(10));
  assert.throws(() => readOptionalText('x'.repeat(11), 'Nome fantasia', 10), isInputError('Nome fantasia: até 10 caracteres'));
  assert.throws(() => readOptionalText(42, 'Nome fantasia', 10), isInputError('Nome fantasia inválido'));
});
