import { useEffect, useState } from 'react';
import { AlertCircle, CalendarClock } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog } from '../../ui/dialog';
import { C, dialogFooterStyle, neutralOutlineButtonStyle, saveButtonStyle } from '../../ui/dialogFormTokens';
import { fetchOverdueExpenses, moveOverdueExpenses, type OverdueExpense } from '../../services/financeService';
import { getActiveAccountId } from '../../services/apiClient';
import { invalidateExpenseQueries, queryKeys } from '../../services/queryKeys';
import { getLocalTodayIso } from '../../utils/date';
import { formatCurrency, formatDate } from './formatters';

const SEEN_KEY = 'despesasVencidasAvisoEm';

/** O modal abre uma vez por dia; nos outros acessos fica só o aviso discreto. */
function wasShownToday(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === getLocalTodayIso();
  } catch {
    return false;
  }
}

function markShownToday(): void {
  try {
    localStorage.setItem(SEEN_KEY, getLocalTodayIso());
  } catch {
    // Sem armazenamento, o modal só volta a abrir no próximo acesso.
  }
}

interface OverdueExpensesPromptProps {
  /** Só no mês atual e para quem pode editar lançamentos. */
  enabled: boolean;
}

/**
 * Aviso das despesas vencidas e não pagas: ao abrir o sistema no mês atual, uma vez por dia, abre a
 * lista para mover cada uma ou várias para o mês atual; fechar deixa tudo como está. Compra no
 * crédito com cartão não aparece aqui: ela se paga pela fatura.
 */
export function OverdueExpensesPrompt({ enabled }: OverdueExpensesPromptProps) {
  const queryClient = useQueryClient();
  const accountId = getActiveAccountId();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const overdue = useQuery({
    queryKey: queryKeys.despesasVencidas(accountId),
    queryFn: fetchOverdueExpenses,
    enabled,
    staleTime: 60_000,
  });
  const items = enabled ? (overdue.data ?? []) : [];

  useEffect(() => {
    if (items.length > 0 && !wasShownToday()) {
      markShownToday();
      setOpen(true);
    }
  }, [items.length]);

  const move = useMutation({
    mutationFn: (ids: number[]) => moveOverdueExpenses(ids),
    onSuccess: () => {
      invalidateExpenseQueries(queryClient);
      setSelected(new Set());
      setError(null);
    },
    onError: () => setError('Não foi possível mover. Tente de novo.'),
  });

  // Fecha sozinho quando a lista esvazia (tudo movido ou pago).
  useEffect(() => {
    if (open && overdue.isSuccess && items.length === 0) setOpen(false);
  }, [open, overdue.isSuccess, items.length]);

  if (!enabled || items.length === 0) return null;

  const toggle = (id: number) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = items.every((item) => selected.has(item.id));
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const busy = move.isPending;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-2 self-start rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
      >
        <CalendarClock size={14} aria-hidden="true" />
        {items.length} despesa{items.length !== 1 ? 's' : ''} vencida{items.length !== 1 ? 's' : ''} em aberto · {formatCurrency(total)} · revisar
      </button>

      <Dialog open={open} title="Despesas vencidas" description="Mova para o mês atual as que ainda vai pagar. Fechar não muda nada." onClose={() => setOpen(false)} scrollBody={false}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 var(--dialog-px) 12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px', fontSize: 12.5, color: C.textMuted }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)))}
              />
              Selecionar todas ({items.length})
            </label>
            <div style={{ borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              {items.map((item, index) => (
                <OverdueRow
                  key={item.id}
                  item={item}
                  striped={index % 2 === 1}
                  checked={selected.has(item.id)}
                  busy={busy}
                  onToggle={() => toggle(item.id)}
                  onMove={() => move.mutate([item.id])}
                />
              ))}
            </div>
            {error && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '10px 14px', fontSize: 13, color: C.danger }}>
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}
          </div>
          <div style={{ ...dialogFooterStyle, justifyContent: 'space-between' }}>
            <button type="button" onClick={() => setOpen(false)} style={neutralOutlineButtonStyle}>Fechar</button>
            <button
              type="button"
              disabled={selected.size === 0 || busy}
              onClick={() => move.mutate([...selected])}
              style={{ ...saveButtonStyle, opacity: selected.size === 0 || busy ? 0.5 : 1, cursor: selected.size === 0 || busy ? 'not-allowed' : 'pointer' }}
            >
              {busy ? 'Movendo...' : `Mover selecionadas${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

interface OverdueRowProps {
  item: OverdueExpense;
  striped: boolean;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
  onMove: () => void;
}

function OverdueRow({ item, striped, checked, busy, onToggle, onMove }: OverdueRowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', fontSize: 13, background: striped ? C.cardBg : '#fff' }}>
      <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Selecionar ${item.description}`} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.description}{item.installment ? ` (${item.installment})` : ''}
        </div>
        <div style={{ fontSize: 11.5, color: C.textMuted }}>
          Venceu em {formatDate(item.dueDate)}{item.categoryName ? ` · ${item.categoryName}` : ''}
        </div>
      </div>
      <span style={{ fontWeight: 700, color: C.danger, flexShrink: 0 }}>{formatCurrency(item.amount)}</span>
      <button
        type="button"
        disabled={busy}
        onClick={onMove}
        style={{ ...neutralOutlineButtonStyle, height: 28, padding: '0 12px', fontSize: 12, opacity: busy ? 0.5 : 1 }}
      >
        Mover
      </button>
    </div>
  );
}
