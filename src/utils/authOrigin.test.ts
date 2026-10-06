import assert from 'node:assert/strict';
import test from 'node:test';
import { destinationForAuthOrigin, parseAuthOrigin } from './authOrigin';

test('login do app de finanças e do assistente continuam com o mesmo destino', () => {
  assert.equal(destinationForAuthOrigin(parseAuthOrigin('app')), '/app.html');
  assert.equal(destinationForAuthOrigin(parseAuthOrigin('assistant')), '/assistant.html');
});

test('login começado em Licitações volta para o app do módulo', () => {
  assert.equal(destinationForAuthOrigin(parseAuthOrigin('tenders')), '/licitacoes/app');
});

test('origem ausente ou desconhecida vai para o app de finanças', () => {
  assert.equal(parseAuthOrigin(null), 'app');
  assert.equal(parseAuthOrigin(''), 'app');
  assert.equal(parseAuthOrigin('outro'), 'app');
});
