import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ArchiveSettings } from './config';
import { errorMessage, type CollectorLogger } from './logger';

// Arquivo bruto das coletas no Cloudflare R2 (plano
// .plans/licitacoes-base-nacional.md, parte 1): todos os contratos lidos, a
// resposta de cada consulta de termos e os editais novos ou alterados, em
// JSON Lines compactado. Cada execução grava as próprias partes, na pasta do
// dia da coleta. A falha no envio conta erro, e a coleta segue. Sem as
// variáveis do R2, o arquivo fica desligado.

const gzipAsync = promisify(gzip);

/** Conjuntos do arquivo: a fonte e o nome formam o começo da chave. */
export const ARCHIVE_DATASETS = {
  contracts: { source: 'pncp', name: 'contratos' },
  contractTerms: { source: 'pncp', name: 'contratos-termos' },
  notices: { source: 'pncp', name: 'editais' },
} as const;
export type ArchiveDataset = (typeof ARCHIVE_DATASETS)[keyof typeof ARCHIVE_DATASETS];

/** Tamanho bruto (antes de compactar) em que a parte é enviada e outra começa: limita a memória. */
export const ARCHIVE_PART_BYTES = 16 * 1024 * 1024;

/** Onde as partes vão: o R2 na execução real; nos testes, uma simulação. */
export interface ArchiveStorage {
  putObject(key: string, body: Uint8Array): Promise<void>;
  /** Fecha as conexões, no fim da execução do coletor. */
  close(): void;
}

const R2_CONNECTION_TIMEOUT_MS = 10_000;
const R2_REQUEST_TIMEOUT_MS = 120_000;

/** Cliente S3 do Cloudflare R2: região "auto", com o endpoint e as chaves da configuração. */
export function createR2Storage(settings: ArchiveSettings): ArchiveStorage {
  const client = new S3Client({
    region: 'auto',
    endpoint: settings.endpoint,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
    // Caminho /<bucket>/<chave>: o formato do endereço S3 que o painel do R2 mostra.
    forcePathStyle: true,
    // Checksum só quando a operação exige, como no SDK antes da 3.729: o padrão
    // novo manda checksums em todo envio, e nem todo serviço S3 compatível os aceita.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: {
      connectionTimeout: R2_CONNECTION_TIMEOUT_MS,
      requestTimeout: R2_REQUEST_TIMEOUT_MS,
      throwOnRequestTimeout: true,
    },
  });
  return {
    async putObject(key, body) {
      await client.send(new PutObjectCommand({ Bucket: settings.bucket, Key: key, Body: body, ContentType: 'application/gzip' }));
    },
    close: () => client.destroy(),
  };
}

/** Chave de uma parte: `<fonte>/<conjunto>/<AAAA>/<MM>/<DD>/<execução>-<parte>.jsonl.gz`, no dia da coleta. */
export function archiveKey(dataset: ArchiveDataset, day: string, runId: number, part: number): string {
  const [year, month, date] = day.split('-');
  return `${dataset.source}/${dataset.name}/${year}/${month}/${date}/${runId}-${String(part).padStart(4, '0')}.jsonl.gz`;
}

/** O arquivo da execução nos detalhes (`detalhes.archive`). */
export interface ArchiveSummary {
  enabled: boolean;
  /** Partes enviadas. */
  files: number;
  /** Linhas enviadas: registros e respostas de termos. */
  records: number;
  /** Tamanho compactado enviado. */
  bytes: number;
  /** Partes que falharam no envio; cada uma conta um erro na execução. */
  failures: number;
}

export interface RunArchiveOptions {
  /** null: arquivo desligado. */
  storage: ArchiveStorage | null;
  runId: number;
  /** Dia da coleta (AAAA-MM-DD, Brasília): a pasta das partes. */
  day: string;
  now: () => Date;
  logger: CollectorLogger;
  /** Parte não enviada: a execução conta o erro. */
  onFailure: (failure: { key: string; message: string }) => void;
  /** Tamanho da parte; sem ele, ARCHIVE_PART_BYTES. */
  partBytes?: number;
}

interface OpenPart {
  dataset: ArchiveDataset;
  /** Número da próxima parte a enviar (de 1 em diante). */
  part: number;
  lines: string[];
  bytes: number;
}

/**
 * Arquivo bruto de uma execução. Cada linha é `{ collectedAt, ...extra, record }`,
 * com o registro como veio do PNCP. As linhas de cada conjunto ficam na
 * memória até o tamanho da parte; aí a parte é compactada e enviada, e a
 * próxima começa. Parte que falha no envio é descartada.
 */
export class RunArchive {
  private readonly openParts = new Map<string, OpenPart>();
  private readonly totals = { files: 0, records: 0, bytes: 0, failures: 0 };
  private used = false;

  constructor(private readonly options: RunArchiveOptions) {}

  /** Acrescenta registros ao conjunto; a parte que encher é enviada. */
  async append(dataset: ArchiveDataset, records: readonly unknown[], extra: Record<string, string> = {}): Promise<void> {
    this.used = true;
    if (!this.options.storage || records.length === 0) {
      return;
    }
    const open = this.openPart(dataset);
    const collectedAt = this.options.now().toISOString();
    for (const record of records) {
      const line = `${JSON.stringify({ collectedAt, ...extra, record })}\n`;
      open.lines.push(line);
      open.bytes += Buffer.byteLength(line);
    }
    if (open.bytes >= (this.options.partBytes ?? ARCHIVE_PART_BYTES)) {
      await this.send(open);
    }
  }

  /** Envia as partes que ainda têm linhas: no fim da execução, inclusive quando ela falha. */
  async flush(): Promise<void> {
    for (const open of this.openParts.values()) {
      if (open.lines.length > 0) {
        await this.send(open);
      }
    }
  }

  /** Resumo para os detalhes; null se a execução não passou pelo arquivo. */
  summary(): ArchiveSummary | null {
    if (!this.used) {
      return null;
    }
    return { enabled: this.options.storage !== null, ...this.totals };
  }

  private openPart(dataset: ArchiveDataset): OpenPart {
    const id = `${dataset.source}/${dataset.name}`;
    let open = this.openParts.get(id);
    if (!open) {
      open = { dataset, part: 1, lines: [], bytes: 0 };
      this.openParts.set(id, open);
    }
    return open;
  }

  private async send(open: OpenPart): Promise<void> {
    const { storage, day, runId } = this.options;
    const key = archiveKey(open.dataset, day, runId, open.part);
    const lines = open.lines;
    open.part += 1;
    open.lines = [];
    open.bytes = 0;
    if (!storage) {
      return;
    }

    try {
      const body = await gzipAsync(Buffer.from(lines.join(''), 'utf8'));
      await storage.putObject(key, body);
      this.totals.files += 1;
      this.totals.records += lines.length;
      this.totals.bytes += body.length;
    } catch (error) {
      this.totals.failures += 1;
      this.options.logger.warn('Parte do arquivo bruto não enviada', { key, records: lines.length, error });
      this.options.onFailure({ key, message: errorMessage(error) });
    }
  }
}
