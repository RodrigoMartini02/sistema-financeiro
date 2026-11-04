import assert from 'node:assert/strict';
import test from 'node:test';
import { paymentPublicKeyEndpoint, paymentRequest, registerPaymentApi, type PaymentRequest } from './paymentApi';
import { loadPlatformMercadoPago, postPayment } from './paymentRequests';

// O registro é do módulo: o teste sem registro vem primeiro.
test('pagamentos: sem função registrada, o pedido e a rota da chave pública falham com erro claro', async () => {
  await assert.rejects(() => paymentRequest('/planos/config'), /não foi registrada/);
  await assert.rejects(() => postPayment('/planos/pix', { tipo: 'mensal' }), /não foi registrada/);
  assert.throws(() => paymentPublicKeyEndpoint(), /não foi registrada/);
});

test('pagamentos: o pedido vai pela função registrada, com o mesmo endereço e as mesmas opções', async () => {
  const calls: { endpoint: string; init: RequestInit | undefined }[] = [];
  const fakeRequest: PaymentRequest = async <T>(endpoint: string, init?: RequestInit) => {
    calls.push({ endpoint, init });
    return { ok: true } as T;
  };
  registerPaymentApi({ request: fakeRequest, publicKeyEndpoint: '/tenders/billing/config' });

  const result = await paymentRequest<{ ok: boolean }>('/tenders/billing/pix', { method: 'POST', body: '{"accountId":3}' });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [{ endpoint: '/tenders/billing/pix', init: { method: 'POST', body: '{"accountId":3}' } }]);
  assert.equal(paymentPublicKeyEndpoint(), '/tenders/billing/config');
});

test('pagamentos: o POST de pagamento leva o corpo em JSON', async () => {
  const calls: { endpoint: string; init: RequestInit | undefined }[] = [];
  registerPaymentApi({
    request: async <T>(endpoint: string, init?: RequestInit) => {
      calls.push({ endpoint, init });
      return undefined as T;
    },
    publicKeyEndpoint: '/planos/config',
  });

  await postPayment('/planos/pix', { tipo: 'mensal', valor: 29.9 });

  assert.deepEqual(calls, [{ endpoint: '/planos/pix', init: { method: 'POST', body: '{"tipo":"mensal","valor":29.9}' } }]);
});

test('pagamentos: a chave pública vem da rota que o produto registrou e, sem chave, o cartão fica indisponível', async () => {
  const endpoints: string[] = [];
  registerPaymentApi({
    request: async <T>(endpoint: string) => {
      endpoints.push(endpoint);
      return { public_key: null } as T;
    },
    publicKeyEndpoint: '/tenders/billing/config',
  });

  const mercadoPago = await loadPlatformMercadoPago();

  assert.equal(mercadoPago, null);
  assert.deepEqual(endpoints, ['/tenders/billing/config']);
});
