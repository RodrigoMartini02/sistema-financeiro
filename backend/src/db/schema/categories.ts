import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { accounts } from './accounts';

// Uma categoria e PADRAO do sistema (tipo preenchido, conta_id nulo) OU
// CUSTOM criada pelo usuario (conta_id preenchido, tipo nulo) — nunca os
// dois ao mesmo tempo.
//
// Padrao: global, compartilhada entre todas as contas do mesmo `tipo`
// ('pessoal' | 'empresa') do usuario. Vem de defaultCategories.ts.
//
// Custom: exclusiva da `conta_id` especifica onde foi criada — nao aparece
// em outras contas, mesmo do mesmo tipo (ex: uma categoria criada em "PJ"
// nao aparece em "Aether", mesmo as duas sendo tipo empresa).
//
// Unicidade aplicada via indices unicos funcionais na migration
// (0018_categorias_perfil_custom.sql, colunas renomeadas em
// 0024_renomear_perfis_para_contas.sql), nao expressavel diretamente pelo
// helper `unique()` do Drizzle.
export const categories = pgTable(
  'categorias',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('tipo', { length: 10 }),
    accountId: integer('conta_id').references(() => accounts.id),
    name: varchar('nome', { length: 255 }).notNull(),
    color: varchar('cor', { length: 7 }).default('#3498db'),
    icon: varchar('icone', { length: 10 }),
    favoritePaymentMethod: varchar('forma_favorita', { length: 20 }),
    favoriteCardId: integer('cartao_favorito_id'),
    parentId: integer('parent_id'),
    createdAt: timestamp('data_criacao').defaultNow(),
    updatedAt: timestamp('data_atualizacao').defaultNow(),
  },
  (table) => ({
    userIdx: index('idx_categorias_usuario').on(table.userId),
    typeIdx: index('idx_categorias_tipo').on(table.type),
    accountIdx: index('idx_categorias_conta').on(table.accountId),
  }),
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
