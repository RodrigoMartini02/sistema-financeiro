import type { OpcaoCatalogo } from '../types/config';
import { normalizeCategoryText, type CategoryHistoryEntry } from './categorySuggestions';

/**
 * Categoria sugerida para a descrição digitada: a de uma receita anterior com
 * descrição parecida. Só vale se ainda estiver ativa no catálogo da conta — a
 * receita antiga pode ser de outra conta ou de uma categoria desativada.
 */
export function suggestIncomeClassificationForDescription<T extends OpcaoCatalogo>(
  description: string,
  history: CategoryHistoryEntry[],
  catalog: T[],
): T | null {
  const normalizedDescription = normalizeCategoryText(description);
  if (normalizedDescription.length < 3) return null;

  for (const { description: previous, categoryId } of history) {
    if (categoryId == null) continue;
    const normalizedPrevious = normalizeCategoryText(previous);
    const similar = normalizedPrevious.length >= 3 && (
      normalizedDescription.includes(normalizedPrevious) || normalizedPrevious.includes(normalizedDescription)
    );
    if (!similar) continue;
    const category = catalog.find((item) => item.id === categoryId && item.ativo);
    if (category) return category;
  }
  return null;
}
