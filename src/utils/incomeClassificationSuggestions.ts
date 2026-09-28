import type { Income } from '../types/finance';
import type { OpcaoCatalogo } from '../types/config';

const DIACRITICS_START = String.fromCharCode(0x0300);
const DIACRITICS_END = String.fromCharCode(0x036f);
const DIACRITICS_PATTERN = new RegExp(`[${DIACRITICS_START}-${DIACRITICS_END}]`, 'g');

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(DIACRITICS_PATTERN, '')
    .toLowerCase()
    .trim();
}

/**
 * Classificação sugerida para a descrição digitada: a de uma receita anterior
 * com descrição parecida. Só vale se ainda estiver ativa no catálogo da conta —
 * a receita antiga pode ser de outra conta ou de uma classificação desativada.
 */
export function suggestIncomeClassificationForDescription<T extends OpcaoCatalogo>(
  description: string,
  incomes: Income[],
  catalog: T[],
  currentIncomeId?: number,
): T | null {
  const normalizedDescription = normalizeText(description);
  if (normalizedDescription.length < 3) return null;

  const reusableIncome = incomes.find((income) => {
    if (income.id === currentIncomeId || !income.classificacaoId) return false;
    const previousDescription = normalizeText(income.descricao ?? '');
    return previousDescription.length >= 3 && (
      normalizedDescription.includes(previousDescription) || previousDescription.includes(normalizedDescription)
    );
  });

  if (!reusableIncome) return null;
  return catalog.find((item) => item.id === reusableIncome.classificacaoId && item.ativo) ?? null;
}
