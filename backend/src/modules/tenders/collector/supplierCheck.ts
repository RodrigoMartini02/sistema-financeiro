import { formatCents } from '../contractStore/winnerRows';
import { RESULTS_PAGE_SIZE, RESULTS_RETRY_PAGE_SIZES, windowParams, type ComprasGovClient, type ComprasGovWindow } from './comprasGovClient';

// Conferência de um fornecedor contra a própria fonte (`winners-probe --fornecedor`, plano
// .plans/licitacoes-vencedores.md, Fase D do piloto): lê da fonte os resultados de um CNPJ num período e conta os itens
// ativos, as licitações e o valor total, para comparar com o que `winners-lookup` mostra do armazém. A fonte aceita o
// filtro `niFornecedor` (medido em 25/10/2026: o dia 14/09 foi de 9.719 registros para 4 com o CNPJ de uma empresa).
//
// É um oráculo independente: a regra de "ativo" é escrita aqui de novo, direto dos campos da fonte (situação 1 e sem data
// de cancelamento), sem passar pelo mapeamento nem pela agregação que ela confere. É somente leitura, sem banco e sem R2.
// Mesmo se a fonte ignorar o filtro, só os registros do CNPJ são contados (e isso aparece em `serverFilter`).
//
// A paginação da fonte falha (comprasGovClient.ts, RESULTS_RETRY_PAGE_SIZES): faltando registro do CNPJ em relação ao total que
// a fonte informa, o período é lido de novo com outro tamanho de página, e o relatório diz em `complete` se vieram todos.

const DEFAULT_MAX_PAGES = 2_000;
const SUPPLIER_FILTER = 'niFornecedor';
const SITUATION_ACTIVE = 1;
const SITUATION_CANCELLED = 2;

type Rec = Record<string, unknown>;

const isRecord = (value: unknown): value is Rec => typeof value === 'object' && value !== null && !Array.isArray(value);
const digitsOf = (value: unknown): string => (typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\D/g, '') : '');
const filled = (value: unknown): boolean => value !== null && value !== undefined && String(value).trim() !== '';

export interface SupplierCheckOptions {
  /** Os 14 dígitos do CNPJ do fornecedor. */
  cnpj: string;
  window: ComprasGovWindow;
  /** Páginas no máximo (de 500 registros); padrão 2.000. */
  maxPages?: number;
}

export interface SupplierCheckDeps {
  client: Pick<ComprasGovClient, 'requestRaw' | 'requestCount'>;
  now: () => Date;
  progress?: (message: string) => void;
}

export interface SupplierCheckReport {
  generatedAt: string;
  cnpj: string;
  window: ComprasGovWindow;
  /** `applied`: todo registro da primeira página é do CNPJ; `ignored`: veio de outros fornecedores (só os do CNPJ contam); `unknown`: sem registro. */
  serverFilter: 'applied' | 'ignored' | 'unknown';
  pagesRead: number;
  /** O total que a fonte informou na primeira página. */
  totalReported: number | null;
  /** Registros lidos, de qualquer fornecedor (se a fonte ignorar o filtro, é bem mais que `supplierRecords`). */
  recordsRead: number;
  supplierRecords: number;
  /** Itens vencedores ativos: situação "informado" e sem data de cancelamento. */
  activeItems: number;
  cancelledItems: number;
  otherItems: number;
  /** Licitações distintas com pelo menos um item ativo. */
  activePurchases: number;
  /** Soma dos valores homologados dos itens ativos, em reais com 2 casas. */
  activeTotalValue: string;
  /** Por que a leitura parou antes do fim, quando parou. */
  stoppedBy: 'maxPages' | 'rateLimit' | 'error' | null;
  /** Leituras do período: mais de uma quando a anterior deixou registro do CNPJ de fora. */
  passes: number;
  /** Os registros do CNPJ vieram todos, contra o total que a fonte informou; falso se o filtro foi ignorado ou a leitura parou. */
  complete: boolean;
  requests: number;
}

function purchaseOf(record: Rec): string {
  const value = record['idContratacaoPNCP'] ?? record['numeroControlePNCPCompra'];
  return typeof value === 'string' ? value : '';
}

/** O valor em reais como centavos inteiros; ausente, zero, negativo ou fora do formato é zero. */
function centsOf(value: unknown): bigint {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : 0;
  return Number.isFinite(number) && number > 0 ? BigInt(Math.round(number * 100)) : 0n;
}

