// Busca e categorias da vitrine pública. Sem React: testável isoladamente.

export interface StorefrontCategory {
  /** Chave sem acento e minúscula: "Acessórios" e "acessorios" são a mesma categoria. */
  key: string;
  /** Como aparece no chip: a primeira grafia encontrada. */
  label: string;
}

interface SearchableProduct {
  nome: string;
  descricao: string | null;
  categoria: string | null;
}

/** Texto para comparar: sem acento, minúsculo e sem espaços nas pontas. */
export function normalizeSearchText(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

export function categoryKey(category: string | null): string | null {
  const key = category ? normalizeSearchText(category) : '';
  return key === '' ? null : key;
}

/** Categorias dos produtos, sem repetir, em ordem alfabética. */
export function storefrontCategories(products: SearchableProduct[]): StorefrontCategory[] {
  const byKey = new Map<string, string>();
  for (const product of products) {
    const key = categoryKey(product.categoria);
    if (key !== null && !byKey.has(key)) {
      byKey.set(key, product.categoria!.trim());
    }
  }
  return [...byKey]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

/** Produto que passa pela categoria escolhida (null = todas) e pela busca (nome, descrição ou categoria). */
export function matchesStorefrontFilter(product: SearchableProduct, selectedCategory: string | null, search: string): boolean {
  if (selectedCategory !== null && categoryKey(product.categoria) !== selectedCategory) {
    return false;
  }
  const terms = normalizeSearchText(search).split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return true;
  }
  const haystack = normalizeSearchText([product.nome, product.descricao ?? '', product.categoria ?? ''].join(' '));
  return terms.every((term) => haystack.includes(term));
}
