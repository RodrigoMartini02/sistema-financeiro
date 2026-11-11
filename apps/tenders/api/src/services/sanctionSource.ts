import type { SanctionBase, SanctionRecord } from '../domains';
import { parseSanctionDate } from './sanctionStatus';

// Fonte das sanções (item 6): a API de dados do Portal da Transparência (CGU), que serve o CEIS, o CNEP e o CEPIM. A chave vai
// no cabeçalho `chave-api-dados` e fica só no servidor: nunca em resposta, log, erro ou sondagem. O CNPJ ou CPF vai como
// parâmetro de um GET (a API não aceita outro jeito), então a URL, que carrega o documento, também nunca vai para log nem para
// mensagem de erro, e o corpo das respostas de erro nunca é lido.
//
// A fonte lista os registros do documento consultado, página a página (lista sem total). Duas defesas contra um resultado falso:
// 1. o código que o registro mostra (CNPJ inteiro ou CPF mascarado) é conferido contra o consultado: registro de outro
//    documento é descartado (o filtro da fonte pode não casar como se espera);
// 2. registro sem código legível não conta como conferido: a base falha ("não foi possível confirmar") e nunca vira
//    "sem registro", que seria um falso negativo.
// O que a fonte não diz (limites de uso, tamanho da página, como o CPF aparece mascarado) é conferido pela sondagem
// (collector/sanctionProbe.ts) com a chave real.

export const PORTAL_API_URL = 'https://api.portaldatransparencia.gov.br/api-de-dados';
export const PORTAL_KEY_HEADER = 'chave-api-dados';
export const PORTAL_API_KEY_VARIABLE = 'PORTAL_TRANSPARENCIA_API_KEY';
export const PORTAL_REQUEST_INTERVAL_VARIABLE = 'PORTAL_TRANSPARENCIA_REQUEST_INTERVAL_MS';
/** O nome só diz o que o cliente é: sem nome de produto, de empresa nem dado de ninguém. */
export const SANCTION_USER_AGENT = 'sanction-lookup/1.0';
export const SANCTION_REQUEST_TIMEOUT_MS = 10_000;
/** Tempo total de uma consulta (todas as bases do assunto), contando a espera na fila. */
export const SANCTION_CHECK_DEADLINE_MS = 45_000;
/** No máximo duas tentativas por página: só erro de rede e 5xx ganham a segunda. */
export const SANCTION_MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1_000;
/** Páginas lidas por base; se a última ainda vier cheia, o resultado fica marcado como incompleto. */
export const SANCTION_MAX_PAGES = 3;
export const SANCTION_DEFAULT_INTERVAL_MS = 1_000;
export const SANCTION_MIN_INTERVAL_MS = 250;
export const SANCTION_MAX_INTERVAL_MS = 30_000;
/** Dígitos de um CPF mascarado que precisam aparecer para o código valer como conferido. */
export const MIN_VISIBLE_CODE_DIGITS = 6;
const MAX_TEXT_LENGTH = 300;
const MAX_ID_LENGTH = 40;

/** O caminho de cada base na API. */
export const SANCTION_BASE_PATHS: Readonly<Record<SanctionBase, string>> = { CEIS: 'ceis', CNEP: 'cnep', CEPIM: 'cepim' };
/** O parâmetro que filtra pelo documento: o CEPIM só aceita CNPJ. */
export const SANCTION_FILTER_PARAMS: Readonly<Record<SanctionBase, string>> = {
  CEIS: 'codigoSancionado',
  CNEP: 'codigoSancionado',
  CEPIM: 'cnpjSancionado',
};

/** A fonte não respondeu a contento: fora do ar, chave recusada, tempo esgotado ou resposta inesperada. */
export class SanctionSourceUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'SanctionSourceUnavailableError';
  }
}

/** A fonte recusou por excesso de pedidos (429): vale esperar um pouco. */
export class SanctionSourceRateLimitedError extends Error {
  constructor() {
    super('HTTP 429');
    this.name = 'SanctionSourceRateLimitedError';
  }
}

export interface SanctionSearchResult {
  /** Os registros do documento, já reduzidos e sem repetição. */
  records: SanctionRecord[];
  /** Mesmo na última página lida a fonte ainda trazia registros: pode haver mais. */
  truncated: boolean;
  /** Quantos registros a fonte trouxe com o código de outro documento (descartados). */
  discarded: number;
}

/** O que a API usa da fonte; os testes trocam por uma simulada. */
export interface SanctionSource {
  /**
   * Os registros de uma base para um documento: `document` são só os dígitos (CNPJ com 14; CPF com 11, menos no CEPIM, que só
   * aceita CNPJ). `signal` encerra a consulta (o prazo total).
   */
  search(base: SanctionBase, document: string, options?: { signal?: AbortSignal }): Promise<SanctionSearchResult>;
}

