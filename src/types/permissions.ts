// Permissões que o titular liga para cada membro/colaborador. Mesma lista de
// PERMISSION_FLAGS em backend/src/routes/accountMembers.ts.
export const PERMISSION_FLAGS = [
  'accessExpenses', 'accessIncomes', 'accessBudget', 'accessCalendar',
  'accessDashboard', 'accessReports', 'accessNotifications', 'accessAssistant',
  'accessAccounts', 'accessCategories', 'accessCards', 'accessServices', 'accessRepresentatives', 'accessPartners',
  'accessClients', 'accessContracts', 'accessProductCatalog',
  'accessFamilyEntries', 'editFamilyEntries', 'accessFamilyCards',
  'accessGeneralOverview',
] as const;

export type PermissionFlag = (typeof PERMISSION_FLAGS)[number];
