import { lstat, readdir } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import type { CollectorLogger } from './logger';

/** Alvo operacional: mantém pelo menos 400 MB antes do limite de 2 GB diagnosticado no cron. */
export const COLLECTOR_DISK_LIMIT_BYTES = 1_600_000_000;
export const COLLECTOR_PUBLICATION_RESERVE_BYTES = 128_000_000;

export interface CollectorDiskUsage {
  totalBytes: number;
  parquetBytes: number;
  databaseBytes: number;
  walBytes: number;
  temporaryBytes: number;
  otherBytes: number;
  files: number;
}

export interface CollectorResourceSample extends CollectorDiskUsage {
  phase: string;
  measuredAt: string;
}

export interface CollectorResourceSummary {
  limitBytes: number;
  publicationReserveBytes: number;
  peakBytes: number;
  measurements: number;
  measurementFailures: number;
  limitExceeded: boolean;
  last: CollectorResourceSample | null;
}

export interface CollectorResourceBudgetOptions {
  /** Toda a área temporária do contêiner; testes devem usar uma pasta própria. */
  directory: string;
  limitBytes?: number;
  publicationReserveBytes?: number;
  sampleIntervalMs?: number;
  logger?: CollectorLogger;
  now?: () => Date;
  /** Medição injetável para simular quotas e picos sem ocupar disco de verdade. */
  sampleDisk?: () => Promise<CollectorDiskUsage>;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function emptyUsage(): CollectorDiskUsage {
  return { totalBytes: 0, parquetBytes: 0, databaseBytes: 0, walBytes: 0, temporaryBytes: 0, otherBytes: 0, files: 0 };
}

/** Não segue links: uma pasta temporária não pode levar a contagem para outro volume. */
export async function measureCollectorDisk(directory: string): Promise<CollectorDiskUsage> {
  const usage = emptyUsage();
  const root = resolve(directory);
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      break;
    }
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      // O coletor e o DuckDB podem remover uma pasta enquanto ela é medida.
      if (isMissing(error)) {
        continue;
      }
      throw error;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      const path = join(current, entry.name);
      try {
        const info = await lstat(path);
        if (info.isSymbolicLink()) {
          continue;
        }
        if (info.isDirectory()) {
          pending.push(path);
          continue;
        }
        if (!info.isFile()) {
          continue;
        }
        // O tamanho lógico sozinho pode subestimar a alocação de arquivos pequenos.
        const bytes = Math.max(info.size, info.blocks * 512);
        const name = basename(path);
        usage.totalBytes += bytes;
        usage.files += 1;
        if (name.endsWith('.parquet')) {
          usage.parquetBytes += bytes;
        } else if (name.endsWith('.wal')) {
          usage.walBytes += bytes;
        } else if (name.endsWith('.duckdb')) {
          usage.databaseBytes += bytes;
        } else if (name.endsWith('.parcial') || name.endsWith('.tmp') || /(?:^|[\\/])tmp(?:-vencedores)?[\\/]/.test(relative(root, path))) {
          usage.temporaryBytes += bytes;
        } else {
          usage.otherBytes += bytes;
        }
      } catch (error) {
        if (!isMissing(error)) {
          throw error;
        }
      }
    }
  }
  return usage;
}

export class CollectorResourceLimitError extends Error {
  readonly reason = 'disk' as const;

  constructor(readonly phase: string, readonly usedBytes: number, readonly requiredBytes: number, readonly limitBytes: number) {
    super(`Espaço temporário insuficiente para ${phase}: ${usedBytes} bytes em uso, ${requiredBytes} bytes reservados, limite operacional de ${limitBytes} bytes`);
    this.name = 'CollectorResourceLimitError';
  }
}

/**
 * Orçamento de disco comum às etapas. A amostragem observa picos, mas a admissão
 * precisa também reservar saídas e limitar as operações: não é uma quota do SO.
 */
export class CollectorResourceBudget {
  readonly limitBytes: number;
  readonly publicationReserveBytes: number;
  private readonly sampleIntervalMs: number;
  private readonly sampleDisk: () => Promise<CollectorDiskUsage>;
  private peakBytes = 0;
  private measurements = 0;
  private measurementFailures = 0;
  private limitExceeded = false;
  private last: CollectorResourceSample | null = null;
  private measuring: Promise<CollectorDiskUsage> | null = null;

