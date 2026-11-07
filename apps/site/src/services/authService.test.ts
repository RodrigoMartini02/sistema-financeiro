import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createAuthAdapter, resolveAuthApiBase } from './authService';
import { saveProductSession, sessionForSolution } from './session';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
  };
}

function browserForTest(context: TestContext) {
  const properties = {
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage(),
    window: { location: { hostname: 'localhost', port: '5173' } },
  };
  for (const [key, value] of Object.entries(properties)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    context.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
}

test('login público: cada solução usa sua API sem enviar o token da outra', async (context) => {
  browserForTest(context);
  const finance = sessionForSolution('finance');
  const tenders = sessionForSolution('tenders');
  finance.setSession('finance-token', { id: 1, nome: 'Finanças' });
  tenders.setSession('tenders-token', { id: 2, nome: 'Licitações' });

  const requests: Array<{ url: string; options: RequestInit | undefined }> = [];
  context.mock.method(globalThis, 'fetch', async (url: string, options?: RequestInit) => {
    requests.push({ url, options });
    return Response.json({ success: true, data: { token: 'new-token', usuario: { id: 3 } } });
  });
  await createAuthAdapter('finance').login('finance@example.test', 'password');
  await createAuthAdapter('tenders').login('tenders@example.test', 'password');

  assert.deepEqual(requests.map((request) => request.url), ['/api/auth/login', '/api/tenders/auth/login']);
  for (const request of requests) {
    assert.equal(new Headers(request.options?.headers).has('Authorization'), false);
  }
  assert.equal(finance.getToken(), 'finance-token');
  assert.equal(tenders.getToken(), 'tenders-token');
});

test('login público: APIs configuradas por produto preservam prefixos, callback Google e sessões', async (context) => {
  browserForTest(context);
  sessionForSolution('finance').setSession('finance-token', { id: 1 });
  sessionForSolution('tenders').setSession('tenders-token', { id: 2 });
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  context.mock.method(globalThis, 'fetch', async (url: string, options?: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(options?.body)) as Record<string, unknown> });
    assert.equal(new Headers(options?.headers).has('Authorization'), false);
    return Response.json({ success: true, data: { token: 'new-token', usuario: { id: 3 } } });
  });

  await createAuthAdapter('finance', ' https://finance.example.test/api/ ').login('finance@example.test', 'password');
  await createAuthAdapter('tenders', 'https://tenders.example.test/api/').googleLogin('code', 'https://fingerence.com.br/index.html');
  assert.deepEqual(requests, [
    { url: 'https://finance.example.test/api/auth/login', body: { documento: 'finance@example.test', senha: 'password' } },
    { url: 'https://tenders.example.test/api/tenders/auth/google', body: { code: 'code', redirect_uri: 'https://fingerence.com.br/index.html' } },
  ]);
  assert.equal(sessionForSolution('finance').getToken(), 'finance-token');
  assert.equal(sessionForSolution('tenders').getToken(), 'tenders-token');
});

test('bases de autenticação: Vite usa proxy, acesso local direto usa a porta do produto e produção mantém compatibilidade', () => {
  const vite = { hostname: 'localhost', port: '5173' };
  const local = { hostname: '127.0.0.1', port: '' };
  const deployed = { hostname: 'fingerence.com.br', port: '' };
  for (const solution of ['finance', 'tenders'] as const) {
    assert.equal(resolveAuthApiBase(solution, vite), '/api');
    assert.equal(resolveAuthApiBase(solution, deployed), 'https://sistema-financeiro-backend-o199.onrender.com/api');
    assert.equal(resolveAuthApiBase(solution, deployed, '   '), 'https://sistema-financeiro-backend-o199.onrender.com/api');
  }
  assert.equal(resolveAuthApiBase('finance', local), 'http://localhost:3010/api');
  assert.equal(resolveAuthApiBase('tenders', local), 'http://localhost:3011/api');
});

test('cadastro de Licitações usa os dados da empresa, sem modulo; PF é recusada antes da rede', async (context) => {
  browserForTest(context);
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  context.mock.method(globalThis, 'fetch', async (url: string, options?: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(options?.body)) as Record<string, unknown> });
    return Response.json({ success: true, data: { token: 'new-token', usuario: { id: 3 } } });
  });
  const auth = createAuthAdapter('tenders');
  await auth.registerCompany({
    documento: '11222333000181',
    razaoSocial: 'Empresa Ltda',
    nomeFantasia: 'Empresa',
    enquadramento: 'LTDA',
    dataAbertura: '2020-01-01',
    email: 'company@example.test',
    senha: 'password',
  });
  assert.deepEqual(requests, [{
    url: '/api/tenders/auth/register',
    body: {
      documento: '11222333000181',
      razao_social: 'Empresa Ltda',
      nome_fantasia: 'Empresa',
      enquadramento: 'LTDA',
      data_abertura: '2020-01-01',
      email: 'company@example.test',
      senha: 'password',
    },
  }]);
  await assert.rejects(auth.registerPersonal({ nome: 'Pessoa', documento: '123', email: 'person@example.test', senha: 'password' }), /CNPJ/);
  assert.equal(requests.length, 1);
});

test('Google e recuperação de Licitações ficam nas rotas próprias, inclusive o 401 sem apagar sessões', async (context) => {
  browserForTest(context);
  sessionForSolution('finance').setSession('finance-token', { id: 1 });
  sessionForSolution('tenders').setSession('tenders-token', { id: 2 });
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  context.mock.method(globalThis, 'fetch', async (url: string, options?: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(options?.body)) as Record<string, unknown> });
    return Response.json({ success: false, message: 'Código inválido' }, { status: 401 });
  });
  const auth = createAuthAdapter('tenders');
  await assert.rejects(auth.forgotPassword('company@example.test'), /Código inválido/);
  await assert.rejects(auth.verifyRecoveryCode('company@example.test', '123456'), /Código inválido/);
  await assert.rejects(auth.resetPassword('company@example.test', '123456', 'new-password'), /Código inválido/);
  await assert.rejects(auth.googleLogin('google-code', 'https://fingerence.com.br/index.html'), /Código inválido/);
  assert.deepEqual(requests.map((request) => request.url), [
    '/api/tenders/auth/forgot-password',
    '/api/tenders/auth/verify-recovery-code',
    '/api/tenders/auth/reset-password',
    '/api/tenders/auth/google',
  ]);
  assert.deepEqual(requests[2].body, { email: 'company@example.test', codigo: '123456', nova_senha: 'new-password' });
  assert.deepEqual(requests[3].body, { code: 'google-code', redirect_uri: 'https://fingerence.com.br/index.html' });
  assert.equal(sessionForSolution('finance').getToken(), 'finance-token');
  assert.equal(sessionForSolution('tenders').getToken(), 'tenders-token');
});

test('entrar em Licitações preserva Finanças e a origem do assistente; entrar em Finanças volta ao assistente', (context) => {
  browserForTest(context);
  const finance = sessionForSolution('finance');
  finance.setSession('finance-token', { id: 1 });
  finance.setLoginOrigin('assistant');
  assert.equal(saveProductSession('tenders', 'tenders-token', { id: 2 }), '/licitacoes/app');
  assert.equal(finance.getToken(), 'finance-token');
  assert.equal(saveProductSession('finance', 'new-finance-token', { id: 1 }), '/assistant.html');
  assert.equal(sessionForSolution('tenders').getToken(), 'tenders-token');
  assert.equal(saveProductSession('finance', 'new-finance-token', { id: 1 }), '/app.html');
});
