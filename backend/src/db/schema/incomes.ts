import {
  pgTable,
  serial,
  integer,
  varchar,
  decimal,
  date,
  text,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

import { users } from './users';
import { accounts } from './accounts';

export const incomes = pgTable(
  'receitas',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: integer('conta_id').references(() => accounts.id),
    description: varchar('descricao', { length: 255 }).notNull(),
    amount: decimal('valor', { precision: 10, scale: 2 }).notNull(),
    receiptDate: date('data_recebimento').notNull(),
    month: integer('mes').notNull(),
    year: integer('ano').notNull(),
    notes: text('observacoes'),
    client: varchar('cliente', { length: 100 }),
    incomeType: varchar('tipo_receita', { length: 30 }),
    representativeId: integer('representante_id'),
    attachments: jsonb('anexos'),
    createdAt: timestamp('data_criacao').defaultNow(),
  },
  (table) => ({
    userMonthYearIdx: index('idx_receitas_usuario_mes_ano').on(
      table.userId,
      table.month,
      table.year,
    ),
    accountIdx: index('idx_receitas_conta').on(table.accountId),
  }),
);

export type Income = typeof incomes.$inferSelect;
export type NewIncome = typeof incomes.$inferInsert;
