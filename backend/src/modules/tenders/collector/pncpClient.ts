import { z } from 'zod/v4';

// Cliente da API de Consultas do PNCP (pública, sem autenticação). Recebe
// fetch, sleep, random e now por parâmetro, para os testes simularem HTTP e
// espera sem rede nem relógio real.

export const PNCP_ENDPOINTS = ['proposta', 'publicacao', 'atualizacao'] as const;
export type PncpEndpoint = (typeof PNCP_ENDPOINTS)[number];

export type PncpQueryParams = Record<string, string | number>;

export interface PncpPage {
  records: unknown[];
  pageNumber: number;
  totalRecords: number;
  totalPages: number;
  remainingPages: number;
}

export interface PncpRetryInfo {
  endpoint: PncpEndpoint;
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
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  onRetry?: (info: PncpRetryInfo) => void;
}

export class PncpRequestError extends Error {
  constructor(
    message: string,
    readonly details: { endpoint: PncpEndpoint; page: number; attempts: number; status?: number },
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

const BASE_BACKOFF_MS = 1_000;
const BACKOFF_JITTER_RATIO = 0.25;
// Um Retry-After muito longo travaria o Cron Job: espera no máximo 2 minutos.
const MAX_RETRY_AFTER_MS = 120_000;
const ERROR_BODY_PREVIEW_LENGTH = 200;

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Resposta que vale repetir: limite de taxa e erros do servidor. Os outros 4xx não mudam com nova tentativa. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
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
  private requests = 0;

  constructor(private readonly options: PncpClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
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

    for (let attempt = 1; ; attempt += 1) {
      if (attempt === 1 && this.requests > 0 && this.options.requestIntervalMs > 0) {
        await this.sleep(this.options.requestIntervalMs);
      }

      try {
        return await this.request(url, pageNumber, endpoint, attempt);
      } catch (error) {
        if (!(error instanceof RetryableFailure)) {
          throw error;
        }
        if (attempt >= this.options.maxAttempts) {
          throw new PncpRequestError(`PNCP falhou após ${attempt} tentativa(s): ${error.message}`, {
            endpoint,
            page: pageNumber,
            attempts: attempt,
            ...(error.status !== undefined ? { status: error.status } : {}),
          });
        }
        const delayMs = error.retryAfterMs ?? this.backoffDelay(attempt);
        this.options.onRetry?.({ endpoint, page: pageNumber, attempt, delayMs, reason: error.message });
        await this.sleep(delayMs);
      }
    }
  }

  private async request(url: string, pageNumber: number, endpoint: PncpEndpoint, attempt: number): Promise<PncpPage> {
    let response: Response;
    this.requests += 1;
    try {
      response = await this.fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === 'TimeoutError' ? 'tempo esgotado' : 'erro de conexão';
      throw new RetryableFailure(reason);
    }

    if (response.status === 204) {
      return { records: [], pageNumber, totalRecords: 0, totalPages: 0, remainingPages: 0 };
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (isRetryableStatus(response.status)) {
        throw new RetryableFailure(`HTTP ${response.status}`, response.status, this.retryAfterDelay(response.headers.get('retry-after')));
      }
      throw new PncpRequestError(`PNCP respondeu HTTP ${response.status}: ${body.slice(0, ERROR_BODY_PREVIEW_LENGTH)}`, {
        endpoint,
        page: pageNumber,
        attempts: attempt,
        status: response.status,
      });
    }

    // Corpo cortado ou fora do formato costuma ser falha passageira: vale repetir.
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new RetryableFailure('resposta que não é JSON', response.status);
    }
    const envelope = pageEnvelopeSchema.safeParse(json);
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

  private buildUrl(endpoint: PncpEndpoint, params: PncpQueryParams, pageNumber: number): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      query.set(key, String(value));
    }
    query.set('pagina', String(pageNumber));
    query.set('tamanhoPagina', String(this.options.pageSize));
    return `${this.options.baseUrl}/v1/contratacoes/${endpoint}?${query.toString()}`;
  }

  /** Backoff exponencial (1 s, 2 s, 4 s, 8 s...) com até 25% de variação aleatória. */
  private backoffDelay(attempt: number): number {
    const exponential = BASE_BACKOFF_MS * 2 ** (attempt - 1);
    return exponential + Math.floor(this.random() * exponential * BACKOFF_JITTER_RATIO);
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
    return Math.min(Math.max(milliseconds, 0), MAX_RETRY_AFTER_MS);
  }
}
