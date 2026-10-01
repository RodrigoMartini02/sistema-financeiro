import { useEffect, useMemo, useReducer, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Repeat, Users } from 'lucide-react';
import { FirstAccessGuideCard } from '../../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../../components/firstAccessGuideMessages';
import { GUIDE_LAYER_MODAL } from '../../../context/FirstAccessGuideContext';
import { useFirstAccessGuide } from '../../../hooks/useFirstAccessGuide';
import { getActiveAccountId } from '../../../services/apiClient';
import { fetchProdutos } from '../../../services/catalogoService';
import { fetchClientes, fetchContratosAtivos, saveCliente } from '../../../services/clientesService';
import { createIncome, updateIncome } from '../../../services/financeService';
import { fetchClassificacoesReceita, saveClassificacaoReceita } from '../../../services/incomeClassificationsService';
import { invalidateIncomeQueries, queryKeys } from '../../../services/queryKeys';
import { fetchRepresentantes } from '../../../services/representantesService';
import type { ClassificacaoReceita } from '../../../types/config';
import type { FinanceDashboardData, Income } from '../../../types/finance';
import { useOwnPermissions } from '../../../hooks/useOwnPermissions';
import { getRecentCategoryIds } from '../../../utils/categorySuggestions';
import { canManageCatalog, canReadCatalogList } from '../../../utils/screenAccess';
import { getLocalTodayIso, isoToBrDate } from '../../../utils/date';
import { collectBatchErrors, initialBatchState, saveInOrder } from '../entry-dialog/batchState';
import { EntryDialogFrame, type FooterTone } from '../entry-dialog/EntryDialogFrame';
import { HEADER_GRID_CLASS } from '../entry-dialog/fieldStyles';
import { RequiredMark, columnHeaderStyle } from '../entry-dialog/GridParts';
import { duplicateText } from '../entry-dialog/SummaryLine';
import {
  EMPTY_INCOME_MESSAGE, buildIncomeCreateInput, buildIncomeUpdateInput, hasIncomeErrors, incomeErrorMessage,
  isIncomeDraftFilled, receiptDateIso, validateIncomeDraft, type IncomeRuleContext,
} from './draftRules';
import {
  createIncomeDraft, incomeDialogReducer, incomeDraftFromIncome,
  type IncomeDraft, type IncomeDraftErrors, type IncomeDraftPatch,
} from './draftState';
import { COMPANY_GRID_CLASS, PERSONAL_GRID_CLASS } from './incomeGrid';
import { IncomeRow, type IncomeRowResources } from './IncomeRow';
import { PredictedIncomesStrip } from './PredictedIncomesStrip';
import { useIncomeSuggestions } from './useIncomeSuggestions';

const TOAST_DURATION_MS = 2800;
const INCOME_NOUN = { singular: 'receita', plural: 'receitas' };
const GUIDE_CARD_CLASS = 'w-[min(24rem,calc(100vw-2rem))]';

interface IncomeDialogProps {
  open: boolean;
  /** Receita a editar; sem ela, o modal lança receitas novas. */
  income?: Income | null;
  /** Dia clicado no calendário (ISO): vira a data do recebimento, travada na linha de entrada. */
  presetDate?: string;
  onClose: () => void;
}

/**
 * Modal de receita, no mesmo formato em grade do de despesa. Lança sempre na conta
 * ativa e toda receita nasce recebida. Numa receita nova: a linha de entrada e o
 * lote, gravados um a um, e o modal continua aberto. Na edição: uma linha só, e
 * fecha ao salvar. Cada abertura começa do zero.
 */
export function IncomeDialog({ open, income, presetDate, onClose }: IncomeDialogProps) {
  if (!open) return null;
  return <IncomeDialogContent key={income?.id ?? 'new'} income={income ?? null} presetDate={presetDate} onClose={onClose} />;
}

interface IncomeDialogContentProps {
  income: Income | null;
  presetDate?: string;
  onClose: () => void;
}

