// Regras puras do menu "Cobrança" da despesa, sem React: o que cada opção oferece, o texto do botão e o que a escolha
// faz no rascunho. O BillingPopover só desenha o que daqui sai.
import type { ExpenseBillingType } from '../../../types/finance';
import type { ReductionBlock } from '../../../utils/installmentCount';
import { effectiveDueDate, type RuleContext } from './draftRules';
import { MIN_INSTALLMENTS, type DraftPatch, type ExpenseDraft } from './draftState';

/** Texto de cada opção do menu. */
export const BILLING_LABELS: Record<ExpenseBillingType, string> = {
  single: 'Não repete',
  installments: 'Parcelado',
  monthly: 'Recorrente',
  fixed: 'Fixa',
};

/** Ordem das opções no menu. */
const MENU_ORDER: readonly ExpenseBillingType[] = ['single', 'installments', 'monthly', 'fixed'];

/** O que o menu mostra e faz: os mesmos campos na linha de entrada, no lote e na edição. */
export interface BillingMenu {
  /** Opção marcada. */
  value: ExpenseBillingType;
  /** Texto do botão fechado: "Não repete", "3x", "Parcela 2/10", "Fixa", "Mensal". */
  label: string;
  /** Opções oferecidas, na ordem do menu. */
  options: readonly ExpenseBillingType[];
  onSelect: (type: ExpenseBillingType) => void;
  /** Quantidade ao lado de "Parcelado", só com ele marcado. */
  installments?: {
    value: number;
    min: number;
    disabled?: boolean;
    /** Por que a quantidade não muda ou o mínimo, abaixo das opções. */
    hint?: string;
    onChange: (count: number) => void;
  };
  /** Limite ao lado de "Fixa", só com ela marcada. */
  fixedEnd?: {
    value: string;
    /** Primeiro mês aceito (AAAA-MM); sem ele, o menor do campo. */
    min?: string;
    invalid?: boolean;
    onChange: (month: string) => void;
  };
  /** Redução do nº de parcelas que apagaria ajustes ou pagamentos marcados, esperando confirmação. */
  pendingCount?: { count: number; onConfirm: () => void; onCancel: () => void } | null;
  /** Realça o botão fechado (limite da fixa inválido). */
  invalid?: boolean;
}

/** Texto do botão fechado de uma despesa nova ou de um item do lote. */
export function billingLabel(draft: Pick<ExpenseDraft, 'billingType' | 'installmentCount'>): string {
  if (draft.billingType === 'installments') return `${draft.installmentCount}x`;
  if (draft.billingType === 'fixed') return 'Fixa';
  return draft.billingType === 'monthly' ? 'Mensal' : 'Não repete';
}

/** "Recorrente" só no crédito com cartão (canBeRecurring); a previsão e a série fixa não trocam de cobrança. */
export function draftBillingOptions(
  draft: Pick<ExpenseDraft, 'forecastId' | 'fixedExpenseId'>,
  recurringAvailable: boolean,
): readonly ExpenseBillingType[] {
  if (draft.forecastId !== undefined || draft.fixedExpenseId !== undefined) return ['fixed'];
  return MENU_ORDER.filter((type) => type !== 'monthly' || recurringAvailable);
}

/** Primeiro mês do limite da fixa nova: o do vencimento. A série que já existe não tem piso (o servidor decide). */
export function fixedEndMinimum(draft: ExpenseDraft, context: RuleContext): string | undefined {
  return draft.fixedExpenseId !== undefined ? undefined : effectiveDueDate(draft, context).date.slice(0, 7);
}

export interface DraftBillingHandlers {
  onUpdate: (patch: DraftPatch) => void;
  onSetInstallmentCount: (count: number, force: boolean) => void;
  onCancelInstallmentCount: () => void;
}

