import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const categories = pgTable(
  'categorias',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
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
    uniqueUserName: unique().on(table.userId, table.name),
  }),
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
