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
import { sql } from 'drizzle-orm';
import { users } from './users';
import { accounts } from './accounts';
import { categories } from './categories';
import { cards } from './cards';
import { incomes } from './incomes';
import { invoicePayments } from './invoicePayments';

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
    recurring: boolean('recorrente').default(false),
    // 'ativa' | 'cancelada'. Toda leitura financeira filtra por ela: sem o
    // filtro, lancamento cancelado volta a somar nos totais.
    status: varchar('status', { length: 20 }).notNull().default('ativa'),
    attachments: jsonb('anexos'),
    // Receita que gerou a despesa de comissão: cancelar ou excluir a receita
    // cancela a comissão ligada, se ainda não foi paga (commissionService).
    sourceIncomeId: integer('receita_origem_id').references(() => incomes.id, { onDelete: 'set null' }),
    // Pagamento da fatura do cartão (cardInvoiceService). pagamento_fatura_id: o
    // pagamento que pagou ou renegociou a linha. origem: o que gerou a linha
    // (restante, parcela ou encargos). valor_juros_fatura: a parte do valor que
    // é juros ou encargos, só nas linhas geradas.
    invoicePaymentId: integer('pagamento_fatura_id').references(() => invoicePayments.id, { onDelete: 'set null' }),
    invoiceOriginPaymentId: integer('origem_pagamento_fatura_id').references(() => invoicePayments.id, { onDelete: 'set null' }),
    invoiceInterest: decimal('valor_juros_fatura', { precision: 10, scale: 2 }),
    numeroNf: varchar('numero_nf', { length: 50 }),
    dataEmissaoNf: date('data_emissao_nf'),
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
    sourceIncomeIdx: index('idx_despesas_receita_origem')
      .on(table.sourceIncomeId)
      .where(sql`${table.sourceIncomeId} IS NOT NULL`),
    invoicePaymentIdx: index('idx_despesas_pagamento_fatura')
      .on(table.invoicePaymentId)
      .where(sql`${table.invoicePaymentId} IS NOT NULL`),
    invoiceOriginPaymentIdx: index('idx_despesas_origem_pagamento_fatura')
      .on(table.invoiceOriginPaymentId)
      .where(sql`${table.invoiceOriginPaymentId} IS NOT NULL`),
  }),
);

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
