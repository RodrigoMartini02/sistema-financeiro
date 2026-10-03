import { apiRequest, getApiUrl } from './apiClient';
import type { ProdutoImagem } from './catalogoService';

export type OrderStatus =
  | 'aguardando_pagamento' | 'pago' | 'enviado' | 'pronto_retirada' | 'entregue' | 'recusado' | 'expirado' | 'estornado';
export type OrderPaymentMethod = 'pix' | 'cartao';
export type DeliveryType = 'retirada' | 'entrega';

/** Configuração da vitrine de uma conta PJ (tela "Configurar vitrine"). */
export interface StorefrontConfig {
  id: string;
  contaId: number;
  /** Link amigável: fin-gerence.com.br/loja/<link>. */
  link: string;
  /** Nulo usa `nomePadrao` (nome fantasia ou nome da conta). */
  nome: string | null;
  nomePadrao: string;
  descricao: string | null;
  /** Só dígitos, com o 55. */
  whatsapp: string | null;
  /** Data URL; nulo usa `logoPadrao` (o logo do acesso, na PJ do login). */
  logo: string | null;
  logoPadrao: string | null;
  retiradaAtiva: boolean;
  retiradaEndereco: string | null;
  retiradaHorario: string | null;
  entregaAtiva: boolean;
  entregaTaxa: number | null;
  entregaDescricao: string | null;
  politicaTroca: string | null;
}

export interface StorefrontConfigInput {
  conta_id: number;
  nome: string;
  descricao: string;
  whatsapp: string;
  link: string;
  logo: string | null;
  retirada_ativa: boolean;
  retirada_endereco: string;
  retirada_horario: string;
  entrega_ativa: boolean;
  entrega_taxa: number | null;
  entrega_descricao: string;
  politica_troca: string;
}

export interface MercadoPagoStatus {
  /** O FINGERENCE já tem o aplicativo Mercado Pago configurado. */
  disponivel: boolean;
  conectado: boolean;
  mpUserId: string | null;
  liveMode: boolean | null;
  conectadoEm: string | null;
}

export interface PublicStore {
  id: string;
  link: string | null;
  nome: string;
  descricao: string | null;
  whatsapp: string | null;
  logo: string | null;
}

/** Compra pela vitrine: Mercado Pago conectado e alguma entrega ativa. */
export interface PublicCheckout {
  online: boolean;
  publicKey: string | null;
  retirada: { endereco: string; horario: string | null } | null;
  entrega: { taxa: number; descricao: string | null } | null;
  politicaTroca: string | null;
}

export interface PublicProduct {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  valor: number;
  valorFinal: number;
  descontoPercentual: number | null;
  esgotado: boolean;
  imagens: ProdutoImagem[];
}

export interface PublicStorefront {
  loja: PublicStore;
  checkout: PublicCheckout;
  produtos: PublicProduct[];
}

/** Corpo do pedido feito na vitrine: só produto e quantidade — o preço vem do servidor. */
export interface PublicOrderInput {
  itens: Array<{ produto_id: string; quantidade: number }>;
  cliente: { nome: string; email: string; telefone: string; cpf: string };
  entrega: {
    tipo: DeliveryType;
    endereco?: { cep: string; rua: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string };
  };
  pagamento: { forma: OrderPaymentMethod; card_token?: string; payment_method_id?: string };
  observacao: string;
}

export interface PublicOrder {
  id: string;
  numero: number;
  situacao: OrderStatus;
  formaPagamento: OrderPaymentMethod;
  entregaTipo: DeliveryType;
  entregaResumo: string | null;
  retiradaHorario: string | null;
  subtotal: number;
  desconto: number;
  taxaEntrega: number;
  total: number;
  itens: Array<{ nome: string; quantidade: number; precoUnitario: number; subtotal: number }>;
  pix: { qrCode: string; qrCodeBase64: string; expiraEm: string | null } | null;
  criadoEm: string;
  pagoEm: string | null;
}

export interface StoreOrderSummary {
  id: string;
  numero: number;
  situacao: OrderStatus;
  formaPagamento: OrderPaymentMethod;
  entregaTipo: DeliveryType;
  clienteNome: string;
  total: number;
  criadoEm: string;
  pagoEm: string | null;
  /** Pendente com a separação vencida: o pagamento não foi concluído a tempo. */
  reservaVencida: boolean;
  semEstoque: boolean;
}

export interface StoreOrderItem {
  id: string;
  produtoId: string | null;
  nome: string;
  quantidade: number;
  precoOriginal: number;
  precoUnitario: number;
  subtotal: number;
  semEstoque: boolean;
  receitaId: number | null;
}

