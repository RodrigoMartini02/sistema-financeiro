import { apiRequest, getApiUrl } from './apiClient';

export interface ProdutoImagem {
  id: string;
  produtoId: string;
  nomeArquivo: string;
  ordem: number;
}

export interface Produto {
  id: string;
  usuarioId: number;
  nome: string;
  descricao: string | null;
  valor: string;
  ativo: boolean;
  imagens: ProdutoImagem[];
  createdAt: string;
  updatedAt: string;
}

export interface CatalogoConta {
  id: string;
  usuarioId: number;
}

export async function fetchProdutos(): Promise<Produto[]> {
  return apiRequest<Produto[]>('/catalogo/produtos');
}

export async function saveProduto(
  data: { nome: string; descricao: string; valor: number; ativo?: boolean },
  id?: string,
): Promise<Produto> {
  if (id) {
    return apiRequest<Produto>(`/catalogo/produtos/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }
  return apiRequest<Produto>('/catalogo/produtos', { method: 'POST', body: JSON.stringify(data) });
}

export async function deleteProduto(id: string): Promise<void> {
  return apiRequest<void>(`/catalogo/produtos/${id}`, { method: 'DELETE' });
}

export async function uploadProdutoImagem(produtoId: string, file: File): Promise<ProdutoImagem> {
  const token = sessionStorage.getItem('token') ?? localStorage.getItem('token');
  const form = new FormData();
  form.append('imagem', file);

  const response = await fetch(`${getApiUrl()}/catalogo/produtos/${produtoId}/imagens`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const payload = await response.json() as { success: boolean; message?: string; data?: ProdutoImagem };
  if (!response.ok || !payload.success) {
    throw new Error(payload.message ?? 'Falha ao enviar imagem');
  }
  return payload.data!;
}

export async function deleteProdutoImagem(imagemId: string): Promise<void> {
  return apiRequest<void>(`/catalogo/produtos/imagens/${imagemId}`, { method: 'DELETE' });
}

export async function fetchProdutoImagemBlob(nomeArquivo: string): Promise<Blob> {
  const token = sessionStorage.getItem('token') ?? localStorage.getItem('token');
  const response = await fetch(`${getApiUrl()}/catalogo/produtos/imagens/${nomeArquivo}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error('Falha ao carregar imagem');
  }
  return response.blob();
}

export async function fetchCatalogoConta(): Promise<CatalogoConta> {
  return apiRequest<CatalogoConta>('/catalogo/conta');
}

export interface ProdutoPublico {
  id: string;
  nome: string;
  descricao: string | null;
  valor: string;
  imagens: ProdutoImagem[];
}

export async function fetchProdutosPublicos(contaId: string): Promise<ProdutoPublico[]> {
  return apiRequest<ProdutoPublico[]>(`/catalogo/public/${contaId}/produtos`);
}

export function getProdutoImagemPublicaUrl(contaId: string, nomeArquivo: string): string {
  return `${getApiUrl()}/catalogo/public/${contaId}/imagens/${nomeArquivo}`;
}
