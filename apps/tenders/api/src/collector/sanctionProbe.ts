import type { SanctionBase } from '../domains';
import {
  CODE_PATHS,
  PORTAL_API_URL,
  PORTAL_KEY_HEADER,
  SANCTION_BASE_PATHS,
  SANCTION_FILTER_PARAMS,
  SANCTION_REQUEST_TIMEOUT_MS,
  SANCTION_USER_AGENT,
  checkRecordCode,
} from '../services/sanctionSource';

// Sondagem do portal de sanções (`sanctions-probe`, plano .plans/licitacoes-6-sancoes.md): lê a fonte com a chave real e
// imprime só a ESTRUTURA do que ela entrega, para confirmar o que o OpenAPI não diz antes de ligar a consulta para os clientes:
// status HTTP, nomes dos campos, formato das datas e dos códigos (CPF mascarado ou não), tamanho da página, como "sem
// registro" aparece (lista vazia ou 404), cabeçalhos de limite e tempos, e se o filtro pelo documento da fonte casa. É somente
// leitura e não usa banco nem R2. São poucos pedidos (as três bases sem filtro e, para cada documento dado, as bases dele),
// espaçados pelo intervalo configurado.
// Privacidade: o relatório NUNCA leva nome, documento (nem parcial), URL, chave ou valor de campo; datas e códigos aparecem só
// como forma (dígitos viram 9, letras viram A, a máscara `*` fica), e os documentos dados são chamados de cnpj#1, cnpj#2 e cpf.

const RATE_LIMIT_HEADER = /rate|limit|retry|quota|remaining|reset/i;
const MAX_FIELD_DEPTH = 3;
const MAX_FIELD_PATHS = 80;
const MAX_SHAPES_PER_FIELD = 6;

type Rec = Record<string, unknown>;

const isRecord = (value: unknown): value is Rec => typeof value === 'object' && value !== null && !Array.isArray(value);

export interface SanctionProbeOptions {
  /** CNPJs a consultar (14 dígitos): cada um nas três bases. */
  cnpjs: readonly string[];
  /** CPF a consultar (11 dígitos): no CEIS e no CNEP. Nulo: nenhum. */
  cpf: string | null;
}

export interface SanctionProbeDeps {
  apiKey: string;
  /** Para os testes; o comando usa o `fetch` do Node. */
  fetchImpl?: typeof fetch;
  requestIntervalMs: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  /** Andamento para quem espera o comando (vai para a saída de erro, longe do relatório). */
  progress?: (message: string) => void;
}

export interface ProbeRequestSummary {
  status: number | null;
  ok: boolean;
  elapsedMs: number | null;
  /** O que falhou, sem URL nem dado: "Request failed (TimeoutError)", "Response was not valid JSON". */
  error: string | null;
  contentType: string | null;
  /** Só os cabeçalhos que parecem de limite de uso (nome e valor). */
  rateLimitHeaders: Record<string, string>;
}

export interface ProbeSample {
  request: ProbeRequestSummary;
  /** A resposta é uma lista (`array`), um objeto ou outra coisa; nulo: sem resposta lida. */
  bodyShape: 'array' | 'object' | 'other' | null;
  /** Quantos registros a primeira página trouxe sem filtro: o tamanho da página. */
  pageSize: number | null;
  /** Nomes dos campos (caminhos como `tipoSancao.descricaoResumida`), sem valor. */
  fieldPaths: string[];
  /** Campos de data (nome começa por "data"): a forma dos valores (dígitos viram 9) e quantos de cada. */
  dateShapes: Record<string, Record<string, number>>;
  /** Campos de código (CNPJ ou CPF): a forma dos valores e quantos de cada. */
  codeShapes: Record<string, Record<string, number>>;
}

