import type { ResultRecord } from '../contractStore/winnerRows';
import { WinnerStoreWriter, type WinnerApplyResult, type WinnerPublishSummary } from '../contractStore/winnerWriter';
import { ARCHIVE_DATASETS, type RunArchive } from './archive';
import { ComprasGovRequestError, RESULTS_MAX_PASSES, RESULTS_RETRY_PAGE_SIZES, type ComprasGovWindow } from './comprasGovClient';
import { dailyContractWindow, daysFromNewestToOldest, requireStorage, type BackfillStopReason } from './contractRuns';
import { addCalendarDays, brasiliaDate, toPncpDate } from './dates';
import { maskPersonDocument, mapResult, sourceRowKey } from './resultMapping';
import {
  RESULTS_QUERY,
  markResultDayCompleted,
  readCompletedResultDays,
  readLastCompletedResultDay,
  readNewestResultDay,
} from './resultProgress';
import { COLLECTOR_LOCK_KEYS } from './repository';
import { withCollectionRun, type CollectorContext, type RunOutcome, type RunTally } from './runs';

// Execuções dos vencedores (plano .plans/licitacoes-vencedores.md): a coleta diária e a carga histórica. As duas leem
// os resultados dos itens das licitações (Compras.gov.br), agregam por licitação e fornecedor no armazém do R2
// (contractStore/winnerWriter.ts) e usam a mesma trava dos contratos, porque publicam no mesmo manifesto e usam a
// mesma pasta de trabalho. Cada execução fica registrada em licitacoes.coleta_execucao, com o arquivo bruto.
//
// O que a execução leu só vale como "lido" depois da publicação: a coleta diária grava a consulta como não concluída
// se não chegar a publicar, e a carga só marca os dias em resultado_carga_dia depois de publicar. Antes de publicar, o
// arquivo bruto é descarregado, e falha no envio dele cancela a publicação: nada é dado como lido sem o bruto.
//
// A leitura é de um dia por vez, e a fonte informa quantas linhas o dia tem. Uma leitura só vale quando traz todas, cada
// uma contada uma vez, pela identidade (licitação, item e sequência). A primeira leitura de um dia costuma vir com páginas
// que não se encaixam (de 1% a 12% das linhas repetidas e outras tantas faltando, mesmo com a soma das páginas igual ao
// total), e pedir a mesma página de novo devolve a mesma resposta (ver RESULTS_RETRY_PAGE_SIZES). Por isso, faltando
// linha, o dia é lido de novo com outro tamanho de página e só as linhas que faltavam são aplicadas; sem completar em
// RESULTS_MAX_PASSES leituras, o dia não vale como lido.
//
// A fonte filtra pela data do resultado, e um resultado pode ser informado, corrigido ou cancelado dias depois (a
// atualização chega até 8 dias depois, medido). Por isso a coleta diária relê os 7 dias antes do último dia lido.
// Medido em 25/10/2026, a fonte ficou 26 dias sem dado novo (o último dia foi 29/09): a coleta nunca avança além do
// último dia em que a fonte tem registro, e um dia vazio no fim da fonte não conta como lido. Assim, quando a fonte
// voltar, nenhum dia fica para trás.

/** Resultados lidos antes de cada aplicação ao armazém: o lote fecha com este tamanho ou no fim da janela. */
export const RESULTS_BATCH_SIZE = 4_000;
/** A carga publica a cada tantos dias concluídos: processo derrubado perde só esses dias, que ficam pendentes. */
export const RESULTS_BACKFILL_PUBLISH_EVERY_DAYS = 20;
/** A coleta diária relê tantos dias antes do último dia lido. */
export const RESULTS_DAILY_OVERLAP_DAYS = 7;
/** Acima desta fração de registros inválidos (com pelo menos 100 lidos), a execução falha: provável mudança de formato. */
export const RESULTS_MAX_INVALID_RATIO = 0.05;
const MIN_RECORDS_FOR_INVALID_RATIO = 100;
/** Dias seguidos com falha da fonte que encerram o bloco da carga (a fonte está fora do ar). */
const MAX_CONSECUTIVE_FAILED_DAYS = 3;
/** Folga do prazo da rotina: o bloco da carga termina e publica antes dele. */
export const RESULTS_DEADLINE_MARGIN_MINUTES = 15;

