import { apiRequest, getActiveProfileId } from './apiClient';

export interface UsuarioMe {
  id: number; nome: string; email: string;
  documento?: string; tipo: string; status: string;
  pais?: string | null; estado?: string | null; cidade?: string | null;
  foto?: string | null; data_cadastro?: string;
  plano_status?: string; plano_tipo?: string;
}

export interface UsuarioMePutBody {
  nome: string; email?: string;
  pais?: string; estado?: string; cidade?: string;
  senha_atual?: string; nova_senha?: string;
}

export interface UsuarioListItem {
  id: number; nome: string; email: string;
  documento?: string; tipo: string; status: string;
  pais?: string | null; estado?: string | null; cidade?: string | null;
  data_cadastro?: string; data_atualizacao?: string;
}

export interface UsuarioListResponse {
  data: UsuarioListItem[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface UsuarioCreateBody {
  nome: string; email: string; documento: string;
  senha: string; tipo?: string; status?: string;
  pais?: string; estado?: string; cidade?: string;
}

export async function fetchMe(): Promise<UsuarioMe> {
  return apiRequest<UsuarioMe>('/usuarios/me');
}

export async function updateMe(body: UsuarioMePutBody): Promise<UsuarioMe> {
  return apiRequest<UsuarioMe>('/usuarios/me', {
    method: 'PUT', body: JSON.stringify(body),
  });
}

export async function fetchUsuarios(params: {
  page?: number; limit?: number; search?: string; tipo?: string; status?: string;
}): Promise<UsuarioListResponse> {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.search) q.set('search', params.search);
  if (params.tipo && params.tipo !== 'todos') q.set('tipo', params.tipo);
  if (params.status && params.status !== 'todos') q.set('status', params.status);
  return apiRequest<UsuarioListResponse>(`/usuarios?${q}`);
}

export async function createUsuario(body: UsuarioCreateBody): Promise<UsuarioListItem> {
  const r = await apiRequest<{ success: boolean; data: UsuarioListItem }>('/usuarios', {
    method: 'POST', body: JSON.stringify(body),
  });
  return r.data;
}

export async function updateUsuario(id: number, body: Partial<UsuarioListItem & { senha?: string }>): Promise<UsuarioListItem> {
  const r = await apiRequest<{ success: boolean; data: UsuarioListItem }>(`/usuarios/${id}`, {
    method: 'PUT', body: JSON.stringify(body),
  });
  return r.data;
}

export async function updateUsuarioStatus(id: number, status: string): Promise<void> {
  await apiRequest<{ success: boolean }>(`/usuarios/${id}/status`, {
    method: 'PUT', body: JSON.stringify({ status }),
  });
}

export async function deleteUsuario(id: number): Promise<void> {
  await apiRequest<{ success: boolean }>(`/usuarios/${id}`, { method: 'DELETE' });
}