export interface ProbeLookup {
  /** `cnpj#1`, `cnpj#2` ou `cpf`: nunca o documento. */
  subject: string;
  base: SanctionBase;
  request: ProbeRequestSummary;
  records: number | null;
  /** O código de cada registro devolvido contra o consultado: o filtro da fonte casa? */
  codeChecks: { match: number; mismatch: number; unreadable: number } | null;
  /** Sem registros: como a fonte disse (lista vazia, ou o status HTTP). */
  emptyResult: string | null;
  endDateShapes: Record<string, number>;
}

export interface SanctionProbeReport {
  generatedAt: string;
  requests: number;
  intervalMs: number;
  samples: Record<SanctionBase, ProbeSample>;
  lookups: ProbeLookup[];
  /** Os pedidos sem filtro leram uma lista em todas as bases (a sondagem serve de base para o código). */
  ok: boolean;
  notes: string[];
}

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Só a forma: dígitos viram 9 e letras viram A; a máscara (`*`) e a pontuação ficam. */
export function shapeOfValue(value: string): string {
  return value.replace(/\d/g, '9').replace(/[A-Za-zÀ-ÿ]/g, 'A').slice(0, 40);
}

function addShape(target: Record<string, Record<string, number>>, path: string, shape: string): void {
  const shapes = (target[path] ??= {});
  if (shapes[shape] !== undefined || Object.keys(shapes).length < MAX_SHAPES_PER_FIELD) {
    shapes[shape] = (shapes[shape] ?? 0) + 1;
  }
}

/** Caminhos dos campos de um registro (objetos aninhados com ponto; listas com `[]`), até a profundidade combinada. */
function collectFieldPaths(value: unknown, prefix: string, depth: number, paths: Set<string>): void {
  if (!isRecord(value) || depth > MAX_FIELD_DEPTH) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    paths.add(path);
    if (Array.isArray(child)) {
      paths.add(`${path}[]`);
      collectFieldPaths(child.find(isRecord), `${path}[]`, depth + 1, paths);
    } else {
      collectFieldPaths(child, path, depth + 1, paths);
    }
  }
}

/** Os valores de texto dos campos de data (nome começando por "data"), com o caminho. */
function collectDateValues(value: unknown, prefix: string, depth: number, found: Array<[string, string]>): void {
  if (!isRecord(value) || depth > MAX_FIELD_DEPTH) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof child === 'string' && /^data/i.test(key)) {
      found.push([path, child]);
    } else if (isRecord(child)) {
      collectDateValues(child, path, depth + 1, found);
    }
  }
}

function valueAtPath(record: Rec, path: readonly string[]): unknown {
  let node: unknown = record;
  for (const key of path) {
    if (!isRecord(node)) {
      return undefined;
    }
    node = node[key];
  }
  return node;
}

function bodyShapeOf(body: unknown): ProbeSample['bodyShape'] {
  if (Array.isArray(body)) return 'array';
  return isRecord(body) ? 'object' : 'other';
}

/** O resumo de um pedido e o corpo lido (só quando a resposta é 2xx; o corpo dos erros nunca é lido). */
async function probeRequest(
  deps: Required<Pick<SanctionProbeDeps, 'fetchImpl' | 'now'>> & Pick<SanctionProbeDeps, 'apiKey'>,
  base: SanctionBase,
  filter: string | null,
): Promise<{ summary: ProbeRequestSummary; body: unknown }> {
  const url = new URL(`${PORTAL_API_URL}/${SANCTION_BASE_PATHS[base]}`);
  if (filter !== null) {
    url.searchParams.set(SANCTION_FILTER_PARAMS[base], filter);
  }
  url.searchParams.set('pagina', '1');

  const startedAt = deps.now();
  let response: Response;
  try {
    response = await deps.fetchImpl(url.toString(), {
      headers: { accept: 'application/json', 'user-agent': SANCTION_USER_AGENT, [PORTAL_KEY_HEADER]: deps.apiKey },
      signal: AbortSignal.timeout(SANCTION_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // Só o nome do erro: a mensagem e a `cause` podem trazer a URL, com o documento.
    return {
      summary: {
        status: null,
        ok: false,
        elapsedMs: null,
        error: `Request failed (${error instanceof Error ? error.name : 'unknown'})`,
        contentType: null,
        rateLimitHeaders: {},
      },
      body: undefined,
    };
  }

  const elapsedMs = deps.now() - startedAt;
  const rateLimitHeaders: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    if (RATE_LIMIT_HEADER.test(name)) {
      rateLimitHeaders[name.toLowerCase()] = value.slice(0, 80);
    }
  });
  const summary: ProbeRequestSummary = {
    status: response.status,
    ok: response.ok,
    elapsedMs,
    error: null,
    contentType: response.headers.get('content-type')?.slice(0, 80) ?? null,
    rateLimitHeaders,
  };
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    return { summary, body: undefined };
  }
  try {
    return { summary, body: await response.json() };
  } catch {
    return { summary: { ...summary, ok: false, error: 'Response was not valid JSON' }, body: undefined };
  }
}

