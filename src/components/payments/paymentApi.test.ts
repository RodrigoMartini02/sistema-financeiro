import assert from 'node:assert/strict';
import test from 'node:test';
import { paymentRequest, registerPaymentApi, type PaymentRequest } from './paymentApi';
import { loadPlatformMercadoPago, postPayment } from './paymentRequests';

// O registro é do módulo: o teste sem registro vem primeiro.
test('pagamentos: sem função registrada, o pedido falha com erro claro', async () => {
  await assert.rejects(() => paymentRequest('/planos/config'), /não foi registrada/);
  await assert.rejects(() => postPayment('/planos/pix', { tipo: 'mensal' }), /não foi registrada/);
});

test('pagamentos: o pedido vai pela função registrada, com o mesmo endereço e as mesmas opções', async () => {
  const calls: { endpoint: string; init: RequestInit | undefined }[] = [];
  const fakeRequest: PaymentRequest = async <T>(endpoint: string, init?: RequestInit) => {
    calls.push({ endpoint, init });
    return { ok: true } as T;
  };
  registerPaymentApi(fakeRequest);

  const result = await paymentRequest<{ ok: boolean }>('/tenders/billing/pix', { method: 'POST', body: '{"accountId":3}' });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [{ endpoint: '/tenders/billing/pix', init: { method: 'POST', body: '{"accountId":3}' } }]);
});

test('pagamentos: o POST de pagamento leva o corpo em JSON', async () => {
  const calls: { endpoint: string; init: RequestInit | undefined }[] = [];
  registerPaymentApi(async <T>(endpoint: string, init?: RequestInit) => {
    calls.push({ endpoint, init });
    return undefined as T;
  });

  await postPayment('/planos/pix', { tipo: 'mensal', valor: 29.9 });

  assert.deepEqual(calls, [{ endpoint: '/planos/pix', init: { method: 'POST', body: '{"tipo":"mensal","valor":29.9}' } }]);
});

test('pagamentos: a chave pública da plataforma vem de /planos/config e, sem chave, o cartão fica indisponível', async () => {
  const endpoints: string[] = [];
  registerPaymentApi(async <T>(endpoint: string) => {
    endpoints.push(endpoint);
    return { public_key: null } as T;
  });

  const mercadoPago = await loadPlatformMercadoPago();

  assert.equal(mercadoPago, null);
  assert.deepEqual(endpoints, ['/planos/config']);
});