export const RESULTS_BACKFILL_NOT_STARTED = 'carga de vencedores não iniciada: R2 não configurado';
export const RESULTS_BACKFILL_FINISHED = 'carga de vencedores concluída: nenhum dia pendente';
export const RESULTS_BACKFILL_NO_TIME = 'sem tempo na rotina para a carga de vencedores';

const DAY_MS = 24 * 60 * 60 * 1000;
const KB_PER_MB = 1024;

/** A consulta da coleta diária nos detalhes da execução: de onde a próxima continua (readLastCompletedResultDay). */
interface ResultsQueryDetail {
  endpoint: typeof RESULTS_QUERY;
  from: string;
  /** Concluída: o último dia que a fonte tinha. Senão, o fim da janela pedida. */
  to: string;
  /** O fim da janela pedida à fonte. */
  windowTo: string;
  completed: boolean;
  recordsRead: number;
}

/**
 * Janela da coleta diária: a janela dos contratos (do último dia lido, ou ontem, até hoje, com até 7 dias de
 * avanço por execução) com os 7 dias de sobreposição antes dela. Dia normal: de hoje − 8 a hoje; parada longa:
 * etapas de até 7 dias, a partir do último dia lido, sem perder nenhum.
 */
export function dailyResultsWindow(today: string, lastCompletedDay: string | null): ComprasGovWindow {
  const base = dailyContractWindow(today, lastCompletedDay);
  return { from: addCalendarDays(base.from, -RESULTS_DAILY_OVERLAP_DAYS), to: base.to };
}

/**
 * Dias que a carga ainda precisa ler, do mais recente para o mais antigo. Com `repair` (`--from` ou `--to` na
 * linha de comando), todos os dias da faixa, mesmo os já marcados: é o reparo manual.
 */
export function pendingResultsDays(range: { from: string; to: string }, completed: ReadonlySet<string>, repair: boolean): string[] {
  const days = daysFromNewestToOldest(range.from, range.to);
  return repair ? days : days.filter((day) => !completed.has(day));
}

/**
 * Minutos do bloco da carga: os configurados, limitados ao que sobra da rotina (até `deadlineAt`) menos a folga de
 * RESULTS_DEADLINE_MARGIN_MINUTES, para o bloco terminar e publicar antes do limite. Null quando não sobra pelo menos
 * um minuto: a etapa sai pulada, sem abrir execução. Sem prazo, valem os minutos configurados.
 */
export function backfillBlockMinutes(configuredMinutes: number, deadlineAt: number | undefined, now: number): number | null {
  if (deadlineAt === undefined) {
    return configuredMinutes;
  }
  const available = Math.floor((deadlineAt - now) / 60_000) - RESULTS_DEADLINE_MARGIN_MINUTES;
  return available < 1 ? null : Math.min(configuredMinutes, available);
}

type CancellationLagBucket = '0-7' | '8-30' | '31+';

function cancellationLagBucket(resultDate: string, cancelledOn: string): CancellationLagBucket | null {
  const days = (Date.parse(`${cancelledOn}T00:00:00Z`) - Date.parse(`${resultDate}T00:00:00Z`)) / DAY_MS;
  if (!Number.isFinite(days)) {
    return null;
  }
  if (days <= 7) {
    return '0-7';
  }
  return days <= 30 ? '8-30' : '31+';
}

