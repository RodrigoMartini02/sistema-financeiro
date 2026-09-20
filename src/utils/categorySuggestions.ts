import type { Categoria } from '../types/config';
import type { Expense } from '../types/finance';

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

function tokenize(value: string): string[] {
  return normalizeCategoryText(value).split(/[^a-z0-9]+/).filter(Boolean);
}

function activeCategories(categories: Categoria[]): Categoria[] {
  return categories.filter((category) => category.ativo);
}

/** Categoria com subcategoria ativa: nunca é selecionável em lançamento/filtro — só as subs. */
export function hasActiveSubcategory(category: Categoria, categories: Categoria[]): boolean {
  return categories.some((c) => c.parent_id === category.id && c.ativo);
}

export interface SelectableCategoryGroup {
  /** null quando a categoria não tem pai nem filhos ativos — item solto, sem agrupamento. */
  parent: Categoria | null;
  items: Categoria[];
}

/**
 * Categorias ativas prontas para seleção em despesas/filtros, agrupadas por pai.
 * Uma raiz com subcategoria ativa vira só o cabeçalho do grupo (não aparece em
 * `items`, que é onde a lista de seleção de fato itera) — só suas subs entram.
 */
export function groupSelectableCategories(categories: Categoria[]): SelectableCategoryGroup[] {
  const active = activeCategories(categories);
  const roots = active.filter((c) => !c.parent_id);
  const groups: SelectableCategoryGroup[] = [];

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

function findCategoryByName(categories: Categoria[], name: string): Categoria | undefined {
  const normalizedName = normalizeCategoryText(name);
  return activeCategories(categories).find((category) => normalizeCategoryText(category.nome) === normalizedName);
}

function findCategoryByNames(categories: Categoria[], names: string[]): Categoria | undefined {
  for (const name of names) {
    const category = findCategoryByName(categories, name);
    if (category) return category;
  }
  return undefined;
}

export function getRecentCategoryIds(expenses: Expense[], categories: Categoria[], limit = 5): number[] {
  const byName = new Map(activeCategories(categories).map((category) => [normalizeCategoryText(category.nome), category.id]));
  const usage = new Map<number, { count: number; lastIndex: number }>();

  expenses.forEach((expense, index) => {
    const categoryName = expense.categoria ? normalizeCategoryText(expense.categoria) : '';
    if (!categoryName || categoryName === 'sem categoria') return;
    const categoryId = byName.get(categoryName);
    if (!categoryId) return;

    const current = usage.get(categoryId) ?? { count: 0, lastIndex: -1 };
    usage.set(categoryId, { count: current.count + 1, lastIndex: Math.max(current.lastIndex, index) });
  });

  return Array.from(usage.entries())
    .sort((a, b) => b[1].count - a[1].count || b[1].lastIndex - a[1].lastIndex)
    .slice(0, limit)
    .map(([id]) => id);
}

export function suggestCategoryForDescription(
  description: string,
  categories: Categoria[],
  expenses: Expense[],
  currentExpenseId?: number,
): CategorySuggestionResult | null {
  const normalizedDescription = normalizeCategoryText(description);
  if (normalizedDescription.length < 3) return null;

  const reusableExpense = expenses.find((expense) => {
    if (expense.id === currentExpenseId) return false;
    const categoryName = normalizeCategoryText(expense.categoria ?? '');
    if (!categoryName || categoryName === 'sem categoria') return false;
    const previousDescription = normalizeCategoryText(expense.descricao ?? '');
    return previousDescription.length >= 3 && (
      normalizedDescription.includes(previousDescription) || previousDescription.includes(normalizedDescription)
    );
  });

  if (reusableExpense) {
    const category = findCategoryByName(categories, reusableExpense.categoria);
    if (category) return { id: category.id, name: category.nome, reason: 'historico' };
  }

  const descriptionTokens = tokenize(description);
  const keywordRule = KEYWORD_RULES.find((rule) => rule.keywords.some((keyword) => {
    const keywordTokens = tokenize(keyword);
    return keywordTokens.length > 1
      ? normalizedDescription.includes(normalizeCategoryText(keyword))
      : descriptionTokens.includes(keywordTokens[0]);
  }));
  if (keywordRule) {
    const category = findCategoryByNames(categories, keywordRule.categories);
    if (category) return { id: category.id, name: category.nome, reason: 'palavra-chave' };
  }

  return null;
}
