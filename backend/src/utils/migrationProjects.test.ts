import assert from 'node:assert/strict';
import test from 'node:test';
import { MIGRATION_PROJECTS, TENDERS_REGISTRY_MIGRATION, databaseNameOf, resolveDatabase } from './migrationProjects';
import { MigrationRefusal, orderMigrations, migrationToApply } from './migrationStatus';

const FINANCE_LOCAL = 'postgres://u:p@localhost:5433/sistema_financas_dev';
const TENDERS_LOCAL = 'postgres://u:p@localhost:5433/fingerence_licitacoes_dev';
const FINANCE_PRODUCTION = 'postgres://u:p@dpg-x-a.oregon-postgres.render.com/sistema_financas';
const TENDERS_PRODUCTION = 'postgres://u:p@dpg-x-a.oregon-postgres.render.com/fingerence_licitacoes';

test('nome do banco: o último trecho da URL, sem a query string', () => {
  assert.equal(databaseNameOf(FINANCE_LOCAL), 'sistema_financas_dev');
  assert.equal(databaseNameOf(`${TENDERS_PRODUCTION}?sslmode=require`), 'fingerence_licitacoes');
});

test('Finanças: o banco local e a produção seguem iguais, com o DB_SCHEMA do arquivo', () => {
  assert.deepEqual(resolveDatabase('finance', 'local', { DATABASE_URL: FINANCE_LOCAL, DB_SCHEMA: 'dev' }), { url: FINANCE_LOCAL, schema: 'dev', ssl: false });
  assert.deepEqual(resolveDatabase('finance', 'producao', { DATABASE_URL: FINANCE_PRODUCTION }), { url: FINANCE_PRODUCTION, schema: 'public', ssl: true });
  assert.throws(() => resolveDatabase('finance', 'local', { DATABASE_URL: FINANCE_PRODUCTION }), MigrationRefusal);
  assert.throws(() => resolveDatabase('finance', 'local', { DATABASE_URL: FINANCE_LOCAL, DB_SCHEMA: 'dev; drop' }), /DB_SCHEMA inválido/);
});

test('Licitações: usa a TENDERS_DATABASE_URL, sempre no schema public', () => {
  assert.deepEqual(
    resolveDatabase('tenders', 'local', { DATABASE_URL: FINANCE_LOCAL, TENDERS_DATABASE_URL: TENDERS_LOCAL, DB_SCHEMA: 'dev' }),
    { url: TENDERS_LOCAL, schema: 'public', ssl: false },
  );
  assert.deepEqual(
    resolveDatabase('tenders', 'producao', { DATABASE_URL: FINANCE_PRODUCTION, TENDERS_DATABASE_URL: TENDERS_PRODUCTION }),
    { url: TENDERS_PRODUCTION, schema: 'public', ssl: true },
  );
});

test('Licitações: recusa URL ausente, do banco de Finanças ou fora do padrão do ambiente', () => {
  assert.throws(() => resolveDatabase('tenders', 'local', { DATABASE_URL: FINANCE_LOCAL }), /TENDERS_DATABASE_URL/);
  assert.throws(() => resolveDatabase('tenders', 'local', { TENDERS_DATABASE_URL: FINANCE_LOCAL }), MigrationRefusal);
  assert.throws(() => resolveDatabase('tenders', 'producao', { TENDERS_DATABASE_URL: TENDERS_LOCAL }), MigrationRefusal);
});

test('Licitações: na produção o banco não pode ser o mesmo de Finanças', () => {
  assert.throws(
    () => resolveDatabase('tenders', 'producao', { DATABASE_URL: FINANCE_PRODUCTION, TENDERS_DATABASE_URL: FINANCE_PRODUCTION }),
    /mesmo banco de DATABASE_URL/,
  );
});

test('Licitações: a baseline é a migration que cria o registro, e a pasta é a do módulo', () => {
  assert.equal(MIGRATION_PROJECTS.tenders.migrationsFolder, 'src/modules/tenders/migrations');
  const files = orderMigrations([
    { filename: TENDERS_REGISTRY_MIGRATION, content: 'CREATE TABLE schema_migrations ();' },
    { filename: '0002_depois.sql', content: 'SELECT 2;' },
  ]);
  assert.equal(migrationToApply(files, [], '0001', false, TENDERS_REGISTRY_MIGRATION).filename, TENDERS_REGISTRY_MIGRATION);
  assert.throws(() => migrationToApply(files, [], '0002', false, TENDERS_REGISTRY_MIGRATION), /aplique primeiro a 0001_baseline\.sql/);
});
