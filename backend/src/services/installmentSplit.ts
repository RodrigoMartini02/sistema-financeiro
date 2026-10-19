// Divisão de um total em parcelas e do juros entre elas, sem acesso ao banco. As
// cobranças em parcelas dos contratos, o pagamento da fatura do cartão e o cadastro
// da despesa parcelada usam as mesmas contas.

/** Partes iguais em centavos, com a diferença na última: 100000 em 3 = 33333 + 33333 + 33334. */
export function splitCents(totalCents: number, count: number): number[] {
  const partCents = Math.floor(totalCents / count);
  const parts = Array.from({ length: count }, () => partCents);
  parts[count - 1] = totalCents - partCents * (count - 1);
  return parts;
}

/** Partes iguais, com a diferença de centavos na última: R$ 1.000,00 em 3 = 333,33 + 333,33 + 333,34. */
export function splitInstallments(total: number, installments: number): number[] {
  return splitCents(Math.round(total * 100), installments).map((cents) => cents / 100);
}

/**
 * Juros por parcela: partes iguais, com o resto na última, sem passar do valor de cada parcela.
 * O que não cabe numa parcela vai para as anteriores e, se ainda sobrar, para as seguintes, de
 * modo que a soma dos juros fica igual ao total (que não passa da soma das parcelas).
 */
export function splitInterestWithinInstallments(interestCents: number, amountsInCents: number[]): number[] {
  const interests = splitCents(interestCents, amountsInCents.length);
  let excess = 0;
  for (let index = interests.length - 1; index >= 0; index -= 1) {
    const wanted = interests[index]! + excess;
    const fitted = Math.min(wanted, amountsInCents[index]!);
    interests[index] = fitted;
    excess = wanted - fitted;
  }
  for (let index = 0; index < interests.length && excess > 0; index += 1) {
    const added = Math.min(amountsInCents[index]! - interests[index]!, excess);
    interests[index] = interests[index]! + added;
    excess -= added;
  }
  return interests;
}

/**
 * Juros embutido no parcelado: o que a soma das parcelas passa do valor à vista, dividido entre elas.
 * Sem valor à vista, ou com ele igual ou maior que a soma, não há juros: tudo zero.
 */
export function embeddedInstallmentInterests(amountsInCents: number[], cashPriceInCents: number | null): number[] {
  const totalCents = amountsInCents.reduce((sum, cents) => sum + cents, 0);
  const interestCents = cashPriceInCents === null ? 0 : Math.max(0, totalCents - cashPriceInCents);
  if (interestCents === 0) {
    return amountsInCents.map(() => 0);
  }
  return splitInterestWithinInstallments(interestCents, amountsInCents);
}
