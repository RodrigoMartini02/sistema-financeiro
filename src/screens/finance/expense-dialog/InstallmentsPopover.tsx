import { useRef, useState } from 'react';
import { C, formatMoney } from '../../../ui/dialogFormTokens';
import { FloatingPanel } from '../../../ui/FloatingPanel';
import { isoToBrDate } from '../../../utils/date';
import { formatCurrency } from '../formatters';
import { DateCell } from '../entry-dialog/DateCell';
import {
  defaultInstallmentAmount, installmentGrid, installmentMismatch, isCreditWithCard, markOverdueAsPaid,
  overdueOpenCount, paidInstallmentCount, selectedCard, type RuleContext,
} from './draftRules';
import type { DraftPatch, ExpenseDraft, InstallmentPaymentDraft } from './draftState';
import { MoneyCell } from '../entry-dialog/MoneyCell';
import type { StatusTone } from '../entry-dialog/SummaryLine';
import { SEPARATOR, checkboxStyle, ellipsisStyle, linkButtonStyle, selectStyle } from '../entry-dialog/fieldStyles';

const TONE_COLOR: Record<StatusTone, string> = {
  success: '#16a34a',
  warning: '#b45309',
  danger: '#be123c',
  info: C.primaryDark,
  neutral: C.textSoft,
};

const CREDIT_COLUMNS = '32px 64px 92px 120px 40px minmax(0,1fr)';
const DEFAULT_COLUMNS = '32px 92px 116px 40px 104px 108px minmax(0,1fr)';

const bannerButtonStyle = {
  flex: 'none', height: 26, padding: '0 12px', border: 'none', borderRadius: 13, background: C.primary,
  color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
};

interface InstallmentsPopoverProps {
  draft: ExpenseDraft;
  context: RuleContext;
  onUpdate: (patch: DraftPatch) => void;
}

