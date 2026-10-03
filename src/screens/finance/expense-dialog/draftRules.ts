// Regras puras do modal de despesa, sem React: vencimento, parcelas, situação,
// resumo, validação e montagem do que vai para a API.
import type { Cartao } from '../../../types/config';
import type {
  ExpenseCreateInput, ExpenseInstallmentInput, ExpenseUpdateInput, PaymentMethod,
} from '../../../types/finance';
import type { ExpenseDuplicateQuery } from '../../../services/expenseSuggestionsService';
import { brDateInputToIso, isoToBrDate, isoToShortBrDate } from '../../../utils/date';
import { addMonthsClamped, dateInMonth, invoiceDueDate, splitAmountInCents } from '../../../utils/expenseSchedule';
import { formatCurrency } from '../formatters';
import { formatCents, toReais } from '../entry-dialog/cents';
import { joinWithAnd, toSentence } from '../entry-dialog/sentence';
import type { StatusTone, SummaryBadge } from '../entry-dialog/SummaryLine';
import { MAX_INSTALLMENTS, MIN_INSTALLMENTS, type DraftErrors, type ExpenseDraft } from './draftState';

const MAX_INVOICE_NUMBER_LENGTH = 50;
const MONTH_ABBREVIATIONS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export interface RuleContext {
  todayIso: string;
  /** Cartões ativos que a conta pode usar. */
  cards: Cartao[];
  /**
   * Na edição: vencimento gravado, usado quando o campo fica vazio (uma parcela
   * 3/10 não pode voltar para o vencimento calculado da compra).
   */
  savedDueDate?: string;
  /** Na edição de uma parcela, a regra "vencida fora do crédito nasce paga" não vale. */
  editingInstallment?: boolean;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

export function usesCard(method: PaymentMethod): method is 'debito' | 'credito' {
  return method === 'debito' || method === 'credito';
}

/** Cartões ativos que aceitam a forma (cartão sem tipo aceita as duas). */
export function compatibleCards(cards: Cartao[], method: PaymentMethod): Cartao[] {
  if (!usesCard(method)) return [];
  return cards.filter((card) => card.ativo && (!card.tipo || card.tipo === 'ambos' || card.tipo === method));
}

export function selectedCard(draft: ExpenseDraft, cards: Cartao[]): Cartao | undefined {
  if (!usesCard(draft.paymentMethod) || draft.cardId === null) return undefined;
  return compatibleCards(cards, draft.paymentMethod).find((card) => card.id === draft.cardId);
}

/** Cartão que acompanha a forma escolhida: o atual se servir, senão o preferido, senão o primeiro compatível. */
export function cardForMethod(
  cards: Cartao[],
  method: PaymentMethod,
  currentCardId: number | null,
  preferredCardId: number | null,
): number | null {
  const compatible = compatibleCards(cards, method);
  if (compatible.length === 0) return null;
  if (currentCardId !== null && compatible.some((card) => card.id === currentCardId)) return currentCardId;
  if (preferredCardId !== null && compatible.some((card) => card.id === preferredCardId)) return preferredCardId;
  return compatible[0]!.id;
}

/** Crédito com um cartão escolhido: o vencimento vem da fatura e as parcelas viram faturas. */
export function isCreditWithCard(draft: ExpenseDraft, cards: Cartao[]): boolean {
  return draft.paymentMethod === 'credito' && selectedCard(draft, cards) !== undefined;
}

export function purchaseDateIso(draft: ExpenseDraft, todayIso: string): string {
  return brDateInputToIso(draft.purchaseDate, todayIso) || todayIso;
}

export type DueDateKind = 'manual' | 'invoice' | 'recurrence' | 'purchase';

export interface DueDate {
  date: string;
  kind: DueDateKind;
  card?: Cartao;
}

/** Vencimento que o sistema calcula quando o campo fica vazio. */
export function computedDueDate(draft: ExpenseDraft, context: RuleContext): DueDate {
  if (context.savedDueDate) return { date: context.savedDueDate, kind: 'manual' };
  const purchase = purchaseDateIso(draft, context.todayIso);
  const card = draft.paymentMethod === 'credito' ? selectedCard(draft, context.cards) : undefined;
  if (card) return { date: invoiceDueDate(purchase, card), kind: 'invoice', card };
  if (draft.billingType === 'monthly') return { date: dateInMonth(purchase, draft.recurrenceDay || 1), kind: 'recurrence' };
  return { date: purchase, kind: 'purchase' };
}

/** A data digitada manda sobre qualquer cálculo. */
export function effectiveDueDate(draft: ExpenseDraft, context: RuleContext): DueDate {
  const typed = brDateInputToIso(draft.dueDate, context.todayIso);
  return typed ? { date: typed, kind: 'manual' } : computedDueDate(draft, context);
}

// ── Parcelado ──────────────────────────────────────────────────────────────

/** Valor de cada parcela: total ÷ n com o resto na última, respeitando os ajustes feitos à mão. */
export function installmentAmounts(draft: ExpenseDraft): number[] {
  const count = draft.installmentCount;
  const split = splitAmountInCents(draft.amountCents ?? 0, count);
  const amounts: number[] = [];
  let sumBeforeLast = 0;
  for (let index = 0; index < count - 1; index++) {
    const amount = draft.installmentAdjustments[index] ?? split[index]!;
    amounts.push(amount);
    sumBeforeLast += amount;
  }
  amounts.push(draft.installmentAdjustments[count - 1] ?? (draft.amountCents ?? 0) - sumBeforeLast);
  return amounts;
}

/** O valor que a parcela teria sem o ajuste dela (para saber se o ajuste pode ser descartado). */
export function defaultInstallmentAmount(draft: ExpenseDraft, index: number): number {
  const withoutAdjustment = { ...draft.installmentAdjustments };
  delete withoutAdjustment[index];
  return installmentAmounts({ ...draft, installmentAdjustments: withoutAdjustment })[index]!;
}

export function installmentDueDate(draft: ExpenseDraft, context: RuleContext, index: number): string {
  return addMonthsClamped(effectiveDueDate(draft, context).date, index);
}

export function paidInstallmentCount(draft: ExpenseDraft): number {
  return Object.keys(draft.installmentPayments).filter((index) => Number(index) < draft.installmentCount).length;
}

export function overdueOpenCount(draft: ExpenseDraft, context: RuleContext): number {
  let count = 0;
  for (let index = 0; index < draft.installmentCount; index++) {
    if (!draft.installmentPayments[index] && installmentDueDate(draft, context, index) < context.todayIso) count++;
  }
  return count;
}

/** "Marcar vencidas como pagas": cada vencida em aberto fica paga na data do vencimento. */
export function markOverdueAsPaid(draft: ExpenseDraft, context: RuleContext): Pick<ExpenseDraft, 'installmentPayments' | 'overdueDismissed'> {
  const payments = { ...draft.installmentPayments };
  for (let index = 0; index < draft.installmentCount; index++) {
    const dueDate = installmentDueDate(draft, context, index);
    if (!payments[index] && dueDate < context.todayIso) {
      payments[index] = { paymentDate: isoToBrDate(dueDate), amountPaidCents: null };
    }
  }
  return { installmentPayments: payments, overdueDismissed: true };
}

export interface InstallmentRow {
  index: number;
  dueDate: string;
  /** Mês da fatura, no crédito: "out/26". */
  invoiceMonth: string;
  amountCents: number;
  adjusted: boolean;
  paid: boolean;
  paidAmountCents: number;
  status: string;
  tone: StatusTone;
}

export interface InstallmentGrid {
  rows: InstallmentRow[];
  totalCents: number;
  paidCents: number;
  remainingCents: number;
}

/** Linhas da grade de parcelas, com a situação de cada uma. */
export function installmentGrid(draft: ExpenseDraft, context: RuleContext): InstallmentGrid {
  const credit = isCreditWithCard(draft, context.cards);
  const amounts = installmentAmounts(draft);
  let paidCents = 0;
  let remainingCents = 0;
  let nextOpenFound = false;

  const rows = amounts.map((amountCents, index): InstallmentRow => {
    const dueDate = installmentDueDate(draft, context, index);
    const payment = draft.installmentPayments[index];
    const [year, month] = dueDate.split('-');
    const base = {
      index, dueDate, amountCents,
      invoiceMonth: `${MONTH_ABBREVIATIONS[Number(month) - 1]}/${year!.slice(2)}`,
      adjusted: draft.installmentAdjustments[index] !== undefined,
    };

    if (payment) {
      const paidAmountCents = credit ? amountCents : payment.amountPaidCents ?? amountCents;
      paidCents += paidAmountCents;
      if (credit) return { ...base, paid: true, paidAmountCents, status: 'paga', tone: 'success' };
      const parts: string[] = [];
      let late = false;
      const paymentIso = brDateInputToIso(payment.paymentDate, context.todayIso);
      if (paymentIso) {
        const days = Math.round((Date.parse(paymentIso) - Date.parse(dueDate)) / 86_400_000);
        if (days > 0) {
          parts.push(`${days} ${plural(days, 'dia', 'dias')} de atraso`);
          late = true;
        } else {
          parts.push('em dia');
        }
      }
      if (paidAmountCents > amountCents) {
        parts.push(`+ ${formatCents(paidAmountCents - amountCents)} de juros`);
        late = true;
      } else if (paidAmountCents < amountCents) {
        parts.push(`${formatCents(amountCents - paidAmountCents)} de desconto`);
      }
      return { ...base, paid: true, paidAmountCents, status: parts.join(' · ') || 'paga', tone: late ? 'warning' : 'success' };
    }

    remainingCents += amountCents;
    if (dueDate < context.todayIso) {
      return { ...base, paid: false, paidAmountCents: 0, status: credit ? 'fatura vencida' : 'vencida', tone: 'danger' };
    }
    if (!nextOpenFound) {
      nextOpenFound = true;
      return { ...base, paid: false, paidAmountCents: 0, status: credit ? 'fatura aberta' : 'próxima', tone: 'info' };
    }
    return { ...base, paid: false, paidAmountCents: 0, status: credit ? 'futura' : 'a vencer', tone: 'neutral' };
  });

  return { rows, totalCents: amounts.reduce((sum, amount) => sum + amount, 0), paidCents, remainingCents };
}

/** Aviso quando a soma das parcelas (com ajustes) não bate com o total digitado. Não impede salvar. */
export function installmentMismatch(draft: ExpenseDraft): string | null {
  if (draft.billingType !== 'installments' || !draft.amountCents) return null;
  const sum = installmentAmounts(draft).reduce((total, amount) => total + amount, 0);
  if (sum === draft.amountCents) return null;
  return `A soma das parcelas (${formatCents(sum)}) difere do valor total informado (${formatCents(draft.amountCents)}).`;
}

// ── Resumo ─────────────────────────────────────────────────────────────────

export type SummaryStatus = 'Pago' | 'Agendado' | 'Entra na fatura' | 'Com vencidas' | 'Em andamento';

/** Cor da situação na linha de resumo (modal e card do assistente). */
export const SUMMARY_TONE: Record<SummaryStatus, StatusTone> = {
  Pago: 'success',
  Agendado: 'neutral',
  'Entra na fatura': 'info',
  'Com vencidas': 'danger',
  'Em andamento': 'info',
};

export interface DraftSummary {
  status: SummaryStatus;
  dueText: string;
  totalText: string;
  badges: SummaryBadge[];
}

export function isDraftFilled(draft: ExpenseDraft): boolean {
  return draft.description.trim() !== '' || !!draft.amountCents;
}

/** Linha sob a despesa ativa: situação, vencimento, total e avisos de juros, desconto e vencidas. */
export function summarizeDraft(draft: ExpenseDraft, context: RuleContext): DraftSummary | null {
  const amount = draft.amountCents;
  if (!draft.description.trim() || !amount) return null;

  const due = effectiveDueDate(draft, context);
  const today = context.todayIso;
  const credit = draft.paymentMethod === 'credito';
  const autoPay = !context.editingInstallment;
  const firstLabel = draft.billingType === 'single' ? 'Vence ' : '1ª vence ';

  let dueText: string;
  if (due.kind === 'manual') dueText = `${firstLabel}${isoToShortBrDate(due.date)} · data informada`;
  else if (due.kind === 'invoice') dueText = `${firstLabel}${isoToShortBrDate(due.date)} · fatura ${due.card!.nome}`;
  else if (draft.billingType === 'single') {
    dueText = due.date === today ? 'Pago na hora'
      : due.date < today ? `Pago em ${isoToShortBrDate(due.date)}`
        : `Vence ${isoToShortBrDate(due.date)}`;
  } else dueText = `${firstLabel}${isoToShortBrDate(due.date)}`;

  const badges: SummaryBadge[] = [];

  if (draft.billingType === 'installments') {
    const count = draft.installmentCount;
    const amounts = installmentAmounts(draft);
    const paidCount = paidInstallmentCount(draft);
    const overdue = overdueOpenCount(draft, context);
    let nextOpen = -1;
    for (let index = 0; index < count; index++) {
      if (!draft.installmentPayments[index]) {
        nextOpen = index;
        break;
      }
    }
    const allEqual = amounts.every((value) => value === amounts[0]);
    const totalText = `${count}x`
      + (allEqual ? ` de ${formatCents(amounts[0]!)}` : '')
      + (paidCount ? ` · ${paidCount} ${plural(paidCount, 'paga', 'pagas')}` : '')
      + (nextOpen >= 0 ? ` · próxima vence ${isoToShortBrDate(installmentDueDate(draft, context, nextOpen))}` : ' · quitado')
      + ` · total ${formatCents(amount)}`;
    const status: SummaryStatus = paidCount === count ? 'Pago'
      : overdue ? 'Com vencidas'
        : credit ? 'Entra na fatura'
          : paidCount ? 'Em andamento' : 'Agendado';

    if (draft.knowsCashPrice && draft.cashPriceCents && amount > draft.cashPriceCents) {
      const interest = amount - draft.cashPriceCents;
      const percent = ((interest / draft.cashPriceCents) * 100).toFixed(1).replace('.', ',');
      badges.push({ text: `+ ${formatCents(interest)} de juros embutido (${percent}%)`, tone: 'warning' });
    }
    if (!isCreditWithCard(draft, context.cards)) {
      let interest = 0;
      let discount = 0;
      Object.entries(draft.installmentPayments).forEach(([key, payment]) => {
        const index = Number(key);
        if (index >= count || payment.amountPaidCents === null) return;
        const difference = payment.amountPaidCents - amounts[index]!;
        if (difference > 0) interest += difference;
        else discount -= difference;
      });
      if (interest) badges.push({ text: `+ ${formatCents(interest)} de multa e juros`, tone: 'warning' });
      if (discount) badges.push({ text: `${formatCents(discount)} de desconto`, tone: 'success' });
    }
    if (overdue) badges.push({ text: `${overdue} ${plural(overdue, 'vencida', 'vencidas')} em aberto`, tone: 'danger' });
    return { status, dueText, totalText, badges };
  }

  const status: SummaryStatus = credit
    ? (draft.paid ? 'Pago' : 'Entra na fatura')
    : (draft.paid || (autoPay && due.date <= today) ? 'Pago' : 'Agendado');
  if (!autoPay && due.kind !== 'manual' && draft.billingType === 'single') dueText = `Vence ${isoToShortBrDate(due.date)}`;

  const totalText = draft.billingType === 'monthly'
    ? `${formatCents(amount)} · ${credit && due.card ? `todo mês na fatura ${due.card.nome}` : `todo dia ${draft.recurrenceDay ?? 1} · 12 ocorrências`}`
    : `total ${formatCents(amount)}`;
  if (draft.paid && draft.amountPaidCents !== null) {
    if (draft.amountPaidCents > amount) badges.push({ text: `+ ${formatCents(draft.amountPaidCents - amount)} de multa e juros`, tone: 'warning' });
    else if (draft.amountPaidCents < amount) badges.push({ text: `${formatCents(amount - draft.amountPaidCents)} de desconto`, tone: 'success' });
  }
  return { status, dueText, totalText, badges };
}

export function helpText(draft: ExpenseDraft): string {
  if (draft.billingType === 'installments') return 'Marque as parcelas pagas no botão de parcelas';
  if (draft.paymentMethod === 'credito') {
    return draft.paid ? 'Pago: o limite do cartão é liberado agora' : 'Vencimento vem da fatura. Altere só se combinou outra data';
  }
  return 'Vencimento em branco: o sistema calcula';
}

/** "Última vez você pagou" e o aviso de duplicata. */
export function lastAmountText(lastAmount: number | null): string | null {
  return lastAmount !== null ? `Última vez você pagou ${formatCurrency(lastAmount)}` : null;
}

// ── Validação ──────────────────────────────────────────────────────────────

export function validateDraft(draft: ExpenseDraft, context: RuleContext): DraftErrors {
  const isInvalidOptionalDate = (text: string) => text.trim() !== '' && !brDateInputToIso(text, context.todayIso);
  const errors: DraftErrors = {};
  if (!draft.description.trim()) errors.description = true;
  if (draft.categoryId === null) errors.category = true;
  if (!draft.amountCents) errors.amount = true;
  if (draft.paymentMethod === 'credito' && compatibleCards(context.cards, 'credito').length > 0 && !selectedCard(draft, context.cards)) {
    errors.card = true;
  }
  if (!brDateInputToIso(draft.purchaseDate, context.todayIso)) errors.purchaseDate = true;
  if (isInvalidOptionalDate(draft.dueDate)) errors.dueDate = true;
  if (isInvalidOptionalDate(draft.invoiceDate) || draft.invoiceNumber.trim().length > MAX_INVOICE_NUMBER_LENGTH) {
    errors.invoiceDate = true;
  }

  if (draft.billingType === 'installments') {
    const countValid = draft.installmentCount >= MIN_INSTALLMENTS && draft.installmentCount <= MAX_INSTALLMENTS;
    const amountsValid = !draft.amountCents || installmentAmounts(draft).every((amount) => amount > 0);
    const paymentsValid = Object.values(draft.installmentPayments).every((payment) => !isInvalidOptionalDate(payment.paymentDate));
    if (!countValid || !amountsValid || !paymentsValid) errors.installments = true;
  } else if (draft.paid && isInvalidOptionalDate(draft.paymentDate)) {
    errors.paymentDate = true;
  }
  if (draft.billingType === 'monthly' && draft.paymentMethod !== 'credito'
    && (draft.recurrenceDay === null || draft.recurrenceDay < 1 || draft.recurrenceDay > 31)) {
    errors.recurrenceDay = true;
  }
  return errors;
}

export function hasErrors(errors: DraftErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Mensagem do rodapé: "Preencha descrição e valor e escolha o cartão de crédito." */
export function errorMessage(errors: DraftErrors): string {
  const clauses: string[] = [];
  const missing = [errors.description && 'descrição', errors.category && 'categoria', errors.amount && 'valor']
    .filter((item): item is string => typeof item === 'string');
  if (missing.length) clauses.push(`preencha ${joinWithAnd(missing)}`);
  if (errors.card) clauses.push('escolha o cartão de crédito');
  const invalidDates = [
    errors.purchaseDate && 'a data da compra',
    errors.dueDate && 'o vencimento',
    errors.paymentDate && 'a data do pagamento',
    errors.invoiceDate && 'a nota fiscal',
    errors.installments && 'as parcelas',
  ].filter((item): item is string => typeof item === 'string');
  if (invalidDates.length) clauses.push(`confira ${joinWithAnd(invalidDates)}`);
  if (errors.recurrenceDay) clauses.push('informe o dia do mês, de 1 a 31');
  return toSentence(clauses);
}

export const EMPTY_FORM_MESSAGE = 'Preencha descrição, categoria e valor para registrar.';

// ── Envio ──────────────────────────────────────────────────────────────────

function commonFields(draft: ExpenseDraft, context: RuleContext) {
  const invoiceNumber = draft.invoiceNumber.trim();
  return {
    description: draft.description.trim(),
    categoryId: draft.categoryId,
    paymentMethod: draft.paymentMethod,
    cardId: usesCard(draft.paymentMethod) ? draft.cardId : null,
    purchaseDate: purchaseDateIso(draft, context.todayIso),
    invoiceNumber: invoiceNumber || null,
    invoiceDate: brDateInputToIso(draft.invoiceDate, context.todayIso) || null,
    attachments: draft.attachments.length > 0 ? draft.attachments : null,
  };
}

/** Pago sem data grava o vencimento; pago sem valor, o próprio valor (o backend completa os dois). */
function singlePayment(draft: ExpenseDraft, context: RuleContext) {
  return {
    paid: draft.paid,
    paymentDate: draft.paid ? brDateInputToIso(draft.paymentDate, context.todayIso) || null : null,
    amountPaid: draft.paid && draft.amountPaidCents !== null ? toReais(draft.amountPaidCents) : null,
  };
}

/**
 * Parcelas como a grade mostra. Paga sem valor informado recebe o valor da
 * parcela; no crédito, a parcela paga é quitada na data do vencimento.
 */
export function buildInstallments(draft: ExpenseDraft, context: RuleContext): ExpenseInstallmentInput[] {
  const credit = isCreditWithCard(draft, context.cards);
  return installmentAmounts(draft).map((amountCents, index) => {
    const dueDate = installmentDueDate(draft, context, index);
    const payment = draft.installmentPayments[index];
    if (!payment) return { amount: toReais(amountCents), dueDate, paid: false, paymentDate: null, amountPaid: null };
    return {
      amount: toReais(amountCents),
      dueDate,
      paid: true,
      paymentDate: credit ? dueDate : brDateInputToIso(payment.paymentDate, context.todayIso) || dueDate,
      amountPaid: toReais(credit ? amountCents : payment.amountPaidCents ?? amountCents),
    };
  });
}

export function buildCreateInput(draft: ExpenseDraft, context: RuleContext, accountId: number | null): ExpenseCreateInput {
  const fields = { ...commonFields(draft, context), accountId };
  if (draft.billingType === 'installments') {
    return { ...fields, billingType: 'installments', installments: buildInstallments(draft, context) };
  }
  return {
    ...fields,
    billingType: draft.billingType,
    amount: toReais(draft.amountCents ?? 0),
    dueDate: effectiveDueDate(draft, context).date,
    ...singlePayment(draft, context),
  };
}

export function buildUpdateInput(draft: ExpenseDraft, context: RuleContext): ExpenseUpdateInput {
  return {
    ...commonFields(draft, context),
    amount: toReais(draft.amountCents ?? 0),
    dueDate: effectiveDueDate(draft, context).date,
    ...singlePayment(draft, context),
  };
}

/** Consulta de duplicata no servidor; null enquanto faltam descrição ou valor. */
export function duplicateQuery(draft: ExpenseDraft, excludeId: number | null): ExpenseDuplicateQuery | null {
  const description = draft.description.trim();
  if (!description || !draft.amountCents) return null;
  const installments = draft.billingType === 'installments';
  return {
    description,
    amount: toReais(installments ? installmentAmounts(draft)[0]! : draft.amountCents),
    paymentMethod: draft.paymentMethod,
    installmentCount: installments ? draft.installmentCount : null,
    excludeId,
  };
}
