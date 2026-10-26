// Query keys do app de Licitações, centralizadas como as do app (src/services/queryKeys.ts).
// Itens e arquivos do PNCP ficam fora de `notices`: mudar o acompanhamento
// invalida a busca, o edital e o histórico, mas não busca o PNCP de novo.
//
// As listas com rolagem infinita (editais, contratos e notificações) guardam os dados em outro formato
// (`pages`), por isso têm chaves próprias, com `infinite` no terceiro lugar, dentro dos mesmos grupos.
const INFINITE_LIST = 'infinite';

/** A chave é de uma lista com rolagem infinita? */
export function isInfiniteListKey(queryKey: readonly unknown[]): boolean {
  return queryKey[2] === INFINITE_LIST;
}

export const tendersQueryKeys = {
  // Prefixo de todas as chaves do módulo: trocar a conta em uso invalida tudo.
  all: ['tenders'] as const,
  access: ['tenders', 'access'] as const,
  unreadNotificationsCount: ['tenders', 'notifications', 'count'] as const,
  notices: ['tenders', 'notices'] as const,
  noticeSearch: (apiQuery: string) => ['tenders', 'notices', 'search', apiQuery] as const,
  noticeInfiniteLists: ['tenders', 'notices', INFINITE_LIST] as const,
  noticeInfiniteList: (apiQuery: string) => ['tenders', 'notices', INFINITE_LIST, apiQuery] as const,
  notice: (id: number) => ['tenders', 'notices', 'detail', id] as const,
  noticeHistory: (id: number) => ['tenders', 'notices', 'history', id] as const,
  noticeItems: (id: number) => ['tenders', 'notice-items', id] as const,
  noticeFiles: (id: number) => ['tenders', 'notice-files', id] as const,
  savedSearches: ['tenders', 'saved-searches'] as const,
  savedSearchPreview: (body: string) => ['tenders', 'saved-search-preview', body] as const,
  /** Prefixo dos contratos: favoritar ou mudar uma busca salva invalida a busca e o detalhe. */
  contracts: ['tenders', 'contracts'] as const,
  contractSearch: (apiQuery: string) => ['tenders', 'contracts', 'search', apiQuery] as const,
  contractInfiniteLists: ['tenders', 'contracts', INFINITE_LIST] as const,
  contractInfiniteList: (apiQuery: string) => ['tenders', 'contracts', INFINITE_LIST, apiQuery] as const,
  contract: (key: string) => ['tenders', 'contracts', 'detail', key] as const,
  contractSavedSearches: ['tenders', 'contract-searches'] as const,
  contractSearchPreview: (body: string) => ['tenders', 'contract-search-preview', body] as const,
  /** Página do CNPJ: o resumo e as licitações vencidas, em lista infinita (as listas curtas usam as chaves de contratos e editais). */
  cnpj: (cnpj: string) => ['tenders', 'cnpj', cnpj] as const,
  cnpjWinners: (cnpj: string) => ['tenders', 'cnpj', cnpj, 'winners'] as const,
  dashboard: ['tenders', 'dashboard'] as const,
  domains: ['tenders', 'domains'] as const,
  /** Prefixo das notificações: listas e contador do sino. */
  notifications: ['tenders', 'notifications'] as const,
  /** A lista curta do painel do sino. */
  notificationList: (apiQuery: string) => ['tenders', 'notifications', 'list', apiQuery] as const,
  /** A página Notificações, em lista infinita. */
  notificationInfiniteList: (apiQuery: string) => ['tenders', 'notifications', INFINITE_LIST, apiQuery] as const,
  team: ['tenders', 'team'] as const,
  /** Prefixo das assinaturas: mudar usuários ou pagar invalida todas. */
  billingAll: ['tenders', 'billing'] as const,
  /** Assinatura de uma conta (fora da trava: vale também para a conta vencida). */
  billing: (accountId: number) => ['tenders', 'billing', accountId] as const,
  activation: ['tenders', 'activation'] as const,
  collectionStatus: ['tenders', 'collection', 'status'] as const,
  collectionRuns: ['tenders', 'collection', 'runs'] as const,
  // Tela "Contas habilitadas" (admin da plataforma).
  adminAccounts: ['tenders', 'admin', 'accounts'] as const,
};