export interface StoreOrderDetail extends StoreOrderSummary {
  cliente: { nome: string; email: string; telefone: string; cpf: string };
  endereco: {
    cep: string | null; rua: string | null; numero: string | null; complemento: string | null;
    bairro: string | null; cidade: string | null; uf: string | null;
  } | null;
  observacao: string | null;
  subtotal: number;
  desconto: number;
  taxaEntrega: number;
  mpPaymentId: string | null;
  receitaEntregaId: number | null;
  itens: StoreOrderItem[];
}

export async function fetchStorefrontConfig(accountId: number): Promise<StorefrontConfig> {
  return apiRequest<StorefrontConfig>(`/catalogo/storefront?conta_id=${accountId}`);
}

export async function saveStorefrontConfig(input: StorefrontConfigInput): Promise<StorefrontConfig> {
  return apiRequest<StorefrontConfig>('/catalogo/storefront', { method: 'PUT', body: JSON.stringify(input) });
}

export async function fetchMercadoPagoStatus(accountId: number): Promise<MercadoPagoStatus> {
  return apiRequest<MercadoPagoStatus>(`/catalogo/mercado-pago/status?conta_id=${accountId}`);
}

/** Endereço da autorização no Mercado Pago; a tela redireciona para ele. */
export async function fetchMercadoPagoConnectUrl(accountId: number): Promise<string> {
  const data = await apiRequest<{ url: string }>(`/catalogo/mercado-pago/connect?conta_id=${accountId}`);
  return data.url;
}

export async function disconnectMercadoPago(accountId: number): Promise<void> {
  await apiRequest<void>(`/catalogo/mercado-pago?conta_id=${accountId}`, { method: 'DELETE' });
}

export async function fetchStoreOrders(accountId: number, status: OrderStatus | null): Promise<StoreOrderSummary[]> {
  const query = status ? `&situacao=${status}` : '';
  return apiRequest<StoreOrderSummary[]>(`/catalogo/pedidos?conta_id=${accountId}${query}`);
}

export async function fetchStoreOrder(orderId: string): Promise<StoreOrderDetail> {
  return apiRequest<StoreOrderDetail>(`/catalogo/pedidos/${orderId}`);
}

export async function changeStoreOrderStatus(orderId: string, status: OrderStatus): Promise<StoreOrderDetail> {
  return apiRequest<StoreOrderDetail>(`/catalogo/pedidos/${orderId}/situacao`, {
    method: 'PUT',
    body: JSON.stringify({ situacao: status }),
  });
}

/** Vitrine pública pelo link ou pelo código antigo; sem login. */
export async function fetchPublicStorefront(storefront: string): Promise<PublicStorefront> {
  return apiRequest<PublicStorefront>(`/catalogo/public/${encodeURIComponent(storefront)}`, {}, { anonymous: true });
}

export async function createPublicOrder(storefront: string, input: PublicOrderInput): Promise<PublicOrder> {
  return apiRequest<PublicOrder>(`/catalogo/public/${encodeURIComponent(storefront)}/pedidos`, {
    method: 'POST',
    body: JSON.stringify(input),
  }, { anonymous: true });
}

export async function fetchPublicOrder(storefront: string, orderId: string): Promise<PublicOrder> {
  return apiRequest<PublicOrder>(
    `/catalogo/public/${encodeURIComponent(storefront)}/pedidos/${encodeURIComponent(orderId)}`,
    {},
    { anonymous: true },
  );
}

export function getPublicProductImageUrl(storefront: string, fileName: string): string {
  return `${getApiUrl()}/catalogo/public/${encodeURIComponent(storefront)}/imagens/${encodeURIComponent(fileName)}`;
}

/** Endereço público da vitrine, no domínio de onde o app foi aberto. */
export function storefrontPublicUrl(link: string): string {
  return `${window.location.origin}/loja/${link}`;
}

/** Como a loja aparece nos endereços da vitrine: o link amigável ou, sem ele, o código. */
export function storefrontSlug(store: Pick<PublicStore, 'id' | 'link'>): string {
  return store.link ?? store.id;
}

/** Caminho base das páginas da vitrine (sacola, checkout, pedido). */
export function storefrontBasePath(store: Pick<PublicStore, 'id' | 'link'>): string {
  return `/loja/${storefrontSlug(store)}`;
}

/** Textos das situações do pedido, iguais na vitrine e na tela da loja. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pago',
  enviado: 'Enviado',
  pronto_retirada: 'Pronto para retirada',
  entregue: 'Entregue',
  recusado: 'Pagamento recusado',
  expirado: 'Pagamento expirado',
  estornado: 'Estornado',
};
