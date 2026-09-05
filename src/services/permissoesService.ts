import { apiRequest } from './apiClient';

export type PermissionFlag =
  | 'accessExpenses' | 'accessIncomes' | 'accessMonthClosing' | 'accessReserves' | 'accessBudget' | 'accessCalendar'
  | 'accessDashboard' | 'accessReports' | 'accessNotifications' | 'accessAssistant'
  | 'accessAccounts' | 'accessCategories' | 'accessCards' | 'accessServices' | 'accessRepresentatives' | 'accessPartners' | 'accessMembers' | 'accessSubscription'
  | 'accessClients' | 'accessContracts' | 'accessProductCatalog';

export type MemberPermissionsData = Record<PermissionFlag, boolean> & {
  id?: number;
  userId?: number;
  updatedAt?: string;
};

interface PermissionGroup {
  id: string;
  label: string;
  items: { flag: PermissionFlag; label: string }[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'financeiro',
    label: 'Financeiro',
    items: [
      { flag: 'accessExpenses', label: 'Despesas' },
      { flag: 'accessIncomes', label: 'Receitas' },
      { flag: 'accessMonthClosing', label: 'Fechamento de mês' },
      { flag: 'accessReserves', label: 'Reservas' },
      { flag: 'accessBudget', label: 'Planejamento/Orçamento' },
      { flag: 'accessCalendar', label: 'Calendário/Compromissos' },
    ],
  },
  {
    id: 'relatorios-painel',
    label: 'Relatórios e Painel',
    items: [
      { flag: 'accessDashboard', label: 'Painel/Dashboard' },
      { flag: 'accessReports', label: 'Relatórios' },
      { flag: 'accessNotifications', label: 'Notificações' },
      { flag: 'accessAssistant', label: 'Assistente Financeiro' },
    ],
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    items: [
      { flag: 'accessAccounts', label: 'Contas' },
      { flag: 'accessCategories', label: 'Categorias' },
      { flag: 'accessCards', label: 'Cartões' },
      { flag: 'accessServices', label: 'Catálogo de Serviços' },
      { flag: 'accessRepresentatives', label: 'Representantes' },
      { flag: 'accessPartners', label: 'Sócios' },
      { flag: 'accessMembers', label: 'Membros/Colaboradores' },
      { flag: 'accessSubscription', label: 'Assinatura/Planos' },
    ],
  },
  {
    id: 'comercial',
    label: 'Comercial',
    items: [
      { flag: 'accessClients', label: 'Clientes' },
      { flag: 'accessContracts', label: 'Contratos' },
      { flag: 'accessProductCatalog', label: 'Catálogo de Produtos' },
    ],
  },
];

export async function fetchMemberPermissions(usuarioId: number): Promise<MemberPermissionsData> {
  return apiRequest<MemberPermissionsData>(`/account-members/${usuarioId}/permissions`);
}

export async function fetchOwnPermissions(): Promise<MemberPermissionsData> {
  return apiRequest<MemberPermissionsData>('/account-members/me/permissions');
}

export async function updateMemberPermissions(usuarioId: number, changes: Partial<Record<PermissionFlag, boolean>>): Promise<MemberPermissionsData> {
  return apiRequest<MemberPermissionsData>(`/account-members/${usuarioId}/permissions`, {
    method: 'PUT',
    body: JSON.stringify(changes),
  });
}
