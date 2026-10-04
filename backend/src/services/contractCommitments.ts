// Saldo dos empenhos do contrato com órgão público, sem banco. O saldo de um
// ano é o valor empenhado menos o bruto das receitas do contrato já faturadas
// ou recebidas naquele ano. Faturar além do saldo, ou sem empenho no ano, só
// avisa: não bloqueia.

export const COMMITMENT_WARNING = 'Empenho sem saldo suficiente';

export interface CommitmentTerms {
  year: number;
  number: string;
  amount: number;
}

export interface CommitmentBalance extends CommitmentTerms {
  /** Bruto das receitas faturadas ou recebidas no ano. */
  used: number;
  /** Negativo quando já se faturou além do empenhado. */
  balance: number;
}

const toCents = (value: number) => Math.round(value * 100);

/** Ano que a receita consome: o da competência ou, sem ela, o da data da receita. */
export function commitmentYear(competence: string | null, incomeDate: string): number {
  return Number((competence ?? incomeDate).slice(0, 4));
}

/** Empenhos em ordem de ano, cada um com o usado e o saldo. */
export function commitmentBalances(
  commitments: readonly CommitmentTerms[],
  usedByYear: ReadonlyMap<number, number>,
): CommitmentBalance[] {
  return [...commitments]
    .sort((a, b) => a.year - b.year)
    .map((commitment) => {
      const usedCents = toCents(usedByYear.get(commitment.year) ?? 0);
      return {
        ...commitment,
        used: usedCents / 100,
        balance: (toCents(commitment.amount) - usedCents) / 100,
      };
    });
}

/** Aviso ao faturar `gross` no ano do empenho (nulo quando não há empenho naquele ano). */
export function commitmentWarning(commitment: { amount: number } | null, usedInYear: number, gross: number): string | null {
  if (commitment === null) {
    return COMMITMENT_WARNING;
  }
  return toCents(usedInYear) + toCents(gross) > toCents(commitment.amount) ? COMMITMENT_WARNING : null;
}
