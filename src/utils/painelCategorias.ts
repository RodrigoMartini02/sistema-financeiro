import type { PainelCategoria } from '../types/finance';

/** Uma categoria com tudo o que foi gasto nela, somado entre as pessoas que cadastraram. */
export interface CategoriaConsolidada {
  chave: string;
  categoriaId: number | null;
  categoria: string;
  total: number;
  pessoas: Map<number, { usuarioId: number; nome: string | null; valor: number }>;
}

/**
 * Categoria principal do gráfico: o gasto lançado nela mesma (`proprio`, nulo quando só
 * as subcategorias tiveram gasto) e as subcategorias com gasto.
 */
export interface RaizConsolidada {
  chave: string;
  categoriaId: number | null;
  nome: string;
  proprio: CategoriaConsolidada | null;
  subs: CategoriaConsolidada[];
}

/** A API devolve uma linha por (categoria, autor): junta por categoria guardando a parte de cada pessoa. */
function consolidarCategorias(linhas: PainelCategoria[]): Map<string, CategoriaConsolidada & { parentId: number | null; parentNome: string | null }> {
  const porChave = new Map<string, CategoriaConsolidada & { parentId: number | null; parentNome: string | null }>();
  for (const linha of linhas) {
    if (linha.total <= 0) continue;
    const chave = String(linha.categoriaId ?? linha.categoria);
    const atual = porChave.get(chave) ?? {
      chave, categoriaId: linha.categoriaId, categoria: linha.categoria, total: 0, pessoas: new Map(),
      parentId: linha.parentId, parentNome: linha.parentNome,
    };
    atual.total += linha.total;
    if (linha.usuarioId !== null) {
      const pessoa = atual.pessoas.get(linha.usuarioId);
      if (pessoa) pessoa.valor += linha.total;
      else atual.pessoas.set(linha.usuarioId, { usuarioId: linha.usuarioId, nome: linha.autorNome, valor: linha.total });
    }
    porChave.set(chave, atual);
  }
  return porChave;
}

/**
 * Agrupa as categorias com gasto sob a principal delas. A subcategoria fica sob o pai
 * mesmo quando o pai não teve gasto próprio (em conta pessoal só a subcategoria recebe
 * lançamento): o pai vem da própria linha. Sem o nome do pai, a categoria é principal.
 */
export function agruparCategoriasPorRaiz(linhas: PainelCategoria[]): RaizConsolidada[] {
  const categorias = [...consolidarCategorias(linhas).values()];
  const raizes = new Map<string, RaizConsolidada>();

  for (const categoria of categorias) {
    if (categoria.parentId !== null && categoria.parentNome) continue;
    raizes.set(categoria.chave, { chave: categoria.chave, categoriaId: categoria.categoriaId, nome: categoria.categoria, proprio: categoria, subs: [] });
  }
  for (const categoria of categorias) {
    if (categoria.parentId === null || !categoria.parentNome) continue;
    const chave = String(categoria.parentId);
    const raiz = raizes.get(chave) ?? { chave, categoriaId: categoria.parentId, nome: categoria.parentNome, proprio: null, subs: [] };
    raiz.subs.push(categoria);
    raizes.set(chave, raiz);
  }
  return [...raizes.values()];
}
