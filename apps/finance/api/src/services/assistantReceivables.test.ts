import assert from 'node:assert/strict';
import test from 'node:test';
import { isOverdueReceivable, matchesReceivableSituation, type LiveIncome } from './assistantReceivables';

const TODAY = '2026-10-15';
const received = (date: string): LiveIncome => ({ received: true, date });
const receivable = (date: string): LiveIncome => ({ received: false, date });

test('em aberto: a receber com data de hoje em diante', () => {
  assert.equal(matchesReceivableSituation(receivable('2026-10-20'), 'aberto', TODAY), true);
  assert.equal(matchesReceivableSituation(receivable(TODAY), 'aberto', TODAY), true);
  assert.equal(matchesReceivableSituation(receivable('2026-10-10'), 'aberto', TODAY), false);
});

test('vencido: a receber com data passada', () => {
  assert.equal(matchesReceivableSituation(receivable('2026-10-10'), 'vencido', TODAY), true);
  assert.equal(matchesReceivableSituation(receivable(TODAY), 'vencido', TODAY), false);
  assert.equal(matchesReceivableSituation(receivable('2026-10-20'), 'vencido', TODAY), false);
});

test('recebida nunca está em aberto nem vencida, em qualquer data', () => {
  for (const date of ['2026-10-10', TODAY, '2026-10-20']) {
    assert.equal(matchesReceivableSituation(received(date), 'aberto', TODAY), false);
    assert.equal(matchesReceivableSituation(received(date), 'vencido', TODAY), false);
  }
});

test('todos: recebidas e a receber', () => {
  assert.equal(matchesReceivableSituation(received('2026-10-10'), 'todos', TODAY), true);
  assert.equal(matchesReceivableSituation(receivable('2026-10-10'), 'todos', TODAY), true);
  assert.equal(matchesReceivableSituation(receivable('2026-10-20'), 'todos', TODAY), true);
});

test('atrasada: só a receber com data passada', () => {
  assert.equal(isOverdueReceivable(receivable('2026-10-10'), TODAY), true);
  assert.equal(isOverdueReceivable(receivable(TODAY), TODAY), false);
  assert.equal(isOverdueReceivable(received('2026-10-10'), TODAY), false);
});
