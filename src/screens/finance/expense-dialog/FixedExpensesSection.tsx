import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getActiveAccountId } from '../../../services/apiClient';
import { confirmFixedExpense, fetchPendingFixedExpenses } from '../../../services/fixedExpensesService';
import { invalidateExpenseQueries, queryKeys } from '../../../services/queryKeys';
import { C, neutralOutlineButtonStyle, saveButtonDisabledStyle, saveButtonStyle } from '../../../ui/dialogFormTokens';
import { formatCurrency } from '../formatters';
import { HEADER_GRID_CLASS, fieldStyle } from '../entry-dialog/fieldStyles';
import { columnHeaderStyle } from '../entry-dialog/GridParts';
import { buildUpdateInput, errorMessage, hasErrors, validateDraft } from './draftRules';
import type { DraftPatch } from './draftState';
import { ExpenseRow, type RowResources } from './ExpenseRow';
import { FixedExpenseManager } from './FixedExpenseManager';
import { BATCH_GRID_CLASS } from './expenseGrid';
import { isFixedMonth, mergeFixedOccurrences, selectedFixedOccurrences, type FixedOccurrenceDraft } from './fixedExpenseDrafts';

interface FixedExpensesSectionProps {
  initialMonth: string;
  visible: boolean;
  disabled: boolean;
  resources: RowResources;
  onBusyChange: (busy: boolean) => void;
}

