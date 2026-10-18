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

/** Ordenações da busca de contratos; o padrão é o vencimento mais próximo, e `relevance` só vale com termos. */
export const CONTRACT_SORTS = ['expiryAsc', 'publishedDesc', 'valueDesc', 'valueAsc', 'relevance'] as const;
export type ContractSort = (typeof CONTRACT_SORTS)[number];

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
  /** Favorito da pessoa logada (cada pessoa tem os seus). */
  isFavorite: boolean;
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
  isFavorite: boolean;
  matchingSavedSearches: Array<{ id: number; name: string }>;
}

/** Resposta de favoritar e de tirar dos favoritos. */
export interface FavoriteView {
  noticeId: number;
  isFavorite: boolean;
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

/** Contrato da busca "Contratos a vencer". Datas de vigência em AAAA-MM-DD. */
export interface ContractListItem {
  id: number;
  pncpControlNumber: string;
  contractObject: string;
  agencyCnpj: string;
  agencyName: string | null;
  state: string | null;
  cityName: string | null;
  cityIbgeCode: string | null;
  categoryId: number | null;
  categoryName: string | null;
  /** Tipo do PNCP (contrato, empenho, carta contrato...); null em registro sem tipo. */
  contractTypeId: number | null;
  contractTypeName: string | null;
  supplierName: string | null;
  /** CNPJ (14 dígitos) ou, na pessoa física, o CPF mascarado. */
  supplierDocument: string | null;
  globalValue: number | null;
  termStart: string;
  /** null: sem data de fim, ou com uma fora do normal. */
  originalTermEnd: string | null;
  /** Vencimento atual: o fim original ou o do aditivo mais recente que muda a vigência; null = sem vencimento. */
  expiresOn: string | null;
  publishedAt: string | null;
  /** O vencimento atual é diferente do fim original (aditivo de prazo ou rescisão). */
  isExtended: boolean;
  isFavorite: boolean;
  /** Trecho do objeto com os termos entre << e >>; null sem termos de busca. */
  highlightedExcerpt: string | null;
  pncpLink: string;
}

export interface ContractSearchResult extends Paginated<ContractListItem> {
  parsedQuery: ParsedQuery;
}

/** Aditivo ou rescisão do contrato, como o PNCP informa (sem os apostilamentos). */
export interface ContractAmendment {
  type: string | null;
  number: string | null;
  sequence: number | null;
  signedAt: string | null;
  endDate: string | null;
  addedValue: number | null;
  changesTerm: boolean;
}

export interface ContractDetail {
  id: number;
  pncpControlNumber: string;
  purchaseControlNumber: string | null;
  contractYear: number;
  contractSequence: number;
  contractNumber: string | null;
  processNumber: string | null;
  agencyCnpj: string;
  agencyName: string | null;
  governmentSphere: string | null;
  unitCode: string | null;
  unitName: string | null;
  state: string | null;
  cityName: string | null;
  cityIbgeCode: string | null;
  categoryId: number | null;
  categoryName: string | null;
  contractTypeId: number | null;
  contractTypeName: string | null;
  contractObject: string;
  additionalInformation: string | null;
  supplierPersonType: 'PJ' | 'PF' | 'PE' | null;
  supplierDocument: string | null;
  supplierName: string | null;
  initialValue: number | null;
  globalValue: number | null;
  signedAt: string | null;
  termStart: string;
  /** null: sem data de fim, ou com uma fora do normal. */
  originalTermEnd: string | null;
  /** null: sem vencimento. */
  expiresOn: string | null;
  isExtended: boolean;
  /** Termos conferidos no PNCP; null = sem sinal de alteração (termos não consultados). */
  amendments: ContractAmendment[] | null;
  publishedAt: string | null;
  pncpUpdatedAt: string | null;
  lastCollectedAt: string | null;
  pncpLink: string;
  /** Edital de origem na base, para abrir no app. */
  originNoticeId: number | null;
  /** Sem o edital na base: a página da compra no PNCP. */
  originPncpLink: string | null;
  isFavorite: boolean;
}

/** Resposta de favoritar e de tirar dos favoritos um contrato. */
export interface ContractFavoriteView {
  contractId: number;
  isFavorite: boolean;
}

/** Critérios de uma busca salva de contratos no corpo da API. Valores em decimal com ponto ("150000.50"). */
export interface ContractSearchCriteriaBody {
  terms: string[];
  termsMode: SearchTermsMode;
  excludedTerms: string[];
  states: string[];
  cityIbgeCodes: string[];
  agencyCnpjs: string[];
  categories: number[];
  supplierCnpjs: string[];
  minValue: string | null;
  maxValue: string | null;
  includeWithoutValue: boolean;
}

export interface ContractSearchBody extends ContractSearchCriteriaBody {
  name: string;
  notify?: boolean;
  active?: boolean;
}

export interface ContractSavedSearch {
  id: number;
  name: string;
  terms: string[];
  termsMode: SearchTermsMode;
  excludedTerms: string[];
  states: string[];
  cityIbgeCodes: string[];
  agencyCnpjs: string[];
  categories: number[];
  supplierCnpjs: string[];
  minValue: number | null;
  maxValue: number | null;
  includeWithoutValue: boolean;
  notify: boolean;
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  /** Contratos vigentes que batem com a busca agora. */
  activeCount: number;
}

export interface ContractSearchPreview {
  count: number;
  items: ContractListItem[];
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
  /** Categorias dos contratos do PNCP. */
  contractCategories: Array<{ id: number; name: string }>;
  /** Tipos de contrato do PNCP, com nomes curtos (contrato, empenho, carta contrato...). */
  contractTypes: Array<{ id: number; name: string }>;
  municipalities: Municipality[];
}

/** Situação da conta no módulo (cortesia ou assinatura); só "vencida" e "desligada" ficam sem acesso. */
export type SubscriptionSituation = 'cortesia' | 'teste' | 'paga' | 'recorrente' | 'vencida' | 'desligada';

/** Conta na tela "Contas habilitadas" (GET /api/tenders/admin/accounts, só admin da plataforma). */
export interface AdminTenderAccount {
  accountId: number;
  accountName: string;
  accountType: 'pessoal' | 'empresa';
  ownerName: string;
  ownerEmail: string;
  /** Usa o módulo sem cobrança e sem limite de usuários. */
  courtesy: boolean;
  /** Situação no módulo; null para conta que nunca teve o módulo. */
  situation: SubscriptionSituation | null;
  trialUntil: string | null;
  paidUntil: string | null;
  /** Última mudança no módulo; null se a conta nunca teve o módulo. */
  changedAt: string | null;
}

/** Resposta de PUT /api/tenders/admin/accounts/:accountId. */
export interface CourtesyChange {
  accountId: number;
  accountName: string;
  courtesy: boolean;
  changedAt: string | null;
}

/** Assinatura da conta no módulo (GET /access e GET /billing). */
export interface TenderSubscription {
  accessType: 'cortesia' | 'assinatura';
  situation: SubscriptionSituation;
  trialUntil: string | null;
  paidUntil: string | null;
  recurring: boolean;
  /** O titular e quem tem acesso ao módulo. */
  usersCount: number;
  monthlyAmountCents: number;
}

/** Preço do módulo, vindo do servidor. */
export interface TenderPrice {
  baseCents: number;
  /** A base cobre o titular e mais (includedUsers - 1). */
  includedUsers: number;
  extraUserCents: number;
}

/** Resposta de GET /api/tenders/billing. */
export interface TenderBilling {
  account: { id: number; name: string; type: 'pessoal' | 'empresa' };
  subscription: TenderSubscription;
  price: TenderPrice;
}

/** Resposta de GET /api/tenders/activation: contas do titular que ainda não têm o módulo. */
export interface TenderActivation {
  canActivate: boolean;
  accounts: Array<{ id: number; name: string; type: 'pessoal' | 'empresa' }>;
}

/** `data` do 402 (assinatura vencida). */
export interface ExpiredSubscriptionInfo {
  role: 'TITULAR' | 'COLABORADOR';
  account: { id: number; name: string; type: 'pessoal' | 'empresa' };
}

export const TENDER_NOTIFICATION_TYPES = [
  'NOVO_EDITAL',
  'EDITAL_ALTERADO',
  'PRAZO_3D',
  'PRAZO_1D',
  'CONTRATO_VENCE_90D',
  'CONTRATO_VENCE_30D',
  'CONTRATO_ALTERADO',
] as const;
export type TenderNotificationType = (typeof TENDER_NOTIFICATION_TYPES)[number];

export interface TenderNotification {
  id: number;
  type: TenderNotificationType;
  title: string;
  message: string | null;
  /** Caminho a partir do início do app do módulo (ex.: /editais/123 ou /contratos/45). */
  link: string;
  noticeId: number | null;
  /** Aviso de contrato (vencimento ou vencimento alterado). */
  contractId: number | null;
  savedSearchId: number | null;
  readAt: string | null;
  createdAt: string | null;
}

export interface NotificationFilters {
  unreadOnly: boolean;
  type: TenderNotificationType | null;
  page: number;
  perPage: number;
}

export const COLLECTION_RUN_TYPES = [
  'VARREDURA',
  'INCREMENTAL',
  'LEMBRETES',
  'LIMPEZA',
  'MANUAL',
  'CONTRATOS_DIARIA',
  'CONTRATOS_CARGA',
  'CONTRATOS_LIMPEZA',
  'CONTRATOS_AVISOS',
] as const;
export type CollectionRunType = (typeof COLLECTION_RUN_TYPES)[number];
/** Execuções com horário na agenda (a manual não tem). */
export type ScheduledRunType = Exclude<CollectionRunType, 'MANUAL'>;

export const COLLECTION_RUN_STATUSES = ['EXECUTANDO', 'SUCESSO', 'PARCIAL', 'FALHA'] as const;
export type CollectionRunStatus = (typeof COLLECTION_RUN_STATUSES)[number];

/** Detalhes da execução: até 50 erros guardados e o total dos que ficaram de fora. */
export interface CollectionRunDetails {
  errors?: Array<Record<string, unknown>>;
  omittedErrors?: number;
  [key: string]: unknown;
}

export interface CollectionRun {
  id: number;
  type: CollectionRunType;
  status: CollectionRunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  requestCount: number;
  recordsRead: number;
  newCount: number;
  updatedCount: number;
  notificationCount: number;
  errorCount: number;
  details: CollectionRunDetails;
}

/** Por que o bloco da carga de contratos parou: tempo, espaço no banco ou PNCP fora do ar. */
export type BackfillStopReason = 'time' | 'space' | 'pncp';

/** A última execução da carga de contratos. */
export interface BackfillRun {
  from: string;
  to: string;
  totalDays: number;
  /** Dias da faixa ainda sem carga, ao fim da execução. */
  pendingDays: number;
  stoppedBy: BackfillStopReason | null;
  finished: boolean;
}

export interface ContractsCollection {
  contracts: number;
  /** Com vencimento de hoje em diante. */
  activeContracts: number;
  backfill: {
    completedDays: number;
    /** Dia de publicação mais antigo já carregado (AAAA-MM-DD). */
    oldestDay: string | null;
    /** null: a carga ainda não rodou, ou a última execução não terminou. */
    lastRun: BackfillRun | null;
  };
}

export interface CollectionStatus {
  /** A execução mais recente de cada tipo. */
  latestRuns: CollectionRun[];
  /** Próxima execução prevista pela agenda, em ISO com o fuso de Brasília; null sem agenda (a incremental). */
  nextRuns: Record<ScheduledRunType, string | null>;
  totals: { notices: number; openNotices: number };
  contracts: ContractsCollection;
}

export interface TeamMember {
  userId: number;
  name: string;
  email: string;
  hasAccess: boolean;
  grantedAt: string | null;
}

/** Resposta de POST /team e PUT /team/:userId: o usuário e o aviso, se o valor do recorrente não mudou. */
export interface TeamChange {
  member: TeamMember;
  warning: string | null;
}

/** Corpo de POST /api/tenders/team (mesmos campos do cadastro de membro do FINGERENCE). */
export interface NewTeamUser {
  nome: string;
  sobrenome?: string;
  email: string;
  senha: string;
  documento?: string;
}
