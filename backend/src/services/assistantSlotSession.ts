import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '../db/client';
import { cards, categories } from '../db/schema';
import { classifyCategory } from './categoryAI';
import type { FinancialAccount } from './budgetService';
import {
  applyDraftDefaults,
  createEmptySlotDraft,
  isDraftComplete,
  nextSlotQuestion,
  pendingConfirmations,
  slotQuestionFor,
  type SlotCatalog,
  type SlotDraft,
  type SlotId,
  type SlotQuestion,
} from './assistantSlotFilling';
import { applySlotAnswer, seedDraftFromMessage } from './assistantSlotParser';

// Estado do preenchimento guiado entre uma mensagem e a seguinte. Vive no
// `payload` jsonb de copilot_mensagens; quando essa tabela nao existe, volta
// pelo `context` do proprio request (ver financialCopilot).

export interface SlotSessionState {
  draft: SlotDraft;
  pendingSlot: SlotId | null;
  skipped: SlotId[];
  confirmed: SlotId[];
}

export interface SlotSessionStep {
  state: SlotSessionState;
  question: SlotQuestion | null;
  complete: boolean;
  /** Verdadeiro quando a resposta nao foi compreendida e a pergunta se repete. */
  misunderstood: boolean;
}

function isSlotId(value: unknown): value is SlotId {
  return typeof value === 'string';
}

/**
 * Le o estado guardado no payload. Qualquer formato inesperado devolve null: e
 * melhor recomecar o preenchimento do que confiar num estado corrompido e
 * gravar um lancamento com campo trocado.
 */
export function parseSlotSessionState(value: unknown): SlotSessionState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const rawDraft = record['draft'];
  if (!rawDraft || typeof rawDraft !== 'object' || Array.isArray(rawDraft)) return null;

  const source = rawDraft as Record<string, unknown>;
  const kind = source['kind'];
  if (kind !== 'income' && kind !== 'expense') return null;

  // Campo a campo, com tipo conferido: este estado volta pelo request e nao
  // pode virar caminho para gravar valor arbitrario no lancamento.
  const draft = createEmptySlotDraft(kind);
  draft.description = asText(source['description'], 255);
  draft.category = asText(source['category'], 120);
  draft.paymentMethod = asPaymentMethod(source['paymentMethod']);
  draft.cardId = asPositiveInteger(source['cardId']);
  draft.billingType = asBillingType(source['billingType']);
  draft.installments = asBoundedInteger(source['installments'], 2, 360);
  draft.paidInstallments = asBoundedInteger(source['paidInstallments'], 0, 360);
  draft.recurrenceDay = asBoundedInteger(source['recurrenceDay'], 1, 31);
  draft.amount = asAmount(source['amount']);
  draft.cashPrice = asAmount(source['cashPrice']);
  draft.paid = typeof source['paid'] === 'boolean' ? source['paid'] : null;
  draft.amountPaid = asAmount(source['amountPaid']);
  draft.date = asIsoDate(source['date']);
  draft.dueDate = asIsoDate(source['dueDate']);
  draft.invoiceNumber = asText(source['invoiceNumber'], 50);
  draft.invoiceDate = asIsoDate(source['invoiceDate']);

  const pendingSlot = record['pendingSlot'];
  const skipped = Array.isArray(record['skipped']) ? record['skipped'].filter(isSlotId) : [];
  const confirmed = Array.isArray(record['confirmed']) ? record['confirmed'].filter(isSlotId) : [];

  return {
    draft,
    pendingSlot: isSlotId(pendingSlot) ? pendingSlot : null,
    skipped,
    confirmed,
  };
}

function asText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function asAmount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value >= 10_000_000) return null;
  return Math.round(value * 100) / 100;
}

function asPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function asBoundedInteger(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function asIsoDate(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function asPaymentMethod(value: unknown): SlotDraft['paymentMethod'] {
  const methods = ['pix', 'dinheiro', 'debito', 'credito', 'boleto'] as const;
  return methods.includes(value as (typeof methods)[number]) ? value as SlotDraft['paymentMethod'] : null;
}

function asBillingType(value: unknown): SlotDraft['billingType'] {
  const types = ['nao', 'parcelas', 'mensal'] as const;
  return types.includes(value as (typeof types)[number]) ? value as SlotDraft['billingType'] : null;
}

/**
 * Categorias e cartoes que alimentam os botoes. Sempre presos a conta ativa:
 * conta pessoal enxerga tambem os registros sem conta, conta empresa nao.
 */
export async function loadSlotCatalog(userId: number, account: FinancialAccount): Promise<SlotCatalog> {
  const categoryCondition = account.type === 'pessoal'
    ? and(eq(categories.userId, userId), or(eq(categories.accountId, account.id), isNull(categories.accountId))!)
    : and(eq(categories.userId, userId), eq(categories.accountId, account.id));

  const cardCondition = account.type === 'pessoal'
    ? and(eq(cards.userId, userId), eq(cards.active, true), or(eq(cards.accountId, account.id), isNull(cards.accountId))!)
    : and(eq(cards.userId, userId), eq(cards.active, true), eq(cards.accountId, account.id));

  const [categoryRows, cardRows] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories).where(categoryCondition),
    db.select({ id: cards.id, name: cards.name, type: cards.type }).from(cards).where(cardCondition),
  ]);

  return {
    categories: categoryRows,
    cards: cardRows,
    isCompanyAccount: account.type === 'empresa',
  };
}

