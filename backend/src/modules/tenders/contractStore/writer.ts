import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import type { ContractTermSummary, TenderContractRow } from '../collector/contractMapping';
import type { CollectorLogger } from '../collector/logger';
import { addCalendarDays, brasiliaDate } from '../collector/dates';
import type { CollectorResourceBudget } from '../collector/resourceBudget';
import type { ObjectStorage } from '../objectStorage';
import { openDuckDb, parquetList, sqlLiteral, toDuckDbPath } from './duckdb';
import {
  CONTRACT_DATASETS,
  FILES_FOLDER,
  MANIFEST_KEY,
  MAX_ROWS_PER_FILE,
  PARQUET_CONTENT_TYPE,
  ROW_GROUP_SIZE,
  PART_KEY,
  ROW_ORDER,
  SLICE_PARTITION,
  activeBandExpression,
  columnDefinitions,
  columnList,
  columnsOf,
  storeFileKey,
  toStoreRecord,
  type SlicedDataset,
  type StoreDataset,
  type StoredContract,
} from './layout';
import { downloadManifestFiles, localPath, removeUnusedLocalFiles } from './localCopy';
import { datasetFiles, manifestFiles, readManifest, serializeManifest, type ManifestFile, type StoreManifest } from './manifest';
import type { ContractSearchFieldsProvider } from './textSearch';

// Gravação do armazém de contratos (plano .plans/licitacoes-contratos-no-r2.md,
// Parte R1), usada pelo Cron Job, um gravador por vez (a trava dos contratos):
//   1. abre: baixa o manifesto e os arquivos em uso para a cópia de trabalho;
//   2. durante a coleta: as mudanças ficam na tabela `mudancas` do DuckDB, e o
//      estado anterior de cada contrato sai dela ou dos arquivos;
//   3. publica: regrava só as partes dos conjuntos com contrato novo ou
//      mudado, refaz os vigentes, envia os arquivos novos e por último o
//      manifesto; depois apaga do bucket o que nenhum dos dois últimos
//      manifestos usa (quem lê pode estar na versão anterior).
// Falha no envio interrompe a publicação antes do manifesto: a versão em uso
// não muda, e os arquivos que sobraram são apagados na publicação seguinte.

const WORK_DATABASE = 'trabalho.duckdb';
// Medido na importação dos 351 mil contratos locais: com partes de até 30 mil
// linhas, a gravação cabe em 160 MB, e o Cron Job (512 MB) fica com folga para o Node.
const DEFAULT_MEMORY_LIMIT_MB = 160;
const DEFAULT_THREADS = 1;

export interface ContractStoreWriterOptions {
  storage: ObjectStorage;
  searchFields: ContractSearchFieldsProvider;
  /** Pasta da cópia de trabalho: os arquivos em uso e o banco do DuckDB. */
  directory: string;
  /** Id da execução que publica: entra no nome dos arquivos e no manifesto. */
  version: number;
  /** Dia (AAAA-MM-DD, Brasília) a partir do qual os contratos são vigentes. */
  today: string;
  now: () => Date;
  logger: CollectorLogger;
  memoryLimitMb?: number;
  threads?: number;
  /** Linhas por arquivo; sem ele, MAX_ROWS_PER_FILE (os testes usam limites pequenos). */
  maxRowsPerFile?: Partial<Record<StoreDataset, number>>;
  resourceBudget?: CollectorResourceBudget;
}

/** O que a coleta precisa saber de um contrato já gravado. */
export interface ContractStoreState {
  amendments: ContractTermSummary[] | null;
  /** Atualização global da última conferência dos termos, no formato do PNCP (19 caracteres). */
  amendmentsReference: string | null;
  /** null: sem vencimento. */
  expiresOn: string | null;
  payloadHash: string;
  firstCollectedAt: string;
  /** Data e hora de publicação (a inclusão, nos federais) no formato do PNCP, como gravada; null se vazia. */
  publishedAt: string | null;
}

export interface ContractUpsertResult {
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
  /** As chaves dos contratos novos e alterados (o resto não foi regravado): as execuções arquivam só estes. */
  changedKeys: ReadonlySet<string>;
}

export interface PublishSummary {
  revision: string;
  changedContracts: number;
  filesWritten: number;
  bytesWritten: number;
  filesDeleted: number;
  totals: StoreManifest['totals'];
}

/** O que a reconsulta dos termos precisa de um contrato com termos pendentes. */
export interface PendingTermsContract {
  pncpControlNumber: string;
  agencyCnpj: string;
  contractYear: number;
  contractSequence: number;
  contractObject: string;
  originalTermEnd: string | null;
  expiresOn: string | null;
}

/** Resultado da reconsulta de um contrato: o vencimento e os termos conferidos. */
export interface CheckedContractTerms {
  pncpControlNumber: string;
  expiresOn: string | null;
  amendments: ContractTermSummary[];
}

interface StateRow {
  numero_controle_pncp: string;
  vencimento: string | null;
  aditivos: string | null;
  aditivos_referencia: string | null;
  hash_payload: string;
  primeira_coleta_em: string;
  data_publicacao_pncp: string | null;
}

/** Faixa de uma parte: de `from` (inclusive) até `to` (exclusive; null = até o fim do ano). */
interface SliceRange {
  partition: string;
  from: string;
  to: string | null;
  file: ManifestFile | null;
}

