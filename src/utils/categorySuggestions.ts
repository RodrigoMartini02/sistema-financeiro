import type { Categoria, CategoriaFormValues, OpcaoCatalogo } from '../types/config';
import { groupHeaderState } from './filterGroupSelection';

export interface CategorySuggestionResult {
  id: number;
  name: string;
  reason: 'historico' | 'palavra-chave';
}

// Nomes das subcategorias do catálogo padrão da conta pessoal e das categorias da
// conta empresa, sem acento nem maiúsculas. A primeira regra que casar vence.
const KEYWORD_RULES: Array<{ keywords: string[]; categories: string[] }> = [
  { keywords: ['ifood', 'rappi', 'delivery'], categories: ['delivery'] },
  { keywords: ['restaurante', 'pizza', 'almoco', 'jantar'], categories: ['restaurantes e bares'] },
  { keywords: ['padaria', 'lanche'], categories: ['padaria e lanches'] },
  { keywords: ['mercado', 'supermercado'], categories: ['mercado'] },
  { keywords: ['aluguel'], categories: ['aluguel'] },
  { keywords: ['condominio'], categories: ['condominio'] },
  { keywords: ['energia', 'luz'], categories: ['energia'] },
  { keywords: ['agua'], categories: ['agua e gas'] },
  { keywords: ['internet'], categories: ['internet'] },
  { keywords: ['iptu'], categories: ['iptu e taxas'] },
  { keywords: ['uber', '99'], categories: ['aplicativo e taxi'] },
  { keywords: ['combustivel', 'gasolina'], categories: ['combustivel'] },
  { keywords: ['estacionamento'], categories: ['pedagio e estacionamento'] },
  { keywords: ['onibus', 'transporte'], categories: ['transporte publico'] },
  { keywords: ['farmacia'], categories: ['farmacia'] },
  { keywords: ['medico', 'consulta'], categories: ['consultas'] },
  { keywords: ['exame'], categories: ['exames'] },
  { keywords: ['plano de saude'], categories: ['plano de saude'] },
  { keywords: ['curso', 'treinamento'], categories: ['cursos'] },
  { keywords: ['faculdade', 'escola', 'mensalidade'], categories: ['mensalidade'] },
  { keywords: ['livro'], categories: ['livros e material'] },
  { keywords: ['netflix', 'prime'], categories: ['streaming de video'] },
  { keywords: ['spotify'], categories: ['musica'] },
  { keywords: ['assinatura'], categories: ['software e apps'] },
  { keywords: ['imposto', 'taxa', 'das', 'simples', 'fgts', 'inss'], categories: ['impostos', 'impostos e taxas'] },
  { keywords: ['fornecedor', 'compra', 'material', 'estoque'], categories: ['fornecedores', 'operacional'] },
  { keywords: ['software', 'sistema', 'dominio', 'hospedagem', 'servidor', 'aws', 'google', 'meta'], categories: ['ferramentas e software', 'tecnologia'] },
  { keywords: ['contabilidade', 'contador'], categories: ['contabilidade'] },
  { keywords: ['tarifa', 'banco'], categories: ['tarifas bancarias', 'bancario'] },
  { keywords: ['marketing', 'anuncio', 'trafego', 'campanha'], categories: ['despesas profissionais', 'marketing'] },
  { keywords: ['pro labore', 'retirada', 'retiradas'], categories: ['pro-labore/retiradas'] },
];

export function normalizeCategoryText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** "Outros" e "Outros de <grupo>": a subcategoria que recebe o que não coube nas demais. */
function isOthersName(name: string): boolean {
  const normalized = normalizeCategoryText(name);
  return normalized === 'outros' || normalized.startsWith('outros de ');
}

/** Ordem das listas de categorias: A→Z (pt-BR), com "Outros" e "Outros de ..." sempre por último no seu nível. */
export function compararNomesCatalogo(a: string, b: string): number {
  const aOutros = isOthersName(a);
  const bOutros = isOthersName(b);
  if (aOutros !== bOutros) return aOutros ? 1 : -1;
  return a.localeCompare(b, 'pt-BR');
}

function tokenize(value: string): string[] {
  return normalizeCategoryText(value).split(/[^a-z0-9]+/).filter(Boolean);
}

/** Opção do grupo "Categoria" do botão de filtros (mesmo formato do MultiFilterPanel). */
export interface CategoryFilterOption {
  value: string;
  label: string;
  /** Subcategoria: o pai vira o cabeçalho do grupo, e marcá-lo marca o pai e as subs. */
  parentValue?: string;
}

