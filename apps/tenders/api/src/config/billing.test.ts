import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import { readBillingUrls } from './billing';

test('cobrança: webhook usa a API própria e retorno mantém o caminho público', () => {
  assert.deepEqual(readBillingUrls({ BACKEND_URL: 'https://licitacoes-api.example/' }), {
    notificationUrl: 'https://licitacoes-api.example/api/tenders/billing/webhook',
    returnUrl: 'https://fin-gerence.com.br/licitacoes/app/configuracoes',
  });
  assert.equal(readBillingUrls({ BACKEND_URL: 'http://localhost:3011', FRONTEND_URL: 'http://localhost:5173/' }).returnUrl,
    'http://localhost:5173/licitacoes/app/configuracoes');
});

test('cobrança: lê o ambiente atual sem capturar a URL no import', () => {
  const env = { BACKEND_URL: 'https://first.example' };
  assert.match(readBillingUrls(env).notificationUrl, /^https:\/\/first.example\//);
  env.BACKEND_URL = 'https://second.example';
  assert.match(readBillingUrls(env).notificationUrl, /^https:\/\/second.example\//);
});

test('cobrança: sem BACKEND_URL ou com endereço inválido, recusa sem fallback nem vazamento', () => {
  for (const backend of [undefined, '', 'invalid-private-value', 'https://private-user:private-password@example.test', 'https://api.example/api']) {
    assert.throws(() => readBillingUrls({ BACKEND_URL: backend }), (error: unknown) => {
      assert.ok(error instanceof RequestInputError);
      assert.equal(error.status, 503);
      assert.doesNotMatch(error.message, /private|sistema-financeiro-backend/);
      return true;
    });
  }
});
