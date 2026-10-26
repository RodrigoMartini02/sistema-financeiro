import { z } from 'zod/v4';

// Cliente do Compras.gov.br, dados abertos (público, sem autenticação): os resultados das licitações da Lei
// 14.133, uma linha por item e resultado (plano .plans/licitacoes-vencedores.md), e os contratos, os órgãos e as
// unidades dos órgãos federais (plano .plans/licitacoes-contratos-federais.md). Uma instância só atende todas as
// consultas, e o intervalo entre pedidos vale para o conjunto. Recebe fetch, sleep, random e now
// por parâmetro, como o do PNCP, para os testes simularem HTTP e espera sem rede nem relógio real.
//
// O endereço, o envelope, o tamanho máximo de página (500) e o fim inclusivo da janela foram confirmados pela
// sondagem (`winners-probe`, 25/10/2026). A lógica de repetição é cópia da do PncpClient de propósito (o PncpClient
// está em produção e não muda); a dívida está registrada no plano.

export const COMPRASGOV_BASE_URL = 'https://dadosabertos.compras.gov.br';
/** Resultados de itens de contratações da Lei 14.133 (S1). */
export const RESULTS_PATH = '/modulo-contratacoes/3_consultarResultadoItensContratacoes_PNCP_14133';
/** Tamanho máximo de página das consultas que aceitam `tamanhoPagina` (a fonte aceita de 10 a 500). */
export const PAGE_SIZE = 500;
/**
 * Tamanhos de página das leituras seguintes de uma janela (um dia de resultados, um órgão e ano de contratos), quando a
 * anterior deixou linha de fora. A fonte entrega a
 * primeira leitura de muitos dias com páginas que não se encaixam: uma linha vem em duas páginas seguidas e outras não
 * vêm em página nenhuma, mesmo com a soma das páginas igual ao total informado. Medido em 25/10/2026: dos 20 dias
 * amostrados de 2021 a 2026, 13 vieram assim (de 1% a 12% das linhas do dia; os 7 inteiros eram, em 6 casos, de até duas
 * páginas), e na carga de piloto isso valeu para quase todo dia com mais de uma página. Pedir a mesma página de novo
 * devolve a mesma resposta, mas a leitura seguinte do mesmo dia com outro tamanho de página veio completa, sem uma linha
 * repetida, nos 9 dias em que se mediu (a primeira leitura, de 500 ou de 437, veio falha nos dois casos). Tamanhos
 * próximos de 500 custam poucos pedidos a mais; os últimos são a folga para o caso de a segunda também vir falha.
 */
export const RETRY_PAGE_SIZES = [499, 437, 389] as const;
/** Leituras de uma janela, no máximo: a primeira, com o tamanho normal de página, e uma para cada tamanho acima. */
export const MAX_READ_PASSES = 1 + RETRY_PAGE_SIZES.length;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 5;
/** Teto de páginas de uma janela: só evita laço sem fim se a fonte nunca disser que acabou. */
const MAX_PAGES_PER_WINDOW = 5_000;

/**
 * Uma consulta da fonte: o endereço, o nome curto que vai nas mensagens de erro e como ela recebe a janela e o tamanho
 * de página.
 */
export interface ComprasGovEndpoint {
  name: 'resultados' | 'contratos' | 'orgaos' | 'unidades';
  path: string;
  /** Nomes dos parâmetros de data da janela; sem eles, a consulta não leva janela. */
  dateParams: { initial: string; final: string } | null;
  /** A consulta aceita `tamanhoPagina`; as de órgãos e unidades vêm sempre com páginas de 500. */
  pageSizeParam: boolean;
}

export const RESULTS_ENDPOINT: ComprasGovEndpoint = {
  name: 'resultados',
  path: RESULTS_PATH,
  dateParams: { initial: 'dataResultadoPncpInicial', final: 'dataResultadoPncpFinal' },
  pageSizeParam: true,
};
/** Contratos federais pelo início da vigência; exige `codigoOrgao` e janela de até 365 dias. */
export const CONTRACTS_BY_START_ENDPOINT: ComprasGovEndpoint = {
  name: 'contratos',
  path: '/modulo-contratos/1_consultarContratos',
  dateParams: { initial: 'dataVigenciaInicialMin', final: 'dataVigenciaInicialMax' },
  pageSizeParam: true,
};
/** Contratos federais pelo fim da vigência (os vigentes); exige `codigoOrgao` e janela de até 365 dias. */
export const CONTRACTS_BY_END_ENDPOINT: ComprasGovEndpoint = {
  name: 'contratos',
  path: '/modulo-contratos/1.2_consultarContratos_FimVigencia',
  dateParams: { initial: 'dataVigenciaFinalMin', final: 'dataVigenciaFinalMax' },
  pageSizeParam: true,
};
/** Órgãos (exige `statusOrgao`). */
export const AGENCIES_ENDPOINT: ComprasGovEndpoint = {
  name: 'orgaos',
  path: '/modulo-uasg/2_consultarOrgao',
  dateParams: null,
  pageSizeParam: false,
};
/** Unidades gestoras, as UASG (exige `statusUasg`). */
export const UNITS_ENDPOINT: ComprasGovEndpoint = {
  name: 'unidades',
  path: '/modulo-uasg/1_consultarUasg',
  dateParams: null,
  pageSizeParam: false,
};

