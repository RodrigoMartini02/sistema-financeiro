import assert from 'node:assert/strict';
import test from 'node:test';
import { MIGRATION_PROJECTS, PROJECT_NAMES, databaseNameOf, resolveDatabase } from './migrationProjects';
import { MigrationRefusal, migrationToApply, orderMigrations } from './migrationStatus';

const LOCAL = 'postgres://u:p@localhost:5433/fingerence_licitacoes_dev';
const PRODUCTION = 'postgres://u:p@dpg-x-a.oregon-postgres.render.com/fingerence_licitacoes';

test('runner de Licitações usa a pasta e o banco próprios, sem exigir configuração de Finanças', () => {
  assert.deepEqual(PROJECT_NAMES, ['tenders']);
  assert.equal(MIGRATION_PROJECTS.tenders.migrationsFolder, 'migrations');
  assert.equal(databaseNameOf(`${PRODUCTION}?sslmode=require`), 'fingerence_licitacoes');
  assert.deepEqual(resolveDatabase('tenders', 'local', { TENDERS_DATABASE_URL: LOCAL, DB_SCHEMA: 'dev' }), { url: LOCAL, schema: 'public', ssl: false });
  assert.deepEqual(resolveDatabase('tenders', 'producao', { TENDERS_DATABASE_URL: PRODUCTION }), { url: PRODUCTION, schema: 'public', ssl: true });
});

test('runner de Licitações recusa banco ausente, de outro ambiente ou igual ao de Finanças', () => {
  assert.throws(() => resolveDatabase('tenders', 'local', {}), /TENDERS_DATABASE_URL/);
  assert.throws(() => resolveDatabase('tenders', 'local', { TENDERS_DATABASE_URL: PRODUCTION }), MigrationRefusal);
  assert.throws(() => resolveDatabase('tenders', 'producao', { TENDERS_DATABASE_URL: LOCAL }), MigrationRefusal);
  assert.throws(() => resolveDatabase('tenders', 'producao', { TENDERS_DATABASE_URL: PRODUCTION, DATABASE_URL: PRODUCTION }), /mesmo banco de DATABASE_URL/);
});

test('a baseline continua criando o registro antes de qualquer migration seguinte', () => {
  const registry = MIGRATION_PROJECTS.tenders.registryMigration;
  const files = orderMigrations([
    { filename: registry, content: 'CREATE TABLE schema_migrations ();' },
    { filename: '0002_next.sql', content: 'SELECT 2;' },
  ]);
  assert.equal(migrationToApply(files, [], '0001', false).filename, registry);
  assert.throws(() => migrationToApply(files, [], '0002', false), /aplique primeiro a 0001_baseline\.sql/);
});
