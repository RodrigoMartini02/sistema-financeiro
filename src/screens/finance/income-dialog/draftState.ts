import type { Attachment, Income, IncomeHourType, IncomeRepeatUntil } from '../../../types/finance';
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
  amountCents: number | null;
  receiptDate: string;
  /** "Todo mês até": réplicas mensais até esse mês. */
  repeatUntil: IncomeRepeatUntil | null;
  /** Conta PJ: nome de um cliente do cadastro; vazio sem cliente. */
  client: string;
  representativeId: number | null;
  /** Venda de produto do catálogo (só em receita nova). */
  productId: string | null;
  soldQuantity: number | null;
  /** Horas a faturar de um contrato (só em receita nova). */
  contractId: number | null;
  hourType: IncomeHourType | null;
  hours: number | null;
  attachments: Attachment[];
}

export type IncomeDraftPatch = DraftPatch<IncomeDraft>;

/** Receita nova; a data vem da anterior (quem lança várias do mesmo dia não redigita). */
export function createIncomeDraft(receiptDate: string): IncomeDraft {
  return {
    key: nextDraftKey(),
    description: '',
    categoryId: null,
    amountCents: null,
    receiptDate,
    repeatUntil: null,
    client: '',
    representativeId: null,
    productId: null,
    soldQuantity: null,
    contractId: null,
    hourType: null,
    hours: null,
    attachments: [],
  };
}

/** A receita gravada, pronta para editar. */
export function incomeDraftFromIncome(income: Income): IncomeDraft {
  return {
    ...createIncomeDraft(isoToBrDate(income.data)),
    description: income.descricao,
    categoryId: income.classificacaoId ?? null,
    amountCents: toCents(income.valor),
    client: income.cliente ?? '',
    representativeId: income.representanteId ?? null,
    attachments: income.anexos ?? [],
  };
}

/** Campos com erro, por receita. */
export interface IncomeDraftErrors {
  description?: true;
  amount?: true;
  receiptDate?: true;
  client?: true;
  repeatUntil?: true;
  product?: true;
  hours?: true;
}

export type IncomeDialogState = BatchState<IncomeDraft, IncomeDraftErrors>;
export type IncomeDialogAction = BatchAction<IncomeDraft, IncomeDraftErrors>;

export function incomeDialogReducer(state: IncomeDialogState, action: IncomeDialogAction): IncomeDialogState {
  return batchReducer<IncomeDraft, IncomeDraftErrors, IncomeDialogState>(state, action);
}
