import { AGENCIES_ENDPOINT, CONTRACTS_BY_START_ENDPOINT, type ComprasGovClient, type ComprasGovWindow } from './comprasGovClient';
import {
  federalRecentFrom,
  headOfficeCnpj,
  inclusionOf,
  isKnownFederalTypeCode,
  mapFederalContract,
  parseFederalAgency,
  pncpAgencyCnpjOf,
  resolveAgencyCnpj,
  type FederalAgency,
  type FederalMappingContext,
} from './federalMapping';
import { readFederal } from './federalSource';

// Sondagem dos contratos federais do Compras.gov.br (plano .plans/licitacoes-contratos-federais.md, passo 4): lê órgãos
// escolhidos numa janela e imprime os números que decidem os padrões da carga, sem gravar nada (sem banco e sem R2):
// completude e releituras, colisões da chave, excluídas, parcela com número do PNCP por tipo, CNPJ do órgão contra o
// dos números de controle do PNCP, tipos e categorias desconhecidos. Só lê a fonte pública, no intervalo configurado.

/** Órgão da sondagem quando nenhum é pedido: a UFMG, a mais medida nas sondagens. */
export const DEFAULT_PROBE_AGENCY = '26238';
const MAX_REASONS = 5;
const MAX_TOP_NAMES = 10;
const SHARE_DECIMALS = 3;

export interface FederalProbeOptions {
  /** Códigos dos órgãos a ler; sem eles nem `sample`, a UFMG. */
  agencyCodes: readonly string[];
  /** Quantos órgãos federais do SISG acrescentar, espalhados pela lista ordenada por código. */
  sample: number | null;
  /** A janela de vigência iniciada (até 365 dias). */
  window: ComprasGovWindow;
  /** Páginas por órgão (amostra). Com limite, as leituras não valem como completas. */
  maxPages: number | null;
}

export interface FederalProbeDeps {
  client: ComprasGovClient;
  now: () => Date;
  progress: (message: string) => void;
}

interface TypeCounts {
  name: string | null;
  rows: number;
  withPncpNumber: number;
  /** withPncpNumber / rows. */
  shareWithPncpNumber: number;
  mapped: number;
}

export interface FederalProbeAgency {
  code: string;
  name: string | null;
  found: boolean;
  registeredCnpj: string | null;
  headOfficeCnpj: string | null;
  /** CNPJs dos números de controle do contrato no PNCP das linhas do órgão, com a quantidade de cada um. */
  learnedCnpjs: { cnpj: string; rows: number }[];
  /** O mais frequente dos aprendidos é a matriz do cadastro: null sem número do PNCP para comparar. */
  learnedMatchesHeadOffice: boolean | null;
  resolvedCnpj: string | null;
  announced: number;
  rowsRead: number;
  complete: boolean;
  passes: number;
  firstPassDistinct: number;
  repeated: number;
  pages: number;
  /** Divisões da janela ao meio para completar a leitura. */
  splits: number;
  failure: string | null;
  skipped: { withPncpNumber: number; excluded: number; recent: number; agencyWithoutCnpj: number; termEndsBeforeStart: number; pncpTwin: number };
  mapped: number;
  invalid: number;
  invalidReasons: { reason: string; rows: number }[];
  /** Contratos que entrariam e têm a mesma chave de outro (a fonte registrou duas vezes). */
  collidingKeys: number;
  collidingExtraRows: number;
  withoutEndDate: number;
  implausibleTerm: number;
  units: number;
  byType: Record<string, TypeCounts>;
  unknownTypes: { code: string; name: string | null; rows: number }[];
  unknownCategories: { name: string; rows: number }[];
  /** Maior inclusão lida: até quando a fonte tem dado deste órgão na janela. */
  lastInclusion: string | null;
}

export interface FederalProbeReport {
  generatedAt: string;
  window: ComprasGovWindow;
  agenciesList: { announced: number; rows: number; federal: number; sisg: number; withoutValidCnpj: number; complete: boolean };
  requests: number;
  elapsedMs: number;
  agencies: FederalProbeAgency[];
  totals: {
    rowsRead: number;
    announced: number;
    windowsComplete: number;
    windowsIncomplete: number;
    firstPassIncomplete: number;
    splits: number;
    mapped: number;
    invalid: number;
    skipped: FederalProbeAgency['skipped'];
    collidingKeys: number;
    shareWithPncpNumberByType: Record<string, number>;
  };
}

