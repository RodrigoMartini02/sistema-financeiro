import {
  pgTable,
  serial,
  integer,
  varchar,
  decimal,
  date,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { accounts } from './accounts';
import { categories } from './categories';
import { cards } from './cards';

export const expenses = pgTable(
  'despesas',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: integer('conta_id').references(() => accounts.id),
    categoryId: integer('categoria_id').references(() => categories.id),
    cardId: integer('cartao_id').references(() => cards.id),
    description: varchar('descricao', { length: 255 }).notNull(),
    dueDate: date('data_vencimento').notNull(),
    purchaseDate: date('data_compra'),
    paymentDate: date('data_pagamento'),
    month: integer('mes').notNull(),
    year: integer('ano').notNull(),
    paymentMethod: varchar('forma_pagamento', { length: 50 }).default('dinheiro'),
    installment: boolean('parcelado').default(false),
    numberOfInstallments: integer('numero_parcelas'),
    currentInstallment: integer('parcela_atual'),
    installmentGroupId: integer('grupo_parcelamento_id'),
    notes: text('observacoes'),
    paid: boolean('pago').default(false),
    amountPaid: decimal('valor_pago', { precision: 10, scale: 2 }),
    originalAmount: decimal('valor_original', { precision: 10, scale: 2 }),
    finalAmount: decimal('valor_final', { precision: 10, scale: 2 }),
    recurring: boolean('recorrente').default(false),
    attachments: jsonb('anexos'),
    numeroNf: varchar('numero_nf', { length: 50 }),
    dataEmissaoNf: date('data_emissao_nf'),
    tipoDespesa: varchar('tipo_despesa', { length: 10 }).default('opex'),
    createdAt: timestamp('data_criacao').defaultNow(),
  },
  (table) => ({
    userMonthYearIdx: index('idx_despesas_usuario_mes_ano').on(
      table.userId,
      table.month,
      table.year,
    ),
    accountIdx: index('idx_despesas_conta').on(table.accountId),
    installmentGroupIdx: index('idx_despesas_grupo_parcelamento').on(table.installmentGroupId),
  }),
);

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
