/**
 * Seleção de um grupo do botão de filtros (pai com subcategorias). O cabeçalho
 * marca e desmarca o pai junto com as filhas: há lançamentos feitos direto no
 * pai, e marcar o grupo deve trazê-los também. Marcar uma filha marca só ela.
 */

export type GroupHeaderState = 'checked' | 'partial' | 'empty';

function groupValues(parentValue: string, childValues: readonly string[]): string[] {
  return [parentValue, ...childValues];
}

/** Marcado com o pai e todas as filhas; parcial com parte deles; vazio sem nenhum. */
export function groupHeaderState(
  selected: ReadonlySet<string>,
  parentValue: string,
  childValues: readonly string[],
): GroupHeaderState {
  const values = groupValues(parentValue, childValues);
  const markedCount = values.filter((value) => selected.has(value)).length;
  if (markedCount === 0) {
    return 'empty';
  }
  return markedCount === values.length ? 'checked' : 'partial';
}

/** Clique no cabeçalho: marca o grupo inteiro, ou desmarca tudo quando ele já está inteiro. */
export function toggleGroupSelection(
  selected: ReadonlySet<string>,
  parentValue: string,
  childValues: readonly string[],
): Set<string> {
  const markAll = groupHeaderState(selected, parentValue, childValues) !== 'checked';
  const next = new Set(selected);
  for (const value of groupValues(parentValue, childValues)) {
    if (markAll) {
      next.add(value);
    } else {
      next.delete(value);
    }
  }
  return next;
}
