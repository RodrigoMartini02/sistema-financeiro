import { PURCHASE_CONTROL_NUMBER } from '../contractStore/layout';
import { RESULTS_PAGE_SIZE, windowParams, type ComprasGovClient, type ComprasGovRawResponse } from './comprasGovClient';
import { addCalendarDays, brasiliaDate } from './dates';

// Sondagem do Compras.gov.br (`winners-probe`, passo 1 do plano .plans/licitacoes-vencedores.md): lê um dia e as
// contagens por mês e imprime um relatório curto do que a fonte realmente entrega (endereço, envelope, campos,
// situações, fronteira da janela, tamanho de página, ritmo, cobertura e volume). É somente leitura e não usa banco
// nem R2. Os nomes dos campos do plano são suposições (S1 a S16): aqui eles são procurados pelo nome, e o que não
// for achado aparece no relatório como ausente, para o mapeamento ser escrito só depois de ver a fonte.
// Privacidade: o relatório nunca leva documento de fornecedor (só o comprimento), nunca lista valores de campos de
// pessoa e troca o nome de pessoa física na amostra.

const DEFAULT_SAMPLE_PAGES = 5;
/** O dia da amostra é um dia já fechado: hoje menos 10, em Brasília. */
const SAMPLE_OFFSET_DAYS = 10;
const FIRST_MONTH = '2021-01';
const COUNT_PAGE_SIZE = 10;
const MAX_DISTINCT_VALUES = 12;
const MAX_VALUE_LENGTH = 60;
const MAX_FLAT_LENGTH = 110;
const SAMPLE_PER_PERSON_TYPE = 2;

type Rec = Record<string, unknown>;

export interface ResultProbeOptions {
  /** Dia da amostra (AAAA-MM-DD); sem ele, hoje menos 10 dias em Brasília. */
  day?: string;
  /** Páginas da amostra (de 500 registros); padrão 5. */
  maxPages?: number;
}

export interface ResultProbeDeps {
  client: Pick<ComprasGovClient, 'requestRaw' | 'requestCount'>;
  now: () => Date;
  requestIntervalMs: number;
  /** Andamento para quem espera o comando (vai para a saída de erro, longe do relatório). */
  progress?: (message: string) => void;
}

const isRecord = (value: unknown): value is Rec => typeof value === 'object' && value !== null && !Array.isArray(value);

// ── Campos procurados pelo nome (suposições S6) ─────────────────────────────

/** Campo de documento ou nome de pessoa: nunca listado como valor. */
const SENSITIVE_WORDS = /cpf|cnpj|documento|razao|email|telefone|^nome/i;
/** "niFornecedor" e parentes (número de identificação): maiúscula depois do "ni", sem ignorar caixa ("unidade" não vale). */
const SENSITIVE_IDENTIFIER = /^ni[A-Z]/;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_WORDS.test(key) || SENSITIVE_IDENTIFIER.test(key);
}
/** Campos de poucos valores que valem listar (situação, tipo de pessoa, porte, UF, esfera). */
const CATEGORICAL_KEY = /situacao|tipopessoa|porte|uf(sigla)?$|siglauf|esfera|poder|status|natureza|modalidade|criterio/i;

function findKey(keys: readonly string[], ...patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const found = keys.find((key) => pattern.test(key));
    if (found) {
      return found;
    }
  }
  return null;
}

interface KnownFields {
  documentKey: string | null;
  typeKey: string | null;
  nameKey: string | null;
  purchaseKey: string | null;
  resultDateKey: string | null;
  updateDateKey: string | null;
  ufKey: string | null;
  unitKey: string | null;
}

function knownFields(keys: readonly string[]): KnownFields {
  return {
    documentKey: findKey(keys, /^niFornecedor$/i, /^ni.*fornecedor$/i, /fornecedor.*(ni|cnpj|cpf|documento)$/i),
    typeKey: findKey(keys, /^tipoPessoa$/i, /tipo.?pessoa/i),
    nameKey: findKey(keys, /^nomeRazaoSocialFornecedor$/i, /nome.*fornecedor/i, /razao/i),
    purchaseKey: findKey(keys, /^idContratacaoPNCP$/i, /contratacao.*pncp/i, /numerocontrole/i),
    resultDateKey: findKey(keys, /^dataResultadoPncp$/i, /dataresultado/i),
    updateDateKey: findKey(keys, /^dataAtualizacaoPncp$/i, /dataatualizacao/i),
    ufKey: findKey(keys, /^unidadeOrgaoUfSigla$/i, /ufsigla$/i, /(^|[a-z])uf$/i),
    unitKey: findKey(keys, /^unidadeOrgaoCodigoUnidade$/i, /codigounidade/i),
  };
}

