import type { Server } from 'node:http';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createTendersApp } from './app';
import { createCollectorLogger } from './collector/logger';
import { loadEnvironment } from './config/environment';
import { startContractStoreFromEnv, type ContractStoreService } from './contractStore/service';
import { createTendersPool } from './db/pool';
import * as schema from './db/schema';
import { tendersApiDepsFromPool, tendersAuthDepsFromEnv } from './routes';

export async function startTendersServer(env: NodeJS.ProcessEnv = process.env): Promise<{ server: Server; close: () => Promise<void> }> {
  if (env['NODE_ENV'] !== 'production') loadEnvironment(env);
  const port = Number(env['PORT'] ?? 3011);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
  const pool = createTendersPool(env);
  let contractStore: ContractStoreService | undefined;
  try {
    const db = drizzle(pool, { schema });
    const auth = tendersAuthDepsFromEnv(db, env);
    const checkDatabase = async (): Promise<void> => { await db.execute(sql`select 1`); };
    await checkDatabase();
    contractStore = startContractStoreFromEnv(env, createCollectorLogger('info'));
    const api = tendersApiDepsFromPool(pool, contractStore);
    const app = createTendersApp({ api, auth, checkDatabase, env });
    const server = await new Promise<Server>((resolve, reject) => {
      const listener = app.listen(port, () => resolve(listener));
      listener.once('error', reject);
    });
    let closing: Promise<void> | undefined;
    const close = (): Promise<void> => {
      closing ??= (async () => {
        try {
          await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        } finally {
          await Promise.all([contractStore?.close(), pool.end()]);
        }
      })();
      return closing;
    };
    return { server, close };
  } catch (error) {
    await Promise.all([contractStore?.close(), pool.end()]);
    throw error;
  }
}

if (require.main === module) {
  startTendersServer().then(({ close }) => {
    console.log('[Tenders API] Listening');
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, () => {
        close().catch(() => {
          console.error('[Tenders API] Shutdown failed');
          process.exitCode = 1;
        });
      });
    }
  }).catch(() => {
    console.error('[Tenders API] Startup failed; check the database and environment configuration');
    process.exitCode = 1;
  });
}