/** Números que o piloto olha para decidir os padrões (intervalo, linhas por parte, dias entre publicações, releitura). */
class ResultMetrics {
  pages = 0;
  /** Linhas que uma leitura trouxe de novo (a mesma linha em duas páginas, ou numa releitura): não são aplicadas outra vez. */
  repeatedRecords = 0;
  /** Leituras além da primeira, feitas porque a anterior deixou linha de fora. */
  extraPasses = 0;
  /** Dias que, depois de todas as leituras, ainda ficaram sem alguma linha. */
  incompleteWindows = 0;
  fetchMs = 0;
  applyMs = 0;
  publishMs = 0;
  mapped = 0;
  invalid = 0;
  winners = 0;
  cancelled = 0;
  reserve = 0;
  otherSituation = 0;
  withoutDocument = 0;
  rankAboveOne = 0;
  emptyDays = 0;
  rowsInserted = 0;
  rowsUpdated = 0;
  rowsRemoved = 0;
  rowsUnchanged = 0;
  readonly cancellationLagDays: Record<CancellationLagBucket, number> = { '0-7': 0, '8-30': 0, '31+': 0 };

  count(record: ResultRecord): void {
    this.mapped += 1;
    if (record.situation === 'winner') {
      this.winners += 1;
      if (record.rank !== null && record.rank > 1) {
        this.rankAboveOne += 1;
      }
    } else if (record.situation === 'cancelled') {
      this.cancelled += 1;
      const bucket = record.cancelledOn === null ? null : cancellationLagBucket(record.resultDate, record.cancelledOn);
      if (bucket !== null) {
        this.cancellationLagDays[bucket] += 1;
      }
    } else if (record.situation === 'reserve') {
      this.reserve += 1;
    } else {
      this.otherSituation += 1;
    }
    if (record.supplier.document === null) {
      this.withoutDocument += 1;
    }
  }

  toDetails(): Record<string, unknown> {
    return {
      pages: this.pages,
      repeatedRecords: this.repeatedRecords,
      extraPasses: this.extraPasses,
      incompleteWindows: this.incompleteWindows,
      fetchMs: Math.round(this.fetchMs),
      applyMs: Math.round(this.applyMs),
      publishMs: Math.round(this.publishMs),
      records: {
        mapped: this.mapped,
        invalid: this.invalid,
        winners: this.winners,
        cancelled: this.cancelled,
        reserve: this.reserve,
        otherSituation: this.otherSituation,
      },
      suppliersWithoutDocument: this.withoutDocument,
      winnersWithRankAboveOne: this.rankAboveOne,
      emptyDays: this.emptyDays,
      rows: { inserted: this.rowsInserted, updated: this.rowsUpdated, removed: this.rowsRemoved, unchanged: this.rowsUnchanged },
      cancellationLagDays: { ...this.cancellationLagDays },
      // Pico de memória do processo inteiro até aqui (a rotina roda várias etapas no mesmo processo).
      peakRssMb: Math.round(process.resourceUsage().maxRSS / KB_PER_MB),
    };
  }
}

/**
 * O estado de uma execução ao longo das janelas: as métricas e as linhas novas e alteradas, contadas uma vez só
 * mesmo que o mesmo fornecedor numa licitação apareça em vários lotes (uma linha criada nesta execução e alterada de
 * novo não conta como alterada).
 */
class ResultsRunState {
  readonly metrics = new ResultMetrics();
  private readonly created = new Set<string>();
  private readonly changed = new Set<string>();

  absorb(result: WinnerApplyResult, tally: RunTally): void {
    for (const key of result.insertedKeys) {
      this.created.add(key);
    }
    for (const key of result.updatedKeys) {
      if (!this.created.has(key)) {
        this.changed.add(key);
      }
    }
    for (const key of result.removedKeys) {
      if (!this.created.delete(key)) {
        this.changed.add(key);
      }
    }
    tally.newCount = this.created.size;
    tally.updatedCount = this.changed.size;
    this.metrics.rowsInserted += result.counts.inserted;
    this.metrics.rowsUpdated += result.counts.updated;
    this.metrics.rowsRemoved += result.counts.removed;
    this.metrics.rowsUnchanged += result.counts.unchanged;
  }
}

