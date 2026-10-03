import { apiRequest } from './apiClient';

/** Listas de nomes de uma conta PJ; o valor é o caminho da rota. */
export type AccountNameCatalogKind = 'sectors' | 'job-titles';

export interface AccountNameItem {
  id: number;
  nome: string;
  ativo: boolean;
  data_criacao?: string;
}

/**
 * Todos os itens da conta, ativos e desativados: a tela filtra pela chave
 * "Mostrar desativados", e o modal do colaborador mostra os ativos mais o que
 * ele já tem, mesmo desativado.
 */
export async function fetchAccountNames(kind: AccountNameCatalogKind, accountId: number): Promise<AccountNameItem[]> {
  return apiRequest<AccountNameItem[]>(`/${kind}?conta_id=${accountId}&incluir_inativos=true`);
}

export async function saveAccountName(
  kind: AccountNameCatalogKind,
  values: { nome: string; conta_id: number },
  id?: number,
): Promise<AccountNameItem> {
  return apiRequest<AccountNameItem>(id ? `/${kind}/${id}` : `/${kind}`, {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(values),
  });
}

export async function deactivateAccountName(kind: AccountNameCatalogKind, id: number): Promise<void> {
  await apiRequest<void>(`/${kind}/${id}`, { method: 'DELETE' });
}
