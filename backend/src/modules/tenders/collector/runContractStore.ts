import { postgresSearchFields } from '../contractStore/textSearch';
import { ContractStoreWriter, type PublishSummary } from '../contractStore/writer';
import type { ObjectStorage } from '../objectStorage';
import { CollectorConfigError } from './config';
import { notifyChangedContractExpiry, type ChangedContractExpiry } from './contractNotifications';
import type { CollectorContext, RunTally } from './runs';

// O armazém de contratos de uma execução do coletor, compartilhado pelas execuções do PNCP (contractRuns.ts) e dos
// contratos federais do Compras.gov.br (federalRuns.ts): as duas gravam no mesmo armazém e usam a mesma trava.

/** O R2 da coleta de contratos e de vencedores; sem ele (variáveis não definidas), a execução falha com o motivo. */
export function requireStorage(context: CollectorContext): ObjectStorage {
  if (!context.storage) {
    throw new CollectorConfigError(
      'Os contratos ficam no R2: defina TENDERS_ARCHIVE_ENDPOINT, TENDERS_ARCHIVE_BUCKET, TENDERS_ARCHIVE_ACCESS_KEY_ID, TENDERS_ARCHIVE_SECRET_ACCESS_KEY e TENDERS_STORAGE_PREFIX',
    );
  }
  return context.storage;
}

/**
 * O armazém de contratos de uma execução: o gravador (a cópia de trabalho e as
 * mudanças) e os vencimentos que mudaram, que esperam a publicação para virar
 * aviso. Um por execução, aberto no começo e fechado no fim.
 */
export class RunContractStore {
  private readonly expiryChanges = new Map<string, ChangedContractExpiry>();
  private hasPublished = false;
  readonly publications: PublishSummary[] = [];

  private constructor(
    readonly writer: ContractStoreWriter,
    private readonly context: CollectorContext,
    private readonly tally: RunTally,
  ) {}

  static async open(context: CollectorContext, tally: RunTally, runId: number, today: string): Promise<RunContractStore> {
    const writer = await ContractStoreWriter.open({
      storage: requireStorage(context),
      searchFields: postgresSearchFields(context.db),
      directory: context.contractWorkDirectory,
      version: runId,
      today,
      now: context.now,
      logger: context.logger,
    });
    return new RunContractStore(writer, context, tally);
  }

  /** O contrato mudou de vencimento: quem favoritou é avisado depois da publicação. */
  noteExpiryChange(change: ChangedContractExpiry): void {
    this.expiryChanges.set(change.controlNumber, change);
  }

  /**
   * Falso até a primeira publicação concluída. Uma execução que falha antes
   * disso não publicou o que leu, e quem decide até onde a próxima continua não
   * pode contar com isso.
   */
  get published(): boolean {
    return this.hasPublished;
  }

  /** Publica as mudanças (sem mudança, nada) e só então avisa quem favoritou os contratos que mudaram de vencimento. */
  async publish(): Promise<void> {
    const summary = await this.writer.publish();
    this.hasPublished = true;
    if (summary) {
      this.publications.push(summary);
      this.tally.details['publications'] = this.publications.map((publication) => ({ ...publication }));
    }
    const changes = [...this.expiryChanges.values()];
    this.expiryChanges.clear();
    this.tally.notificationCount += await notifyChangedContractExpiry(this.context.db, changes);
  }

  async close(): Promise<void> {
    await this.writer.close();
  }
}
