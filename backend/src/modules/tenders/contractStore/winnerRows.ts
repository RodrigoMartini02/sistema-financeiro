import { createHash } from 'node:crypto';
import { payloadHash } from '../collector/mapping';
import type { SupplierPersonType } from '../domains';
import { PURCHASE_CONTROL_NUMBER } from './layout';

// Núcleo puro dos vencedores (plano .plans/licitacoes-vencedores.md): a fonte entrega uma linha por item e resultado, e
// o armazém guarda uma linha por licitação (número de controle da compra) e fornecedor, com o mapa dos itens que ele
// venceu. Aqui ficam a chave, o mapa, os totais e a agregação, sem DuckDB, sem banco e sem relógio: o gravador
// (winnerWriter.ts) lê o estado anterior, chama `applyResults` e grava o que mudou.
//
// A agregação é idempotente: o mapa de uma linha é função só dos resultados ativos de cada item, e os totais saem
// sempre do mapa (nunca se soma ao total anterior). Reler o mesmo resultado, uma janela sobreposta ou a mesma página
// duas vezes dá o mesmo estado, e a ordem do lote não importa. Nenhuma linha é removida por ausência: só o resultado
// cancelado, lido de fato, tira o item.
//
// O nome e o porte do fornecedor e a unidade da linha variam de um item para outro da mesma linha (medido na fonte real:
// o porte de uma empresa mudava de "ME" para "Demais" entre os itens de um dia e os do dia seguinte). Por isso eles vêm
// sempre do primeiro item da linha, o de menor número e sequência, e não do resultado mais recente do lote: assim o
// estado final só depende dos itens que a linha tem, e não da ordem nem da divisão em lotes.

export type ResultSituation = 'winner' | 'cancelled' | 'reserve' | 'other';

/** O fornecedor de um resultado: a chave da linha e o que se mostra dele. */
export interface SupplierIdentity {
  /** PJ: os 14 dígitos. Os demais: documento (mascarado ou saneado, ou "sem-documento") e `#` e 8 hex do nome. */
  key: string;
  personType: SupplierPersonType | null;
  /** CNPJ, CPF mascarado ou texto da pessoa estrangeira; null sem documento. */
  document: string | null;
  name: string | null;
  size: string | null;
}

/** O resultado de um item como entra na agregação: já validado e mapeado (collector/resultMapping.ts). */
export interface ResultRecord {
  purchaseControlNumber: string;
  itemNumber: number;
  sequence: number;
  situation: ResultSituation;
  supplier: SupplierIdentity;
  /** Valor homologado do item em centavos; null quando a fonte não informou valor positivo. */
  valueCents: number | null;
  /** Dia do resultado (AAAA-MM-DD). */
  resultDate: string;
  /** Atualização do resultado na fonte, como veio (AAAA-MM-DDTHH:mm:ss); vazio quando faltou. */
  updatedAt: string;
  unitCode: string | null;
  state: string | null;
  /** Ordem de classificação no registro de preços, quando a fonte a informa. */
  rank: number | null;
  /** Dia do cancelamento, quando houve. */
  cancelledOn: string | null;
}

/** Um item no mapa da linha: o valor em reais (null sem valor) e o dia do resultado. */
export type ItemEntry = [number | null, string];

/** A linha do conjunto `vencedores`: um fornecedor numa licitação. */
export interface WinnerRow {
  key: string;
  purchaseControlNumber: string;
  purchaseYear: number;
  agencyCnpj: string;
  agencyName: string | null;
  cityName: string | null;
  cityIbgeCode: string | null;
  unitCode: string | null;
  state: string | null;
  supplierPersonType: SupplierPersonType | null;
  supplierDocument: string | null;
  supplierName: string | null;
  supplierSize: string | null;
  /** "<item>/<sequencial>" → [valor, dia]. Só resultados vencedores. */
  items: Record<string, ItemEntry>;
  itemCount: number;
  /** Soma do mapa, em reais com 2 casas ("1234.50"). */
  totalValue: string;
  firstResultDate: string;
  lastResultDate: string;
  contentHash: string;
  firstCollectedAt: string;
  lastChangedAt: string;
}