function bump<K>(map: Map<K, number>, key: K): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function top<K>(map: Map<K, number>, limit: number): [K, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function readText(raw: unknown, field: string): string | null {
  const value = isRecord(raw) ? raw[field] : null;
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : null;
}

/** Órgãos a ler: os pedidos, mais a amostra espalhada pelos federais do SISG (sem repetir) ordenados por código. */
export function chooseProbeAgencies(agencies: readonly FederalAgency[], options: Pick<FederalProbeOptions, 'agencyCodes' | 'sample'>): string[] {
  const chosen = options.agencyCodes.length > 0 || options.sample !== null ? [...options.agencyCodes] : [DEFAULT_PROBE_AGENCY];
  if (options.sample !== null && options.sample > 0) {
    const candidates = agencies
      .filter((agency) => agency.usesSisg && agency.cnpj !== null && !chosen.includes(agency.code))
      .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
    const step = candidates.length / options.sample;
    for (let index = 0; index < options.sample && candidates.length > 0; index += 1) {
      const agency = candidates[Math.min(candidates.length - 1, Math.floor(index * step + step / 2))];
      if (agency !== undefined && !chosen.includes(agency.code)) {
        chosen.push(agency.code);
      }
    }
  }
  return chosen;
}

async function probeAgency(
  deps: FederalProbeDeps,
  options: FederalProbeOptions,
  code: string,
  agency: FederalAgency | undefined,
  recentFrom: string,
): Promise<FederalProbeAgency> {
  const read = await readFederal(deps.client, {
    endpoint: CONTRACTS_BY_START_ENDPOINT,
    params: { codigoOrgao: code },
    window: options.window,
    ...(options.maxPages !== null ? { maxPages: options.maxPages } : {}),
  });

  const learned = new Map<string, number>();
  for (const raw of read.rows) {
    const cnpj = pncpAgencyCnpjOf(raw);
    if (cnpj !== null) {
      bump(learned, cnpj);
    }
  }
  const learnedRanking = top(learned, MAX_TOP_NAMES);
  const registered = agency?.cnpj ?? null;
  const head = registered === null ? null : headOfficeCnpj(registered);
  const resolved = resolveAgencyCnpj(learnedRanking[0]?.[0] ?? null, registered);

  const context: FederalMappingContext = { agencyCnpj: resolved, units: new Map(), recentFrom };
  const result: FederalProbeAgency = {
    code,
    name: agency?.name ?? null,
    found: agency !== undefined,
    registeredCnpj: registered,
    headOfficeCnpj: head,
    learnedCnpjs: learnedRanking.map(([cnpj, rows]) => ({ cnpj, rows })),
    learnedMatchesHeadOffice: learnedRanking.length === 0 || head === null ? null : learnedRanking[0]?.[0] === head,
    resolvedCnpj: resolved,
    announced: read.announced,
    rowsRead: read.rows.length,
    complete: read.complete,
    passes: read.passes,
    firstPassDistinct: read.firstPassDistinct,
    repeated: read.repeated,
    pages: read.pages,
    splits: read.splits,
    failure: read.failure?.message ?? null,
    skipped: { withPncpNumber: 0, excluded: 0, recent: 0, agencyWithoutCnpj: 0, termEndsBeforeStart: 0, pncpTwin: 0 },
    mapped: 0,
    invalid: 0,
    invalidReasons: [],
    collidingKeys: 0,
    collidingExtraRows: 0,
    withoutEndDate: 0,
    implausibleTerm: 0,
    units: 0,
    byType: {},
    unknownTypes: [],
    unknownCategories: [],
    lastInclusion: null,
  };

  const reasons = new Map<string, number>();
  const keys = new Map<string, number>();
  const unitCodes = new Set<string>();
  const unknownTypes = new Map<string, { name: string | null; rows: number }>();
  const unknownCategories = new Map<string, number>();
  for (const raw of read.rows) {
    const typeCode = readText(raw, 'codigoTipo') ?? '?';
    const type = (result.byType[typeCode] ??= { name: readText(raw, 'nomeTipo'), rows: 0, withPncpNumber: 0, shareWithPncpNumber: 0, mapped: 0 });
    type.rows += 1;
    const unit = readText(raw, 'codigoUnidadeGestora');
    if (unit !== null) {
      unitCodes.add(unit);
    }
    const included = inclusionOf(raw);
    if (included !== null && (result.lastInclusion === null || included > result.lastInclusion)) {
      result.lastInclusion = included;
    }
    if (typeCode !== '?' && !isKnownFederalTypeCode(typeCode)) {
      const entry = unknownTypes.get(typeCode) ?? { name: type.name, rows: 0 };
      entry.rows += 1;
      unknownTypes.set(typeCode, entry);
    }

    const mapped = mapFederalContract(raw, context);
    if (!mapped.ok && mapped.kind === 'invalid') {
      result.invalid += 1;
      bump(reasons, mapped.reason);
    } else if (!mapped.ok) {
      result.skipped[mapped.reason] += 1;
      if (mapped.reason === 'withPncpNumber') {
        type.withPncpNumber += 1;
      }
    } else {
      result.mapped += 1;
      type.mapped += 1;
      bump(keys, mapped.row.pncpControlNumber);
      if (mapped.withoutExpiry === 'withoutEndDate') {
        result.withoutEndDate += 1;
      } else if (mapped.withoutExpiry === 'implausibleTerm') {
        result.implausibleTerm += 1;
      }
      if (mapped.row.categoryName !== null && mapped.row.categoryId === null) {
        bump(unknownCategories, mapped.row.categoryName);
      }
    }
  }

  for (const type of Object.values(result.byType)) {
    type.shareWithPncpNumber = type.rows === 0 ? 0 : Number((type.withPncpNumber / type.rows).toFixed(SHARE_DECIMALS));
  }
  result.invalidReasons = top(reasons, MAX_REASONS).map(([reason, rows]) => ({ reason, rows }));
  for (const count of keys.values()) {
    if (count > 1) {
      result.collidingKeys += 1;
      result.collidingExtraRows += count - 1;
    }
  }
  result.units = unitCodes.size;
  result.unknownTypes = [...unknownTypes.entries()].map(([typeCode, entry]) => ({ code: typeCode, ...entry }));
  result.unknownCategories = top(unknownCategories, MAX_TOP_NAMES).map(([name, rows]) => ({ name, rows }));
  return result;
}

/** Lê os órgãos escolhidos e monta o relatório. Falha da fonte numa janela entra no relatório; só erro de código sobe. */
export async function runFederalProbe(deps: FederalProbeDeps, options: FederalProbeOptions): Promise<FederalProbeReport> {
  const startedAt = deps.now().getTime();
  deps.progress('Lendo a lista de órgãos da fonte');
  const list = await readFederal(deps.client, { endpoint: AGENCIES_ENDPOINT, params: { statusOrgao: 'true' }, window: null });
  const federal = list.rows.map(parseFederalAgency).filter((agency): agency is FederalAgency => agency !== null);
  const byCode = new Map(federal.map((agency) => [agency.code, agency]));
  const recentFrom = federalRecentFrom(deps.now());

  const codes = chooseProbeAgencies(federal, options);
  const agencies: FederalProbeAgency[] = [];
  for (const [index, code] of codes.entries()) {
    deps.progress(`Órgão ${code} (${index + 1} de ${codes.length})`);
    agencies.push(await probeAgency(deps, options, code, byCode.get(code), recentFrom));
  }

  const totals: FederalProbeReport['totals'] = {
    rowsRead: 0,
    announced: 0,
    windowsComplete: 0,
    windowsIncomplete: 0,
    firstPassIncomplete: 0,
    splits: 0,
    mapped: 0,
    invalid: 0,
    skipped: { withPncpNumber: 0, excluded: 0, recent: 0, agencyWithoutCnpj: 0, termEndsBeforeStart: 0, pncpTwin: 0 },
    collidingKeys: 0,
    shareWithPncpNumberByType: {},
  };
  const typeRows = new Map<string, { rows: number; withPncpNumber: number }>();
  for (const agency of agencies) {
    totals.rowsRead += agency.rowsRead;
    totals.announced += agency.announced;
    totals[agency.complete ? 'windowsComplete' : 'windowsIncomplete'] += 1;
    if (agency.firstPassDistinct < agency.announced) {
      totals.firstPassIncomplete += 1;
    }
    totals.splits += agency.splits;
    totals.mapped += agency.mapped;
    totals.invalid += agency.invalid;
    totals.collidingKeys += agency.collidingKeys;
    for (const reason of Object.keys(totals.skipped) as (keyof typeof totals.skipped)[]) {
      totals.skipped[reason] += agency.skipped[reason];
    }
    for (const [code, type] of Object.entries(agency.byType)) {
      const sum = typeRows.get(code) ?? { rows: 0, withPncpNumber: 0 };
      sum.rows += type.rows;
      sum.withPncpNumber += type.withPncpNumber;
      typeRows.set(code, sum);
    }
  }
  for (const [code, sum] of typeRows) {
    totals.shareWithPncpNumberByType[code] = sum.rows === 0 ? 0 : Number((sum.withPncpNumber / sum.rows).toFixed(SHARE_DECIMALS));
  }

  return {
    generatedAt: deps.now().toISOString(),
    window: options.window,
    agenciesList: {
      announced: list.announced,
      rows: list.rows.length,
      federal: federal.length,
      sisg: federal.filter((agency) => agency.usesSisg).length,
      withoutValidCnpj: federal.filter((agency) => agency.cnpj === null).length,
      complete: list.complete,
    },
    requests: deps.client.requestCount,
    elapsedMs: deps.now().getTime() - startedAt,
    agencies,
    totals,
  };
}

export function renderFederalProbeReport(report: FederalProbeReport): string {
  return JSON.stringify(report, null, 2);
}
