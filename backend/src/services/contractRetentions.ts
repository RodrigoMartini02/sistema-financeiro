// Retenções de tributos na receita de contrato com órgão público, sem banco.
// Cada tributo é arredondado ao centavo (metade para cima) e o líquido é o
// bruto menos a soma: é o valor que a empresa recebe e o que conta nos totais.
import type { Contract } from '../modules/contracts/db/schema';
import { WITHHOLDING_TAXES, type WithholdingAmounts, type WithholdingRates, type WithholdingTax } from './contractTypes';

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

/** Percentuais como o banco devolve (numeric em texto); coluna nula fica de fora. */
export function ratesFromColumns(columns: Record<WithholdingTax, string | null>): WithholdingRates {
  const rates: WithholdingRates = {};
  for (const tax of WITHHOLDING_TAXES) {
    const value = columns[tax];
    if (value !== null) {
      rates[tax] = Number(value);
    }
  }
  return rates;
}

type WithholdingColumns = Pick<Contract, 'withholdingIr' | 'withholdingPisCofinsCsll' | 'withholdingIss' | 'withholdingInss'>;

/** Percentuais gravados no contrato. */
export function contractRates(contract: WithholdingColumns): WithholdingRates {
  return ratesFromColumns({
    ir: contract.withholdingIr,
    pisCofinsCsll: contract.withholdingPisCofinsCsll,
    iss: contract.withholdingIss,
    inss: contract.withholdingInss,
  });
}

/** Algum tributo com percentual acima de zero: só então a receita guarda bruto e retenções. */
export function hasWithholdings(rates: WithholdingRates): boolean {
  return WITHHOLDING_TAXES.some((tax) => (rates[tax] ?? 0) > 0);
}

export interface IncomeAmounts {
  gross: number;
  /** Nulo quando o contrato não retém nada: a receita não guarda bruto nem retenções. */
  withholdings: WithholdingAmounts | null;
  /** O que a receita vale (`valor`): o líquido. */
  net: number;
}

/** Valores de uma receita de contrato a partir do bruto. */
export function incomeAmounts(gross: number, rates: WithholdingRates): IncomeAmounts {
  if (!hasWithholdings(rates)) {
    return { gross, withholdings: null, net: gross };
  }
  const result = computeWithholdings(gross, rates);
  return { gross: result.gross, withholdings: result.amounts, net: result.net };
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
