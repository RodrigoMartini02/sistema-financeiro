import { apiRequest } from './apiClient';

export interface MemberPermissionsData {
  id: number;
  userId: number;
  viewOthersEntries: boolean;
  editOthersEntries: boolean;
  deleteOthersEntries: boolean;
  viewAggregateSummary: boolean;
  manageCategories: boolean;
  manageCards: boolean;
  accessOtherMembersData: boolean;
  updatedAt?: string;
}

export type PermissionFlag =
  | 'viewOthersEntries'
  | 'editOthersEntries'
  | 'deleteOthersEntries'
  | 'viewAggregateSummary'
  | 'manageCategories'
  | 'manageCards'
  | 'accessOtherMembersData';

export const PERMISSION_LABELS: Record<PermissionFlag, { label: string; description: string }> = {
  viewOthersEntries: { label: 'Ver lançamentos de outros', description: 'Ver despesas e receitas lançadas por outros membros da conta' },
  editOthersEntries: { label: 'Editar lançamentos de outros', description: 'Editar despesas e receitas de outros membros' },
  deleteOthersEntries: { label: 'Excluir lançamentos de outros', description: 'Excluir despesas e receitas de outros membros' },
  viewAggregateSummary: { label: 'Ver visão agregada da família', description: 'Ver o total somado de despesas e receitas de todos os membros' },
  manageCategories: { label: 'Gerenciar categorias de outros', description: 'Criar, editar e excluir categorias de outros membros' },
  manageCards: { label: 'Gerenciar cartões de outros', description: 'Editar e excluir cartões de outros membros' },
  accessOtherMembersData: { label: 'Acessar dados de outros membros', description: 'Acessar categorias, cartões e dados gerais de outros membros' },
};

export async function fetchMemberPermissions(usuarioId: number): Promise<MemberPermissionsData> {
  return apiRequest<MemberPermissionsData>(`/account-members/${usuarioId}/permissions`);
}

export async function updateMemberPermissions(usuarioId: number, changes: Partial<Record<PermissionFlag, boolean>>): Promise<MemberPermissionsData> {
  return apiRequest<MemberPermissionsData>(`/account-members/${usuarioId}/permissions`, {
    method: 'PUT',
    body: JSON.stringify(changes),
  });
}
