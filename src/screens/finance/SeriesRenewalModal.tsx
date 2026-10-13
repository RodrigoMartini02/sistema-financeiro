import { useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog } from '../../ui/dialog';
import {
  C, cardStyle, dialogFooterStyle, labelStyle, neutralOutlineButtonOffStyle, saveButtonDisabledStyle, saveButtonStyle,
} from '../../ui/dialogFormTokens';
import { getActiveAccountId } from '../../services/apiClient';
import { decideFixedIncomeRenewals, fetchFixedIncomeRenewals } from '../../services/fixedIncomeRenewalsService';
import { invalidateExpenseQueries, invalidateIncomeQueries, queryKeys } from '../../services/queryKeys';
import { decideSeriesRenewals, fetchSeriesRenewals } from '../../services/seriesRenewalsService';
import type { FixedIncomeRenewalDecision, SeriesRenewal, SeriesRenewalDecision } from '../../types/finance';
import { getPaymentMethodLabel } from './entryTable';
import { formatCurrency, formatDate } from './formatters';

interface SeriesRenewalModalProps {
  /** Seção das despesas recorrentes: com a permissão de despesas. */
  showExpenses: boolean;
  /** Seção das receitas fixas: com a permissão de receitas. */
  showIncomes: boolean;
}

interface RenewalRow {
  key: string;
  title: string;
  detail: string;
  amount: number;
}

interface Decisions {
  series: SeriesRenewalDecision[];
  fixed: FixedIncomeRenewalDecision[];
}

/** "Crédito · Nubank", "PIX". */
function paymentText(item: SeriesRenewal): string {
  const method = item.paymentMethod ? getPaymentMethodLabel(item.paymentMethod) : null;
  return [method, item.cardName].filter(Boolean).join(' · ') || '—';
}

