import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { othersSubcategoryName } from './catalogRules';

export type DefaultCategoryAccountType = 'pessoal' | 'empresa';
type CategoryExecutor = Pick<typeof db, 'execute'>;

export interface DefaultCategory {
  name: string;
  subcategories: readonly string[];
}

/** Grupo com as subcategorias padrão e, por último, o "Outros de <grupo>". */
function group(name: string, subcategories: readonly string[]): DefaultCategory {
  return { name, subcategories: [...subcategories, othersSubcategoryName(name)] };
}

/**
 * Conta PF: só a subcategoria recebe lançamento, então cada grupo traz as suas e o
 * "Outros de <grupo>" para o que não cabe nelas.
 */
export const PERSONAL_DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  group('Moradia', [
    'Aluguel',
    'Condomínio',
    'Energia',
    'Água e Gás',
    'Internet',
    'Telefone',
    'IPTU e Taxas',
    'Manutenção e Reparos',
    'Móveis e Decoração',
    'Eletrodomésticos',
    'Lavanderia e Limpeza',
    'Seguro Residencial/Fiança',
  ]),
  group('Alimentação', ['Mercado', 'Restaurantes e Bares', 'Delivery', 'Padaria e Lanches']),
  group('Transporte', [
    'Combustível',
    'Aplicativo e Táxi',
    'Pedágio e Estacionamento',
    'Manutenção do Veículo',
    'IPVA e Licenciamento',
    'Multas',
    'Seguro do Veículo',
    'Financiamento do Veículo',
    'Transporte Público',
  ]),
  group('Saúde', ['Consultas', 'Exames', 'Farmácia', 'Plano de Saúde', 'Dentista', 'Terapia', 'Academia']),
  group('Cuidados Pessoais', ['Salão', 'Barbearia', 'Estética', 'Cosméticos e Perfumaria']),
  group('Vestuário e Compras', ['Roupas e Calçados', 'Acessórios', 'Eletrônicos', 'Compras Online']),
  group('Lazer e Viagens', ['Viagens', 'Eventos e Passeios', 'Jogos', 'Esportes e Hobbies', 'Bares e Festas']),
  group('Assinaturas', ['Streaming de Vídeo', 'Música', 'Software e Apps']),
  group('Educação', ['Cursos', 'Livros e Material', 'Mensalidade']),
  group('Trabalho e Negócios', ['Ferramentas e Software', 'Equipamentos', 'Despesas Profissionais']),
  group('Família e Social', ['Presentes', 'Doações', 'Filhos', 'Pets']),
  // Juros e encargos não são categoria: são valores guardados nos próprios lançamentos.
  group('Finanças e Impostos', ['Empréstimos', 'Tarifas Bancárias', 'Impostos', 'Seguros Pessoais']),
];

/** Conta PJ: categorias soltas, sem subcategorias padrão. */
export const BUSINESS_DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  'Fornecedores',
  'Folha de Pagamento',
  'Impostos e Taxas',
  'Aluguel/Condomínio',
  'Pró-labore/Retiradas',
  'Marketing',
  'Tecnologia',
  'Transporte',
  'Contabilidade',
  'Bancário',
  'Seguros',
  'Jurídico/Consultoria',
  'Operacional',
  'Outros',
].map((name) => ({ name, subcategories: [] }));

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

export function getDefaultCategories(accountType: DefaultCategoryAccountType): readonly DefaultCategory[] {
  return accountType === 'empresa' ? BUSINESS_DEFAULT_CATEGORIES : PERSONAL_DEFAULT_CATEGORIES;
}

/**
 * Grava as categorias padrão do tipo de conta para o usuário (idempotente). SQL cru
 * porque o ON CONFLICT aponta para um índice único parcial com LOWER(nome), que a API
 * do Drizzle não expressa. As subcategorias herdam a cor do grupo.
 */
export async function ensureDefaultCategories(
  userId: number,
  accountType: DefaultCategoryAccountType = 'pessoal',
  executor: CategoryExecutor = db,
): Promise<void> {
  for (const [index, item] of getDefaultCategories(accountType).entries()) {
    const color = DEFAULT_CATEGORY_COLORS[index % DEFAULT_CATEGORY_COLORS.length] ?? '#6366f1';
    await executor.execute(sql`
      INSERT INTO categorias (usuario_id, nome, cor, icone, parent_id, tipo)
      VALUES (${userId}, ${item.name}, ${color}, NULL, NULL, ${accountType})
      ON CONFLICT (usuario_id, LOWER(nome), tipo) WHERE conta_id IS NULL DO NOTHING
    `);
    for (const subcategory of item.subcategories) {
      await executor.execute(sql`
        INSERT INTO categorias (usuario_id, nome, cor, icone, parent_id, tipo)
        SELECT ${userId}, ${subcategory}, cor, NULL, id, ${accountType}
          FROM categorias
         WHERE usuario_id = ${userId} AND tipo = ${accountType} AND conta_id IS NULL
           AND parent_id IS NULL AND LOWER(nome) = LOWER(${item.name})
        ON CONFLICT (usuario_id, LOWER(nome), tipo) WHERE conta_id IS NULL DO NOTHING
      `);
    }
  }
}
