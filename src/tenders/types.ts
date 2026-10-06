// Respostas e corpos da API do módulo (/api/tenders), escritos a partir dos
// serviços da Fase 2 (backend/src/modules/tenders/services). Datas e horas vêm
// em ISO com o fuso de Brasília (-03:00); valores em reais, como número.

export const TRACKING_STATUSES = ['ANALISAR', 'PARTICIPAR', 'DESCARTADO'] as const;
export type TrackingStatus = (typeof TRACKING_STATUSES)[number];

/** Filtro de acompanhamento da busca: os status e "sem acompanhamento" (SEM). */
export const TRACKING_FILTER_NONE = 'SEM';
export const TRACKING_FILTERS = [...TRACKING_STATUSES, TRACKING_FILTER_NONE] as const;
export type TrackingFilter = (typeof TRACKING_FILTERS)[number];

/** Status gravado no histórico quando o acompanhamento é removido. */
export const TRACKING_REMOVED = 'REMOVIDO';
export type TrackingHistoryStatus = TrackingStatus | typeof TRACKING_REMOVED;

export const SEARCH_TERMS_MODES = ['E', 'OU'] as const;
export type SearchTermsMode = (typeof SEARCH_TERMS_MODES)[number];

/** Ordenações da busca; `relevance` só com termos. */
export const NOTICE_SORTS = ['closingAsc', 'publishedDesc', 'valueDesc', 'valueAsc', 'relevance'] as const;
export type NoticeSort = (typeof NOTICE_SORTS)[number];

/** Situação "Divulgada no PNCP": o card só mostra as outras. */
export const SITUATION_PUBLISHED_ID = 1;

/** Observação do acompanhamento: até 2.000 caracteres (API). */
export const MAX_TRACKING_NOTE_LENGTH = 2000;

export interface Paginated<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface NoticeTracking {
  status: TrackingStatus;
  updatedAt: string | null;
}

export interface NoticeListItem {
  id: number;
  pncpControlNumber: string;
  procurementObject: string;
  agencyCnpj: string | null;
  agencyName: string | null;
  state: string | null;
  cityName: string | null;
  cityIbgeCode: string | null;
  modalityId: number | null;
  modalityName: string | null;
  situationId: number | null;
  situationName: string | null;
  isPriceRegistration: boolean | null;
  estimatedTotalValue: number | null;
  publishedAt: string | null;
  proposalOpensAt: string | null;
  proposalClosesAt: string | null;
  pncpLink: string | null;
  sourceSystemLink: string | null;
  tracking: NoticeTracking | null;
  /** Trecho do objeto com os termos entre << e >>; null sem termos de busca. */
  highlightedExcerpt: string | null;
}

/** Como a API entendeu o texto da busca (`q`). */
export interface ParsedQuery {
  terms: string[];
  excludedTerms: string[];
  termsMode: SearchTermsMode;
}

export interface NoticeSearchResult extends Paginated<NoticeListItem> {
  parsedQuery: ParsedQuery;
}

export interface TrackingView extends NoticeTracking {
  note: string | null;
}

export interface NoticeDetail {
  id: number;
  pncpControlNumber: string;
  procurementObject: string;
  additionalInformation: string | null;
  agencyCnpj: string | null;
  agencyName: string | null;
  governmentSphere: string | null;
  unitCode: string | null;
  unitName: string | null;
  state: string | null;
  cityName: string | null;
  cityIbgeCode: string | null;
  modalityId: number | null;
  modalityName: string | null;
  disputeModeId: number | null;
  disputeModeName: string | null;
  situationId: number | null;
  situationName: string | null;
  purchaseYear: number | null;
  purchaseSequence: number | null;
  purchaseNumber: string | null;
  processNumber: string | null;
  isPriceRegistration: boolean | null;
  estimatedTotalValue: number | null;
  publishedAt: string | null;
  proposalOpensAt: string | null;
  proposalClosesAt: string | null;
  pncpUpdatedAt: string | null;
  pncpLink: string | null;
  sourceSystemLink: string | null;
  firstCollectedAt: string | null;
  lastCollectedAt: string | null;
  tracking: TrackingView | null;
  matchingSavedSearches: Array<{ id: number; name: string }>;
}

