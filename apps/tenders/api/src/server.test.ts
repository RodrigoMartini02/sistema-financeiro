import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { startTendersServer } from './server';

test('boot HTTP: produção ignora arquivo de ambiente e exige sua própria conexão', async () => {
  await assert.rejects(startTendersServer({
    NODE_ENV: 'production', DOTENV_CONFIG_PATH: join(tmpdir(), 'missing-tenders-http.env'),
    DATABASE_URL: 'postgres://finance:private@localhost/finance', JWT_SECRET: 'finance-secret',
  }), /TENDERS_DATABASE_URL is not set/);
});

test('boot HTTP: arquivo local explícito ausente interrompe antes de abrir o pool', async () => {
  await assert.rejects(startTendersServer({
    DOTENV_CONFIG_PATH: join(tmpdir(), 'missing-tenders-http.env'),
    TENDERS_DATABASE_URL: 'postgres://app:private@localhost/licitacoes',
  }), /DOTENV_CONFIG_PATH/);
});

test('boot HTTP: segredo de Finanças não substitui o segredo próprio e falha antes de consultar o banco', async () => {
  await assert.rejects(startTendersServer({
    NODE_ENV: 'production', TENDERS_DATABASE_URL: 'postgres://app:private@localhost/licitacoes', JWT_SECRET: 'finance-secret',
  }), /TENDERS_JWT_SECRET is not set/);
});

test('boot HTTP: porta inválida é recusada sem abrir conexão', async () => {
  for (const port of ['0', '-1', '65536', '3011.5', 'invalid']) {
    await assert.rejects(startTendersServer({ NODE_ENV: 'production', PORT: port }), /PORT must be an integer/);
  }
});
