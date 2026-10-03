// Leitura e validação da configuração da vitrine pública e do endereço dela
// (`/loja/<link>` ou o código antigo `/catalogo/<uuid>`). Sem acesso ao banco:
// pode ser testado isoladamente. Os campos do pedido seguem o padrão em
// português do módulo do catálogo.
import { RequestInputError, readOptionalText, readRecord, readRequiredId } from '../utils/requestInput';
import { isUuid } from './catalogo';

export const STOREFRONT_SLUG_MIN_LENGTH = 3;
export const STOREFRONT_SLUG_MAX_LENGTH = 60;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Base do link quando o nome não deixa letras nem números aproveitáveis. */
const FALLBACK_SLUG = 'loja';

const MAX_STORE_NAME_LENGTH = 100;
const MAX_STORE_DESCRIPTION_LENGTH = 280;
/** Logo recortado na tela (256 px): bem abaixo disso; o teto barra imagem crua colada no pedido. */
const MAX_LOGO_LENGTH = 300 * 1024;
const LOGO_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** DDI do Brasil: o número é guardado só com dígitos e com ele na frente. */
const BRAZIL_CALLING_CODE = '55';

export interface StorefrontInput {
  accountId: number;
  /** Nulo usa o nome fantasia ou o nome da conta. */
  name: string | null;
  description: string | null;
  whatsapp: string | null;
  slug: string;
  logo: string | null;
}

export type StorefrontParam = { kind: 'id'; id: string } | { kind: 'slug'; slug: string };

export function isValidStorefrontSlug(value: string): boolean {
  return value.length >= STOREFRONT_SLUG_MIN_LENGTH
    && value.length <= STOREFRONT_SLUG_MAX_LENGTH
    && SLUG_PATTERN.test(value);
}

/** Link a partir do nome da loja: sem acento, minúsculo, hífen no lugar de espaço e símbolo. */
export function slugify(text: string): string {
  const base = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, STOREFRONT_SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');

  if (base.length >= STOREFRONT_SLUG_MIN_LENGTH) {
    return base;
  }
  return base ? `${FALLBACK_SLUG}-${base}` : FALLBACK_SLUG;
}

/** `minha-loja` → `minha-loja-2`, cortando a base para caber no limite. */
export function withSlugSuffix(slug: string, attempt: number): string {
  if (attempt <= 1) {
    return slug;
  }
  const suffix = `-${attempt}`;
  const base = slug.slice(0, STOREFRONT_SLUG_MAX_LENGTH - suffix.length).replace(/-+$/g, '');
  return `${base}${suffix}`;
}

/**
 * WhatsApp como o app grava: só dígitos e com o 55. Aceita o número digitado
 * com ou sem máscara e com ou sem o 55; vazio vira null.
 */
export function normalizeWhatsapp(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new RequestInputError('WhatsApp inválido');
  }
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits === '') {
    return null;
  }
  // Com "+", o número já traz o código do país: "+1 415..." não é um celular de DDD 14.
  const hasCountryCode = trimmed.startsWith('+');
  const withCallingCode = !hasCountryCode && (digits.length === 10 || digits.length === 11)
    ? `${BRAZIL_CALLING_CODE}${digits}`
    : digits;
  const localNumber = withCallingCode.slice(BRAZIL_CALLING_CODE.length);
  const isBrazilianNumber = withCallingCode.startsWith(BRAZIL_CALLING_CODE)
    && (localNumber.length === 10 || localNumber.length === 11)
    && !localNumber.startsWith('0');
  if (!isBrazilianNumber) {
    throw new RequestInputError('WhatsApp inválido: informe o DDD e o número');
  }
  return withCallingCode;
}

export function isValidLogoDataUrl(value: string): boolean {
  return value.length <= MAX_LOGO_LENGTH && LOGO_DATA_URL.test(value);
}

/** Código antigo (UUID) ou link amigável; qualquer outra coisa não é vitrine. */
export function parseStorefrontParam(value: string): StorefrontParam | null {
  if (isUuid(value)) {
    return { kind: 'id', id: value.toLowerCase() };
  }
  const slug = value.toLowerCase();
  return isValidStorefrontSlug(slug) ? { kind: 'slug', slug } : null;
}

/** Corpo do PUT /catalogo/storefront. */
export function readStorefrontInput(body: unknown): StorefrontInput {
  const record = readRecord(body, 'Pedido inválido');

  const rawSlug = record['link'];
  const slug = typeof rawSlug === 'string' ? rawSlug.trim().toLowerCase() : '';
  if (!isValidStorefrontSlug(slug)) {
    throw new RequestInputError(
      `Link inválido: use de ${STOREFRONT_SLUG_MIN_LENGTH} a ${STOREFRONT_SLUG_MAX_LENGTH} letras minúsculas, números e hífens`,
    );
  }

  const rawLogo = record['logo'];
  if (rawLogo !== undefined && rawLogo !== null && rawLogo !== ''
    && (typeof rawLogo !== 'string' || !isValidLogoDataUrl(rawLogo))) {
    throw new RequestInputError('Logo inválido: envie uma imagem JPG, PNG ou WebP');
  }

  return {
    accountId: readRequiredId(record['conta_id'], 'Informe a conta da vitrine'),
    name: readOptionalText(record['nome'], 'Nome da loja', MAX_STORE_NAME_LENGTH),
    description: readOptionalText(record['descricao'], 'Descrição', MAX_STORE_DESCRIPTION_LENGTH),
    whatsapp: normalizeWhatsapp(record['whatsapp']),
    slug,
    logo: typeof rawLogo === 'string' && rawLogo !== '' ? rawLogo : null,
  };
}
