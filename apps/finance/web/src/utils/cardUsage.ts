// Textos e contas do "Usado" do cartão e da quitação em lote das faturas vencidas (plano
// .plans/financas-pendencias.md, E3). Só leitura do que o servidor devolveu: as regras são do servidor.
import { formatCurrency } from '../screens/finance/formatters';
import type { CardUsageByType, CardUsageType } from '../services/cardLimitsService';
import type { OverdueInvoice } from '../services/cardInvoicesService';

export const USAGE_TYPE_LABELS: Record<CardUsageType, string> = {
  unicas: 'Compras únicas',
  parcelas: 'Parcelas',
  recorrentes: 'Recorrentes',
  renegociacao: 'Renegociação da fatura',
};

const USAGE_TYPE_ORDER: CardUsageType[] = ['unicas', 'parcelas', 'recorrentes', 'renegociacao'];
const MONTH_ABBREVIATIONS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;

/** 'AAAA-MM' → 'set/2026'. */
export function usageMonthText(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  return `${MONTH_ABBREVIATIONS[monthNumber - 1] ?? month}/${year}`;
}

/** Os tipos que têm valor, do maior grupo conhecido para o menor: "Compras únicas R$ 133,33 · Parcelas R$ 50,00". */
export function usageTypesText(porTipo: CardUsageByType): string {
  return USAGE_TYPE_ORDER
    .filter((type) => porTipo[type] > 0)
    .map((type) => `${USAGE_TYPE_LABELS[type]} ${formatCurrency(porTipo[type])}`)
    .join(' · ');
}

/** Identifica uma fatura da lista (cartão e mês), para marcar e para a data de cada uma. */
export function overdueInvoiceKey(invoice: Pick<OverdueInvoice, 'card' | 'invoiceMonth'>): string {
  return `${invoice.card.id}|${invoice.invoiceMonth}`;
}

/** Quantas faturas estão marcadas e quanto elas somam, em centavos (sem erro de ponto flutuante). */
export function overdueSelectionTotals(
  invoices: readonly OverdueInvoice[],
  selected: ReadonlySet<string>,
): { count: number; totalCents: number } {
  const chosen = invoices.filter((invoice) => selected.has(overdueInvoiceKey(invoice)));
  return { count: chosen.length, totalCents: chosen.reduce((sum, invoice) => sum + Math.round(invoice.openTotal * 100), 0) };
}

/** A data do pagamento é uma data real, não no futuro. */
export function isValidPaymentDate(value: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real && value <= today;
}
