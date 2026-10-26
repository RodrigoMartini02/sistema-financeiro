import type { ContractTermSummary, TenderContractRow } from '../collector/contractMapping';

// Formato do armazém de contratos no R2 (plano .plans/licitacoes-contratos-no-r2.md,
// Parte R1): arquivos Parquet em quatro conjuntos, cada um na ordem da busca que
// atende, e um manifesto (manifest.ts) com a lista dos arquivos em uso.
//   vigentes    vencimento de hoje em diante, refeito a cada publicação, por
//               faixa de vencimento (semana no 1º ano, mês no 2º, ano até 10
//               anos e "depois"), por vencimento e UF;
//   contratos   todos, por ano do contrato, por UF e número de controle (no
//               piloto, a ordem por UF deixou a busca de palavra com UF de 3 a 9
//               vezes mais rápida, sem piorar órgão e detalhe);
//   fornecedor  todos, só as colunas da lista, por ano, por CNPJ do fornecedor;
//   vencedores  uma linha por licitação e fornecedor, por ano da compra, pela
//               chave (CNPJ do fornecedor e número da compra). É gravado por
//               outro gravador (winnerWriter.ts), e o escritor de contratos só
//               o carrega adiante no manifesto (plano .plans/licitacoes-vencedores.md).
// Cada pasta (faixa ou ano) fica em partes de tamanho limitado, divididas pela
// chave das partes (PART_KEY), para o Cron Job regravar uma parte de cada vez
// com pouca memória: na importação dos contratos locais, uma parte de 50 mil
// linhas não coube em 128 MB do DuckDB, e as de até 30 mil cabem em 160 MB.

/**
 * Número de controle da compra no PNCP: CNPJ do órgão, sequencial e ano ("03353358000196-1-000216/2026"). Uma
 * expressão só para o detalhe do contrato e para os vencedores, que ligam ao edital por esse número.
 */
export const PURCHASE_CONTROL_NUMBER = /^(\d{14})-\d+-0*(\d+)\/(\d{4})$/;

/** Pasta do armazém no bucket, dentro da pasta do ambiente. */
export const STORE_FOLDER = 'contratos';
export const MANIFEST_KEY = `${STORE_FOLDER}/manifesto.json`;
export const FILES_FOLDER = `${STORE_FOLDER}/arquivos`;
export const PARQUET_CONTENT_TYPE = 'application/vnd.apache.parquet';

export const STORE_DATASETS = ['vigentes', 'contratos', 'fornecedor', 'vencedores'] as const;
export type StoreDataset = (typeof STORE_DATASETS)[number];

/** Os conjuntos dos contratos: os que o escritor de contratos grava e o Web Service lê. */
export const CONTRACT_DATASETS = ['vigentes', 'contratos', 'fornecedor'] as const satisfies readonly StoreDataset[];
export type ContractDataset = (typeof CONTRACT_DATASETS)[number];

/** Conjuntos de contratos por ano em que só as partes mudadas são regravadas (os vigentes são refeitos inteiros). */
export type SlicedDataset = Exclude<ContractDataset, 'vigentes'>;

/** Linhas por arquivo: acima disso, a parte é dividida. O fornecedor tem linhas mais estreitas. */
export const MAX_ROWS_PER_FILE: Record<StoreDataset, number> = {
  vigentes: 30_000,
  contratos: 30_000,
  fornecedor: 60_000,
  // Ponto de partida para as linhas com o mapa de itens; o piloto remede.
  vencedores: 25_000,
};
export const ROW_GROUP_SIZE = 25_000;

interface FieldColumn {
  field: keyof TenderContractRow;
  column: string;
  type: string;
}

