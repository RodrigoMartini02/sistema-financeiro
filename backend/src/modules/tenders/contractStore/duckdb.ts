import { mkdir } from 'node:fs/promises';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';

// DuckDB do armazém de contratos: a gravação no Cron Job (writer.ts) e a
// leitura no Web Service (reader.ts). Lê só arquivos locais, com as extensões
// que vêm embutidas (parquet, json, icu): nada é baixado da internet, e o
// httpfs não é usado (os arquivos chegam pelo cliente do R2, objectStorage.ts).

export interface DuckDbOptions {
  /** Arquivo do banco; sem ele, na memória. */
  path?: string;
  memoryLimitMb: number;
  threads: number;
  /** Onde o DuckDB grava o que não cabe na memória. */
  tempDirectory: string;
}

export interface OpenedDuckDb {
  instance: DuckDBInstance;
  connection: DuckDBConnection;
}

export async function openDuckDb(options: DuckDbOptions): Promise<OpenedDuckDb> {
  await mkdir(options.tempDirectory, { recursive: true });
  const instance = await DuckDBInstance.create(options.path ?? ':memory:', {
    memory_limit: `${options.memoryLimitMb}MB`,
    threads: String(options.threads),
    temp_directory: toDuckDbPath(options.tempDirectory),
    autoinstall_known_extensions: 'false',
    autoload_known_extensions: 'false',
  });
  const connection = await instance.connect();
  // Os metadados dos arquivos ficam na memória entre as consultas (o rodapé de cada Parquet).
  await connection.run('SET parquet_metadata_cache = true');
  return { instance, connection };
}

/** Caminho no formato que o DuckDB aceita em qualquer sistema (barras normais). */
export function toDuckDbPath(path: string): string {
  return path.replaceAll('\\', '/');
}

/**
 * Texto como literal SQL do DuckDB, com as aspas dobradas. Só para valores
 * internos (caminhos de arquivos, números de controle vindos do PNCP e chaves
 * das faixas): o que vem da pessoa vai sempre como parâmetro ($nome). Com
 * literais, o DuckDB usa os mínimos e máximos dos arquivos para pular os que
 * não têm o valor.
 */
export function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Número de uma linha lida do DuckDB (contagens saem com `::INTEGER`, nunca BigInt); vazio vira 0. */
export const integerOf = (value: unknown): number => Number(value ?? 0);

/** Texto de uma linha lida do DuckDB; nulo continua nulo. */
export const textOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

/** Lista de caminhos para read_parquet. */
export function parquetList(paths: readonly string[]): string {
  return `[${paths.map((path) => sqlLiteral(toDuckDbPath(path))).join(', ')}]`;
}
