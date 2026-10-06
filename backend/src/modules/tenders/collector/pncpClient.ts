import { z } from 'zod/v4';

// Cliente do PNCP (público, sem autenticação): consultas paginadas da API de
// Consultas, usadas pelo coletor, e listas de itens e arquivos de uma compra
// da API principal, abertas na tela de detalhe. Recebe fetch, sleep, random e
// now por parâmetro, para os testes simularem HTTP e espera sem rede nem
// relógio real.

export const PNCP_ENDPOINTS = ['proposta', 'publicacao', 'atualizacao'] as const;
export type PncpEndpoint = (typeof PNCP_ENDPOINTS)[number];

/** Listas da API principal do PNCP (`/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/...`). */
export const PNCP_DETAIL_LISTS = ['itens', 'arquivos'] as const;
export type PncpDetailList = (typeof PNCP_DETAIL_LISTS)[number];

/** O que foi pedido ao PNCP, para os erros e o log de repetições. */
export type PncpRequestTarget = PncpEndpoint | PncpDetailList;

export type PncpQueryParams = Record<string, string | number>;

export interface PncpPage {
  records: unknown[];
  pageNumber: number;
  totalRecords: number;
  totalPages: number;
  remainingPages: number;
}

/** Compra no PNCP: CNPJ do órgão, ano e sequencial (os mesmos do número de controle). */
export interface PncpPurchaseKey {
  agencyCnpj: string;
  year: number;
  sequence: number;
}

export interface PncpRetryInfo {
  endpoint: PncpRequestTarget;
  page: number;
  attempt: number;
  delayMs: number;
  reason: string;
}

export interface PncpClientOptions {
  baseUrl: string;
  pageSize: number;
  requestIntervalMs: number;
  timeoutMs: number;
  maxAttempts: number;
  /** Primeira espera depois de um 429 sem Retry-After; dobra a cada tentativa. Padrão: 30 s. */
  rateLimitBackoffMs?: number;
  /** Teto de qualquer espera do Retry-After ou do 429. Padrão: 2 min. */
  maxRetryDelayMs?: number;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  onRetry?: (info: PncpRetryInfo) => void;
}

export class PncpRequestError extends Error {
  constructor(
    message: string,
    readonly details: { endpoint: PncpRequestTarget; page: number; attempts: number; status?: number },
  ) {
    super(message);
    this.name = 'PncpRequestError';
  }
}

const pageEnvelopeSchema = z.object({
  data: z.array(z.unknown()),
  totalRegistros: z.number().int().nonnegative(),
  totalPaginas: z.number().int().nonnegative(),
  numeroPagina: z.number().int().nonnegative(),
  paginasRestantes: z.number().int().nonnegative(),
});

const detailListSchema = z.array(z.unknown());

const BASE_BACKOFF_MS = 1_000;
const BACKOFF_JITTER_RATIO = 0.25;
// Medido na Fase 1: depois de um 429, o PNCP continuou recusando por mais de
// 18 s, sem Retry-After. Esperas curtas (1, 2, 4, 8 s) gastavam as tentativas.
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 30_000;
// Uma espera muito longa travaria o Cron Job: no máximo 2 minutos.
const DEFAULT_MAX_RETRY_DELAY_MS = 120_000;
const ERROR_BODY_PREVIEW_LENGTH = 200;
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

