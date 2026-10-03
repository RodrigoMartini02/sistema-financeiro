// Card de pagamento do chip "Pagar despesa": o "Confirmar Pagamento" do
// desktop (PaymentModal) no formato do card de despesa do assistente. Mostra a
// despesa, o previsto e o vencimento; pede o valor pago e a data do pagamento.
// Quem grava é o assistente, pela mesma rota do desktop (pagarDespesa).
import type { OpenExpense } from '../../types/finance';
import { formatCurrency } from '../../screens/finance/formatters';
import { isoToBrDate } from '../../utils/date';
import { Card } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { CardActions } from './CardActions';

export interface PaymentDraft {
  expense: OpenExpense;
  /** null: paga o valor previsto. */
  amountPaid: number | null;
  /** ISO. */
  paymentDate: string;
}

interface PaymentCardProps {
  payment: PaymentDraft;
  isSaving: boolean;
  onChange: (patch: Partial<Pick<PaymentDraft, 'amountPaid' | 'paymentDate'>>) => void;
  onSave: () => void;
  onDiscard: () => void;
}

const LABEL_CLASS = 'w-[92px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400';
const ROW_CLASS = 'flex items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800';

/** "Luz", ou "TV 3/10" numa parcela. */
export function openExpenseLabel(expense: OpenExpense): string {
  return expense.parcelaAtual && expense.totalParcelas
    ? `${expense.descricao} ${expense.parcelaAtual}/${expense.totalParcelas}`
    : expense.descricao;
}

/** Diferença entre o pago e o previsto, nos termos do "Confirmar Pagamento" do desktop. */
export function paymentDifferenceText(expense: OpenExpense, amountPaid: number | null): { text: string; tone: 'warning' | 'success' } | null {
  if (amountPaid === null) return null;
  const difference = Math.round((amountPaid - expense.valor) * 100) / 100;
  if (difference === 0) return null;
  return difference > 0
    ? { text: `Acréscimo de ${formatCurrency(difference)}`, tone: 'warning' }
    : { text: `Economia de ${formatCurrency(Math.abs(difference))}`, tone: 'success' };
}

export function PaymentCard({ payment, isSaving, onChange, onSave, onDiscard }: PaymentCardProps) {
  const { expense } = payment;
  const difference = paymentDifferenceText(expense, payment.amountPaid);

  return (
    <Card className="border-cyan-200 p-0 dark:border-cyan-900/70">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-cyan-50/60 px-3.5 py-2.5 dark:border-slate-800 dark:bg-cyan-950/20">
        <p className="text-sm font-bold text-slate-900 dark:text-white">Pagamento</p>
        {expense.vencida && <Badge tone="expense">Vencida</Badge>}
      </div>

      <div className="px-3.5">
        <div className={ROW_CLASS}>
          <span className={LABEL_CLASS}>Despesa</span>
          <span className="min-w-0 flex-1 truncate text-base font-bold text-slate-900 dark:text-white">{openExpenseLabel(expense)}</span>
        </div>
        <div className={ROW_CLASS}>
          <span className={LABEL_CLASS}>Vencimento</span>
          <span className="flex-1 text-base font-bold tabular-nums text-slate-900 dark:text-white">{isoToBrDate(expense.vencimento)}</span>
        </div>
        <div className={ROW_CLASS}>
          <span className={LABEL_CLASS}>Valor previsto</span>
          <span className="flex-1 text-base font-bold tabular-nums text-slate-900 dark:text-white">{formatCurrency(expense.valor)}</span>
        </div>
        <label className={ROW_CLASS}>
          <span className={LABEL_CLASS}>Valor pago</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={payment.amountPaid ?? ''}
            onChange={(event) => onChange({ amountPaid: event.target.value ? Number(event.target.value) : null })}
            placeholder={String(expense.valor)}
            className="h-7 flex-1 appearance-none bg-transparent text-lg font-bold tabular-nums text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:text-white"
          />
        </label>
        <label className="flex items-center gap-3 py-2">
          <span className={LABEL_CLASS}>Pago em</span>
          <input
            type="date"
            value={payment.paymentDate}
            onChange={(event) => onChange({ paymentDate: event.target.value })}
            className="h-7 flex-1 bg-transparent text-base font-bold tabular-nums text-slate-900 outline-none transition dark:text-white"
          />
        </label>
      </div>

      {difference && (
        <p className={[
          'mx-3.5 mb-3 rounded-lg border px-3 py-2 text-xs font-semibold',
          difference.tone === 'warning'
            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
            : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
        ].join(' ')}>
          {difference.text}
        </p>
      )}

      <CardActions isSaving={isSaving} onSave={onSave} onDiscard={onDiscard} discardLabel="Descartar este pagamento sem salvar" />
    </Card>
  );
}
