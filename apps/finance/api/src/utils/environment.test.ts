import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadEnvironment } from '../config/environment';

test('environment helper requires an explicit file and supports production CLIs', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'finance-env-test-'));
  const previous = { cwd: process.cwd(), file: process.env.DOTENV_CONFIG_PATH, mode: process.env.NODE_ENV, value: process.env.FINANCE_ENV_TEST };
  try {
    writeFileSync(path.join(directory, '.env'), 'FINANCE_ENV_TEST=default-file\n');
    writeFileSync(path.join(directory, 'explicit.env'), 'FINANCE_ENV_TEST=explicit-file\n');
    process.chdir(directory);
    delete process.env.DOTENV_CONFIG_PATH;
    delete process.env.FINANCE_ENV_TEST;
    process.env.NODE_ENV = 'development';
    loadEnvironment();
    assert.equal(process.env.FINANCE_ENV_TEST, undefined);
    process.env.DOTENV_CONFIG_PATH = path.join(directory, 'explicit.env');
    loadEnvironment();
    assert.equal(process.env.FINANCE_ENV_TEST, 'explicit-file');
    delete process.env.FINANCE_ENV_TEST;
    process.env.NODE_ENV = 'production';
    loadEnvironment();
    assert.equal(process.env.FINANCE_ENV_TEST, 'explicit-file');
  } finally {
    process.chdir(previous.cwd);
    for (const [key, value] of Object.entries({ DOTENV_CONFIG_PATH: previous.file, NODE_ENV: previous.mode, FINANCE_ENV_TEST: previous.value })) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
