import type { Income } from '../types/finance';

export interface IncomeTypeSuggestionResult {
  nome: string;
}

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

export function suggestIncomeTypeForDescription(
  description: string,
  incomes: Income[],
  currentIncomeId?: number,
): IncomeTypeSuggestionResult | null {
  const normalizedDescription = normalizeText(description);
  if (normalizedDescription.length < 3) return null;

  const reusableIncome = incomes.find((income) => {
    if (income.id === currentIncomeId) return false;
    const tipoReceita = income.tipoReceita?.trim();
    if (!tipoReceita) return false;
    const previousDescription = normalizeText(income.descricao ?? '');
    return previousDescription.length >= 3 && (
      normalizedDescription.includes(previousDescription) || previousDescription.includes(normalizedDescription)
    );
  });

  if (reusableIncome?.tipoReceita) {
    return { nome: reusableIncome.tipoReceita };
  }

  return null;
}
