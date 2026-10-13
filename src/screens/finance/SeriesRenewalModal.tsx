import { useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog } from '../../ui/dialog';
import {
  C, cardStyle, dialogFooterStyle, neutralOutlineButtonOffStyle, saveButtonDisabledStyle, saveButtonStyle,
} from '../../ui/dialogFormTokens';
import { getActiveAccountId } from '../../services/apiClient';
import { invalidateExpenseQueries, queryKeys } from '../../services/queryKeys';
import { decideSeriesRenewals, fetchSeriesRenewals } from '../../services/seriesRenewalsService';
import type { SeriesRenewal, SeriesRenewalDecision } from '../../types/finance';
import { getPaymentMethodLabel } from './entryTable';
import { formatCurrency, formatDate } from './formatters';

/** "Crédito · Nubank", "PIX". */
function paymentText(item: SeriesRenewal): string {
  const method = item.paymentMethod ? getPaymentMethodLabel(item.paymentMethod) : null;
  return [method, item.cardName].filter(Boolean).join(' · ') || '—';
}

/**
 * Renovação das séries mensais (plano .plans/recorrente-ano-e-contagem.md). De
 * 1º de dezembro a 31 de janeiro, o servidor devolve as séries do usuário que
 * terminam em dezembro e ainda não foram decididas, e o modal abre ao entrar no
 * app. Cada série vem marcada: "Renovar selecionadas" renova as marcadas e grava
 * "não renovar" nas desmarcadas; "Não renovar nenhuma" grava "não renovar" em
 * todas. Fechar deixa para a próxima vez que o app abrir. Carregando, com erro
 * ou sem série pendente, nada aparece.
 */
export function SeriesRenewalModal() {
  const qc = useQueryClient();
  const accountId = getActiveAccountId();
  const [closed, setClosed] = useState(false);
  // As desmarcadas: todas começam marcadas.
  const [unchecked, setUnchecked] = useState<ReadonlySet<number>>(() => new Set());

  const renewalsQuery = useQuery({
    queryKey: queryKeys.seriesRenewals(accountId),
    queryFn: fetchSeriesRenewals,
    staleTime: 10 * 60_000,
  });

  const decideMutation = useMutation({
    mutationFn: (decisions: SeriesRenewalDecision[]) => decideSeriesRenewals(decisions),
    onSuccess: () => {
      setClosed(true);
      invalidateExpenseQueries(qc);
    },
  });

  const items = renewalsQuery.data ?? [];
  const years = [...new Set(items.map((item) => item.year))];
  const singleYear = years.length === 1 ? years[0]! : null;
  const selectedCount = items.filter((item) => !unchecked.has(item.seriesId)).length;
  const saving = decideMutation.isPending;
  const savingDecline = saving && (decideMutation.variables ?? []).every((decision) => !decision.renew);

  function toggle(seriesId: number) {
    setUnchecked((current) => {
      const next = new Set(current);
      if (next.has(seriesId)) next.delete(seriesId);
      else next.add(seriesId);
      return next;
    });
  }

  function decide(renewSelected: boolean) {
    if (saving || items.length === 0) return;
    decideMutation.mutate(items.map((item) => ({
      seriesId: item.seriesId,
      renew: renewSelected && !unchecked.has(item.seriesId),
    })));
  }

  const canRenew = selectedCount > 0 && !saving;

  return (
    <Dialog
      open={!closed && items.length > 0}
      title="Renovar despesas recorrentes"
      description={singleYear ? `Terminam em dezembro de ${singleYear - 1}` : 'Terminam em dezembro'}
      onClose={() => setClosed(true)}
      size="sm"
      scrollBody={false}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 calc(-1 * var(--dialog-px))' }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', paddingTop: 12, paddingBottom: 4 }}>
          <p style={{ margin: '0 var(--dialog-px) 10px', fontSize: 12.5, lineHeight: 1.45, color: C.textMuted }}>
            Marque as que continuam {singleYear ? `em ${singleYear}` : 'no ano seguinte'}: renovar cria janeiro a dezembro
            na mesma série. A desmarcada termina em dezembro e não é perguntada de novo. Se fechar, a pergunta volta na
            próxima vez que você abrir o app.
          </p>

          <ul style={{ ...cardStyle, listStyle: 'none', padding: '2px 12px', display: 'flex', flexDirection: 'column' }}>
            {items.map((item, index) => (
              <li key={item.seriesId} style={{ borderTop: index === 0 ? 'none' : `1px solid ${C.border}` }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', cursor: saving ? 'default' : 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!unchecked.has(item.seriesId)}
                    onChange={() => toggle(item.seriesId)}
                    disabled={saving}
                    className="rounded accent-[#0EC4D8] cursor-pointer disabled:opacity-40"
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.description}
                    </span>
                    <span style={{ fontSize: 11.5, color: C.textSoft }}>
                      {paymentText(item)} · última em {formatDate(item.lastDueDate)}
                    </span>
                  </span>
                  <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: C.text }}>{formatCurrency(item.amount)}</span>
                </label>
              </li>
            ))}
          </ul>

          {decideMutation.isError && (
            <div
              role="alert"
              style={{
                margin: '0 var(--dialog-px) 14px', display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: 10, padding: '10px 14px',
                fontSize: 13, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, color: C.danger,
              }}
            >
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{decideMutation.error.message}</span>
            </div>
          )}
        </div>

        <div style={{ ...dialogFooterStyle, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => decide(false)}
            disabled={saving}
            style={{ ...neutralOutlineButtonOffStyle, ...(saving ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
          >
            {savingDecline ? 'Salvando…' : 'Não renovar nenhuma'}
          </button>
          <button
            type="button"
            onClick={() => decide(true)}
            disabled={!canRenew}
            style={canRenew ? saveButtonStyle : saveButtonDisabledStyle}
          >
            <RefreshCw size={14} />
            {saving && !savingDecline ? 'Renovando…' : `Renovar selecionadas (${selectedCount})`}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
