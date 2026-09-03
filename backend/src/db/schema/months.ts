import {
  pgTable,
  serial,
  integer,
  boolean,
  decimal,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { accounts } from './accounts';

export const months = pgTable(
  'meses',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: integer('conta_id').references(() => accounts.id),
    year: integer('ano').notNull(),
    month: integer('mes').notNull(),
    closed: boolean('fechado').default(false),
    previousBalance: decimal('saldo_anterior', { precision: 10, scale: 2 }).default('0'),
    finalBalance: decimal('saldo_final', { precision: 10, scale: 2 }).default('0'),
    closedAt: timestamp('data_fechamento'),
  },
  (table) => ({
    userYearMonthIdx: index('idx_meses_usuario_ano_mes').on(
      table.userId,
      table.year,
      table.month,
    ),
    accountIdx: index('idx_meses_conta').on(table.accountId),
  }),
);

export type Month = typeof months.$inferSelect;
export type NewMonth = typeof months.$inferInsert;