interface WrittenFile extends ManifestFile {
  localPath: string;
}

/** Contratos federais conferidos contra o PNCP por consulta (cada um vira uma linha de VALUES). */
const TWIN_BATCH_SIZE = 2_000;

/**
 * O número do contrato para comparar federal e PNCP: sem o "/AAAA" do fim, só os dígitos e sem zeros à esquerda
 * ("00586/2023" e "586" dão "586"; "2026NE000096" dá "2026000096"). Vazio: sem número comparável.
 */
export function twinNumber(contractNumber: string | null): string {
  return (contractNumber ?? '').trim().replace(/\/\d{4}$/, '').replace(/\D/g, '').replace(/^0+/, '');
}

/** Mesma regra da antiga gravação no Postgres: só muda com outro JSON, outro vencimento ou outra conferência dos termos. */
function isUnchanged(previous: ContractStoreState, row: TenderContractRow): boolean {
  return (
    previous.payloadHash === row.payloadHash &&
    previous.expiresOn === (row.expiresOn ?? null) &&
    previous.amendmentsReference === (row.amendmentsReference?.slice(0, 19) ?? null)
  );
}

function jsonColumns(dataset: StoreDataset): string {
  return `{${columnsOf(dataset)
    .map((spec) => `${spec.column}: ${sqlLiteral(spec.type)}`)
    .join(', ')}}`;
}

const parquetOptions = `FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE ${ROW_GROUP_SIZE}`;

// Termos pendentes: contrato com sinal de alteração (a atualização global mais
// de 24 h depois da publicação, como hasChangeSignal em contractMapping.ts) cujos
// termos não foram conferidos para a atualização global atual. Sobra quando o
// PNCP falhou nos termos, na coleta diária ou na carga. As datas do PNCP são
// texto (AAAA-MM-DDTHH:mm:ss...), e só os 19 primeiros caracteres contam.
const PENDING_TERMS_COLUMNS =
  'numero_controle_pncp, orgao_cnpj, ano_contrato, sequencial_contrato, objeto, vigencia_fim_original, vencimento, data_atualizacao_global, data_publicacao_pncp, aditivos_referencia';
const PENDING_TERMS_CONDITION = `data_atualizacao_global IS NOT NULL
  AND date_diff('second', try_cast(left(data_publicacao_pncp, 19) AS TIMESTAMP), try_cast(left(data_atualizacao_global, 19) AS TIMESTAMP)) > 86400
  AND aditivos_referencia IS DISTINCT FROM left(data_atualizacao_global, 19)`;

export class ContractStoreWriter {
  private publishCount = 0;
  private sequence = 0;
  private workReady = true;
  private closed = false;
  private publishing = false;
  private readonly openedOn: string;

  private constructor(
    private readonly options: ContractStoreWriterOptions,
    private instance: DuckDBInstance,
    private connection: DuckDBConnection,
    private manifest: StoreManifest | null,
  ) {
    this.openedOn = brasiliaDate(options.now());
  }

  /** Uma publicação pode estar confirmada mesmo se a manutenção local impedir outro bloco. */
  get canContinue(): boolean {
    return this.workReady && !this.closed;
  }

  private assertWorkReady(): void {
    if (!this.canContinue) {
      throw new Error('O armazém foi publicado, mas a cópia de trabalho precisa ser reaberta antes de continuar');
    }
  }

  private async prepareWork(phase: string, additionalBytes = 0): Promise<void> {
    if (!this.options.resourceBudget) {
      return;
    }
    const reserve = this.publishing ? 0 : this.options.resourceBudget.publicationReserveBytes;
    const sample = await this.options.resourceBudget.check(phase, additionalBytes, reserve);
    // A medição pode abranger outros temporários do contêiner; não somá-los
    // ao teto deste DuckDB. Usar só a folga restante é conservador também
    // quando uma consulta anterior ainda mantém um arquivo de spill aberto.
    const available = this.options.resourceBudget.limitBytes - sample.totalBytes - additionalBytes - reserve;
    await this.connection.run(`SET max_temp_directory_size = ${sqlLiteral(`${Math.max(1, Math.floor(available))}B`)}`);
  }

  private static async clearWorkFiles(directory: string): Promise<void> {
    const root = resolve(directory);
    const temporary = resolve(root, 'tmp');
    if (dirname(temporary) !== root) {
      throw new Error('Diretório temporário do gravador fora da pasta de trabalho');
    }
    const databasePath = join(root, WORK_DATABASE);
    await rm(databasePath, { force: true });
    await rm(`${databasePath}.wal`, { force: true });
    await rm(temporary, { recursive: true, force: true });
  }

  private static async openWorkDatabase(options: ContractStoreWriterOptions) {
    const opened = await openDuckDb({
      path: join(options.directory, WORK_DATABASE),
      memoryLimitMb: options.memoryLimitMb ?? DEFAULT_MEMORY_LIMIT_MB,
      threads: options.threads ?? DEFAULT_THREADS,
      tempDirectory: join(options.directory, 'tmp'),
      maxTempDirectoryBytes: await options.resourceBudget?.availableTempBytes(),
    });
    try {
      await opened.connection.run(`CREATE TABLE mudancas (${columnDefinitions('contratos')}, PRIMARY KEY (numero_controle_pncp))`);
      await opened.connection.run(`CREATE TABLE vazio (${columnDefinitions('contratos')})`);
      return opened;
    } catch (error) {
      opened.connection.closeSync();
      opened.instance.closeSync();
      throw error;
    }
  }

