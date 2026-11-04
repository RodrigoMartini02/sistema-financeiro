import assert from 'node:assert/strict';
import test from 'node:test';
import { createTendersPool, tendersDatabaseUrl } from './pool';

test('banco de Licitações: usa TENDERS_DATABASE_URL e, sem ela, o banco de hoje (DATABASE_URL)', () => {
  assert.equal(tendersDatabaseUrl({ TENDERS_DATABASE_URL: 'postgres://licitacoes', DATABASE_URL: 'postgres://financas' }), 'postgres://licitacoes');
  assert.equal(tendersDatabaseUrl({ DATABASE_URL: 'postgres://financas' }), 'postgres://financas');
  assert.throws(() => tendersDatabaseUrl({}), /TENDERS_DATABASE_URL \(or DATABASE_URL\) is not set/);
});

test('pool de Licitações: próprio, menor que o de Finanças, sem SSL no localhost e com SSL fora dele', async () => {
  const local = createTendersPool({ DATABASE_URL: 'postgres://u:p@localhost:5433/sistema_financas_dev' });
  const remote = createTendersPool({ TENDERS_DATABASE_URL: 'postgres://u:p@db.exemplo.render.com/licitacoes' });
  try {
    assert.equal(local.options.max, 10);
    assert.equal(local.options.ssl, false);
    assert.deepEqual(remote.options.ssl, { rejectUnauthorized: false });
  } finally {
    await Promise.all([local.end(), remote.end()]);
  }
});

test('pool de Licitações: recusa DB_SCHEMA que não é nome de schema', () => {
  assert.throws(
    () => createTendersPool({ DATABASE_URL: 'postgres://u:p@localhost:5433/db', DB_SCHEMA: 'public; drop table usuarios' }),
    /DB_SCHEMA is invalid/,
  );
});
