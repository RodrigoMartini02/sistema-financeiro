import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import { users } from '../db/schema/users';
import { TENDERS_CLEANUP_MIGRATION } from '../utils/tendersCleanup';
import { assertLocalDatabase, databaseTestsSkipReason } from './financeDbTestSupport';

const migration = readFileSync(path.resolve(__dirname, '../../drizzle', TENDERS_CLEANUP_MIGRATION), 'utf8');

async function inTransaction(run: (client: Client) => Promise<void>, verified = true): Promise<void> {
  assertLocalDatabase();
  const client = new Client({ connectionString: process.env['DATABASE_URL'] });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query('CREATE SCHEMA IF NOT EXISTS licitacoes');
    await client.query('CREATE TABLE IF NOT EXISTS licitacoes.edital (id bigserial PRIMARY KEY)');
    if (verified) {
      const identity = await client.query<{ database: string }>('SELECT current_database() AS database');
      const proof = { database: identity.rows[0]!.database, tendersDatabase: 'fingerence_licitacoes_dev', backupSha256: 'a'.repeat(64) };
      await client.query("SELECT set_config('fingerence.tenders_cleanup', $1, true)", [JSON.stringify(proof)]);
    }
    await run(client);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}

describe('legacy tenders cleanup guards (local database, always rolled back)', { skip: databaseTestsSkipReason }, () => {
  test('refuses direct application without the runner verification', async () => {
    await inTransaction(async client => {
      await assert.rejects(client.query(migration), /backup e banco próprio/);
    }, false);
  });

  test('refuses cleanup while an old collector holds its lock', async () => {
    assertLocalDatabase();
    const collector = new Client({ connectionString: process.env['DATABASE_URL'] });
    await collector.connect();
    try {
      await collector.query('SELECT pg_advisory_lock(7274003)');
      await inTransaction(async client => {
        await assert.rejects(client.query(migration), /coletor usando o banco antigo/);
      });
    } finally {
      await collector.end();
    }
  });

  test('refuses cleanup if a finance user still has the removed plan state', async () => {
    await inTransaction(async client => {
      await client.query('ALTER TABLE public.usuarios DROP CONSTRAINT usuarios_plano_status_check');
      await drizzle(client).insert(users).values({
        name: 'Cleanup test', email: `cleanup-${randomUUID()}@example.test`, password: 'unused-test-hash',
        planStatus: sql`'sem_teste'`,
      });
      await assert.rejects(client.query(migration), /teste não iniciado/);
    });
  });

  test('refuses cleanup when an external table references the old schema', async () => {
    await inTransaction(async client => {
      await client.query('CREATE TABLE public.cleanup_tenders_guard_dependency (id bigint REFERENCES licitacoes.edital(id))');
      await assert.rejects(client.query(migration), /outra área ainda referencia/);
    });
  });

  test('removes only the old schema and preserves the finance plan constraint', async () => {
    await inTransaction(async client => {
      await client.query(migration);
      const result = await client.query<{ removed: boolean; finance_preserved: boolean }>(
        "SELECT to_regnamespace('licitacoes') IS NULL AS removed, to_regclass('public.usuarios') IS NOT NULL AS finance_preserved",
      );
      assert.deepEqual(result.rows[0], { removed: true, finance_preserved: true });
      await assert.rejects(async () => drizzle(client).insert(users).values({
        name: 'Cleanup test', email: `cleanup-${randomUUID()}@example.test`, password: 'unused-test-hash',
        planStatus: sql`'sem_teste'`,
      }), (error: unknown) => error instanceof Error && error.cause instanceof Error
        && 'constraint' in error.cause && error.cause.constraint === 'usuarios_plano_status_check');
    });
  });
});