  static async open(options: ContractStoreWriterOptions): Promise<ContractStoreWriter> {
    await mkdir(options.directory, { recursive: true });
    const manifest = await readManifest(options.storage);
    await ContractStoreWriter.clearWorkFiles(options.directory);
    // Sem conexões locais abertas e sob a trava do coletor: sobras de uma
    // execução interrompida não podem bloquear a admissão da cópia válida.
    await removeUnusedLocalFiles(options.directory, [manifest]);
    // Só os conjuntos de contratos: os vencedores são de outro gravador e não passam por aqui.
    const downloaded = await downloadManifestFiles(options.storage, manifest, options.directory, CONTRACT_DATASETS, options.resourceBudget);
    options.logger.info('Cópia de trabalho do armazém de contratos pronta', {
      revision: manifest?.revision ?? null,
      files: manifestFiles(manifest, CONTRACT_DATASETS).length,
      downloaded,
    });

    const { instance, connection } = await ContractStoreWriter.openWorkDatabase(options);
    const writer = new ContractStoreWriter(options, instance, connection, manifest);
    try {
      await writer.refreshCurrentView();
      return writer;
    } catch (error) {
      await writer.close().catch((cleanupError: unknown) => {
        options.logger.warn('Falha ao fechar cópia de trabalho que não pôde ser aberta', { error: cleanupError });
      });
      throw error;
    }
  }

  /** O manifesto em uso (o publicado por último). */
  get currentManifest(): StoreManifest | null {
    return this.manifest;
  }

  /** Contratos novos ou mudados ainda não publicados. */
  async pendingChanges(): Promise<number> {
    this.assertWorkReady();
    const result = await this.connection.runAndReadAll('SELECT count(*)::INTEGER FROM mudancas');
    return Number(result.getRows()[0]?.[0] ?? 0);
  }

  /** Estado já gravado dos contratos, numa consulta só: das mudanças da execução ou dos arquivos. */
  async readStates(controlNumbers: readonly string[]): Promise<Map<string, ContractStoreState>> {
    this.assertWorkReady();
    const unique = [...new Set(controlNumbers)];
    if (unique.length === 0) {
      return new Map();
    }
    const list = unique.map(sqlLiteral).join(', ');
    const columns = 'numero_controle_pncp, vencimento, aditivos, aditivos_referencia, hash_payload, primeira_coleta_em, data_publicacao_pncp';
    const result = await this.connection.runAndReadAll(`
      SELECT ${columns} FROM mudancas WHERE numero_controle_pncp IN (${list})
      UNION ALL
      SELECT ${columns} FROM atual_contratos
       WHERE numero_controle_pncp IN (${list})
         AND numero_controle_pncp NOT IN (SELECT numero_controle_pncp FROM mudancas)`);
    const states = new Map<string, ContractStoreState>();
    for (const row of result.getRowObjectsJson() as unknown as StateRow[]) {
      states.set(row.numero_controle_pncp, {
        amendments: row.aditivos === null ? null : (JSON.parse(row.aditivos) as ContractTermSummary[]),
        amendmentsReference: row.aditivos_referencia,
        expiresOn: row.vencimento,
        payloadHash: row.hash_payload,
        firstCollectedAt: row.primeira_coleta_em,
        publishedAt: row.data_publicacao_pncp,
      });
    }
    return states;
  }

  /**
   * Dos contratos federais dados (do Compras.gov.br), as chaves dos que já existem no armazém como contrato do PNCP: o
   * mesmo órgão, ano, fornecedor e número, sem o "/AAAA" do fim e sem zeros à esquerda (no empenho, o número inteiro,
   * sem as letras). A fonte federal deixa de ligar ao número do PNCP contratos que o PNCP tem (medido na UFMG em
   * 26/10/2026: 5% dos federais, todos empenhos de 2026); entrar duas vezes dobraria a contagem e as buscas. Só olha o que
   * já está publicado ou gravado na execução, e só contratos do PNCP (a chave do federal começa por `comprasgov-`).
   */
  async findPncpTwins(rows: readonly TenderContractRow[]): Promise<Set<string>> {
    this.assertWorkReady();
    const twins = new Set<string>();
    const candidates = rows
      .map((row) => ({ row, number: twinNumber(row.contractNumber) }))
      .filter((candidate) => candidate.number !== '');
    for (let start = 0; start < candidates.length; start += TWIN_BATCH_SIZE) {
      const batch = candidates.slice(start, start + TWIN_BATCH_SIZE);
      const values = batch
        .map(
          ({ row, number }) =>
            `(${sqlLiteral(row.pncpControlNumber)}, ${sqlLiteral(row.agencyCnpj)}, ${Math.trunc(row.contractYear)}, ${row.supplierDocument === null ? 'NULL' : sqlLiteral(row.supplierDocument)}, ${sqlLiteral(number)})`,
        )
        .join(', ');
      const years = [...new Set(batch.map(({ row }) => Math.trunc(row.contractYear)))].join(', ');
      const cnpjs = [...new Set(batch.map(({ row }) => row.agencyCnpj))].map(sqlLiteral).join(', ');
      const result = await this.connection.runAndReadAll(`
        WITH f(chave, cnpj, ano, doc, numero) AS (VALUES ${values}),
             p AS (
               SELECT orgao_cnpj, ano_contrato, fornecedor_documento,
                      ltrim(regexp_replace(regexp_replace(trim(coalesce(numero_contrato, '')), '/[0-9]{4}$', ''), '[^0-9]', '', 'g'), '0') AS numero
                 FROM ${this.currentRows('numero_controle_pncp, orgao_cnpj, ano_contrato, fornecedor_documento, numero_contrato')}
                WHERE ano_contrato IN (${years}) AND orgao_cnpj IN (${cnpjs}) AND numero_controle_pncp NOT LIKE 'comprasgov-%')
        SELECT f.chave FROM f
         WHERE EXISTS (SELECT 1 FROM p WHERE p.orgao_cnpj = f.cnpj AND p.ano_contrato = f.ano AND p.numero = f.numero
                         AND p.fornecedor_documento IS NOT DISTINCT FROM f.doc)`);
      for (const row of result.getRowObjectsJson()) {
        twins.add(String(row['chave']));
      }
    }
    return twins;
  }

