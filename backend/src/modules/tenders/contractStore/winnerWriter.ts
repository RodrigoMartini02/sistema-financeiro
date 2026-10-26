import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import type { CollectorLogger } from '../collector/logger';
import type { ObjectStorage } from '../objectStorage';
import { openDuckDb, parquetList, sqlLiteral, toDuckDbPath } from './duckdb';
import {
  FILES_FOLDER,
  MANIFEST_KEY,
  MAX_ROWS_PER_FILE,
  PARQUET_CONTENT_TYPE,
  PART_KEY,
  ROW_ORDER,
  columnDefinitions,
  columnList,
  columnsOf,
  storeFileKey,
} from './layout';
import { downloadManifestFiles, localPath, removeUnusedLocalFiles } from './localCopy';
import { datasetFiles, manifestFiles, readManifest, serializeManifest, type ManifestFile, type StoreManifest } from './manifest';
import {
  applyResults,
  fromWinnerRecord,
  purchaseParts,
  toWinnerRecord,
  type ApplyCounts,
  type ApplyOutcome,
  type ResultRecord,
  type WinnerRow,
} from './winnerRows';

// Gravação do conjunto `vencedores` do armazém (plano .plans/licitacoes-vencedores.md), usada pelo Cron Job com a
// mesma trava dos contratos: os dois gravadores publicam no mesmo manifesto e usam a mesma pasta de trabalho, então
// nunca rodam juntos. É um gravador irmão do dos contratos (writer.ts): o que se repete aqui (gravar um arquivo,
// dividir em partes e limpar o bucket) é cópia consciente de writeFile, writeParts e removeUnusedRemoteFiles de lá, de
// propósito, para não mexer no escritor que está em produção. Se uma parte nova pedir outro conjunto, vale unificar.
//   1. abre: baixa o manifesto e só os arquivos dos vencedores para a cópia de trabalho;
//   2. durante a coleta: as mudanças ficam na tabela `mudancas_vencedores`, e o estado anterior de cada compra sai
//      dela (primeiro) ou dos arquivos;
//   3. publica: regrava o ano inteiro de cada ano tocado (um lote diário espalha poucos milhares de linhas por quase
//      todas as faixas de CNPJ do ano), envia os arquivos novos e por último o manifesto; depois apaga do bucket o
//      que nenhum dos dois últimos manifestos usa.
// Falha no envio interrompe a publicação antes do manifesto: a versão em uso não muda, e os arquivos que sobraram
// são apagados na publicação seguinte. O manifesto novo é uma cópia do anterior com os vencedores trocados: os
// outros conjuntos e os totais seguem como estavam (sem isso, a publicação dos vencedores os apagaria).

const WORK_DATABASE = 'trabalho-vencedores.duckdb';
// O mesmo teto do gravador dos contratos para a memória do DuckDB; partes de 25 mil linhas cabem com folga.
const DEFAULT_MEMORY_LIMIT_MB = 128;
const DEFAULT_THREADS = 1;
const WINNER_ROW_GROUP_SIZE = 10_000;
const parquetOptions = `FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE ${WINNER_ROW_GROUP_SIZE}`;

export interface WinnerStoreWriterOptions {
  storage: ObjectStorage;
  /** Pasta da cópia de trabalho (a mesma dos contratos): os arquivos em uso e o banco do DuckDB. */
  directory: string;
  /** Id da execução que publica: entra no nome dos arquivos e no manifesto. */
  version: number;
  /** Dia (AAAA-MM-DD, Brasília) do manifesto criado quando o armazém ainda não tem nenhuma publicação. */
  today: string;
  now: () => Date;
  logger: CollectorLogger;
  memoryLimitMb?: number;
  threads?: number;
  /** Linhas por arquivo; sem ele, MAX_ROWS_PER_FILE (os testes usam limites pequenos). */
  maxRowsPerFile?: number;
}