/** O menu da linha de entrada e dos itens do lote: tudo sai do próprio rascunho. */
export function draftBillingMenu(
  draft: ExpenseDraft,
  context: RuleContext,
  view: { recurringAvailable: boolean; pendingCount: number | null; endMonthInvalid: boolean },
  handlers: DraftBillingHandlers,
): BillingMenu {
  const { pendingCount } = view;
  return {
    value: draft.billingType,
    label: billingLabel(draft),
    options: draftBillingOptions(draft, view.recurringAvailable),
    // Marcar a opção que já está marcada não muda nada (nem suja a previsão do lote).
    onSelect: (type) => { if (type !== draft.billingType) handlers.onUpdate({ billingType: type }); },
    installments: {
      value: draft.installmentCount,
      min: MIN_INSTALLMENTS,
      onChange: (count) => handlers.onSetInstallmentCount(count, false),
    },
    fixedEnd: {
      value: draft.endMonth ?? '',
      min: fixedEndMinimum(draft, context),
      invalid: view.endMonthInvalid,
      onChange: (endMonth) => handlers.onUpdate({ endMonth }),
    },
    pendingCount: pendingCount === null ? null : {
      count: pendingCount,
      onConfirm: () => handlers.onSetInstallmentCount(pendingCount, true),
      onCancel: handlers.onCancelInstallmentCount,
    },
    invalid: view.endMonthInvalid && draft.billingType === 'fixed',
  };
}

// ── Edição: a despesa gravada não troca de cobrança livremente ─────────────

/**
 * Opções da despesa única em edição: ela segue única, pode virar parcelada ou fixa, conforme o que o servidor aceita.
 * O rascunho continua "Não repete" ou "Fixa"; o nº de parcelas fica à parte (nulo = continua única).
 */
export function editBillingOptions(offers: { installments: boolean; fixed: boolean }): readonly ExpenseBillingType[] {
  return [
    'single',
    ...(offers.installments ? ['installments' as const] : []),
    ...(offers.fixed ? ['fixed' as const] : []),
  ];
}

/** Rodapé da edição da despesa única quando o menu oferece mais que "Não repete". */
export function editBillingNote(offers: { installments: boolean; fixed: boolean }): string {
  const target = offers.installments && offers.fixed ? 'parcelada ou fixa' : offers.installments ? 'parcelada' : 'fixa';
  return `No menu Cobrança, esta despesa pode virar ${target}. Depois disso, a cobrança só muda excluindo e lançando de novo.`;
}

/** Opção marcada na edição da despesa única. */
export function editBillingValue(
  draftBillingType: ExpenseBillingType,
  installmentCount: number | null,
): 'single' | 'installments' | 'fixed' {
  if (draftBillingType === 'fixed') return 'fixed';
  return installmentCount !== null ? 'installments' : 'single';
}

/** Texto do botão fechado na edição da despesa única. */
export function editBillingText(value: 'single' | 'installments' | 'fixed', installmentCount: number | null): string {
  if (value === 'fixed') return 'Fixa';
  return value === 'installments' && installmentCount !== null ? `${installmentCount}x` : 'Não repete';
}

/** O que escolher uma opção faz na edição: a cobrança do rascunho e o nº de parcelas em que ela se divide. */
export function pickEditBilling(
  type: ExpenseBillingType,
  currentCount: number | null,
): { billingType: 'single' | 'fixed'; installmentCount: number | null } {
  if (type === 'fixed') return { billingType: 'fixed', installmentCount: null };
  if (type === 'installments') return { billingType: 'single', installmentCount: currentCount ?? MIN_INSTALLMENTS };
  return { billingType: 'single', installmentCount: null };
}

/** O texto abaixo da quantidade ao parcelar a despesa única: a paga divide o valor e o pagamento entre as parcelas. */
export function singleCountHint(paid: boolean): string | undefined {
  return paid ? 'Despesa paga: o valor é o total da compra e o pagamento se divide entre as parcelas.' : undefined;
}

/** O texto abaixo da linha do "Parcelado" na edição da parcelada: por que a quantidade não muda, ou o mínimo. */
export function seriesCountHint(input: {
  /** As parcelas da compra já chegaram do servidor. */
  loaded: boolean;
  /** O alcance "Todas" está escolhido. */
  scopeIsAll: boolean;
  /** A parcela foi gerada pelo pagamento da fatura. */
  generated: boolean;
  block: ReductionBlock | null;
  shown: number;
}): string | undefined {
  if (!input.loaded) return undefined;
  if (input.generated) return 'A parcela gerada pelo pagamento da fatura não muda de número.';
  if (!input.scopeIsAll) return 'Para mudar o número de parcelas, escolha "Todas" em "Aplicar a".';
  if (input.block && input.shown <= input.block.minimum) {
    return `Mínimo ${input.block.minimum}: a parcela ${input.block.minimum} ${input.block.reason}.`;
  }
  return 'Só entram ou saem parcelas em aberto.';
}
