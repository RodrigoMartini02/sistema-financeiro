import { apiRequest } from './apiClient';
import type { ProductDiscountType } from '../utils/productPricing';

/** Imagem do produto, na ordem de exibição (a primeira é a capa). O id é o do anexo e o endereço dela na vitrine. */
export interface ProdutoImagem {
  id: string;
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

