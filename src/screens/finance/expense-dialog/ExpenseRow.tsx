import type { RefObject } from 'react';
import type { Categoria } from '../../../types/config';
import { isPaymentMethod } from '../../../types/finance';
import type { CardLimit } from '../../../services/cardLimitsService';
import type { ExpenseSuggestionMatch } from '../../../services/expenseSuggestionsService';
import { CategoryFloatingSelect } from '../../../ui/CategoryFloatingSelect';
import { C, formatMoney } from '../../../ui/dialogFormTokens';
import { suggestCategoryForDescription, type CategoryHistoryEntry } from '../../../utils/categorySuggestions';
import { isoToBrDate } from '../../../utils/date';
import { AttachmentsPopover } from '../entry-dialog/AttachmentsPopover';
import { toCents } from '../entry-dialog/cents';
import { DateCell } from '../entry-dialog/DateCell';
import { DescriptionField } from '../entry-dialog/DescriptionField';
import { SEPARATOR, checkboxStyle, ellipsisStyle, fieldStyle } from '../entry-dialog/fieldStyles';
import {
  AddToBatchButton, GridCell, GridRow, RemoveFromBatchButton, type RowVariant,
} from '../entry-dialog/GridParts';
import { MoneyCell } from '../entry-dialog/MoneyCell';
import { SummaryLine, duplicateText, type StatusTone } from '../entry-dialog/SummaryLine';
import { getPaymentMethodLabel } from '../entryTable';
import { BillingPopover } from './BillingPopover';
import {
  cardForMethod, computedDueDate, helpText, isDraftFilled, lastAmountText, summarizeDraft, usesCard,
  type RuleContext, type SummaryStatus,
} from './draftRules';
import type { DraftErrors, DraftPatch, ExpenseDraft } from './draftState';
import { BATCH_GRID_CLASS, ENTRY_GRID_CLASS } from './expenseGrid';
import { InstallmentsPopover } from './InstallmentsPopover';
import { PaymentMethodPopover } from './PaymentMethodPopover';
import type { DraftSuggestions } from './useExpenseSuggestions';

const SUMMARY_TONE: Record<SummaryStatus, StatusTone> = {
  Pago: 'success',
  Agendado: 'neutral',
  'Entra na fatura': 'info',
  'Com vencidas': 'danger',
  'Em andamento': 'info',
};

/** Dados que todas as linhas usam. */
export interface RowResources {
  context: RuleContext;
  categories: Categoria[];
  recentCategoryIds: number[];
  /** Despesas já carregadas na tela, para sugerir a categoria. */
  categoryHistory: CategoryHistoryEntry[];
  cardLimits: CardLimit[];
  isCompany: boolean;
  /** Calendário: a data da compra da linha de entrada vem do dia clicado. */
  lockPurchaseDate: boolean;
  /** Sem a permissão de Categorias, não há "+ cadastrar" no seletor. */
  createCategory?: (name: string) => Promise<number>;
}

export function amountLabel(draft: ExpenseDraft): string {
  if (draft.billingType === 'installments') return 'Valor total';
  return draft.billingType === 'monthly' ? 'Valor mensal' : 'Valor';
}

/** Nota fiscal da despesa na conta PJ, no painel dos comprovantes. */
function InvoiceFields({ draft, todayIso, invalid, onUpdate }: {
  draft: ExpenseDraft;
  todayIso: string;
  invalid: boolean;
  onUpdate: (patch: DraftPatch) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10, borderTop: `1px solid ${SEPARATOR}` }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
        Nota fiscal <span style={{ fontWeight: 400, color: C.textFaint }}>· opcional</span>
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 110px', gap: 6 }}>
        <input
          type="text"
          value={draft.invoiceNumber}
          onChange={(event) => onUpdate({ invoiceNumber: event.target.value.slice(0, 50) })}
          maxLength={50}
          placeholder="Número da NF"
          aria-label="Número da nota fiscal"
          style={fieldStyle()}
        />
        <DateCell
          label="Data de emissão da nota fiscal"
          value={draft.invoiceDate}
          onChange={(text) => onUpdate({ invoiceDate: text })}
          todayIso={todayIso}
          placeholder="emissão"
          invalid={invalid}
        />
      </div>
    </div>
  );
}

interface ExpenseRowProps {
  draft: ExpenseDraft;
  variant: RowVariant;
  resources: RowResources;
  errors: DraftErrors | undefined;
  showSummary: boolean;
  /** Só para a linha com o resumo aberto. */
  suggestions: DraftSuggestions | null;
  /** Edição: a cobrança só aparece ("Parcela 3/10", "Mensal"). */
  readOnlyBilling?: string;
  pendingInstallmentCount: number | null;
  descriptionRef?: RefObject<HTMLInputElement | null>;
  onUpdate: (patch: DraftPatch) => void;
  onSetInstallmentCount: (count: number, force: boolean) => void;
  onCancelInstallmentCount: () => void;
  onFocus: () => void;
  onAddToBatch?: () => void;
  onRemove?: () => void;
}

