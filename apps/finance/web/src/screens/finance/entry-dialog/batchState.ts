// Estado comum dos modais de lançamento em grade (despesa e receita): a linha de
// entrada, o lote, os erros por item, a mensagem do rodapé, a gravação e o aviso.
// Cada modal estende com o que é só dele.

export interface DraftBase {
  key: number;
}

let lastDraftKey = 0;

/** Chave única de cada item digitado (a do React e a dos erros). */
export function nextDraftKey(): number {
  lastDraftKey += 1;
  return lastDraftKey;
}

export type DraftPatch<TDraft> = Partial<Omit<TDraft, 'key'>> | ((draft: TDraft) => Partial<Omit<TDraft, 'key'>>);

export interface SavingProgress {
  current: number;
  total: number;
}

export interface BatchState<TDraft extends DraftBase, TErrors> {
  entry: TDraft;
  batch: TDraft[];
  errors: Record<number, TErrors>;
  footerError: string;
  /** Item do lote com o resumo aberto (a linha de entrada sempre mostra o dela). */
  activeKey: number | null;
  saving: SavingProgress | null;
  toast: string | null;
}

export type BatchAction<TDraft extends DraftBase, TErrors> =
  | { type: 'update'; key: number; patch: DraftPatch<TDraft> }
  | { type: 'showErrors'; errors: Record<number, TErrors>; message: string }
  | { type: 'moveEntryToBatch'; nextEntry: TDraft }
  | { type: 'removeFromBatch'; key: number }
  | { type: 'setActive'; key: number }
  | { type: 'savingStarted'; total: number }
  | { type: 'savingProgress'; current: number }
  | { type: 'draftSaved'; key: number; nextEntry: TDraft }
  | { type: 'savingFailed'; message: string }
  | { type: 'savingFinished'; toast: string }
  | { type: 'toastExpired' };

export function initialBatchState<TDraft extends DraftBase, TErrors>(entry: TDraft): BatchState<TDraft, TErrors> {
  return { entry, batch: [], errors: {}, footerError: '', activeKey: null, saving: null, toast: null };
}

export function withoutKey<T>(record: Record<number, T>, key: number): Record<number, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

export function findDraft<TDraft extends DraftBase>(state: BatchState<TDraft, unknown>, key: number): TDraft | undefined {
  return state.entry.key === key ? state.entry : state.batch.find((draft) => draft.key === key);
}

export function updateDraft<TDraft extends DraftBase, TState extends BatchState<TDraft, unknown>>(
  state: TState,
  key: number,
  change: (draft: TDraft) => TDraft,
): TState {
  if (state.entry.key === key) return { ...state, entry: change(state.entry) };
  return { ...state, batch: state.batch.map((draft) => (draft.key === key ? change(draft) : draft)) };
}

export function batchReducer<TDraft extends DraftBase, TErrors, TState extends BatchState<TDraft, TErrors>>(
  state: TState,
  action: BatchAction<TDraft, TErrors>,
): TState {
  switch (action.type) {
    case 'update': {
      // Mexer no item limpa o erro dele e a mensagem do rodapé.
      const updated = updateDraft<TDraft, TState>(state, action.key, (draft) => ({
        ...draft,
        ...(typeof action.patch === 'function' ? action.patch(draft) : action.patch),
      }));
      return { ...updated, errors: withoutKey(state.errors, action.key), footerError: '' };
    }

    case 'showErrors':
      return { ...state, errors: action.errors, footerError: action.message };

    case 'moveEntryToBatch':
      return { ...state, batch: [...state.batch, state.entry], entry: action.nextEntry, footerError: '', activeKey: null };

    case 'removeFromBatch':
      return {
        ...state,
        batch: state.batch.filter((draft) => draft.key !== action.key),
        errors: withoutKey(state.errors, action.key),
        footerError: '',
        activeKey: state.activeKey === action.key ? null : state.activeKey,
      };

    case 'setActive':
      return state.activeKey === action.key ? state : { ...state, activeKey: action.key };

    case 'savingStarted':
      return { ...state, saving: { current: 1, total: action.total }, footerError: '', toast: null };

    case 'savingProgress':
      return state.saving ? { ...state, saving: { ...state.saving, current: action.current } } : state;

    // Cada item gravado sai da tela na hora: se um falhar depois, só os que não
    // foram gravados continuam, e salvar de novo não duplica nada.
    case 'draftSaved':
      if (state.entry.key === action.key) {
        return { ...state, entry: action.nextEntry, errors: withoutKey(state.errors, action.key) };
      }
      return {
        ...state,
        batch: state.batch.filter((draft) => draft.key !== action.key),
        errors: withoutKey(state.errors, action.key),
        activeKey: state.activeKey === action.key ? null : state.activeKey,
      };

    case 'savingFailed':
      return { ...state, saving: null, footerError: action.message };

    case 'savingFinished':
      return { ...state, saving: null, errors: {}, footerError: '', activeKey: null, toast: action.toast };

    case 'toastExpired':
      return { ...state, toast: null };
  }
}