/** O armazém de uma execução: o gravador dos vencedores (a cópia de trabalho e as mudanças), aberto no começo e fechado no fim. */
class RunWinnerStore {
  readonly publications: WinnerPublishSummary[] = [];

  private constructor(
    readonly writer: WinnerStoreWriter,
    private readonly tally: RunTally,
    private readonly state: ResultsRunState,
  ) {}

  static async open(context: CollectorContext, tally: RunTally, state: ResultsRunState, runId: number, today: string): Promise<RunWinnerStore> {
    const writer = await WinnerStoreWriter.open({
      storage: requireStorage(context),
      directory: context.contractWorkDirectory,
      version: runId,
      today,
      now: context.now,
      logger: context.logger,
    });
    return new RunWinnerStore(writer, tally, state);
  }

  /** Publica as mudanças (sem mudança, nada). */
  async publish(): Promise<void> {
    const startedAt = performance.now();
    const summary = await this.writer.publish();
    this.state.metrics.publishMs += performance.now() - startedAt;
    if (summary) {
      this.publications.push(summary);
      this.tally.details['publications'] = this.publications.map((publication) => ({ ...publication }));
    }
  }

  /** O que o painel mostra do armazém dos vencedores ao fim da execução. */
  describe(): Record<string, unknown> {
    return { revision: this.writer.currentManifest?.revision ?? null, rows: this.writer.publishedRows };
  }

  async close(): Promise<void> {
    await this.writer.close();
  }
}

/**
 * Descarrega o arquivo bruto antes de publicar. O envio que falha não lança (conta erro e descarta a parte), então a
 * comparação das falhas antes e depois é o que cancela a publicação: sem o bruto, nada é dado como lido.
 */
async function flushArchiveOrAbort(archive: RunArchive): Promise<void> {
  const before = archive.summary()?.failures ?? 0;
  await archive.flush();
  const after = archive.summary()?.failures ?? 0;
  if (after > before) {
    throw new Error('O arquivo bruto não foi enviado ao R2: a publicação foi cancelada e nada foi dado como lido');
  }
}

interface WindowRead {
  /**
   * Falso quando a fonte falhou no meio, ou quando, depois de todas as leituras, ainda faltou linha em relação ao total
   * que ela informou: a janela não vale como lida.
   */
  completed: boolean;
  /** A fonte falhou (pedido sem resposta aproveitável): as outras janelas da execução tendem a falhar também. */
  sourceFailed: boolean;
  /** As linhas distintas da fonte na janela; a mesma linha trazida duas vezes conta uma. */
  recordsRead: number;
  invalid: number;
  /** O último dia de resultado entre os registros válidos: até onde a fonte tem dado. */
  lastDayWithData: string | null;
}

function emptyWindowRead(): WindowRead {
  return { completed: true, sourceFailed: false, recordsRead: 0, invalid: 0, lastDayWithData: null };
}

/** Soma a leitura de um dia à da janela inteira. */
function absorbWindowRead(total: WindowRead, part: WindowRead): void {
  total.completed &&= part.completed;
  total.sourceFailed ||= part.sourceFailed;
  total.recordsRead += part.recordsRead;
  total.invalid += part.invalid;
  if (part.lastDayWithData !== null && (total.lastDayWithData === null || part.lastDayWithData > total.lastDayWithData)) {
    total.lastDayWithData = part.lastDayWithData;
  }
}

/**
 * Lê um dia da fonte: mapeia cada registro, junta os válidos em lotes de RESULTS_BATCH_SIZE (também entre páginas,
 * para os itens de uma licitação ficarem juntos) e aplica cada lote ao armazém. O bruto recebe o registro como veio,
 * com o CPF mascarado, quando ele foi recusado, mudou o estado de alguma linha ou é de um dia ainda não coberto.
 *
 * A fonte informa o total de linhas do dia, e uma leitura só vale quando traz todas: cada linha é contada uma vez, pela
 * identidade (sourceRowKey), e se faltou alguma o dia é lido de novo com outro tamanho de página
 * (RESULTS_RETRY_PAGE_SIZES), aplicando só as linhas que ainda não vieram. Depois de RESULTS_MAX_PASSES leituras sem
 * completar, o dia não vale como lido. Falha da fonte encerra só o dia; falha do armazém ou do banco, a execução.
 */
