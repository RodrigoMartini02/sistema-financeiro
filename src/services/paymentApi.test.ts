import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { paymentRequest } from '../components/payments/paymentApi';
// Importar o módulo de registro é o que liga os pagamentos ao cliente de API de Finanças.
import './paymentApi';

const originalFetch = globalThis.fetch;

function stubBrowser(token: string | null) {
  const requests: { url: string; init: RequestInit }[] = [];
  const storage = { getItem: (key: string) => (key === 'token' ? token : null), removeItem: () => undefined } as unknown as Storage;
  Object.defineProperty(globalThis, 'window', { value: { location: { hostname: 'localhost', port: '5173' } }, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(globalThis, 'fetch', {
    value: async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return { status: 200, ok: true, json: async () => ({ success: true, data: { public_key: 'pk-teste' } }) } as Response;
    },
    configurable: true,
  });
  return requests;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'sessionStorage');
  Reflect.deleteProperty(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'fetch', { value: originalFetch, configurable: true });
});

test('pagamentos de Finanças: o pedido sai pelo cliente de API de Finanças, com o token da sessão', async () => {
  const requests = stubBrowser('token-de-teste');

  const config = await paymentRequest<{ public_key: string }>('/planos/config');
  await paymentRequest('/planos/pix', { method: 'POST', body: '{"tipo":"mensal"}' });

  assert.deepEqual(config, { public_key: 'pk-teste' });
  assert.equal(requests.length, 2);
  assert.equal(requests[0]!.url, '/api/planos/config');
  assert.equal(requests[1]!.url, '/api/planos/pix');
  assert.equal(requests[1]!.init.method, 'POST');
  assert.equal(requests[1]!.init.body, '{"tipo":"mensal"}');
  const headers = requests[1]!.init.headers as Headers;
  assert.equal(headers.get('Authorization'), 'Bearer token-de-teste');
  assert.equal(headers.get('Content-Type'), 'application/json');
});