/** Qual consulta e com que filtros além da janela (ex.: `codigoOrgao`); sem isto, os resultados. */
export interface ComprasGovRequest {
  endpoint?: ComprasGovEndpoint;
  params?: Record<string, string>;
}

/** Intervalo de datas (AAAA-MM-DD, os dois dias inclusive). */
export interface ComprasGovWindow {
  from: string;
  to: string;
}

/** Os parâmetros de data como a fonte os recebe. */
export interface ComprasGovDateParams {
  initial: string;
  final: string;
}

/**
 * Os parâmetros de data da janela. O fim é inclusivo na fonte (medido em 14/09/2026: o dia 14 deu 9.719 registros, o
 * dia 15 deu 8.328, e a janela de 14 a 15 deu 18.047, a soma dos dois): pede-se o último dia como ele é.
 */
export function windowParams(window: ComprasGovWindow): ComprasGovDateParams {
  return { initial: window.from, final: window.to };
}

export interface ComprasGovPage {
  records: unknown[];
  pageNumber: number;
  totalRecords: number;
  totalPages: number;
  remainingPages: number;
}

export interface ComprasGovRetryInfo {
  page: number;
  attempt: number;
  delayMs: number;
  reason: string;
}

export interface ComprasGovClientOptions {
  baseUrl?: string;
  pageSize?: number;
  requestIntervalMs: number;
  timeoutMs?: number;
  maxAttempts?: number;
  /** Primeira espera depois de um 429 sem Retry-After; dobra a cada tentativa. Padrão: 30 s. */
  rateLimitBackoffMs?: number;
  /** Teto de qualquer espera do Retry-After ou do 429. Padrão: 2 min. */
  maxRetryDelayMs?: number;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  onRetry?: (info: ComprasGovRetryInfo) => void;
}

/** Falha ao consultar a fonte. A mensagem vai para o painel da Coleta: sem o nome da fonte e sem o corpo da resposta. */
export class ComprasGovRequestError extends Error {
  constructor(
    message: string,
    readonly details: { endpoint: ComprasGovEndpoint['name']; page: number; attempts: number; status?: number },
  ) {
    super(message);
    this.name = 'ComprasGovRequestError';
  }
}

const pageEnvelopeSchema = z.object({
  resultado: z.array(z.unknown()),
  totalRegistros: z.number().int().nonnegative(),
  totalPaginas: z.number().int().nonnegative(),
  paginasRestantes: z.number().int().nonnegative(),
});

/** Uma resposta sem interpretação, para a sondagem olhar a forma real da fonte. */
export interface ComprasGovRawResponse {
  /** 0 quando nem chegou resposta (rede ou tempo esgotado). */
  status: number;
  /** Corpo como JSON; nulo se vazio, se não for JSON ou se a resposta não for 2xx. */
  json: unknown;
  retryAfter: string | null;
  /** Até 200 caracteres do corpo, só de resposta que não é 2xx. */
  errorPreview: string;
  elapsedMs: number;
}

const BASE_BACKOFF_MS = 1_000;
const BACKOFF_JITTER_RATIO = 0.25;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 30_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 120_000;
const ERROR_PREVIEW_LENGTH = 200;
const HTTP_TOO_MANY_REQUESTS = 429;

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Resposta que vale repetir: limite de taxa e erros do servidor. Os outros 4xx não mudam com nova tentativa. */
function isRetryableStatus(status: number): boolean {
  return status === HTTP_TOO_MANY_REQUESTS || status >= 500;
}

class RetryableFailure extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export class ComprasGovClient {
  private readonly baseUrl: string;
  private readonly pageSize: number;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly rateLimitBackoffMs: number;
  private readonly maxRetryDelayMs: number;
  private requests = 0;