/**
 * Sugere a categoria pelo historico de lancamentos parecidos. Falha em silencio:
 * sem sugestao o fluxo apenas pergunta, que e melhor que interromper.
 */
async function suggestCategory(description: string, userId: number, catalog: SlotCatalog): Promise<string | null> {
  try {
    const suggestion = await classifyCategory(description, userId, [], '');
    if (!suggestion) return null;
    const known = catalog.categories.find((category) => category.name.toLowerCase() === suggestion.toLowerCase());
    return known?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Descarta referencias que nao existem na conta ativa. Um estado reenviado pelo
 * client poderia apontar para cartao ou categoria de outra conta; aqui esses
 * campos voltam a ficar vazios e o fluxo simplesmente pergunta de novo.
 */
function withCatalogScopedReferences(state: SlotSessionState, catalog: SlotCatalog): SlotSessionState {
  const draft = { ...state.draft };

  if (draft.cardId !== null && !catalog.cards.some((card) => card.id === draft.cardId)) {
    draft.cardId = null;
  }
  if (draft.category !== null && !catalog.categories.some((category) => category.name === draft.category)) {
    draft.category = null;
  }
  if (!catalog.isCompanyAccount) {
    draft.invoiceNumber = null;
    draft.invoiceDate = null;
  }

  return { ...state, draft };
}

/** Passo do fluxo a partir do estado atual, sem consumir resposta. */
function buildStep(state: SlotSessionState, catalog: SlotCatalog, misunderstood = false): SlotSessionStep {
  // Uma frase pode preencher a descricao sem que o usuario tenha confirmado que
  // era aquilo mesmo; a confirmacao vem antes de qualquer pergunta nova.
  const [awaitingConfirmation] = pendingConfirmations(state.draft, state.confirmed);
  if (awaitingConfirmation) {
    const question = buildConfirmationQuestion(state.draft, catalog, awaitingConfirmation);
    return { state: { ...state, pendingSlot: awaitingConfirmation }, question, complete: false, misunderstood };
  }

  const question = nextSlotQuestion(state.draft, catalog, state.skipped);
  if (question) {
    return { state: { ...state, pendingSlot: question.slot }, question, complete: false, misunderstood };
  }

  const complete = isDraftComplete(state.draft, catalog, state.skipped);
  return { state: { ...state, pendingSlot: null }, question: null, complete, misunderstood };
}

/**
 * Pergunta de confirmacao de um slot ja preenchido ("Entendi que e X, certo?").
 * Diferente de `nextSlotQuestion`, que pula slot preenchido — aqui e justamente
 * o valor extraido que precisa aparecer no texto para o usuario aprovar.
 */
function buildConfirmationQuestion(draft: SlotDraft, catalog: SlotCatalog, slot: SlotId): SlotQuestion {
  return slotQuestionFor(slot, draft, catalog);
}

/**
 * Primeira mensagem do lancamento: extrai da frase tudo o que der, sugere a
 * categoria pelo historico e devolve a primeira pergunta que sobrou.
 */
export async function startSlotSession(input: {
  kind: SlotDraft['kind'];
  message: string;
  catalog: SlotCatalog;
  userId: number;
}): Promise<SlotSessionStep> {
  const draft = seedDraftFromMessage(input.kind, input.message, input.catalog);

  if (input.kind === 'expense' && draft.description && !draft.category) {
    draft.category = await suggestCategory(draft.description, input.userId, input.catalog);
  }

  return buildStep({ draft, pendingSlot: null, skipped: [], confirmed: [] }, input.catalog);
}

/**
 * Consome a resposta do slot pendente e avanca. Sem slot pendente, trata a
 * mensagem como uma nova leitura livre sobre o rascunho em andamento.
 */
export async function advanceSlotSession(input: {
  state: SlotSessionState;
  message: string;
  catalog: SlotCatalog;
  userId: number;
}): Promise<SlotSessionStep> {
  const { catalog } = input;
  // O estado pode ter voltado pelo request: cartao e categoria so valem se
  // pertencerem mesmo a conta ativa, nunca pelo que o client afirmou.
  const state = withCatalogScopedReferences(input.state, catalog);

  if (!state.pendingSlot) {
    return buildStep(state, catalog);
  }

  const result = applySlotAnswer(state.draft, state.pendingSlot, input.message, catalog);

  if (!result.understood) {
    // Repete a mesma pergunta em vez de adivinhar — a spec e explicita: nunca
    // gravar um chute.
    return buildStep(state, catalog, true);
  }

  const next: SlotSessionState = {
    draft: result.draft,
    pendingSlot: null,
    skipped: result.skipped ? [...state.skipped, result.skipped] : state.skipped,
    confirmed: result.confirmed ? [...state.confirmed, result.confirmed] : state.confirmed,
  };

  // Corrigir um campo tambem retira sua confirmacao: ele volta a ser perguntado.
  if (result.reask) {
    next.confirmed = next.confirmed.filter((slot) => slot !== result.reask);
  }

  // Descricao nova merece nova sugestao de categoria, desde que o usuario ainda
  // nao tenha escolhido uma.
  if (
    next.draft.kind === 'expense'
    && result.confirmed === 'description'
    && next.draft.description
    && !next.draft.category
    && !next.confirmed.includes('category')
  ) {
    next.draft.category = await suggestCategory(next.draft.description, input.userId, catalog);
  }

  return buildStep(next, catalog);
}

export function finalizeSlotDraft(state: SlotSessionState): SlotDraft {
  return applyDraftDefaults(state.draft);
}
