import { pgTable, serial, integer, varchar, decimal, date, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { accounts } from './accounts';
import { categories } from './categories';
import { cards } from './cards';

/** Cadastro mensal; cada ocorrência tem identidade própria em despesas. */
export const fixedExpenses = pgTable('despesas_fixas', {
  id: serial('id').primaryKey(),
  userId: integer('usuario_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: integer('conta_id').notNull().references(() => accounts.id),
  categoryId: integer('categoria_id').notNull().references(() => categories.id),
  description: varchar('descricao', { length: 255 }).notNull(),
  amount: decimal('valor_referencia', { precision: 10, scale: 2 }).notNull(),
  paymentMethod: varchar('forma_pagamento', { length: 50 }).notNull(),
  cardId: integer('cartao_id').references(() => cards.id),
  purchaseDate: date('data_compra_referencia').notNull(),
  dueDate: date('data_vencimento_referencia').notNull(),
  firstMonth: date('primeira_competencia').notNull(),
  registeredYear: integer('ano_registrado').notNull(),
  active: boolean('ativa').notNull().default(true),
  createdAt: timestamp('data_criacao').notNull().defaultNow(),
  updatedAt: timestamp('data_atualizacao').notNull().defaultNow(),
}, (table) => ({
  accountUserIdx: index('idx_despesas_fixas_conta_usuario').on(table.accountId, table.userId),
}));

export type FixedExpense = typeof fixedExpenses.$inferSelect;