export interface SelectableCategoryGroup<T extends OpcaoCatalogo = Categoria> {
  /** null quando a categoria não tem pai nem filhos ativos — item solto, sem agrupamento. */
  parent: T | null;
  items: T[];
}

/**
 * Categorias ativas prontas para seleção em despesas/filtros, agrupadas por pai.
 * Quem recebe lançamento é decidido pelo servidor (`selectable`, ausente vale
 * "recebe"): aqui só se agrupa. O pai vira o cabeçalho das subcategorias que
 * recebem, a categoria solta que recebe entra sozinha, e o que não recebe (grupo
 * sem opção, categoria de sistema) não aparece.
 */
export function groupSelectableCategories<T extends OpcaoCatalogo>(categories: T[]): SelectableCategoryGroup<T>[] {
  const active = categories.filter((category) => category.ativo);
  const roots = active.filter((c) => !c.parent_id);
  const groups: SelectableCategoryGroup<T>[] = [];

  for (const root of roots) {
    const children = active.filter((c) => c.parent_id === root.id && c.selectable !== false);
    if (children.length > 0) {
      groups.push({ parent: root, items: children });
    } else if (root.selectable !== false) {
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

/** O que se escolhe num lançamento: as subcategorias que recebem e a categoria solta que recebe. */
function selectableCategories<T extends OpcaoCatalogo>(categories: T[]): T[] {
  return groupSelectableCategories(categories).flatMap((group) => group.items);
}

/**
 * O que o "+ criar" do seletor pede: a subcategoria a criar e o grupo dela, que pode
 * ser um existente ou um novo (criado junto, na mesma operação).
 */
export interface NewCategoryRequest {
  name: string;
  parentId?: number;
  newParentName?: string;
}

/** O pedido do "+ criar" na forma que a API de categorias e de classificações recebe. */
export function newCategoryFormValues(request: NewCategoryRequest): CategoriaFormValues {
  if (request.newParentName) {
    return { nome: request.newParentName, subcategories: [request.name] };
  }
  return { nome: request.name, parent_id: request.parentId };
}

/** O id que fica escolhido depois de criar: a subcategoria, mesmo quando nasceu junto com o grupo novo. */
export function createdCategoryId(
  request: NewCategoryRequest,
  created: { id: number; subcategories?: Array<{ id: number }> },
): number {
  return request.newParentName ? created.subcategories?.[0]?.id ?? created.id : created.id;
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

/**
 * Opções do grupo "Categoria" do botão de filtros: cada pai vira cabeçalho das
 * subcategorias (marcar o grupo marca o pai e as subs, porque há despesas
 * lançadas direto no pai), e as soltas entram sozinhas.
 */
export function categoryFilterOptions<T extends OpcaoCatalogo>(categories: T[]): CategoryFilterOption[] {
  return groupSelectableCategories(categories)
    .flatMap((group): CategoryFilterOption[] => (group.parent
      ? [
          { value: String(group.parent.id), label: group.parent.nome },
          ...group.items.map((category) => ({ value: String(category.id), label: category.nome, parentValue: String(group.parent!.id) })),
        ]
      : group.items.map((category) => ({ value: String(category.id), label: category.nome }))))
    .sort((a, b) => compararNomesCatalogo(a.label, b.label));
}

/**
 * Nomes das categorias marcadas no botão de filtros, na ordem das opções, para
 * o aviso de filtro: um grupo inteiro (pai e todas as subs) aparece só com o
 * nome do pai. Id marcado sem opção (categoria removida) aparece como veio.
 */
export function categoryFilterNames(options: CategoryFilterOption[], selected: ReadonlySet<string>): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const option of options) {
    if (option.parentValue) {
      childrenByParent.set(option.parentValue, [...(childrenByParent.get(option.parentValue) ?? []), option.value]);
    }
  }
  const wholeGroups = new Set(
    [...childrenByParent].filter(([parent, children]) => groupHeaderState(selected, parent, children) === 'checked').map(([parent]) => parent),
  );
  const names = options
    .filter((option) => {
      if (wholeGroups.has(option.value)) {
        return true;
      }
      return selected.has(option.value) && !(option.parentValue && wholeGroups.has(option.parentValue));
    })
    .map((option) => option.label);
  const unknown = [...selected].filter((value) => !options.some((option) => option.value === value));
  return [...names, ...unknown];
}