/** Uma despesa na grade: a linha de entrada, um item do lote ou a despesa em edição. */
export function ExpenseRow({
  draft, variant, resources, errors, showSummary, suggestions, readOnlyBilling, pendingInstallmentCount,
  descriptionRef, onUpdate, onSetInstallmentCount, onCancelInstallmentCount, onFocus, onAddToBatch, onRemove,
}: ExpenseRowProps) {
  const { context, categories } = resources;
  const isEntry = variant === 'entry';
  const installments = draft.billingType === 'installments';
  const matches = suggestions?.suggestions?.matches ?? [];
  const preferredCardIds = suggestions?.suggestions?.preferredCardIds ?? { debito: null, credito: null };

  const history: CategoryHistoryEntry[] = showSummary
    ? [...matches.map(({ description, categoryId }) => ({ description, categoryId })), ...resources.categoryHistory]
    : [];
  const categorySuggestion = showSummary && draft.categoryId === null
    ? suggestCategoryForDescription(draft.description, categories, history)
    : null;

  const pickMatch = (match: ExpenseSuggestionMatch) => onUpdate((current) => {
    const patch: Partial<ExpenseDraft> = { description: match.description };
    if (current.amountCents === null && match.amount > 0) patch.amountCents = toCents(match.amount);
    if (current.categoryId === null && match.categoryId !== null && categories.some((category) => category.id === match.categoryId)) {
      patch.categoryId = match.categoryId;
    }
    // A forma e o cartão do histórico só entram se a pessoa ainda não escolheu a forma.
    if (!current.paymentMethodTouched && isPaymentMethod(match.paymentMethod)) {
      const method = match.paymentMethod;
      patch.paymentMethod = method;
      patch.cardId = cardForMethod(context.cards, method, match.cardId, usesCard(method) ? preferredCardIds[method] : null);
      patch.paymentMethodTouched = true;
    }
    return patch;
  });

  const acceptCategorySuggestion = () => {
    if (categorySuggestion) onUpdate({ categoryId: categorySuggestion.id });
  };

  const togglePaid = () => onUpdate((current) => (current.paid
    ? { paid: false, paymentDate: '', amountPaidCents: null }
    : { paid: true, paymentDate: current.paymentDate || isoToBrDate(context.todayIso) }));

  const dueDatePlaceholder = isoToBrDate(computedDueDate(draft, context).date);
  const purchaseLocked = isEntry && resources.lockPurchaseDate;
  const summary = showSummary ? summarizeDraft(draft, context) : null;
  const duplicate = suggestions?.duplicateCreatedAt ? duplicateText(suggestions.duplicateCreatedAt) : null;

  return (
    <>
      <GridRow variant={variant} columnsClass={isEntry ? ENTRY_GRID_CLASS : BATCH_GRID_CLASS} onFocus={onFocus}>
        <GridCell label="Descrição" required className="col-span-2 lg:col-span-1">
          <DescriptionField
            value={draft.description}
            onChange={(text) => onUpdate({ description: text })}
            options={matches.map((match) => ({
              description: match.description, detail: getPaymentMethodLabel(match.paymentMethod), amount: match.amount,
            }))}
            onPick={(index) => pickMatch(matches[index]!)}
            onTab={categorySuggestion ? acceptCategorySuggestion : undefined}
            placeholder={isEntry ? 'Ex: Conta de luz' : 'Descrição'}
            invalid={errors?.description}
            inputRef={descriptionRef}
          />
        </GridCell>

        <GridCell label="Categoria" required className="col-span-2 lg:col-span-1">
          <CategoryFloatingSelect
            compact
            categories={categories}
            value={draft.categoryId ?? undefined}
            onChange={(id) => onUpdate({ categoryId: id ?? null })}
            onCreate={resources.createCategory}
            recentIds={resources.recentCategoryIds}
            invalid={errors?.category}
          />
        </GridCell>

        {!isEntry && (
          <GridCell label="Pagamento" className="col-span-2 lg:col-span-1">
            <PaymentMethodPopover
              variant="cell"
              draft={draft}
              cards={context.cards}
              cardLimits={resources.cardLimits}
              preferredCardIds={preferredCardIds}
              cardInvalid={!!errors?.card}
              onChange={(choice) => onUpdate(choice)}
            />
          </GridCell>
        )}

        <GridCell label="Cobrança">
          {readOnlyBilling ? (
            <span style={{ ...fieldStyle({ disabled: true }), display: 'flex', alignItems: 'center', color: C.textSoft }} title="A cobrança não muda na edição">
              <span style={ellipsisStyle}>{readOnlyBilling}</span>
            </span>
          ) : (
            <BillingPopover
              draft={draft}
              pendingInstallmentCount={pendingInstallmentCount}
              onUpdate={onUpdate}
              onSetInstallmentCount={onSetInstallmentCount}
              onCancelInstallmentCount={onCancelInstallmentCount}
            />
          )}
        </GridCell>

        <GridCell label={amountLabel(draft)} required>
          <MoneyCell
            label={amountLabel(draft)}
            valueCents={draft.amountCents}
            onChange={(cents) => onUpdate({ amountCents: cents })}
            suffix={draft.billingType === 'monthly' ? '/mês' : undefined}
            invalid={errors?.amount}
          />
        </GridCell>

        <GridCell label="Compra">
          <DateCell
            label="Data da compra"
            value={draft.purchaseDate}
            onChange={(text) => onUpdate({ purchaseDate: text })}
            todayIso={context.todayIso}
            emptyFallback={isoToBrDate(context.todayIso)}
            disabled={purchaseLocked}
            title={purchaseLocked ? 'Data definida pelo calendário' : 'Data da compra'}
            invalid={errors?.purchaseDate}
          />
        </GridCell>

        <GridCell label={installments ? '1ª vence' : 'Vencimento'}>
          <DateCell
            label="Vencimento"
            value={draft.dueDate}
            onChange={(text) => onUpdate({ dueDate: text })}
            todayIso={context.todayIso}
            placeholder={dueDatePlaceholder}
            title="Em branco, o sistema calcula"
            invalid={errors?.dueDate}
          />
        </GridCell>

        {installments ? (
          <GridCell label="Pagamento das parcelas" className="col-span-2 lg:border-l lg:border-[#dcebf1] lg:pl-2">
            <InstallmentsPopover draft={draft} context={context} onUpdate={onUpdate} />
          </GridCell>
        ) : (
          <>
            <GridCell label="Pago em" className="lg:border-l lg:border-[#dcebf1] lg:pl-2">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={draft.paid}
                  aria-label="Já foi paga"
                  title="Já foi paga"
                  onClick={togglePaid}
                  style={checkboxStyle(draft.paid)}
                >
                  {draft.paid ? '✓' : ''}
                </button>
                <DateCell
                  label="Data do pagamento"
                  value={draft.paymentDate}
                  onChange={(text) => onUpdate({ paymentDate: text })}
                  todayIso={context.todayIso}
                  placeholder={draft.paid ? 'dd/mm/aaaa' : 'não paga'}
                  disabled={!draft.paid}
                  invalid={errors?.paymentDate}
                />
              </div>
            </GridCell>
            <GridCell label="Valor pago">
              <MoneyCell
                label="Valor pago"
                valueCents={draft.amountPaidCents}
                onChange={(cents) => onUpdate({ amountPaidCents: cents })}
                placeholder={draft.paid && draft.amountCents ? formatMoney(draft.amountCents / 100) : ''}
                disabled={!draft.paid}
              />
            </GridCell>
          </>
        )}

        <div className="flex items-center lg:block">
          <AttachmentsPopover
            attachments={draft.attachments}
            onChange={(attachments) => onUpdate({ attachments })}
            label={resources.isCompany ? 'Comprovantes e nota fiscal' : 'Comprovantes'}
            highlighted={draft.invoiceNumber.trim() !== ''}
            invalid={!!errors?.invoiceDate}
          >
            {resources.isCompany && (
              <InvoiceFields draft={draft} todayIso={context.todayIso} invalid={!!errors?.invoiceDate} onUpdate={onUpdate} />
            )}
          </AttachmentsPopover>
        </div>

        <div className="flex items-center justify-end lg:block">
          {isEntry && <AddToBatchButton filled={isDraftFilled(draft)} onClick={onAddToBatch} />}
          {variant === 'batch' && <RemoveFromBatchButton onClick={onRemove} />}
        </div>
      </GridRow>

      {showSummary && (
        <SummaryLine
          content={summary && {
            status: { text: summary.status, tone: SUMMARY_TONE[summary.status] },
            detail: summary.dueText,
            total: summary.totalText,
            badges: summary.badges,
          }}
          placeholder="Preencha descrição e valor para ver vencimento e total."
          categorySuggestion={categorySuggestion}
          onAcceptCategory={acceptCategorySuggestion}
          lastAmount={lastAmountText(suggestions?.suggestions?.lastAmount ?? null)}
          duplicate={duplicate}
          help={helpText(draft)}
          compactTop={isEntry}
        />
      )}
    </>
  );
}
