import { formatCurrency } from '../../screens/finance/formatters';

// Valores em reais. A API recebe decimal em texto com ponto ("150000.50") nos
// filtros e na busca salva, e devolve número. Nos campos R$ (useMoneyInput),
// vazio é 0; aqui 0 e vazio viram "sem limite" (null).

const DECIMAL_VALUE = /^\d{1,16}(\.\d{1,2})?$/;

export const VALUE_NOT_INFORMED = 'Não informado';

/** Decimal em texto aceito pela API (até 16 dígitos inteiros e 2 decimais). */
export function isDecimalValue(text: string): boolean {
  return DECIMAL_VALUE.test(text);
}

/** Reais do campo → decimal da API; 0, vazio ou inválido → null. */
export function reaisToDecimal(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null;
  const text = value.toFixed(2);
  return isDecimalValue(text) ? text : null;
}

/** Decimal da API → reais; ausente ou inválido → null. */
export function decimalToReais(text: string | null | undefined): number | null {
  if (!text || !isDecimalValue(text)) return null;
  return Number(text);
}

/** "R$ 1.500,00"; sem valor, "Não informado". */
export function formatMoneyValue(value: number | null | undefined): string {
  return value === null || value === undefined ? VALUE_NOT_INFORMED : formatCurrency(value);
}