interface BatchErrorsOptions<TDraft extends DraftBase, TErrors> {
  batch: TDraft[];
  /** A linha de entrada, quando preenchida (vazia, ela não entra na gravação). */
  entry: TDraft | null;
  validate: (draft: TDraft) => TErrors;
  hasErrors: (errors: TErrors) => boolean;
  describe: (errors: TErrors) => string;
  /** "Despesa", "Receita": compõe "Despesa 2 do lote: …". */
  itemLabel: string;
}

/** Erros de todos os itens a gravar e a mensagem do primeiro, para o rodapé. */
export function collectBatchErrors<TDraft extends DraftBase, TErrors>({
  batch, entry, validate, hasErrors, describe, itemLabel,
}: BatchErrorsOptions<TDraft, TErrors>): { errors: Record<number, TErrors>; message: string } {
  const errors: Record<number, TErrors> = {};
  let message = '';
  batch.forEach((draft, index) => {
    const draftErrors = validate(draft);
    if (!hasErrors(draftErrors)) return;
    errors[draft.key] = draftErrors;
    if (!message) message = `${itemLabel} ${index + 1} do lote: ${describe(draftErrors).toLowerCase()}`;
  });
  if (entry) {
    const entryErrors = validate(entry);
    if (hasErrors(entryErrors)) {
      errors[entry.key] = entryErrors;
      if (!message) message = describe(entryErrors);
    }
  }
  return { errors, message };
}

interface SaveInOrderOptions<TDraft extends DraftBase, TErrors> {
  items: TDraft[];
  entryKey: number;
  /** Linha de entrada limpa que substitui a gravada. */
  nextEntry: TDraft;
  save: (draft: TDraft) => Promise<void>;
  dispatch: (action: BatchAction<TDraft, TErrors>) => void;
  itemLabel: string;
  fallbackMessage: string;
}

/**
 * Grava um item por vez, com progresso. Cada gravado sai do lote na hora; uma
 * falha para a gravação e o rodapé diz qual item falhou (já é o 1º do lote que
 * sobrou). Devolve quantos gravou e se parou numa falha.
 */
export async function saveInOrder<TDraft extends DraftBase, TErrors>({
  items, entryKey, nextEntry, save, dispatch, itemLabel, fallbackMessage,
}: SaveInOrderOptions<TDraft, TErrors>): Promise<{ saved: number; failed: boolean }> {
  dispatch({ type: 'savingStarted', total: items.length });
  for (let index = 0; index < items.length; index++) {
    const draft = items[index]!;
    dispatch({ type: 'savingProgress', current: index + 1 });
    try {
      await save(draft);
    } catch (error) {
      const message = error instanceof Error ? error.message : fallbackMessage;
      dispatch({ type: 'savingFailed', message: draft.key === entryKey ? message : `${itemLabel} 1 do lote: ${message}` });
      return { saved: index, failed: true };
    }
    dispatch({ type: 'draftSaved', key: draft.key, nextEntry });
  }
  return { saved: items.length, failed: false };
}