/** Botão "N de M pagas" e a grade de parcelas: valor de cada uma, quais estão pagas, quando e quanto. */
export function InstallmentsPopover({ draft, context, onUpdate }: InstallmentsPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const credit = isCreditWithCard(draft, context.cards);
  const paidCount = paidInstallmentCount(draft);
  const overdue = overdueOpenCount(draft, context);
  const warn = overdue > 0 && !draft.overdueDismissed;
  const buttonLabel = `${paidCount} de ${draft.installmentCount} pagas${warn ? ` · ${overdue} ${overdue === 1 ? 'vencida' : 'vencidas'}` : ''}`;

  const updatePayment = (index: number, change: Partial<InstallmentPaymentDraft>) => onUpdate((current) => {
    const payment = current.installmentPayments[index];
    if (!payment) return {};
    return { installmentPayments: { ...current.installmentPayments, [index]: { ...payment, ...change } } };
  });

  const togglePaid = (index: number, dueDate: string) => onUpdate((current) => {
    const payments = { ...current.installmentPayments };
    if (payments[index]) delete payments[index];
    else payments[index] = { paymentDate: isoToBrDate(dueDate), amountPaidCents: null };
    return { installmentPayments: payments };
  });

  const setAdjustment = (index: number, cents: number | null) => onUpdate((current) => {
    const adjustments = { ...current.installmentAdjustments };
    if (cents === null) delete adjustments[index];
    else adjustments[index] = cents;
    return { installmentAdjustments: adjustments };
  });

  // Ajuste igual ao valor calculado não é ajuste: sai, e a parcela volta a acompanhar o total.
  const dropRedundantAdjustment = (index: number) => onUpdate((current) => {
    const adjustment = current.installmentAdjustments[index];
    if (adjustment === undefined || adjustment !== defaultInstallmentAmount(current, index)) return {};
    const adjustments = { ...current.installmentAdjustments };
    delete adjustments[index];
    return { installmentAdjustments: adjustments };
  });

  const grid = open ? installmentGrid(draft, context) : null;
  const mismatch = installmentMismatch(draft);
  const columns = credit ? CREDIT_COLUMNS : DEFAULT_COLUMNS;
  const headers = credit
    ? ['Nº', 'Fatura', 'Vence', 'Valor', 'Paga', 'Situação']
    : ['Nº', 'Vence', 'Valor', 'Paga', 'Pago em', 'Valor pago', 'Situação'];
  const cardName = selectedCard(draft, context.cards)?.nome ?? '';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        title="Ver parcelas e marcar as pagas"
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          ...selectStyle(),
          borderColor: warn ? C.warnBorder : open ? C.primary : C.borderInput,
          background: warn ? C.warnBg : '#fff',
          color: warn ? C.warn : C.text,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ flex: 'none' }}>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
        <span style={ellipsisStyle}>{buttonLabel}</span>
        <span aria-hidden="true" style={{ fontSize: 8, color: C.textFaint }}>▼</span>
      </button>

      <FloatingPanel open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} label="Parcelas" width={720} align="end" padding={14}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Parcelas</span>
          <span style={{ fontSize: 12, color: C.textSoft }}>
            {credit ? `no cartão ${cardName} · marque as faturas pagas` : 'marque as pagas e ajuste data e valor se preciso'}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
            {overdue > 0 && draft.overdueDismissed && (
              <button type="button" onClick={() => onUpdate((current) => markOverdueAsPaid(current, context))} style={{ ...linkButtonStyle, fontWeight: 600 }}>
                Marcar vencidas como pagas
              </button>
            )}
            {paidCount > 0 && (
              <button type="button" onClick={() => onUpdate({ installmentPayments: {} })} style={{ ...linkButtonStyle, color: C.textSoft, fontWeight: 400 }}>
                Limpar pagamentos
              </button>
            )}
          </div>
        </div>

        {warn && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '8px 10px', border: `1px solid ${C.warnBorder}`, borderRadius: 8, background: C.warnBg, fontSize: 12, color: C.warn }}>
            <span style={{ flex: 1, minWidth: 160 }}>
              {overdue} {overdue === 1 ? 'parcela já venceu' : 'parcelas já venceram'}. Já foram pagas?
            </span>
            <button type="button" onClick={() => onUpdate((current) => markOverdueAsPaid(current, context))} style={bannerButtonStyle}>
              Marcar como pagas no vencimento
            </button>
            <button
              type="button"
              onClick={() => onUpdate({ overdueDismissed: true })}
              style={{ flex: 'none', height: 26, padding: '0 8px', border: 'none', background: 'transparent', color: C.warn, fontSize: 12, cursor: 'pointer' }}
            >
              Deixar em aberto
            </button>
          </div>
        )}

        {mismatch && <span style={{ fontSize: 12, color: '#be123c' }}>{mismatch}</span>}

        {grid && (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: credit ? 420 : 640 }}>
              <div style={{ display: 'grid', gridTemplateColumns: columns, gap: 8, paddingBottom: 6, borderBottom: `1px solid ${SEPARATOR}`, fontSize: 11, fontWeight: 600, color: C.textSoft }}>
                {headers.map((header) => <span key={header}>{header}</span>)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 300, overflowY: 'auto' }}>
                {grid.rows.map((row) => {
                  const payment = draft.installmentPayments[row.index];
                  return (
                    <div
                      key={row.index}
                      style={{ display: 'grid', gridTemplateColumns: columns, gap: 8, alignItems: 'center', minHeight: 36, borderBottom: '1px solid #f1f5f9', fontSize: 12, color: C.text }}
                    >
                      <span style={{ fontWeight: 600 }}>{row.index + 1}ª</span>
                      {credit && <span style={{ color: C.textSoft }}>{row.invoiceMonth}</span>}
                      <span style={{ color: C.textSoft, fontVariantNumeric: 'tabular-nums' }}>{isoToBrDate(row.dueDate)}</span>
                      <MoneyCell
                        label={`Valor da parcela ${row.index + 1}`}
                        title="Edite se a loja arredondou esta parcela"
                        valueCents={row.amountCents}
                        onChange={(cents) => setAdjustment(row.index, cents)}
                        onBlur={() => dropRedundantAdjustment(row.index)}
                        adjusted={row.adjusted}
                        height={26}
                      />
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={row.paid}
                          aria-label={`Parcela ${row.index + 1} paga`}
                          onClick={() => togglePaid(row.index, row.dueDate)}
                          style={checkboxStyle(row.paid)}
                        >
                          {row.paid ? '✓' : ''}
                        </button>
                      </div>
                      {!credit && (
                        <>
                          <DateCell
                            label={`Data do pagamento da parcela ${row.index + 1}`}
                            value={payment?.paymentDate ?? ''}
                            onChange={(text) => updatePayment(row.index, { paymentDate: text })}
                            todayIso={context.todayIso}
                            emptyFallback={isoToBrDate(row.dueDate)}
                            disabled={!payment}
                            height={26}
                          />
                          <MoneyCell
                            label={`Valor pago da parcela ${row.index + 1}`}
                            valueCents={payment?.amountPaidCents ?? null}
                            onChange={(cents) => updatePayment(row.index, { amountPaidCents: cents })}
                            placeholder={payment ? formatMoney(row.amountCents / 100) : ''}
                            disabled={!payment}
                            height={26}
                          />
                        </>
                      )}
                      <span style={{ fontSize: 12, color: TONE_COLOR[row.tone] }}>{row.status}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {grid && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18, fontSize: 12, color: C.textSoft }}>
            <span>Total <b style={{ color: C.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(grid.totalCents / 100)}</b></span>
            <span>Pago <b style={{ color: '#16a34a', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(grid.paidCents / 100)}</b></span>
            <span>Falta <b style={{ color: C.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(grid.remainingCents / 100)}</b></span>
          </div>
        )}
      </FloatingPanel>
    </>
  );
}