export async function runSupplierCheck(deps: SupplierCheckDeps, options: SupplierCheckOptions): Promise<SupplierCheckReport> {
  const progress = deps.progress ?? (() => {});
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const dates = windowParams(options.window);
  const report: SupplierCheckReport = {
    generatedAt: deps.now().toISOString(),
    cnpj: options.cnpj,
    window: options.window,
    serverFilter: 'unknown',
    pagesRead: 0,
    totalReported: null,
    recordsRead: 0,
    supplierRecords: 0,
    activeItems: 0,
    cancelledItems: 0,
    otherItems: 0,
    activePurchases: 0,
    activeTotalValue: '0.00',
    stoppedBy: null,
    passes: 0,
    complete: false,
    requests: 0,
  };

  const seenItems = new Set<string>();
  const activePurchases = new Set<string>();
  let activeCents = 0n;

  /** Uma leitura do período inteiro, com o tamanho de página pedido. Para antes do fim no limite de páginas, no 429 ou no erro. */
  const readPass = async (pageSize: number): Promise<void> => {
    for (let page = 1; page <= maxPages + 1; page += 1) {
      if (page > maxPages) {
        report.stoppedBy = 'maxPages';
        return;
      }
      progress(`fornecedor ${options.cnpj}: página ${page}${report.passes > 1 ? ` (leitura ${report.passes})` : ''}`);
      const raw = await deps.client.requestRaw(dates, page, pageSize, { [SUPPLIER_FILTER]: options.cnpj });
      if (raw.status === 429) {
        report.stoppedBy = 'rateLimit';
        return;
      }
      if (raw.status !== 200 || !isRecord(raw.json) || !Array.isArray(raw.json['resultado'])) {
        report.stoppedBy = 'error';
        return;
      }
      const records = raw.json['resultado'].filter(isRecord);
      report.pagesRead += 1;
      report.recordsRead += records.length;
      if (page === 1 && report.passes === 1) {
        report.totalReported = typeof raw.json['totalRegistros'] === 'number' ? raw.json['totalRegistros'] : null;
        if (records.length > 0) {
          report.serverFilter = records.every((record) => digitsOf(record[SUPPLIER_FILTER]) === options.cnpj) ? 'applied' : 'ignored';
        }
      }

      for (const record of records) {
        if (digitsOf(record[SUPPLIER_FILTER]) !== options.cnpj) {
          continue;
        }
        const itemKey = `${purchaseOf(record)}|${String(record['numeroItemPncp'])}|${String(record['sequencialResultado'] ?? 1)}`;
        if (seenItems.has(itemKey)) {
          continue;
        }
        seenItems.add(itemKey);
        report.supplierRecords += 1;
        const situation = Number(record['situacaoCompraItemResultadoId']);
        if (situation === SITUATION_CANCELLED || filled(record['dataCancelamentoPncp'])) {
          report.cancelledItems += 1;
        } else if (situation === SITUATION_ACTIVE) {
          report.activeItems += 1;
          activePurchases.add(purchaseOf(record));
          activeCents += centsOf(record['valorTotalHomologado']);
        } else {
          report.otherItems += 1;
        }
      }

      const remaining = typeof raw.json['paginasRestantes'] === 'number' ? raw.json['paginasRestantes'] : 0;
      if (remaining <= 0 || records.length === 0) {
        return;
      }
    }
  };

  // Faltando registro do CNPJ em relação ao total, lê de novo com outro tamanho de página (a paginação da fonte falha).
  const missingRecords = () => report.serverFilter === 'applied' && report.totalReported !== null && report.supplierRecords < report.totalReported;
  for (const pageSize of [RESULTS_PAGE_SIZE, ...RESULTS_RETRY_PAGE_SIZES]) {
    report.passes += 1;
    await readPass(pageSize);
    if (report.stoppedBy !== null || !missingRecords()) {
      break;
    }
  }
  report.complete = report.stoppedBy === null && report.serverFilter !== 'ignored' && report.totalReported !== null && report.supplierRecords >= report.totalReported;

  report.activePurchases = activePurchases.size;
  report.activeTotalValue = formatCents(activeCents);
  report.requests = deps.client.requestCount;
  return report;
}

export function renderSupplierCheck(report: SupplierCheckReport): string {
  return JSON.stringify(report, null, 2);
}
