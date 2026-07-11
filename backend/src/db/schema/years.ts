import {
  pgTable,
  serial,
  integer,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const years = pgTable(
  'anos',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    year: integer('ano').notNull(),
    createdAt: timestamp('data_criacao').defaultNow(),
  },
  (table) => ({
    userYearIdx: index('idx_anos_usuario_ano').on(table.userId, table.year),
    uniqueUserYear: unique().on(table.userId, table.year),
  }),
);

export type Year = typeof years.$inferSelect;
export type NewYear = typeof years.$inferInsert;
