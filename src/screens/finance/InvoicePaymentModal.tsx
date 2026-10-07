import { useEffect, useState, type CSSProperties } from 'react';
import { AlertCircle, CircleCheck, RotateCcw } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useConfirm } from '../../context/ConfirmContext';
import { IsoDateField } from '../../ui/DateField';
import { Dialog } from '../../ui/dialog';
import {
  C, MoneyField, cardStyle, chipStyle, dangerButtonStyle, dialogFooterStyle, fieldInputStyle, labelStyle,
  neutralOutlineButtonOffStyle, saveButtonDisabledStyle, saveButtonStyle,
} from '../../ui/dialogFormTokens';
import { fetchCardInvoices, payCardInvoice, undoInvoicePayment } from '../../services/cardInvoicesService';
import { invalidateExpenseQueries, queryKeys } from '../../services/queryKeys';
import type { CardInvoice, InvoicePaymentEntry, InvoicePaymentInput, InvoicePaymentMethod } from '../../types/finance';
import {
  MAX_INVOICE_INSTALLMENTS, MIN_INVOICE_INSTALLMENTS, formatPercent, installmentsLabel, invoiceMonthLabel,
  shiftInvoiceMonth, summarizeInvoicePayment,
} from '../../utils/cardInvoice';
import { getLocalTodayIso } from '../../utils/date';
import { formatCurrency, formatDate } from './formatters';

interface InvoicePaymentModalProps {
  open: boolean;
  /** Mês da fatura, 'AAAA-MM' (o da tela). */
  invoiceMonth: string;
  /** Cartão já escolhido (a nota de uma compra renegociada abre direto nele). */
  initialCardId?: number | null;
  onClose: () => void;
}

const METHOD_LABELS: Record<InvoicePaymentMethod, string> = { total: 'Total', partial: 'Parcial', installments: 'Parcelado' };

const fieldColumnStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 7 };
const rowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: C.textMuted };

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ ...rowStyle, ...(strong ? { fontSize: 13.5, color: C.text, paddingTop: 6, borderTop: `1px solid ${C.border}` } : {}) }}>
      <dt>{label}</dt>
      <dd style={{ margin: 0, fontWeight: strong ? 700 : 600, color: C.text, textAlign: 'right' }}>{value}</dd>
    </div>
  );
}

/** "2026-10-07 13:45:12.123" (como o banco grava) → "07/10/2026". */
function formatStoredDate(value: string): string {
  return formatDate(value.slice(0, 10));
}

/** Uma linha do histórico: o que foi pago e para onde foi o restante. */
function paymentDescription(entry: InvoicePaymentEntry, invoiceMonth: string): string {
  const next = invoiceMonthLabel(shiftInvoiceMonth(invoiceMonth, 1));
  if (entry.method === 'total') {
    const charges = entry.chargesAmount > 0 ? `, com ${formatCurrency(entry.chargesAmount)} de encargos` : '';
    return `Total: ${formatCurrency(entry.paidAmount)}${charges}`;
  }
  if (entry.method === 'partial') {
    return `Parcial: ${formatCurrency(entry.paidAmount)} pagos; ${formatCurrency(entry.carriedForward)} na fatura de ${next}`;
  }
  const label = entry.installmentCount && entry.installmentAmount
    ? `${entry.installmentCount}x de ${formatCurrency(entry.installmentAmount)}`
    : formatCurrency(entry.carriedForward);
  return `Parcelado: ${label} a partir de ${next}`;
}

