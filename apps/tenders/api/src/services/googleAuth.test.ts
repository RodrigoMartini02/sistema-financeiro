import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import { createGoogleProfileReader } from './googleAuth';

const ENV = { GOOGLE_CLIENT_ID: 'cliente', GOOGLE_CLIENT_SECRET: 'segredo' };

interface Call {
  url: string;
  init?: RequestInit;
}

/** `fetch` simulado: responde na ordem, guardando as chamadas. */
function fakeFetch(...responses: unknown[]): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    return { json: async () => next } as Response;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function assertRejectsWith(promise: Promise<unknown>, message: RegExp): Promise<void> {
  return assert.rejects(promise, (error: unknown) => error instanceof RequestInputError && error.status === 400 && message.test(error.message));
}

test('Google: troca o código pelo perfil, com o e-mail em minúsculas', async () => {
  const { fetchImpl, calls } = fakeFetch({ access_token: 'token-google' }, { email: 'Maria@Empresa.com', id: 'g-1', verified_email: true });
  const profile = await createGoogleProfileReader(ENV, fetchImpl)('codigo-1', 'https://site/login');

  assert.deepEqual(profile, { email: 'maria@empresa.com', googleId: 'g-1' });
  assert.equal(calls[0]?.url, 'https://oauth2.googleapis.com/token');
  const sent = new URLSearchParams(String(calls[0]?.init?.body));
  assert.equal(sent.get('code'), 'codigo-1');
  assert.equal(sent.get('client_id'), 'cliente');
  assert.equal(sent.get('client_secret'), 'segredo');
  assert.equal(sent.get('redirect_uri'), 'https://site/login');
  assert.equal(sent.get('grant_type'), 'authorization_code');
  assert.equal(calls[1]?.url, 'https://www.googleapis.com/oauth2/v2/userinfo');
  assert.deepEqual(calls[1]?.init?.headers, { Authorization: 'Bearer token-google' });
});

test('Google: erro remoto devolve mensagem fixa, sem descrição externa ou pedido do perfil', async () => {
  const { fetchImpl, calls } = fakeFetch({ error: 'invalid_grant', error_description: 'Sensitive code=123456 client_secret=private' });
  await assertRejectsWith(createGoogleProfileReader(ENV, fetchImpl)('codigo', 'https://site/login'), /^Não foi possível autenticar com o Google\. Tente entrar de novo\.$/);
  assert.equal(calls.length, 1);
});

test('Google: resposta sem token também é recusada', async () => {
  const { fetchImpl } = fakeFetch({});
  await assertRejectsWith(createGoogleProfileReader(ENV, fetchImpl)('codigo', 'https://site/login'), /^Não foi possível autenticar com o Google\. Tente entrar de novo\.$/);
});

test('Google: sem e-mail no perfil, ou com e-mail que o Google não confirmou, não entra', async () => {
  const withoutEmail = fakeFetch({ access_token: 't' }, { id: 'g-1' });
  await assertRejectsWith(createGoogleProfileReader(ENV, withoutEmail.fetchImpl)('c', 'https://site/login'), /obter o e-mail/);

  const unverified = fakeFetch({ access_token: 't' }, { email: 'a@b.com', verified_email: false });
  await assertRejectsWith(createGoogleProfileReader(ENV, unverified.fetchImpl)('c', 'https://site/login'), /não confirmou o e-mail/);
});

test('Google: perfil sem a confirmação informada vale (o campo só recusa quando vem falso)', async () => {
  const { fetchImpl } = fakeFetch({ access_token: 't' }, { email: 'a@b.com' });
  assert.deepEqual(await createGoogleProfileReader(ENV, fetchImpl)('c', 'https://site/login'), { email: 'a@b.com', googleId: null });
});
