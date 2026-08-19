import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// Unicidade de nome por (usuario_id, LOWER(nome), COALESCE(tipo, 'pessoal')) e
// aplicada via indice unico funcional na migration (0017_categorias_tipo.sql),
// nao expressavel diretamente pelo helper `unique()` do Drizzle.
//
// `tipo` ('pessoal' | 'empresa') segmenta categorias por TIPO de perfil, nao
// por perfil individual: uma categoria 'empresa' e compartilhada entre todas
// as empresas do usuario, nunca exclusiva de uma so. `tipo = NULL` (legado)
// cai no perfil pessoal por fallback.
export const categories = pgTable(
  'categorias',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('tipo', { length: 10 }),
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
  }),
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
