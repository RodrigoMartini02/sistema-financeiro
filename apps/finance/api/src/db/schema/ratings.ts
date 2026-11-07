import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const ratings = pgTable(
  'avaliacoes',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    author: varchar('autor', { length: 100 }).notNull(),
    stars: integer('estrelas').notNull(),
    comment: text('comentario').notNull(),
    approved: boolean('aprovada').default(true),
    createdAt: timestamp('data_criacao').defaultNow(),
  },
  (table) => ({
    approvedIdx: index('idx_avaliacoes_aprovada').on(table.approved),
    uniqueUser: unique().on(table.userId),
  }),
);

export type Rating = typeof ratings.$inferSelect;
export type NewRating = typeof ratings.$inferInsert;
