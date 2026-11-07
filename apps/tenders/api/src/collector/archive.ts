import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import type { ObjectStorage } from '../objectStorage';
import { errorMessage, type CollectorLogger } from './logger';

// Arquivo bruto das coletas no Cloudflare R2 (plano
// .plans/licitacoes-base-nacional.md, parte 1): todos os contratos lidos, a
// resposta de cada consulta de termos e os editais novos ou alterados, em
// JSON Lines compactado. Cada execução grava as próprias partes, na pasta do
// dia da coleta, dentro da pasta do ambiente (objectStorage.ts). A falha no
// envio conta erro, e a coleta segue. Sem as variáveis do R2, o arquivo fica
// desligado.

const gzipAsync = promisify(gzip);

/** Conjuntos do arquivo: a fonte e o nome formam o começo da chave. */
export const ARCHIVE_DATASETS = {
  contracts: { source: 'pncp', name: 'contratos' },
  contractTerms: { source: 'pncp', name: 'contratos-termos' },
  notices: { source: 'pncp', name: 'editais' },
  /** O JSON dos editais que estava no banco, exportado antes da migration 0088. */
  legacyNotices: { source: 'pncp', name: 'editais-legado' },
  /** Os resultados dos itens das licitações (Compras.gov.br), com o CPF mascarado antes de entrar (plano dos vencedores). */
  results: { source: 'comprasgov', name: 'resultados' },
  /** Os contratos federais (Compras.gov.br) que entraram ou mudaram, com o CPF mascarado (plano dos contratos federais). */
  federalContracts: { source: 'comprasgov', name: 'contratos' },
} as const;
export type ArchiveDataset = (typeof ARCHIVE_DATASETS)[keyof typeof ARCHIVE_DATASETS];

/** Tamanho bruto (antes de compactar) em que a parte é enviada e outra começa: limita a memória. */
export const ARCHIVE_PART_BYTES = 16 * 1024 * 1024;

/** Chave de uma parte, dentro da pasta do ambiente: `<fonte>/<conjunto>/<AAAA>/<MM>/<DD>/<execução>-<parte>.jsonl.gz`, no dia da coleta. */
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
  storage: ObjectStorage | null;
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
      await storage.putObject(key, body, 'application/gzip');
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
