import assert from 'node:assert/strict';
import test from 'node:test';
import { DURATION_MESSAGE, appointmentFormSchema } from './appointmentForm';

const BASE = { titulo: 'Reunião com o contador', data: '2026-10-12' };

function firstMessage(input: Record<string, unknown>): string | undefined {
  const result = appointmentFormSchema.safeParse(input);
  return result.success ? undefined : result.error.issues[0]?.message;
}

test('sem duração (vazia, nula ou ausente) grava sem duração', () => {
  for (const empty of ['', null, undefined]) {
    const result = appointmentFormSchema.safeParse({ ...BASE, duracao_minutos: empty });
    assert.equal(result.success, true, String(empty));
    assert.equal(result.success ? result.data.duracao_minutos : 'erro', undefined);
  }
});

test('duração preenchida vira número de minutos', () => {
  const fromText = appointmentFormSchema.safeParse({ ...BASE, duracao_minutos: '45' });
  assert.equal(fromText.success ? fromText.data.duracao_minutos : null, 45);
  const fromNumber = appointmentFormSchema.safeParse({ ...BASE, duracao_minutos: 90 });
  assert.equal(fromNumber.success ? fromNumber.data.duracao_minutos : null, 90);
});

test('duração 0, negativa, fracionada ou que não é número é recusada com a mensagem', () => {
  for (const invalid of ['0', '-5', '1.5', 'abc']) {
    assert.equal(firstMessage({ ...BASE, duracao_minutos: invalid }), DURATION_MESSAGE, invalid);
  }
});

test('data vazia (incompleta no campo) é recusada com "Informe a data"', () => {
  assert.equal(firstMessage({ ...BASE, data: '' }), 'Informe a data');
});

test('título vazio continua recusado com "Informe o título"', () => {
  assert.equal(firstMessage({ ...BASE, titulo: '' }), 'Informe o título');
});
