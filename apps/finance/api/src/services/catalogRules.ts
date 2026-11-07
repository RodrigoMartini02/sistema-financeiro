// Regras do catálogo compartilhadas pelas categorias de despesa (`categorias`) e pelas
// classificações de receita (`classificacoes_receita`). As tabelas são separadas, mas
// quem recebe lançamento, o nome da subcategoria "Outros de ..." e a criação de um
// grupo novo seguem a mesma regra. Funções puras, sem banco.

export type CatalogAccountType = 'pessoal' | 'empresa';

/** O que a regra precisa saber de uma linha do catálogo. */
export interface CatalogEntry {
  id: number;
  parentId: number | null;
  active: boolean;
  /** Linha que o sistema usa nos lançamentos que gera (ex.: encargos da fatura). */
  isSystem: boolean;
}

/** "Outros de Moradia": a subcategoria que recebe o que não cabe nas demais do grupo. */
export function othersSubcategoryName(rootName: string): string {
  return `Outros de ${rootName}`;
}

/** Nome comparado como o índice único do banco: sem diferenciar maiúsculas e sem espaços nas pontas. */
export function normalizeCatalogName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Se a linha pode receber lançamento.
 * - Linha de sistema: nunca; só o sistema a usa, nas linhas que gera.
 * - Conta PF: só subcategoria. A raiz é o nome do grupo, com ou sem subcategorias.
 * - Conta PJ (ou conta desconhecida): a raiz com subcategoria ativa é só o nome do
 *   grupo; sem subcategoria ativa, ela mesma recebe.
 * Linha inativa continua valendo: desativar não pode travar a edição de lançamento antigo.
 */
export function canReceiveEntries(
  entry: CatalogEntry,
  hasActiveSubcategory: boolean,
  accountType: CatalogAccountType | null,
): boolean {
  if (entry.isSystem) {
    return false;
  }
  if (accountType === 'pessoal') {
    return entry.parentId !== null;
  }
  return !hasActiveSubcategory;
}

/** Ids das linhas que recebem lançamento, numa lista inteira do catálogo. */
export function selectableEntryIds(entries: CatalogEntry[], accountType: CatalogAccountType | null): Set<number> {
  const parentsWithActiveSubcategory = new Set<number>();
  for (const entry of entries) {
    if (entry.parentId !== null && entry.active) {
      parentsWithActiveSubcategory.add(entry.parentId);
    }
  }
  return new Set(
    entries
      .filter((entry) => canReceiveEntries(entry, parentsWithActiveSubcategory.has(entry.id), accountType))
      .map((entry) => entry.id),
  );
}

/** Em conta PF o grupo novo nasce com ao menos uma subcategoria: o grupo sozinho não recebe lançamento. */
export function requiresInitialSubcategory(accountType: CatalogAccountType | null): boolean {
  return accountType === 'pessoal';
}

/**
 * Nomes das subcategorias iniciais do corpo do pedido: texto aparado, sem repetição
 * (sem diferenciar maiúsculas) e até `maxLength` caracteres. Ausente vale lista
 * vazia; nulo quando o formato ou algum nome é inválido.
 */
export function readInitialSubcategoryNames(value: unknown, maxLength: number): string[] | null {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const name = typeof item === 'string' ? item.trim() : '';
    if (!name || name.length > maxLength) {
      return null;
    }
    const key = normalizeCatalogName(name);
    if (seen.has(key)) {
      return null;
    }
    seen.add(key);
    names.push(name);
  }
  return names;
}
