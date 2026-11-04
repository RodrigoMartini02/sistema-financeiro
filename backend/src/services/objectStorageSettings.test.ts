import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectStorageConfigError, loadObjectStorageSettings } from './objectStorageSettings';

// Valores de mentira, só para os testes.
const storageEnv = {
  TENDERS_ARCHIVE_ENDPOINT: 'https://conta-teste.r2.cloudflarestorage.com/',
  TENDERS_ARCHIVE_BUCKET: 'anexos-dados',
  TENDERS_ARCHIVE_ACCESS_KEY_ID: 'chave-de-teste',
  TENDERS_ARCHIVE_SECRET_ACCESS_KEY: 'segredo-de-teste',
  TENDERS_STORAGE_PREFIX: 'local',
};
const localDatabaseUrl = 'postgres://app:senha@localhost:5433/banco';
const productionDatabaseUrl = 'postgres://app:senha@dpg-teste.oregon-postgres.render.com/banco';

test('R2: sem nenhuma variável (ou com todas vazias), desligado', () => {
  assert.equal(loadObjectStorageSettings({}, localDatabaseUrl), null);
  const blank = Object.fromEntries(Object.keys(storageEnv).map((key) => [key, ' ']));
  assert.equal(loadObjectStorageSettings(blank, localDatabaseUrl), null);
});

test('R2: as 5 variáveis ligam, com o endpoint sem a barra do fim e a pasta do ambiente', () => {
  assert.deepEqual(loadObjectStorageSettings(storageEnv, localDatabaseUrl), {
    endpoint: 'https://conta-teste.r2.cloudflarestorage.com',
    bucket: 'anexos-dados',
    accessKeyId: 'chave-de-teste',
    secretAccessKey: 'segredo-de-teste',
    prefix: 'local',
  });
});

test('R2: parte das variáveis é recusada, citando só os nomes das que faltam', () => {
  const partial = { ...storageEnv, TENDERS_ARCHIVE_BUCKET: '', TENDERS_ARCHIVE_ACCESS_KEY_ID: undefined };
  assert.throws(
    () => loadObjectStorageSettings(partial, localDatabaseUrl),
    (error: unknown) => {
      assert.ok(error instanceof ObjectStorageConfigError);
      assert.match(error.message, /TENDERS_ARCHIVE_BUCKET, TENDERS_ARCHIVE_ACCESS_KEY_ID/);
      assert.doesNotMatch(error.message, /segredo-de-teste|conta-teste/, 'a mensagem não mostra valores');
      return true;
    },
  );
});

test('R2: as 4 da conta sem a pasta do ambiente são recusadas', () => {
  assert.throws(
    () => loadObjectStorageSettings({ ...storageEnv, TENDERS_STORAGE_PREFIX: undefined }, localDatabaseUrl),
    /faltam TENDERS_STORAGE_PREFIX/,
  );
});

test('R2: endpoint sem https, bucket fora da regra do R2 e pasta fora do formato são recusados', () => {
  const invalid: Array<[string, string]> = [
    ['TENDERS_ARCHIVE_ENDPOINT', 'http://conta-teste.r2.cloudflarestorage.com'],
    ['TENDERS_ARCHIVE_ENDPOINT', 'conta-teste.r2.cloudflarestorage.com'],
    ['TENDERS_ARCHIVE_BUCKET', 'Anexos_Dados'],
    ['TENDERS_ARCHIVE_BUCKET', 'ab'],
    ['TENDERS_STORAGE_PREFIX', 'Producao'],
    ['TENDERS_STORAGE_PREFIX', 'local/teste'],
    ['TENDERS_STORAGE_PREFIX', '-local'],
  ];
  for (const [key, value] of invalid) {
    assert.throws(
      () => loadObjectStorageSettings({ ...storageEnv, [key]: value }, localDatabaseUrl),
      ObjectStorageConfigError,
      `${key}=${value}`,
    );
  }
});

test('R2: a pasta da produção é recusada com o banco local e aceita com o banco da produção', () => {
  const productionStorage = { ...storageEnv, TENDERS_STORAGE_PREFIX: 'producao' };
  for (const localUrl of [localDatabaseUrl, 'postgres://app@127.0.0.1:5432/banco']) {
    assert.throws(() => loadObjectStorageSettings(productionStorage, localUrl), /TENDERS_STORAGE_PREFIX=producao com o banco local/, localUrl);
  }
  assert.equal(loadObjectStorageSettings(productionStorage, productionDatabaseUrl)?.prefix, 'producao');
  assert.equal(loadObjectStorageSettings(storageEnv, productionDatabaseUrl)?.prefix, 'local', 'outra pasta com o banco da produção é aceita');
});
