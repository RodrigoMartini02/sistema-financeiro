import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MigrationRefusal } from './migrationStatus';
import { readTendersCleanupProof } from './tendersCleanup';

async function withBackup(run: (proofPath: string, proof: Record<string, unknown>) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'fingerence-cleanup-test-'));
  const backup = Buffer.from('backup fixture');
  const proofPath = path.join(directory, 'proof.json');
  const proof = {
    database: 'sistema_financas_dev', schema: 'licitacoes', backupPath: path.join(directory, 'backup.dump'),
    backupSha256: createHash('sha256').update(backup).digest('hex'), archiveFullyReadable: true, tableDataEntries: 15,
  };
  writeFileSync(proof.backupPath, backup);
  writeFileSync(proofPath, JSON.stringify(proof));
  try {
    await run(proofPath, proof);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('cleanup refuses to proceed without a recorded backup', async () => {
  await assert.rejects(readTendersCleanupProof(undefined, 'sistema_financas_dev'), MigrationRefusal);
});

test('cleanup accepts an available, verified backup for the exact target database', async () => {
  await withBackup(async (filename, proof) => {
    assert.deepEqual(await readTendersCleanupProof(filename, 'sistema_financas_dev'), proof);
    await assert.rejects(readTendersCleanupProof(filename, 'fingerence_licitacoes_dev'), MigrationRefusal);
  });
});

test('cleanup refuses a backup changed after verification or removed from disk', async () => {
  await withBackup(async (filename, proof) => {
    const backupPath = String(proof['backupPath']);
    writeFileSync(backupPath, 'changed backup');
    await assert.rejects(readTendersCleanupProof(filename, 'sistema_financas_dev'), /SHA-256/);
    rmSync(backupPath);
    await assert.rejects(readTendersCleanupProof(filename, 'sistema_financas_dev'), MigrationRefusal);
  });
});

test('cleanup refuses incomplete archives, a different schema and malformed records', async () => {
  await withBackup(async (filename, proof) => {
    for (const patch of [{ archiveFullyReadable: false }, { tableDataEntries: 14 }, { schema: 'public' }]) {
      writeFileSync(filename, JSON.stringify({ ...proof, ...patch }));
      await assert.rejects(readTendersCleanupProof(filename, 'sistema_financas_dev'), MigrationRefusal);
    }
    writeFileSync(filename, '{invalid');
    await assert.rejects(readTendersCleanupProof(filename, 'sistema_financas_dev'), MigrationRefusal);
  });
});