function IncomeDialogContent({ income, presetDate, onClose }: IncomeDialogContentProps) {
  const qc = useQueryClient();
  const todayIso = useMemo(() => getLocalTodayIso(), []);
  const isEdit = income !== null;
  const isCompany = localStorage.getItem('contaAtivaTipo') === 'empresa';
  const accountId = getActiveAccountId();
  const descriptionRef = useRef<HTMLInputElement>(null);

  const [state, dispatch] = useReducer(incomeDialogReducer, null, () => initialBatchState<IncomeDraft, IncomeDraftErrors>(
    income ? incomeDraftFromIncome(income) : createIncomeDraft(isoToBrDate(presetDate ?? todayIso)),
  ));

  const categoriesQuery = useQuery({
    queryKey: queryKeys.classificacoesReceita(accountId),
    queryFn: () => fetchClassificacoesReceita(accountId),
    staleTime: 60_000,
  });
  // Listas da conta empresa: só as que a pessoa pode ler (utils/screenAccess.ts).
  const permissions = useOwnPermissions() ?? {};
  const readsCompanyList = (list: 'representatives' | 'contracts' | 'products' | 'clients') =>
    isCompany && canReadCatalogList(permissions, list);
  const representativesQuery = useQuery({
    queryKey: queryKeys.representantes, queryFn: () => fetchRepresentantes(), enabled: readsCompanyList('representatives'), staleTime: 60_000,
  });
  const contractsQuery = useQuery({
    queryKey: queryKeys.contratosAtivos, queryFn: fetchContratosAtivos, enabled: readsCompanyList('contracts'), staleTime: 60_000,
  });
  const productsQuery = useQuery({
    queryKey: queryKeys.catalogoProdutos, queryFn: fetchProdutos, enabled: readsCompanyList('products'), staleTime: 60_000,
  });
  const clientsQuery = useQuery({
    queryKey: queryKeys.clientes, queryFn: fetchClientes, enabled: readsCompanyList('clients'), staleTime: 60_000,
  });

  const categories = useMemo(() => (categoriesQuery.data ?? []).filter((category) => category.ativo), [categoriesQuery.data]);
  const context: IncomeRuleContext = useMemo(() => ({
    todayIso,
    isCompany,
    representatives: representativesQuery.data ?? [],
    // Vender de uma conta o produto de outra misturaria os estoques.
    products: (productsQuery.data ?? []).filter((product) => product.ativo && (product.contaId === null || product.contaId === accountId)),
    contracts: contractsQuery.data ?? [],
    clientNames: (clientsQuery.data ?? []).map((client) => client.nome),
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

  const createCategory = async (name: string): Promise<number> => {
    const created = await saveClassificacaoReceita({ nome: name }, undefined, accountId);
    qc.setQueryData<ClassificacaoReceita[]>(queryKeys.classificacoesReceita(accountId), (current) => [...(current ?? []), created]);
    void qc.invalidateQueries({ queryKey: ['classificacoes-receita'] });
    return created.id;
  };

  const createClient = async (name: string): Promise<string> => {
    const created = await saveCliente({ nome: name, cnpj: null });
    await qc.invalidateQueries({ queryKey: queryKeys.clientes });
    return created.nome;
  };

  const resources: IncomeRowResources = {
    context,
    categories,
    recentCategoryIds,
    categoryHistory,
    lockReceiptDate: !isEdit && !!presetDate,
    createCategory: canManageCatalog(permissions, 'incomeCategories') ? createCategory : undefined,
    createClient: canManageCatalog(permissions, 'clients') ? createClient : undefined,
  };

  const requestClose = () => {
    if (!state.saving) onClose();
  };

  const addToBatch = () => {
    if (isEdit || state.saving) return;
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

  const saveNew = async () => {
    const entryFilled = isIncomeDraftFilled(state.entry);
    const items = entryFilled ? [...state.batch, state.entry] : state.batch;
    if (items.length === 0) {
      dispatch({ type: 'showErrors', errors: { [state.entry.key]: validateIncomeDraft(state.entry, context) }, message: EMPTY_INCOME_MESSAGE });
      return;
    }
    const { errors, message } = collectBatchErrors<IncomeDraft, IncomeDraftErrors>({
      batch: state.batch,
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
      save: (draft) => createIncome(buildIncomeCreateInput(draft, context, accountId)),
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
    if (state.saving) return;
    void (income ? saveEdit(income) : saveNew());
  };

  const rowHandlers = (key: number) => ({
    onUpdate: (patch: IncomeDraftPatch) => dispatch({ type: 'update', key, patch }),
    onFocus: () => dispatch({ type: 'setActive', key }),
  });

  const entry = state.entry;
  const entryFilled = isIncomeDraftFilled(entry);
  const toSaveCount = isEdit ? 1 : state.batch.length + (entryFilled ? 1 : 0);
  const entryDuplicate = entrySuggestions.duplicateCreatedAt ? duplicateText(entrySuggestions.duplicateCreatedAt) : null;
  const columnsClass = isCompany ? COMPANY_GRID_CLASS : PERSONAL_GRID_CLASS;

  let footerMessage = '';
  let footerTone: FooterTone = 'neutral';
  if (state.footerError) {
    footerMessage = state.footerError;
    footerTone = 'danger';
  } else if (entryDuplicate) {
    footerMessage = entryDuplicate;
    footerTone = 'warning';
  } else if (!isEdit && toSaveCount === 0) {
    footerMessage = EMPTY_INCOME_MESSAGE;
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

  const columnHeaders = (padding: string, required: boolean) => (
    <div className={`${HEADER_GRID_CLASS} ${columnsClass}`} style={{ ...columnHeaderStyle, padding }}>
      <span>Descrição {required && <RequiredMark />}</span>
      <span>Categoria</span>
      {isCompany && <span>Cliente</span>}
      <span>Valor {required && <RequiredMark />}</span>
      <span>Recebido em {required && <RequiredMark />}</span>
      <span>Repetir</span>
      {isCompany && <span />}
      <span /><span />
    </div>
  );

  const top = (
    <>
      {!isEdit && <PredictedIncomesStrip receiptIso={receiptDateIso(entry, todayIso) || todayIso} />}
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
    count: state.batch.length,
    sumCents: state.batch.reduce((sum, draft) => sum + (draft.amountCents ?? 0), 0),
    header: columnHeaders('10px 8px 4px', false),
    rows: state.batch.map((draft) => (
      <IncomeRow
        key={draft.key}
        draft={draft}
        variant="batch"
        resources={resources}
        errors={state.errors[draft.key]}
        showSummary={draft.key === state.activeKey}
        suggestions={draft.key === state.activeKey ? activeSuggestions : null}
        onRemove={() => dispatch({ type: 'removeFromBatch', key: draft.key })}
        {...rowHandlers(draft.key)}
      />
    )),
  } : null;

  return (
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
      canSave={toSaveCount > 0}
      saving={state.saving}
      toast={state.toast}
    />
  );
}