  /** Os contratos como estão agora: das mudanças da execução, ou dos arquivos quando não mudaram. */
  private currentRows(columns: string): string {
    return `(SELECT ${columns} FROM mudancas
             UNION ALL
             SELECT ${columns} FROM atual_contratos WHERE numero_controle_pncp NOT IN (SELECT numero_controle_pncp FROM mudancas))`;
  }

  /** Total de contratos com termos pendentes (para os detalhes da reconsulta). */
  async countPendingTerms(): Promise<number> {
    this.assertWorkReady();
    const result = await this.connection.runAndReadAll(
      `SELECT count(*)::INTEGER FROM ${this.currentRows(PENDING_TERMS_COLUMNS)} WHERE ${PENDING_TERMS_CONDITION}`,
    );
    return Number(result.getRows()[0]?.[0] ?? 0);
  }

  /**
   * Contratos com termos pendentes, da atualização global mais antiga para a
   * mais nova, menos os indicados (os que falharam na própria execução: esses
   * voltam no dia seguinte).
   */
  async readPendingTerms(limit: number, excludedControlNumbers: readonly string[]): Promise<PendingTermsContract[]> {
    this.assertWorkReady();
    const notExcluded =
      excludedControlNumbers.length > 0 ? `AND numero_controle_pncp NOT IN (${excludedControlNumbers.map(sqlLiteral).join(', ')})` : '';
    const result = await this.connection.runAndReadAll(`
      SELECT numero_controle_pncp, orgao_cnpj, ano_contrato, sequencial_contrato, objeto, vigencia_fim_original, vencimento
        FROM ${this.currentRows(PENDING_TERMS_COLUMNS)}
       WHERE ${PENDING_TERMS_CONDITION} ${notExcluded}
       ORDER BY left(data_atualizacao_global, 19), numero_controle_pncp
       LIMIT ${Math.trunc(limit)}`);
    return result.getRowObjectsJson().map((row) => ({
      pncpControlNumber: String(row['numero_controle_pncp']),
      agencyCnpj: String(row['orgao_cnpj']),
      contractYear: Number(row['ano_contrato']),
      contractSequence: Number(row['sequencial_contrato']),
      contractObject: String(row['objeto']),
      originalTermEnd: row['vigencia_fim_original'] === null ? null : String(row['vigencia_fim_original']),
      expiresOn: row['vencimento'] === null ? null : String(row['vencimento']),
    }));
  }

  /**
   * Grava a reconsulta dos termos nas mudanças da execução: o vencimento, os
   * termos e a conferência, que passa a ser a atualização global atual do
   * contrato. O resto do contrato (inclusive os campos de busca) fica como está.
   * São no máximo os contratos de uma reconsulta.
   */
  async saveCheckedTerms(checked: readonly CheckedContractTerms[]): Promise<void> {
    this.assertWorkReady();
    if (checked.length === 0) {
      return;
    }
    const path = join(this.options.directory, 'termos.ndjson');
    const body = checked.map((item) =>
      JSON.stringify({ numero_controle_pncp: item.pncpControlNumber, vencimento: item.expiresOn, aditivos: JSON.stringify(item.amendments) }),
    ).join('\n');
    await this.prepareWork('contract-terms-json', Buffer.byteLength(body, 'utf8') * 3);
    await writeFile(path, body, 'utf8');
    const replaced: Record<string, string> = {
      vencimento: 't.vencimento',
      aditivos: 't.aditivos',
      aditivos_referencia: 'left(b.data_atualizacao_global, 19)',
    };
    const select = columnsOf('contratos')
      .map((spec) => `${replaced[spec.column] ?? `b.${spec.column}`} AS ${spec.column}`)
      .join(', ');
    try {
      await this.prepareWork('contract-terms-apply', Buffer.byteLength(body, 'utf8') * 2);
      // Tabela temporária antes de gravar: a leitura e a gravação não se misturam na mesma tabela.
      await this.connection.run(`
        CREATE OR REPLACE TEMP TABLE termos_atualizados AS
        SELECT ${select}
          FROM ${this.currentRows(columnList('contratos'))} b
          JOIN read_json(${sqlLiteral(toDuckDbPath(path))}, format = 'newline_delimited',
                 columns = {numero_controle_pncp: 'VARCHAR', vencimento: 'DATE', aditivos: 'VARCHAR'}) t
            ON t.numero_controle_pncp = b.numero_controle_pncp`);
      await this.connection.run(`INSERT OR REPLACE INTO mudancas SELECT ${columnList('contratos')} FROM termos_atualizados`);
    } finally {
      await rm(path, { force: true });
      await this.connection.run('DROP TABLE IF EXISTS termos_atualizados');
    }
  }

