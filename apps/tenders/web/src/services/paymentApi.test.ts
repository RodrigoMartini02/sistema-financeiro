import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { paymentRequest } from '../../components/payments/paymentApi';
// Importar o módulo de registro é o que liga os pagamentos ao cliente de API de Licitações.
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
      return { status: 200, ok: true, json: async () => ({ success: true, data: { payment_id: 7 } }) } as Response;
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

test('pagamentos de Licitações: o pedido sai pelo cliente de API de Licitações, com o token da sessão', async () => {
  const requests = stubBrowser('token-de-teste');

  const payment = await paymentRequest<{ payment_id: number }>('/tenders/billing/pix', {
    method: 'POST',
    body: '{"accountId":3}',
  });

  assert.deepEqual(payment, { payment_id: 7 });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]!.url, '/api/tenders/billing/pix');
  assert.equal(requests[0]!.init.method, 'POST');
  assert.equal(requests[0]!.init.body, '{"accountId":3}');
  const headers = requests[0]!.init.headers as Headers;
  assert.equal(headers.get('Authorization'), 'Bearer token-de-teste');
  assert.equal(headers.get('Content-Type'), 'application/json');
});
