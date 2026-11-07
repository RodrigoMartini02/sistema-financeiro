import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
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

test('Finance server only forwards the exact legacy webhook POST before parsing its body', { timeout: 30_000 }, async (t) => {
  const received: Array<{ method: string | undefined; url: string | undefined; body: string }> = [];
  const upstream = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    received.push({ method: req.method, url: req.url, body });
    res.writeHead(422, { 'Content-Type': 'application/json' });
    res.end('{"success":false,"message":"mock upstream"}');
  });
  const target = await listen(upstream);
  t.after(() => close(upstream));

  const child = spawn(process.execPath, ['--require', 'tsx/cjs', '--eval', `
    const { Pool } = require('pg');
    const { Server } = require('node:http');
    Pool.prototype.query = () => { throw new Error('Unexpected database query'); };
    Pool.prototype.connect = async () => ({
      query: async (query) => {
        if (query !== 'SELECT NOW()') throw new Error('Unexpected database query');
        return { rows: [{ now: 'mock bootstrap' }] };
      },
      release() {},
    });
    const listen = Server.prototype.listen;
    Server.prototype.listen = function (...args) {
      this.once('listening', () => process.send({ port: this.address().port }));
      return listen.apply(this, args);
    };
    require('./src/server.ts');
  `], {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP, TMP: process.env.TMP,
      NODE_ENV: 'production', PORT: '0',
      DATABASE_URL: 'postgres://unit:unit@127.0.0.1:1/finance_proxy_test',
      TENDERS_API_URL: target,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  });
  let output = '';
  child.stdout?.on('data', (chunk) => { output += chunk; });
  child.stderr?.on('data', (chunk) => { output += chunk; });
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await closed;
  });
  const base = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Finance server did not start: ${output}`)), 20_000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Finance server exited (${code}): ${output}`));
    });
    child.once('message', (message) => {
      clearTimeout(timer);
      const { port } = message as { port: number };
      resolve(`http://127.0.0.1:${port}`);
    });
  });

  const webhook = '/api/tenders/billing/webhook';
  const body = '{ "raw": ';
  const response = await fetch(`${base}${webhook}?data.id=123&case=a%20b`, {
    method: 'POST', body, headers: { 'Content-Type': 'application/json' },
    redirect: 'manual', signal: AbortSignal.timeout(3_000),
  });
  assert.equal(response.status, 422);
  assert.equal(response.headers.get('location'), null);
  assert.equal(await response.text(), '{"success":false,"message":"mock upstream"}');
  assert.deepEqual(received, [{ method: 'POST', url: `${webhook}?data.id=123&case=a%20b`, body }]);

  for (const [method, route] of [
    ['GET', webhook], ['HEAD', webhook], ['PUT', webhook], ['DELETE', webhook],
    ['POST', `${webhook}/`], ['POST', `${webhook}/extra`], ['POST', `${webhook}-other`],
    ['POST', '/api/tenders/billing/WEBHOOK'], ['POST', '/api/tenders/overview'],
    ['POST', '/api/tenders/auth/login'],
  ]) {
    const rejected = await fetch(`${base}${route}`, { method, signal: AbortSignal.timeout(3_000) });
    assert.equal(rejected.status, 404, `${method} ${route}`);
    await rejected.text();
  }
  for (const route of ['/api/plans/webhook', '/api/planos/webhook', '/api/paypal/webhook']) {
    const ownWebhook = await fetch(`${base}${route}`, {
      method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3_000),
    });
    assert.equal(ownWebhook.status, 200, route);
    await ownWebhook.text();
  }
  assert.equal(received.length, 1);
});
