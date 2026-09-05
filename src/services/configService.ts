import { apiRequest, getActiveAccountId } from './apiClient';
import type { Categoria, CategoriaFormValues, Cartao, CartaoFormValues, Conta } from '../types/config';

export async function fetchCategorias(): Promise<Categoria[]> {
  const accountId = getActiveAccountId();
  const q = accountId ? `?conta_id=${accountId}` : '';
  return apiRequest<Categoria[]>(`/categorias${q}`);
}

export async function saveCategoria(values: CategoriaFormValues, id?: number): Promise<Categoria> {
  const body: Record<string, unknown> = { nome: values.nome.trim() };
  if (values.parent_id !== undefined) body.parent_id = values.parent_id;
  if (!id) body.conta_id = getActiveAccountId();
  return apiRequest<Categoria>(id ? `/categorias/${id}` : '/categorias', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(body),
  });
}

export async function toggleCategoria(id: number): Promise<void> {
  return apiRequest<void>(`/categorias/${id}/toggle-active`, { method: 'PATCH' });
}

export async function fetchCartoes(): Promise<Cartao[]> {
  const accountId = getActiveAccountId();
  const q = accountId ? `?conta_id=${accountId}` : '';
  return apiRequest<Cartao[]>(`/cartoes${q}`);
}

export async function saveCartao(values: CartaoFormValues, id?: number): Promise<Cartao> {
  const accountId = getActiveAccountId();
  const body = { ...values, conta_id: accountId };
  return apiRequest<Cartao>(id ? `/cartoes/${id}` : '/cartoes', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Exclusão definitiva. A UI usa soft delete (`saveCartao` com `ativo: false`),
 * que funciona mesmo com despesas vinculadas — este DELETE é recusado pelo
 * backend nesse caso. Mantido porque a rota existe e cobre o descarte real.
 */
export async function deleteCartao(id: number): Promise<void> {
  return apiRequest<void>(`/cartoes/${id}`, { method: 'DELETE' });
}

export async function fetchContas(incluirInativos = false): Promise<Conta[]> {
  const q = incluirInativos ? '?incluir_inativos=true' : '';
  const r = await apiRequest<{ success: boolean; data: Conta[] }>(`/contas${q}`);
  return Array.isArray(r) ? r : (r as any).data ?? [];
}

export async function saveConta(values: {
  tipo: 'pessoal' | 'empresa'; nome: string; documento?: string;
  razao_social?: string; nome_fantasia?: string; atividade?: string;
  enquadramento?: string;
  telefone?: string; data_nascimento?: string; email?: string;
}, id?: number): Promise<Conta> {
  const r = await apiRequest<{ success: boolean; data: Conta }>(
    id ? `/contas/${id}` : '/contas',
    { method: id ? 'PUT' : 'POST', body: JSON.stringify(values) }
  );
  return (r as any).data ?? r;
}

export async function deleteConta(id: number): Promise<void> {
  await apiRequest<void>(`/contas/${id}`, { method: 'DELETE' });
}

export async function reactivateConta(id: number): Promise<Conta> {
  const r = await apiRequest<{ success: boolean; data: Conta }>(`/contas/${id}/reactivate`, { method: 'PUT' });
  return (r as any).data ?? r;
}

export async function updateFotoConta(id: number, foto: string | null): Promise<void> {
  await apiRequest<{ success: boolean; message: string }>(`/contas/${id}/photo`, {
    method: 'PUT', body: JSON.stringify({ foto }),
  });
}
