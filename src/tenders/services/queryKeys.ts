// Query keys do app de Licitações, centralizadas como as do app (src/services/queryKeys.ts).
// Itens e arquivos do PNCP ficam fora de `notices`: mudar o acompanhamento
// invalida a busca, o edital e o histórico, mas não busca o PNCP de novo.
export const tendersQueryKeys = {
  // Prefixo de todas as chaves do módulo: trocar a conta em uso invalida tudo.
  all: ['tenders'] as const,
  access: ['tenders', 'access'] as const,
  unreadNotificationsCount: ['tenders', 'notifications', 'count'] as const,
  planStatus: ['tenders', 'plan-status'] as const,
  notices: ['tenders', 'notices'] as const,
  noticeSearch: (apiQuery: string) => ['tenders', 'notices', 'search', apiQuery] as const,
  notice: (id: number) => ['tenders', 'notices', 'detail', id] as const,
  noticeHistory: (id: number) => ['tenders', 'notices', 'history', id] as const,
  noticeItems: (id: number) => ['tenders', 'notice-items', id] as const,
  noticeFiles: (id: number) => ['tenders', 'notice-files', id] as const,
  savedSearches: ['tenders', 'saved-searches'] as const,
  savedSearchPreview: (body: string) => ['tenders', 'saved-search-preview', body] as const,
  dashboard: ['tenders', 'dashboard'] as const,
  domains: ['tenders', 'domains'] as const,
  /** Prefixo das notificações: listas e contador do sino. */
  notifications: ['tenders', 'notifications'] as const,
  notificationList: (apiQuery: string) => ['tenders', 'notifications', 'list', apiQuery] as const,
  team: ['tenders', 'team'] as const,
  /** Prefixo das assinaturas: mudar usuários ou pagar invalida todas. */
  billingAll: ['tenders', 'billing'] as const,
  /** Assinatura de uma conta (fora da trava: vale também para a conta vencida). */
  billing: (accountId: number) => ['tenders', 'billing', accountId] as const,
  activation: ['tenders', 'activation'] as const,
  collectionStatus: ['tenders', 'collection', 'status'] as const,
  collectionRuns: (page: number, perPage: number) => ['tenders', 'collection', 'runs', page, perPage] as const,
  // Tela "Contas habilitadas" (admin da plataforma).
  adminAccounts: ['tenders', 'admin', 'accounts'] as const,
};