async function readWindow(
  context: CollectorContext,
  tally: RunTally,
  archive: RunArchive,
  store: RunWinnerStore,
  state: ResultsRunState,
  window: ComprasGovWindow,
  isUncoveredDay: (day: string) => boolean,
): Promise<WindowRead> {
  const read = emptyWindowRead();
  /** As linhas do dia que já vieram, pela identidade: uma linha repetida não é aplicada outra vez. */
  const seen = new Set<string>();
  let batch: ResultRecord[] = [];
  let batchRaw: unknown[] = [];

  const flushBatch = async () => {
    if (batch.length === 0) {
      return;
    }
    const startedAt = performance.now();
    const result = await store.writer.apply(batch);
    state.metrics.applyMs += performance.now() - startedAt;
    state.absorb(result, tally);
    const raws: unknown[] = [];
    for (const [index, record] of batch.entries()) {
      if (result.alteredRecords.has(index) || isUncoveredDay(record.resultDate)) {
        raws.push(maskPersonDocument(batchRaw[index]));
      }
    }
    await archive.append(ARCHIVE_DATASETS.results, raws);
    batch = [];
    batchRaw = [];
  };

  /**
   * Uma leitura do dia, de ponta a ponta, com o tamanho de página pedido (o normal, se não vier). Devolve o total de
   * linhas que a fonte informou na primeira página. Os registros sem identidade não se reconhecem numa releitura: só
   * a primeira leitura os traz.
   */
  const readPass = async (pageSize: number | undefined, firstPass: boolean): Promise<number> => {
    let announced = 0;
    let waitStartedAt = performance.now();
    for await (const page of context.comprasGov.pages(window, pageSize === undefined ? {} : { pageSize })) {
      state.metrics.fetchMs += performance.now() - waitStartedAt;
      state.metrics.pages += 1;
      if (page.pageNumber === 1) {
        announced = page.totalRecords;
      }
      tally.recordsRead += page.records.length;

      const refused: unknown[] = [];
      for (const raw of page.records) {
        const identity = sourceRowKey(raw);
        if (identity === null ? !firstPass : seen.has(identity)) {
          state.metrics.repeatedRecords += 1;
          continue;
        }
        if (identity !== null) {
          seen.add(identity);
        }
        read.recordsRead += 1;

        const mapped = mapResult(raw);
        if (!mapped.ok) {
          read.invalid += 1;
          state.metrics.invalid += 1;
          tally.addError({ kind: 'record', controlNumber: mapped.purchase, reason: mapped.reason });
          refused.push(maskPersonDocument(raw));
          continue;
        }
        state.metrics.count(mapped.record);
        batch.push(mapped.record);
        batchRaw.push(raw);
        if (read.lastDayWithData === null || mapped.record.resultDate > read.lastDayWithData) {
          read.lastDayWithData = mapped.record.resultDate;
        }
      }
      await archive.append(ARCHIVE_DATASETS.results, refused);
      if (batch.length >= RESULTS_BATCH_SIZE) {
        await flushBatch();
      }
      context.logger.debug('Página de resultados lida', { window, page: page.pageNumber, remainingPages: page.remainingPages });
      waitStartedAt = performance.now();
    }
    // Cada leitura termina com o lote aplicado: a leitura seguinte parte do que já está no armazém.
    await flushBatch();
    return announced;
  };

  let passes = 0;
  let announced = 0;
  try {
    for (const pageSize of [undefined, ...RESULTS_RETRY_PAGE_SIZES]) {
      passes += 1;
      announced = await readPass(pageSize, passes === 1);
      if (read.recordsRead >= announced) {
        break;
      }
      if (passes < RESULTS_MAX_PASSES) {
        state.metrics.extraPasses += 1;
        context.logger.warn('Leitura do dia sem todas as linhas da fonte: lendo de novo com outro tamanho de página', {
          window,
          announced,
          distinct: read.recordsRead,
          passes,
        });
      }
    }
  } catch (error) {
    if (!(error instanceof ComprasGovRequestError)) {
      throw error;
    }
    read.completed = false;
    read.sourceFailed = true;
    tally.addError({ kind: 'request', window, ...error.details, message: error.message });
    context.logger.warn('Consulta de resultados interrompida', { window, error });
  }
  // O que foi lido antes da falha também entra: a agregação é idempotente, e a janela só fica como não lida.
  await flushBatch();

  // Contra a leitura incompleta, que a fonte não avisa: ela diz quantas linhas tem, e menos linhas não é dia lido.
  if (read.completed && read.recordsRead < announced) {
    read.completed = false;
    state.metrics.incompleteWindows += 1;
    tally.addError({
      kind: 'incomplete',
      window,
      announced,
      distinct: read.recordsRead,
      passes,
      message: `Dia ${window.from}: a fonte informou ${announced} registros, mas só ${read.recordsRead} vieram, mesmo depois de ${passes} leituras`,
    });
  }
  // Muitos registros fora do formato: provável mudança na fonte. Falha antes de publicar, e nada é dado como lido.
  if (read.recordsRead >= MIN_RECORDS_FOR_INVALID_RATIO && read.invalid / read.recordsRead > RESULTS_MAX_INVALID_RATIO) {
    throw new Error(
      `${read.invalid} de ${read.recordsRead} registros fora do formato (mais de ${RESULTS_MAX_INVALID_RATIO * 100}%): a fonte pode ter mudado de formato`,
    );
  }
  return read;
}