/** Os campos do contrato, com os nomes das colunas da antiga licitacoes.contrato. */
const FIELD_COLUMNS: readonly FieldColumn[] = [
  { field: 'pncpControlNumber', column: 'numero_controle_pncp', type: 'VARCHAR' },
  { field: 'purchaseControlNumber', column: 'numero_controle_compra', type: 'VARCHAR' },
  { field: 'contractYear', column: 'ano_contrato', type: 'INTEGER' },
  { field: 'contractSequence', column: 'sequencial_contrato', type: 'INTEGER' },
  { field: 'contractNumber', column: 'numero_contrato', type: 'VARCHAR' },
  { field: 'processNumber', column: 'processo', type: 'VARCHAR' },
  { field: 'agencyCnpj', column: 'orgao_cnpj', type: 'VARCHAR' },
  { field: 'agencyName', column: 'orgao_razao_social', type: 'VARCHAR' },
  { field: 'governmentSphere', column: 'esfera', type: 'VARCHAR' },
  { field: 'unitCode', column: 'unidade_codigo', type: 'VARCHAR' },
  { field: 'unitName', column: 'unidade_nome', type: 'VARCHAR' },
  { field: 'state', column: 'uf', type: 'VARCHAR' },
  { field: 'cityName', column: 'municipio_nome', type: 'VARCHAR' },
  { field: 'cityIbgeCode', column: 'municipio_ibge', type: 'VARCHAR' },
  { field: 'categoryId', column: 'categoria_id', type: 'SMALLINT' },
  { field: 'categoryName', column: 'categoria_nome', type: 'VARCHAR' },
  { field: 'contractObject', column: 'objeto', type: 'VARCHAR' },
  { field: 'additionalInformation', column: 'informacao_complementar', type: 'VARCHAR' },
  { field: 'supplierPersonType', column: 'fornecedor_tipo_pessoa', type: 'VARCHAR' },
  { field: 'supplierDocument', column: 'fornecedor_documento', type: 'VARCHAR' },
  { field: 'supplierName', column: 'fornecedor_nome', type: 'VARCHAR' },
  { field: 'initialValue', column: 'valor_inicial', type: 'DECIMAL(18,2)' },
  { field: 'globalValue', column: 'valor_global', type: 'DECIMAL(18,2)' },
  { field: 'signedAt', column: 'data_assinatura', type: 'DATE' },
  { field: 'termStart', column: 'vigencia_inicio', type: 'DATE' },
  { field: 'originalTermEnd', column: 'vigencia_fim_original', type: 'DATE' },
  { field: 'expiresOn', column: 'vencimento', type: 'DATE' },
  { field: 'contractTypeId', column: 'tipo_contrato_id', type: 'SMALLINT' },
  { field: 'contractTypeName', column: 'tipo_contrato_nome', type: 'VARCHAR' },
  // Datas e horas do PNCP como vieram (AAAA-MM-DDTHH:mm:ss, Brasília): a
  // conferência dos termos compara a atualização global com a referência gravada.
  { field: 'publishedAt', column: 'data_publicacao_pncp', type: 'VARCHAR' },
  { field: 'pncpUpdatedAt', column: 'data_atualizacao_pncp', type: 'VARCHAR' },
  { field: 'pncpGlobalUpdatedAt', column: 'data_atualizacao_global', type: 'VARCHAR' },
  // JSON dos termos; NULL = termos não conferidos, [] = conferidos, sem termo.
  { field: 'amendments', column: 'aditivos', type: 'VARCHAR' },
  { field: 'amendmentsReference', column: 'aditivos_referencia', type: 'VARCHAR' },
  { field: 'payloadHash', column: 'hash_payload', type: 'VARCHAR' },
];

/** Colunas só do armazém: datas da coleta e os campos de busca calculados pelo Postgres (textSearch.ts). */
const STORE_COLUMNS = [
  { column: 'primeira_coleta_em', type: 'VARCHAR' },
  { column: 'ultima_coleta_em', type: 'VARCHAR' },
  { column: 'radicais', type: 'VARCHAR' },
  { column: 'grupos_numero', type: 'VARCHAR[]' },
  { column: 'grupos_processo', type: 'VARCHAR[]' },
  { column: 'grupos_controle', type: 'VARCHAR[]' },
  { column: 'grupos_compra', type: 'VARCHAR[]' },
] as const;

export interface ColumnSpec {
  column: string;
  type: string;
}

/** Colunas dos conjuntos vigentes e contratos, na ordem dos arquivos. */
export const CONTRACT_COLUMNS: readonly ColumnSpec[] = [
  ...FIELD_COLUMNS.map(({ column, type }) => ({ column, type })),
  ...STORE_COLUMNS,
];

/** Colunas do conjunto fornecedor: as da lista de contratos. */
export const SUPPLIER_COLUMNS: readonly ColumnSpec[] = [
  'numero_controle_pncp',
  'ano_contrato',
  'sequencial_contrato',
  'orgao_cnpj',
  'orgao_razao_social',
  'uf',
  'municipio_nome',
  'municipio_ibge',
  'categoria_id',
  'categoria_nome',
  'tipo_contrato_id',
  'tipo_contrato_nome',
  'objeto',
  'fornecedor_documento',
  'fornecedor_nome',
  'valor_global',
  'vigencia_inicio',
  'vigencia_fim_original',
  'vencimento',
  'data_publicacao_pncp',
].map((name) => {
  const spec = CONTRACT_COLUMNS.find((column) => column.column === name);
  if (!spec) {
    throw new Error(`coluna desconhecida no conjunto fornecedor: ${name}`);
  }
  return spec;
});

