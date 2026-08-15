import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '../db/client';
import { categories, copilotConversations, copilotMessages, expenses, incomes } from '../db/schema';
import { getTodayIsoInTimezone } from '../utils/date';
import { classifyCopilotMessage, type CopilotIntent } from './aiProvider';
import { inferDeterministicCopilotIntent } from './copilotIntent';
import { AiUsageLimitError, assertAiUsageWithinLimits, getActiveAiProvider, recordAiUsage } from './aiIntegrations';
import { getBudgetOverview, resolveFinancialProfile, type FinancialProfile } from './budgetService';
import {
  createFinancialAssistantDraft,
  type AssistantAttachmentInput,
  type AssistantDraftContext,
  type FinancialAssistantDraft,
} from './financialAssistant';

export type CopilotCardType = 'summary' | 'categories' | 'transactions' | 'upcoming' | 'budget';

export interface CopilotCardItem {
  label: string;
  value: number | string;
  detail?: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
}

export interface CopilotCard {
  type: CopilotCardType;
  title: string;
  items: CopilotCardItem[];
}

export interface FinancialCopilotResponse {
  conversationId: number | null;
  mode: 'answer' | 'draft' | 'help';
  reply: string;
  cards: CopilotCard[];
  draft: FinancialAssistantDraft | null;
  missingFields: Array<'description' | 'amount'>;
}

export class FinancialCopilotInputError extends Error {}

interface StoredMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  payload: unknown;
  createdAt: Date | string;
}

function asNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function validateInput(input: { message: string; month: number; year: number }): void {
  if (!input.message.trim()) throw new FinancialCopilotInputError('Escreva uma mensagem para continuar.');
  if (input.message.length > 2_000) throw new FinancialCopilotInputError('A mensagem pode ter no maximo 2.000 caracteres.');
  if (!Number.isInteger(input.month) || input.month < 0 || input.month > 11 || !Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) {
    throw new FinancialCopilotInputError('Periodo financeiro invalido.');
  }
}

function isMissingTableError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42P01');
}

function profileExpenseCondition(userId: number, profile: FinancialProfile, month: number, year: number) {
  const conditions = [eq(expenses.userId, userId), eq(expenses.month, month), eq(expenses.year, year)];
  if (profile.type === 'pessoal') conditions.push(or(eq(expenses.profileId, profile.id), isNull(expenses.profileId))!);
  else conditions.push(eq(expenses.profileId, profile.id));
  return and(...conditions);
}

function profileIncomeCondition(userId: number, profile: FinancialProfile, month: number, year: number) {
  const conditions = [eq(incomes.userId, userId), eq(incomes.month, month), eq(incomes.year, year)];
  if (profile.type === 'pessoal') conditions.push(or(eq(incomes.profileId, profile.id), isNull(incomes.profileId))!);
  else conditions.push(eq(incomes.profileId, profile.id));
  return and(...conditions);
}