  /**
   * Grava uma página de contratos nas mudanças da execução: novo entra;
   * existente com outro JSON, outro vencimento ou outra conferência dos termos
   * é regravado; igual não muda nada (nem a data da última coleta, para não
   * regravar arquivos sem necessidade). Os campos de busca vêm do Postgres.
   */
  async upsert(rows: readonly TenderContractRow[]): Promise<ContractUpsertResult> {
    this.assertWorkReady();
    // O mesmo contrato duas vezes na página: fica o último.
    const unique = [...new Map(rows.map((row) => [row.pncpControlNumber, row])).values()];
    if (unique.length === 0) {
      return { insertedCount: 0, updatedCount: 0, unchangedCount: 0, changedKeys: new Set() };
    }
    const states = await this.readStates(unique.map((row) => row.pncpControlNumber));
    const now = this.options.now().toISOString();
    const changed: StoredContract[] = [];
    let insertedCount = 0;
    for (const row of unique) {
      const previous = states.get(row.pncpControlNumber);
      if (!previous) {
        insertedCount += 1;
        changed.push({ ...row, firstCollectedAt: now, lastCollectedAt: now });
      } else if (!isUnchanged(previous, row)) {
        changed.push({ ...row, firstCollectedAt: previous.firstCollectedAt, lastCollectedAt: now });
      }
    }
    if (changed.length > 0) {
      const searchFields = await this.options.searchFields.computeSearchFields(changed);
      await this.insertChanges(changed.map((contract, index) => {
        const fields = searchFields[index];
        if (!fields) {
          throw new Error('Campos de busca faltando para um contrato da página');
        }
        return toStoreRecord(contract, fields);
      }));
    }
    const updatedCount = changed.length - insertedCount;
    return {
      insertedCount,
      updatedCount,
      unchangedCount: unique.length - changed.length,
      changedKeys: new Set(changed.map((contract) => contract.pncpControlNumber)),
    };
  }

  /**
   * Publica as mudanças: as partes afetadas de contratos e fornecedor, os
   * vigentes afetados, os arquivos novos e o manifesto. Mudança de dia também
   * publica, mesmo sem contratos alterados. O banco de trabalho é renovado
   * depois do manifesto, evitando acumular espaço entre publicações.
   */
  async publish(): Promise<PublishSummary | null> {
    this.assertWorkReady();
    this.publishing = true;
    try {
      if (this.options.resourceBudget) {
        return await this.options.resourceBudget.measure('contract-publication', () => this.publishChanges());
      }
      return await this.publishChanges();
    } finally {
      this.publishing = false;
    }
  }

  private publicationDay(): string {
    // `today` também é usado nos testes e nos reparos. Avança apenas os dias
    // de calendário decorridos desde a abertura, sem substituir essa referência.
    const elapsedDays = Math.round((Date.parse(brasiliaDate(this.options.now())) - Date.parse(this.openedOn)) / 86_400_000);
    return addCalendarDays(this.options.today, elapsedDays);
  }