export interface TrackingHistoryEntry {
  id: number;
  previousStatus: TrackingHistoryStatus | null;
  newStatus: TrackingHistoryStatus;
  note: string | null;
  userId: number | null;
  userName: string | null;
  createdAt: string | null;
}

export interface TrackingInput {
  status: TrackingStatus;
  note: string | null;
}

export interface NoticeItem {
  number: number;
  description: string | null;
  kind: string | null;
  quantity: number | null;
  unit: string | null;
  estimatedUnitValue: number | null;
  estimatedTotalValue: number | null;
  confidentialBudget: boolean;
  situationName: string | null;
  judgmentCriterionName: string | null;
}

export interface NoticeFile {
  sequence: number;
  title: string | null;
  typeName: string | null;
  url: string;
  publishedAt: string | null;
}

/** Itens ou arquivos do PNCP, buscados sob demanda e guardados por 24 h na API. */
export interface NoticeDetailList<T> {
  records: T[];
  /** false: o PNCP ainda não tem esta compra. */
  foundOnPncp: boolean;
  /** Há mais registros no PNCP do que a API trouxe. */
  hasMore: boolean;
  /** Cópia guardada, servida porque o PNCP falhou agora. */
  stale: boolean;
  fetchedAt: string | null;
  pncpLink: string | null;
}

/** Critérios de uma busca salva no corpo da API. Valores em decimal com ponto ("150000.50"). */
export interface SavedSearchCriteriaBody {
  terms: string[];
  termsMode: SearchTermsMode;
  excludedTerms: string[];
  states: string[];
  cityIbgeCodes: string[];
  agencyCnpjs: string[];
  modalities: number[];
  minValue: string | null;
  maxValue: string | null;
  includeWithoutValue: boolean;
  /** null = SRP indiferente. */
  priceRegistration: boolean | null;
}

export interface SavedSearchBody extends SavedSearchCriteriaBody {
  name: string;
  notify?: boolean;
  active?: boolean;
}

export interface SavedSearch {
  id: number;
  name: string;
  terms: string[];
  termsMode: SearchTermsMode;
  excludedTerms: string[];
  states: string[];
  cityIbgeCodes: string[];
  agencyCnpjs: string[];
  modalities: number[];
  minValue: number | null;
  maxValue: number | null;
  includeWithoutValue: boolean;
  priceRegistration: boolean | null;
  notify: boolean;
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  /** Editais abertos que batem com a busca agora. */
  openCount: number;
}

export interface SavedSearchPreview {
  count: number;
  items: NoticeListItem[];
}

export interface DashboardView {
  cards: { newToday: number; closingIn7Days: number; analyzing: number; participating: number };
  closingSoon: NoticeListItem[];
  openByState: Array<{ state: string; count: number }>;
  savedSearches: Array<{ id: number; name: string; active: boolean; openCount: number }>;
  lastUpdateAt: string | null;
  lastRunFailed: boolean;
}

export interface Municipality {
  code: string;
  name: string;
  state: string;
}

export interface DomainLists {
  modalities: Array<{ id: number; name: string }>;
  situations: Array<{ id: number; name: string }>;
  states: string[];
  trackingStatuses: TrackingStatus[];
  notificationTypes: string[];
  municipalities: Municipality[];
}

/** Conta na tela "Contas habilitadas" (GET /api/tenders/admin/accounts, só admin da plataforma). */
export interface AdminTenderAccount {
  accountId: number;
  accountName: string;
  accountType: 'pessoal' | 'empresa';
  ownerName: string;
  ownerEmail: string;
  enabled: boolean;
  /** Última mudança da habilitação; null se a conta nunca foi habilitada. */
  changedAt: string | null;
}

/** Resposta de PUT /api/tenders/admin/accounts/:accountId. */
export interface AccountEnabledChange {
  accountId: number;
  accountName: string;
  active: boolean;
  changedAt: string | null;
}