  constructor(private readonly options: CollectorResourceBudgetOptions) {
    this.limitBytes = options.limitBytes ?? COLLECTOR_DISK_LIMIT_BYTES;
    this.publicationReserveBytes = options.publicationReserveBytes ?? COLLECTOR_PUBLICATION_RESERVE_BYTES;
    this.sampleIntervalMs = options.sampleIntervalMs ?? 1000;
    if (![this.limitBytes, this.publicationReserveBytes, this.sampleIntervalMs].every((value) => Number.isFinite(value) && value >= 0) || this.limitBytes === 0 || this.sampleIntervalMs === 0) {
      throw new Error('Orçamento de recursos inválido');
    }
    this.sampleDisk = options.sampleDisk ?? (() => measureCollectorDisk(options.directory));
  }

  async sample(phase: string): Promise<CollectorResourceSample> {
    if (!this.measuring) {
      this.measuring = this.sampleDisk().finally(() => {
        this.measuring = null;
      });
    }
    try {
      const usage = await this.measuring;
      if (Object.values(usage).some((value) => !Number.isFinite(value) || value < 0)) {
        throw new Error('Medição de disco inválida');
      }
      const sample = { ...usage, phase, measuredAt: (this.options.now?.() ?? new Date()).toISOString() };
      this.measurements += 1;
      this.peakBytes = Math.max(this.peakBytes, usage.totalBytes);
      this.limitExceeded ||= usage.totalBytes > this.limitBytes;
      this.last = sample;
      return sample;
    } catch (error) {
      this.measurementFailures += 1;
      // Nenhum caminho ou conteúdo de arquivo entra no log de métricas.
      this.options.logger?.warn('Não foi possível medir o espaço temporário', { phase });
      throw error;
    }
  }

  async check(phase: string, additionalBytes = 0, reserveBytes = 0): Promise<CollectorResourceSample> {
    if (![additionalBytes, reserveBytes].every((value) => Number.isFinite(value) && value >= 0)) {
      throw new Error('Reserva de espaço temporário inválida');
    }
    const sample = await this.sample(phase);
    const requiredBytes = additionalBytes + reserveBytes;
    if (sample.totalBytes + requiredBytes > this.limitBytes) {
      throw new CollectorResourceLimitError(phase, sample.totalBytes, requiredBytes, this.limitBytes);
    }
    return sample;
  }

  async canContinue(additionalBytes = 0): Promise<boolean> {
    try {
      await this.check('novo bloco', additionalBytes, this.publicationReserveBytes);
      return true;
    } catch (error) {
      if (error instanceof CollectorResourceLimitError) {
        return false;
      }
      // Falha de medição não autoriza continuar com capacidade desconhecida.
      throw error;
    }
  }

  async availableTempBytes(): Promise<number> {
    const sample = await this.sample('reserva DuckDB');
    return Math.max(0, Math.floor(this.limitBytes - sample.totalBytes - this.publicationReserveBytes));
  }

  /** Mede também o interior de consultas longas; não deixa timers após sucesso ou falha. */
  async measure<T>(phase: string, work: () => Promise<T>): Promise<T> {
    await this.check(phase);
    let pending: Promise<void> | null = null;
    const timer = setInterval(() => {
      if (!pending) {
        pending = this.sample(phase).then(() => {}, () => {}).finally(() => {
          pending = null;
        });
      }
    }, this.sampleIntervalMs);
    timer.unref();
    try {
      return await work();
    } finally {
      clearInterval(timer);
      await pending;
      // Métricas no finally não devem esconder o erro original nem uma publicação concluída.
      await this.sample(phase).catch(() => undefined);
    }
  }

  summary(): CollectorResourceSummary {
    return {
      limitBytes: this.limitBytes,
      publicationReserveBytes: this.publicationReserveBytes,
      peakBytes: this.peakBytes,
      measurements: this.measurements,
      measurementFailures: this.measurementFailures,
      limitExceeded: this.limitExceeded,
      last: this.last ? { ...this.last } : null,
    };
  }
}