  private async publishChanges(): Promise<PublishSummary | null> {
    const changedContracts = await this.pendingChanges();
    const day = this.publicationDay();
    if (changedContracts === 0 && (!this.manifest || this.manifest.today === day)) {
      return null;
    }
    await this.options.resourceBudget?.check('contract-publication');
    this.publishCount += 1;
    this.sequence = 0;
    const revision = `${this.options.version}.${this.publishCount}`;
    const written: WrittenFile[] = [];

    // Onde os contratos mudados estavam antes: a parte antiga também é regravada sem eles.
    await this.prepareWork('contract-old-keys');
    await this.connection.run(`
      CREATE OR REPLACE TEMP TABLE antigos AS
      SELECT ${SLICE_PARTITION} AS particao, ${PART_KEY.contratos} AS chave_contratos, ${PART_KEY.fornecedor} AS chave_fornecedor
        FROM atual_contratos
       WHERE numero_controle_pncp IN (SELECT numero_controle_pncp FROM mudancas)`);

    const contratos = await this.rewriteSlicedDataset('contratos', revision, written);
    const fornecedor = await this.rewriteSlicedDataset('fornecedor', revision, written);
    const { vigentes, totals } = await this.rewriteActiveDataset(revision, written, day);

    for (const file of written) {
      await this.options.resourceBudget?.check('contract-upload');
      await this.options.storage.putObject(file.path, await readFile(file.localPath), PARQUET_CONTENT_TYPE);
    }
    const next: StoreManifest = {
      format: 1,
      revision,
      publishedAt: this.options.now().toISOString(),
      today: day,
      totals,
      // Os vencedores seguem como estavam: sem esta linha, a publicação de contratos os apagaria do manifesto e,
      // na limpeza, do bucket (plano .plans/licitacoes-vencedores.md).
      datasets: { vigentes, contratos, fornecedor, vencedores: this.manifest?.datasets.vencedores ?? [] },
    };
    await this.options.storage.putObject(MANIFEST_KEY, serializeManifest(next), 'application/json');

    const previous = this.manifest;
    this.manifest = next;
    // O manifesto é o ponto de confirmação. Falhas posteriores não tornam
    // a publicação inexistente e não podem impedir a confirmação do seu bloco.
    try {
      this.workReady = false;
      this.connection.closeSync();
      this.instance.closeSync();
      await ContractStoreWriter.clearWorkFiles(this.options.directory);
      const opened = await ContractStoreWriter.openWorkDatabase(this.options);
      this.instance = opened.instance;
      this.connection = opened.connection;
      this.workReady = true;
      await this.refreshCurrentView();
    } catch (error) {
      if (this.workReady) {
        this.workReady = false;
        this.connection.closeSync();
        this.instance.closeSync();
      }
      this.options.logger.warn('Armazém publicado; a cópia de trabalho não pôde ser reaberta', { revision, error });
    }
    let filesDeleted = 0;
    try {
      filesDeleted = await this.removeUnusedRemoteFiles([previous, next]);
    } catch (error) {
      this.options.logger.warn('Armazém publicado; limpeza remota adiada', { revision, error });
    }
    await this.removeUnusedLocalCopies(next);

    const summary: PublishSummary = {
      revision,
      changedContracts,
      filesWritten: written.length,
      bytesWritten: written.reduce((total, file) => total + file.bytes, 0),
      filesDeleted,
      totals,
    };
    this.options.logger.info('Armazém de contratos publicado', { ...summary });
    return summary;
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.workReady) {
      this.workReady = false;
      this.connection.closeSync();
      this.instance.closeSync();
    }
    await ContractStoreWriter.clearWorkFiles(this.options.directory);
  }

  private async refreshCurrentView(): Promise<void> {
    const files = datasetFiles(this.manifest, 'contratos').map((file) => localPath(this.options.directory, file.path));
    const source = files.length > 0 ? `read_parquet(${parquetList(files)}, union_by_name = true)` : 'vazio';
    await this.connection.run(`CREATE OR REPLACE VIEW atual_contratos AS SELECT ${columnList('contratos')} FROM ${source}`);
  }

  private async insertChanges(records: Record<string, unknown>[]): Promise<void> {
    const path = join(this.options.directory, 'pagina.ndjson');
    const body = records.map((record) => JSON.stringify(record)).join('\n');
    const bytes = Buffer.byteLength(body, 'utf8');
    await this.prepareWork('contract-page-json', bytes * 3);
    await writeFile(path, body, 'utf8');
    try {
      await this.prepareWork('contract-page-apply', bytes * 2);
      await this.connection.run(`
        INSERT OR REPLACE INTO mudancas
        SELECT ${columnList('contratos')}
          FROM read_json(${sqlLiteral(toDuckDbPath(path))}, format = 'newline_delimited', columns = ${jsonColumns('contratos')})`);
    } finally {
      await rm(path, { force: true });
    }
  }

  /** Grava um arquivo do conjunto com as linhas de `source` na faixa, e devolve a entrada do manifesto. */
  private async writeFile(
    dataset: StoreDataset,
    partition: string,
    revision: string,
    from: string,
    selectSql: string,
    written: WrittenFile[],
  ): Promise<WrittenFile> {
    this.sequence += 1;
    const key = storeFileKey(dataset, partition, revision, this.sequence);
    const path = localPath(this.options.directory, key);
    await mkdir(dirname(path), { recursive: true });
    const largestFile = Math.max(0, ...manifestFiles(this.manifest, [dataset]).map((file) => file.bytes));
    await this.prepareWork('contract-parquet', Math.max(8_000_000, largestFile * 2));
    await this.connection.run(`COPY (${selectSql} ORDER BY ${ROW_ORDER[dataset]}) TO ${sqlLiteral(toDuckDbPath(path))} (${parquetOptions})`);
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

  /** As faixas atuais do conjunto, por ano, em ordem. */
  private sliceRanges(dataset: StoreDataset): Map<string, SliceRange[]> {
    const byPartition = new Map<string, ManifestFile[]>();
    for (const file of datasetFiles(this.manifest, dataset)) {
      byPartition.set(file.partition, [...(byPartition.get(file.partition) ?? []), file]);
    }
    const ranges = new Map<string, SliceRange[]>();
    for (const [partition, files] of byPartition) {
      const sorted = [...files].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
      ranges.set(
        partition,
        sorted.map((file, index) => ({ partition, from: index === 0 ? '' : file.from, to: sorted[index + 1]?.from ?? null, file })),
      );
    }
    return ranges;
  }

  /**
   * Regrava as partes de contratos ou fornecedor que têm contrato mudado
   * (onde ele está agora ou onde estava antes), e cria os anos novos. Parte
   * que passa do limite de linhas é dividida em faixas de tamanho parecido.
   */
  private async rewriteSlicedDataset(dataset: SlicedDataset, revision: string, written: WrittenFile[]): Promise<ManifestFile[]> {
    const key = PART_KEY[dataset];
    const oldKey = dataset === 'contratos' ? 'chave_contratos' : 'chave_fornecedor';
    const ranges = this.sliceRanges(dataset);
    const rangeRows = [...ranges.values()].flat();

    const affected = new Set<SliceRange>();
    if (rangeRows.length > 0) {
      const values = rangeRows
        .map((range, index) => `(${index}, ${sqlLiteral(range.partition)}, ${sqlLiteral(range.from)}, ${range.to === null ? 'NULL' : sqlLiteral(range.to)})`)
        .join(', ');
      const hits = await this.connection.runAndReadAll(`
        WITH faixas(indice, particao, inicio, fim) AS (VALUES ${values}),
             chaves AS (SELECT ${SLICE_PARTITION} AS particao, ${key} AS chave FROM mudancas
                        UNION ALL SELECT particao, ${oldKey} FROM antigos)
        SELECT DISTINCT f.indice
          FROM faixas f JOIN chaves c
            ON c.particao = f.particao AND c.chave >= f.inicio AND (f.fim IS NULL OR c.chave < f.fim)`);
      for (const [index] of hits.getRows()) {
        const range = rangeRows[Number(index)];
        if (range) {
          affected.add(range);
        }
      }
    }
    const known = [...ranges.keys()];
    const newPartitions = await this.connection.runAndReadAll(`
      SELECT DISTINCT ${SLICE_PARTITION} FROM mudancas
       ${known.length > 0 ? `WHERE ${SLICE_PARTITION} NOT IN (${known.map(sqlLiteral).join(', ')})` : ''}`);
    for (const [partition] of newPartitions.getRows()) {
      affected.add({ partition: String(partition), from: '', to: null, file: null });
    }

    const kept = rangeRows.filter((range) => !affected.has(range)).map((range) => range.file);
    const rewritten: ManifestFile[] = [];
    const columns = columnList(dataset);
    for (const range of affected) {
      const bounds = [`${key} >= ${sqlLiteral(range.from)}`, ...(range.to === null ? [] : [`${key} < ${sqlLiteral(range.to)}`])].join(' AND ');
      const sources = [
        ...(range.file
          ? [`SELECT ${columns} FROM read_parquet(${sqlLiteral(toDuckDbPath(localPath(this.options.directory, range.file.path)))}, union_by_name = true)
               WHERE numero_controle_pncp NOT IN (SELECT numero_controle_pncp FROM mudancas)`]
          : []),
        `SELECT ${columns} FROM mudancas WHERE ${SLICE_PARTITION} = ${sqlLiteral(range.partition)} AND ${bounds}`,
      ];
      await this.connection.run(`CREATE OR REPLACE TEMP VIEW combinado AS ${sources.join(' UNION ALL BY NAME ')}`);
      rewritten.push(...(await this.writeParts(dataset, range.partition, revision, 'combinado', range.from, written)));
    }

    return this.normalizedSlices([...kept.filter((file): file is ManifestFile => file !== null), ...rewritten]);
  }

  /**
   * Grava as linhas de `source` (uma visão ou tabela) em arquivos de até o
   * limite de linhas do conjunto, divididos pela chave das partes em faixas de
   * tamanho parecido: uma faixa nova a cada `size` linhas na ordem da chave. Só
   * a coluna da chave é ordenada para achar os limites, e cada arquivo ordena
   * só as suas linhas: a memória fica limitada pelo tamanho da parte.
   */
  private async writeParts(
    dataset: StoreDataset,
    partition: string,
    revision: string,
    source: string,
    firstFrom: string,
    written: WrittenFile[],
  ): Promise<ManifestFile[]> {
    await this.prepareWork('contract-part-boundaries');
    const key = PART_KEY[dataset];
    const total = Number((await this.connection.runAndReadAll(`SELECT count(*)::INTEGER FROM ${source}`)).getRows()[0]?.[0] ?? 0);
    if (total === 0) {
      return [];
    }
    const parts = Math.ceil(total / (this.options.maxRowsPerFile?.[dataset] ?? MAX_ROWS_PER_FILE[dataset]));
    let starts = [firstFrom];
    if (parts > 1) {
      const size = Math.ceil(total / parts);
      const boundaries = await this.connection.runAndReadAll(`
        SELECT chave FROM (SELECT ${key} AS chave, row_number() OVER (ORDER BY ${key}) - 1 AS posicao FROM ${source})
         WHERE posicao > 0 AND posicao % ${size} = 0 ORDER BY chave`);
      starts = [firstFrom, ...boundaries.getRows().map(([boundary]) => String(boundary))];
    }
    const files: ManifestFile[] = [];
    const columns = columnList(dataset);
    for (const [index, start] of starts.entries()) {
      const end = starts[index + 1] ?? null;
      const filter = [`${key} >= ${sqlLiteral(start)}`, ...(end === null ? [] : [`${key} < ${sqlLiteral(end)}`])].join(' AND ');
      files.push(await this.writeFile(dataset, partition, revision, start, `SELECT ${columns} FROM ${source} WHERE ${filter}`, written));
    }
    return files;
  }

  /** Em ordem de ano e faixa, com a primeira parte de cada ano começando em "". */
  private normalizedSlices(files: ManifestFile[]): ManifestFile[] {
    const sorted = [...files].sort((a, b) =>
      a.partition !== b.partition ? (a.partition < b.partition ? -1 : 1) : a.from < b.from ? -1 : a.from > b.from ? 1 : 0,
    );
    return sorted.map((file, index) => (index === 0 || sorted[index - 1]?.partition !== file.partition ? { ...file, from: '' } : file));
  }

  /**
   * Marca apenas as partes de origem/destino atingidas por alterações ou pela
   * passagem do dia. Só as chaves são materializadas; os contratos completos
   * continuam nos Parquets e cada parte é gerada por uma visão filtrada.
   */
  private async rewriteActiveDataset(revision: string, written: WrittenFile[], day: string): Promise<{ vigentes: ManifestFile[]; totals: StoreManifest['totals'] }> {
    const today = `${sqlLiteral(day)}::DATE`;
    const previousDay = `${sqlLiteral(this.manifest?.today ?? day)}::DATE`;
    const newBand = activeBandExpression(today);
    const oldBand = activeBandExpression(previousDay);
    const key = PART_KEY.vigentes;
    const notChanged = 'numero_controle_pncp NOT IN (SELECT numero_controle_pncp FROM mudancas)';
    const changedKeys = [
      `SELECT ${newBand} AS partition_key, ${key} AS row_key FROM mudancas WHERE vencimento >= ${today}`,
      `SELECT ${oldBand}, ${key} FROM atual_contratos
        WHERE vencimento >= ${previousDay} AND numero_controle_pncp IN (SELECT numero_controle_pncp FROM mudancas)`,
    ];
    if (this.manifest && this.manifest.today !== day) {
      // Origem e destino são calculados separadamente: um contrato vencido sai
      // só da origem; uma mudança de granularidade atinge as duas partições.
      changedKeys.push(
        `SELECT ${oldBand}, ${key} FROM atual_contratos
          WHERE ${notChanged} AND vencimento >= ${previousDay}
            AND (vencimento < ${today} OR ${oldBand} <> ${newBand})`,
        `SELECT ${newBand}, ${key} FROM atual_contratos
          WHERE ${notChanged} AND vencimento >= ${today}
            AND (vencimento < ${previousDay} OR ${oldBand} <> ${newBand})`,
      );
    }
    await this.prepareWork('contract-active-keys');
    await this.connection.run(`CREATE OR REPLACE TEMP TABLE active_change_keys AS ${changedKeys.join(' UNION ALL ')}`);
    const ranges = this.sliceRanges('vigentes');
    const rangeRows = [...ranges.values()].flat();
    const affected = new Set<SliceRange>();
    if (rangeRows.length > 0) {
      const values = rangeRows
        .map((range, index) => `(${index}, ${sqlLiteral(range.partition)}, ${sqlLiteral(range.from)}, ${range.to === null ? 'NULL' : sqlLiteral(range.to)})`)
        .join(', ');
      const hits = await this.connection.runAndReadAll(`
        WITH ranges(part_index, partition_key, first_key, last_key) AS (VALUES ${values})
        SELECT DISTINCT r.part_index FROM ranges r JOIN active_change_keys c
          ON c.partition_key = r.partition_key AND c.row_key >= r.first_key
         AND (r.last_key IS NULL OR c.row_key < r.last_key)`);
      for (const [index] of hits.getRows()) {
        const range = rangeRows[Number(index)];
        if (range) {
          affected.add(range);
        }
      }
    }
    const known = [...ranges.keys()];
    const newPartitions = await this.connection.runAndReadAll(`
      SELECT DISTINCT partition_key FROM active_change_keys
       ${known.length > 0 ? `WHERE partition_key NOT IN (${known.map(sqlLiteral).join(', ')})` : ''}`);
    for (const [partition] of newPartitions.getRows()) {
      affected.add({ partition: String(partition), from: '', to: null, file: null });
    }

    const columns = columnList('vigentes');
    const rewritten: ManifestFile[] = [];
    for (const range of affected) {
      const bounds = [`${key} >= ${sqlLiteral(range.from)}`, ...(range.to === null ? [] : [`${key} < ${sqlLiteral(range.to)}`])].join(' AND ');
      await this.connection.run(`CREATE OR REPLACE TEMP VIEW active_part AS
        SELECT ${columns} FROM ${this.currentRows(columns)}
         WHERE vencimento >= ${today} AND ${newBand} = ${sqlLiteral(range.partition)} AND ${bounds}`);
      rewritten.push(...(await this.writeParts('vigentes', range.partition, revision, 'active_part', range.from, written)));
    }
    await this.connection.run('DROP VIEW IF EXISTS active_part');
    await this.connection.run('DROP TABLE active_change_keys');
    const kept = rangeRows.filter((range) => !affected.has(range)).map((range) => range.file).filter((file): file is ManifestFile => file !== null);
    const counts = await this.connection.runAndReadAll(`
      SELECT count(*)::INTEGER, count(*) FILTER (WHERE vencimento >= ${today})::INTEGER, count(*) FILTER (WHERE vencimento IS NULL)::INTEGER
        FROM ${this.currentRows('vencimento')}`);
    const [contracts, active, withoutExpiry] = (counts.getRows()[0] ?? [0, 0, 0]).map(Number);
    return {
      vigentes: this.normalizedSlices([...kept, ...rewritten]),
      totals: { contracts: contracts ?? 0, active: active ?? 0, withoutExpiry: withoutExpiry ?? 0 },
    };
  }

  /** Apaga do bucket os arquivos do armazém que nenhum dos manifestos usa. */
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
   * Na cópia de trabalho, só a versão nova. No Windows, um arquivo ainda
   * aberto pelo DuckDB não pode ser apagado: fica para a próxima vez.
   */
  private async removeUnusedLocalCopies(next: StoreManifest): Promise<void> {
    try {
      await removeUnusedLocalFiles(this.options.directory, [next]);
    } catch (error) {
      this.options.logger.warn('Cópia de trabalho: arquivos antigos não apagados agora', { error });
    }
  }
}
