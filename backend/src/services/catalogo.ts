const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidProdutoValor(valor: unknown): boolean {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0;
}

export function isValidProdutoImagemMimeType(mimeType: string): boolean {
  return ALLOWED_IMAGE_MIME_TYPES.includes(mimeType);
}

export function isValidProdutoImagemSize(sizeBytes: number): boolean {
  return sizeBytes > 0 && sizeBytes <= MAX_IMAGE_SIZE_BYTES;
}

export function isValidCatalogoContaId(contaId: string): boolean {
  return UUID_PATTERN.test(contaId);
}
