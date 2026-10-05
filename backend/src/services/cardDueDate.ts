// Mudança do dia de vencimento de um cartão, sem acesso a banco. A despesa já
// lançada continua na mesma fatura (mesmo mês): só o dia muda, limitado ao
// último dia do mês. A vigência diz de qual mês em diante a mudança vale.

/** O mesmo mês de `isoDate` ('AAAA-MM-DD') no dia `day`; dia 31 em mês de 30 cai no 30. */
export function moveDueDateToDay(isoDate: string, day: number): string {
  const [year, month] = isoDate.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const nextDay = Math.min(day, lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
}

/** Mês de vigência 'AAAA-MM' → seu 1º dia ('AAAA-MM-01'); `null` quando o valor não é um mês válido. */
export function parseEffectiveMonth(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  return match ? `${match[1]}-${match[2]}-01` : null;
}
