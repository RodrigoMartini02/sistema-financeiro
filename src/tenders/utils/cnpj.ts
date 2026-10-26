import { isValidCnpj, onlyDigits } from '../../utils/brazilDocuments';

// CNPJ no app de Licitações (plano .plans/licitacoes-pagina-cnpj.md): os filtros das buscas aceitam o que a fonte traz
// (14 dígitos, mesmo com dígito verificador errado: isCnpjFormat), e só o CNPJ com os dígitos verificadores certos
// (isValidCnpj, de utils/brazilDocuments) é reconhecido numa caixa de busca, ganha link e abre a página do CNPJ.

const CNPJ_FORMAT = /^\d{14}$/;
/** O que um CNPJ digitado tem: dígitos e a pontuação "." "/" "-", com espaços. */
const CNPJ_TEXT = /^[\d.\-/\s]+$/;

/** Texto com exatamente 14 dígitos, sem conferir os dígitos verificadores. */
export function isCnpjFormat(digits: string): boolean {
  return CNPJ_FORMAT.test(digits);
}

/**
 * O CNPJ (14 dígitos) que o texto de uma caixa de busca é, ou null. Só vale texto com dígitos e a pontuação do CNPJ
 * ("22.493.902/0001-40" ou "22493902000140") e com os dígitos verificadores certos; qualquer outra coisa é busca de texto.
 */
export function cnpjFromSearchText(text: string): string | null {
  const trimmed = text.trim();
  if (!CNPJ_TEXT.test(trimmed)) return null;
  const digits = onlyDigits(trimmed);
  return isValidCnpj(digits) ? digits : null;
}

/** O texto do atalho que abre a página do CNPJ (etiquetas dos filtros de órgão e fornecedor). */
export const CNPJ_PAGE_LINK_LABEL = 'Abrir a página do CNPJ';

/** A página de um CNPJ (relativa à base do app): `/cnpj/<14 dígitos>`. */
export function cnpjPagePath(cnpj: string): string {
  return `/cnpj/${cnpj}`;
}

/** O link para a página do CNPJ, só quando ele é válido (dígitos verificadores certos); senão null, e o nome fica sem link. */
export function cnpjLinkPath(cnpj: string | null | undefined): string | null {
  return cnpj && isCnpjFormat(cnpj) && isValidCnpj(cnpj) ? cnpjPagePath(cnpj) : null;
}