export interface ApplyCounts {
  inserted: number;
  updated: number;
  removed: number;
  /** Linhas tocadas por algum resultado cujo conteúdo não mudou. */
  unchanged: number;
}

export interface ApplyOutcome {
  /** Linhas novas ou alteradas, prontas para gravar. */
  upserts: WinnerRow[];
  /** Linhas que ficaram sem nenhum item vencedor: a linha como estava, para virar lápide. */
  removals: WinnerRow[];
  counts: ApplyCounts;
  /** Chaves das linhas novas, das alteradas e das removidas: quem soma vários lotes conta cada linha uma vez só. */
  insertedKeys: string[];
  updatedKeys: string[];
  removedKeys: string[];
  /** Posições (na lista de entrada) dos resultados que mudaram o estado de alguma linha. */
  alteredRecords: Set<number>;
}

/** Sem documento: a chave da pessoa que não é PJ usa este texto. */
export const NO_DOCUMENT_KEY = 'sem-documento';
const NAME_HASH_LENGTH = 8;
const MAX_DOCUMENT_KEY_LENGTH = 30;

/** Nome para a chave: sem acento, maiúsculas e espaços simples. */
function normalizedName(name: string | null): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Chave do fornecedor. A pessoa jurídica é o CNPJ. Nas outras, o documento (que só existe mascarado) não basta:
 * duas pessoas podem ter os mesmos 6 dígitos, e o nome entra num hash curto para elas não se fundirem.
 */
export function supplierKeyOf(personType: SupplierPersonType | null, document: string | null, name: string | null): string {
  if (personType === 'PJ' && document !== null && /^\d{14}$/.test(document)) {
    return document;
  }
  const safeDocument = document === null ? NO_DOCUMENT_KEY : document.replace(/[^A-Za-z0-9*._-]/g, '-').slice(0, MAX_DOCUMENT_KEY_LENGTH);
  const nameHash = createHash('sha256').update(normalizedName(name)).digest('hex').slice(0, NAME_HASH_LENGTH);
  return `${safeDocument || NO_DOCUMENT_KEY}#${nameHash}`;
}

/** Chave da linha: o fornecedor e a compra. O `|` separa as duas partes, e a chave do fornecedor nunca o contém. */
export function winnerKey(supplierKey: string, purchaseControlNumber: string): string {
  return `${supplierKey}|${purchaseControlNumber}`;
}

/** Chave do item no mapa. */
export function itemKeyOf(itemNumber: number, sequence: number): string {
  return `${itemNumber}/${sequence}`;
}

/** CNPJ do órgão e ano da compra, tirados do número de controle; null fora do formato. */
export function purchaseParts(purchaseControlNumber: string): { agencyCnpj: string; year: number } | null {
  const match = PURCHASE_CONTROL_NUMBER.exec(purchaseControlNumber);
  if (!match) {
    return null;
  }
  return { agencyCnpj: match[1] ?? '', year: Number(match[3]) };
}

const ITEM_KEY = /^(\d+)\/(\d+)$/;

