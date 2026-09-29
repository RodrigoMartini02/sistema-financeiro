import type { Expense } from '../../types/finance';

// Peças comuns das tabelas de lançamentos (Movimentações, Despesas e Relatórios).

export const TH_CLASS = 'px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-400 text-center';
export const TD_CLASS = 'px-2 py-1.5 text-center';
/** Texto secundário da célula (subcategoria, cartão, "cadastrado por"). */
export const SECONDARY_CLASS = 'text-[11px] text-slate-400 dark:text-slate-500';
export const DASH = <span className="text-slate-300 dark:text-slate-600">—</span>;

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro', pix: 'PIX',
  debito: 'Débito', débito: 'Débito',
  credito: 'Crédito', crédito: 'Crédito',
  transferencia: 'Transferência',
};

export function getPaymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[(method ?? '').toLowerCase()] ?? method ?? '—';
}

// Os tres tipos sao mutuamente exclusivos, mas `parcelado` e `recorrente` sao
// colunas independentes no banco e ha registros antigos com ambos true. A
// prioridade e explicita: parcelada vence, porque o contador de parcelas prova
// que a despesa tem fim. Sem cor propria: aqui a cor seria so decoracao.
export function EntryTypeBadge({ item }: { item: Pick<Expense, 'parcela' | 'recorrente'> }) {
  if (item.parcela) {
    return <span className="text-xs text-slate-600 dark:text-slate-300">{item.parcela}</span>;
  }
  if (item.recorrente) {
    return <span className="text-xs text-slate-600 dark:text-slate-300">Recorrente</span>;
  }
  return <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>;
}
