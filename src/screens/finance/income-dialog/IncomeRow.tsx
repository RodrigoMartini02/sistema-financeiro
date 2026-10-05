import type { ReactNode, RefObject } from 'react';
import type { IncomeSuggestionMatch } from '../../../services/incomeSuggestionsService';
import type { ClassificacaoReceita } from '../../../types/config';
import { CategoryFloatingSelect } from '../../../ui/CategoryFloatingSelect';
import { C } from '../../../ui/dialogFormTokens';
import type { CategoryHistoryEntry } from '../../../utils/categorySuggestions';
import { isoToBrDate } from '../../../utils/date';
import { suggestIncomeClassificationForDescription } from '../../../utils/incomeClassificationSuggestions';
import { AttachmentsPopover } from '../entry-dialog/AttachmentsPopover';
import { toCents } from '../entry-dialog/cents';
import { DateCell } from '../entry-dialog/DateCell';
import { DescriptionField } from '../entry-dialog/DescriptionField';
import { ellipsisStyle, fieldStyle } from '../entry-dialog/fieldStyles';
import {
  AddToBatchButton, GridCell, GridRow, RemoveFromBatchButton, type RowVariant,
} from '../entry-dialog/GridParts';
import { MoneyCell } from '../entry-dialog/MoneyCell';
import { SummaryLine, duplicateText } from '../entry-dialog/SummaryLine';
import { ClientSelect } from './ClientSelect';
import {
  fixedCategoryPatch, incomeHelpText, incomeLastAmountText, isIncomeDraftFilled, summarizeIncomeDraft,
  type ClientOption, type IncomeRuleContext,
} from './draftRules';
import type { IncomeDraft, IncomeDraftErrors, IncomeDraftPatch } from './draftState';
import { IncomeDetailsPopover } from './IncomeDetailsPopover';
import { COMPANY_GRID_CLASS, PERSONAL_GRID_CLASS } from './incomeGrid';
import { RepeatPopover } from './RepeatPopover';
import type { IncomeDraftSuggestions } from './useIncomeSuggestions';

/** Dados que todas as linhas usam. */
export interface IncomeRowResources {
  context: IncomeRuleContext;
  categories: ClassificacaoReceita[];
  recentCategoryIds: number[];
  /** Receitas já carregadas na tela, para sugerir a categoria. */
  categoryHistory: CategoryHistoryEntry[];
  /** Calendário: a data da linha de entrada vem do dia clicado. */
  lockReceiptDate: boolean;
  /** Sem a permissão de Categorias, não há "+ cadastrar" no seletor. */
  createCategory?: (name: string) => Promise<number>;
  /** Sem a permissão de Clientes, só escolhe entre os já cadastrados. */
  createClient?: (name: string) => Promise<ClientOption | null>;
  /** Edição: nome do cliente da receita, se ele não está mais entre os ativos. */
  clientFallbackName?: string | null;
}

interface IncomeRowProps {
  draft: IncomeDraft;
  variant: RowVariant;
  resources: IncomeRowResources;
  errors: IncomeDraftErrors | undefined;
  showSummary: boolean;
  /** Só para a linha com o resumo aberto. */
  suggestions: IncomeDraftSuggestions | null;
  descriptionRef?: RefObject<HTMLInputElement | null>;
  onUpdate: (patch: IncomeDraftPatch) => void;
  onFocus: () => void;
  onAddToBatch?: () => void;
  onRemove?: () => void;
  /** Dicas de primeiro acesso da linha de entrada: em "Repetir" e no "⋯". */
  guides?: { repeat?: ReactNode; details?: ReactNode };
}

