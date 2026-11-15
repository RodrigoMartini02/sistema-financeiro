import assert from 'node:assert/strict';
import http from 'node:http';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { createLogSummary } from './logic.mjs';
import { createPanelServer } from './server.mjs';

const TOKEN = 'test-token-0123456789';
const INDEX_HTML = '<script nonce="__CSP_NONCE__">const TOKEN = "__PANEL_TOKEN__";</script>';

function closeServer(server) {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(resolve));
}

function send(port, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, method, path, headers: { Host: `localhost:${port}`, ...headers } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null; // resposta HTML ou vazia
        }
        resolve({ status: response.statusCode, headers: response.headers, text, json });
      });
    });
    request.on('error', reject);
    request.end(body);
  });
}

describe('painel local', () => {
  let server;
  let port;
  let clock;
  let state;
  let calls;

  // Servidor novo a cada teste: o bloqueio de "já está iniciando" fica guardado dentro dele.
  beforeEach(async () => {
    clock = 1_000_000;
    state = { running: false, summary: null, schedule: { exists: false } };
    calls = { start: 0, apply: [] };
    server = createPanelServer({
      token: TOKEN,
      indexHtml: INDEX_HTML,
      now: () => clock,
      logReader: {
        readSummary: async () => state.summary,
        readTail: async (count) => ({ file: 'daily-20261115-141526.log', entries: [], count }),
      },
      collector: {
        isRunning: async () => state.running,
        start: async () => {
          calls.start += 1;
        },
        dryRun: async () => ({ ok: true, output: 'Banco: host/db (producao)\nurl postgres://u:segredo@host/db' }),
      },
      scheduler: {
        read: async () => state.schedule,
        apply: async (change) => {
          calls.apply.push(change);
          return { exists: true, enabled: true, time: change.time ?? '19:00' };
        },
      },
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });

  afterEach(() => closeServer(server));

  const api = (method, path, { token = TOKEN, origin = `http://localhost:${port}`, body } = {}) => {
    const headers = { 'X-Panel-Token': token };
    if (method === 'POST') {
      headers.Origin = origin;
      headers['Content-Type'] = 'application/json';
    }
    return send(port, { method, path, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  };

  test('a página sai com o token e uma CSP com nonce, sem cache', async () => {
    const response = await send(port, { path: '/' });
    assert.equal(response.status, 200);
    assert.match(response.text, new RegExp(`const TOKEN = "${TOKEN}"`));
    const nonce = /nonce="([^"]+)"/.exec(response.text)[1];
    assert.match(response.headers['content-security-policy'], new RegExp(`script-src 'nonce-${nonce.replace(/[+/=]/g, '\\$&')}'`));
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-frame-options'], 'DENY');
  });

  test('Host de outro nome é recusado (DNS rebinding)', async () => {
    const page = await send(port, { path: '/', headers: { Host: `evil.example:${port}` } });
    assert.equal(page.status, 403);
    const status = await send(port, { path: '/api/status', headers: { Host: `evil.example:${port}`, 'X-Panel-Token': TOKEN } });
    assert.equal(status.status, 403);
  });

  test('a API exige o token em todas as rotas', async () => {
    for (const [method, path] of [['GET', '/api/status'], ['GET', '/api/log'], ['POST', '/api/run'], ['POST', '/api/dry-run'], ['POST', '/api/schedule']]) {
      const noToken = await send(port, { method, path, headers: { Origin: `http://localhost:${port}` } });
      assert.equal(noToken.status, 403, `${method} ${path} sem token`);
      const wrongToken = await api(method, path, { token: 'outro-token-qualquer-123' });
      assert.equal(wrongToken.status, 403, `${method} ${path} com token errado`);
    }
    assert.equal(calls.start, 0);
  });

  test('POST de outra origem ou sem Origin é recusado e não inicia nada', async () => {
    const foreign = await api('POST', '/api/run', { origin: 'http://evil.example' });
    assert.equal(foreign.status, 403);
    const withoutOrigin = await send(port, { method: 'POST', path: '/api/run', headers: { 'X-Panel-Token': TOKEN } });
    assert.equal(withoutOrigin.status, 403);
    assert.equal(calls.start, 0);
  });

  test('rota inexistente dá 404 e método errado dá 405', async () => {
    assert.equal((await api('GET', '/api/outra')).status, 404);
    assert.equal((await send(port, { path: '/arquivo.txt' })).status, 404);
    assert.equal((await api('GET', '/api/run')).status, 405);
    assert.equal((await api('POST', '/api/status')).status, 405);
  });

  test('status junta processo, última rodada e agendamento', async () => {
    const summary = createLogSummary();
    summary.startedAt = '2026-11-15T17:15:28.676Z';
    summary.currentStep = 'tenders-sweep';
    summary.currentStepStartedAt = '2026-11-15T17:15:28.677Z';
    state = { running: true, summary: { file: 'daily-20261115-141526.log', summary }, schedule: { exists: true, enabled: true, time: '19:00' } };

    const response = await api('GET', '/api/status');
    assert.equal(response.status, 200);
    assert.equal(response.json.running, true);
    assert.equal(response.json.lastRun.result, 'in-progress');
    assert.equal(response.json.lastRun.currentStep, 'tenders-sweep');
    assert.equal(response.json.lastRun.file, 'daily-20261115-141526.log');
    assert.equal(response.json.schedule.time, '19:00');
    assert.deepEqual(response.json.problems, []);
  });

  test('status continua respondendo quando um adaptador falha e avisa o problema', async () => {
    const failing = createPanelServer({
      token: TOKEN,
      indexHtml: INDEX_HTML,
      logReader: { readSummary: async () => null, readTail: async () => ({ file: null, entries: [] }) },
      collector: { isRunning: async () => { throw new Error('powershell indisponível'); }, start: async () => {}, dryRun: async () => ({ ok: true, output: '' }) },
      scheduler: { read: async () => ({ exists: false }), apply: async () => ({}) },
    });
    await new Promise((resolve) => failing.listen(0, '127.0.0.1', resolve));
    const failingPort = failing.address().port;
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const response = await send(failingPort, { path: '/api/status', headers: { 'X-Panel-Token': TOKEN } });
      assert.equal(response.status, 200);
      assert.equal(response.json.running, null);
      assert.equal(response.json.problems.length, 1);
    } finally {
      console.error = originalConsoleError;
      await closeServer(failing);
    }
  });

  test('log aceita o número de linhas dentro dos limites', async () => {
    assert.equal((await api('GET', '/api/log')).json.count, 100);
    assert.equal((await api('GET', '/api/log?lines=30')).json.count, 30);
    assert.equal((await api('GET', '/api/log?lines=99999')).json.count, 500);
    assert.equal((await api('GET', '/api/log?lines=abc')).json.count, 100);
  });

  test('Rodar agora inicia a coleta uma vez e bloqueia o segundo clique enquanto a janela abre', async () => {
    const first = await api('POST', '/api/run', { body: {} });
    assert.equal(first.status, 202);
    assert.equal(calls.start, 1);

    const second = await api('POST', '/api/run', { body: {} });
    assert.equal(second.status, 409);
    assert.equal(calls.start, 1);

    clock += 31_000; // passou a trava de abertura; agora só a detecção do processo bloqueia
    state.running = false;
    assert.equal((await api('POST', '/api/run', { body: {} })).status, 202);
    assert.equal(calls.start, 2);
  });

  test('Rodar agora é recusado com 409 quando já há rodada em andamento', async () => {
    state.running = true;
    const response = await api('POST', '/api/run', { body: {} });
    assert.equal(response.status, 409);
    assert.match(response.json.error, /em andamento/);
    assert.equal(calls.start, 0);
  });

  test('dois cliques simultâneos iniciam a coleta uma única vez', async () => {
    const [a, b] = await Promise.all([api('POST', '/api/run', { body: {} }), api('POST', '/api/run', { body: {} })]);
    assert.deepEqual([a.status, b.status].sort(), [202, 409]);
    assert.equal(calls.start, 1);
  });

  test('Conferir devolve a saída sem segredos', async () => {
    const response = await api('POST', '/api/dry-run', { body: {} });
    assert.equal(response.status, 200);
    assert.equal(response.json.ok, true);
    assert.match(response.json.output, /Banco: host\/db/);
    assert.doesNotMatch(response.json.output, /segredo/);
    assert.equal(calls.start, 0);
  });

  test('horário inválido, corpo vazio e tipo errado em enabled dão 400 sem tocar no Agendador', async () => {
    for (const body of [{ time: '25:00' }, { time: '7:30' }, { time: 1900 }, {}, { enabled: 'sim' }]) {
      const response = await api('POST', '/api/schedule', { body });
      assert.equal(response.status, 400, JSON.stringify(body));
    }
    const notJson = await send(port, { method: 'POST', path: '/api/schedule', headers: { 'X-Panel-Token': TOKEN, Origin: `http://localhost:${port}` }, body: '{quebrado' });
    assert.equal(notJson.status, 400);
    assert.deepEqual(calls.apply, []);
  });

  test('corpo grande demais dá 413', async () => {
    const response = await api('POST', '/api/schedule', { body: { time: '19:00', lixo: 'x'.repeat(5000) } });
    assert.equal(response.status, 413);
    assert.deepEqual(calls.apply, []);
  });

  test('horário válido cria ou altera a tarefa', async () => {
    const response = await api('POST', '/api/schedule', { body: { time: '20:30' } });
    assert.equal(response.status, 200);
    assert.deepEqual(calls.apply, [{ time: '20:30', enabled: undefined }]);
    assert.equal(response.json.schedule.time, '20:30');
  });

  test('ativar ou desativar sem a tarefa existir dá 409; com a tarefa, aplica', async () => {
    const missing = await api('POST', '/api/schedule', { body: { enabled: false } });
    assert.equal(missing.status, 409);
    assert.deepEqual(calls.apply, []);

    state.schedule = { exists: true, enabled: true, time: '19:00' };
    const existing = await api('POST', '/api/schedule', { body: { enabled: false } });
    assert.equal(existing.status, 200);
    assert.deepEqual(calls.apply, [{ time: undefined, enabled: false }]);
  });
});
