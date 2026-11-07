import assert from 'node:assert/strict';
import test from 'node:test';
import { MIGRATION_PROJECTS, PROJECT_NAMES, databaseNameOf, resolveDatabase, resolveTendersCleanupDatabase } from './migrationProjects';
import { MigrationRefusal } from './migrationStatus';

const FINANCE_LOCAL = 'postgres://u:p@localhost:5433/sistema_financas_dev';
const TENDERS_LOCAL = 'postgres://u:p@localhost:5433/fingerence_licitacoes_dev';
const FINANCE_PRODUCTION = 'postgres://u:p@dpg-x-a.oregon-postgres.render.com/sistema_financas';
const TENDERS_PRODUCTION = 'postgres://u:p@dpg-x-a.oregon-postgres.render.com/fingerence_licitacoes';

test('nome do banco: o último trecho da URL, sem a query string', () => {
  assert.equal(databaseNameOf(FINANCE_LOCAL), 'sistema_financas_dev');
  assert.equal(databaseNameOf(`${TENDERS_PRODUCTION}?sslmode=require`), 'fingerence_licitacoes');
});

test('Finanças: runner próprio funciona sem variáveis de Licitações e preserva o DB_SCHEMA', () => {
  assert.deepEqual(PROJECT_NAMES, ['finance']);
  assert.equal(MIGRATION_PROJECTS.finance.migrationsFolder, 'drizzle');
  assert.deepEqual(resolveDatabase('finance', 'local', { DATABASE_URL: FINANCE_LOCAL, DB_SCHEMA: 'dev' }), { url: FINANCE_LOCAL, schema: 'dev', ssl: false });
  assert.deepEqual(resolveDatabase('finance', 'producao', { DATABASE_URL: FINANCE_PRODUCTION }), { url: FINANCE_PRODUCTION, schema: 'public', ssl: true });
  assert.throws(() => resolveDatabase('finance', 'local', { DATABASE_URL: FINANCE_PRODUCTION }), MigrationRefusal);
  assert.throws(() => resolveDatabase('finance', 'local', { DATABASE_URL: FINANCE_LOCAL, DB_SCHEMA: 'dev; drop' }), /DB_SCHEMA inválido/);
});

test('a conferência histórica 0096 ainda usa o banco próprio correto de Licitações', () => {
  assert.deepEqual(
    resolveTendersCleanupDatabase('local', { DATABASE_URL: FINANCE_LOCAL, TENDERS_DATABASE_URL: TENDERS_LOCAL, DB_SCHEMA: 'dev' }),
    { url: TENDERS_LOCAL, schema: 'public', ssl: false },
  );
  assert.deepEqual(
    resolveTendersCleanupDatabase('producao', { DATABASE_URL: FINANCE_PRODUCTION, TENDERS_DATABASE_URL: TENDERS_PRODUCTION }),
    { url: TENDERS_PRODUCTION, schema: 'public', ssl: true },
  );
});

test('a conferência histórica 0096 recusa URL ausente ou fora do ambiente', () => {
  assert.throws(() => resolveTendersCleanupDatabase('local', { DATABASE_URL: FINANCE_LOCAL }), /TENDERS_DATABASE_URL/);
  assert.throws(() => resolveTendersCleanupDatabase('local', { TENDERS_DATABASE_URL: FINANCE_LOCAL }), MigrationRefusal);
  assert.throws(() => resolveTendersCleanupDatabase('producao', { TENDERS_DATABASE_URL: TENDERS_LOCAL }), MigrationRefusal);
});

test('a conferência histórica 0096 recusa o mesmo banco de Finanças', () => {
  assert.throws(
    () => resolveTendersCleanupDatabase('producao', { DATABASE_URL: FINANCE_PRODUCTION, TENDERS_DATABASE_URL: FINANCE_PRODUCTION }),
    /mesmo banco de DATABASE_URL/,
  );
});