/**
 * Colunas do conjunto vencedores: uma linha por licitação (número de controle da compra) e fornecedor. O órgão, o
 * município e o nome do órgão só são preenchidos se a fonte os entregar (a de resultados não traz); os totais saem
 * sempre do mapa de itens (winnerRows.ts).
 */
export const WINNER_COLUMNS: readonly ColumnSpec[] = [
  { column: 'chave', type: 'VARCHAR' },
  { column: 'numero_controle_compra', type: 'VARCHAR' },
  { column: 'ano_compra', type: 'SMALLINT' },
  { column: 'orgao_cnpj', type: 'VARCHAR' },
  { column: 'orgao_razao_social', type: 'VARCHAR' },
  { column: 'municipio_nome', type: 'VARCHAR' },
  { column: 'municipio_ibge', type: 'VARCHAR' },
  { column: 'unidade_codigo', type: 'VARCHAR' },
  { column: 'uf', type: 'VARCHAR' },
  { column: 'fornecedor_tipo_pessoa', type: 'VARCHAR' },
  { column: 'fornecedor_documento', type: 'VARCHAR' },
  { column: 'fornecedor_nome', type: 'VARCHAR' },
  { column: 'fornecedor_porte', type: 'VARCHAR' },
  // JSON: {"<item>/<sequencial>": [valor em reais ou null, "AAAA-MM-DD"]}, só dos resultados vencedores.
  { column: 'itens', type: 'VARCHAR' },
  { column: 'quantidade_itens', type: 'INTEGER' },
  { column: 'valor_homologado_total', type: 'DECIMAL(18,2)' },
  { column: 'primeira_data_resultado', type: 'DATE' },
  { column: 'ultima_data_resultado', type: 'DATE' },
  { column: 'hash_conteudo', type: 'VARCHAR' },
  { column: 'primeira_coleta_em', type: 'VARCHAR' },
  { column: 'ultima_alteracao_em', type: 'VARCHAR' },
];

const COLUMNS_BY_DATASET: Record<StoreDataset, readonly ColumnSpec[]> = {
  vigentes: CONTRACT_COLUMNS,
  contratos: CONTRACT_COLUMNS,
  fornecedor: SUPPLIER_COLUMNS,
  vencedores: WINNER_COLUMNS,
};

export function columnsOf(dataset: StoreDataset): readonly ColumnSpec[] {
  return COLUMNS_BY_DATASET[dataset];
}

/** Lista de colunas para SELECT. */
export function columnList(dataset: StoreDataset): string {
  return columnsOf(dataset)
    .map((spec) => spec.column)
    .join(', ');
}

/** Colunas com tipo, para CREATE TABLE. */
export function columnDefinitions(dataset: StoreDataset): string {
  return columnsOf(dataset)
    .map((spec) => `${spec.column} ${spec.type}`)
    .join(', ');
}

/** Ordem das linhas dentro dos arquivos de cada conjunto. */
export const ROW_ORDER: Record<StoreDataset, string> = {
  vigentes: 'vencimento, uf, numero_controle_pncp',
  contratos: 'uf, numero_controle_pncp',
  fornecedor: 'fornecedor_documento, data_publicacao_pncp DESC, numero_controle_pncp',
  vencedores: 'chave',
};

/** Chave das partes de cada conjunto: única por contrato e na ordem das linhas dos arquivos. */
export const PART_KEY: Record<StoreDataset, string> = {
  vigentes: `strftime(vencimento, '%Y-%m-%d') || '|' || coalesce(uf, '') || '|' || numero_controle_pncp`,
  contratos: `coalesce(uf, '') || '|' || numero_controle_pncp`,
  fornecedor: `coalesce(fornecedor_documento, '') || '|' || numero_controle_pncp`,
  vencedores: 'chave',
};

/** Partição (pasta) dos conjuntos em partes: o ano do contrato. */
export const SLICE_PARTITION = 'CAST(ano_contrato AS VARCHAR)';

/** Partição dos vencedores: o ano da compra (do sufixo do número de controle), que nunca muda numa linha. */
export const WINNER_PARTITION = 'CAST(ano_compra AS VARCHAR)';

/**
 * Faixa de vencimento dos vigentes, a partir de `today` (expressão DATE): semana
 * no primeiro ano, mês no segundo, ano até 10 anos e uma faixa só depois. O nome
 * é o dia em que a faixa começa (AAAA-MM-DD), para a ordem dos nomes ser a das datas.
 */
