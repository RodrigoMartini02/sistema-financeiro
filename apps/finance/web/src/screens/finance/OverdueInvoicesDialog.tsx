import { useEffect, useState, type ReactNode } from 'react';
import { AlertCircle, CircleCheck } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IsoDateField } from '../../ui/DateField';
import { Dialog } from '../../ui/dialog';
import { C, dialogFooterStyle, fieldInputStyle, neutralOutlineButtonStyle, saveButtonStyle } from '../../ui/dialogFormTokens';
import { getActiveAccountId } from '../../services/apiClient';
import {
  fetchOverdueInvoices, payInvoicesInFull, type InvoiceBatchResult, type OverdueInvoice,
} from '../../services/cardInvoicesService';
import { invalidateExpenseQueries, queryKeys } from '../../services/queryKeys';
import { isValidPaymentDate, overdueInvoiceKey, overdueSelectionTotals, usageMonthText } from '../../utils/cardUsage';
import { getLocalTodayIso } from '../../utils/date';
import { formatCurrency, formatDate } from './formatters';

interface OverdueInvoicesDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Faturas vencidas e em aberto no sistema: marca as que já foram pagas no banco e quita cada uma no
 * total, na data que a pessoa informar (o vencimento da fatura, por padrão). O servidor refaz a conta
 * de cada fatura ao gravar; as que falharem ficam na lista com o motivo.
 */