// ── Leitura de uma resposta ─────────────────────────────────────────────────

interface ParsedPage {
  topKeys: string[];
  recordsKey: string | null;
  records: Rec[];
  totals: { totalRegistros: number | null; totalPaginas: number | null; paginasRestantes: number | null };
}

const RECORD_KEYS = ['resultado', 'data', 'content', 'items', 'registros'];

function numberAt(body: Rec, key: string): number | null {
  const value = body[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parsePage(json: unknown): ParsedPage | null {
  if (Array.isArray(json)) {
    return { topKeys: ['(lista)'], recordsKey: null, records: json.filter(isRecord), totals: { totalRegistros: null, totalPaginas: null, paginasRestantes: null } };
  }
  if (!isRecord(json)) {
    return null;
  }
  const topKeys = Object.keys(json);
  const recordsKey = RECORD_KEYS.find((key) => Array.isArray(json[key])) ?? topKeys.find((key) => Array.isArray(json[key])) ?? null;
  if (recordsKey === null) {
    return null;
  }
  return {
    topKeys,
    recordsKey,
    records: (json[recordsKey] as unknown[]).filter(isRecord),
    totals: {
      totalRegistros: numberAt(json, 'totalRegistros'),
      totalPaginas: numberAt(json, 'totalPaginas'),
      paginasRestantes: numberAt(json, 'paginasRestantes'),
    },
  };
}

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function dateOnly(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function daysBetween(from: string, to: string): number {
  const toTime = (date: string) => {
    const [year, month, day] = date.split('-').map(Number);
    return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
  };
  return Math.round((toTime(to) - toTime(from)) / 86_400_000);
}

function percentile(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) {
    return null;
  }
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? null;
}

function percentText(part: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((part / total) * 1000) / 10}%`;
}

function countBy<T>(items: readonly T[], keyOf: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyOf(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** Só a forma: dígitos viram 9 e letras viram A (para mostrar um formato inesperado sem mostrar o dado). */
function shapeOf(value: string): string {
  return value.replace(/\d/g, '9').replace(/[A-Za-zÀ-ÿ]/g, 'A').slice(0, 40);
}

// ── Relatório ───────────────────────────────────────────────────────────────

interface ResponseSummary {
  status: number;
  total: number | null;
  records: number;
  dates: Record<string, number>;
}

export interface ProbeReport {
  generatedAt: string;
  sampleDay: string;
  requestIntervalMs: number;
  /** S1, S2, S6: o endereço responde e como é o envelope. */
  structure: Record<string, unknown>;
  /** S10: tempo de cada página e eventual limite de taxa (nunca provocado). */
  rhythm?: Record<string, unknown>;
  /** S6: % de preenchimento de cada campo do registro. */
  fields?: Record<string, string>;
  /** S8 e outros: valores distintos dos campos de poucos valores (nunca de pessoa). */
  distinctValues?: Record<string, Record<string, number>>;
  /** S13: comprimento do documento do fornecedor por tipo de pessoa (nunca o documento). */
  supplierDocument?: Record<string, unknown>;
  /** S7: o número da compra tem o formato do edital? */
  purchaseNumber?: Record<string, unknown>;
  /** S3: fronteira da janela de datas. */
  windowBoundary?: Record<string, unknown>;
  /** S4: página de 500 e de 501. */
  pageSize?: Record<string, unknown>;
  /** S12: UFs e órgãos na amostra. */
  coverage?: Record<string, unknown>;
  /** S9: diferença entre a atualização e a data do resultado, em dias. */
  updateLag?: Record<string, unknown>;
  /** S16: total de registros por mês, desde 2021-01 (nulo: não medido). */
  monthly?: Record<string, unknown>;
  /** Dois registros de cada tipo de pessoa, sem documento de pessoa física e sem nome de pessoa. */
  sample?: Rec[];
  requests: number;
  skipped?: string;
}

function summarize(raw: ComprasGovRawResponse, resultDateKey: string | null): ResponseSummary {
  const parsed = raw.status === 200 ? parsePage(raw.json) : null;
  const key = resultDateKey ?? knownFields(parsed?.records[0] ? Object.keys(parsed.records[0]) : []).resultDateKey;
  const dates = parsed && key ? countBy(parsed.records, (record) => dateOnly(record[key]) ?? 'sem data') : {};
  return { status: raw.status, total: parsed?.totals.totalRegistros ?? null, records: parsed?.records.length ?? 0, dates };
}

function monthsFrom(first: string, lastInstant: string): string[] {
  const months: string[] = [];
  let [year, month] = first.split('-').map(Number) as [number, number];
  const [lastYear, lastMonth] = lastInstant.slice(0, 7).split('-').map(Number) as [number, number];
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

function monthWindow(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  const next = addCalendarDays(`${month}-28`, 4).slice(0, 7);
  return { from, to: addCalendarDays(`${next}-01`, -1) };
}

/** Documento de pessoa física ou sem 14 dígitos nunca sai: vira asteriscos. O CNPJ (público) fica. */
function sanitizeRecord(record: Rec, fields: KnownFields): Rec {
  const documentValue = fields.documentKey ? String(record[fields.documentKey] ?? '') : '';
  const isCompany = documentValue.replace(/\D/g, '').length === 14 && !documentValue.includes('*');
  const result: Rec = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === fields.documentKey && !isCompany) {
      result[key] = typeof value === 'string' ? value.replace(/\d/g, '*') : '*';
    } else if (key === fields.nameKey && !isCompany) {
      result[key] = 'PESSOA FISICA DE TESTE';
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** A sondagem inteira. Não lança por resposta ruim da fonte: o que não deu certo vai para o relatório. */
export async function runResultProbe(deps: ResultProbeDeps, options: ResultProbeOptions = {}): Promise<ProbeReport> {
  const { client, now } = deps;
  const progress = deps.progress ?? (() => {});
  const today = brasiliaDate(now());
  const day = options.day ?? addCalendarDays(today, -SAMPLE_OFFSET_DAYS);
  const maxPages = options.maxPages ?? DEFAULT_SAMPLE_PAGES;
  const dayDates = windowParams({ from: day, to: day });

  const report: ProbeReport = {
    generatedAt: now().toISOString(),
    sampleDay: day,
    requestIntervalMs: deps.requestIntervalMs,
    structure: {},
    requests: 0,
  };

  // ── A amostra do dia: páginas em sequência, no ritmo configurado ──
  const records: Rec[] = [];
  const pageStats: Array<{ page: number; status: number; ms: number }> = [];
  const limited: Array<{ page: number; retryAfter: string | null; preview: string }> = [];
  let firstPage: ParsedPage | null = null;
  let firstRaw: ComprasGovRawResponse | null = null;
  for (let page = 1; page <= maxPages; page += 1) {
    progress(`amostra do dia ${day}: página ${page}`);
    const raw = await client.requestRaw(dayDates, page, RESULTS_PAGE_SIZE);
    firstRaw ??= raw;
    pageStats.push({ page, status: raw.status, ms: raw.elapsedMs });
    if (raw.status === 429) {
      limited.push({ page, retryAfter: raw.retryAfter, preview: raw.errorPreview });
      break;
    }
    const parsed = raw.status === 200 ? parsePage(raw.json) : null;
    if (!parsed) {
      break;
    }
    firstPage ??= parsed;
    records.push(...parsed.records);
    const remaining = parsed.totals.paginasRestantes;
    if (parsed.records.length === 0 || remaining === null || remaining <= 0) {
      break;
    }
  }

  if (!firstPage || !firstRaw) {
    report.structure = {
      endpointOk: false,
      status: firstRaw?.status ?? 0,
      ...(firstRaw && firstRaw.status === 200 ? { reason: 'resposta sem lista de registros' } : { errorPreview: firstRaw?.errorPreview ?? '' }),
    };
    report.skipped = 'a primeira página não respondeu como o esperado: o resto da sondagem não foi feito';
    report.requests = client.requestCount;
    return report;
  }

  const keys = [...new Set(records.flatMap((record) => Object.keys(record)))];
  const fields = knownFields(keys);
  report.structure = {
    endpointOk: true,
    status: firstRaw.status,
    topKeys: firstPage.topKeys,
    recordsKey: firstPage.recordsKey,
    ...firstPage.totals,
    pagesRead: pageStats.filter((stat) => stat.status === 200).length,
    recordsRead: records.length,
    foundFields: Object.fromEntries(Object.entries(fields).map(([name, key]) => [name, key])),
  };

  const times = pageStats.map((stat) => stat.ms).sort((a, b) => a - b);
  report.rhythm = {
    pageMs: pageStats.map((stat) => stat.ms),
    p50: percentile(times, 0.5),
    max: times.at(-1) ?? null,
    statuses: countBy(pageStats, (stat) => String(stat.status)),
    ...(limited.length > 0 ? { rateLimited: limited } : {}),
  };

  // ── Campos, valores distintos e documentos ──
  report.fields = Object.fromEntries(
    keys.sort().map((key) => [key, percentText(records.filter((record) => !isEmptyValue(record[key])).length, records.length)]),
  );

  const distinctValues: Record<string, Record<string, number>> = {};
  for (const key of keys) {
    if (isSensitiveKey(key) || !CATEGORICAL_KEY.test(key)) {
      continue;
    }
    const counts = countBy(records, (record) => (isEmptyValue(record[key]) ? '(vazio)' : String(record[key]).slice(0, MAX_VALUE_LENGTH)));
    if (Object.keys(counts).length <= MAX_DISTINCT_VALUES) {
      distinctValues[key] = counts;
    }
  }
  report.distinctValues = distinctValues;

  const documentKey = fields.documentKey;
  if (documentKey) {
    const byType: Record<string, Record<string, number>> = {};
    for (const record of records) {
      const type = fields.typeKey && !isEmptyValue(record[fields.typeKey]) ? String(record[fields.typeKey]).slice(0, 20) : '(sem tipo)';
      const documentText: string = String(record[documentKey] ?? '');
      const length = `${documentText.replace(/\D/g, '').length}${documentText.includes('*') ? ' com máscara' : ''}`;
      const lengths = byType[type] ?? {};
      lengths[length] = (lengths[length] ?? 0) + 1;
      byType[type] = lengths;
    }
    report.supplierDocument = { documentKey: fields.documentKey, typeKey: fields.typeKey, lengthsByType: byType };
  } else {
    report.supplierDocument = { documentKey: null };
  }

  if (fields.purchaseKey) {
    const values = records.map((record) => String(record[fields.purchaseKey!] ?? ''));
    const matching = values.filter((value) => PURCHASE_CONTROL_NUMBER.test(value.trim())).length;
    const otherShapes = [...new Set(values.filter((value) => !PURCHASE_CONTROL_NUMBER.test(value.trim())).map(shapeOf))].slice(0, 3);
    report.purchaseNumber = { key: fields.purchaseKey, matchesEditalFormat: percentText(matching, values.length), ...(otherShapes.length > 0 ? { otherShapes } : {}) };
  } else {
    report.purchaseNumber = { key: null };
  }

  // ── Amostra sem dado pessoal, para virar fixture ──
  const perType = new Map<string, number>();
  const sample: Rec[] = [];
  for (const record of records) {
    const type = fields.typeKey ? String(record[fields.typeKey] ?? '') : '';
    if ((perType.get(type) ?? 0) < SAMPLE_PER_PERSON_TYPE) {
      perType.set(type, (perType.get(type) ?? 0) + 1);
      sample.push(sanitizeRecord(record, fields));
    }
  }
  report.sample = sample;

  const RATE_LIMITED = 'limite de taxa (429): o resto da sondagem não foi feito; rode de novo com COMPRASGOV_REQUEST_INTERVAL_MS maior';
  if (limited.length > 0) {
    report.skipped = RATE_LIMITED;
    report.requests = client.requestCount;
    return report;
  }

  // ── Fronteira da janela (S3) e tamanho de página (S4) ──
  progress('fronteira da janela e tamanho de página');
  const sameDay = summarize(await client.requestRaw({ initial: day, final: day }, 1, RESULTS_PAGE_SIZE), fields.resultDateKey);
  const nextDay = summarize(await client.requestRaw({ initial: day, final: addCalendarDays(day, 1) }, 1, RESULTS_PAGE_SIZE), fields.resultDateKey);
  const nextDayDate = addCalendarDays(day, 1);
  let endExclusive: boolean | null = null;
  if (nextDay.dates[nextDayDate] !== undefined) {
    endExclusive = false;
  } else if (nextDay.records > 0 && sameDay.records === 0) {
    endExclusive = true;
  }
  report.windowBoundary = { endExclusive, startEqualsEnd: sameDay, startToNextDay: nextDay };

  const oversized = await client.requestRaw(dayDates, 1, RESULTS_PAGE_SIZE + 1);
  if ([sameDay.status, nextDay.status, oversized.status].includes(429)) {
    report.skipped = RATE_LIMITED;
    report.requests = client.requestCount;
    return report;
  }
  report.pageSize = {
    size500: pageStats[0]?.status ?? null,
    size501: oversized.status,
    ...(oversized.status === 200 ? { size501Records: parsePage(oversized.json)?.records.length ?? null } : { size501Message: oversized.errorPreview }),
  };

  // ── Cobertura (S12) e defasagem (S9) ──
  const agencies = new Set<string>();
  for (const record of records) {
    const purchase = fields.purchaseKey ? String(record[fields.purchaseKey] ?? '').match(PURCHASE_CONTROL_NUMBER) : null;
    if (purchase?.[1]) {
      agencies.add(purchase[1]);
    } else if (fields.unitKey && !isEmptyValue(record[fields.unitKey])) {
      agencies.add(`unidade:${String(record[fields.unitKey])}`);
    }
  }
  const ufs = fields.ufKey ? [...new Set(records.map((record) => String(record[fields.ufKey!] ?? '')).filter((uf) => uf !== ''))].sort() : [];
  report.coverage = { sampleRecords: records.length, ufKey: fields.ufKey, distinctUfs: ufs.length, ufs, distinctAgencies: agencies.size };

  if (fields.resultDateKey && fields.updateDateKey) {
    const lags = records
      .map((record) => {
        const resultDate = dateOnly(record[fields.resultDateKey!]);
        const updateDate = dateOnly(record[fields.updateDateKey!]);
        return resultDate && updateDate ? daysBetween(resultDate, updateDate) : null;
      })
      .filter((lag): lag is number => lag !== null)
      .sort((a, b) => a - b);
    report.updateLag = { days: 'atualização menos resultado', records: lags.length, p50: percentile(lags, 0.5), p95: percentile(lags, 0.95), p99: percentile(lags, 0.99), max: lags.at(-1) ?? null };
  } else {
    report.updateLag = { available: false };
  }

  // ── Volume por mês desde 2021-01 (S16) ──
  const months = monthsFrom(FIRST_MONTH, today);
  const counts = new Map<string, number | null>();
  const failures: Record<string, number> = {};
  let stoppedBy429: string | null = null;
  for (const month of months) {
    progress(`contagem do mês ${month}`);
    const raw = await client.requestRaw(windowParams(monthWindow(month)), 1, COUNT_PAGE_SIZE);
    if (raw.status === 200) {
      counts.set(month, parsePage(raw.json)?.totals.totalRegistros ?? null);
    } else {
      counts.set(month, null);
      failures[String(raw.status)] = (failures[String(raw.status)] ?? 0) + 1;
      if (raw.status === 429) {
        stoppedBy429 = month;
        break;
      }
    }
  }
  const byYear: Record<string, Array<number | null>> = {};
  for (const month of months) {
    const [year, number] = month.split('-') as [string, string];
    const row = byYear[year] ?? Array.from({ length: 12 }, (): number | null => null);
    row[Number(number) - 1] = counts.get(month) ?? null;
    byYear[year] = row;
  }
  const measured = months.filter((month) => (counts.get(month) ?? 0) > 0);
  const total = measured.reduce((sum, month) => sum + (counts.get(month) ?? 0), 0);
  report.monthly = {
    byYear,
    firstMonthWithData: measured[0] ?? null,
    totalRecords: total,
    pagesOf500: Math.ceil(total / RESULTS_PAGE_SIZE),
    ...(Object.keys(failures).length > 0 ? { failedMonths: failures } : {}),
    ...(stoppedBy429 ? { stoppedBy429 } : {}),
  };

  report.requests = client.requestCount;
  return report;
}

// ── Saída ───────────────────────────────────────────────────────────────────

function compactJson(value: unknown, depth: number): string {
  const flat = JSON.stringify(value) ?? 'null';
  if (flat.length <= MAX_FLAT_LENGTH || typeof value !== 'object' || value === null) {
    return flat;
  }
  const pad = '  '.repeat(depth + 1);
  const closing = '  '.repeat(depth);
  if (Array.isArray(value)) {
    return `[\n${value.map((item) => pad + compactJson(item, depth + 1)).join(',\n')}\n${closing}]`;
  }
  const entries = Object.entries(value).map(([key, item]) => `${pad}${JSON.stringify(key)}: ${compactJson(item, depth + 1)}`);
  return `{\n${entries.join(',\n')}\n${closing}}`;
}

/** O relatório como texto: objetos pequenos numa linha só, e cada registro da amostra numa linha. */
export function renderProbeReport(report: ProbeReport): string {
  const entries = Object.entries(report).map(([key, value]) => {
    if (key === 'sample' && Array.isArray(value)) {
      const lines = value.map((record) => `    ${JSON.stringify(record)}`).join(',\n');
      return `  "sample": [\n${lines}\n  ]`;
    }
    return `  ${JSON.stringify(key)}: ${compactJson(value, 1)}`;
  });
  return `{\n${entries.join(',\n')}\n}`;
}