  constructor(private readonly options: ComprasGovClientOptions) {
    this.baseUrl = (options.baseUrl ?? COMPRASGOV_BASE_URL).replace(/\/+$/, '');
    this.pageSize = options.pageSize ?? PAGE_SIZE;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.rateLimitBackoffMs = options.rateLimitBackoffMs ?? DEFAULT_RATE_LIMIT_BACKOFF_MS;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
  }

  /** Requisições HTTP feitas até agora (inclui as repetidas), para o registro da execução. */
  get requestCount(): number {
    return this.requests;
  }

  /**
   * Percorre as páginas de uma janela até `paginasRestantes = 0` (ou até `maxPages`). `pageSize` troca o tamanho da
   * página nesta leitura: a fonte pode entregar páginas que não se encaixam (um registro em duas e outro em nenhuma), e
   * cada tamanho dá outras páginas, então uma nova leitura com outro tamanho completa a anterior. `endpoint` e `params`
   * escolhem outra consulta (contratos, órgãos, unidades); as que não levam janela recebem `null`.
   */
  async *pages(
    window: ComprasGovWindow | null,
    options: { maxPages?: number; pageSize?: number } & ComprasGovRequest = {},
  ): AsyncGenerator<ComprasGovPage> {
    for (let pageNumber = 1; pageNumber <= MAX_PAGES_PER_WINDOW; pageNumber += 1) {
      const page = await this.fetchPage(window, pageNumber, options.pageSize, options);
      yield page;

      const reachedPageLimit = options.maxPages !== undefined && pageNumber >= options.maxPages;
      if (page.remainingPages <= 0 || page.records.length === 0 || reachedPageLimit) {
        return;
      }
    }
  }

  async fetchPage(
    window: ComprasGovWindow | null,
    pageNumber: number,
    pageSize: number = this.pageSize,
    request: ComprasGovRequest = {},
  ): Promise<ComprasGovPage> {
    const endpoint = request.endpoint ?? RESULTS_ENDPOINT;
    const dates = window === null ? null : windowParams(window);
    const url = this.buildUrl(dates, pageNumber, pageSize, request.params, endpoint);
    return this.withRetries(endpoint, pageNumber, (attempt) => this.requestPage(url, endpoint, pageNumber, attempt));
  }

  /**
   * Um pedido só, sem repetir e sem interpretar a resposta: devolve o que veio (inclusive 4xx e 429) para a
   * sondagem. Respeita a pausa entre pedidos. `dates` vai como está (a sondagem testa a fronteira da janela).
   */
  async requestRaw(
    dates: ComprasGovDateParams,
    pageNumber: number,
    pageSize: number = this.pageSize,
    extra: Record<string, string> = {},
    endpoint: ComprasGovEndpoint = RESULTS_ENDPOINT,
  ): Promise<ComprasGovRawResponse> {
    await this.pause();
    const url = this.buildUrl(dates, pageNumber, pageSize, extra, endpoint);
    const startedAt = this.now();
    let response: Response;
    try {
      response = await this.sendRequest(url);
    } catch (error) {
      const reason = error instanceof RetryableFailure ? error.message : 'erro de conexão';
      return { status: 0, json: null, retryAfter: null, errorPreview: reason, elapsedMs: this.now() - startedAt };
    }
    const retryAfter = response.headers.get('retry-after');
    const body = await response.text().catch(() => '');
    const elapsedMs = this.now() - startedAt;
    if (!response.ok) {
      return { status: response.status, json: null, retryAfter, errorPreview: body.slice(0, ERROR_PREVIEW_LENGTH), elapsedMs };
    }
    let json: unknown = null;
    try {
      json = body.trim() === '' ? null : JSON.parse(body);
    } catch {
      json = null;
    }
    return { status: response.status, json, retryAfter, errorPreview: '', elapsedMs };
  }