type Rec = Record<string, unknown>;

const isRecord = (value: unknown): value is Rec => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Texto aparado, com os espaços repetidos unidos e cortado no tamanho; vazio, nulo ou de outro tipo vira null. */
function cleanText(value: unknown, maxLength: number = MAX_TEXT_LENGTH): string | null {
  const raw = typeof value === 'number' ? String(value) : value;
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.replace(/\s+/g, ' ').trim();
  return text === '' ? null : text.slice(0, maxLength);
}

function valueAt(record: Rec, ...path: string[]): unknown {
  let node: unknown = record;
  for (const key of path) {
    if (!isRecord(node)) {
      return undefined;
    }
    node = node[key];
  }
  return node;
}

function joinText(parts: ReadonlyArray<string | null>, separator: string): string | null {
  const text = parts.filter((part): part is string => part !== null).join(separator);
  return text === '' ? null : text.slice(0, MAX_TEXT_LENGTH);
}

// --- O código do registro ------------------------------------------------------------------------------------------------

/** Onde cada base mostra o código (CNPJ ou CPF, formatado, às vezes mascarado) de quem foi sancionado. */
export const CODE_PATHS: Readonly<Record<SanctionBase, ReadonlyArray<readonly string[]>>> = {
  CEIS: [['sancionado', 'codigoFormatado'], ['pessoa', 'cnpjFormatado'], ['pessoa', 'cpfFormatado']],
  CNEP: [['sancionado', 'codigoFormatado'], ['pessoa', 'cnpjFormatado'], ['pessoa', 'cpfFormatado']],
  CEPIM: [['pessoaJuridica', 'cnpjFormatado']],
};

/** Um dígito que aparece, ou null para o que a máscara esconde. */
export type CodePattern = ReadonlyArray<string | null>;

/**
 * Lê o código como a fonte o escreve ("12.345.678/0001-95", "***.456.789-**"): pontuação é ignorada, `*`, `X` e `•` escondem um
 * dígito. Vale com 11 (CPF) ou 14 (CNPJ) posições e, mascarado, com ao menos 6 dígitos visíveis; senão, null (não se lê).
 */
