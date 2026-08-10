import type { Expense, Income } from '../../../types/finance';
import { getLocalTodayIso } from '../../../utils/date';

export type CalendarItemKind = 'despesa' | 'receita' | 'compromisso';
export type CalendarItemStatus = 'pago' | 'atrasado' | 'em_dia' | 'previsto';

export function getExpenseStatus(expense: Expense): CalendarItemStatus {
  if (expense.pago) return 'pago';
  return expense.dataVencimento < getLocalTodayIso() ? 'atrasado' : 'em_dia';
}

export function getIncomeStatus(income: Income): CalendarItemStatus {
  if (income.status === 'ativa' || income.status === 'faturada') return 'pago';
  if (income.data < getLocalTodayIso()) return 'atrasado';
  return 'previsto';
}

export const statusColors: Record<CalendarItemStatus, { fg: string; bg: string; border: string }> = {
  pago:     { fg: '#059669', bg: 'rgba(16,185,129,.13)', border: 'rgba(16,185,129,.30)' },
  atrasado: { fg: '#e11d48', bg: 'rgba(244,63,94,.16)',  border: 'rgba(225,29,72,.5)' },
  em_dia:   { fg: '#fb7185', bg: 'rgba(244,63,94,.13)',  border: 'rgba(244,63,94,.30)' },
  previsto: { fg: '#b45309', bg: 'rgba(245,158,11,.12)', border: 'rgba(245,158,11,.32)' },
};

export const kindColors: Record<CalendarItemKind, { fg: string; bg: string; border: string; solid: string }> = {
  despesa:     { fg: '#e11d48', bg: 'rgba(244,63,94,.13)',  border: 'rgba(244,63,94,.30)',  solid: '#e11d48' },
  receita:     { fg: '#059669', bg: 'rgba(16,185,129,.13)', border: 'rgba(16,185,129,.30)', solid: '#059669' },
  compromisso: { fg: '#7c3aed', bg: 'rgba(124,58,237,.10)', border: 'rgba(124,58,237,.26)', solid: '#7c3aed' },
};
