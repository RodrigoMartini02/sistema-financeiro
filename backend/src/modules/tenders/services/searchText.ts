import { RequestInputError } from '../../../utils/requestInput';

// Texto da busca da tela (`q`) convertido nos termos da busca salva, para as
// duas usarem a mesma regra (escopo, seção 7.3):
// - "frase exata" vira um termo;
// - -palavra ou -"frase" vira exclusão;
// - as outras palavras viram termos soltos.

export const MAX_SEARCH_TEXT_LENGTH = 500;
export const MAX_TERMS = 30;
export const MIN_TERM_LENGTH = 2;
export const MAX_TERM_LENGTH = 80;

export interface ParsedSearchText {
  terms: string[];
  excludedTerms: string[];
}

const TOKEN_PATTERN = /(-?)"([^"]*)"|(\S+)/g;

function addUnique(target: string[], term: string): void {
  const key = term.toLocaleLowerCase('pt-BR');
  if (!target.some((existing) => existing.toLocaleLowerCase('pt-BR') === key)) {
    target.push(term);
  }
}

/**
 * Termos com menos de 2 caracteres são ignorados (ex.: "a", "-"). Termo com
 * mais de 80 caracteres ou mais de 30 termos (ou exclusões) recusam a busca.
 */
export function parseSearchText(text: string): ParsedSearchText {
  const terms: string[] = [];
  const excludedTerms: string[] = [];

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const [, quotedMinus, quoted, bare] = match;
    let excluded: boolean;
    let rawTerm: string;
    if (quoted !== undefined) {
      excluded = quotedMinus === '-';
      rawTerm = quoted;
    } else {
      const word = (bare ?? '').replaceAll('"', '');
      excluded = word.startsWith('-');
      rawTerm = excluded ? word.slice(1) : word;
    }

    const term = rawTerm.trim().replace(/\s+/g, ' ');
    if (term.length < MIN_TERM_LENGTH) {
      continue;
    }
    if (term.length > MAX_TERM_LENGTH) {
      throw new RequestInputError(`Cada termo da busca pode ter até ${MAX_TERM_LENGTH} caracteres.`);
    }
    addUnique(excluded ? excludedTerms : terms, term);
  }

  if (terms.length > MAX_TERMS || excludedTerms.length > MAX_TERMS) {
    throw new RequestInputError(`A busca aceita até ${MAX_TERMS} termos e ${MAX_TERMS} exclusões.`);
  }
  return { terms, excludedTerms };
}
