import { getActiveAccountType } from '../../../services/session';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Repeat, Users } from 'lucide-react';
import { FirstAccessGuideCard } from '../../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../../components/firstAccessGuideMessages';
import { GUIDE_LAYER_MODAL } from '@ui/context/FirstAccessGuideContext';
import { useFirstAccessGuide } from '../../../hooks/useFirstAccessGuide';
import { getActiveAccountId } from '../../../services/apiClient';
import { fetchProdutos } from '../../../services/catalogoService';
import { fetchClients, type ClientFilters } from '../../../services/clientsService';
import { fetchContractsWithHours } from '../../../services/contractsService';
import { createIncome, updateIncome } from '../../../services/financeService';
import { confirmPredictedIncome, deferIncomes, fetchPendingIncomes } from '../../../services/fixedIncomesService';
import { fetchClassificacoesReceita, saveClassificacaoReceita } from '../../../services/incomeClassificationsService';
import { invalidateIncomeQueries, queryKeys } from '../../../services/queryKeys';
import { fetchRepresentantes } from '../../../services/representantesService';
import type { ClassificacaoReceita } from '../../../types/config';
import type { FinanceDashboardData, Income } from '../../../types/finance';
import { useOwnPermissions } from '../../../hooks/useOwnPermissions';
import { usePlanFeatures } from '../../../hooks/usePlanFeatures';
import {
  createdCategoryId, getRecentCategoryIds, newCategoryFormValues, type NewCategoryRequest,
} from '../../../utils/categorySuggestions';
import { canManageCatalog, canReadCatalogList } from '../../../utils/screenAccess';
import { getLocalTodayIso, isoToBrDate } from '@ui/utils/date';
import { CONFIG_SCOPE_CLASS } from '@ui/components/configTokens';
import { C } from '@ui/components/dialogFormTokens';
import { ClientFormDialog } from '../../clients/ClientFormDialog';
import { collectBatchErrors, initialBatchState, saveInOrder } from '../entry-dialog/batchState';
import { EntryDialogFrame, type FooterTone } from '../entry-dialog/EntryDialogFrame';
import { HEADER_GRID_CLASS } from '../entry-dialog/fieldStyles';
import { RequiredMark, columnHeaderStyle } from '../entry-dialog/GridParts';
import { duplicateText } from '../entry-dialog/SummaryLine';
import {
  EMPTY_INCOME_MESSAGE, buildIncomeCreateInput, buildIncomeUpdateInput, effectiveNetCents, hasIncomeErrors, incomeErrorMessage,
  isIncomeDraftFilled, readyIncomeToSave, validateIncomeDraft, type ClientOption, type IncomeRuleContext,
} from './draftRules';
import {
  createIncomeDraft, incomeDialogReducer, incomeDraftFromIncome,
  type IncomeDraft, type IncomeDraftErrors, type IncomeDraftPatch,
} from './draftState';
import { COMPANY_GRID_CLASS, COMPANY_FORECAST_GRID_CLASS, PERSONAL_GRID_CLASS, PERSONAL_FORECAST_GRID_CLASS } from './incomeGrid';
import { IncomeRow, type IncomeRowResources } from './IncomeRow';
import { useIncomeSuggestions } from './useIncomeSuggestions';

const TOAST_DURATION_MS = 2800;
const INCOME_NOUN = { singular: 'receita', plural: 'receitas' };
const GUIDE_CARD_CLASS = 'w-[min(24rem,calc(100vw-2rem))]';
/** A mesma lista da tela de Clientes (ativos): o cache é o mesmo. */
const ACTIVE_CLIENTS: ClientFilters = { search: '', type: null, status: 'active' };

interface IncomeDialogProps {
  open: boolean;
  /** Receita a editar; sem ela, o modal lança receitas novas. */
  income?: Income | null;
  /** Dia clicado no calendário (ISO): vira a data do recebimento, travada na linha de entrada. */
  presetDate?: string;
  /** Mês consultado na tela de origem, independente da edição das datas. */
  initialMonth?: string;
  onClose: () => void;
}

/**
 * Modal de receita, no mesmo formato em grade do de despesa. Lança sempre na conta
 * ativa e toda receita nasce recebida. Numa receita nova: a linha de entrada e o
 * lote, gravados um a um, e o modal continua aberto. Na edição: uma linha só, e
 * fecha ao salvar. Cada abertura começa do zero.
 */