function toggled(current: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

function RenewalSection({ label, rows, unchecked, disabled, onToggle }: {
  label: string;
  rows: RenewalRow[];
  unchecked: ReadonlySet<string>;
  disabled: boolean;
  onToggle: (key: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section style={{ ...cardStyle, padding: '10px 12px 2px' }}>
      <span style={labelStyle}>{label}</span>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
        {rows.map((row, index) => (
          <li key={row.key} style={{ borderTop: index === 0 ? 'none' : `1px solid ${C.border}` }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', cursor: disabled ? 'default' : 'pointer' }}>
              <input
                type="checkbox"
                checked={!unchecked.has(row.key)}
                onChange={() => onToggle(row.key)}
                disabled={disabled}
                className="rounded accent-[#0EC4D8] cursor-pointer disabled:opacity-40"
              />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.title}
                </span>
                <span style={{ fontSize: 11.5, color: C.textSoft }}>{row.detail}</span>
              </span>
              <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: C.text }}>{formatCurrency(row.amount)}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Renovação para o ano seguinte, ao entrar no app a partir de 1º de dezembro:
 * as despesas recorrentes que terminam em dezembro (plano
 * .plans/recorrente-ano-e-contagem.md) e as receitas fixas da pessoa (plano
 * .plans/receita-fixa-ano-previsto.md), cada seção com a permissão dela. Tudo
 * vem marcado: "Renovar selecionadas" renova as marcadas e recusa as
 * desmarcadas; "Não renovar nenhuma" recusa todas. Fechar deixa para a próxima
 * vez que o app abrir. Carregando, com erro ou sem pendência, nada aparece.
 */
export function SeriesRenewalModal({ showExpenses, showIncomes }: SeriesRenewalModalProps) {
  const qc = useQueryClient();
  const accountId = getActiveAccountId();
  const [closed, setClosed] = useState(false);
  // As desmarcadas, pela chave da linha: tudo começa marcado.
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(() => new Set());

  const seriesQuery = useQuery({
    queryKey: queryKeys.seriesRenewals(accountId),
    queryFn: fetchSeriesRenewals,
    enabled: showExpenses,
    staleTime: 10 * 60_000,
  });
  const fixedQuery = useQuery({
    queryKey: queryKeys.fixedIncomeRenewals(accountId),
    queryFn: fetchFixedIncomeRenewals,
    enabled: showIncomes,
    staleTime: 10 * 60_000,
  });

  const decideMutation = useMutation({
    mutationFn: async ({ series, fixed }: Decisions) => {
      await Promise.all([
        series.length > 0 ? decideSeriesRenewals(series) : null,
        fixed.length > 0 ? decideFixedIncomeRenewals(fixed) : null,
      ]);
    },
    onSuccess: () => {
      setClosed(true);
      invalidateExpenseQueries(qc);
      invalidateIncomeQueries(qc);
    },
    // Se uma das gravações falhou, a outra pode ter entrado: as listas refazem.
    onError: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.seriesRenewals(accountId) });
      void qc.invalidateQueries({ queryKey: queryKeys.fixedIncomeRenewals(accountId) });
    },
  });

  const seriesItems = showExpenses ? seriesQuery.data ?? [] : [];
  const fixedItems = showIncomes ? fixedQuery.data ?? [] : [];
  const seriesRows: RenewalRow[] = seriesItems.map((item) => ({
    key: `serie-${item.seriesId}`,
    title: item.description,
    detail: `${paymentText(item)} · última em ${formatDate(item.lastDueDate)}`,
    amount: item.amount,
  }));
  const fixedRows: RenewalRow[] = fixedItems.map((item) => ({
    key: `fixa-${item.fixedId}`,
    title: item.description,
    detail: `Receita fixa · dia ${item.dayOfMonth} de cada mês`,
    amount: item.amount,
  }));
  const allRows = [...seriesRows, ...fixedRows];

  const years = [...new Set([...seriesItems, ...fixedItems].map((item) => item.year))];
  const singleYear = years.length === 1 ? years[0]! : null;
  const selectedCount = allRows.filter((row) => !unchecked.has(row.key)).length;
  const saving = decideMutation.isPending;
  const savingDecline = saving && [...(decideMutation.variables?.series ?? []), ...(decideMutation.variables?.fixed ?? [])]
    .every((decision) => !decision.renew);
  const canRenew = selectedCount > 0 && !saving;

  const title = seriesRows.length > 0 && fixedRows.length > 0
    ? 'Renovar despesas e receitas'
    : fixedRows.length > 0 ? 'Renovar receitas fixas' : 'Renovar despesas recorrentes';

  function decide(renewSelected: boolean) {
    if (saving || allRows.length === 0) return;
    decideMutation.mutate({
      series: seriesItems.map((item) => ({ seriesId: item.seriesId, renew: renewSelected && !unchecked.has(`serie-${item.seriesId}`) })),
      fixed: fixedItems.map((item) => ({ fixedId: item.fixedId, renew: renewSelected && !unchecked.has(`fixa-${item.fixedId}`) })),
    });
  }

  const toggle = (key: string) => setUnchecked((current) => toggled(current, key));

  return (
    <Dialog
      open={!closed && allRows.length > 0}
      title={title}
      description={singleYear ? `Terminam em dezembro de ${singleYear - 1}` : 'Terminam em dezembro'}
      onClose={() => setClosed(true)}
      size="sm"
      scrollBody={false}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 calc(-1 * var(--dialog-px))' }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', paddingTop: 12, paddingBottom: 4 }}>
          <p style={{ margin: '0 var(--dialog-px) 10px', fontSize: 12.5, lineHeight: 1.45, color: C.textMuted }}>
            Marque o que continua {singleYear ? `em ${singleYear}` : 'no ano seguinte'}: renovar grava janeiro a dezembro.
            O que ficar desmarcado termina em dezembro e não é perguntado de novo. Se fechar, a pergunta volta na
            próxima vez que você abrir o app.
          </p>

          <RenewalSection label="DESPESAS RECORRENTES" rows={seriesRows} unchecked={unchecked} disabled={saving} onToggle={toggle} />
          <RenewalSection label="RECEITAS FIXAS" rows={fixedRows} unchecked={unchecked} disabled={saving} onToggle={toggle} />

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
