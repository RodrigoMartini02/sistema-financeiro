// Filtragem das despesas da tela de Movimentações. A tabela mostra a lista e a
// tela calcula o resumo filtrado com esta mesma regra, sem a tabela precisar
// avisar a tela a cada render.
import type { Expense } from '../types/finance';
import { daysAgoLocalIso, getLocalTodayIso } from './date';

export type EntryType = 'receita' | 'despesa';
export type ExpenseStatus = 'pago' | 'em_dia' | 'atrasada';
export type PaymentDateWindow = 'hoje' | 'semana' | 'mes';

/** Filtros do painel; conjunto vazio não filtra. */
export interface ExpenseFilters {
  types: ReadonlySet<EntryType>;
  statuses: ReadonlySet<ExpenseStatus>;
  categoryIds: ReadonlySet<string>;
  paymentMethods: ReadonlySet<string>;
  cardIds: ReadonlySet<string>;
  paymentDates: ReadonlySet<PaymentDateWindow>;
}

/** Pessoas marcadas no filtro de pessoas; com meId ainda carregando, nada fica escondido. */
export interface ExpenseVisibility {
  meId: string | null;
  visibleNames: ReadonlySet<string>;
}

/** Datas de referência (YYYY-MM-DD, fuso local) dos filtros de status e de data de pagamento. */
export interface ReferenceDates {
  today: string;
  weekAgo: string;
}

export function getExpenseStatus(item: Expense, today = getLocalTodayIso()): ExpenseStatus {
  if (item.pago) return 'pago';
  return item.dataVencimento < today ? 'atrasada' : 'em_dia';
}

/** Despesa que pode entrar no pagamento em lote: não paga e não cancelada. */
export function isBatchSelectable(item: Expense): boolean {
  return !item.pago && item.status !== 'cancelada';
}

/**
 * Texto que muda quando qualquer filtro muda; a seleção em lote recomeça com ele.
 * Os conjuntos entram em ordem, então a mesma escolha sempre dá o mesmo texto,
 * mesmo vindo de um Set novo a cada render.
 */
export function expenseFiltersKey(filters: ExpenseFilters, visibleNames: ReadonlySet<string>): string {
  const sortedValues = (values: ReadonlySet<string>) => [...values].sort().join(',');
  return [
    filters.types, filters.statuses, filters.categoryIds, filters.paymentMethods, filters.cardIds, filters.paymentDates, visibleNames,
  ].map(sortedValues).join('|');
}

export function filterExpenses(
  expenses: readonly Expense[],
  filters: ExpenseFilters,
  visibility: ExpenseVisibility,
  month: number,
  year: number,
  { today, weekAgo }: ReferenceDates = { today: getLocalTodayIso(), weekAgo: daysAgoLocalIso(7) },
): Expense[] {
  if (!filters.types.has('despesa')) return [];
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

  const matchesPaymentDate = (item: Expense): boolean => {
    if (filters.paymentDates.size === 0) return true;
    const paidOn = item.dataPagamento;
    if (!paidOn) return false;
    if (filters.paymentDates.has('hoje') && paidOn === today) return true;
    if (filters.paymentDates.has('semana') && paidOn >= weekAgo && paidOn <= today) return true;
    return filters.paymentDates.has('mes') && paidOn.startsWith(monthPrefix);
  };

  // Despesa é de quem paga (dono do cartão); quem cadastrou continua vendo o
  // que lançou quando está marcado no filtro, para poder conferir e editar.
  const isVisible = (item: Expense): boolean => {
    if (visibility.meId == null) return true;
    return (!!item.pagadorNome && visibility.visibleNames.has(item.pagadorNome))
      || (String(item.autorId) === visibility.meId && !!item.autorNome && visibility.visibleNames.has(item.autorNome));
  };

  return expenses.filter((item) => {
    if (filters.statuses.size > 0 && !filters.statuses.has(getExpenseStatus(item, today))) return false;
    if (filters.categoryIds.size > 0 && !filters.categoryIds.has(String(item.categoriaId))) return false;
    if (!isVisible(item)) return false;
    if (filters.paymentMethods.size > 0 && !filters.paymentMethods.has(item.formaPagamento)) return false;
    if (filters.cardIds.size > 0 && !filters.cardIds.has(String(item.cartaoId ?? ''))) return false;
    return matchesPaymentDate(item);
  });
}
