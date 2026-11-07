import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadEnvironment } from './environment';

test('ambiente: sem caminho explícito, usa somente as variáveis fornecidas', () => {
  const env = { TENDERS_DATABASE_URL: 'postgres://local/test' };
  loadEnvironment(env);
  assert.deepEqual(env, { TENDERS_DATABASE_URL: 'postgres://local/test' });
});

test('ambiente: carrega somente o arquivo indicado, preservando variáveis existentes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tenders-environment-'));
  try {
    const path = join(directory, 'local.env');
    writeFileSync(path, 'TENDERS_DATABASE_URL=postgres://local/licitacoes\nR2_STORAGE_PREFIX=local\n');
    const env: NodeJS.ProcessEnv = { DOTENV_CONFIG_PATH: path, R2_STORAGE_PREFIX: 'isolado' };
    loadEnvironment(env);
    assert.equal(env['TENDERS_DATABASE_URL'], 'postgres://local/licitacoes');
    assert.equal(env['R2_STORAGE_PREFIX'], 'isolado');
    assert.equal(env['DATABASE_URL'], undefined);
    assert.equal(env['TENDERS_JWT_SECRET'], undefined);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('ambiente: arquivo explícito ausente interrompe sem revelar o caminho ou usar outro arquivo', () => {
  const env = { DOTENV_CONFIG_PATH: join(tmpdir(), 'missing-tenders-config', 'private-value.env') };
  assert.throws(() => loadEnvironment(env), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /DOTENV_CONFIG_PATH/);
    assert.doesNotMatch(error.message, /private-value/);
    return true;
  });
});
