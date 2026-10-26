import { join } from 'node:path';
import type { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import type { CollectorLogger } from '../collector/logger';
import type { ObjectStorage } from '../objectStorage';
import { openDuckDb, parquetList } from './duckdb';
import { CONTRACT_DATASETS, STORE_DATASETS, columnDefinitions, columnList, type StoreDataset } from './layout';
import { downloadManifestFiles, localPath, removeUnusedLocalFiles } from './localCopy';
import { datasetFiles, readManifest, type StoreManifest } from './manifest';

// Leitura do armazém de contratos no Web Service (plano
// .plans/licitacoes-contratos-no-r2.md, Parte R1): uma cópia local dos
// arquivos em uso, consultada pelo DuckDB nas visões `vigentes`, `contratos` e
// `fornecedor`. Ao subir, baixa a versão atual sem atrasar o resto do
// servidor; depois confere o manifesto a cada 10 minutos e, com versão nova,
// baixa só os arquivos novos e troca as visões numa transação, sem parar as
// buscas em andamento. Os arquivos da versão anterior ficam até a troca
// seguinte (uma busca ainda pode estar lendo deles).
// As buscas passam por uma fila (poucas ao mesmo tempo, porque o servidor tem
// meia CPU) e têm limite de tempo. Sem cópia pronta, ContractStoreUnavailableError.
// Só os conjuntos pedidos em `datasets` são baixados e abertos (por padrão, os
// de contratos): os vencedores (plano .plans/licitacoes-vencedores.md) ficam de
// fora do Web Service, e o conjunto que não foi pedido tem uma visão vazia,
// porque visão sobre arquivo que não foi baixado falha na criação.

const DEFAULT_POLL_INTERVAL_MS = 10 * 60_000;
const DEFAULT_RETRY_INTERVAL_MS = 30_000;
const DEFAULT_MEMORY_LIMIT_MB = 128;
const DEFAULT_THREADS = 1;
const DEFAULT_MAX_CONCURRENT_QUERIES = 2;
const DEFAULT_QUERY_TIMEOUT_MS = 20_000;

export interface ContractStoreReaderOptions {
  storage: ObjectStorage;
  /** Pasta da cópia local (no Render, o disco temporário). */
  directory: string;
  logger: CollectorLogger;
  pollIntervalMs?: number;
  /** Intervalo das novas tentativas enquanto não há cópia pronta. */
  retryIntervalMs?: number;
  memoryLimitMb?: number;
  threads?: number;
  maxConcurrentQueries?: number;
  queryTimeoutMs?: number;
  /** Conjuntos baixados e abertos; sem ele, os de contratos (CONTRACT_DATASETS). */
  datasets?: readonly StoreDataset[];
}

/** Ainda não há cópia pronta (o servidor acabou de subir, ou o R2 não respondeu). */
export class ContractStoreUnavailableError extends Error {
  constructor() {
    super('Os contratos estão sendo atualizados. Tente de novo em instantes.');
    this.name = 'ContractStoreUnavailableError';
  }
}

/** A busca passou do limite de tempo e foi interrompida. */
export class ContractStoreTimeoutError extends Error {
  constructor() {
    super('A busca de contratos demorou demais. Tente com mais filtros.');
    this.name = 'ContractStoreTimeoutError';
  }
}

/** O armazém não pôde responder agora (sem cópia pronta, ou a consulta passou do limite): quem chama pode seguir sem a resposta. */
export function isContractStoreBusy(error: unknown): boolean {
  return error instanceof ContractStoreUnavailableError || error instanceof ContractStoreTimeoutError;
}

export interface ContractStoreStatus {
  ready: boolean;
  /** null: pronto, mas o armazém ainda não tem nenhuma publicação. */
  revision: string | null;
  publishedAt: string | null;
  /** Dia (AAAA-MM-DD, Brasília) em que a publicação contou os vigentes. */
  today: string | null;
  totals: StoreManifest['totals'] | null;
  /** Só quando a versão em uso tem arquivos de vencedores: as linhas do manifesto (a contagem não abre o DuckDB). */
  winners?: { rows: number };
}

/** O que as buscas e os avisos usam do armazém: consultar, e saber se já há cópia pronta. */
export type ContractStoreAccess = Pick<ContractStoreReader, 'query' | 'status'>;

interface Waiter {
  resolve: (connection: DuckDBConnection) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class ContractStoreReader {
  private ready = false;
  private manifest: StoreManifest | null = null;
  private previousManifest: StoreManifest | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private refreshing: Promise<boolean> | null = null;
  private readonly idle: DuckDBConnection[];
  private readonly waiters: Waiter[] = [];

  private constructor(
    private readonly options: ContractStoreReaderOptions,
    private readonly instance: DuckDBInstance,
    private readonly admin: DuckDBConnection,
    connections: DuckDBConnection[],
  ) {
    this.idle = connections;
  }

  static async create(options: ContractStoreReaderOptions): Promise<ContractStoreReader> {
    const { instance, connection } = await openDuckDb({
      memoryLimitMb: options.memoryLimitMb ?? DEFAULT_MEMORY_LIMIT_MB,
      threads: options.threads ?? DEFAULT_THREADS,
      tempDirectory: join(options.directory, 'tmp'),
    });
    for (const dataset of STORE_DATASETS) {
      await connection.run(`CREATE TABLE vazio_${dataset} (${columnDefinitions(dataset)})`);
    }
    const connections: DuckDBConnection[] = [];
    for (let index = 0; index < (options.maxConcurrentQueries ?? DEFAULT_MAX_CONCURRENT_QUERIES); index += 1) {
      connections.push(await instance.connect());
    }
    return new ContractStoreReader(options, instance, connection, connections);
  }

  /** Conjuntos baixados e abertos por este leitor. */
  private get datasets(): readonly StoreDataset[] {
    return this.options.datasets ?? CONTRACT_DATASETS;
  }

  /** Começa a cópia em segundo plano: a primeira agora, depois a cada intervalo. */
  start(): void {
    void this.refreshAndSchedule();
  }

  status(): ContractStoreStatus {
    const winnerFiles = datasetFiles(this.manifest, 'vencedores');
    return {
      ready: this.ready,
      revision: this.manifest?.revision ?? null,
      publishedAt: this.manifest?.publishedAt ?? null,
      today: this.manifest?.today ?? null,
      totals: this.manifest?.totals ?? null,
      ...(winnerFiles.length > 0 ? { winners: { rows: winnerFiles.reduce((total, file) => total + file.rows, 0) } } : {}),
    };
  }

  /**
   * Confere o manifesto e, com versão nova, baixa os arquivos que faltam e
   * troca as visões. Devolve true quando trocou. Erro do R2 ou manifesto
   * inválido: a versão em uso continua.
   */
  async refresh(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  /** Roda uma consulta numa das conexões da fila, com o limite de tempo. */
  async query<T>(run: (connection: DuckDBConnection) => Promise<T>): Promise<T> {
    if (!this.ready) {
      throw new ContractStoreUnavailableError();
    }
    const timeoutMs = this.options.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;
    const startedAt = Date.now();
    const connection = await this.acquire(timeoutMs);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      connection.interrupt();
    }, Math.max(1, timeoutMs - (Date.now() - startedAt)));
    try {
      return await run(connection);
    } catch (error) {
      if (timedOut) {
        throw new ContractStoreTimeoutError();
      }
      throw error;
    } finally {
      clearTimeout(timer);
      this.release(connection);
    }
  }

  async close(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    await this.refreshing?.catch(() => false);
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new ContractStoreUnavailableError());
    }
    for (const connection of this.idle) {
      connection.closeSync();
    }
    this.admin.closeSync();
    this.instance.closeSync();
  }

  private async refreshAndSchedule(): Promise<void> {
    await this.refresh();
    if (this.stopped) {
      return;
    }
    const delay = this.ready
      ? (this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS)
      : (this.options.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS);
    this.timer = setTimeout(() => void this.refreshAndSchedule(), delay);
    // O servidor pode encerrar sem esperar a próxima conferência.
    this.timer.unref();
  }

  private async doRefresh(): Promise<boolean> {
    try {
      const next = await readManifest(this.options.storage);
      if (this.ready && next?.revision === this.manifest?.revision) {
        return false;
      }
      const downloaded = await downloadManifestFiles(this.options.storage, next, this.options.directory, this.datasets);
      await this.swapViews(next);
      this.previousManifest = this.ready ? this.manifest : null;
      this.manifest = next;
      this.ready = true;
      this.options.logger.info('Cópia dos contratos atualizada', { revision: next?.revision ?? null, downloaded });
      await this.removeOldFiles();
      return true;
    } catch (error) {
      this.options.logger.warn('Cópia dos contratos não atualizada agora', { error, ready: this.ready });
      return false;
    }
  }

  private async swapViews(manifest: StoreManifest | null): Promise<void> {
    await this.admin.run('BEGIN TRANSACTION');
    try {
      for (const dataset of STORE_DATASETS) {
        const files = this.datasets.includes(dataset)
          ? datasetFiles(manifest, dataset).map((file) => localPath(this.options.directory, file.path))
          : [];
        const source = files.length > 0 ? `read_parquet(${parquetList(files)}, union_by_name = true)` : `vazio_${dataset}`;
        await this.admin.run(`CREATE OR REPLACE VIEW ${dataset} AS SELECT ${columnList(dataset)} FROM ${source}`);
      }
      await this.admin.run('COMMIT');
    } catch (error) {
      await this.admin.run('ROLLBACK');
      throw error;
    }
  }

  /** Fica a versão em uso e a anterior; no Windows, arquivo ainda aberto fica para a próxima troca. */
  private async removeOldFiles(): Promise<void> {
    try {
      await removeUnusedLocalFiles(this.options.directory, [this.manifest, this.previousManifest]);
    } catch (error) {
      this.options.logger.warn('Cópia dos contratos: arquivos antigos não apagados agora', { error });
    }
  }

  private acquire(timeoutMs: number): Promise<DuckDBConnection> {
    const connection = this.idle.pop();
    if (connection) {
      return Promise.resolve(connection);
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          reject(new ContractStoreTimeoutError());
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  private release(connection: DuckDBConnection): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(connection);
      return;
    }
    this.idle.push(connection);
  }
}
