import type { Categoria, OpcaoCatalogo } from '../types/config';

export interface CategorySuggestionResult {
  id: number;
  name: string;
  reason: 'historico' | 'palavra-chave';
}

const KEYWORD_RULES: Array<{ keywords: string[]; categories: string[] }> = [
  { keywords: ['mercado', 'supermercado', 'ifood', 'restaurante', 'padaria', 'lanche', 'almoco', 'jantar'], categories: ['alimentacao'] },
  { keywords: ['aluguel', 'condominio', 'energia', 'luz', 'agua', 'internet', 'iptu'], categories: ['moradia', 'operacional'] },
  { keywords: ['uber', '99', 'combustivel', 'gasolina', 'estacionamento', 'onibus', 'transporte'], categories: ['transporte'] },
  { keywords: ['farmacia', 'medico', 'consulta', 'exame', 'plano de saude'], categories: ['saude'] },
  { keywords: ['curso', 'faculdade', 'escola', 'livro', 'treinamento'], categories: ['educacao'] },
  { keywords: ['netflix', 'spotify', 'prime', 'assinatura', 'mensalidade'], categories: ['assinaturas', 'lazer'] },
  { keywords: ['imposto', 'taxa', 'das', 'simples', 'fgts', 'inss'], categories: ['impostos e taxas'] },
  { keywords: ['fornecedor', 'compra', 'material', 'estoque'], categories: ['fornecedores', 'operacional'] },
  { keywords: ['software', 'sistema', 'dominio', 'hospedagem', 'servidor', 'aws', 'google', 'meta'], categories: ['tecnologia'] },
  { keywords: ['contabilidade', 'contador'], categories: ['contabilidade'] },
  { keywords: ['tarifa', 'banco', 'juros', 'cartao'], categories: ['financas', 'bancario'] },
  { keywords: ['marketing', 'anuncio', 'trafego', 'campanha'], categories: ['marketing'] },
  { keywords: ['pro labore', 'retirada', 'retiradas'], categories: ['pro-labore/retiradas'] },
];

export function normalizeCategoryText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Ordem das listas de categorias: A→Z (pt-BR), com "Outros" sempre por último no seu nível. */
export function compararNomesCatalogo(a: string, b: string): number {
  const aOutros = normalizeCategoryText(a) === 'outros';
  const bOutros = normalizeCategoryText(b) === 'outros';
  if (aOutros !== bOutros) return aOutros ? 1 : -1;
  return a.localeCompare(b, 'pt-BR');
}

function tokenize(value: string): string[] {
  return normalizeCategoryText(value).split(/[^a-z0-9]+/).filter(Boolean);
}

/** Categoria com subcategoria ativa: nunca é selecionável em lançamento/filtro — só as subs. */
export function hasActiveSubcategory(category: Categoria, categories: Categoria[]): boolean {
  return categories.some((c) => c.parent_id === category.id && c.ativo);
}

export interface SelectableCategoryGroup<T extends OpcaoCatalogo = Categoria> {
  /** null quando a categoria não tem pai nem filhos ativos — item solto, sem agrupamento. */
  parent: T | null;
  items: T[];
}

/**
 * Categorias ativas prontas para seleção em despesas/filtros, agrupadas por pai.
 * Uma raiz com subcategoria ativa vira só o cabeçalho do grupo (não aparece em
 * `items`, que é onde a lista de seleção de fato itera) — só suas subs entram.
 */
export function groupSelectableCategories<T extends OpcaoCatalogo>(categories: T[]): SelectableCategoryGroup<T>[] {
  const active = categories.filter((category) => category.ativo);
  const roots = active.filter((c) => !c.parent_id);
  const groups: SelectableCategoryGroup<T>[] = [];

  for (const root of roots) {
    const children = active.filter((c) => c.parent_id === root.id);
    if (children.length > 0) {
      groups.push({ parent: root, items: children });
    } else {
      groups.push({ parent: null, items: [root] });
    }
  }

  return groups;
}

/** Uma despesa do histórico: a descrição e a categoria que ela recebeu. */
export interface CategoryHistoryEntry {
  description: string;
  categoryId: number | null | undefined;
}

/** O que se escolhe num lançamento: a categoria solta ou as subs de quem tem sub. */
function selectableCategories<T extends OpcaoCatalogo>(categories: T[]): T[] {
  return groupSelectableCategories(categories).flatMap((group) => group.items);
}

function findCategoryByNames(categories: Categoria[], names: string[]): Categoria | undefined {
  for (const name of names) {
    const normalizedName = normalizeCategoryText(name);
    const category = categories.find((item) => normalizeCategoryText(item.nome) === normalizedName);
    if (category) return category;
  }
  return undefined;
}

/** As categorias mais usadas no histórico, da mais frequente para a menos. */
export function getRecentCategoryIds(history: CategoryHistoryEntry[], categories: OpcaoCatalogo[], limit = 5): number[] {
  const selectableIds = new Set(selectableCategories(categories).map((category) => category.id));
  const usage = new Map<number, number>();
  history.forEach(({ categoryId }) => {
    if (categoryId != null && selectableIds.has(categoryId)) usage.set(categoryId, (usage.get(categoryId) ?? 0) + 1);
  });
  return Array.from(usage.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

/**
 * Categoria sugerida para a descrição, a partir de 3 letras: primeiro a de uma
 * despesa parecida do histórico; depois a que tem o próprio nome na descrição
 * ("Mercado Extra" → Mercado); por fim, as palavras-chave.
 */
export function suggestCategoryForDescription(
  description: string,
  categories: Categoria[],
  history: CategoryHistoryEntry[],
): CategorySuggestionResult | null {
  const normalizedDescription = normalizeCategoryText(description);
  if (normalizedDescription.length < 3) return null;
  const selectable = selectableCategories(categories);
  const byId = new Map(selectable.map((category) => [category.id, category]));

  const similar = history.find(({ description: previous, categoryId }) => {
    if (categoryId == null || !byId.has(categoryId)) return false;
    const normalizedPrevious = normalizeCategoryText(previous);
    return normalizedPrevious.length >= 3 && (
      normalizedDescription.includes(normalizedPrevious) || normalizedPrevious.includes(normalizedDescription)
    );
  });
  const fromHistory = similar?.categoryId != null ? byId.get(similar.categoryId) : undefined;
  if (fromHistory) return { id: fromHistory.id, name: fromHistory.nome, reason: 'historico' };

  const descriptionTokens = tokenize(description);
  const byOwnName = selectable.find((category) => {
    const nameTokens = tokenize(category.nome);
    return nameTokens.length > 0 && nameTokens.every((token) => descriptionTokens.includes(token));
  });
  if (byOwnName) return { id: byOwnName.id, name: byOwnName.nome, reason: 'palavra-chave' };

  const keywordRule = KEYWORD_RULES.find((rule) => rule.keywords.some((keyword) => {
    const keywordTokens = tokenize(keyword);
    return keywordTokens.length > 1
      ? normalizedDescription.includes(normalizeCategoryText(keyword))
      : descriptionTokens.includes(keywordTokens[0]);
  }));
  if (keywordRule) {
    const category = findCategoryByNames(selectable, keywordRule.categories);
    if (category) return { id: category.id, name: category.nome, reason: 'palavra-chave' };
  }

  return null;
}