async function createConversation(userId: number, profileId: number, initialMessage: string): Promise<number | null> {
  try {
    const [conversation] = await db.insert(copilotConversations).values({
      userId,
      profileId,
      title: initialMessage.trim().slice(0, 80) || 'Nova conversa',
    }).returning({ id: copilotConversations.id });
    return conversation?.id ?? null;
  } catch (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
}

async function ensureConversation(input: {
  conversationId: number | null;
  userId: number;
  profileId: number;
  initialMessage: string;
}): Promise<number | null> {
  if (!input.conversationId) return createConversation(input.userId, input.profileId, input.initialMessage);
  try {
    const [conversation] = await db.select({ id: copilotConversations.id }).from(copilotConversations)
      .where(and(
        eq(copilotConversations.id, input.conversationId),
        eq(copilotConversations.userId, input.userId),
        eq(copilotConversations.profileId, input.profileId),
      )).limit(1);
    if (!conversation) throw new FinancialCopilotInputError('Conversa nao encontrada.');
    return conversation.id;
  } catch (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
}

async function loadConversationHistory(conversationId: number | null): Promise<StoredMessage[]> {
  if (!conversationId) return [];
  try {
    const rows = await db.select({
      id: copilotMessages.id,
      role: copilotMessages.role,
      content: copilotMessages.content,
      payload: copilotMessages.payload,
      createdAt: copilotMessages.createdAt,
    }).from(copilotMessages).where(eq(copilotMessages.conversationId, conversationId)).orderBy(desc(copilotMessages.createdAt)).limit(12);
    return rows.reverse();
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

async function storeMessage(input: {
  conversationId: number | null;
  role: 'user' | 'assistant';
  content: string;
  payload?: unknown;
}): Promise<void> {
  if (!input.conversationId) return;
  try {
    await db.insert(copilotMessages).values({
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      payload: input.payload ?? null,
    });
    await db.update(copilotConversations).set({ updatedAt: new Date() }).where(eq(copilotConversations.id, input.conversationId));
  } catch (error) {
    if (isMissingTableError(error)) return;
    throw error;
  }
}

async function buildSummaryCard(userId: number, profile: FinancialProfile, month: number, year: number): Promise<CopilotCard> {
  const [expenseRows, incomeRows] = await Promise.all([
    db.select({ amount: expenses.finalAmount, originalAmount: expenses.originalAmount }).from(expenses)
      .where(profileExpenseCondition(userId, profile, month, year)),
    db.select({ amount: incomes.amount }).from(incomes).where(profileIncomeCondition(userId, profile, month, year)),
  ]);
  const incomeTotal = incomeRows.reduce((total, row) => total + asNumber(row.amount), 0);
  const expenseTotal = expenseRows.reduce((total, row) => total + asNumber(row.amount ?? row.originalAmount), 0);
  return {
    type: 'summary',
    title: 'Resumo do periodo',
    items: [
      { label: 'Receitas', value: incomeTotal, tone: 'positive' },
      { label: 'Despesas', value: expenseTotal, tone: 'danger' },
      { label: 'Saldo projetado', value: incomeTotal - expenseTotal, tone: incomeTotal >= expenseTotal ? 'positive' : 'danger' },
    ],
  };
}

async function buildCategoryCard(userId: number, profile: FinancialProfile, month: number, year: number): Promise<CopilotCard> {
  const rows = await db.select({
    categoryName: categories.name,
    amount: expenses.finalAmount,
    originalAmount: expenses.originalAmount,
  }).from(expenses).leftJoin(categories, eq(expenses.categoryId, categories.id))
    .where(profileExpenseCondition(userId, profile, month, year));
  const totals = new Map<string, number>();
  for (const row of rows) {
    const name = row.categoryName ?? 'Sem categoria';
    totals.set(name, (totals.get(name) ?? 0) + asNumber(row.amount ?? row.originalAmount));
  }
  return {
    type: 'categories',
    title: 'Gastos por categoria',
    items: [...totals.entries()].sort((left, right) => right[1] - left[1]).slice(0, 6)
      .map(([label, value]) => ({ label, value, tone: 'neutral' })),
  };
}

async function buildTransactionsCard(input: {
  userId: number;
  profile: FinancialProfile;
  month: number;
  year: number;
  searchTerm: string | null;
}): Promise<CopilotCard> {
  const [expenseRows, incomeRows] = await Promise.all([
    db.select({ description: expenses.description, amount: expenses.finalAmount, originalAmount: expenses.originalAmount, date: expenses.dueDate })
      .from(expenses).where(profileExpenseCondition(input.userId, input.profile, input.month, input.year)).orderBy(desc(expenses.dueDate)).limit(30),
    db.select({ description: incomes.description, amount: incomes.amount, date: incomes.receiptDate })
      .from(incomes).where(profileIncomeCondition(input.userId, input.profile, input.month, input.year)).orderBy(desc(incomes.receiptDate)).limit(30),
  ]);
  const normalizedSearch = input.searchTerm ? normalizeText(input.searchTerm) : '';
  const records = [
    ...expenseRows.map((row) => ({ label: row.description, value: -asNumber(row.amount ?? row.originalAmount), date: row.date })),
    ...incomeRows.map((row) => ({ label: row.description, value: asNumber(row.amount), date: row.date })),
  ].filter((record) => !normalizedSearch || normalizeText(record.label).includes(normalizedSearch))
    .sort((left, right) => String(right.date).localeCompare(String(left.date)))
    .slice(0, 10);
  return {
    type: 'transactions',
    title: normalizedSearch ? `Lancamentos: ${input.searchTerm}` : 'Lancamentos recentes',
    items: records.map((record) => ({
      label: record.label,
      value: record.value,
      detail: String(record.date),
      tone: record.value >= 0 ? 'positive' : 'danger',
    })),
  };
}

async function buildUpcomingCard(userId: number, profile: FinancialProfile, month: number, year: number): Promise<CopilotCard> {
  const rows = await db.select({ description: expenses.description, amount: expenses.finalAmount, originalAmount: expenses.originalAmount, dueDate: expenses.dueDate, paid: expenses.paid })
    .from(expenses).where(profileExpenseCondition(userId, profile, month, year)).orderBy(asc(expenses.dueDate));
  const today = getTodayIsoInTimezone();
  const upcoming = rows.filter((row) => !row.paid && String(row.dueDate) >= today).slice(0, 8);
  return {
    type: 'upcoming',
    title: 'Proximos vencimentos',
    items: upcoming.map((row) => ({
      label: row.description,
      value: asNumber(row.amount ?? row.originalAmount),
      detail: String(row.dueDate),
      tone: 'warning',
    })),
  };
}

async function buildBudgetCard(userId: number, profile: FinancialProfile, month: number, year: number): Promise<CopilotCard> {
  const overview = await getBudgetOverview({ userId, profileId: profile.id, month, year });
  return {
    type: 'budget',
    title: overview.profileType === 'empresa' ? 'Orcamento pessoal indisponivel neste perfil' : 'Acompanhamento do orcamento',
    items: overview.items.filter((item) => item.targetAmount !== null).slice(0, 8).map((item) => ({
      label: item.categoryName,
      value: item.projectedAmount,
      detail: `Meta ${item.targetAmount?.toFixed(2) ?? '0,00'}`,
      tone: item.status === 'over' ? 'danger' : item.status === 'attention' ? 'warning' : 'positive',
    })),
  };
}

function responseForCard(intent: CopilotIntent, card: CopilotCard): string {
  if (card.items.length === 0) return 'Nao encontrei dados para esta consulta no periodo selecionado.';
  if (intent === 'summary') return 'Aqui esta o resumo financeiro do periodo selecionado.';
  if (intent === 'categories') return 'Organizei os gastos por categoria para voce comparar.';
  if (intent === 'transactions') return 'Separei os lancamentos encontrados no periodo.';
  if (intent === 'upcoming') return 'Estas sao as proximas despesas ainda previstas no periodo.';
  return 'Este e o acompanhamento das metas que voce definiu.';
}

export async function listCopilotConversations(input: { userId: number; profileId: number | null }): Promise<Array<{ id: number; title: string; updatedAt: Date | string }>> {
  const profile = await resolveFinancialProfile(input.userId, input.profileId);
  return db.select({ id: copilotConversations.id, title: copilotConversations.title, updatedAt: copilotConversations.updatedAt })
    .from(copilotConversations)
    .where(and(eq(copilotConversations.userId, input.userId), eq(copilotConversations.profileId, profile.id)))
    .orderBy(desc(copilotConversations.updatedAt)).limit(30);
}

export async function getCopilotConversation(input: { userId: number; profileId: number | null; conversationId: number }): Promise<StoredMessage[]> {
  const profile = await resolveFinancialProfile(input.userId, input.profileId);
  const [conversation] = await db.select({ id: copilotConversations.id }).from(copilotConversations)
    .where(and(eq(copilotConversations.id, input.conversationId), eq(copilotConversations.userId, input.userId), eq(copilotConversations.profileId, profile.id))).limit(1);
  if (!conversation) throw new FinancialCopilotInputError('Conversa nao encontrada.');
  return loadConversationHistory(conversation.id);
}

export async function deleteCopilotConversation(input: { userId: number; profileId: number | null; conversationId: number }): Promise<void> {
  const profile = await resolveFinancialProfile(input.userId, input.profileId);
  await db.delete(copilotConversations).where(and(
    eq(copilotConversations.id, input.conversationId),
    eq(copilotConversations.userId, input.userId),
    eq(copilotConversations.profileId, profile.id),
  ));
}

export async function runFinancialCopilot(input: {
  userId: number;
  profileId: number | null;
  month: number;
  year: number;
  message: string;
  attachments: AssistantAttachmentInput[];
  context?: AssistantDraftContext;
  conversationId: number | null;
}): Promise<FinancialCopilotResponse> {
  validateInput(input);
  const profile = await resolveFinancialProfile(input.userId, input.profileId);
  const conversationId = await ensureConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    profileId: profile.id,
    initialMessage: input.message,
  });
  const history = await loadConversationHistory(conversationId);
  await storeMessage({ conversationId, role: 'user', content: input.message });

  let intent = inferDeterministicCopilotIntent(input.message, input.attachments.length);
  let providerName: 'openai' | 'anthropic' | 'gemini' | 'deterministic' = 'deterministic';
  let providerModel: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let usageStatus: 'success' | 'limited' = 'success';
  let searchTerm: string | null = null;

  if (intent !== 'register') {
    try {
      const provider = await getActiveAiProvider();
      if (provider) {
        await assertAiUsageWithinLimits(input.userId);
        const context = history.map((message) => `${message.role === 'user' ? 'Usuario' : 'Assistente'}: ${message.content}`).join('\n');
        const decision = await classifyCopilotMessage(provider, `${context}\nUsuario: ${input.message}`.slice(-10_000));
        intent = decision.intent;
        searchTerm = decision.searchTerm;
        providerName = provider.provider;
        providerModel = provider.model;
        inputTokens = decision.inputTokens;
        outputTokens = decision.outputTokens;
      }
    } catch (error) {
      providerName = 'deterministic';
      if (error instanceof AiUsageLimitError) usageStatus = 'limited';
    }
  }

  if (intent === 'register') {
    const draftResult = await createFinancialAssistantDraft({
      message: input.message,
      attachments: input.attachments,
      context: input.context,
      userId: input.userId,
    });
    const response: FinancialCopilotResponse = {
      conversationId,
      mode: 'draft',
      reply: draftResult.reply,
      cards: [],
      draft: draftResult.draft,
      missingFields: draftResult.missingFields,
    };
    await storeMessage({ conversationId, role: 'assistant', content: response.reply, payload: { mode: response.mode, draft: response.draft } });
    try {
      await recordAiUsage({ userId: input.userId, profileId: profile.id, provider: providerName, model: providerModel, inputTokens, outputTokens, status: usageStatus });
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
    }
    return response;
  }

  let card: CopilotCard | null = null;
  if (intent === 'summary') card = await buildSummaryCard(input.userId, profile, input.month, input.year);
  if (intent === 'categories') card = await buildCategoryCard(input.userId, profile, input.month, input.year);
  if (intent === 'transactions') card = await buildTransactionsCard({ userId: input.userId, profile, month: input.month, year: input.year, searchTerm });
  if (intent === 'upcoming') card = await buildUpcomingCard(input.userId, profile, input.month, input.year);
  if (intent === 'budget') card = await buildBudgetCard(input.userId, profile, input.month, input.year);

  const response: FinancialCopilotResponse = card
    ? { conversationId, mode: 'answer', reply: responseForCard(intent, card), cards: [card], draft: null, missingFields: [] }
    : {
      conversationId,
      mode: 'help',
      reply: 'Posso registrar receitas e despesas, analisar comprovantes, mostrar resumo, categorias, lancamentos, vencimentos e suas metas de orcamento.',
      cards: [],
      draft: null,
      missingFields: [],
    };
  await storeMessage({ conversationId, role: 'assistant', content: response.reply, payload: { mode: response.mode, cards: response.cards } });
  try {
    await recordAiUsage({ userId: input.userId, profileId: profile.id, provider: providerName, model: providerModel, inputTokens, outputTokens, status: usageStatus });
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }
  return response;
}