export function OverdueInvoicesDialog({ open, onClose }: OverdueInvoicesDialogProps) {
  const queryClient = useQueryClient();
  const accountId = getActiveAccountId();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dates, setDates] = useState<Record<string, string>>({});
  const [result, setResult] = useState<InvoiceBatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = getLocalTodayIso();

  const overdue = useQuery({
    queryKey: queryKeys.overdueInvoices(accountId),
    queryFn: () => fetchOverdueInvoices(accountId),
    enabled: open,
    staleTime: 0,
  });
  const invoices = overdue.data ?? [];

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setDates({});
      setResult(null);
      setError(null);
    }
  }, [open]);

  const dateOf = (invoice: OverdueInvoice) => dates[overdueInvoiceKey(invoice)] ?? invoice.dueDate;
  const chosen = invoices.filter((invoice) => selected.has(overdueInvoiceKey(invoice)));
  const { count, totalCents } = overdueSelectionTotals(invoices, selected);
  const hasInvalidDate = chosen.some((invoice) => !isValidPaymentDate(dateOf(invoice), today));

  const pay = useMutation({
    mutationFn: () => payInvoicesInFull(chosen.map((invoice) => ({
      cardId: invoice.card.id,
      invoiceMonth: invoice.invoiceMonth.slice(0, 7),
      paymentDate: dateOf(invoice),
    }))),
    onSuccess: (response) => {
      setResult(response);
      setError(null);
      const paidKeys = new Set(response.paid.map((item) => `${item.cardId}|${item.invoiceMonthStart}`));
      setSelected((current) => new Set([...current].filter((key) => !paidKeys.has(key))));
      invalidateExpenseQueries(queryClient);
    },
    onError: () => setError('Não foi possível quitar as faturas. Tente de novo.'),
  });

  const allSelected = invoices.length > 0 && invoices.every((invoice) => selected.has(overdueInvoiceKey(invoice)));
  const busy = pay.isPending;
  const disabled = count === 0 || hasInvalidDate || busy;
  const toggle = (key: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const failedMessage = (invoice: OverdueInvoice) => result?.failed.find(
    (item) => item.cardId === invoice.card.id && item.invoiceMonthStart === invoice.invoiceMonth,
  )?.message;

  return (
    <Dialog
      open={open}
      title="Faturas vencidas"
      description="Marque as que você já pagou no banco. Cada fatura é quitada no total, na data informada."
      onClose={() => { if (!busy) onClose(); }}
      scrollBody={false}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 var(--dialog-px) 12px' }}>
          {overdue.isPending && <p style={{ fontSize: 13, color: C.textMuted }}>Carregando...</p>}
          {overdue.isError && (
            <Notice tone="danger">Não foi possível carregar as faturas vencidas.</Notice>
          )}
          {overdue.isSuccess && invoices.length === 0 && (
            <p style={{ fontSize: 13, color: C.textMuted }}>
              {result && result.paid.length > 0 ? 'Todas as faturas vencidas foram quitadas.' : 'Nenhuma fatura vencida em aberto.'}
            </p>
          )}

          {invoices.length > 0 && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px', fontSize: 12.5, color: C.textMuted }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  disabled={busy}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(invoices.map(overdueInvoiceKey)))}
                />
                Selecionar todas ({invoices.length})
              </label>
              <div style={{ borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                {invoices.map((invoice, index) => {
                  const key = overdueInvoiceKey(invoice);
                  const date = dateOf(invoice);
                  const failure = failedMessage(invoice);
                  return (
                    <div key={key} style={{ padding: '9px 12px', fontSize: 13, background: index % 2 === 1 ? C.cardBg : '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <input
                          type="checkbox"
                          checked={selected.has(key)}
                          disabled={busy}
                          onChange={() => toggle(key)}
                          aria-label={`Selecionar fatura de ${usageMonthText(invoice.invoiceMonth.slice(0, 7))} do cartão ${invoice.card.name}`}
                        />
                        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                          <div style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {invoice.card.name}{invoice.card.ownerName ? ` · ${invoice.card.ownerName}` : ''} · fatura de {usageMonthText(invoice.invoiceMonth.slice(0, 7))}
                          </div>
                          <div style={{ fontSize: 11.5, color: C.textMuted }}>
                            Venceu em {formatDate(invoice.dueDate)} · {invoice.itemCount} lançamento{invoice.itemCount !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <span style={{ fontWeight: 700, color: C.danger, flexShrink: 0 }}>{formatCurrency(invoice.openTotal)}</span>
                        <div style={{ width: 132, flexShrink: 0 }}>
                          <IsoDateField
                            value={date}
                            onChange={(iso) => setDates((current) => ({ ...current, [key]: iso }))}
                            label={`Data do pagamento da fatura de ${invoice.card.name}`}
                            required
                            height={30}
                            invalid={selected.has(key) && !isValidPaymentDate(date, today)}
                            inputStyle={{ ...fieldInputStyle, height: 30 }}
                          />
                        </div>
                      </div>
                      {selected.has(key) && !isValidPaymentDate(date, today) && (
                        <div style={{ marginTop: 4, fontSize: 11.5, color: C.danger }}>Informe uma data de pagamento válida, até hoje.</div>
                      )}
                      {failure && <div style={{ marginTop: 4, fontSize: 11.5, color: C.danger }}>Não quitada: {failure}</div>}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {result && result.paid.length > 0 && (
            <Notice tone="success">
              {result.paid.length} fatura{result.paid.length !== 1 ? 's' : ''} quitada{result.paid.length !== 1 ? 's' : ''}.
              {result.failed.length > 0 && ` ${result.failed.length} não pôde${result.failed.length !== 1 ? 'ram' : ''} ser quitada${result.failed.length !== 1 ? 's' : ''} (veja o motivo na lista).`}
            </Notice>
          )}
          {result && result.paid.length === 0 && result.failed.length > 0 && (
            <Notice tone="danger">Nenhuma fatura foi quitada. O motivo aparece em cada fatura da lista.</Notice>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
        </div>

        <div style={{ ...dialogFooterStyle, justifyContent: 'space-between' }}>
          <button type="button" onClick={onClose} disabled={busy} style={neutralOutlineButtonStyle}>Fechar</button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => pay.mutate()}
            style={{ ...saveButtonStyle, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
          >
            {busy ? 'Quitando...' : count > 0 ? `Quitar selecionadas (${count} · ${formatCurrency(totalCents / 100)})` : 'Quitar selecionadas'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function Notice({ tone, children }: { tone: 'danger' | 'success'; children: ReactNode }) {
  const danger = tone === 'danger';
  return (
    <div
      style={{
        marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: 10, padding: '10px 14px', fontSize: 13,
        border: `1px solid ${danger ? C.dangerBorder : C.successBorder}`,
        background: danger ? C.dangerBg : C.successBg,
        color: danger ? C.danger : C.success,
      }}
    >
      {danger ? <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} /> : <CircleCheck size={15} style={{ flexShrink: 0, marginTop: 2 }} />}
      <span>{children}</span>
    </div>
  );
}
