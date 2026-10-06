// Query keys do app de Licitações, centralizadas como as do app (src/services/queryKeys.ts).
// Itens e arquivos do PNCP ficam fora de `notices`: mudar o acompanhamento
// invalida a busca, o edital e o histórico, mas não busca o PNCP de novo.
export const tendersQueryKeys = {
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
};
