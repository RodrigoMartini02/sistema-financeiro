import { postgresSearchFields } from '../contractStore/textSearch';
import { ContractStoreWriter, type PublishSummary } from '../contractStore/writer';
import type { ObjectStorage } from '../objectStorage';
import type { RunArchive } from './archive';
import { publishAndConfirm } from './blockTime';
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
      resourceBudget: context.resourceBudget,
    });
    return new RunContractStore(writer, context, tally);
  }

  /** O contrato mudou de vencimento: quem favoritou é avisado depois da publicação. */
  noteExpiryChange(change: ChangedContractExpiry): void {
    this.expiryChanges.set(change.controlNumber, change);
  }

  /** Uma manutenção local que falhou após o commit não desfaz a publicação, mas impede o próximo bloco. */
  get canContinue(): boolean {
    return this.writer.canContinue;
  }

  /** Brutos, armazém, progresso e avisos: nesta ordem, inclusive quando o bloco não contém contratos novos. */
  async publish(archive: RunArchive, afterCommit: () => Promise<void> = async () => {}): Promise<void> {
    let committed = false;
    let confirmationFailure: { error: unknown } | null = null;
    try {
      await publishAndConfirm(archive, () => this.writer.publish(), async (summary) => {
        committed = true;
        if (summary) {
          this.publications.push(summary);
          this.tally.details['publications'] = this.publications.map((publication) => ({ ...publication }));
        }
        await afterCommit();
      });
    } catch (error) {
      if (!committed) {
        throw error;
      }
      // Os contratos já são duráveis. Uma falha ao marcar progresso não deve impedir
      // os avisos: ao reler a fonte, o vencimento já estará igual e não gerará outro aviso.
      confirmationFailure = { error };
    }
    const changes = [...this.expiryChanges.values()];
    try {
      this.tally.notificationCount += await notifyChangedContractExpiry(this.context.db, changes);
      this.expiryChanges.clear();
    } catch (error) {
      if (confirmationFailure) {
        throw new AggregateError([confirmationFailure.error, error], 'Armazém publicado, mas houve falhas no progresso e nos avisos');
      }
      throw error;
    }
    if (confirmationFailure) {
      throw confirmationFailure.error;
    }
  }

  async close(): Promise<void> {
    await this.writer.close();
  }
}
