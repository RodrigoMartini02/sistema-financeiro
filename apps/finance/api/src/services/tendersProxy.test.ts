import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import { createTendersProxy } from './tendersProxy';

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('legacy webhook preserves method, query, raw body, auth and signature without redirect', async (t) => {
  const body = '{ "event": "payment.updated", "id": 123 }';
  const upstream = createServer(async (req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/api/tenders/billing/webhook?data.id=123&case=a%20b');
    assert.equal(req.headers.authorization, 'Bearer tenders-token');
    assert.equal(req.headers['x-signature'], 'test-signature');
    assert.equal(req.headers['x-request-id'], 'request-123');
    let received = '';
    for await (const chunk of req) {
      received += chunk;
    }
    assert.equal(received, body);
    res.writeHead(422, { 'Content-Type': 'application/json', 'X-Upstream': 'tenders' });
    res.end('{"success":false,"message":"upstream rejected"}');
  });
  const target = await listen(upstream);
  t.after(() => close(upstream));
  const app = express();
  app.use('/api/tenders', createTendersProxy(target));
  app.use(express.json());
  const proxy = createServer(app);
  const base = await listen(proxy);
  t.after(() => close(proxy));

  const response = await fetch(`${base}/api/tenders/billing/webhook?data.id=123&case=a%20b`, {
    method: 'POST', redirect: 'manual', body,
    headers: {
      'Content-Type': 'application/json', authorization: 'Bearer tenders-token',
      'x-signature': 'test-signature', 'x-request-id': 'request-123',
    },
  });
  assert.equal(response.status, 422);
  assert.equal(response.headers.get('location'), null);
  assert.equal(response.headers.get('x-upstream'), 'tenders');
  assert.equal(await response.text(), '{"success":false,"message":"upstream rejected"}');
});

test('legacy proxy returns 504 for stalled upstream and 503 when not configured', async (t) => {
  const upstream = createServer(() => {});
  const target = await listen(upstream);
  t.after(() => close(upstream));
  const app = express();
  app.use('/api/tenders', createTendersProxy(target, 50));
  const proxy = createServer(app);
  const base = await listen(proxy);
  t.after(() => close(proxy));
  assert.equal((await fetch(`${base}/api/tenders/billing/webhook`, { method: 'POST' })).status, 504);

  const unconfigured = express();
  unconfigured.use('/api/tenders', createTendersProxy(undefined));
  const noTarget = createServer(unconfigured);
  const noTargetBase = await listen(noTarget);
  t.after(() => close(noTarget));
  assert.equal((await fetch(`${noTargetBase}/api/tenders/overview`)).status, 503);
});

test('legacy proxy reports connection failure instead of acknowledging delivery', async (t) => {
  const upstream = createServer();
  const target = await listen(upstream);
  await close(upstream);
  const app = express();
  app.use('/api/tenders', createTendersProxy(target));
  const proxy = createServer(app);
  const base = await listen(proxy);
  t.after(() => close(proxy));
  const response = await fetch(`${base}/api/tenders/billing/webhook`, { method: 'POST' });
  assert.equal(response.status, 502);
});

test('legacy proxy discards upstream content headers when timing out before the body', async (t) => {
  const upstream = createServer((_req, res) => {
    res.writeHead(200, {
      'Content-Encoding': 'gzip', 'Content-Length': '1000',
      'Content-Disposition': 'attachment', 'Cache-Control': 'public, max-age=86400',
    });
    res.flushHeaders();
  });
  const target = await listen(upstream);
  t.after(() => close(upstream));
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use('/api/tenders', createTendersProxy(target, 100));
  const proxy = createServer(app);
  const base = await listen(proxy);
  t.after(() => close(proxy));
  const response = await fetch(`${base}/api/tenders/overview`);
  assert.equal(response.status, 504);
  assert.equal(response.headers.get('content-encoding'), null);
  assert.equal(response.headers.get('content-disposition'), null);
  assert.equal(response.headers.get('cache-control'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await response.json() as { success: boolean }).success, false);
});

test('legacy proxy only accepts a fixed origin', () => {
  for (const destination of ['file:///tmp/service', 'https://user:password@example.com', 'https://example.com/path', 'https://example.com/?target=x']) {
    assert.throws(() => createTendersProxy(destination));
  }
});
