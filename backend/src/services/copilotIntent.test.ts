import assert from 'node:assert/strict';
import test from 'node:test';
import { inferDeterministicCopilotIntent } from './copilotIntent';

test('treats an expense statement question as a query, not a draft', () => {
  assert.equal(inferDeterministicCopilotIntent('Voce tem o extrato do que gastei?', 0), 'transactions');
});

test('prepares a draft only for an explicit financial registration', () => {
  assert.equal(inferDeterministicCopilotIntent('Paguei R$ 82 no mercado', 0), 'register');
  assert.equal(inferDeterministicCopilotIntent('Fiz compras no mercado hoje gastei R$ 100 no pics', 0), 'register');
});

test('keeps attachments in the registration flow', () => {
  assert.equal(inferDeterministicCopilotIntent('Analise este comprovante', 1), 'register');
});

test('recognizes due-date and budget questions', () => {
  assert.equal(inferDeterministicCopilotIntent('O que vence esta semana?', 0), 'upcoming');
  assert.equal(inferDeterministicCopilotIntent('Como esta meu orcamento?', 0), 'budget');
  assert.equal(inferDeterministicCopilotIntent('Quanto gastei este mes?', 0), 'summary');
});

test('uses an explicit registration command and continues a pending draft', () => {
  assert.equal(inferDeterministicCopilotIntent('Mercado', 0, { intentHint: 'register_expense' }), 'register');
  assert.equal(inferDeterministicCopilotIntent('Quero registrar uma nova despesa de R$ 80', 0), 'register');
  assert.equal(inferDeterministicCopilotIntent('Mercado', 0, { hasPendingDraft: true }), 'register');
  assert.equal(inferDeterministicCopilotIntent('Quanto gastei este mes?', 0, { hasPendingDraft: true }), 'summary');
  assert.equal(inferDeterministicCopilotIntent('Gastei R$ 100 no mercado', 0, { intentHint: 'ask' }), 'help');
});
