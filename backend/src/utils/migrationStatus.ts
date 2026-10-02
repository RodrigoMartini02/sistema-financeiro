// Controle das migrations aplicadas (tabela schema_migrations), sem acesso ao
// banco: ordena os arquivos de backend/drizzle, calcula o que falta em cada
// banco e valida o "aplicar" (uma migration por vez, nomeada, em ordem).
import { createHash } from 'node:crypto';

/** Migration que cria a schema_migrations: a única aceita enquanto a tabela não existe no banco. */
export const REGISTRY_MIGRATION = '0057_registro_migrations.sql';

/** NNNN_nome.sql, ou NNNNx_nome.sql para um passo extra (ex.: 0018b_...). */
const FILENAME_PATTERN = /^(\d{4})([a-z]?)_[a-z0-9_]+\.sql$/;
/** Identificador como o usuário digita no "aplicar": 0058, 0018b. */
export const MIGRATION_ID_PATTERN = /^\d{4}[a-z]?$/;

export interface MigrationFile {
  filename: string;
  /** Número com a letra, como no nome do arquivo: "0057", "0018b". */
  id: string;
  checksum: string;
}

export interface AppliedMigration {
  filename: string;
  checksum: string;
}

export interface MigrationStatus {
  /** Arquivo sem registro no banco. */
  pending: MigrationFile[];
  /** Registrada, mas o arquivo mudou depois de aplicado. */
  edited: MigrationFile[];
  /** Registro no banco sem arquivo correspondente (renomeado ou apagado). */
  missingFile: AppliedMigration[];
}

/** Motivo para recusar o comando, mostrado a quem roda o script (não é erro de programa). */
export class MigrationRefusal extends Error {}

/** SHA-256 do conteúdo com quebras de linha LF: o git no Windows troca LF por CRLF no checkout. */
export function migrationChecksum(content: string): string {
  return createHash('sha256').update(content.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

/** Ordem de aplicação: número e depois a letra. Nome fora do padrão ou identificador repetido é erro. */
export function orderMigrations(files: ReadonlyArray<{ filename: string; content: string }>): MigrationFile[] {
  const ordered = files
    .map(({ filename, content }) => {
      const match = FILENAME_PATTERN.exec(filename);
      if (!match) throw new MigrationRefusal(`Nome de migration fora do padrão NNNN_nome.sql: ${filename}`);
      return { filename, id: `${match[1]}${match[2]}`, checksum: migrationChecksum(content) };
    })
    // Com 4 dígitos, a ordem do texto é a do número; "0018" < "0018b" < "0019".
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (let index = 1; index < ordered.length; index++) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    if (previous.id === current.id) {
      throw new MigrationRefusal(`Número de migration repetido: ${previous.filename} e ${current.filename}`);
    }
  }
  return ordered;
}

export function migrationStatus(files: readonly MigrationFile[], applied: readonly AppliedMigration[]): MigrationStatus {
  const appliedByName = new Map(applied.map((item) => [item.filename, item]));
  const fileNames = new Set(files.map((file) => file.filename));
  return {
    pending: files.filter((file) => !appliedByName.has(file.filename)),
    edited: files.filter((file) => {
      const record = appliedByName.get(file.filename);
      return record !== undefined && record.checksum !== file.checksum;
    }),
    missingFile: applied.filter((item) => !fileNames.has(item.filename)),
  };
}

function findMigration(files: readonly MigrationFile[], id: string): MigrationFile {
  const target = files.find((file) => file.id === id);
  if (!target) throw new MigrationRefusal(`Não existe migration ${id} em backend/drizzle.`);
  return target;
}

/**
 * A migration que "aplicar ID" vai executar. Recusa identificador inexistente,
 * migration já aplicada e pendente anterior (a ordem vale). Sem a
 * schema_migrations no banco, só a REGISTRY_MIGRATION é aceita: é ela que cria a tabela.
 */
export function migrationToApply(
  files: readonly MigrationFile[],
  applied: readonly AppliedMigration[],
  id: string,
  registryExists: boolean,
): MigrationFile {
  const target = findMigration(files, id);
  if (!registryExists) {
    if (target.filename === REGISTRY_MIGRATION) return target;
    throw new MigrationRefusal(`Este banco ainda não tem a schema_migrations: aplique primeiro a ${REGISTRY_MIGRATION}.`);
  }

  const appliedNames = new Set(applied.map((item) => item.filename));
  if (appliedNames.has(target.filename)) {
    throw new MigrationRefusal(`A ${target.filename} já está aplicada neste banco.`);
  }
  const earlierPending = files.filter((file) => file.id < target.id && !appliedNames.has(file.filename));
  if (earlierPending.length > 0) {
    const names = earlierPending.map((file) => file.filename).join(', ');
    throw new MigrationRefusal(`Há migration pendente antes da ${target.filename}: ${names}. Aplique em ordem.`);
  }
  return target;
}

/** Registro inicial: as migrations até `upToId` ainda sem registro, para marcar como aplicadas sem executar. */
export function migrationsToRegister(
  files: readonly MigrationFile[],
  applied: readonly AppliedMigration[],
  upToId: string,
): MigrationFile[] {
  findMigration(files, upToId);
  const appliedNames = new Set(applied.map((item) => item.filename));
  return files.filter((file) => file.id <= upToId && !appliedNames.has(file.filename));
}
