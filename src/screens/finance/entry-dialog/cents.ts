// Os modais de lançamento guardam valores em centavos (sem erro de arredondamento
// na divisão e nos ajustes) e só convertem para reais na borda: exibição e envio.
import { formatCurrency } from '../formatters';

export function toCents(reais: number): number {
  return Math.round(reais * 100);
}

export function toReais(cents: number): number {
  return cents / 100;
}

/** 18740 → "R$ 187,40". */
export function formatCents(cents: number): string {
  return formatCurrency(cents / 100);
}
