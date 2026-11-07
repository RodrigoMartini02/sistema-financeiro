// Reajuste anual do contrato, sem banco. A cada aniversário da data-base o
// aviso "Reajuste disponível" aparece, até a empresa aplicar um percentual ou
// dispensar; o contrato guarda o último aniversário tratado.

const pad = (value: number) => String(value).padStart(2, '0');

export interface ReadjustmentState {
  available: boolean;
  /** Aniversário pendente mais antigo: o próximo a tratar. */
  anniversary: string;
}

/** Mesma data `years` anos depois; 29 de fevereiro vira 28 em ano que não é bissexto. */
export function addYears(isoDate: string, years: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const targetYear = year! + years;
  const lastDay = new Date(Date.UTC(targetYear, month!, 0)).getUTCDate();
  return `${targetYear}-${pad(month!)}-${pad(Math.min(day!, lastDay))}`;
}

/** Primeiro aniversário da data-base depois do último tratado (ou o primeiro de todos). */
export function nextReadjustmentAnniversary(baseDate: string, handledUntil: string | null): string {
  let years = 1;
  let anniversary = addYears(baseDate, years);
  while (handledUntil !== null && anniversary <= handledUntil) {
    years += 1;
    anniversary = addYears(baseDate, years);
  }
  return anniversary;
}

export function readjustmentState(baseDate: string, handledUntil: string | null, today: string): ReadjustmentState {
  const anniversary = nextReadjustmentAnniversary(baseDate, handledUntil);
  return { available: anniversary <= today, anniversary };
}

/**
 * Aniversário gravado ao aplicar ou dispensar: o mais recente até hoje. Com
 * vários ciclos atrasados, um só tratamento fecha todos; null se nenhum chegou.
 */
export function latestReachedAnniversary(baseDate: string, today: string): string | null {
  let latest: string | null = null;
  let years = 1;
  let anniversary = addYears(baseDate, years);
  while (anniversary <= today) {
    latest = anniversary;
    years += 1;
    anniversary = addYears(baseDate, years);
  }
  return latest;
}

/** Valor reajustado ao centavo (metade para cima): R$ 4.500,00 com 4,62% = R$ 4.707,90. 0,00% não altera. */
export function readjustAmount(amount: number, percent: number): number {
  const cents = Math.round(amount * 100);
  const basisPoints = Math.round(percent * 100);
  return Math.floor((2 * cents * (10_000 + basisPoints) + 10_000) / 20_000) / 100;
}
