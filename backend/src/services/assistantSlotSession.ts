import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '../db/client';
import { cards, categories } from '../db/schema';
import { classifyCategory } from './categoryAI';
import type { FinancialAccount } from './budgetService';
import type { SlotCatalog, SlotDraft } from './assistantSlotFilling';
import { seedDraftFromMessage } from './assistantSlotParser';

/**
 * Categorias e cartoes da conta usados na leitura da frase. Sempre presos a
 * conta ativa: conta pessoal enxerga tambem os registros sem conta, conta
 * empresa nao.
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
 * sem sugestao o card abre com a categoria em branco para o usuario escolher.
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
 * Le a frase e devolve o rascunho de uma vez. Quem escreve "gastei 50 no
 * mercado no credito" ja tem os dados na cabeca: a extracao acontece uma vez e
 * o usuario completa o que faltar no card, editando o que quiser.
 */
export async function readDraftFromMessage(input: {
  kind: SlotDraft['kind'];
  message: string;
  catalog: SlotCatalog;
  userId: number;
}): Promise<SlotDraft> {
  const draft = seedDraftFromMessage(input.kind, input.message, input.catalog);

  // Receita grava so descricao e valor: sugerir categoria seria oferecer um
  // campo que a tabela nao tem.
  if (input.kind === 'expense' && draft.description && !draft.category) {
    draft.category = await suggestCategory(draft.description, input.userId, input.catalog);
  }

  return draft;
}
