import { z } from 'zod/v4';
import { addCalendarDays } from './dates';

// Cliente do Compras.gov.br, dados abertos (público, sem autenticação): os resultados das licitações da Lei
// 14.133, uma linha por item e resultado (plano .plans/licitacoes-vencedores.md). Recebe fetch, sleep, random e now
// por parâmetro, como o do PNCP, para os testes simularem HTTP e espera sem rede nem relógio real.
//
// ATENÇÃO: o endereço, o envelope e os nomes dos parâmetros são SUPOSIÇÕES (S1 a S4 do plano). Nada daqui foi lido
// na fonte oficial; a sondagem (`winners-probe`) confirma ou corrige. A lógica de repetição é cópia da do PncpClient
// de propósito (o PncpClient está em produção e não muda); a dívida está registrada no plano.

export const COMPRASGOV_BASE_URL = 'https://dadosabertos.compras.gov.br';
/** Resultados de itens de contratações da Lei 14.133 (S1). */
export const RESULTS_PATH = '/modulo-contratacoes/3_consultarResultadoItensContratacoes_PNCP_14133';
export const RESULTS_PAGE_SIZE = 500;
/** O fim da janela é exclusivo na fonte (S3): pede-se o último dia mais um. A sondagem confirma. */
export const WINDOW_END_EXCLUSIVE = true;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 5;
/** Teto de páginas de uma janela: só evita laço sem fim se a fonte nunca disser que acabou. */
const MAX_PAGES_PER_WINDOW = 5_000;

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

/** Os parâmetros de data da janela, com o fim ajustado pela regra de fronteira. */
export function windowParams(window: ComprasGovWindow): ComprasGovDateParams {
  return { initial: window.from, final: WINDOW_END_EXCLUSIVE ? addCalendarDays(window.to, 1) : window.to };
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
    readonly details: { endpoint: 'resultados'; page: number; attempts: number; status?: number },
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
    this.pageSize = options.pageSize ?? RESULTS_PAGE_SIZE;
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

  /** Percorre as páginas de uma janela até `paginasRestantes = 0` (ou até `maxPages`). */
  async *pages(window: ComprasGovWindow, options: { maxPages?: number } = {}): AsyncGenerator<ComprasGovPage> {
    for (let pageNumber = 1; pageNumber <= MAX_PAGES_PER_WINDOW; pageNumber += 1) {
      const page = await this.fetchPage(window, pageNumber);
      yield page;

      const reachedPageLimit = options.maxPages !== undefined && pageNumber >= options.maxPages;
      if (page.remainingPages <= 0 || page.records.length === 0 || reachedPageLimit) {
        return;
      }
    }
  }

  async fetchPage(window: ComprasGovWindow, pageNumber: number): Promise<ComprasGovPage> {
    const url = this.buildUrl(windowParams(window), pageNumber, this.pageSize);
    return this.withRetries(pageNumber, (attempt) => this.requestPage(url, pageNumber, attempt));
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
  ): Promise<ComprasGovRawResponse> {
    await this.pause();
    const url = this.buildUrl(dates, pageNumber, pageSize, extra);
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
  private async withRetries<T>(pageNumber: number, run: (attempt: number) => Promise<T>): Promise<T> {
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
          throw new ComprasGovRequestError(`A consulta de resultados falhou após ${attempt} tentativa(s): ${error.message}`, {
            endpoint: 'resultados',
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

  private async requestPage(url: string, pageNumber: number, attempt: number): Promise<ComprasGovPage> {
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
      throw new ComprasGovRequestError(`A consulta de resultados recebeu HTTP ${response.status}`, {
        endpoint: 'resultados',
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

  private buildUrl(dates: ComprasGovDateParams, pageNumber: number, pageSize: number, extra: Record<string, string> = {}): string {
    const query = new URLSearchParams({
      pagina: String(pageNumber),
      tamanhoPagina: String(pageSize),
      dataResultadoPncpInicial: dates.initial,
      dataResultadoPncpFinal: dates.final,
      ...extra,
    });
    return `${this.baseUrl}${RESULTS_PATH}?${query.toString()}`;
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
