// Retenções de tributos na receita de contrato com órgão público, sem banco.
// Cada tributo é arredondado ao centavo (metade para cima) e o líquido é o
// bruto menos a soma: é o valor que a empresa recebe e o que conta nos totais.
import { WITHHOLDING_TAXES, type WithholdingAmounts, type WithholdingRates } from './contractTypes';

export interface WithholdingResult {
  gross: number;
  amounts: WithholdingAmounts;
  total: number;
  net: number;
}

/** Arredonda `cents × basisPoints / 10000` ao centavo, metade para cima, só com inteiros. */
function percentOfCents(cents: number, basisPoints: number): number {
  return Math.floor((2 * cents * basisPoints + 10_000) / 20_000);
}

/** Algum tributo com percentual acima de zero: só então a receita guarda bruto e retenções. */
export function hasWithholdings(rates: WithholdingRates): boolean {
  return WITHHOLDING_TAXES.some((tax) => (rates[tax] ?? 0) > 0);
}

/** Percentual ausente vale 0,00%: sem retenção daquele tributo. */
export function computeWithholdings(gross: number, rates: WithholdingRates): WithholdingResult {
  const grossCents = Math.round(gross * 100);
  let totalCents = 0;
  const amounts: WithholdingAmounts = { ir: 0, pisCofinsCsll: 0, iss: 0, inss: 0 };
  for (const tax of WITHHOLDING_TAXES) {
    const cents = percentOfCents(grossCents, Math.round((rates[tax] ?? 0) * 100));
    amounts[tax] = cents / 100;
    totalCents += cents;
  }
  return {
    gross: grossCents / 100,
    amounts,
    total: totalCents / 100,
    net: (grossCents - totalCents) / 100,
  };
}