export function activeBandExpression(today: string): string {
  return `CASE
    WHEN vencimento < ${today} + 365 THEN strftime(date_trunc('week', vencimento), '%Y-%m-%d')
    WHEN vencimento < ${today} + 730 THEN strftime(date_trunc('month', vencimento), '%Y-%m-%d')
    WHEN vencimento < ${today} + 3650 THEN strftime(date_trunc('year', vencimento), '%Y-%m-%d')
    ELSE 'depois' END`;
}

/**
 * Identificador do contrato (a "chave"): o número de controle do PNCP (CNPJ do
 * órgão, tipo, sequencial e ano: "03353358000196-2-000216/2026") ou, nos
 * contratos federais do Compras.gov.br, "comprasgov-<unidade>-<tipo>-<número>"
 * ("comprasgov-153254-50-00586/2023"; o número só com letras, dígitos e / _ . -).
 * Nada fora disso vira consulta, favorito ou aviso (a chave entra como literal
 * no SQL do armazém: sem aspas nem espaços).
 */
export const CONTRACT_KEY_PATTERN = /^(?:\d{14}-\d-\d{6,10}\/\d{4}|comprasgov-\d{1,8}-\d{1,3}-[0-9A-Za-z/_.-]{1,40})$/;

export function isContractKey(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 60 && CONTRACT_KEY_PATTERN.test(value);
}

/** Começo da chave dos contratos federais do Compras.gov.br; a dos do PNCP começa pelo CNPJ do órgão. */
export const FEDERAL_CONTRACT_KEY_PREFIX = 'comprasgov-';

/** De onde vem o contrato: o PNCP (com termos e link do documento) ou o Compras.gov.br (só federais, sem os dois). */
export type ContractOrigin = 'NATIONAL' | 'FEDERAL';

export function contractOriginOf(key: string): ContractOrigin {
  return key.startsWith(FEDERAL_CONTRACT_KEY_PREFIX) ? 'FEDERAL' : 'NATIONAL';
}

/** Caminho no bucket de um arquivo novo: a versão e a publicação no nome, para nunca sobrescrever um em uso. */
export function storeFileKey(dataset: StoreDataset, partition: string, revision: string, sequence: number): string {
  return `${FILES_FOLDER}/${dataset}/${partition}/v${revision}-${String(sequence).padStart(4, '0')}.parquet`;
}

/** Contrato como fica no armazém: os campos da coleta e as datas da coleta. */
export interface StoredContract extends TenderContractRow {
  firstCollectedAt: string;
  lastCollectedAt: string;
}

/** Campos de busca de um contrato, calculados pelo Postgres (textSearch.ts). */
export interface ContractSearchFields {
  /** Radicais do texto (objeto e informação complementar), em ordem, entre espaços. */
  stems: string;
  numberGroups: string[];
  processGroups: string[];
  controlGroups: string[];
  purchaseGroups: string[];
}

/** Linha do arquivo (colunas do armazém) a partir do contrato e dos campos de busca. */
export function toStoreRecord(contract: StoredContract, search: ContractSearchFields): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const { field, column } of FIELD_COLUMNS) {
    const value = contract[field] ?? null;
    if (field === 'amendments') {
      record[column] = value === null ? null : JSON.stringify(value);
    } else if (field === 'amendmentsReference') {
      // Comparada com a atualização global no formato do PNCP (19 caracteres).
      record[column] = typeof value === 'string' ? value.slice(0, 19) : null;
    } else {
      record[column] = value;
    }
  }
  record['primeira_coleta_em'] = contract.firstCollectedAt;
  record['ultima_coleta_em'] = contract.lastCollectedAt;
  record['radicais'] = search.stems;
  record['grupos_numero'] = search.numberGroups;
  record['grupos_processo'] = search.processGroups;
  record['grupos_controle'] = search.controlGroups;
  record['grupos_compra'] = search.purchaseGroups;
  return record;
}

/** Contrato a partir da linha lida do armazém (getRowObjectsJson do DuckDB). */
export function fromStoreRecord(record: Record<string, unknown>): StoredContract {
  const contract: Record<string, unknown> = {};
  for (const { field, column } of FIELD_COLUMNS) {
    const value = record[column] ?? null;
    contract[field] = field === 'amendments' && typeof value === 'string' ? (JSON.parse(value) as ContractTermSummary[]) : value;
  }
  contract['firstCollectedAt'] = record['primeira_coleta_em'];
  contract['lastCollectedAt'] = record['ultima_coleta_em'];
  return contract as unknown as StoredContract;
}
