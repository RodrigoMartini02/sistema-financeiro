import { sql } from 'drizzle-orm';
import { db } from '../db/client';

export type DefaultCategoryAccountType = 'pessoal' | 'empresa';
type CategoryExecutor = Pick<typeof db, 'execute'>;

export const PERSONAL_DEFAULT_CATEGORIES = [
  'Alimenta\u00e7\u00e3o',
  'Moradia',
  'Transporte',
  'Sa\u00fade',
  'Educa\u00e7\u00e3o',
  'Lazer',
  'Assinaturas',
  'Vestu\u00e1rio',
  'Finan\u00e7as',
  'Outros',
] as const;

export const BUSINESS_DEFAULT_CATEGORIES = [
  'Fornecedores',
  'Folha de Pagamento',
  'Impostos e Taxas',
  'Aluguel/Condom\u00ednio',
  'Pr\u00f3-labore/Retiradas',
  'Marketing',
  'Tecnologia',
  'Transporte',
  'Contabilidade',
  'Banc\u00e1rio',
  'Seguros',
  'Jur\u00eddico/Consultoria',
  'Operacional',
  'Outros',
] as const;

const DEFAULT_CATEGORY_COLORS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#84cc16',
  '#ec4899',
  '#14b8a6',
] as const;

export function getDefaultCategories(accountType: DefaultCategoryAccountType): readonly string[] {
  return accountType === 'empresa' ? BUSINESS_DEFAULT_CATEGORIES : PERSONAL_DEFAULT_CATEGORIES;
}

export async function ensureDefaultCategories(
  userId: number,
  accountType: DefaultCategoryAccountType = 'pessoal',
  executor: CategoryExecutor = db,
): Promise<void> {
  const names = getDefaultCategories(accountType);

  for (const [index, name] of names.entries()) {
    const color = DEFAULT_CATEGORY_COLORS[index % DEFAULT_CATEGORY_COLORS.length] ?? '#6366f1';
    await executor.execute(sql`
      INSERT INTO categorias (usuario_id, nome, cor, icone, parent_id, tipo)
      VALUES (${userId}, ${name}, ${color}, NULL, NULL, ${accountType})
      ON CONFLICT (usuario_id, LOWER(nome), tipo) WHERE conta_id IS NULL DO NOTHING
    `);
  }
}