function PaymentHistory({
  invoice, invoiceMonth, undoPending, onUndo,
}: { invoice: CardInvoice; invoiceMonth: string; undoPending: boolean; onUndo: (entry: InvoicePaymentEntry) => void }) {
  if (invoice.payments.length === 0) return null;
  return (
    <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={labelStyle}>PAGAMENTOS DESTA FATURA</span>
      {invoice.payments.map((entry) => {
        const reversed = entry.reversedAt !== null;
        return (
          <div key={entry.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, color: reversed ? C.textSoft : C.text }}>
              <span style={{ fontWeight: 600 }}>{paymentDescription(entry, invoiceMonth)}</span>
              <span style={{ fontSize: 11.5, color: C.textSoft }}>
                Pago em {formatDate(entry.paymentDate)}
                {entry.registeredByName ? ` · registrado por ${entry.registeredByName}` : ''}
                {reversed ? ` · estornado em ${formatStoredDate(entry.reversedAt!)}${entry.reversedByName ? ` por ${entry.reversedByName}` : ''}` : ''}
              </span>
              {!reversed && !entry.canUndo && entry.undoBlockedReason && (
                <span style={{ fontSize: 11.5, color: C.textSoft }}>{entry.undoBlockedReason}</span>
              )}
            </div>
            {!reversed && (
              <button
                type="button"
                onClick={() => onUndo(entry)}
                disabled={!entry.canUndo || undoPending}
                title={entry.undoBlockedReason ?? undefined}
                style={{ ...dangerButtonStyle, ...(!entry.canUndo || undoPending ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
              >
                <RotateCcw size={14} />
                Desfazer
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}

/**
 * "Pagar fatura do cartão": a fatura do mês da tela, por cartão. Total, parcial
 * (o restante vai para a fatura seguinte) ou parcelado (parcelas a partir do mês
 * seguinte), com o resumo atualizado enquanto a pessoa digita e o histórico dos
 * pagamentos da fatura, com o "Desfazer". O servidor recalcula tudo ao gravar.
 */
export function InvoicePaymentModal({ open, invoiceMonth, initialCardId = null, onClose }: InvoicePaymentModalProps) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [cardId, setCardId] = useState<number | null>(initialCardId);
  const [method, setMethod] = useState<InvoicePaymentMethod>('total');
  const [amountPaid, setAmountPaid] = useState<number | undefined>(undefined);
  const [interestAmount, setInterestAmount] = useState<number | undefined>(undefined);
  const [installmentCountText, setInstallmentCountText] = useState(String(MIN_INVOICE_INSTALLMENTS));
  const [paymentDate, setPaymentDate] = useState(getLocalTodayIso);
  const [showItems, setShowItems] = useState(false);

  const invoicesQuery = useQuery({
    queryKey: queryKeys.cardInvoices(null, invoiceMonth),
    queryFn: () => fetchCardInvoices(null, invoiceMonth),
    enabled: open,
  });

  const payMutation = useMutation({
    mutationFn: (input: InvoicePaymentInput) => payCardInvoice(input),
    onSuccess: () => {
      invalidateExpenseQueries(qc);
      onClose();
    },
  });
  const undoMutation = useMutation({
    mutationFn: (paymentId: number) => undoInvoicePayment(paymentId),
    onSuccess: () => invalidateExpenseQueries(qc),
  });

  const { reset: resetPay } = payMutation;
  const { reset: resetUndo } = undoMutation;
  useEffect(() => {
    if (!open) return;
    setCardId(initialCardId);
    setMethod('total');
    setAmountPaid(undefined);
    setInterestAmount(undefined);
    setInstallmentCountText(String(MIN_INVOICE_INSTALLMENTS));
    setPaymentDate(getLocalTodayIso());
    setShowItems(false);
    resetPay();
    resetUndo();
  }, [open, invoiceMonth, initialCardId, resetPay, resetUndo]);

  const invoices = invoicesQuery.data ?? [];
  // Sem escolha, vale o primeiro cartão com valor em aberto (ou o primeiro da lista).
  const invoice = invoices.find((item) => item.card.id === cardId)
    ?? invoices.find((item) => item.openTotal > 0)
    ?? invoices[0]
    ?? null;

  const chooseCard = (id: number) => {
    setCardId(id);
    setAmountPaid(undefined);
    setInterestAmount(undefined);
    setShowItems(false);
    resetPay();
  };

  const chooseMethod = (next: InvoicePaymentMethod) => {
    setMethod(next);
    setAmountPaid(undefined);
    resetPay();
  };

  const purchasesAmount = invoice?.openTotal ?? 0;
  const paidValue = amountPaid ?? (method === 'total' ? purchasesAmount : 0);
  const interestValue = interestAmount ?? 0;
  const installmentCount = Number(installmentCountText);
  const summary = summarizeInvoicePayment({
    purchasesAmount, method, amountPaid: paidValue, interestAmount: interestValue, installmentCount,
  });
  const nextMonthLabel = invoiceMonthLabel(shiftInvoiceMonth(invoiceMonth, 1));

  let validationMessage = summary.error;
  if (!validationMessage && !paymentDate) validationMessage = 'Informe a data do pagamento.';
  const canConfirm = invoice !== null && purchasesAmount > 0 && validationMessage === null && !payMutation.isPending;

  function handleConfirm() {
    if (!canConfirm || !invoice) return;
    payMutation.mutate({
      cardId: invoice.card.id,
      invoiceMonth,
      method,
      paymentDate,
      ...(method === 'installments' ? {} : { amountPaid: paidValue }),
      ...(method === 'total' ? {} : { interestAmount: interestValue }),
      ...(method === 'installments' ? { installmentCount } : {}),
    });
  }

  async function handleUndo(entry: InvoicePaymentEntry) {
    const consequence = entry.method === 'total'
      ? 'As compras voltam a ficar em aberto.'
      : 'As compras voltam a ficar em aberto e o restante ou as parcelas geradas são excluídos.';
    const ok = await confirm({
      title: 'Desfazer pagamento da fatura',
      message: `Desfazer o pagamento da fatura de ${invoiceMonthLabel(invoiceMonth)}? ${consequence} O registro fica no histórico como estornado.`,
      confirmLabel: 'Desfazer pagamento',
    });
    if (ok) undoMutation.mutate(entry.id);
  }

  const interestParts: string[] = [formatCurrency(interestValue)];
  if (summary.interestPercent !== null) interestParts.push(formatPercent(summary.interestPercent));
  if (summary.monthlyRatePercent !== null) interestParts.push(`≈ ${formatPercent(summary.monthlyRatePercent)} ao mês`);

  return (
    <Dialog
      open={open}
      title="Pagar fatura do cartão"
      description={`Fatura de ${invoiceMonthLabel(invoiceMonth)}`}
      onClose={onClose}
      size="card"
      scrollBody={false}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 calc(-1 * var(--dialog-px))' }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 4 }}>
          {invoicesQuery.isLoading && (
            <p style={{ margin: '0 var(--dialog-px) 12px', fontSize: 13, color: C.textMuted }}>Carregando as faturas…</p>
          )}
          {invoicesQuery.isError && (
            <p role="alert" style={{ margin: '0 var(--dialog-px) 12px', fontSize: 13, color: C.danger }}>
              Não foi possível carregar as faturas: {invoicesQuery.error.message}
            </p>
          )}
          {invoicesQuery.isSuccess && invoices.length === 0 && (
            <p style={{ margin: '0 var(--dialog-px) 12px', fontSize: 13, color: C.textMuted }}>
              Nenhum cartão de crédito com fatura neste mês.
            </p>
          )}

          {invoice && (
            <>
              {invoices.length > 1 && (
                <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <span style={labelStyle}>CARTÃO</span>
                  <div role="radiogroup" aria-label="Cartão" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {invoices.map((item) => {
                      const selected = item.card.id === invoice.card.id;
                      return (
                        <button
                          key={item.card.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => chooseCard(item.card.id)}
                          style={chipStyle(selected, { h: 34 })}
                        >
                          {item.card.name}{item.card.ownerName ? ` (${item.card.ownerName.split(' ')[0]})` : ''} · {formatCurrency(item.openTotal)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ color: C.textMuted }}>{invoice.card.name} · vence em {formatDate(invoice.dueDate)}</span>
                  <span style={{ fontWeight: 700, color: C.text }}>{formatCurrency(invoice.openTotal)}</span>
                </div>
                {invoice.openItems.length > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowItems((value) => !value)}
                      aria-expanded={showItems}
                      style={{ alignSelf: 'flex-start', border: 'none', background: 'none', padding: 0, fontSize: 12, fontWeight: 600, color: C.primary, cursor: 'pointer' }}
                    >
                      {showItems ? 'Esconder' : 'Ver'} as {invoice.openItems.length} compras em aberto
                    </button>
                    {showItems && (
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                        {invoice.openItems.map((item) => (
                          <li key={item.expenseId} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: C.text }}>
                            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.description}
                              {item.installment ? ` · ${item.installment}` : ''}
                              {item.authorName ? <span style={{ color: C.textSoft }}> · {item.authorName.split(' ')[0]}</span> : null}
                            </span>
                            <span style={{ flexShrink: 0, fontWeight: 600 }}>{formatCurrency(item.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 12.5, color: C.textSoft }}>Esta fatura não tem valor em aberto.</span>
                )}
              </div>

              <PaymentHistory invoice={invoice} invoiceMonth={invoiceMonth} undoPending={undoMutation.isPending} onUndo={handleUndo} />

              {invoice.openTotal > 0 && (
                <>
                  <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={fieldColumnStyle}>
                      <span style={labelStyle}>FORMA DE PAGAMENTO</span>
                      <div role="radiogroup" aria-label="Forma de pagamento" style={{ display: 'flex', gap: 6 }}>
                        {(['total', 'partial', 'installments'] as const).map((option) => (
                          <button
                            key={option}
                            type="button"
                            role="radio"
                            aria-checked={method === option}
                            onClick={() => chooseMethod(option)}
                            style={{ ...chipStyle(method === option, { h: 36 }), flex: 1 }}
                          >
                            {METHOD_LABELS[option]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-y-3 sm:grid-cols-2" style={{ columnGap: 18 }}>
                      {method !== 'installments' && (
                        <div style={fieldColumnStyle}>
                          <span style={labelStyle}>{method === 'total' ? 'VALOR PAGO' : 'VALOR PAGO AGORA'}</span>
                          <MoneyField value={amountPaid ?? (method === 'total' ? purchasesAmount : undefined)} onChange={setAmountPaid} />
                        </div>
                      )}
                      {method === 'installments' && (
                        <div style={fieldColumnStyle}>
                          <label style={labelStyle} htmlFor="invoice-installments">NÚMERO DE PARCELAS</label>
                          <input
                            id="invoice-installments"
                            type="number"
                            inputMode="numeric"
                            min={MIN_INVOICE_INSTALLMENTS}
                            max={MAX_INVOICE_INSTALLMENTS}
                            step={1}
                            value={installmentCountText}
                            onChange={(event) => setInstallmentCountText(event.target.value)}
                            style={fieldInputStyle}
                          />
                        </div>
                      )}
                      {method !== 'total' && (
                        <div style={fieldColumnStyle}>
                          <span style={labelStyle}>{method === 'partial' ? 'JUROS DO ROTATIVO' : 'JUROS DO PARCELAMENTO'}</span>
                          <MoneyField value={interestAmount} onChange={setInterestAmount} />
                        </div>
                      )}
                      <div style={fieldColumnStyle}>
                        <span style={labelStyle}>DATA DO PAGAMENTO</span>
                        <IsoDateField
                          value={paymentDate}
                          onChange={setPaymentDate}
                          label="Data do pagamento"
                          required
                          inputStyle={{ ...fieldInputStyle, fontSize: 14 }}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ margin: '0 var(--dialog-px) 10px', borderRadius: 12, background: '#f8fafb', padding: '12px 14px' }}>
                    <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: C.textFaint }}>RESUMO DO PAGAMENTO</p>
                    <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <SummaryRow label="Soma das compras" value={formatCurrency(purchasesAmount)} />
                      <SummaryRow label="Pago agora" value={formatCurrency(method === 'installments' ? 0 : paidValue)} />
                      {method === 'total' && summary.chargesAmount > 0 && (
                        <SummaryRow label="Encargos (viram a despesa “Encargos da fatura”)" value={formatCurrency(summary.chargesAmount)} />
                      )}
                      {method !== 'total' && <SummaryRow label="Juros" value={interestParts.join(' · ')} />}
                      {method === 'partial' && summary.error === null && (
                        <SummaryRow label={`Restante na fatura de ${nextMonthLabel}`} value={formatCurrency(summary.carriedForward)} />
                      )}
                      {method === 'installments' && summary.installmentAmounts.length > 0 && (
                        <SummaryRow
                          label={`Parcelas a partir de ${nextMonthLabel}`}
                          value={installmentsLabel(summary.installmentAmounts, formatCurrency)}
                        />
                      )}
                      <SummaryRow
                        label="As compras ficam"
                        value={method === 'total' ? 'pagas' : `renegociadas · contam ${formatCurrency(summary.purchasesCountAs)} no mês`}
                        strong
                      />
                    </dl>
                  </div>
                </>
              )}
            </>
          )}

          {(payMutation.isError || undoMutation.isError || (invoice && invoice.openTotal > 0 && validationMessage)) && (
            <div
              role={payMutation.isError || undoMutation.isError ? 'alert' : undefined}
              style={{
                margin: '0 var(--dialog-px) 14px', display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: 10, padding: '10px 14px', fontSize: 13,
                ...(payMutation.isError || undoMutation.isError
                  ? { border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, color: C.danger }
                  : { border: `1px solid ${C.warnBorder}`, background: C.warnBg, color: C.warn }),
              }}
            >
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{payMutation.error?.message ?? undoMutation.error?.message ?? validationMessage}</span>
            </div>
          )}
        </div>

        <div style={{ ...dialogFooterStyle, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={neutralOutlineButtonOffStyle}>
            Cancelar
          </button>
          {invoice && invoice.openTotal > 0 && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              style={canConfirm ? { ...saveButtonStyle, background: C.success } : saveButtonDisabledStyle}
            >
              <CircleCheck size={16} />
              {payMutation.isPending ? 'Registrando…' : 'Confirmar pagamento'}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