export interface WinnerApplyResult {
  counts: ApplyCounts;
  /** Chaves das linhas novas, alteradas e removidas neste lote. */
  insertedKeys: string[];
  updatedKeys: string[];
  removedKeys: string[];
  /** Posições dos resultados (na lista entregue) que mudaram o estado de alguma linha. */
  alteredRecords: Set<number>;
}

export interface WinnerPublishSummary {
  revision: string;
  /** Linhas novas, alteradas ou removidas desde a publicação anterior. */
  changedRows: number;
  years: number;
  filesWritten: number;
  bytesWritten: number;
  filesDeleted: number;
  /** Linhas do conjunto na versão nova. */
  rows: number;
}

interface WrittenFile extends ManifestFile {
  localPath: string;
}

const EMPTY_COUNTS: ApplyCounts = { inserted: 0, updated: 0, removed: 0, unchanged: 0 };

const WINNER_JSON_COLUMNS = `{${[...columnsOf('vencedores').map((spec) => `${spec.column}: ${sqlLiteral(spec.type)}`), `removido: ${sqlLiteral('BOOLEAN')}`].join(', ')}}`;
const WINNER_CHANGE_COLUMNS = `${columnList('vencedores')}, removido`;

/** Em ordem de ano e faixa, com a primeira parte de cada ano começando em "". */
function normalizedSlices(files: ManifestFile[]): ManifestFile[] {
  const sorted = [...files].sort((a, b) =>
    a.partition !== b.partition ? (a.partition < b.partition ? -1 : 1) : a.from < b.from ? -1 : a.from > b.from ? 1 : 0,
  );
  return sorted.map((file, index) => (index === 0 || sorted[index - 1]?.partition !== file.partition ? { ...file, from: '' } : file));
}

export class WinnerStoreWriter {
  private publishCount = 0;
  private sequence = 0;

  private constructor(
    private readonly options: WinnerStoreWriterOptions,
    private readonly instance: DuckDBInstance,
    private readonly connection: DuckDBConnection,
    private manifest: StoreManifest | null,
  ) {}

  static async open(options: WinnerStoreWriterOptions): Promise<WinnerStoreWriter> {
    await mkdir(options.directory, { recursive: true });
    const manifest = await readManifest(options.storage);
    const downloaded = await downloadManifestFiles(options.storage, manifest, options.directory, ['vencedores']);
    await removeUnusedLocalFiles(options.directory, [manifest]);
    options.logger.info('Cópia de trabalho dos vencedores pronta', {
      revision: manifest?.revision ?? null,
      files: datasetFiles(manifest, 'vencedores').length,
      downloaded,
    });

    const databasePath = join(options.directory, WORK_DATABASE);
    await rm(databasePath, { force: true });
    await rm(`${databasePath}.wal`, { force: true });
    const { instance, connection } = await openDuckDb({
      path: databasePath,
      memoryLimitMb: options.memoryLimitMb ?? DEFAULT_MEMORY_LIMIT_MB,
      threads: options.threads ?? DEFAULT_THREADS,
      tempDirectory: join(options.directory, 'tmp-vencedores'),
    });
    await connection.run(`CREATE TABLE mudancas_vencedores (${columnDefinitions('vencedores')}, removido BOOLEAN NOT NULL DEFAULT false, PRIMARY KEY (chave))`);
    await connection.run(`CREATE TABLE vazio_vencedores (${columnDefinitions('vencedores')})`);
    const writer = new WinnerStoreWriter(options, instance, connection, manifest);
    await writer.refreshCurrentView();
    return writer;
  }

  /** O manifesto em uso (o publicado por último). */
  get currentManifest(): StoreManifest | null {
    return this.manifest;
  }

  /** Linhas dos vencedores na versão em uso (a soma das linhas dos arquivos do manifesto). */
  get publishedRows(): number {
    return datasetFiles(this.manifest, 'vencedores').reduce((total, file) => total + file.rows, 0);
  }

  /** Linhas novas, alteradas ou removidas ainda não publicadas. */
  async pendingChanges(): Promise<number> {
    const result = await this.connection.runAndReadAll('SELECT count(*)::INTEGER FROM mudancas_vencedores');
    return Number(result.getRows()[0]?.[0] ?? 0);
  }

