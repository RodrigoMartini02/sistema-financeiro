import { apiRequest, getApiUrl } from './apiClient';
import type { ProductDiscountType } from '../utils/productPricing';

export interface ProdutoImagem {
  id: string;
  produtoId: string;
  nomeArquivo: string;
  ordem: number;
}

export interface Produto {
  id: string;
  usuarioId: number;
  /** Conta PJ dona do produto. */
  contaId: number | null;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  valor: string;
  /** Desconto em R$ ('valor') ou em % ('percentual'); os dois nulos = sem desconto. */
  descontoTipo: ProductDiscountType | null;
  descontoValor: string | null;
  /** Preço com desconto, calculado pelo servidor. */
  valorFinal: number;
  /** Selo "-X%"; nulo sem desconto (ou abaixo de 1%). */
  descontoPercentual: number | null;
  /** Desligado: a venda não mexe no estoque e a vitrine nunca mostra esgotado. */
  controlaEstoque: boolean;
  quantidadeEstoque: string;
  /** Nulo = produto sem alerta de estoque baixo. */
  estoqueMinimo: string | null;
  ativo: boolean;
  imagens: ProdutoImagem[];
  createdAt: string;
  updatedAt: string;
}

export interface MovimentacaoEstoque {
  id: string;
  produtoId: string;
  usuarioId: number;
  tipo: 'entrada' | 'saida';
  quantidade: string;
  motivo: string | null;
  receitaId: number | null;
  createdAt: string;
}

/** Produtos da conta PJ (ativos e desativados). */
export async function fetchProdutos(accountId: number): Promise<Produto[]> {
  return apiRequest<Produto[]>(`/catalogo/produtos?conta_id=${accountId}`);
}

export interface ProdutoFormData {
  nome: string;
  descricao: string;
  valor: number;
  categoria: string;
  desconto_tipo: ProductDiscountType | null;
  desconto_valor: number | null;
  controla_estoque: boolean;
  /** Só ao ligar o controle num produto sem movimentação. */
  quantidade_inicial?: number | null;
  estoque_minimo: number | null;
  ativo?: boolean;
  /** Só na criação: a conta do produto não muda depois. */
  conta_id?: number;
}

export async function saveProduto(data: ProdutoFormData, id?: string): Promise<Produto> {
  if (id) {
    return apiRequest<Produto>(`/catalogo/produtos/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }
  return apiRequest<Produto>('/catalogo/produtos', { method: 'POST', body: JSON.stringify(data) });
}

export async function registrarMovimentacaoEstoque(
  produtoId: string,
  data: { tipo: 'entrada' | 'saida'; quantidade: number; motivo?: string },
): Promise<{ saldoAtual: number }> {
  return apiRequest(`/catalogo/produtos/${produtoId}/estoque`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchMovimentacoesEstoque(produtoId: string): Promise<MovimentacaoEstoque[]> {
  return apiRequest<MovimentacaoEstoque[]>(`/catalogo/produtos/${produtoId}/estoque/movimentacoes`);
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
