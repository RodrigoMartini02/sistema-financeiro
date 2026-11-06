import { createHash } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import path from 'node:path';
import { MigrationRefusal } from './migrationStatus';

export const TENDERS_CLEANUP_MIGRATION = '0096_drop_legacy_tenders_schema.sql';

export interface TendersCleanupProof {
  database: string;
  schema: 'licitacoes';
  backupPath: string;
  backupSha256: string;
  archiveFullyReadable: true;
  tableDataEntries: number;
}

export async function readTendersCleanupProof(filename: string | undefined, database: string): Promise<TendersCleanupProof> {
  if (!filename) {
    throw new MigrationRefusal('A limpeza exige --tenders-cleanup-proof com o registro do backup conferido.');
  }

  let value: unknown;
  try {
    value = JSON.parse(readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    throw new MigrationRefusal('Não foi possível ler o registro do backup da limpeza.');
  }
  if (!value || typeof value !== 'object') {
    throw new MigrationRefusal('Registro de backup inválido.');
  }
  const proof = value as Partial<TendersCleanupProof>;
  if (proof.database !== database || proof.schema !== 'licitacoes'
    || typeof proof.backupPath !== 'string' || !path.isAbsolute(proof.backupPath)
    || typeof proof.backupSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(proof.backupSha256)
    || proof.archiveFullyReadable !== true || proof.tableDataEntries !== 15) {
    throw new MigrationRefusal('O registro deve identificar este banco e o backup íntegro das 15 tabelas de Licitações.');
  }

  const hash = createHash('sha256');
  try {
    for await (const chunk of createReadStream(proof.backupPath)) {
      hash.update(chunk);
    }
  } catch {
    throw new MigrationRefusal('O arquivo do backup não está disponível.');
  }
  if (hash.digest('hex') !== proof.backupSha256) {
    throw new MigrationRefusal('O SHA-256 do backup difere do registro conferido.');
  }
  return proof as TendersCleanupProof;
}