  /**
   * As linhas já gravadas das compras indicadas (de todos os fornecedores), numa consulta só. As mudanças da execução
   * valem mais que os arquivos, e a lápide conta como linha ausente. Por compra, e não por linha, para achar a troca
   * de fornecedor do mesmo item. O ano da compra poda os arquivos, e o número de controle vai como literal já
   * conferido contra o formato: com literais o DuckDB usa os mínimos e máximos dos arquivos para pular os que não têm
   * a compra (com parâmetros, não).
   */
  async readRows(purchases: readonly string[]): Promise<WinnerRow[]> {
    const valid = [...new Set(purchases)].filter((purchase) => purchaseParts(purchase) !== null);
    if (valid.length === 0) {
      return [];
    }
    const years = [...new Set(valid.map((purchase) => purchaseParts(purchase)?.year ?? 0))];
    const list = valid.map(sqlLiteral).join(', ');
    const columns = columnList('vencedores');
    const result = await this.connection.runAndReadAll(`
      SELECT ${columns}, removido FROM mudancas_vencedores WHERE numero_controle_compra IN (${list})
      UNION ALL
      SELECT ${columns}, false AS removido FROM atual_vencedores a
       WHERE a.ano_compra IN (${years.map((year) => Math.trunc(year)).join(', ')})
         AND a.numero_controle_compra IN (${list})
         AND NOT EXISTS (SELECT 1 FROM mudancas_vencedores m WHERE m.chave = a.chave)`);
    return result
      .getRowObjectsJson()
      .filter((row) => row['removido'] !== true)
      .map((row) => fromWinnerRecord(row));
  }

  /**
   * Aplica os resultados lidos: lê o estado anterior das compras, agrega (winnerRows.ts) e grava nas mudanças da
   * execução só as linhas cujo conteúdo mudou e as lápides. Resultado igual ao que já está gravado não grava nada.
   */
  async apply(records: readonly ResultRecord[]): Promise<WinnerApplyResult> {
    if (records.length === 0) {
      return { counts: { ...EMPTY_COUNTS }, insertedKeys: [], updatedKeys: [], removedKeys: [], alteredRecords: new Set() };
    }
    const current = await this.readRows(records.map((record) => record.purchaseControlNumber));
    const outcome = applyResults(current, records, this.options.now().toISOString());
    await this.saveChanges(outcome);
    return {
      counts: outcome.counts,
      insertedKeys: outcome.insertedKeys,
      updatedKeys: outcome.updatedKeys,
      removedKeys: outcome.removedKeys,
      alteredRecords: outcome.alteredRecords,
    };
  }