export function readCodePattern(value: unknown): CodePattern | null {
  if (typeof value !== 'string') {
    return null;
  }
  const pattern: Array<string | null> = [];
  for (const char of value.trim()) {
    if (/\d/.test(char)) {
      pattern.push(char);
    } else if (/[*xX•#?]/.test(char)) {
      pattern.push(null);
    } else if (!/[.\-/\s]/.test(char)) {
      return null;
    }
  }
  if (pattern.length !== 11 && pattern.length !== 14) {
    return null;
  }
  return pattern.filter((digit) => digit !== null).length >= MIN_VISIBLE_CODE_DIGITS ? pattern : null;
}

/** O código lido bate com o documento consultado, posição por posição (a máscara combina com qualquer dígito)? */
export function codeMatchesDocument(pattern: CodePattern, document: string): boolean {
  return pattern.length === document.length && pattern.every((digit, index) => digit === null || digit === document[index]);
}

export type RecordCodeCheck = 'match' | 'mismatch' | 'unreadable';

/** Confere o código que o registro mostra contra o documento consultado. */
export function checkRecordCode(base: SanctionBase, record: Rec, document: string): RecordCodeCheck {
  const patterns = CODE_PATHS[base]
    .map((path) => readCodePattern(valueAt(record, ...path)))
    .filter((pattern): pattern is CodePattern => pattern !== null);
  if (patterns.length === 0) {
    return 'unreadable';
  }
  return patterns.some((pattern) => codeMatchesDocument(pattern, document)) ? 'match' : 'mismatch';
}

// --- O registro reduzido -------------------------------------------------------------------------------------------------

function idOf(value: unknown): string | null {
  return cleanText(value, MAX_ID_LENGTH);
}

/**
 * Reduz um registro da fonte ao que a tela usa. Nada de quem foi sancionado (nome, CPF, CNPJ) passa daqui: o assunto da
 * consulta já é conhecido, e o resto da resposta é descartado.
 */
export function toSanctionRecord(base: SanctionBase, raw: Rec): SanctionRecord {
  if (base === 'CEPIM') {
    const agreementNumber = cleanText(valueAt(raw, 'convenio', 'numero'), 60);
    return {
      id: idOf(raw['id']),
      category: cleanText(raw['motivo']),
      organ: cleanText(valueAt(raw, 'orgaoSuperior', 'nome')),
      startDate: null,
      endDate: null,
      legalBasis: null,
      process: null,
      note: joinText([agreementNumber === null ? null : `Convênio ${agreementNumber}`, cleanText(valueAt(raw, 'convenio', 'objeto'))], ' · '),
    };
  }

  const legalBasis = Array.isArray(raw['fundamentacao'])
    ? joinText(
        raw['fundamentacao'].map((item) => (isRecord(item) ? (cleanText(item['descricao'], 120) ?? cleanText(item['codigo'], 60)) : null)),
        '; ',
      )
    : null;
  const scope = cleanText(raw['abrangenciaDefinidaDecisaoJudicial'], 150);
  const fine = base === 'CNEP' ? cleanText(raw['valorMulta'], 40) : null;
  return {
    id: idOf(raw['id']),
    category: cleanText(valueAt(raw, 'tipoSancao', 'descricaoResumida')) ?? cleanText(valueAt(raw, 'tipoSancao', 'descricaoPortal')),
    organ: cleanText(valueAt(raw, 'orgaoSancionador', 'nome')),
    startDate: parseSanctionDate(raw['dataInicioSancao']),
    endDate: parseSanctionDate(raw['dataFimSancao']),
    legalBasis,
    process: cleanText(raw['numeroProcesso'], 100),
    note: joinText(
      [scope === null ? null : `Abrangência: ${scope}`, fine === null ? null : `Multa: ${fine}`, cleanText(raw['informacoesAdicionaisDoOrgaoSancionador'], 200)],
      ' · ',
    ),
  };
}

/**
 * Lê uma página da fonte: confere o código de cada registro, descarta o de outro documento e reduz o resto. Registro que não é
 * objeto, ou sem código legível, derruba a leitura (a base não pode virar "sem registro" sem ser conferida).
 */
function readPage(
  base: SanctionBase,
  items: readonly unknown[],
  document: string,
  seen: Set<string>,
  records: SanctionRecord[],
): number {
  let discarded = 0;
  for (const item of items) {
    if (!isRecord(item)) {
      throw new SanctionSourceUnavailableError('Unexpected record format');
    }
    const check = checkRecordCode(base, item, document);
    if (check === 'unreadable') {
      throw new SanctionSourceUnavailableError('Record without a readable code');
    }
    if (check === 'mismatch') {
      discarded += 1;
      continue;
    }
    const record = toSanctionRecord(base, item);
    const key = record.id ?? JSON.stringify(record);
    if (!seen.has(key)) {
      seen.add(key);
      records.push(record);
    }
  }
  return discarded;
}

// --- O cliente do portal -------------------------------------------------------------------------------------------------

export interface PortalSanctionSourceOptions {
  apiKey: string;
  baseUrl?: string;
  /** Para os testes; o servidor usa o `fetch` do Node. */
  fetchImpl?: typeof fetch;
  /** Intervalo mínimo entre o início de dois pedidos, para todas as consultas desta instância (fila única). */
  requestIntervalMs?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  maxPages?: number;
  retryDelayMs?: number;
  /** Relógio e espera, para os testes. */
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Fila única: cada pedido espera a sua vez e o intervalo desde o início do anterior. */
function createPacer(intervalMs: number, now: () => number, sleep: (milliseconds: number) => Promise<void>): () => Promise<void> {
  let tail: Promise<void> = Promise.resolve();
  let lastStartedAt = Number.NEGATIVE_INFINITY;
  return () => {
    const turn = tail.then(async () => {
      const waitMs = lastStartedAt + intervalMs - now();
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      lastStartedAt = now();
    });
    tail = turn;
    return turn;
  };
}

function assertDocument(base: SanctionBase, document: string): void {
  const valid = base === 'CEPIM' ? /^\d{14}$/.test(document) : /^(\d{11}|\d{14})$/.test(document);
  if (!valid || SANCTION_BASE_PATHS[base] === undefined) {
    // Nada do que o cliente escreve chega à URL da fonte, e a mensagem não repete o documento.
    throw new Error('The sanction lookup needs a known base and the document as digits (CNPJ with 14; CPF with 11, except for the CEPIM)');
  }
}

/** Solta o corpo de uma resposta que não será lida, para a conexão voltar ao uso. */
function discardBody(response: Response): void {
  try {
    void response.body?.cancel().catch(() => undefined);
  } catch {
    // Corpo já usado ou sem corpo: nada a soltar.
  }
}

/**
 * A fonte de verdade: o Portal da Transparência. Cada tentativa tem tempo limite; erro de rede e 5xx ganham mais uma
 * tentativa curta; 429 vira "limitada" na hora; 400, 401, 403 e 404 viram "indisponível" (404 também: sem prova de que a fonte
 * responde 404 para "sem registro", a base falha em vez de virar "sem registro"). O corpo das respostas de erro nunca é lido.
 */
export function createPortalSanctionSource(options: PortalSanctionSourceOptions): SanctionSource {
  const baseUrl = options.baseUrl ?? PORTAL_API_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? SANCTION_REQUEST_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? SANCTION_MAX_ATTEMPTS;
  const maxPages = options.maxPages ?? SANCTION_MAX_PAGES;
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const pace = createPacer(options.requestIntervalMs ?? SANCTION_DEFAULT_INTERVAL_MS, now, sleep);

  async function requestPage(base: SanctionBase, document: string, page: number, signal: AbortSignal | undefined): Promise<unknown[]> {
    const url = new URL(`${baseUrl}/${SANCTION_BASE_PATHS[base]}`);
    url.searchParams.set(SANCTION_FILTER_PARAMS[base], document);
    url.searchParams.set('pagina', String(page));

    let reason = 'No attempt was made';
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (attempt > 1 && retryDelayMs > 0) {
        await sleep(retryDelayMs);
      }
      await pace();
      if (signal?.aborted) {
        throw new SanctionSourceUnavailableError('Deadline exceeded');
      }

      let response: Response;
      try {
        const timeout = AbortSignal.timeout(timeoutMs);
        response = await fetchImpl(url.toString(), {
          headers: { accept: 'application/json', 'user-agent': SANCTION_USER_AGENT, [PORTAL_KEY_HEADER]: options.apiKey },
          signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
        });
      } catch (error) {
        if (signal?.aborted) {
          throw new SanctionSourceUnavailableError('Deadline exceeded');
        }
        // O nome do erro (TimeoutError, TypeError...) basta: a mensagem e a `cause` podem trazer a URL, com o documento.
        reason = `Request failed (${error instanceof Error ? error.name : 'unknown'})`;
        continue;
      }

      if (response.status === 429) {
        discardBody(response);
        throw new SanctionSourceRateLimitedError();
      }
      if (response.status >= 500) {
        discardBody(response);
        reason = `HTTP ${response.status}`;
        continue;
      }
      if (!response.ok) {
        discardBody(response);
        throw new SanctionSourceUnavailableError(`HTTP ${response.status}`);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        reason = 'Response was not valid JSON';
        continue;
      }
      if (!Array.isArray(payload)) {
        throw new SanctionSourceUnavailableError('Unexpected response format');
      }
      return payload;
    }
    throw new SanctionSourceUnavailableError(reason);
  }

  return {
    async search(base, document, searchOptions = {}) {
      assertDocument(base, document);
      const records: SanctionRecord[] = [];
      const seen = new Set<string>();
      let discarded = 0;
      let truncated = false;
      for (let page = 1; page <= maxPages; page += 1) {
        const items = await requestPage(base, document, page, searchOptions.signal);
        if (items.length === 0) {
          break;
        }
        discarded += readPage(base, items, document, seen, records);
        truncated = page === maxPages;
      }
      return { records, truncated, discarded };
    },
  };
}

/** O intervalo do ambiente em milissegundos; ausente, o padrão, e inválido (não inteiro ou fora do intervalo), o padrão com aviso. */
export function readSanctionRequestInterval(value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    return SANCTION_DEFAULT_INTERVAL_MS;
  }
  const interval = Number(value);
  if (Number.isInteger(interval) && interval >= SANCTION_MIN_INTERVAL_MS && interval <= SANCTION_MAX_INTERVAL_MS) {
    return interval;
  }
  console.warn(
    `${PORTAL_REQUEST_INTERVAL_VARIABLE} is invalid (use an integer from ${SANCTION_MIN_INTERVAL_MS} to ${SANCTION_MAX_INTERVAL_MS}); using ${SANCTION_DEFAULT_INTERVAL_MS} ms.`,
  );
  return SANCTION_DEFAULT_INTERVAL_MS;
}

/**
 * A fonte do servidor: sem a chave (`PORTAL_TRANSPARENCIA_API_KEY`), null, e a consulta de sanções fica "indisponível".
 * O intervalo entre pedidos (`PORTAL_TRANSPARENCIA_REQUEST_INTERVAL_MS`, padrão 1000) é opcional.
 */
export function createPortalSanctionSourceFromEnv(env: NodeJS.ProcessEnv): SanctionSource | null {
  const apiKey = env[PORTAL_API_KEY_VARIABLE]?.trim();
  if (!apiKey) {
    return null;
  }
  return createPortalSanctionSource({ apiKey, requestIntervalMs: readSanctionRequestInterval(env[PORTAL_REQUEST_INTERVAL_VARIABLE]) });
}
