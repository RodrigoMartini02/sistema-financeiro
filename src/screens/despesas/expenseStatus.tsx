import type { Expense } from '../../types/finance';
import { getLocalTodayIso } from '../../utils/date';
import { formatCurrency } from '../finance/formatters';

type ExpenseStatusKey = 'pago' | 'atrasada' | 'em_dia' | 'cancelada';

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
};

const STATUS_LABEL: Record<ExpenseStatusKey, string> = {
  pago: 'Pago', atrasada: 'Atrasada', em_dia: 'Em dia', cancelada: 'Cancelada',
};

export function getFirstName(nome?: string | null): string {
  const first = (nome ?? '').trim().split(/\s+/)[0];
  return first || '—';
}

// O valor que a linha representa: o que saiu, quando pago; o previsto, quando
// nao. Em parcelada e o valor da parcela, nao o total da compra.
export function valorExibido(item: Expense): number {
  return item.pago && item.valorPago != null ? item.valorPago : item.valorFinal;
}

// Diferenca entre o previsto e o pago — juros ou desconto. Só existe quando a
// despesa foi paga por um valor diferente do previsto; nos demais casos nao ha
// nada a comunicar e a linha secundaria nao aparece.
export function diferencaValor(item: Expense): number | null {
  if (!item.pago || item.valorPago == null) return null;
  const diff = item.valorPago - item.valorFinal;
  return diff === 0 ? null : diff;
}

export function formatDiferenca(diff: number): string {
  return `${diff > 0 ? '+' : '−'} ${formatCurrency(Math.abs(diff))}`;
}

function getStatusKey(item: Expense): ExpenseStatusKey {
  return item.status === 'cancelada' ? 'cancelada' : getStatus(item);
}

export function getStatusColor(item: Expense): string {
  return STATUS_TEXT_COLOR[getStatusKey(item)];
}

// Texto colorido em vez de capsula com icone: a cor ja comunica o estado, e o
// mesmo relogio aparecia em "atrasada" e "em dia" sem diferenciar nada.
export function StatusBadge({ item }: { item: Expense }) {
  const key = getStatusKey(item);
  return (
    <span className={['text-xs', STATUS_TEXT_COLOR[key]].join(' ')}>
      {STATUS_LABEL[key]}
    </span>
  );
}