function summarizeSample(base: SanctionBase, request: ProbeRequestSummary, body: unknown): ProbeSample {
  const sample: ProbeSample = {
    request,
    bodyShape: body === undefined ? null : bodyShapeOf(body),
    pageSize: null,
    fieldPaths: [],
    dateShapes: {},
    codeShapes: {},
  };
  if (!Array.isArray(body)) {
    return sample;
  }
  sample.pageSize = body.length;
  const paths = new Set<string>();
  for (const item of body) {
    if (!isRecord(item)) {
      continue;
    }
    collectFieldPaths(item, '', 1, paths);
    const dates: Array<[string, string]> = [];
    collectDateValues(item, '', 1, dates);
    for (const [path, value] of dates) {
      addShape(sample.dateShapes, path, shapeOfValue(value));
    }
    for (const codePath of CODE_PATHS[base]) {
      const value = valueAtPath(item, codePath);
      if (typeof value === 'string') {
        addShape(sample.codeShapes, codePath.join('.'), shapeOfValue(value));
      }
    }
  }
  sample.fieldPaths = [...paths].sort().slice(0, MAX_FIELD_PATHS);
  return sample;
}

function summarizeLookup(subject: string, base: SanctionBase, document: string, request: ProbeRequestSummary, body: unknown): ProbeLookup {
  const lookup: ProbeLookup = { subject, base, request, records: null, codeChecks: null, emptyResult: null, endDateShapes: {} };
  if (!request.ok) {
    lookup.emptyResult = request.status === null ? null : `HTTP ${request.status}`;
    return lookup;
  }
  if (!Array.isArray(body)) {
    return lookup;
  }
  lookup.records = body.length;
  if (body.length === 0) {
    lookup.emptyResult = 'empty list (HTTP 200)';
    return lookup;
  }
  const checks = { match: 0, mismatch: 0, unreadable: 0 };
  for (const item of body) {
    if (!isRecord(item)) {
      checks.unreadable += 1;
      continue;
    }
    checks[checkRecordCode(base, item, document)] += 1;
    const endDate = item['dataFimSancao'];
    if (typeof endDate === 'string') {
      const shape = shapeOfValue(endDate);
      lookup.endDateShapes[shape] = (lookup.endDateShapes[shape] ?? 0) + 1;
    } else if (base !== 'CEPIM') {
      lookup.endDateShapes['(none)'] = (lookup.endDateShapes['(none)'] ?? 0) + 1;
    }
  }
  lookup.codeChecks = checks;
  return lookup;
}