/**
 * Coleta diária dos vencedores: relê a janela dos últimos dias (dailyResultsWindow), um dia por vez, agrega no armazém
 * e publica. Parte do último dia que a fonte tinha na execução anterior (ou, na primeira vez, do dia mais recente da
 * carga) e nunca avança além do último dia com registro: sem dado novo, a janela só se repete, sem publicar nada.
 * Janela sem nenhum registro falha (a janela sempre inclui dias que já tinham dado: é sinal de fonte fora do ar ou
 * mudada). Um dia que não completa (readWindow) deixa a consulta como não concluída, e a próxima execução relê a janela.
 */
export function runResultsDaily(context: CollectorContext): Promise<RunOutcome> {
  return withCollectionRun(
    context,
    'VENCEDORES_DIARIA',
    COLLECTOR_LOCK_KEYS.contracts,
    async (tally, archive, runId) => {
      const today = brasiliaDate(context.now());
      const lastCompleted = (await readLastCompletedResultDay(context.db)) ?? (await readNewestResultDay(context.db));
      const window = dailyResultsWindow(today, lastCompleted);
      const query: ResultsQueryDetail = {
        endpoint: RESULTS_QUERY,
        from: window.from,
        to: window.to,
        windowTo: window.to,
        completed: false,
        recordsRead: 0,
      };
      tally.details['today'] = today;
      tally.details['period'] = { dataInicial: toPncpDate(window.from), dataFinal: toPncpDate(window.to) };
      tally.details['queries'] = [query];

      const state = new ResultsRunState();
      const store = await RunWinnerStore.open(context, tally, state, runId, today);
      try {
        // Um dia por vez, do mais antigo ao mais novo: cada dia confere o próprio total e, se preciso, é relido sozinho.
        // Fonte fora do ar encerra a janela; um dia que não completa não impede os outros.
        const isUncoveredDay = (candidate: string) => lastCompleted === null || candidate > lastCompleted;
        const read = emptyWindowRead();
        for (const day of daysFromNewestToOldest(window.from, window.to).reverse()) {
          const dayRead = await readWindow(context, tally, archive, store, state, { from: day, to: day }, isUncoveredDay);
          absorbWindowRead(read, dayRead);
          if (dayRead.sourceFailed) {
            break;
          }
        }
        query.recordsRead = read.recordsRead;
        tally.details['sourceLastDay'] = read.lastDayWithData;
        if (read.recordsRead === 0 && read.completed) {
          tally.addError({
            kind: 'window',
            window,
            message: 'A janela não trouxe nenhum registro: a fonte pode estar fora do ar ou ter mudado',
          });
        }

        await flushArchiveOrAbort(archive);
        await store.publish();

        if (read.completed && read.lastDayWithData !== null) {
          // Só vale como lido até o último dia que a fonte tinha (e nunca para trás do que já estava lido).
          const covered = read.lastDayWithData < window.to ? read.lastDayWithData : window.to;
          query.to = lastCompleted !== null && lastCompleted > covered ? lastCompleted : covered;
          query.completed = true;
        }
      } finally {
        tally.details['metrics'] = state.metrics.toDetails();
        tally.details['store'] = store.describe();
        await store.close();
      }
    },
    () => context.comprasGov.requestCount,
  );
}

