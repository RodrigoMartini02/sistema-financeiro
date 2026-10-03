// Lista de parcelas do card de despesa do assistente: a grade de parcelas do
// modal do desktop (InstallmentsPopover) empilhada para caber no celular.
// Mesmas regras — installmentGrid, markOverdueAsPaid — e o mesmo formato das
// parcelas pagas (dd/mm/aaaa e centavos), por isso nada aqui recalcula valor.
import type { StatusTone } from '../../screens/finance/entry-dialog/SummaryLine';
import { formatCents, toCents, toReais } from '../../screens/finance/entry-dialog/cents';
import type { ExpenseDraft, InstallmentPaymentDraft } from '../../screens/finance/expense-dialog/draftState';
import {
  installmentGrid, isCreditWithCard, markOverdueAsPaid, overdueOpenCount, paidInstallmentCount, selectedCard,
  type RuleContext,
} from '../../screens/finance/expense-dialog/draftRules';
import { brDateInputToIso, isoToBrDate, isoToShortBrDate } from '../../utils/date';

export interface InstallmentListPatch {
  installmentPayments?: Record<number, InstallmentPaymentDraft>;
  overdueDismissed?: boolean;
}

interface InstallmentListProps {
  /** O rascunho do card já no formato do modal (toExpenseDraft). */
  expenseDraft: ExpenseDraft;
  context: RuleContext;
  onChange: (patch: InstallmentListPatch) => void;
}

const TONE_CLASS: Record<StatusTone, string> = {
  success: 'text-emerald-700 dark:text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-300',
  danger: 'text-red-700 dark:text-red-300',
  info: 'text-[#0e7490] dark:text-cyan-300',
  neutral: 'text-slate-500 dark:text-slate-400',
};

const LINK_CLASS = 'text-xs font-semibold text-[#0e7490] underline-offset-2 hover:underline dark:text-cyan-300';

export function InstallmentList({ expenseDraft, context, onChange }: InstallmentListProps) {
  const payments = expenseDraft.installmentPayments;
  const credit = isCreditWithCard(expenseDraft, context.cards);
  const grid = installmentGrid(expenseDraft, context);
  const paidCount = paidInstallmentCount(expenseDraft);
  const overdue = overdueOpenCount(expenseDraft, context);
  const cardName = selectedCard(expenseDraft, context.cards)?.nome ?? '';

  const togglePaid = (index: number, dueDate: string) => {
    const next = { ...payments };
    if (next[index]) delete next[index];
    else next[index] = { paymentDate: isoToBrDate(dueDate), amountPaidCents: null };
    onChange({ installmentPayments: next });
  };

  const updatePayment = (index: number, change: Partial<InstallmentPaymentDraft>) => {
    const payment = payments[index];
    if (!payment) return;
    onChange({ installmentPayments: { ...payments, [index]: { ...payment, ...change } } });
  };

  const markOverdue = () => onChange(markOverdueAsPaid(expenseDraft, context));

  return (
    <div className="border-b border-slate-100 pb-2 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {credit ? `no cartão ${cardName} · marque as faturas pagas` : 'marque as pagas e ajuste data e valor se preciso'}
        </span>
        <span className="flex gap-3">
          {overdue > 0 && expenseDraft.overdueDismissed && (
            <button type="button" onClick={markOverdue} className={LINK_CLASS}>Marcar vencidas como pagas</button>
          )}
          {paidCount > 0 && (
            <button type="button" onClick={() => onChange({ installmentPayments: {} })} className={LINK_CLASS}>
              Limpar pagamentos
            </button>
          )}
        </span>
      </div>

      {overdue > 0 && !expenseDraft.overdueDismissed && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p>{overdue} {overdue === 1 ? 'parcela já venceu' : 'parcelas já venceram'}. Já foram pagas?</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={markOverdue}
              className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
            >
              Marcar como pagas no vencimento
            </button>
            <button
              type="button"
              onClick={() => onChange({ overdueDismissed: true })}
              className="px-1.5 py-1 font-semibold text-amber-800 dark:text-amber-200"
            >
              Deixar em aberto
            </button>
          </div>
        </div>
      )}

      <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
        {grid.rows.map((row) => {
          const payment = payments[row.index];
          return (
            <li key={row.index} className="py-1.5">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={row.paid}
                  onChange={() => togglePaid(row.index, row.dueDate)}
                  aria-label={`Parcela ${row.index + 1} paga`}
                  className="h-[18px] w-[18px] shrink-0 accent-[#0891b2]"
                />
                <span className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">
                  <span className="font-semibold">{row.index + 1}ª</span>
                  {' · '}
                  {credit ? `fatura ${row.invoiceMonth}` : `vence ${isoToShortBrDate(row.dueDate)}`}
                  {' · '}
                  <span className="font-semibold tabular-nums">{formatCents(row.amountCents)}</span>
                </span>
                <span className={['shrink-0 text-xs', TONE_CLASS[row.tone]].join(' ')}>{row.status}</span>
              </div>

              {payment && !credit && (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-7">
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    Pago em
                    <input
                      type="date"
                      value={brDateInputToIso(payment.paymentDate, context.todayIso)}
                      onChange={(event) => updatePayment(row.index, { paymentDate: isoToBrDate(event.target.value) })}
                      aria-label={`Data do pagamento da parcela ${row.index + 1}`}
                      className="h-7 bg-transparent text-sm font-semibold tabular-nums text-slate-900 outline-none dark:text-white"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    Valor pago
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={payment.amountPaidCents !== null ? toReais(payment.amountPaidCents) : ''}
                      onChange={(event) => updatePayment(row.index, {
                        amountPaidCents: event.target.value ? toCents(Number(event.target.value)) : null,
                      })}
                      placeholder={String(toReais(row.amountCents))}
                      aria-label={`Valor pago da parcela ${row.index + 1}`}
                      className="h-7 w-24 appearance-none bg-transparent text-sm font-semibold tabular-nums text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:text-white"
                    />
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="flex flex-wrap gap-x-4 pt-1 text-xs text-slate-500 dark:text-slate-400">
        <span>Total <b className="tabular-nums text-slate-800 dark:text-slate-100">{formatCents(grid.totalCents)}</b></span>
        <span>Pago <b className="tabular-nums text-emerald-700 dark:text-emerald-300">{formatCents(grid.paidCents)}</b></span>
        <span>Falta <b className="tabular-nums text-slate-800 dark:text-slate-100">{formatCents(grid.remainingCents)}</b></span>
      </p>
    </div>
  );
}
