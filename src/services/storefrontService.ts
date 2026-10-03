import { apiRequest, getApiUrl } from './apiClient';
import type { ProdutoImagem } from './catalogoService';

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
}

export interface StorefrontConfigInput {
  conta_id: number;
  nome: string;
  descricao: string;
  whatsapp: string;
  link: string;
  logo: string | null;
}

export interface PublicStore {
  id: string;
  link: string | null;
  nome: string;
  descricao: string | null;
  whatsapp: string | null;
  logo: string | null;
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
  produtos: PublicProduct[];
}

export async function fetchStorefrontConfig(accountId: number): Promise<StorefrontConfig> {
  return apiRequest<StorefrontConfig>(`/catalogo/storefront?conta_id=${accountId}`);
}

export async function saveStorefrontConfig(input: StorefrontConfigInput): Promise<StorefrontConfig> {
  return apiRequest<StorefrontConfig>('/catalogo/storefront', { method: 'PUT', body: JSON.stringify(input) });
}

/** Vitrine pública pelo link ou pelo código antigo; sem login. */
export async function fetchPublicStorefront(storefront: string): Promise<PublicStorefront> {
  return apiRequest<PublicStorefront>(`/catalogo/public/${encodeURIComponent(storefront)}`, {}, { anonymous: true });
}

export function getPublicProductImageUrl(storefront: string, fileName: string): string {
  return `${getApiUrl()}/catalogo/public/${encodeURIComponent(storefront)}/imagens/${encodeURIComponent(fileName)}`;
}

/** Endereço público da vitrine, no domínio de onde o app foi aberto. */
export function storefrontPublicUrl(link: string): string {
  return `${window.location.origin}/loja/${link}`;
}
