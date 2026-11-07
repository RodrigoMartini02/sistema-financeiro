import assert from 'node:assert/strict';
import test from 'node:test';
import { readArgs } from '../../scripts/migrations';
import { MigrationRefusal } from './migrationStatus';

test('runner de Licitações não executa nada ao importar e recusa escolher a API de Finanças', () => {
  assert.equal(readArgs(['status', '--banco', 'local']).project, 'tenders');
  assert.equal(readArgs(['status', '--banco', 'producao', '--projeto', 'tenders']).project, 'tenders');
  assert.throws(() => readArgs(['status', '--banco', 'local', '--projeto', 'finance']), /Projeto inválido/);
  assert.throws(() => readArgs(['status', '--banco', 'local', '--projeto']), MigrationRefusal);
  assert.throws(() => readArgs(['status', '--banco', 'local', '--tenders-cleanup-proof', 'proof.json']), MigrationRefusal);
  assert.throws(() => readArgs(['status']), /Informe --banco/);
});

test('runner de Licitações exige uma migration por vez e preserva a confirmação de produção', () => {
  const args = readArgs(['aplicar', '0001', '--banco', 'producao', '--confirmo']);
  assert.equal(args.id, '0001');
  assert.equal(args.confirmed, true);
  assert.throws(() => readArgs(['aplicar', '--banco', 'local']), MigrationRefusal);
  assert.throws(() => readArgs(['aplicar', '0001', '0002', '--banco', 'local']), MigrationRefusal);
});
