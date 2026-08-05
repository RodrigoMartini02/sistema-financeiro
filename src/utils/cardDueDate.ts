import type { Cartao } from '../types/config';

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function dayInMonth(year: number, month: number, day: number): Date {
  const clampedDay = Math.min(day, lastDayOfMonth(year, month));
  return new Date(year, month, clampedDay);
}

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export interface FaturaVencimento {
  dataVencimento: string;
}

/**
 * Compra até o dia de fechamento entra na fatura do mês corrente;
 * depois do fechamento, entra na fatura seguinte. O vencimento é o
 * próximo dia de vencimento após o fechamento aplicável.
 */
export function calcularVencimentoFatura(cartao: Pick<Cartao, 'dia_fechamento' | 'dia_vencimento'>, dataCompraIso: string): FaturaVencimento {
  const diaFechamento = cartao.dia_fechamento ?? 1;
  const diaVencimento = cartao.dia_vencimento ?? 10;
  const compra = parseIsoDate(dataCompraIso);

  let fechamento = dayInMonth(compra.getFullYear(), compra.getMonth(), diaFechamento);
  if (compra > fechamento) {
    fechamento = dayInMonth(compra.getFullYear(), compra.getMonth() + 1, diaFechamento);
  }

  let vencimento = dayInMonth(fechamento.getFullYear(), fechamento.getMonth(), diaVencimento);
  if (vencimento < fechamento) {
    vencimento = dayInMonth(fechamento.getFullYear(), fechamento.getMonth() + 1, diaVencimento);
  }

  return {
    dataVencimento: toIsoDate(vencimento),
  };
}

/**
 * Próxima data com o mesmo dia do mês informado, respeitando meses
 * curtos (dias 29-31 caem no último dia do mês).
 */
export function proximoDiaDoMes(dataBaseIso: string, dia: number): string {
  const base = parseIsoDate(dataBaseIso);
  return toIsoDate(dayInMonth(base.getFullYear(), base.getMonth(), dia));
}