export class PncpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly rateLimitBackoffMs: number;
  private readonly maxRetryDelayMs: number;
  private requests = 0;

  constructor(private readonly options: PncpClientOptions) {
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

  /** Percorre as páginas de uma consulta até `paginasRestantes = 0` (ou até `maxPages`). */
  async *pages(endpoint: PncpEndpoint, params: PncpQueryParams, options: { maxPages?: number } = {}): AsyncGenerator<PncpPage> {
    for (let pageNumber = 1; ; pageNumber += 1) {
      const page = await this.fetchPage(endpoint, params, pageNumber);
      yield page;

      const reachedPageLimit = options.maxPages !== undefined && pageNumber >= options.maxPages;
      if (page.remainingPages <= 0 || page.records.length === 0 || reachedPageLimit) {
        return;
      }
    }
  }

  async fetchPage(endpoint: PncpEndpoint, params: PncpQueryParams, pageNumber: number): Promise<PncpPage> {
    const url = this.buildUrl(endpoint, params, pageNumber);
    return this.withRetries(endpoint, pageNumber, (attempt) => this.requestPage(url, endpoint, pageNumber, attempt));
  }

  /**
   * Uma página de itens ou arquivos de uma compra, na API principal do PNCP
   * (`baseUrl` = https://pncp.gov.br/api/pncp). Compra que o PNCP não conhece
   * (HTTP 404) volta `null`, sem repetir.
   */
  async fetchDetailList(list: PncpDetailList, purchase: PncpPurchaseKey, pageNumber: number): Promise<unknown[] | null> {
    const query = new URLSearchParams({ pagina: String(pageNumber), tamanhoPagina: String(this.options.pageSize) });
    const purchasePath = `${encodeURIComponent(purchase.agencyCnpj)}/compras/${purchase.year}/${purchase.sequence}`;
    const url = `${this.options.baseUrl}/v1/orgaos/${purchasePath}/${list}?${query.toString()}`;
    return this.withRetries(list, pageNumber, (attempt) => this.requestDetailList(url, list, pageNumber, attempt));
  }

  /** Pausa entre requisições, repetição das falhas passageiras e erro tipado ao desistir. */
  private async withRetries<T>(target: PncpRequestTarget, pageNumber: number, run: (attempt: number) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      if (attempt === 1 && this.requests > 0 && this.options.requestIntervalMs > 0) {
        await this.sleep(this.options.requestIntervalMs);
      }

      try {
        return await run(attempt);
      } catch (error) {
        if (!(error instanceof RetryableFailure)) {
          throw error;
        }
        if (attempt >= this.options.maxAttempts) {
          throw new PncpRequestError(`PNCP falhou após ${attempt} tentativa(s): ${error.message}`, {
            endpoint: target,
            page: pageNumber,
            attempts: attempt,
            ...(error.status !== undefined ? { status: error.status } : {}),
          });
        }
        const delayMs = this.retryDelay(error, attempt);
        this.options.onRetry?.({ endpoint: target, page: pageNumber, attempt, delayMs, reason: error.message });
        await this.sleep(delayMs);
      }
    }
  }

  private async requestPage(url: string, endpoint: PncpEndpoint, pageNumber: number, attempt: number): Promise<PncpPage> {
    const response = await this.send(url);

    if (response.status === 204) {
      return { records: [], pageNumber, totalRecords: 0, totalPages: 0, remainingPages: 0 };
    }

    await this.rejectFailedResponse(response, endpoint, pageNumber, attempt);

    // Corpo cortado ou fora do formato costuma ser falha passageira: vale repetir.
    const envelope = pageEnvelopeSchema.safeParse(await this.readJson(response));
    if (!envelope.success) {
      throw new RetryableFailure('resposta fora do formato de página', response.status);
    }

    return {
      records: envelope.data.data,
      pageNumber,
      totalRecords: envelope.data.totalRegistros,
      totalPages: envelope.data.totalPaginas,
      remainingPages: envelope.data.paginasRestantes,
    };
  }

  private async requestDetailList(url: string, list: PncpDetailList, pageNumber: number, attempt: number): Promise<unknown[] | null> {
    const response = await this.send(url);

    if (response.status === 204) {
      return [];
    }
    if (response.status === 404) {
      await response.text().catch(() => '');
      return null;
    }

    await this.rejectFailedResponse(response, list, pageNumber, attempt);

    const records = detailListSchema.safeParse(await this.readJson(response));
    if (!records.success) {
      throw new RetryableFailure('resposta que não é lista', response.status);
    }
    return records.data;
  }

  private async send(url: string): Promise<Response> {
    this.requests += 1;
    try {
      return await this.fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === 'TimeoutError' ? 'tempo esgotado' : 'erro de conexão';
      throw new RetryableFailure(reason);
    }
  }

  /** Resposta de erro: repete limite de taxa e 5xx; os outros viram erro tipado. */
  private async rejectFailedResponse(response: Response, target: PncpRequestTarget, pageNumber: number, attempt: number): Promise<void> {
    if (response.ok) {
      return;
    }
    const body = await response.text().catch(() => '');
    if (isRetryableStatus(response.status)) {
      throw new RetryableFailure(`HTTP ${response.status}`, response.status, this.retryAfterDelay(response.headers.get('retry-after')));
    }
    throw new PncpRequestError(`PNCP respondeu HTTP ${response.status}: ${body.slice(0, ERROR_BODY_PREVIEW_LENGTH)}`, {
      endpoint: target,
      page: pageNumber,
      attempts: attempt,
      status: response.status,
    });
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new RetryableFailure('resposta que não é JSON', response.status);
    }
  }

  private buildUrl(endpoint: PncpEndpoint, params: PncpQueryParams, pageNumber: number): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      query.set(key, String(value));
    }
    query.set('pagina', String(pageNumber));
    query.set('tamanhoPagina', String(this.options.pageSize));
    return `${this.options.baseUrl}/v1/contratacoes/${endpoint}?${query.toString()}`;
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