export interface ResultsBackfillOptions {
  /** Dia mais antigo; sem ele, TENDERS_WINNERS_BACKFILL_FROM. Com `from` ou `to`, é reparo: relê a faixa inteira. */
  from?: string;
  /** Dia mais recente; sem ele, o dia mais recente já carregado, ou ontem na primeira execução. */
  to?: string;
  /** Tempo do bloco; sem ele, TENDERS_WINNERS_BACKFILL_MINUTES. */
  maxMinutes?: number;
  /** Instante (ms) em que a rotina inteira precisa ter acabado: o bloco usa só o tempo que sobra, menos a folga. */
  deadlineAt?: number;
  /** Dias concluídos entre as publicações; sem ele, RESULTS_BACKFILL_PUBLISH_EVERY_DAYS. */
  publishEveryDays?: number;
}

/**
 * Faixa da carga: do dia mais antigo configurado até o mais recente. Na primeira execução, o mais recente é ontem;
 * depois, fica fixo no dia mais recente já carregado (os dias seguintes são da coleta diária).
 */
async function resultsBackfillRange(context: CollectorContext, options: ResultsBackfillOptions): Promise<{ from: string; to: string }> {
  const from = options.from ?? context.config.winners.backfillFrom;
  const to = options.to ?? (await readNewestResultDay(context.db)) ?? addCalendarDays(brasiliaDate(context.now()), -1);
  return { from, to };
}

interface CompletedResultDay {
  day: string;
  recordsRead: number;
}

/**
 * Carga histórica dos vencedores: um dia de resultado por vez, do mais recente para o mais antigo, retomável, em
 * blocos com limite de tempo. O armazém é publicado a cada RESULTS_BACKFILL_PUBLISH_EVERY_DAYS dias concluídos e no
 * fim do bloco, e os dias só são marcados em resultado_carga_dia depois de publicar: um dia com falha da fonte, ou que
 * a execução não chegou a publicar, fica pendente para a próxima. Um dia sem registro depois do último dia com dado da
 * fonte (a fonte atrás do calendário) não é carregado nem conta como pendente: é da coleta diária, que o recupera
 * quando a fonte chegar lá. Sem o R2, sem dia pendente ou sem tempo na rotina, não roda e não abre execução.
 */
