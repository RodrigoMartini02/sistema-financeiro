import type { Expense } from '../../types/finance';
import { isRenegotiated } from '../../utils/cardInvoice';
import { getLocalTodayIso, isoToShortBrDate } from '../../utils/date';
import { countsFromDate, isCountedExpense } from '../../utils/expenseCounting';
import { formatCurrency } from '../finance/formatters';

type ExpenseStatusKey = 'pago' | 'atrasada' | 'em_dia' | 'cancelada' | 'renegociada' | 'agendada';

function getStatus(item: Expense): 'pago' | 'em_dia' | 'atrasada' {
  if (item.pago) return 'pago';
  return item.dataVencimento < getLocalTodayIso() ? 'atrasada' : 'em_dia';
}

// Cor por estado, compartilhada entre Status e Valor: o valor herda a cor do
// estado em vez de repetir a informacao com um codigo proprio.
const STATUS_TEXT_COLOR: Record<ExpenseStatusKey, string> = {
  pago: 'text-green-600 dark:text-green-400',
  atrasada: 'text-red-600 dark:text-red-400',
  // Sem cor propria: "em dia" e o estado neutro, o unico que nao pede nada do
  // usuario. Cor so onde ha algo a comunicar — pago encerra, atrasada cobra.
  em_dia: 'text-slate-600 dark:text-slate-300',
  // Cancelada e encerramento, nao pendencia: cinza para nao competir com
  // "atrasada", que e a unica que pede acao.
  cancelada: 'text-slate-400 dark:text-slate-500',
  // Fatura paga em parte ou parcelada: encerrada no mês, o restante seguiu para a frente.
  renegociada: 'text-slate-500 dark:text-slate-400',
  // Mensal que ainda não chegou à data: aparece na lista, fora das somas.
  agendada: 'text-slate-400 dark:text-slate-500',
};

const STATUS_LABEL: Record<ExpenseStatusKey, string> = {
  pago: 'Pago', atrasada: 'Atrasada', em_dia: 'Em dia', cancelada: 'Cancelada', renegociada: 'Renegociada', agendada: 'Agendada',
};

export function getFirstName(nome?: string | null): string {
  const first = (nome ?? '').trim().split(/\s+/)[0];
  return first || '—';
}

export function formatDiferenca(diff: number): string {
  return `${diff > 0 ? '+' : '−'} ${formatCurrency(Math.abs(diff))}`;
}

function getStatusKey(item: Expense): ExpenseStatusKey {
  if (item.status === 'cancelada') return 'cancelada';
  if (isRenegotiated(item)) return 'renegociada';
  if (!isCountedExpense(item, getLocalTodayIso())) return 'agendada';
  return getStatus(item);
}

/** Título do "Agendada": o dia em que ela entra nas somas. */
export function scheduledTitle(item: Expense): string {
  return `Conta a partir de ${isoToShortBrDate(countsFromDate(item))}`;
}

export function getStatusColor(item: Expense): string {
  return STATUS_TEXT_COLOR[getStatusKey(item)];
}

// Texto colorido em vez de capsula com icone: a cor ja comunica o estado, e o
// mesmo relogio aparecia em "atrasada" e "em dia" sem diferenciar nada.
export function StatusBadge({ item }: { item: Expense }) {
  const key = getStatusKey(item);
  return (
    <span className={['text-xs', STATUS_TEXT_COLOR[key]].join(' ')} title={key === 'agendada' ? scheduledTitle(item) : undefined}>
      {STATUS_LABEL[key]}
    </span>
  );
}