function notesFor(report: Pick<SanctionProbeReport, 'samples' | 'lookups'>): string[] {
  const notes = [
    'Limites de uso e termos da API não aparecem nas respostas: confira ao pedir a chave (os cabeçalhos de limite, quando existem, estão em rateLimitHeaders).',
  ];
  for (const [base, sample] of Object.entries(report.samples)) {
    if (sample.request.status === 401 || sample.request.status === 403) {
      notes.push(`${base}: a fonte recusou a chave (HTTP ${sample.request.status}).`);
    }
    if (sample.request.ok && sample.pageSize === 0) {
      notes.push(`${base}: a primeira página sem filtro veio vazia; as formas de data e de código não puderam ser lidas.`);
    }
    if (sample.request.ok && sample.bodyShape !== 'array') {
      notes.push(`${base}: a resposta não é uma lista; o cliente trata isso como "indisponível".`);
    }
  }
  for (const lookup of report.lookups) {
    const checks = lookup.codeChecks;
    if (checks !== null && checks.mismatch > 0) {
      notes.push(`${lookup.subject} em ${lookup.base}: ${checks.mismatch} registro(s) com o código de outro documento (o filtro da fonte não casa; o cliente os descarta).`);
    }
    if (checks !== null && checks.unreadable > 0) {
      notes.push(`${lookup.subject} em ${lookup.base}: ${checks.unreadable} registro(s) sem código legível (o cliente faria a base falhar).`);
    }
    if (lookup.emptyResult !== null && lookup.emptyResult !== 'empty list (HTTP 200)' && lookup.request.status === 404) {
      notes.push(`${lookup.subject} em ${lookup.base}: "sem registro" veio como HTTP 404; o cliente hoje trata 404 como "indisponível" e teria de mudar.`);
    }
  }
  return notes;
}

/**
 * Roda a sondagem: um pedido sem filtro por base (a forma do que a fonte entrega) e, para cada documento dado, um pedido
 * filtrado nas bases dele (como "sem registro" volta e se o filtro casa). Nunca imprime nome, documento, URL ou chave.
 */
export async function runSanctionProbe(deps: SanctionProbeDeps, options: SanctionProbeOptions): Promise<SanctionProbeReport> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  const requestDeps = { fetchImpl, now, apiKey: deps.apiKey };
  let requests = 0;
  const pace = async (): Promise<void> => {
    if (requests > 0 && deps.requestIntervalMs > 0) {
      await sleep(deps.requestIntervalMs);
    }
    requests += 1;
  };

  const samples = {} as Record<SanctionBase, ProbeSample>;
  for (const base of ['CEIS', 'CNEP', 'CEPIM'] as const) {
    await pace();
    deps.progress?.(`${base}: primeira página sem filtro`);
    const { summary, body } = await probeRequest(requestDeps, base, null);
    samples[base] = summarizeSample(base, summary, body);
  }

  const lookups: ProbeLookup[] = [];
  const subjects: Array<{ label: string; document: string; bases: readonly SanctionBase[] }> = [
    ...options.cnpjs.map((document, index) => ({ label: `cnpj#${index + 1}`, document, bases: ['CEIS', 'CNEP', 'CEPIM'] as const })),
    ...(options.cpf === null ? [] : [{ label: 'cpf', document: options.cpf, bases: ['CEIS', 'CNEP'] as const }]),
  ];
  for (const subject of subjects) {
    for (const base of subject.bases) {
      await pace();
      deps.progress?.(`${base}: consulta de ${subject.label}`);
      const { summary, body } = await probeRequest(requestDeps, base, subject.document);
      lookups.push(summarizeLookup(subject.label, base, subject.document, summary, body));
    }
  }

  const ok = Object.values(samples).every((sample) => sample.request.ok && sample.bodyShape === 'array');
  return {
    generatedAt: new Date(now()).toISOString(),
    requests,
    intervalMs: deps.requestIntervalMs,
    samples,
    lookups,
    ok,
    notes: notesFor({ samples, lookups }),
  };
}

/** O relatório como o comando o imprime: JSON legível, sem nada além da estrutura. */
export function renderSanctionProbeReport(report: SanctionProbeReport): string {
  return JSON.stringify(report, null, 2);
}
