/** Texto para comparar: sem acento, minúsculo e sem espaços nas pontas. */
export function normalizeSearchText(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}
