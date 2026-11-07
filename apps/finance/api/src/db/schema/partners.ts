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
import { incomes } from './incomes';

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
    initialCapital: decimal('capital_inicial', { precision: 12, scale: 2 }).notNull().default('0'),
    // Receita em que o capital foi lançado (uma vez só). Vazio: ainda não foi —
    // ou a receita foi apagada, e o capital destrava.
    capitalIncomeId: integer('receita_capital_id').references(() => incomes.id, { onDelete: 'set null' }),
    active: boolean('ativo').default(true),
    createdAt: timestamp('data_criacao').defaultNow(),
  },
  (table) => ({
    userIdx: index('idx_socios_usuario').on(table.userId),
  }),
);

export type Partner = typeof partners.$inferSelect;
export type NewPartner = typeof partners.$inferInsert;
