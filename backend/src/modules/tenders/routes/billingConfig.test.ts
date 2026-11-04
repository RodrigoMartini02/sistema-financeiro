import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import { billingRoutes } from './billing';
import type { TendersApiDeps } from './deps';

async function readConfig(): Promise<{ status: number; body: unknown }> {
  const app = express();
  // A rota da chave pública não usa o banco nem o PNCP: os deps ficam vazios.
  app.use('/api/tenders/billing', billingRoutes({} as TendersApiDeps));
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/tenders/billing/config`);
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('chave pública do Mercado Pago de Licitações: vem da variável da plataforma', async () => {
  const previous = process.env['MP_PUBLIC_KEY'];
  process.env['MP_PUBLIC_KEY'] = 'chave-publica-de-teste';
  try {
    assert.deepEqual(await readConfig(), { status: 200, body: { success: true, public_key: 'chave-publica-de-teste' } });
  } finally {
    if (previous === undefined) delete process.env['MP_PUBLIC_KEY'];
    else process.env['MP_PUBLIC_KEY'] = previous;
  }
});

test('chave pública do Mercado Pago de Licitações: sem a variável, vem nula e o cartão fica indisponível', async () => {
  const previous = process.env['MP_PUBLIC_KEY'];
  delete process.env['MP_PUBLIC_KEY'];
  try {
    assert.deepEqual(await readConfig(), { status: 200, body: { success: true, public_key: null } });
  } finally {
    if (previous !== undefined) process.env['MP_PUBLIC_KEY'] = previous;
  }
});