  /**
   * Publica as mudanças: o ano inteiro de cada ano tocado, os arquivos novos e o manifesto. Sem mudança, não publica
   * nada (null). Depois, as mudanças ficam zeradas e a cópia de trabalho passa a ser a versão nova (a carga publica
   * mais de uma vez).
   */
  async publish(): Promise<WinnerPublishSummary | null> {
    const changedRows = await this.pendingChanges();
    if (changedRows === 0) {
      return null;
    }
    this.publishCount += 1;
    this.sequence = 0;
    const revision = `${this.options.version}.${this.publishCount}`;
    const written: WrittenFile[] = [];
    const previous = this.manifest;

    const yearRows = await this.connection.runAndReadAll('SELECT DISTINCT ano_compra FROM mudancas_vencedores ORDER BY ano_compra');
    const years = yearRows.getRows().map(([year]) => Number(year));
    const touched = new Set(years.map(String));
    const rewritten: ManifestFile[] = [];
    const columns = columnList('vencedores');
    for (const year of years) {
      const partition = String(year);
      const yearFiles = datasetFiles(previous, 'vencedores').filter((file) => file.partition === partition);
      const sources = [
        ...(yearFiles.length > 0
          ? [`SELECT ${columns} FROM read_parquet(${parquetList(yearFiles.map((file) => localPath(this.options.directory, file.path)))}, union_by_name = true) f
               WHERE NOT EXISTS (SELECT 1 FROM mudancas_vencedores m WHERE m.chave = f.chave)`]
          : []),
        `SELECT ${columns} FROM mudancas_vencedores WHERE ano_compra = ${year} AND NOT removido`,
      ];
      await this.connection.run(`CREATE OR REPLACE TEMP VIEW ano_vencedores AS ${sources.join(' UNION ALL BY NAME ')}`);
      rewritten.push(...(await this.writeParts(partition, revision, 'ano_vencedores', written)));
    }
    await this.connection.run('DROP VIEW IF EXISTS ano_vencedores');

    for (const file of written) {
      await this.options.storage.putObject(file.path, await readFile(file.localPath), PARQUET_CONTENT_TYPE);
    }
    const kept = datasetFiles(previous, 'vencedores').filter((file) => !touched.has(file.partition));
    const vencedores = normalizedSlices([...kept, ...rewritten]);
    const publishedAt = this.options.now().toISOString();
    const next: StoreManifest = previous
      ? { ...previous, revision, publishedAt, datasets: { ...previous.datasets, vencedores } }
      : {
          format: 1,
          revision,
          publishedAt,
          today: this.options.today,
          totals: { contracts: 0, active: 0, withoutExpiry: 0 },
          datasets: { vigentes: [], contratos: [], fornecedor: [], vencedores },
        };
    // O manifesto por último, numa escrita só: quem lê vê a versão anterior inteira ou a nova inteira.
    await this.options.storage.putObject(MANIFEST_KEY, serializeManifest(next), 'application/json');

    this.manifest = next;
    await this.connection.run('DELETE FROM mudancas_vencedores');
    await this.refreshCurrentView();
    const filesDeleted = await this.removeUnusedRemoteFiles([previous, next]);
    await this.removeUnusedLocalCopies(next);

    const summary: WinnerPublishSummary = {
      revision,
      changedRows,
      years: years.length,
      filesWritten: written.length,
      bytesWritten: written.reduce((total, file) => total + file.bytes, 0),
      filesDeleted,
      rows: this.publishedRows,
    };
    this.options.logger.info('Vencedores publicados no armazém', { ...summary, rssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)) });
    return summary;
  }

  async close(): Promise<void> {
    this.connection.closeSync();
    this.instance.closeSync();
    const databasePath = join(this.options.directory, WORK_DATABASE);
    await rm(databasePath, { force: true });
    await rm(`${databasePath}.wal`, { force: true });
  }

  private async refreshCurrentView(): Promise<void> {
    const files = datasetFiles(this.manifest, 'vencedores').map((file) => localPath(this.options.directory, file.path));
    const source = files.length > 0 ? `read_parquet(${parquetList(files)}, union_by_name = true)` : 'vazio_vencedores';
    await this.connection.run(`CREATE OR REPLACE VIEW atual_vencedores AS SELECT ${columnList('vencedores')} FROM ${source}`);
  }

  /**
   * Grava nas mudanças as linhas novas ou alteradas e as lápides (a linha como estava, com `removido`). Cada chave
   * aparece uma vez só na lista (a agregação garante): duas linhas com a mesma chave no mesmo INSERT ficam com a primeira.
   */
  private async saveChanges(outcome: ApplyOutcome): Promise<void> {
    const lines = [
      ...outcome.upserts.map((row) => JSON.stringify({ ...toWinnerRecord(row), removido: false })),
      ...outcome.removals.map((row) => JSON.stringify({ ...toWinnerRecord(row), removido: true })),
    ];
    if (lines.length === 0) {
      return;
    }
    const path = join(this.options.directory, 'pagina-vencedores.ndjson');
    await writeFile(path, lines.join('\n'), 'utf8');
    try {
      await this.connection.run(`
        INSERT OR REPLACE INTO mudancas_vencedores
        SELECT ${WINNER_CHANGE_COLUMNS}
          FROM read_json(${sqlLiteral(toDuckDbPath(path))}, format = 'newline_delimited', columns = ${WINNER_JSON_COLUMNS})`);
    } finally {
      await rm(path, { force: true });
    }
  }

  /** Grava um arquivo do ano com as linhas de `selectSql`, e devolve a entrada do manifesto. */
  private async writeFile(partition: string, revision: string, from: string, selectSql: string, written: WrittenFile[]): Promise<WrittenFile> {
    this.sequence += 1;
    const key = storeFileKey('vencedores', partition, revision, this.sequence);
    const path = localPath(this.options.directory, key);
    await mkdir(dirname(path), { recursive: true });
    await this.connection.run(`COPY (${selectSql} ORDER BY ${ROW_ORDER.vencedores}) TO ${sqlLiteral(toDuckDbPath(path))} (${parquetOptions})`);
    const counted = await this.connection.runAndReadAll(`SELECT count(*)::INTEGER FROM read_parquet(${sqlLiteral(toDuckDbPath(path))})`);
    const file: WrittenFile = {
      path: key,
      rows: Number(counted.getRows()[0]?.[0] ?? 0),
      bytes: (await stat(path)).size,
      partition,
      from,
      localPath: path,
    };
    written.push(file);
    return file;
  }

  /**
   * Grava as linhas de `source` (uma visão) em arquivos de até o limite de linhas, divididos pela chave em faixas de
   * tamanho parecido: uma faixa nova a cada `size` linhas na ordem da chave. Só a coluna da chave é ordenada para
   * achar os limites, e cada arquivo ordena só as suas linhas: a memória fica limitada pelo tamanho da parte.
   */
  private async writeParts(partition: string, revision: string, source: string, written: WrittenFile[]): Promise<ManifestFile[]> {
    const key = PART_KEY.vencedores;
    const total = Number((await this.connection.runAndReadAll(`SELECT count(*)::INTEGER FROM ${source}`)).getRows()[0]?.[0] ?? 0);
    if (total === 0) {
      return [];
    }
    const parts = Math.ceil(total / (this.options.maxRowsPerFile ?? MAX_ROWS_PER_FILE.vencedores));
    let starts = [''];
    if (parts > 1) {
      const size = Math.ceil(total / parts);
      const boundaries = await this.connection.runAndReadAll(`
        SELECT chave FROM (SELECT ${key} AS chave, row_number() OVER (ORDER BY ${key}) - 1 AS posicao FROM ${source})
         WHERE posicao > 0 AND posicao % ${size} = 0 ORDER BY chave`);
      starts = ['', ...boundaries.getRows().map(([boundary]) => String(boundary))];
    }
    const files: ManifestFile[] = [];
    const columns = columnList('vencedores');
    for (const [index, start] of starts.entries()) {
      const end = starts[index + 1] ?? null;
      const filter = [`${key} >= ${sqlLiteral(start)}`, ...(end === null ? [] : [`${key} < ${sqlLiteral(end)}`])].join(' AND ');
      files.push(await this.writeFile(partition, revision, start, `SELECT ${columns} FROM ${source} WHERE ${filter}`, written));
    }
    return files;
  }

  /** Apaga do bucket os arquivos do armazém que nenhum dos manifestos usa (de qualquer conjunto). */
  private async removeUnusedRemoteFiles(keep: ReadonlyArray<StoreManifest | null>): Promise<number> {
    const used = new Set(keep.flatMap((manifest) => manifestFiles(manifest).map((file) => file.path)));
    let deleted = 0;
    for (const key of await this.options.storage.listKeys(`${FILES_FOLDER}/`)) {
      if (!used.has(key)) {
        await this.options.storage.deleteObject(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  /**
   * Na cópia de trabalho, só a versão nova. No Windows, um arquivo ainda aberto pelo DuckDB não pode ser apagado:
   * fica para a próxima vez.
   */
  private async removeUnusedLocalCopies(next: StoreManifest): Promise<void> {
    try {
      await removeUnusedLocalFiles(this.options.directory, [next]);
    } catch (error) {
      this.options.logger.warn('Cópia de trabalho dos vencedores: arquivos antigos não apagados agora', { error });
    }
  }
}
