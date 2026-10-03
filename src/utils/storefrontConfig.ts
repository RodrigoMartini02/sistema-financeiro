// Campos da tela "Configurar vitrine": o link e o WhatsApp como a pessoa
// digita. A validação final é do servidor (backend/src/services/storefrontInput.ts).

export const STOREFRONT_SLUG_MAX_LENGTH = 60;
export const STOREFRONT_SLUG_MIN_LENGTH = 3;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Link enquanto digita: sem acento, minúsculo e hífen no lugar de espaço e símbolo. */
export function sanitizeSlugInput(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/g, '')
    .slice(0, STOREFRONT_SLUG_MAX_LENGTH);
}

/** Link pronto para salvar: o que sobra no fim do digitado (hífen solto) sai. */
export function finalizeSlug(value: string): string {
  return sanitizeSlugInput(value).replace(/-+$/g, '');
}

export function isValidStorefrontSlug(value: string): boolean {
  return value.length >= STOREFRONT_SLUG_MIN_LENGTH
    && value.length <= STOREFRONT_SLUG_MAX_LENGTH
    && SLUG_PATTERN.test(value);
}

/**
 * WhatsApp gravado (só dígitos, com 55) ou digitado, no formato
 * `(11) 98765-4321`, montado aos poucos enquanto a pessoa digita.
 */
export function formatWhatsappInput(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 11);

  if (digits.length === 0) {
    return '';
  }
  if (digits.length <= 2) {
    return `(${digits}`;
  }
  const areaCode = digits.slice(0, 2);
  const number = digits.slice(2);
  if (number.length <= 4) {
    return `(${areaCode}) ${number}`;
  }
  const splitAt = number.length === 9 ? 5 : 4;
  return `(${areaCode}) ${number.slice(0, splitAt)}-${number.slice(splitAt)}`;
}