/** As previsões não entram no lote de criação: cada confirmação atualiza seu ID existente. */
export function FixedExpensesSection({ initialMonth, visible, disabled, resources, onBusyChange }: FixedExpensesSectionProps) {
  const queryClient = useQueryClient();
  const [accountId] = useState(() => getActiveAccountId());
  const accountChanged = getActiveAccountId() !== accountId;
  const [month, setMonth] = useState(initialMonth);
  const [items, setItems] = useState<FixedOccurrenceDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [managerBusy, setManagerBusy] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const busy = saving || managerBusy;
  const pending = useQuery({
    queryKey: queryKeys.fixedExpensePending(accountId, month),
    queryFn: () => fetchPendingFixedExpenses(month, accountId),
    enabled: visible && accountId !== null && !accountChanged && isFixedMonth(month),
  });

  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    if (pending.data) setItems((current) => mergeFixedOccurrences(current, pending.data, month));
  }, [pending.data, month]);

  const current = items.filter((item) => item.month === month);
  const selected = selectedFixedOccurrences(items, month);
  const sumCents = selected.reduce((sum, item) => sum + (item.draft.amountCents ?? 0), 0);
  const rowResources = useMemo(() => ({
    ...resources, lockPurchaseDate: false,
    context: { ...resources.context, editing: true, forecast: true, savedInterest: null },
  }), [resources]);

  const update = (id: number, patch: DraftPatch) => {
    setItems((rows) => rows.map((item) => item.expense.id === id ? {
      ...item, draft: { ...item.draft, ...(typeof patch === 'function' ? patch(item.draft) : patch) }, dirty: true, errors: undefined, error: undefined,
    } : item));
  };

  const confirmSelected = async () => {
    if (busy || disabled || selected.length === 0) return;
    if (getActiveAccountId() !== accountId) { setError('A conta mudou. Abra novamente as despesas fixas.'); return; }
    const checked = selected.map((item) => ({
      ...item, errors: validateDraft(item.draft, { ...rowResources.context, savedDueDate: item.expense.dataVencimento }),
    }));
    setItems((rows) => rows.map((item) => {
      const result = checked.find((candidate) => candidate.expense.id === item.expense.id);
      return result ? { ...item, errors: result.errors, error: undefined } : item;
    }));
    const invalid = checked.find((item) => hasErrors(item.errors));
    if (invalid) { setError(`${invalid.draft.description || 'Conta selecionada'}: ${errorMessage(invalid.errors)}`); return; }
    setSaving(true);
    setError('');
    setMessage('');
    let confirmed = 0;
    let failures = 0;
    try {
      for (const item of checked) {
        if (getActiveAccountId() !== accountId) { setError('A conta mudou. As contas restantes foram mantidas pendentes.'); break; }
        try {
          await confirmFixedExpense(item.expense.id, buildUpdateInput(item.draft, { ...rowResources.context, savedDueDate: item.expense.dataVencimento }));
          confirmed++;
          setItems((rows) => rows.filter((candidate) => candidate.expense.id !== item.expense.id));
        } catch (cause) {
          failures++;
          const detail = cause instanceof Error ? cause.message : 'Não foi possível confirmar esta conta.';
          setItems((rows) => rows.map((candidate) => candidate.expense.id === item.expense.id ? { ...candidate, error: detail } : candidate));
        }
      }
      if (confirmed > 0) {
        invalidateExpenseQueries(queryClient);
        setMessage(`${confirmed} ${confirmed === 1 ? 'conta confirmada' : 'contas confirmadas'}.`);
      }
      if (failures > 0) setError(`${failures} ${failures === 1 ? 'conta não foi confirmada' : 'contas não foram confirmadas'}. Confira o motivo em cada linha.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section data-independent-save hidden={!visible} aria-label="Despesas fixas do mês" className="mt-4 border-t border-slate-200 pb-3 pt-3 dark:border-slate-700">
      {accountChanged && <p role="alert" className="px-2 text-xs text-rose-700">A conta mudou. Feche e abra novamente o lançamento para consultar as fixas dessa conta.</p>}
      <fieldset disabled={disabled || busy || accountChanged} className="min-w-0 border-0 p-0">
        <div className="flex flex-wrap items-center gap-2 px-2 pb-3 text-xs">
          <label className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
            Pendências de:
            <input type="month" min="2000-01" max="2100-12" aria-label="Mês das despesas fixas" value={month} onChange={(event) => { if (isFixedMonth(event.target.value)) { setMonth(event.target.value); setError(''); setMessage(''); } }} style={{ ...fieldStyle(), width: 148 }} />
          </label>
          <button type="button" style={neutralOutlineButtonStyle} onClick={() => void pending.refetch()}>Atualizar</button>
          <button type="button" style={neutralOutlineButtonStyle} aria-expanded={showManager} onClick={() => setShowManager((value) => !value)}>Gerenciar fixas</button>
          <span className="ml-auto text-slate-500">{selected.length} selecionada(s) · {formatCurrency(sumCents / 100)}</span>
          <button type="button" style={selected.length ? saveButtonStyle : saveButtonDisabledStyle} disabled={selected.length === 0} onClick={() => void confirmSelected()}>
            Confirmar {selected.length || ''} selecionada{selected.length === 1 ? '' : 's'}
          </button>
        </div>
        {accountId === null && <p role="alert" className="px-2 text-xs text-rose-700">Selecione uma conta para consultar as despesas fixas.</p>}
        {pending.isPending && accountId !== null && <p role="status" className="px-2 text-xs text-slate-500">Carregando previsões…</p>}
        {pending.isError && <p role="alert" className="px-2 text-xs text-rose-700 dark:text-rose-300">Não foi possível carregar as previsões. Use “Atualizar” para tentar novamente.</p>}
        {!pending.isPending && !pending.isError && current.length === 0 && <p className="px-2 text-xs text-slate-500">Nenhuma previsão pendente neste mês. Cadastre uma conta em “Cobrança › Fixa” ou consulte outro mês.</p>}
        {current.map((item) => {
          const context = { ...rowResources.context, savedDueDate: item.expense.dataVencimento };
          const credit = item.draft.paymentMethod === 'credito' && item.draft.cardId !== null;
          return (
            <div key={item.expense.id} className="mb-3 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
              <label className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={item.selected} aria-label={`Confirmar ${item.draft.description || 'despesa fixa'}`} onChange={(event) => {
                  const selected = event.target.checked;
                  setItems((rows) => rows.map((candidate) => candidate.expense.id === item.expense.id ? { ...candidate, selected } : candidate));
                }} />
                Confirmar esta conta <span className="font-normal text-slate-400">· Previsão</span>
              </label>
              <div className={`${HEADER_GRID_CLASS} ${BATCH_GRID_CLASS}`} style={{ ...columnHeaderStyle, padding: '0 8px 6px' }}>
                <span>Descrição</span><span>Categoria</span><span>Pagamento</span><span>Cobrança</span><span>Valor</span>
                <span>Compra</span><span>Vencimento</span><span style={{ paddingLeft: 9 }}>Pago em</span><span>Valor pago</span><span /><span />
              </div>
              <ExpenseRow
                draft={item.draft} variant="batch" resources={{ ...rowResources, context }} errors={item.errors}
                showSummary suggestions={null} readOnlyBilling="Fixa · Previsão" pendingInstallmentCount={null}
                invoiceLock={credit ? { reason: 'No crédito, o pagamento é registrado pela fatura depois da confirmação.', locksValueAndMethod: false, locksDueDate: false } : undefined}
                onUpdate={(patch) => update(item.expense.id, patch)} onFocus={() => {}} onSetInstallmentCount={() => {}} onCancelInstallmentCount={() => {}}
              />
              {item.error && <p role="alert" className="mt-1 text-xs text-rose-700 dark:text-rose-300">{item.error}</p>}
            </div>
          );
        })}
      </fieldset>
      {saving && <p role="status" style={{ color: C.textSoft, fontSize: 12, padding: 8 }}>Confirmando contas selecionadas…</p>}
      {message && <p role="status" className="px-2 text-xs text-emerald-700 dark:text-emerald-300">{message}</p>}
      {error && <p role="alert" className="px-2 text-xs text-rose-700 dark:text-rose-300">{error}</p>}
      {showManager && <FixedExpenseManager resources={resources} disabled={disabled || saving || accountChanged} onBusyChange={setManagerBusy} onChanged={() => void pending.refetch()} />}
    </section>
  );
}
