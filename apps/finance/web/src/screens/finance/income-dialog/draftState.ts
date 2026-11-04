import type { AttachmentSummary } from '../../../types/attachment';
import type { Income } from '../../../types/finance';
import { isoToBrDate } from '../../../utils/date';
import {
  batchReducer, nextDraftKey, type BatchAction, type BatchState, type DraftPatch,
} from '../entry-dialog/batchState';
import { toCents } from '../entry-dialog/cents';

/**
 * Uma receita sendo digitada: a linha de entrada, um item do lote ou a receita em
 * edição. Valor em centavos e data como o texto dd/mm/aaaa do campo; a conversão
 * para reais e ISO só acontece ao montar o envio (draftRules).
 */
export interface IncomeDraft {
  key: number;
  description: string;
  categoryId: number | null;
  /** Valor bruto: o que era devido. É o campo que se digita primeiro. */
  grossCents: number | null;
  /**
   * Valor líquido: o que entrou na conta. Nulo = acompanha o bruto (sem taxa nem juros) até a pessoa
   * editá-lo; em horas de contrato com retenção ele é calculado e este campo não vale.
   */
  netCents: number | null;
  receiptDate: string;
  billingType: 'single' | 'fixed';
  endMonth: string;
  initialEndMonth?: string;
  /** Na nova fixa, define se a primeira ocorrência já foi recebida. */
  received: boolean;
  forecastId?: number;
  fixedIncomeId?: number;
  deferred?: boolean;
  dirty?: boolean;
  deferError?: string;
  originContractId?: number | null;
  clientName?: string | null;
  /** Conta PJ: cliente do cadastro; nulo sem cliente. */
  clientId: number | null;
  representativeId: number | null;
  /** Venda de produto do catálogo (só em receita nova). */
  productId: string | null;
  soldQuantity: number | null;
  /** Horas a faturar (só em receita nova): o contrato e o tipo de hora dele. */
  contractId: number | null;
  hourTypeId: number | null;
  hours: number | null;
  /** Os comprovantes já enviados ao servidor: os que a receita tinha e os que subiram nesta edição (a lista final). */
  attachments: AttachmentSummary[];
}

export type IncomeDraftPatch = DraftPatch<IncomeDraft>;

/** Receita nova; a data vem da anterior (quem lança várias do mesmo dia não redigita). */
export function createIncomeDraft(receiptDate: string): IncomeDraft {
  return {
    key: nextDraftKey(),
    description: '',
    categoryId: null,
    grossCents: null,
    netCents: null,
    receiptDate,
    billingType: 'single',
    endMonth: '',
    received: false,
    clientId: null,
    representativeId: null,
    productId: null,
    soldQuantity: null,
    contractId: null,
    hourTypeId: null,
    hours: null,
    attachments: [],
  };
}

/** A receita gravada, pronta para editar. Com retenção, o valor editado é o bruto e o líquido sai do contrato. */
export function incomeDraftFromIncome(income: Income): IncomeDraft {
  return {
    ...createIncomeDraft(isoToBrDate(income.data)),
    description: income.descricao,
    categoryId: income.classificacaoId ?? null,
    grossCents: toCents(income.valorBruto),
    // Líquido igual ao bruto continua acompanhando o bruto.
    netCents: income.valorLiquido === income.valorBruto ? null : toCents(income.valorLiquido),
    clientId: income.clienteId ?? null,
    representativeId: income.representanteId ?? null,
    attachments: income.attachments ?? [],
    billingType: income.fixedIncomeId != null ? 'fixed' : 'single',
    endMonth: income.fixedEndMonth ?? '',
    initialEndMonth: income.fixedEndMonth ?? '',
    received: income.status !== 'prevista' && income.status !== 'faturada',
    forecastId: income.status === 'prevista' || income.status === 'faturada' ? income.id : undefined,
    fixedIncomeId: income.fixedIncomeId ?? undefined,
    deferred: income.deferred === true,
    originContractId: income.contratoId ?? null,
    clientName: income.clienteNome ?? null,
  };
}

/** Campos com erro, por receita. */
export interface IncomeDraftErrors {
  description?: true;
  category?: true;
  /** Valor bruto vazio. */
  amount?: true;
  /** Valor líquido zerado ou maior que o bruto. */
  net?: true;
  receiptDate?: true;
  client?: true;
  endMonth?: true;
  fixedOrigin?: true;
  product?: true;
  hours?: true;
  /** Mais horas do que o saldo do tipo de hora. */
  hoursOverBalance?: true;
}

export type IncomeDialogState = BatchState<IncomeDraft, IncomeDraftErrors>;
export type IncomeDialogAction = BatchAction<IncomeDraft, IncomeDraftErrors>
  | { type: 'mergeForecasts'; incomes: Income[]; excludedIds: readonly number[] }
  | { type: 'setDeferred'; ids: number[]; deferred: boolean; error?: string };

export function incomeDialogReducer(state: IncomeDialogState, action: IncomeDialogAction): IncomeDialogState {
  if (action.type === 'mergeForecasts') {
    const incoming = new Map(action.incomes
      .filter(item => (item.status === 'prevista' || item.status === 'faturada') && !action.excludedIds.includes(item.id))
      .map(item => [item.id, item]));
    const present = new Set<number>();
    const batch = state.batch.flatMap(draft => {
      if (draft.forecastId === undefined) return [draft];
      const item = incoming.get(draft.forecastId);
      if (!item) return [];
      present.add(item.id);
      return [draft.dirty || draft.deferError ? draft : { ...incomeDraftFromIncome(item), key: draft.key }];
    });
    for (const item of incoming.values()) if (!present.has(item.id)) batch.push(incomeDraftFromIncome(item));
    return { ...state, batch };
  }
  if (action.type === 'setDeferred') {
    return { ...state, batch: state.batch.map(draft => draft.forecastId !== undefined && action.ids.includes(draft.forecastId)
      ? { ...draft, deferred: action.deferred, dirty: true, deferError: action.error } : draft) };
  }
  const next = batchReducer<IncomeDraft, IncomeDraftErrors, IncomeDialogState>(state, action);
  if (action.type !== 'update') return next;
  const markDirty = (draft: IncomeDraft) => draft.key === action.key ? { ...draft, dirty: true } : draft;
  return { ...next, entry: markDirty(next.entry), batch: next.batch.map(markDirty) };
}
