import assert from 'node:assert/strict';
import test from 'node:test';
import { readArgs } from '../../scripts/migrations';
import { MigrationRefusal } from './migrationStatus';

test('runner de Finanças não executa nada ao importar e recusa escolher a API de Licitações', () => {
  assert.equal(readArgs(['status', '--banco', 'local']).project, 'finance');
  assert.equal(readArgs(['status', '--banco', 'producao', '--projeto', 'finance']).project, 'finance');
  assert.throws(() => readArgs(['status', '--banco', 'local', '--projeto', 'tenders']), /Projeto inválido/);
  assert.throws(() => readArgs(['status', '--banco', 'local', '--projeto']), MigrationRefusal);
  assert.throws(() => readArgs(['status', '--banco', 'local', '--unknown']), MigrationRefusal);
  assert.throws(() => readArgs(['status']), /Informe --banco/);
});

test('runner de Finanças preserva confirmação e prova obrigatória da limpeza histórica', () => {
  const args = readArgs(['aplicar', '0096', '--banco', 'producao', '--confirmo', '--tenders-cleanup-proof', 'proof.json']);
  assert.equal(args.id, '0096');
  assert.equal(args.confirmed, true);
  assert.equal(args.tendersCleanupProof, 'proof.json');
  assert.throws(() => readArgs(['aplicar', '--banco', 'local']), MigrationRefusal);
  assert.throws(() => readArgs(['aplicar', '0096', '0097', '--banco', 'local']), MigrationRefusal);
});
