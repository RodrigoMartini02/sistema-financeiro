import assert from 'node:assert/strict';
import test from 'node:test';
import { createTendersPool, tendersDatabaseUrl } from './pool';

const FINANCE_URL = 'postgres://app:segredo@dpg-x.render.com/sistema_financas';
const TENDERS_URL = 'postgres://licitacoes_app:segredo@dpg-x.render.com/fingerence_licitacoes';

test('banco de Licitações: só a TENDERS_DATABASE_URL, sem banco de reserva', () => {
  assert.equal(tendersDatabaseUrl({ TENDERS_DATABASE_URL: TENDERS_URL, DATABASE_URL: FINANCE_URL }), TENDERS_URL);
  assert.equal(tendersDatabaseUrl({ TENDERS_DATABASE_URL: TENDERS_URL }), TENDERS_URL);
  assert.throws(() => tendersDatabaseUrl({ DATABASE_URL: FINANCE_URL }), /TENDERS_DATABASE_URL is not set/);
  assert.throws(() => tendersDatabaseUrl({}), /TENDERS_DATABASE_URL is not set/);
});

test('banco de Licitações: recusa o mesmo banco de Finanças, mesmo com outro usuário ou parâmetros', () => {
  assert.throws(
    () => tendersDatabaseUrl({ TENDERS_DATABASE_URL: FINANCE_URL, DATABASE_URL: FINANCE_URL }),
    /same database as DATABASE_URL/,
  );
  assert.throws(
    () => tendersDatabaseUrl({
      TENDERS_DATABASE_URL: 'postgres://licitacoes_app:outra@dpg-x-internal/sistema_financas',
      DATABASE_URL: FINANCE_URL,
    }),
    /same database as DATABASE_URL/,
  );
  assert.throws(
    () => tendersDatabaseUrl({
      TENDERS_DATABASE_URL: 'postgres://licitacoes_app:outra@dpg-x.render.com/sistema_financas?sslmode=require',
      DATABASE_URL: FINANCE_URL,
    }),
    /same database as DATABASE_URL/,
  );
  // Mesmo servidor, outro banco: vale.
  assert.equal(tendersDatabaseUrl({ TENDERS_DATABASE_URL: TENDERS_URL, DATABASE_URL: FINANCE_URL }), TENDERS_URL);
});

test('banco de Licitações: URL inválida falha sem mostrar credenciais', () => {
  for (const url of ['invalid-password-secret', 'https://user:secret@db.example/licitacoes', 'postgres://user:secret@db.example/']) {
    assert.throws(() => tendersDatabaseUrl({ TENDERS_DATABASE_URL: url }), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /TENDERS_DATABASE_URL must be a PostgreSQL URL/);
      assert.doesNotMatch(error.message, /secret/);
      return true;
    });
  }
});

test('pool de Licitações: próprio, menor que o de Finanças, sem SSL no localhost e com SSL fora dele', async () => {
  const local = createTendersPool({ TENDERS_DATABASE_URL: 'postgres://u:p@localhost:5433/fingerence_licitacoes_dev' });
  const remote = createTendersPool({ TENDERS_DATABASE_URL: 'postgres://u:p@db.exemplo.render.com/licitacoes' });
  try {
    assert.equal(local.options.max, 10);
    assert.equal(local.options.ssl, false);
    assert.deepEqual(remote.options.ssl, { rejectUnauthorized: false });
  } finally {
    await Promise.all([local.end(), remote.end()]);
  }
});