/** Ordem numérica dos itens ("2/1" antes de "10/1"); chave fora do formato vai para o fim. */
function compareItemKeys(a: string, b: string): number {
  const left = ITEM_KEY.exec(a);
  const right = ITEM_KEY.exec(b);
  if (left && right) {
    return Number(left[1]) - Number(right[1]) || Number(left[2]) - Number(right[2]);
  }
  if (left) {
    return -1;
  }
  if (right) {
    return 1;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A chave do primeiro item do mapa (menor número e sequência); null com o mapa vazio. */
function firstKeyOf(items: Readonly<Record<string, ItemEntry>>): string | null {
  let first: string | null = null;
  for (const key of Object.keys(items)) {
    if (first === null || compareItemKeys(key, first) < 0) {
      first = key;
    }
  }
  return first;
}

/** O mapa dos itens como JSON canônico: chaves em ordem numérica. */
export function itemsJson(items: Readonly<Record<string, ItemEntry>>): string {
  const sorted = Object.keys(items)
    .sort(compareItemKeys)
    .map((key) => [key, items[key]] as const);
  return JSON.stringify(Object.fromEntries(sorted));
}

const centsOf = (value: number | null): bigint => (value === null ? 0n : BigInt(Math.round(value * 100)));

/** Centavos como reais com 2 casas, sem passar por ponto flutuante. */
export function formatCents(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const absolute = cents < 0n ? -cents : cents;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

/** Os totais da linha, sempre recalculados a partir do mapa. */
function totalsOf(items: Readonly<Record<string, ItemEntry>>): { itemCount: number; totalValue: string; firstResultDate: string; lastResultDate: string } {
  const entries = Object.values(items);
  let cents = 0n;
  let first = '';
  let last = '';
  for (const [value, day] of entries) {
    cents += centsOf(value);
    if (first === '' || day < first) {
      first = day;
    }
    if (day > last) {
      last = day;
    }
  }
  return { itemCount: entries.length, totalValue: formatCents(cents), firstResultDate: first, lastResultDate: last };
}

/** Hash do conteúdo da linha: o que a identifica e o que mostra, sem os totais (saem do mapa) e sem as datas da coleta. */
function contentHashOf(row: WinnerRow): string {
  return payloadHash({
    key: row.key,
    year: row.purchaseYear,
    agencyCnpj: row.agencyCnpj,
    agencyName: row.agencyName,
    cityName: row.cityName,
    cityIbgeCode: row.cityIbgeCode,
    unitCode: row.unitCode,
    state: row.state,
    personType: row.supplierPersonType,
    document: row.supplierDocument,
    name: row.supplierName,
    size: row.supplierSize,
    items: itemsJson(row.items),
  });
}

/** Linha com os totais e o hash refeitos a partir do mapa. */
function finalized(row: WinnerRow): WinnerRow {
  const next: WinnerRow = { ...row, ...totalsOf(row.items) };
  next.contentHash = contentHashOf(next);
  return next;
}

interface WorkingRow {
  /** A linha como estava no estado lido; null para a linha criada nesta aplicação. */
  previous: WinnerRow | null;
  row: WinnerRow;
  touched: boolean;
  /** A chave do primeiro item da linha (menor número e sequência): dele vêm o fornecedor e a unidade; null sem itens. */
  firstItemKey: string | null;
}

function emptyRowFor(record: ResultRecord, key: string, parts: { agencyCnpj: string; year: number }, now: string): WinnerRow {
  return {
    key,
    purchaseControlNumber: record.purchaseControlNumber,
    purchaseYear: parts.year,
    agencyCnpj: parts.agencyCnpj,
    agencyName: null,
    cityName: null,
    cityIbgeCode: null,
    unitCode: record.unitCode,
    state: record.state,
    supplierPersonType: record.supplier.personType,
    supplierDocument: record.supplier.document,
    supplierName: record.supplier.name,
    supplierSize: record.supplier.size,
    items: {},
    itemCount: 0,
    totalValue: '0.00',
    firstResultDate: '',
    lastResultDate: '',
    contentHash: '',
    firstCollectedAt: now,
    lastChangedAt: now,
  };
}

function compareRecords(a: ResultRecord, b: ResultRecord): number {
  if (a.purchaseControlNumber !== b.purchaseControlNumber) {
    return a.purchaseControlNumber < b.purchaseControlNumber ? -1 : 1;
  }
  return a.itemNumber - b.itemNumber || a.sequence - b.sequence;
}

/**
 * Aplica os resultados lidos ao estado atual das compras que eles tocam e devolve o que mudou.
 *
 * `current` tem todas as linhas já gravadas de cada compra dos resultados (de todos os fornecedores). Os passos, na
 * ordem da compra, do item e da sequência:
 *   1. o lote é deduplicado por (compra, item/sequência): vale o de maior atualização, e no empate o último lido;
 *   2. cada resultado tira a chave do item de todas as linhas da compra e, se for vencedor, põe o item na linha do
 *      fornecedor atual (criando a linha). Isso cobre sobrescrita, cancelamento, reativação, valor ou data corrigidos
 *      e a troca de fornecedor do mesmo item;
 *   3. as linhas tocadas são recalculadas só a partir do mapa;
 *   4. hash igual ao anterior: nada muda; mapa vazio com linha anterior: lápide; sem linha anterior: nada.
 * Cadastro de reserva e qualquer situação fora de vencedor e cancelado não vencem, e tiram o item se ele estava lá.
 */
export function applyResults(current: readonly WinnerRow[], records: readonly ResultRecord[], now: string): ApplyOutcome {
  const latest = new Map<string, { record: ResultRecord; index: number }>();
  for (const [index, record] of records.entries()) {
    const id = `${record.purchaseControlNumber}\u0000${itemKeyOf(record.itemNumber, record.sequence)}`;
    const existing = latest.get(id);
    if (!existing || record.updatedAt >= existing.record.updatedAt) {
      latest.set(id, { record, index });
    }
  }
  const ordered = [...latest.values()].sort((a, b) => compareRecords(a.record, b.record));

  const working = new Map<string, WorkingRow>();
  const keysByPurchase = new Map<string, Set<string>>();
  const registerKey = (purchase: string, key: string) => {
    const keys = keysByPurchase.get(purchase) ?? new Set<string>();
    keys.add(key);
    keysByPurchase.set(purchase, keys);
  };
  for (const row of current) {
    working.set(row.key, { previous: row, row: { ...row, items: { ...row.items } }, touched: false, firstItemKey: firstKeyOf(row.items) });
    registerKey(row.purchaseControlNumber, row.key);
  }

  const affectedByRecord = new Map<number, Set<string>>();
  for (const { record, index } of ordered) {
    const parts = purchaseParts(record.purchaseControlNumber);
    if (!parts) {
      continue;
    }
    const affected = new Set<string>();
    const itemKey = itemKeyOf(record.itemNumber, record.sequence);
    for (const key of keysByPurchase.get(record.purchaseControlNumber) ?? []) {
      const entry = working.get(key);
      if (entry && itemKey in entry.row.items) {
        delete entry.row.items[itemKey];
        if (entry.firstItemKey === itemKey) {
          entry.firstItemKey = firstKeyOf(entry.row.items);
        }
        entry.touched = true;
        affected.add(key);
      }
    }
    if (record.situation === 'winner') {
      const key = winnerKey(record.supplier.key, record.purchaseControlNumber);
      let entry = working.get(key);
      if (!entry) {
        entry = { previous: null, row: emptyRowFor(record, key, parts, now), touched: true, firstItemKey: null };
        working.set(key, entry);
        registerKey(record.purchaseControlNumber, key);
      }
      entry.row.items[itemKey] = [record.valueCents === null ? null : record.valueCents / 100, record.resultDate];
      entry.touched = true;
      if (entry.firstItemKey === null || compareItemKeys(itemKey, entry.firstItemKey) <= 0) {
        entry.firstItemKey = itemKey;
        entry.row.unitCode = record.unitCode ?? entry.row.unitCode;
        entry.row.state = record.state ?? entry.row.state;
        entry.row.supplierPersonType = record.supplier.personType ?? entry.row.supplierPersonType;
        entry.row.supplierDocument = record.supplier.document ?? entry.row.supplierDocument;
        entry.row.supplierName = record.supplier.name ?? entry.row.supplierName;
        entry.row.supplierSize = record.supplier.size ?? entry.row.supplierSize;
      }
      affected.add(key);
    }
    affectedByRecord.set(index, affected);
  }

  const upserts: WinnerRow[] = [];
  const removals: WinnerRow[] = [];
  const insertedKeys: string[] = [];
  const updatedKeys: string[] = [];
  const changedKeys = new Set<string>();
  const counts: ApplyCounts = { inserted: 0, updated: 0, removed: 0, unchanged: 0 };
  for (const entry of working.values()) {
    if (!entry.touched) {
      continue;
    }
    if (Object.keys(entry.row.items).length === 0) {
      if (entry.previous) {
        removals.push(entry.previous);
        changedKeys.add(entry.row.key);
        counts.removed += 1;
      }
      continue;
    }
    const next = finalized(entry.row);
    if (entry.previous && entry.previous.contentHash === next.contentHash) {
      counts.unchanged += 1;
      continue;
    }
    upserts.push({ ...next, firstCollectedAt: entry.previous?.firstCollectedAt ?? now, lastChangedAt: now });
    changedKeys.add(next.key);
    if (entry.previous) {
      updatedKeys.push(next.key);
      counts.updated += 1;
    } else {
      insertedKeys.push(next.key);
      counts.inserted += 1;
    }
  }

  const alteredRecords = new Set<number>();
  for (const [index, keys] of affectedByRecord) {
    if ([...keys].some((key) => changedKeys.has(key))) {
      alteredRecords.add(index);
    }
  }
  const byKey = (a: WinnerRow, b: WinnerRow) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  upserts.sort(byKey);
  removals.sort(byKey);
  return {
    upserts,
    removals,
    counts,
    insertedKeys: insertedKeys.sort(),
    updatedKeys: updatedKeys.sort(),
    removedKeys: removals.map((row) => row.key),
    alteredRecords,
  };
}

// ---- Ida e volta com a linha do arquivo (as colunas de WINNER_COLUMNS) ----

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const textOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** O mapa de itens a partir do JSON gravado; formato fora do esperado é erro (arquivo corrompido). */
function parseItems(json: unknown): Record<string, ItemEntry> {
  const parsed: unknown = typeof json === 'string' ? JSON.parse(json) : null;
  if (!isRecord(parsed)) {
    throw new Error('Mapa de itens dos vencedores fora do formato');
  }
  const items: Record<string, ItemEntry> = {};
  for (const [key, entry] of Object.entries(parsed)) {
    if (!Array.isArray(entry) || entry.length !== 2 || (entry[0] !== null && typeof entry[0] !== 'number') || typeof entry[1] !== 'string') {
      throw new Error(`Item ${key} do mapa dos vencedores fora do formato`);
    }
    items[key] = [entry[0], entry[1]];
  }
  return items;
}

/** Linha do conjunto a partir da linha lida do arquivo (getRowObjectsJson do DuckDB: DECIMAL e DATE chegam como texto). */
export function fromWinnerRecord(record: Record<string, unknown>): WinnerRow {
  return {
    key: String(record['chave']),
    purchaseControlNumber: String(record['numero_controle_compra']),
    purchaseYear: Number(record['ano_compra']),
    agencyCnpj: String(record['orgao_cnpj']),
    agencyName: textOrNull(record['orgao_razao_social']),
    cityName: textOrNull(record['municipio_nome']),
    cityIbgeCode: textOrNull(record['municipio_ibge']),
    unitCode: textOrNull(record['unidade_codigo']),
    state: textOrNull(record['uf']),
    supplierPersonType: textOrNull(record['fornecedor_tipo_pessoa']) as SupplierPersonType | null,
    supplierDocument: textOrNull(record['fornecedor_documento']),
    supplierName: textOrNull(record['fornecedor_nome']),
    supplierSize: textOrNull(record['fornecedor_porte']),
    items: parseItems(record['itens']),
    itemCount: Number(record['quantidade_itens']),
    totalValue: String(record['valor_homologado_total']),
    firstResultDate: String(record['primeira_data_resultado']),
    lastResultDate: String(record['ultima_data_resultado']),
    contentHash: String(record['hash_conteudo']),
    firstCollectedAt: String(record['primeira_coleta_em']),
    lastChangedAt: String(record['ultima_alteracao_em']),
  };
}

/** Linha do arquivo (as colunas de WINNER_COLUMNS, na ordem) a partir da linha do conjunto. */
export function toWinnerRecord(row: WinnerRow): Record<string, unknown> {
  return {
    chave: row.key,
    numero_controle_compra: row.purchaseControlNumber,
    ano_compra: row.purchaseYear,
    orgao_cnpj: row.agencyCnpj,
    orgao_razao_social: row.agencyName,
    municipio_nome: row.cityName,
    municipio_ibge: row.cityIbgeCode,
    unidade_codigo: row.unitCode,
    uf: row.state,
    fornecedor_tipo_pessoa: row.supplierPersonType,
    fornecedor_documento: row.supplierDocument,
    fornecedor_nome: row.supplierName,
    fornecedor_porte: row.supplierSize,
    itens: itemsJson(row.items),
    quantidade_itens: row.itemCount,
    valor_homologado_total: row.totalValue,
    primeira_data_resultado: row.firstResultDate,
    ultima_data_resultado: row.lastResultDate,
    hash_conteudo: row.contentHash,
    primeira_coleta_em: row.firstCollectedAt,
    ultima_alteracao_em: row.lastChangedAt,
  };
}