/** Uma receita na grade: a linha de entrada, um item do lote ou a receita em edição. */
export function IncomeRow({
  draft, variant, resources, errors, showSummary, suggestions, descriptionRef, onUpdate, onFocus, onAddToBatch, onRemove, guides,
}: IncomeRowProps) {
  const { context, categories } = resources;
  const isEntry = variant === 'entry';
  const isEdit = variant === 'edit';
  const dateLocked = isEntry && resources.lockReceiptDate;
  const matches = suggestions?.suggestions?.matches ?? [];

  const history: CategoryHistoryEntry[] = showSummary
    ? [...matches.map(({ description, categoryId }) => ({ description, categoryId })), ...resources.categoryHistory]
    : [];
  const categorySuggestion = showSummary && draft.categoryId === null
    ? suggestIncomeClassificationForDescription(draft.description, history, categories)
    : null;

  // Categoria fixa (valor e dia cadastrados) preenche o valor vazio e o dia do recebimento.
  const chooseCategory = (categoryId: number | null) => onUpdate((current) => ({
    categoryId,
    ...(categoryId !== null
      ? fixedCategoryPatch(current, categories.find((category) => category.id === categoryId), context.todayIso, dateLocked)
      : {}),
  }));

  const pickMatch = (match: IncomeSuggestionMatch) => onUpdate((current) => {
    const patch: Partial<IncomeDraft> = { description: match.description };
    if (current.amountCents === null && match.amount > 0) patch.amountCents = toCents(match.amount);
    if (context.isCompany && current.clientId === null && match.clientId !== null
      && context.clients.some((client) => client.id === match.clientId)) {
      patch.clientId = match.clientId;
    }
    // A receita antiga pode ser de outra conta: só vale a categoria ativa no catálogo desta.
    if (current.categoryId === null && categories.some((category) => category.id === match.categoryId && category.ativo)) {
      patch.categoryId = match.categoryId;
    }
    return patch;
  });

  const summary = showSummary ? summarizeIncomeDraft(draft, context) : null;
  const duplicate = suggestions?.duplicateCreatedAt ? duplicateText(suggestions.duplicateCreatedAt) : null;

  return (
    <>
      <GridRow variant={variant} columnsClass={context.isCompany ? COMPANY_GRID_CLASS : PERSONAL_GRID_CLASS} onFocus={onFocus}>
        <GridCell label="Descrição" required className="col-span-2 lg:col-span-1">
          <DescriptionField
            value={draft.description}
            onChange={(text) => onUpdate({ description: text })}
            options={matches.map((match) => ({ description: match.description, detail: match.clientName ?? '', amount: match.amount }))}
            onPick={(index) => pickMatch(matches[index]!)}
            onTab={categorySuggestion ? () => chooseCategory(categorySuggestion.id) : undefined}
            placeholder={isEntry ? 'Ex: Salário mensal' : 'Descrição'}
            invalid={errors?.description}
            inputRef={descriptionRef}
          />
        </GridCell>

        <GridCell label="Categoria" className="col-span-2 lg:col-span-1">
          <CategoryFloatingSelect
            compact
            categories={categories}
            value={draft.categoryId ?? undefined}
            onChange={(id) => chooseCategory(id ?? null)}
            onCreate={resources.createCategory}
            recentIds={resources.recentCategoryIds}
          />
        </GridCell>

        {context.isCompany && (
          <GridCell label="Cliente" className="col-span-2 lg:col-span-1">
            <ClientSelect
              value={draft.clientId}
              clients={context.clients}
              fallbackName={resources.clientFallbackName}
              onChange={(clientId) => onUpdate({ clientId })}
              onCreate={resources.createClient}
              invalid={!!errors?.client}
            />
          </GridCell>
        )}

        <GridCell label="Valor" required>
          <MoneyCell label="Valor" valueCents={draft.amountCents} onChange={(cents) => onUpdate({ amountCents: cents })} invalid={errors?.amount} />
        </GridCell>

        <GridCell label="Recebido em" required>
          <DateCell
            label="Data do recebimento"
            value={draft.receiptDate}
            onChange={(text) => onUpdate({ receiptDate: text })}
            todayIso={context.todayIso}
            emptyFallback={isoToBrDate(context.todayIso)}
            disabled={dateLocked}
            title={dateLocked ? 'Data definida pelo calendário' : 'Data do recebimento'}
            invalid={errors?.receiptDate}
          />
        </GridCell>

        <GridCell label="Repetir" className="col-span-2 lg:col-span-1">
          {isEdit ? (
            <span style={{ ...fieldStyle({ disabled: true }), display: 'flex', alignItems: 'center', color: C.textSoft }} title="A repetição não muda na edição">
              <span style={ellipsisStyle}>Não repete</span>
            </span>
          ) : (
            <div style={{ position: 'relative' }}>
              <RepeatPopover draft={draft} todayIso={context.todayIso} invalid={!!errors?.repeatUntil} onUpdate={onUpdate} />
              {guides?.repeat}
            </div>
          )}
        </GridCell>

        {/* No celular os botões ficam juntos numa linha; no desktop cada um é uma coluna. */}
        <div className="col-span-2 flex items-center justify-end gap-2 lg:contents">
          {context.isCompany && (
            <div className="lg:flex lg:items-center">
              <IncomeDetailsPopover
                draft={draft}
                context={context}
                isEdit={isEdit}
                invalid={!!errors?.product || !!errors?.hours || !!errors?.hoursOverBalance}
                onUpdate={onUpdate}
                guide={guides?.details}
              />
            </div>
          )}
          <div className="lg:flex lg:items-center">
            <AttachmentsPopover attachments={draft.attachments} onChange={(attachments) => onUpdate({ attachments })} label="Comprovantes" />
          </div>
          <div className="lg:flex lg:items-center lg:justify-end">
            {isEntry && <AddToBatchButton filled={isIncomeDraftFilled(draft)} onClick={onAddToBatch} />}
            {variant === 'batch' && <RemoveFromBatchButton onClick={onRemove} />}
          </div>
        </div>
      </GridRow>

      {showSummary && (
        <SummaryLine
          content={summary}
          placeholder="Preencha descrição e valor para ver o resumo."
          categorySuggestion={categorySuggestion ? { name: categorySuggestion.nome } : null}
          onAcceptCategory={() => categorySuggestion && chooseCategory(categorySuggestion.id)}
          lastAmount={incomeLastAmountText(suggestions?.suggestions?.lastAmount ?? null)}
          duplicate={duplicate}
          help={incomeHelpText(draft)}
          compactTop={isEntry}
        />
      )}
    </>
  );
}
