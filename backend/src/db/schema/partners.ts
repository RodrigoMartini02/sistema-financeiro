import {
  pgTable,
  serial,
  integer,
  varchar,
  decimal,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { accounts } from './accounts';

export const partners = pgTable(
  'socios',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: integer('conta_id').references(() => accounts.id, { onDelete: 'set null' }),
    name: varchar('nome', { length: 100 }).notNull(),
    percentage: decimal('percentual', { precision: 5, scale: 2 }).notNull(),
    active: boolean('ativo').default(true),
    createdAt: timestamp('data_criacao').defaultNow(),
  },
  (table) => ({
    userIdx: index('idx_socios_usuario').on(table.userId),
  }),
);

export type Partner = typeof partners.$inferSelect;
export type NewPartner = typeof partners.$inferInsert;
