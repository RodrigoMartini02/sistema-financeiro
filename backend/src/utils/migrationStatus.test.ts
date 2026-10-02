import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MigrationRefusal, REGISTRY_MIGRATION, migrationChecksum, migrationStatus, migrationToApply, migrationsToRegister,
  orderMigrations, type AppliedMigration,
} from './migrationStatus';

const FILES = orderMigrations([
  { filename: '0019_c.sql', content: 'SELECT 19;' },
  { filename: '0018b_b.sql', content: 'SELECT 182;' },
  { filename: '0002_a.sql', content: 'SELECT 2;' },
  { filename: '0018_b.sql', content: 'SELECT 18;' },
  { filename: REGISTRY_MIGRATION, content: 'CREATE TABLE schema_migrations ();' },
]);
const applied = (...ids: string[]): AppliedMigration[] =>
  FILES.filter((file) => ids.includes(file.id)).map(({ filename, checksum }) => ({ filename, checksum }));

test('ordena pelo número e depois pela letra, aceitando números pulados', () => {
  assert.deepEqual(FILES.map((file) => file.id), ['0002', '0018', '0018b', '0019', '0057']);
});

test('nome fora do padrão e número repetido são recusados', () => {
  assert.throws(() => orderMigrations([{ filename: 'nova-migration.sql', content: '' }]), MigrationRefusal);
  assert.throws(
    () => orderMigrations([{ filename: '0020_a.sql', content: '' }, { filename: '0020_b.sql', content: '' }]),
    /repetido/,
  );
});

test('a assinatura não muda entre CRLF e LF, mas muda quando o conteúdo muda', () => {
  assert.equal(migrationChecksum('SELECT 1;\r\nSELECT 2;\r\n'), migrationChecksum('SELECT 1;\nSELECT 2;\n'));
  assert.notEqual(migrationChecksum('SELECT 1;'), migrationChecksum('SELECT 2;'));
});

test('status: pendentes, editadas depois de aplicadas e registros sem arquivo', () => {
  const records = [
    ...applied('0002', '0018'),
    { filename: '0018b_b.sql', checksum: 'assinatura-antiga' },
    { filename: '0010_removida.sql', checksum: 'x' },
  ];
  const status = migrationStatus(FILES, records);
  assert.deepEqual(status.pending.map((file) => file.id), ['0019', '0057']);
  assert.deepEqual(status.edited.map((file) => file.id), ['0018b']);
  assert.deepEqual(status.missingFile.map((item) => item.filename), ['0010_removida.sql']);
});

test('aplicar: sem a tabela, só a migration que a cria', () => {
  assert.equal(migrationToApply(FILES, [], '0057', false).filename, REGISTRY_MIGRATION);
  assert.throws(() => migrationToApply(FILES, [], '0019', false), /aplique primeiro/);
});

test('aplicar: recusa número inexistente, já aplicada e pendente anterior', () => {
  const records = applied('0002', '0018', '0057');
  assert.throws(() => migrationToApply(FILES, records, '0099', true), /Não existe migration 0099/);
  assert.throws(() => migrationToApply(FILES, records, '0018', true), /já está aplicada/);
  assert.throws(() => migrationToApply(FILES, records, '0019', true), /pendente antes da 0019_c\.sql: 0018b_b\.sql/);
  assert.equal(migrationToApply(FILES, records, '0018b', true).filename, '0018b_b.sql');
});

test('registro inicial: as que faltam até o identificador informado', () => {
  assert.deepEqual(migrationsToRegister(FILES, applied('0057'), '0019').map((file) => file.id), ['0002', '0018', '0018b', '0019']);
  assert.deepEqual(migrationsToRegister(FILES, applied('0002', '0018'), '0018b').map((file) => file.id), ['0018b']);
  assert.throws(() => migrationsToRegister(FILES, [], '0099'), MigrationRefusal);
});
