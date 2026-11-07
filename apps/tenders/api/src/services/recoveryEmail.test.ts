import assert from 'node:assert/strict';
import test from 'node:test';
import { createRecoveryEmailSender } from './recoveryEmail';

const ENV = { EMAILJS_SERVICE_ID: 'servico', EMAILJS_TEMPLATE_ID: 'modelo', EMAILJS_USER_ID: 'chave', FRONTEND_URL: 'https://site.exemplo' };
const MESSAGE = { to: 'maria@empresa.com', name: 'Empresa ABC', code: '123456' };

function fakeFetch(ok: boolean): { fetchImpl: typeof fetch; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return { ok, status: ok ? 200 : 403, text: async () => 'falha do EmailJS' } as Response;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

test('e-mail do código: manda os dados do modelo, com o nome do produto e a validade', async () => {
  const { fetchImpl, calls } = fakeFetch(true);
  await createRecoveryEmailSender(ENV, fetchImpl)(MESSAGE);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://api.emailjs.com/api/v1.0/email/send');
  assert.deepEqual(calls[0]?.init?.headers, { 'Content-Type': 'application/json', Origin: 'https://site.exemplo' });
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    service_id: 'servico',
    template_id: 'modelo',
    user_id: 'chave',
    template_params: {
      to_email: 'maria@empresa.com',
      to_name: 'Empresa ABC',
      codigo_recuperacao: '123456',
      validade: '15 minutos',
      sistema_nome: 'FINGERENCE Licitações',
      assunto: '[FINGERENCE Licitações] Código de Recuperação de Senha',
    },
  });
});

test('e-mail do código: sem o endereço do site no ambiente, usa o padrão', async () => {
  const { fetchImpl, calls } = fakeFetch(true);
  const { FRONTEND_URL: _omitted, ...withoutFrontend } = ENV;
  await createRecoveryEmailSender(withoutFrontend, fetchImpl)(MESSAGE);
  assert.deepEqual(calls[0]?.init?.headers, { 'Content-Type': 'application/json', Origin: 'https://fin-gerence.com.br' });
});

test('e-mail do código: sem as variáveis do EmailJS não tenta enviar', async () => {
  const { fetchImpl, calls } = fakeFetch(true);
  await assert.rejects(createRecoveryEmailSender({}, fetchImpl)(MESSAGE), /Email service not configured/);
  await assert.rejects(createRecoveryEmailSender({ ...ENV, EMAILJS_TEMPLATE_ID: undefined }, fetchImpl)(MESSAGE), /Email service not configured/);
  assert.equal(calls.length, 0);
});

test('e-mail do código: erro guarda só provedor e status, sem ler corpo que pode conter dados sensíveis', async () => {
  let bodyRead = false;
  const fetchImpl = (async () => ({
    ok: false,
    status: 403,
    text: async () => { bodyRead = true; return `${MESSAGE.code} ${MESSAGE.to} ${ENV.EMAILJS_USER_ID}`; },
  } as Response)) as typeof fetch;
  await assert.rejects(createRecoveryEmailSender(ENV, fetchImpl)(MESSAGE), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, 'EmailJS request failed (HTTP 403)');
    return true;
  });
  assert.equal(bodyRead, false);
});
