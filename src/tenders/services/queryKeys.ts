// Query keys do app de Licitações, centralizadas como as do app (src/services/queryKeys.ts).
export const tendersQueryKeys = {
  access: ['tenders', 'access'] as const,
  unreadNotificationsCount: ['tenders', 'notifications', 'count'] as const,
  planStatus: ['tenders', 'plan-status'] as const,
};
