import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { FixedExpense } from '../../../types/finance';
import { useConfirm } from '../../../context/ConfirmContext';
import { getActiveAccountId } from '../../../services/apiClient';
import { deactivateFixedExpense, fetchFixedExpenses, renewFixedExpense, updateFixedExpense } from '../../../services/fixedExpensesService';
import { invalidateExpenseQueries, queryKeys } from '../../../services/queryKeys';
import { C, dangerButtonStyle, neutralOutlineButtonStyle, saveButtonStyle } from '../../../ui/dialogFormTokens';
import { formatCurrency } from '../formatters';
import { HEADER_GRID_CLASS, fieldStyle } from '../entry-dialog/fieldStyles';
import { columnHeaderStyle } from '../entry-dialog/GridParts';
import { errorMessage, hasErrors, validateDraft } from './draftRules';
import type { DraftErrors, ExpenseDraft } from './draftState';
import { ExpenseRow, type RowResources } from './ExpenseRow';
import { buildFixedExpenseInput, fixedDraftFromSource } from './fixedExpenseDrafts';
import { BATCH_GRID_CLASS } from './expenseGrid';

interface FixedExpenseManagerProps {
  resources: RowResources;
  initialSourceId?: number;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
  onChanged?: () => void;
}

/** Manutenção explícita dos cadastros; nenhuma ação é executada ao abrir. */
export function FixedExpenseManager({ resources, initialSourceId, disabled = false, onBusyChange, onChanged }: FixedExpenseManagerProps) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [accountId] = useState(() => getActiveAccountId());
  const accountChanged = getActiveAccountId() !== accountId;
  const sources = useQuery({ queryKey: queryKeys.fixedExpenses(accountId), queryFn: () => fetchFixedExpenses(accountId), enabled: !accountChanged && accountId !== null });
  const [editing, setEditing] = useState<FixedExpense | null>(null);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [applyToFuture, setApplyToFuture] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [renewing, setRenewing] = useState<FixedExpense | null>(null);
  const [renewYear, setRenewYear] = useState(Number(resources.context.todayIso.slice(0, 4)));
  const [initialHandled, setInitialHandled] = useState(false);

  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    if (initialHandled || !sources.data || !initialSourceId) return;
    const source = sources.data.find((item) => item.id === initialSourceId);
    if (source) {
      setEditing(source);
      setDraft(fixedDraftFromSource(source));
    }
    setInitialHandled(true);
  }, [sources.data, initialSourceId, initialHandled]);

  const refresh = () => {
    invalidateExpenseQueries(queryClient);
    void queryClient.invalidateQueries({ queryKey: queryKeys.fixedExpenses(accountId) });
    onChanged?.();
  };

  const perform = async (work: () => Promise<void>, success: string) => {
    if (busy || disabled) return;
    if (getActiveAccountId() !== accountId) { setError('A conta mudou. Abra novamente o cadastro da despesa fixa.'); return; }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
      refresh();
      setMessage(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a despesa fixa.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft || !editing || busy || disabled) return;
    const context = { ...resources.context, editing: true, savedDueDate: editing.dueDate };
    const nextErrors = validateDraft(draft, context);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) {
      setError(errorMessage(nextErrors));
      return;
    }
    if (applyToFuture && !(await confirm({
      title: 'Atualizar previsões futuras?',
      message: 'Os dados deste cadastro serão aplicados também às previsões futuras ainda pendentes. Contas confirmadas e pagas permanecem como estão.',
      confirmLabel: 'Atualizar previsões',
    }))) return;
    await perform(async () => {
      await updateFixedExpense(editing.id, {
        ...buildFixedExpenseInput(draft, context, editing.accountId, editing.firstMonth), applyToFuture,
      });
      setEditing(null);
      setDraft(null);
    }, 'Cadastro atualizado.');
  };

  const deactivate = async (source: FixedExpense) => {
    if (!(await confirm({
      title: 'Desativar despesa fixa?',
      message: 'As previsões futuras serão canceladas. As contas já confirmadas ou pagas e o histórico serão preservados.',
      confirmLabel: 'Desativar', variant: 'danger',
    }))) return;
    await perform(async () => {
      await deactivateFixedExpense(source.id);
      if (editing?.id === source.id) { setEditing(null); setDraft(null); }
    }, 'Despesa fixa desativada.');
  };

  const renew = async () => {
    if (!renewing || !Number.isInteger(renewYear) || renewYear < 2000 || renewYear > 2100) {
      setError('Informe um ano válido.');
      return;
    }
    if (!(await confirm({
      title: `Gerar previsões para ${renewYear}?`,
      message: `Serão geradas as previsões de ${renewing.description} para o ano escolhido. Ocorrências já existentes ou canceladas não serão duplicadas.`,
      confirmLabel: 'Gerar previsões',
    }))) return;
    await perform(async () => { await renewFixedExpense(renewing.id, renewYear); setRenewing(null); }, 'Previsões geradas.');
  };

  return (
    <section data-independent-save aria-label="Cadastros de despesas fixas" className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Cadastros de despesas fixas</div>
      {accountChanged && <p role="alert" className="text-xs text-rose-700">A conta mudou. Feche e abra novamente o cadastro para continuar.</p>}
      {sources.isPending && <p className="text-xs text-slate-500">Carregando cadastros…</p>}
      {sources.isError && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">Não foi possível carregar os cadastros. <button type="button" className="underline" onClick={() => void sources.refetch()}>Tentar novamente</button></p>}
      {sources.data?.length === 0 && <p className="text-xs text-slate-500">Escolha “Fixa” em Cobrança para cadastrar sua primeira conta mensal.</p>}
      <fieldset disabled={busy || disabled || accountChanged} className="min-w-0 border-0 p-0">
        <div className="flex flex-col gap-2">
          {sources.data?.map((source) => (
            <div key={source.id} className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2 text-xs last:border-0 dark:border-slate-800">
              <span className="min-w-0 flex-1 font-medium text-slate-700 dark:text-slate-200">{source.description} <span className="font-normal text-slate-500">· {formatCurrency(source.amount)}/mês{!source.active ? ' · Inativa' : ''}</span></span>
              <button type="button" style={neutralOutlineButtonStyle} onClick={() => { setEditing(source); setDraft(fixedDraftFromSource(source)); setApplyToFuture(false); setErrors({}); setError(''); setMessage(''); }}>Editar</button>
              {source.active && <>
                <button type="button" style={neutralOutlineButtonStyle} onClick={() => { setRenewing(source); setRenewYear(source.registeredYear + 1); setError(''); }}>Renovar</button>
                <button type="button" style={dangerButtonStyle} onClick={() => void deactivate(source)}>Desativar</button>
              </>}
            </div>
          ))}
        </div>
        {renewing && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <label htmlFor="fixed-renew-year">Ano de {renewing.description}</label>
            <input id="fixed-renew-year" type="number" readOnly value={renewYear} aria-label="Próximo ano da despesa fixa" style={{ ...fieldStyle(), width: 90 }} />
            <button type="button" onClick={() => void renew()} style={saveButtonStyle}>Gerar previsões</button>
            <button type="button" onClick={() => setRenewing(null)} style={neutralOutlineButtonStyle}>Cancelar</button>
          </div>
        )}
        {editing && draft && (
          <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
            <p className="mb-2 text-xs text-slate-500">Edite o cadastro. O mês inicial ({editing.firstMonth}) e o histórico serão preservados.</p>
            <div className={`${HEADER_GRID_CLASS} ${BATCH_GRID_CLASS}`} style={{ ...columnHeaderStyle, padding: '0 8px 6px' }}>
              <span>Descrição</span><span>Categoria</span><span>Pagamento</span><span>Cobrança</span><span>Valor mensal</span>
              <span>Compra</span><span>Vencimento</span><span className="lg:col-span-2" style={{ paddingLeft: 9 }}>Confirmação de cada mês</span><span /><span />
            </div>
            <ExpenseRow
              draft={draft} variant="edit" resources={{ ...resources, lockPurchaseDate: false, context: { ...resources.context, editing: true, savedDueDate: editing.dueDate } }}
              errors={errors} showSummary suggestions={null} readOnlyBilling="Fixa" pendingInstallmentCount={null}
              onUpdate={(patch) => setDraft((current) => current ? { ...current, ...(typeof patch === 'function' ? patch(current) : patch) } : current)}
              onFocus={() => {}} onSetInstallmentCount={() => {}} onCancelInstallmentCount={() => {}}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={applyToFuture} onChange={(event) => setApplyToFuture(event.target.checked)} /> Atualizar também as previsões futuras pendentes
              </label>
              <button type="button" style={saveButtonStyle} onClick={() => void save()}>Salvar cadastro</button>
              <button type="button" style={neutralOutlineButtonStyle} onClick={() => { setEditing(null); setDraft(null); }}>Fechar edição</button>
            </div>
          </div>
        )}
      </fieldset>
      {busy && <p role="status" style={{ fontSize: 12, color: C.textSoft, marginTop: 8 }}>Salvando…</p>}
      {error && <p role="alert" className="mt-2 text-xs text-rose-700 dark:text-rose-300">{error}</p>}
      {message && <p role="status" className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{message}</p>}
    </section>
  );
}
