import { pool } from '../db/client';

export type DefaultCategoryProfileType = 'pessoal' | 'empresa';

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
  'Impostos e Taxas',
  'Operacional',
  'Tecnologia',
  'Marketing',
  'Transporte',
  'Contabilidade',
  'Pr\u00f3-labore/Retiradas',
  'Banc\u00e1rio',
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

export function getDefaultCategories(profileType: DefaultCategoryProfileType): readonly string[] {
  return profileType === 'empresa' ? BUSINESS_DEFAULT_CATEGORIES : PERSONAL_DEFAULT_CATEGORIES;
}

export async function ensureDefaultCategories(
  userId: number,
  profileType: DefaultCategoryProfileType = 'pessoal',
): Promise<void> {
  const names = getDefaultCategories(profileType);

  for (const [index, name] of names.entries()) {
    await pool.query(
      'INSERT INTO categorias (usuario_id, nome, cor, icone, parent_id) VALUES ($1, $2, $3, NULL, NULL) ON CONFLICT (usuario_id, nome) DO NOTHING',
      [userId, name, DEFAULT_CATEGORY_COLORS[index % DEFAULT_CATEGORY_COLORS.length] ?? '#6366f1'],
    );
  }
}
