import { useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Trash2 } from 'lucide-react';
import type { Categoria } from '../../../types/config';
import { isPaymentMethod } from '../../../types/finance';
import type { CardLimit } from '../../../services/cardLimitsService';
import type { ExpenseSuggestionMatch } from '../../../services/expenseSuggestionsService';
import { CategoryFloatingSelect } from '../../../ui/CategoryFloatingSelect';
import { C, formatMoney } from '../../../ui/dialogFormTokens';
import { FloatingPanel } from '../../../ui/FloatingPanel';
import { suggestCategoryForDescription, type CategoryHistoryEntry } from '../../../utils/categorySuggestions';
import { isoToBrDate } from '../../../utils/date';
import { getPaymentMethodLabel } from '../entryTable';
import { formatCurrency } from '../formatters';
import { AttachmentsPopover } from './AttachmentsPopover';
import { BillingPopover } from './BillingPopover';
import { DateCell } from './DateCell';
import {
  cardForMethod, computedDueDate, duplicateText, helpText, lastAmountText, summarizeDraft, usesCard, type RuleContext,
} from './draftRules';
import type { DraftErrors, DraftPatch, ExpenseDraft } from './draftState';
import { InstallmentsPopover } from './InstallmentsPopover';
import { MoneyCell } from './MoneyCell';
import { PaymentMethodPopover } from './PaymentMethodPopover';
import { RowSummary } from './RowSummary';
import type { DraftSuggestions } from './useExpenseSuggestions';
import { BATCH_GRID_CLASS, ENTRY_GRID_CLASS, checkboxStyle, ellipsisStyle, fieldStyle } from './fieldStyles';

export type RowVariant = 'entry' | 'batch' | 'edit';

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
  createCategory: (name: string) => Promise<number>;
}

export function amountLabel(draft: ExpenseDraft): string {
  if (draft.billingType === 'installments') return 'Valor total';
  return draft.billingType === 'monthly' ? 'Valor mensal' : 'Valor';
}

