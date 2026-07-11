import { apiRequest, getActiveProfileId } from './apiClient';
import type { Categoria, CategoriaFormValues, Cartao, CartaoFormValues, Perfil } from '../types/config';

export async function fetchCategorias(): Promise<Categoria[]> {
  const profileId = getActiveProfileId();
  const q = profileId ? `?perfil_id=${profileId}` : '';
  return apiRequest<Categoria[]>(`/categorias${q}`);
}

export async function saveCategoria(values: CategoriaFormValues, id?: number): Promise<Categoria> {
  const body: Record<string, unknown> = { nome: values.nome, cor: values.cor };
  if (values.parent_id !== undefined) body.parent_id = values.parent_id;
  if (values.tipo_despesa !== undefined) body.tipo_despesa = values.tipo_despesa;
  if (!id) body.perfil_id = getActiveProfileId();
  return apiRequest<Categoria>(id ? `/categorias/${id}` : '/categorias', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteCategoria(id: number): Promise<void> {
  return apiRequest<void>(`/categorias/${id}`, { method: 'DELETE' });
}

export async function toggleCategoria(id: number): Promise<void> {
  return apiRequest<void>(`/categorias/${id}/toggle-ativo`, { method: 'PATCH' });
}

export async function fetchCartoes(): Promise<Cartao[]> {
  const profileId = getActiveProfileId();
  const q = profileId ? `?perfil_id=${profileId}` : '';
  return apiRequest<Cartao[]>(`/cartoes${q}`);
}

export async function saveCartao(values: CartaoFormValues, id?: number): Promise<Cartao> {
  const profileId = getActiveProfileId();
  const body = { ...values, perfil_id: profileId };
  return apiRequest<Cartao>(id ? `/cartoes/${id}` : '/cartoes', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteCartao(id: number): Promise<void> {
  return apiRequest<void>(`/cartoes/${id}`, { method: 'DELETE' });
}

export async function fetchPerfis(): Promise<Perfil[]> {
  const r = await apiRequest<{ success: boolean; data: Perfil[] }>('/perfis');
  return Array.isArray(r) ? r : (r as any).data ?? [];
}

export async function savePerfil(values: {
  tipo: 'pessoal' | 'empresa'; nome: string; documento?: string;
  razao_social?: string; nome_fantasia?: string; atividade?: string;
  enquadramento?: string;
  telefone?: string; data_nascimento?: string; email?: string;
}, id?: number): Promise<Perfil> {
  const r = await apiRequest<{ success: boolean; data: Perfil }>(
    id ? `/perfis/${id}` : '/perfis',
    { method: id ? 'PUT' : 'POST', body: JSON.stringify(values) }
  );
  return (r as any).data ?? r;
}

export async function deletePerfil(id: number): Promise<void> {
  await apiRequest<void>(`/perfis/${id}`, { method: 'DELETE' });
}

export async function setCategoriaFavorito(
  id: number, forma_favorita: string | null, cartao_favorito_id: number | null
): Promise<void> {
  await apiRequest<void>(`/categorias/${id}/favorito`, {
    method: 'PUT',
    body: JSON.stringify({ forma_favorita, cartao_favorito_id }),
  });
}
