import assert from 'node:assert/strict';
import test from 'node:test';
import { createJobLogger, planLifecycleUrl, runPlanLifecycleJob } from './planLifecycleJob';

interface LoggedEvent {
  message: string;
  context: unknown;
}

function recordingLogger(events: LoggedEvent[]) {
  return {
    info: (message: string, context?: unknown) => void events.push({ message, context }),
    error: (message: string, context?: unknown) => void events.push({ message, context }),
  };
}

test('rotina de planos: sem BACKEND_URL usa o backend de produção', () => {
  const expected = 'https://sistema-financeiro-backend-o199.onrender.com/api/internal-jobs/plan-lifecycle';
  assert.equal(planLifecycleUrl(undefined), expected);
  assert.equal(planLifecycleUrl('  '), expected);
});

test('rotina de planos: BACKEND_URL com ou sem barra no fim', () => {
  assert.equal(planLifecycleUrl('http://localhost:3010'), 'http://localhost:3010/api/internal-jobs/plan-lifecycle');
  assert.equal(planLifecycleUrl('http://localhost:3010/'), 'http://localhost:3010/api/internal-jobs/plan-lifecycle');
});

test('rotina de planos: BACKEND_URL inválida dá erro claro', () => {
  assert.throws(() => planLifecycleUrl('localhost:3010'), /BACKEND_URL inválida/);
  assert.throws(() => planLifecycleUrl('ftp://exemplo.com'), /BACKEND_URL inválida/);
});

test('rotina de planos: sem o segredo, falha antes de chamar a rota', async () => {
  let calls = 0;
  const fakeFetch = (async () => {
    calls += 1;
    return new Response('{}');
  }) as typeof fetch;
  await assert.rejects(runPlanLifecycleJob({ BACKEND_URL: 'http://localhost:3010' }, recordingLogger([]), fakeFetch), /BILLING_CRON_SECRET não definida/);
  await assert.rejects(runPlanLifecycleJob({ BILLING_CRON_SECRET: '   ' }, recordingLogger([]), fakeFetch), /BILLING_CRON_SECRET não definida/);
  assert.equal(calls, 0);
});

test('rotina de planos: chama a rota interna com POST e o segredo no cabeçalho, e registra só os contadores', async () => {
  const requests: Array<{ url: string; method: string | undefined; secret: string | null }> = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: init?.method,
      secret: new Headers(init?.headers).get('x-billing-cron-secret'),
    });
    return new Response(JSON.stringify({ success: true, data: { expired: 1, notified: 2 } }), { status: 200 });
  }) as typeof fetch;
  const events: LoggedEvent[] = [];

  await runPlanLifecycleJob({ BILLING_CRON_SECRET: ' segredo-de-teste ', BACKEND_URL: 'http://localhost:3010/' }, recordingLogger(events), fakeFetch);

  assert.deepEqual(requests, [{ url: 'http://localhost:3010/api/internal-jobs/plan-lifecycle', method: 'POST', secret: 'segredo-de-teste' }]);
  assert.deepEqual(events, [{ message: 'Rotina de planos concluída', context: { result: { expired: 1, notified: 2 } } }]);
});

test('rotina de planos: resposta que não é 2xx vira erro, sem registrar conclusão', async () => {
  const fakeFetch = (async () => new Response('{"success":false}', { status: 500 })) as typeof fetch;
  const events: LoggedEvent[] = [];
  await assert.rejects(runPlanLifecycleJob({ BILLING_CRON_SECRET: 'segredo-de-teste' }, recordingLogger(events), fakeFetch), /respondeu HTTP 500/);
  assert.deepEqual(events, []);
});

test('log do job: uma linha JSON por evento, com nível, hora e mensagem, e o erro vira nome e mensagem', () => {
  const lines: Array<{ line: string; level: string }> = [];
  const logger = createJobLogger((line, level) => void lines.push({ line, level }));

  logger.info('Rotina de planos iniciada');
  logger.error('A rotina de planos falhou', { error: new Error('sem rede') });

  assert.equal(lines.length, 2);
  const [started, failed] = lines.map((entry) => JSON.parse(entry.line) as Record<string, unknown>);
  assert.equal(lines[0]?.level, 'info');
  assert.equal(started?.['level'], 'info');
  assert.equal(started?.['msg'], 'Rotina de planos iniciada');
  assert.match(String(started?.['time']), /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(lines[1]?.level, 'error');
  assert.deepEqual(failed?.['error'], { name: 'Error', message: 'sem rede' });
});
