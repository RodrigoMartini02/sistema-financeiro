// Domínios do módulo de Licitações: valores do PNCP e dos campos com lista
// fechada nas tabelas do schema `licitacoes` (as CHECKs da migration 0073).

/** Modalidades de contratação do PNCP (`codigoModalidadeContratacao`). */
export const TENDER_MODALITIES = [
  { id: 1, name: 'Leilão – Eletrônico' },
  { id: 2, name: 'Diálogo Competitivo' },
  { id: 3, name: 'Concurso' },
  { id: 4, name: 'Concorrência – Eletrônica' },
  { id: 5, name: 'Concorrência – Presencial' },
  { id: 6, name: 'Pregão – Eletrônico' },
  { id: 7, name: 'Pregão – Presencial' },
  { id: 8, name: 'Dispensa de Licitação' },
  { id: 9, name: 'Inexigibilidade' },
  { id: 10, name: 'Manifestação de Interesse' },
  { id: 11, name: 'Pré-qualificação' },
  { id: 12, name: 'Credenciamento' },
  { id: 13, name: 'Leilão – Presencial' },
] as const;
export type TenderModalityId = (typeof TENDER_MODALITIES)[number]['id'];

export const TENDER_MODALITY_IDS: readonly number[] = TENDER_MODALITIES.map((modality) => modality.id);

/** Modalidades coletadas quando PNCP_MODALITIES não é informada. */
export const DEFAULT_COLLECTED_MODALITIES = [6, 8, 4, 7] as const;

/** Situação da contratação no PNCP (`situacaoCompraId`). Só a 1 entra nas buscas. */
export const TENDER_SITUATIONS = [
  { id: 1, name: 'Divulgada no PNCP' },
  { id: 2, name: 'Revogada' },
  { id: 3, name: 'Anulada' },
  { id: 4, name: 'Suspensa' },
] as const;

export const BRAZILIAN_STATES = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const;
export type BrazilianState = (typeof BRAZILIAN_STATES)[number];

export const TRACKING_STATUSES = ['ANALISAR', 'PARTICIPAR', 'DESCARTADO'] as const;
export type TrackingStatus = (typeof TRACKING_STATUSES)[number];

/** Status gravado no histórico quando o acompanhamento é removido da conta. */
export const TRACKING_REMOVED = 'REMOVIDO';
export type TrackingHistoryStatus = TrackingStatus | typeof TRACKING_REMOVED;

/** Filtro de acompanhamento na busca: os status e "sem acompanhamento" (SEM). */
export const TRACKING_FILTER_NONE = 'SEM';
export const TRACKING_FILTERS = [...TRACKING_STATUSES, TRACKING_FILTER_NONE] as const;
export type TrackingFilter = (typeof TRACKING_FILTERS)[number];

export const SEARCH_TERMS_MODES = ['OU', 'E'] as const;
export type SearchTermsMode = (typeof SEARCH_TERMS_MODES)[number];

/** Ordenações da busca de editais; `relevance` só com termos. */
export const NOTICE_SORTS = ['closingAsc', 'publishedDesc', 'valueDesc', 'valueAsc', 'relevance'] as const;
export type NoticeSort = (typeof NOTICE_SORTS)[number];

/** Papel da pessoa no módulo, dentro da conta da requisição. */
export const TENDER_ROLES = ['TITULAR', 'COLABORADOR'] as const;
export type TenderRole = (typeof TENDER_ROLES)[number];

export const TENDER_NOTIFICATION_TYPES = ['NOVO_EDITAL', 'EDITAL_ALTERADO', 'PRAZO_3D', 'PRAZO_1D'] as const;
export type TenderNotificationType = (typeof TENDER_NOTIFICATION_TYPES)[number];

export const COLLECTION_RUN_TYPES = ['VARREDURA', 'INCREMENTAL', 'LEMBRETES', 'LIMPEZA', 'MANUAL'] as const;
export type CollectionRunType = (typeof COLLECTION_RUN_TYPES)[number];

export const COLLECTION_RUN_STATUSES = ['EXECUTANDO', 'SUCESSO', 'PARCIAL', 'FALHA'] as const;
export type CollectionRunStatus = (typeof COLLECTION_RUN_STATUSES)[number];

export const DETAIL_CACHE_TYPES = ['ITENS', 'ARQUIVOS'] as const;
export type DetailCacheType = (typeof DETAIL_CACHE_TYPES)[number];
