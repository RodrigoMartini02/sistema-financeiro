import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { profiles } from './profiles';

// Uma categoria e PADRAO do sistema (tipo preenchido, perfil_id nulo) OU
// CUSTOM criada pelo usuario (perfil_id preenchido, tipo nulo) — nunca os
// dois ao mesmo tempo.
//
// Padrao: global, compartilhada entre todos os perfis do mesmo `tipo`
// ('pessoal' | 'empresa') do usuario. Vem de defaultCategories.ts.
//
// Custom: exclusiva do `perfil_id` especifico onde foi criada — nao aparece
// em outros perfis, mesmo do mesmo tipo (ex: uma categoria criada em "PJ"
// nao aparece em "Aether", mesmo os dois sendo tipo empresa).
//
// Unicidade aplicada via indices unicos funcionais na migration
// (0018_categorias_perfil_custom.sql), nao expressavel diretamente pelo
// helper `unique()` do Drizzle.
export const categories = pgTable(
  'categorias',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('tipo', { length: 10 }),
    profileId: integer('perfil_id').references(() => profiles.id),
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
    profileIdx: index('idx_categorias_perfil').on(table.profileId),
  }),
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