export async function runResultsBackfill(context: CollectorContext, options: ResultsBackfillOptions = {}): Promise<RunOutcome> {
  if (!context.storage) {
    context.logger.warn('Carga de vencedores não iniciada', { reason: RESULTS_BACKFILL_NOT_STARTED });
    return { skipped: true, reason: RESULTS_BACKFILL_NOT_STARTED };
  }
  const maxMinutes = backfillBlockMinutes(options.maxMinutes ?? context.config.winners.backfillMinutes, options.deadlineAt, context.now().getTime());
  if (maxMinutes === null) {
    context.logger.warn('Carga de vencedores sem tempo na rotina', { deadlineAt: options.deadlineAt });
    return { skipped: true, reason: RESULTS_BACKFILL_NO_TIME };
  }
  const repair = options.from !== undefined || options.to !== undefined;
  const range = await resultsBackfillRange(context, options);
  const completedBefore = await readCompletedResultDays(context.db, range.from, range.to);
  const pendingDays = pendingResultsDays(range, completedBefore, repair);
  if (pendingDays.length === 0) {
    context.logger.info('Carga de vencedores sem dia pendente', { ...range });
    return { skipped: true, reason: RESULTS_BACKFILL_FINISHED };
  }
  const publishEveryDays = options.publishEveryDays ?? RESULTS_BACKFILL_PUBLISH_EVERY_DAYS;
  const newestCompleted = await readNewestResultDay(context.db);

  return withCollectionRun(
    context,
    'VENCEDORES_CARGA',
    COLLECTOR_LOCK_KEYS.contracts,
    async (tally, archive, runId) => {
      const startedAt = context.now().getTime();
      const today = brasiliaDate(context.now());
      const state = new ResultsRunState();

      let daysCompleted = 0;
      let failedDays = 0;
      let skippedEmptyDays = 0;
      let consecutiveFailures = 0;
      let stoppedBy: BackfillStopReason | null = null;
      let awaitingPublication: CompletedResultDay[] = [];
      // Enquanto nenhum dia com dado apareceu (e nada foi carregado antes), os dias vazios são da fonte atrasada.
      let aboveSourceFrontier = !repair && newestCompleted === null;

      const store = await RunWinnerStore.open(context, tally, state, runId, today);
      const publishAndMarkDays = async () => {
        await flushArchiveOrAbort(archive);
        await store.publish();
        for (const { day, recordsRead } of awaitingPublication) {
          await markResultDayCompleted(context.db, day, recordsRead);
          daysCompleted += 1;
          context.logger.info('Dia da carga de vencedores concluído', { day, recordsRead });
        }
        awaitingPublication = [];
      };

      try {
        for (const day of pendingDays) {
          if ((context.now().getTime() - startedAt) / 60_000 >= maxMinutes) {
            stoppedBy = 'time';
            break;
          }

          const read = await readWindow(context, tally, archive, store, state, { from: day, to: day }, (candidate) => !completedBefore.has(candidate));
          if (!read.completed) {
            failedDays += 1;
            consecutiveFailures += 1;
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILED_DAYS) {
              stoppedBy = 'pncp';
              break;
            }
            continue;
          }
          consecutiveFailures = 0;
          if (read.recordsRead === 0) {
            if (aboveSourceFrontier) {
              skippedEmptyDays += 1;
              continue;
            }
            state.metrics.emptyDays += 1;
          } else {
            aboveSourceFrontier = false;
          }
          awaitingPublication.push({ day, recordsRead: read.recordsRead });
          if (awaitingPublication.length >= publishEveryDays) {
            await publishAndMarkDays();
          }
        }
        // As sobras do bloco, e o que dias interrompidos já gravaram nas mudanças.
        await publishAndMarkDays();
      } finally {
        // Também numa falha: os dias que chegaram a ser publicados e marcados ficam registrados.
        const pendingAfter = pendingDays.length - daysCompleted - skippedEmptyDays;
        tally.details['backfill'] = {
          from: range.from,
          to: range.to,
          maxMinutes,
          publishEveryDays,
          totalDays: daysFromNewestToOldest(range.from, range.to).length - skippedEmptyDays,
          pendingAtStart: pendingDays.length,
          daysCompleted,
          failedDays,
          skippedEmptyDays,
          pendingAfter,
          stoppedBy,
          finished: pendingAfter === 0,
        };
        tally.details['metrics'] = state.metrics.toDetails();
        tally.details['store'] = store.describe();
        await store.close();
      }
    },
    () => context.comprasGov.requestCount,
  );
}