export function IncomeDialog({ open, income, presetDate, initialMonth, onClose }: IncomeDialogProps) {
  if (!open) return null;
  return <IncomeDialogContent key={`${income?.id ?? 'new'}:${getActiveAccountId() ?? 'none'}`}
    income={income ?? null} presetDate={presetDate} initialMonth={initialMonth} onClose={onClose} />;
}

interface IncomeDialogContentProps {
  income: Income | null;
  presetDate?: string;
  initialMonth?: string;
  onClose: () => void;
}

function IncomeDialogContent({ income, presetDate, initialMonth, onClose }: IncomeDialogContentProps) {
  const qc = useQueryClient();
  const todayIso = useMemo(() => getLocalTodayIso(), []);
  const isEdit = income !== null;
  const isCompany = getActiveAccountType() === 'empresa';
  const [accountId] = useState(() => getActiveAccountId());
  const [pendingMonth] = useState(() => initialMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(initialMonth)
    ? initialMonth : (presetDate ?? todayIso).slice(0, 7));
  const [deferBusy, setDeferBusy] = useState(false);
  const deferBusyRef = useRef(false);
  const savedForecastIds = useRef<number[]>([]);
  const descriptionRef = useRef<HTMLInputElement>(null);

  const [state, dispatch] = useReducer(incomeDialogReducer, null, () => initialBatchState<IncomeDraft, IncomeDraftErrors>(
    income ? incomeDraftFromIncome(income) : createIncomeDraft(isoToBrDate(presetDate ?? todayIso)),
  ));

  const pendingQuery = useQuery({
    queryKey: queryKeys.incomePending(accountId, pendingMonth),
    queryFn: () => fetchPendingIncomes(pendingMonth, accountId),
    enabled: !isEdit && accountId !== null && getActiveAccountId() === accountId,
  });
  useEffect(() => {
    if (pendingQuery.data && !state.saving && !deferBusy && getActiveAccountId() === accountId) {
      dispatch({ type: 'mergeForecasts', incomes: pendingQuery.data, excludedIds: savedForecastIds.current });
    }
  }, [pendingQuery.data, state.saving, deferBusy, accountId]);

  const categoriesQuery = useQuery({
    queryKey: queryKeys.classificacoesReceita(accountId),
    queryFn: () => fetchClassificacoesReceita(accountId),
    staleTime: 60_000,
  });
  // Listas da conta empresa: só as que a pessoa pode ler (utils/screenAccess.ts).
  // Contratos, produtos e clientes são do Premium; representantes ficam nos dois planos.
  const permissions = useOwnPermissions() ?? {};
  const { premium } = usePlanFeatures();
  const readsCompanyList = (list: 'representatives' | 'contracts' | 'products' | 'clients') =>
    isCompany && canReadCatalogList(permissions, list) && (premium || list === 'representatives');
  const representativesQuery = useQuery({
    queryKey: queryKeys.representantes, queryFn: () => fetchRepresentantes(), enabled: readsCompanyList('representatives'), staleTime: 60_000,
  });
  const contractsQuery = useQuery({
    queryKey: queryKeys.contractsWithHours(accountId),
    queryFn: () => fetchContractsWithHours(accountId!),
    enabled: readsCompanyList('contracts') && accountId !== null,
    staleTime: 60_000,
  });
  const productsQuery = useQuery({
    queryKey: queryKeys.catalogoProdutos(accountId),
    queryFn: () => fetchProdutos(accountId!),
    enabled: readsCompanyList('products') && accountId !== null,
    staleTime: 60_000,
  });
  const clientsQuery = useQuery({
    queryKey: queryKeys.clients(accountId, ACTIVE_CLIENTS),
    queryFn: () => fetchClients(accountId!, ACTIVE_CLIENTS),
    enabled: readsCompanyList('clients') && accountId !== null,
    staleTime: 60_000,
  });
  // "+ cadastrar" do cliente: o cadastro completo abre por cima, e a promessa devolve o cliente gravado.
  const [clientDialog, setClientDialog] = useState<{ name: string; resolve: (client: ClientOption | null) => void } | null>(null);

  const categories = useMemo(() => (categoriesQuery.data ?? []).filter((category) => category.ativo), [categoriesQuery.data]);
  const context: IncomeRuleContext = useMemo(() => ({
    todayIso,
    isCompany,
    representatives: representativesQuery.data ?? [],
    // A lista já vem só da conta da receita: vender de uma conta o produto de outra misturaria os estoques.
    products: (productsQuery.data ?? []).filter((product) => product.ativo),
    contracts: contractsQuery.data ?? [],
    clients: (clientsQuery.data ?? []).map((client) => ({ id: client.id, name: client.name })),
  }), [todayIso, isCompany, representativesQuery.data, productsQuery.data, contractsQuery.data, clientsQuery.data, accountId]);

  // Histórico já carregado pelas telas (todos os meses em cache), para "Recentes" e a sugestão de categoria.
  const categoryHistory = useMemo(() => {
    const byId = new Map<number, Income>();
    qc.getQueriesData<FinanceDashboardData>({ queryKey: ['dashboard'] })
      .forEach(([, data]) => data?.incomes.forEach((item) => byId.set(item.id, item)));
    return [...byId.values()].map((item) => ({ description: item.descricao, categoryId: item.classificacaoId }));
  }, [qc]);
  const recentCategoryIds = useMemo(() => getRecentCategoryIds(categoryHistory, categories), [categoryHistory, categories]);

  const activeBatchDraft = state.batch.find((draft) => draft.key === state.activeKey) ?? null;
  const entrySuggestions = useIncomeSuggestions(state.entry, income?.id ?? null);
  const activeSuggestions = useIncomeSuggestions(activeBatchDraft, null);

  const hoursGuide = useFirstAccessGuide('receitas:horas-v1', {
    enabled: !isEdit && isCompany && context.contracts.length > 0,
    layer: GUIDE_LAYER_MODAL,
  });
  const repeatGuide = useFirstAccessGuide('receitas:replicar-v1', { enabled: !isEdit, layer: GUIDE_LAYER_MODAL });
  const representativeGuide = useFirstAccessGuide('receitas:representante-v1', {
    enabled: isCompany && context.representatives.length > 0,
    layer: GUIDE_LAYER_MODAL,
  });

  // Linha de entrada nova (ao abrir, depois de adicionar ao lote e depois de salvar): foco na descrição.
  useEffect(() => {
    descriptionRef.current?.focus();
  }, [state.entry.key]);

  useEffect(() => {
    if (!state.toast) return;
    const timer = setTimeout(() => dispatch({ type: 'toastExpired' }), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [state.toast]);

  const createCategory = async (request: NewCategoryRequest): Promise<number> => {
    const { subcategories = [], ...created } = await saveClassificacaoReceita(newCategoryFormValues(request), undefined, accountId);
    qc.setQueryData<ClassificacaoReceita[]>(
      queryKeys.classificacoesReceita(accountId),
      (current) => [...(current ?? []), created, ...subcategories],
    );
    void qc.invalidateQueries({ queryKey: ['classificacoes-receita'] });
    return createdCategoryId(request, { ...created, subcategories });
  };

  const createClient = (name: string) => new Promise<ClientOption | null>((resolve) => setClientDialog({ name, resolve }));

  const finishClientDialog = (client: ClientOption | null) => {
    clientDialog?.resolve(client);
    setClientDialog(null);
  };

  const resources: IncomeRowResources = {
    context,
    categories,
    recentCategoryIds,
    categoryHistory,
    lockReceiptDate: !isEdit && !!presetDate,
    createCategory: canManageCatalog(permissions, 'incomeCategories') ? createCategory : undefined,
    createClient: premium && canManageCatalog(permissions, 'clients') && accountId !== null ? createClient : undefined,
    clientFallbackName: income?.clienteNome ?? null,
  };

  const requestClose = () => {
    if (!state.saving && !deferBusyRef.current) onClose();
  };

  const addToBatch = () => {
    if (isEdit || state.saving || deferBusyRef.current) return;
    const errors = validateIncomeDraft(state.entry, context);
    if (hasIncomeErrors(errors)) {
      dispatch({ type: 'showErrors', errors: { ...state.errors, [state.entry.key]: errors }, message: incomeErrorMessage(errors) });
      return;
    }
    dispatch({ type: 'moveEntryToBatch', nextEntry: createIncomeDraft(state.entry.receiptDate) });
  };

  const saveEdit = async (target: Income) => {
    const errors = validateIncomeDraft(state.entry, context);
    if (hasIncomeErrors(errors)) {
      dispatch({ type: 'showErrors', errors: { [state.entry.key]: errors }, message: incomeErrorMessage(errors) });
      return;
    }
    dispatch({ type: 'savingStarted', total: 1 });
    try {
      await updateIncome(target.id, buildIncomeUpdateInput(state.entry, context));
      invalidateIncomeQueries(qc);
      onClose();
    } catch (error) {
      dispatch({ type: 'savingFailed', message: error instanceof Error ? error.message : 'Não foi possível salvar a receita.' });
    }
  };

  const setDeferred = async (ids: number[], deferred: boolean) => {
    if (!ids.length || deferBusyRef.current || state.saving || getActiveAccountId() !== accountId) return;
    deferBusyRef.current = true;
    setDeferBusy(true);
    dispatch({ type: 'setDeferred', ids, deferred });
    try {
      await deferIncomes(ids, deferred, accountId);
      qc.setQueryData<Income[]>(queryKeys.incomePending(accountId, pendingMonth), current => current?.map(row =>
        ids.includes(row.id) ? { ...row, deferred } : row));
      dispatch({ type: 'setDeferred', ids, deferred });
    } catch (error) {
      dispatch({ type: 'setDeferred', ids, deferred: true,
        error: error instanceof Error ? error.message : 'Não foi possível gravar o adiamento. Altere a marcação para tentar novamente.' });
    } finally {
      deferBusyRef.current = false;
      setDeferBusy(false);
    }
  };

  const saveNew = async () => {
    const withoutAmount = state.batch.filter(draft => draft.forecastId !== undefined && !draft.deferred
      && (!Number.isFinite(draft.grossCents) || (draft.grossCents ?? 0) <= 0
        || !Number.isFinite(effectiveNetCents(draft, context)) || (effectiveNetCents(draft, context) ?? 0) <= 0))
      .map(draft => draft.forecastId!);
    if (withoutAmount.length) await setDeferred(withoutAmount, true);
    const batch = state.batch.filter(draft => readyIncomeToSave(draft, context));
    const entryFilled = isIncomeDraftFilled(state.entry);
    const items = entryFilled ? [...batch, state.entry] : batch;
    if (items.length === 0) {
      dispatch({ type: 'showErrors', errors: state.batch.length ? {} : { [state.entry.key]: validateIncomeDraft(state.entry, context) },
        message: state.batch.length ? 'Nenhuma receita pronta para registrar.' : EMPTY_INCOME_MESSAGE });
      return;
    }
    const { errors, message } = collectBatchErrors<IncomeDraft, IncomeDraftErrors>({
      batch,
      entry: entryFilled ? state.entry : null,
      validate: (draft) => validateIncomeDraft(draft, context),
      hasErrors: hasIncomeErrors,
      describe: incomeErrorMessage,
      itemLabel: 'Receita',
    });
    if (message) {
      dispatch({ type: 'showErrors', errors, message });
      return;
    }

    const result = await saveInOrder<IncomeDraft, IncomeDraftErrors>({
      items,
      entryKey: state.entry.key,
      nextEntry: createIncomeDraft(state.entry.receiptDate),
      save: async draft => {
        if (getActiveAccountId() !== accountId) throw new Error('A conta mudou. Feche e abra novamente o lançamento.');
        if (draft.forecastId !== undefined) {
          await confirmPredictedIncome(draft.forecastId, buildIncomeUpdateInput(draft, context));
          savedForecastIds.current.push(draft.forecastId);
        } else {
          const created = await createIncome(buildIncomeCreateInput(draft, context, accountId));
          if (created.status === 'prevista' || created.status === 'faturada') savedForecastIds.current.push(created.id);
        }
      },
      dispatch,
      itemLabel: 'Receita',
      fallbackMessage: 'Não foi possível registrar a receita.',
    });
    if (result.saved > 0) invalidateIncomeQueries(qc);
    if (!result.failed) {
      dispatch({ type: 'savingFinished', toast: items.length > 1 ? `✓ ${items.length} receitas registradas` : '✓ Receita registrada' });
    }
  };

  const save = () => {
    if (state.saving || deferBusyRef.current) return;
    if (getActiveAccountId() !== accountId) {
      dispatch({ type: 'showErrors', errors: {}, message: 'A conta mudou. Feche e abra novamente o lançamento.' });
      return;
    }
    void (income ? saveEdit(income) : saveNew());
  };

  const rowHandlers = (key: number) => ({
    onUpdate: (patch: IncomeDraftPatch) => dispatch({ type: 'update', key, patch }),
    onFocus: () => dispatch({ type: 'setActive', key }),
  });

  const entry = state.entry;
  const entryFilled = isIncomeDraftFilled(entry);
  const readyBatch = state.batch.filter(draft => readyIncomeToSave(draft, context));
  const forecasts = state.batch.filter(draft => draft.forecastId !== undefined);
  const allDeferred = forecasts.length > 0 && forecasts.every(draft => draft.deferred);
  const someDeferred = forecasts.some(draft => draft.deferred);
  const toSaveCount = isEdit ? 1 : readyBatch.length + (entryFilled ? 1 : 0);
  const entryDuplicate = entrySuggestions.duplicateCreatedAt ? duplicateText(entrySuggestions.duplicateCreatedAt) : null;
  const columnsClass = isCompany ? COMPANY_GRID_CLASS : PERSONAL_GRID_CLASS;
  const batchColumnsClass = forecasts.length ? isCompany ? COMPANY_FORECAST_GRID_CLASS : PERSONAL_FORECAST_GRID_CLASS : columnsClass;

  let footerMessage = '';
  let footerTone: FooterTone = 'neutral';
  if (state.footerError) {
    footerMessage = state.footerError;
    footerTone = 'danger';
  } else if (pendingQuery.error && !isEdit) {
    footerMessage = 'Não foi possível carregar as previstas. Feche e abra o lançamento para tentar novamente.';
    footerTone = 'danger';
  } else if (entryDuplicate) {
    footerMessage = entryDuplicate;
    footerTone = 'warning';
  } else if (!isEdit && toSaveCount === 0) {
    footerMessage = state.batch.length ? 'Nenhuma receita pronta para registrar.' : EMPTY_INCOME_MESSAGE;
  } else if (state.batch.length > 0) {
    footerMessage = entryFilled ? 'A linha de cima também entra ao salvar.' : 'Revise o lote e salve.';
  } else if (!isEdit) {
    footerMessage = 'Enter registra · Shift+Enter adiciona ao lote';
  }

  // Uma dica por vez no "⋯": a das horas primeiro, depois a do representante.
  const detailsGuide = hoursGuide.isVisible
    ? { icon: Clock, text: firstAccessGuideMessages.receitasHoras, guide: hoursGuide }
    : representativeGuide.isVisible
      ? { icon: Users, text: firstAccessGuideMessages.receitasRepresentante, guide: representativeGuide }
      : null;
  const entryGuides = isEdit ? undefined : {
    repeat: repeatGuide.isVisible ? (
      <FirstAccessGuideCard
        floating
        placement="bottom"
        className={GUIDE_CARD_CLASS}
        icon={Repeat}
        description={firstAccessGuideMessages.receitasReplicar}
        onDismiss={repeatGuide.dismiss}
        onSilenceAll={repeatGuide.silenceAll}
      />
    ) : undefined,
    details: detailsGuide ? (
      <FirstAccessGuideCard
        floating
        placement="bottom"
        className={GUIDE_CARD_CLASS}
        icon={detailsGuide.icon}
        description={detailsGuide.text}
        onDismiss={detailsGuide.guide.dismiss}
        onSilenceAll={detailsGuide.guide.silenceAll}
      />
    ) : undefined,
  };

  const columnHeaders = (padding: string, required: boolean, forecastColumn = false) => (
    <div className={`${HEADER_GRID_CLASS} ${forecastColumn ? batchColumnsClass : columnsClass}`} style={{ ...columnHeaderStyle, padding }}>
      {forecastColumn && <span className="flex flex-col gap-1 text-[10px]">Adiar<input type="checkbox" aria-label="Adiar todas as receitas previstas"
        title="Adiar todas as receitas previstas" checked={allDeferred}
        ref={node => { if (node) node.indeterminate = someDeferred && !allDeferred; }}
        disabled={deferBusy || state.saving !== null}
        onChange={event => void setDeferred(forecasts.map(draft => draft.forecastId!), event.target.checked)}
        className="h-4 w-4 accent-cyan-600" /></span>}
      <span>Descrição {required && <RequiredMark />}</span>
      <span>Categoria</span>
      {isCompany && <span>Cliente</span>}
      <span>Valor bruto {required && <RequiredMark />}</span>
      <span>Valor líquido</span>
      <span>Recebimento {required && <RequiredMark />}</span>
      <span>Repetir</span>
      {isCompany && <span />}
      <span /><span />
    </div>
  );

  const top = (
    <>
      {columnHeaders('0 8px 6px', true)}
      {/* A chave recria a linha a cada receita nova: nenhum campo guarda o texto da anterior. */}
      <IncomeRow
        key={entry.key}
        draft={entry}
        variant={isEdit ? 'edit' : 'entry'}
        resources={resources}
        errors={state.errors[entry.key]}
        showSummary
        suggestions={entrySuggestions}
        descriptionRef={descriptionRef}
        onAddToBatch={addToBatch}
        guides={entryGuides}
        {...rowHandlers(entry.key)}
      />
    </>
  );

  const batch = state.batch.length > 0 ? {
    count: readyBatch.length,
    // O que vai entrar na conta: a soma dos valores líquidos.
    sumCents: readyBatch.reduce((sum, draft) => sum + (effectiveNetCents(draft, resources.context) ?? 0), 0),
    header: <>
      {forecasts.length > 0 && <label className="flex items-center gap-2 px-2 pt-3 text-xs lg:hidden" style={{ color: C.textSoft }}>
        <input type="checkbox" aria-label="Adiar todas as receitas previstas" checked={allDeferred}
          ref={node => { if (node) node.indeterminate = someDeferred && !allDeferred; }}
          disabled={deferBusy || state.saving !== null}
          onChange={event => void setDeferred(forecasts.map(draft => draft.forecastId!), event.target.checked)} className="h-4 w-4 accent-cyan-600" />
        Adiar todas
      </label>}
      {columnHeaders('10px 8px 4px', false, forecasts.length > 0)}
    </>,
    rows: state.batch.map((draft) => (
      <IncomeRow
        key={draft.key}
        draft={draft}
        variant="batch"
        resources={{ ...resources, forecastColumn: forecasts.length > 0 }}
        errors={state.errors[draft.key]}
        showSummary={draft.key === state.activeKey}
        suggestions={draft.key === state.activeKey ? activeSuggestions : null}
        onRemove={draft.forecastId === undefined ? () => dispatch({ type: 'removeFromBatch', key: draft.key }) : undefined}
        onDefer={deferred => { if (draft.forecastId !== undefined) void setDeferred([draft.forecastId], deferred); }}
        deferDisabled={deferBusy || state.saving !== null}
        {...rowHandlers(draft.key)}
      />
    )),
  } : null;

  return (
    <>
      <EntryDialogFrame
      title={isEdit ? 'Editar receita' : 'Nova receita'}
      description="Registre uma entrada financeira"
      onRequestClose={requestClose}
      onSave={save}
      onAddToBatch={isEdit ? undefined : addToBatch}
      top={top}
      batch={batch}
      itemNoun={INCOME_NOUN}
      footerMessage={footerMessage}
      footerTone={footerTone}
      saveLabel={isEdit ? 'Salvar alterações' : toSaveCount > 1 ? `Salvar ${toSaveCount} receitas` : 'Registrar receita'}
      canSave={toSaveCount > 0 && !deferBusy}
      saving={state.saving}
      toast={state.toast}
      />
      {clientDialog && accountId !== null && (
        <div className={CONFIG_SCOPE_CLASS}>
          <ClientFormDialog
            open
            stacked
            accountId={accountId}
            initialName={clientDialog.name}
            onClose={() => finishClientDialog(null)}
            onSaved={(saved) => {
              invalidateIncomeQueries(qc);
              finishClientDialog(saved ? { id: saved.id, name: saved.name } : null);
            }}
          />
        </div>
      )}
    </>
  );
}
