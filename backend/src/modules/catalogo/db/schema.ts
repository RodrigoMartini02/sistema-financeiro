import {
  pgSchema,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from '../../../db/schema/users';

export const catalogoSchema = pgSchema('catalogo');

export const catalogoContas = catalogoSchema.table(
  'contas',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    usuarioId: integer('usuario_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    usuarioIdUnique: uniqueIndex('idx_catalogo_contas_usuario_unique').on(table.usuarioId),
  }),
);

export const catalogoProdutos = catalogoSchema.table(
  'produtos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    usuarioId: integer('usuario_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    nome: varchar('nome', { length: 255 }).notNull(),
    descricao: text('descricao'),
    valor: numeric('valor', { precision: 12, scale: 2 }).notNull(),
    ativo: boolean('ativo').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    usuarioIdx: index('idx_catalogo_produtos_usuario').on(table.usuarioId),
    usuarioAtivoIdx: index('idx_catalogo_produtos_usuario_ativo').on(table.usuarioId, table.ativo),
  }),
);

export const catalogoProdutoImagens = catalogoSchema.table(
  'produto_imagens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    produtoId: uuid('produto_id').notNull().references(() => catalogoProdutos.id, { onDelete: 'cascade' }),
    nomeArquivo: varchar('nome_arquivo', { length: 255 }).notNull(),
    ordem: integer('ordem').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    produtoIdx: index('idx_catalogo_produto_imagens_produto').on(table.produtoId),
  }),
);

export type CatalogoConta = typeof catalogoContas.$inferSelect;
export type NewCatalogoConta = typeof catalogoContas.$inferInsert;
export type CatalogoProduto = typeof catalogoProdutos.$inferSelect;
export type NewCatalogoProduto = typeof catalogoProdutos.$inferInsert;
export type CatalogoProdutoImagem = typeof catalogoProdutoImagens.$inferSelect;
export type NewCatalogoProdutoImagem = typeof catalogoProdutoImagens.$inferInsert;