  /** Pausa entre requisições, repetição das falhas passageiras e erro tipado ao desistir. */
  private async withRetries<T>(endpoint: ComprasGovEndpoint, pageNumber: number, run: (attempt: number) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      if (attempt === 1) {
        await this.pause();
      }

      try {
        return await run(attempt);
      } catch (error) {
        if (!(error instanceof RetryableFailure)) {
          throw error;
        }
        if (attempt >= this.maxAttempts) {
          throw new ComprasGovRequestError(`A consulta de ${endpoint.name} falhou após ${attempt} tentativa(s): ${error.message}`, {
            endpoint: endpoint.name,
            page: pageNumber,
            attempts: attempt,
            ...(error.status !== undefined ? { status: error.status } : {}),
          });
        }
        const delayMs = this.retryDelay(error, attempt);
        this.options.onRetry?.({ page: pageNumber, attempt, delayMs, reason: error.message });
        await this.sleep(delayMs);
      }
    }
  }

  private async pause(): Promise<void> {
    if (this.requests > 0 && this.options.requestIntervalMs > 0) {
      await this.sleep(this.options.requestIntervalMs);
    }
  }

  private async requestPage(url: string, endpoint: ComprasGovEndpoint, pageNumber: number, attempt: number): Promise<ComprasGovPage> {
    const response = await this.sendRequest(url);

    if (response.status === 204) {
      return { records: [], pageNumber, totalRecords: 0, totalPages: 0, remainingPages: 0 };
    }

    if (!response.ok) {
      await response.text().catch(() => '');
      if (isRetryableStatus(response.status)) {
        throw new RetryableFailure(`HTTP ${response.status}`, response.status, this.retryAfterDelay(response.headers.get('retry-after')));
      }
      // Sem o corpo da resposta na mensagem: ela vai para o painel de Configurações › Coleta.
      throw new ComprasGovRequestError(`A consulta de ${endpoint.name} recebeu HTTP ${response.status}`, {
        endpoint: endpoint.name,
        page: pageNumber,
        attempts: attempt,
        status: response.status,
      });
    }

    // Corpo cortado ou fora do formato costuma ser falha passageira: vale repetir.
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new RetryableFailure('resposta que não é JSON', response.status);
    }
    const envelope = pageEnvelopeSchema.safeParse(body);
    if (!envelope.success) {
      throw new RetryableFailure('resposta fora do formato de página', response.status);
    }
    return {
      records: envelope.data.resultado,
      pageNumber,
      totalRecords: envelope.data.totalRegistros,
      totalPages: envelope.data.totalPaginas,
      remainingPages: envelope.data.paginasRestantes,
    };
  }

  private async sendRequest(url: string): Promise<Response> {
    this.requests += 1;
    try {
      return await this.fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === 'TimeoutError' ? 'tempo esgotado' : 'erro de conexão';
      throw new RetryableFailure(reason);
    }
  }

  private buildUrl(
    dates: ComprasGovDateParams | null,
    pageNumber: number,
    pageSize: number,
    extra: Record<string, string> = {},
    endpoint: ComprasGovEndpoint = RESULTS_ENDPOINT,
  ): string {
    const query = new URLSearchParams({ pagina: String(pageNumber) });
    if (endpoint.pageSizeParam) {
      query.set('tamanhoPagina', String(pageSize));
    }
    if (endpoint.dateParams !== null && dates !== null) {
      query.set(endpoint.dateParams.initial, dates.initial);
      query.set(endpoint.dateParams.final, dates.final);
    }
    for (const [name, value] of Object.entries(extra)) {
      query.set(name, value);
    }
    return `${this.baseUrl}${endpoint.path}?${query.toString()}`;
  }

  /** Retry-After quando vier; senão, espera longa no 429 e backoff curto nas outras falhas. */
  private retryDelay(failure: RetryableFailure, attempt: number): number {
    if (failure.retryAfterMs !== undefined) {
      return failure.retryAfterMs;
    }
    if (failure.status === HTTP_TOO_MANY_REQUESTS) {
      return Math.min(this.withJitter(this.rateLimitBackoffMs * 2 ** (attempt - 1)), this.maxRetryDelayMs);
    }
    return this.withJitter(BASE_BACKOFF_MS * 2 ** (attempt - 1));
  }

  /** Acrescenta até 25% de variação aleatória à espera. */
  private withJitter(milliseconds: number): number {
    return milliseconds + Math.floor(this.random() * milliseconds * BACKOFF_JITTER_RATIO);
  }

  /** Retry-After em segundos ou como data HTTP; inválido ou ausente cai no backoff. */
  private retryAfterDelay(header: string | null): number | undefined {
    if (!header) {
      return undefined;
    }
    const trimmed = header.trim();
    const milliseconds = /^\d+$/.test(trimmed) ? Number(trimmed) * 1000 : Date.parse(trimmed) - this.now();
    if (!Number.isFinite(milliseconds)) {
      return undefined;
    }
    return Math.min(Math.max(milliseconds, 0), this.maxRetryDelayMs);
  }
}