/** Rótulo de cada campo, visível só abaixo de 1024px (no desktop o cabeçalho das colunas faz esse papel). */
function Cell({ label, required = false, className = '', children }: { label?: string; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      {label && (
        <span className="lg:hidden" style={{ fontSize: 11, fontWeight: 600, color: C.chipOffText }}>
          {label}{required && <span style={{ color: C.danger }}> *</span>}
        </span>
      )}
      {children}
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
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const ownDescriptionRef = useRef<HTMLInputElement>(null);
  const inputRef = descriptionRef ?? ownDescriptionRef;

  const isEntry = variant === 'entry';
  const installments = draft.billingType === 'installments';
  const matches = suggestions?.suggestions?.matches ?? [];
  const showAutocomplete = autocompleteOpen && matches.length > 0 && draft.description.trim().length >= 2;
  const preferredCardIds = suggestions?.suggestions?.preferredCardIds ?? { debito: null, credito: null };

  const history: CategoryHistoryEntry[] = showSummary
    ? [...matches.map(({ description, categoryId }) => ({ description, categoryId })), ...resources.categoryHistory]
    : [];
  const categorySuggestion = showSummary && draft.categoryId === null
    ? suggestCategoryForDescription(draft.description, categories, history)
    : null;

  const pickMatch = (match: ExpenseSuggestionMatch) => {
    setAutocompleteOpen(false);
    onUpdate((current) => {
      const patch: Partial<ExpenseDraft> = { description: match.description };
      if (current.amountCents === null && match.amount > 0) patch.amountCents = Math.round(match.amount * 100);
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
  };

  const acceptCategorySuggestion = () => {
    if (categorySuggestion) onUpdate({ categoryId: categorySuggestion.id });
  };

  const handleDescriptionKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (showAutocomplete) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlighted((index) => (index + 1) % matches.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlighted((index) => (index <= 0 ? matches.length - 1 : index - 1));
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        pickMatch(matches[highlighted] ?? matches[0]!);
        return;
      }
    }
    // Tab aceita a categoria sugerida e segue para o próximo campo.
    if (event.key === 'Tab' && !event.shiftKey && categorySuggestion) {
      setAutocompleteOpen(false);
      acceptCategorySuggestion();
    }
  };

  const togglePaid = () => onUpdate((current) => (current.paid
    ? { paid: false, paymentDate: '', amountPaidCents: null }
    : { paid: true, paymentDate: current.paymentDate || isoToBrDate(context.todayIso) }));

  const filled = draft.description.trim() !== '' || !!draft.amountCents;
  const dueDatePlaceholder = isoToBrDate(computedDueDate(draft, context).date);
  const purchaseLocked = isEntry && resources.lockPurchaseDate;
  const summary = showSummary ? summarizeDraft(draft, context) : null;
  const duplicate = suggestions?.duplicateCreatedAt ? duplicateText(suggestions.duplicateCreatedAt) : null;

  return (
    <>
      <div
        onFocus={onFocus}
        data-entry-row={isEntry ? '' : undefined}
        className={[
          'grid grid-cols-2 items-end gap-2 lg:items-center lg:gap-x-1.5 lg:gap-y-0 xl:gap-x-2',
          isEntry ? ENTRY_GRID_CLASS : BATCH_GRID_CLASS,
          isEntry ? '' : 'max-lg:shadow-[inset_0_0_0_1px_#eef2f6]',
        ].join(' ')}
        style={{
          padding: isEntry ? 8 : '5px 8px', borderRadius: 10,
          background: isEntry ? C.panelBg : 'transparent',
          boxShadow: isEntry ? `inset 0 0 0 1px ${C.panelBorder}` : undefined,
        }}
      >
        <Cell label="Descrição" required className="col-span-2 lg:col-span-1">
          <input
            ref={inputRef}
            type="text"
            value={draft.description}
            onChange={(event) => {
              onUpdate({ description: event.target.value });
              setAutocompleteOpen(true);
              setHighlighted(-1);
            }}
            onKeyDown={handleDescriptionKeyDown}
            onBlur={() => setAutocompleteOpen(false)}
            placeholder={isEntry ? 'Ex: Conta de luz' : 'Descrição'}
            aria-label="Descrição"
            aria-autocomplete="list"
            aria-expanded={showAutocomplete}
            autoComplete="off"
            maxLength={255}
            style={fieldStyle({ invalid: errors?.description })}
          />
          <FloatingPanel
            open={showAutocomplete}
            anchorRef={inputRef}
            onClose={() => setAutocompleteOpen(false)}
            label="Sugestões do histórico"
            minWidth={320}
            padding={6}
            sheetOnSmallScreens={false}
            keepAnchorFocus
          >
            <div role="listbox" aria-label="Sugestões do histórico" style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ padding: '3px 8px 6px', fontSize: 11, color: C.textFaint }}>Do seu histórico · ↑↓ e Enter</span>
              {matches.map((match, index) => (
                <div
                  key={match.description}
                  role="option"
                  aria-selected={index === highlighted}
                  onClick={() => pickMatch(match)}
                  onMouseEnter={() => setHighlighted(index)}
                  style={{
                    display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 12, alignItems: 'center', height: 32,
                    padding: '0 8px', borderRadius: 7, cursor: 'pointer', background: index === highlighted ? C.primarySoft : 'transparent',
                  }}
                >
                  <span style={{ ...ellipsisStyle, fontSize: 12, color: C.text }}>{match.description}</span>
                  <span style={{ fontSize: 11, color: C.textSoft }}>{getPaymentMethodLabel(match.paymentMethod)}</span>
                  <span style={{ fontSize: 12, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(match.amount)}</span>
                </div>
              ))}
            </div>
          </FloatingPanel>
        </Cell>

        <Cell label="Categoria" required className="col-span-2 lg:col-span-1">
          <CategoryFloatingSelect
            compact
            categories={categories}
            value={draft.categoryId ?? undefined}
            onChange={(id) => onUpdate({ categoryId: id ?? null })}
            onCreate={resources.createCategory}
            recentIds={resources.recentCategoryIds}
            invalid={errors?.category}
          />
        </Cell>

        {!isEntry && (
          <Cell label="Pagamento" className="col-span-2 lg:col-span-1">
            <PaymentMethodPopover
              variant="cell"
              draft={draft}
              cards={context.cards}
              cardLimits={resources.cardLimits}
              preferredCardIds={preferredCardIds}
              cardInvalid={!!errors?.card}
              onChange={(choice) => onUpdate(choice)}
            />
          </Cell>
        )}

        <Cell label="Cobrança">
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
        </Cell>

        <Cell label={amountLabel(draft)} required>
          <MoneyCell
            label={amountLabel(draft)}
            valueCents={draft.amountCents}
            onChange={(cents) => onUpdate({ amountCents: cents })}
            suffix={draft.billingType === 'monthly' ? '/mês' : undefined}
            invalid={errors?.amount}
          />
        </Cell>

        <Cell label="Compra">
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
        </Cell>

        <Cell label={installments ? '1ª vence' : 'Vencimento'}>
          <DateCell
            label="Vencimento"
            value={draft.dueDate}
            onChange={(text) => onUpdate({ dueDate: text })}
            todayIso={context.todayIso}
            placeholder={dueDatePlaceholder}
            title="Em branco, o sistema calcula"
            invalid={errors?.dueDate}
          />
        </Cell>

        {installments ? (
          <Cell label="Pagamento das parcelas" className="col-span-2 lg:border-l lg:border-[#dcebf1] lg:pl-2">
            <InstallmentsPopover draft={draft} context={context} onUpdate={onUpdate} />
          </Cell>
        ) : (
          <>
            <Cell label="Pago em" className="lg:border-l lg:border-[#dcebf1] lg:pl-2">
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
            </Cell>
            <Cell label="Valor pago">
              <MoneyCell
                label="Valor pago"
                valueCents={draft.amountPaidCents}
                onChange={(cents) => onUpdate({ amountPaidCents: cents })}
                placeholder={draft.paid && draft.amountCents ? formatMoney(draft.amountCents / 100) : ''}
                disabled={!draft.paid}
              />
            </Cell>
          </>
        )}

        <div className="flex items-center lg:block">
          <AttachmentsPopover
            draft={draft}
            isCompany={resources.isCompany}
            invalid={!!errors?.invoiceDate}
            todayIso={context.todayIso}
            onUpdate={onUpdate}
          />
        </div>

        <div className="flex items-center justify-end lg:block">
          {isEntry && (
            <button
              type="button"
              onClick={onAddToBatch}
              title="Adicionar ao lote (Shift+Enter)"
              aria-label="Adicionar ao lote"
              style={{
                width: 28, height: 28, padding: 0, border: 'none', borderRadius: 8, fontSize: 17, lineHeight: 1, cursor: 'pointer',
                background: filled ? C.primary : '#e6edf1', color: filled ? '#fff' : '#a3b6c0',
              }}
            >
              +
            </button>
          )}
          {variant === 'batch' && (
            <button
              type="button"
              onClick={onRemove}
              title="Remover do lote"
              aria-label="Remover do lote"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-500 transition hover:bg-rose-50 hover:text-rose-700"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {showSummary && (
        <RowSummary
          summary={summary}
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
