import {
  pgTable,
  serial,
  integer,
  varchar,
  decimal,
  date,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { cards } from './cards';

/** Forma gravada do pagamento da fatura, pela forma pedida na API. */
export const INVOICE_PAYMENT_METHODS = { total: 'total', partial: 'parcial', installments: 'parcelado' } as const;
export type InvoicePaymentMethodColumn = (typeof INVOICE_PAYMENT_METHODS)[keyof typeof INVOICE_PAYMENT_METHODS];

/**
 * Pagamento da fatura de um cartão no mês ("Pagar fatura"): total, parcial ou
 * parcelado. As compras pagas ou renegociadas apontam para ele
 * (despesas.pagamento_fatura_id); o restante, as parcelas e os encargos, para
 * a origem (despesas.origem_pagamento_fatura_id). Estornado = desfeito.
 */
export const invoicePayments = pgTable(
  'pagamentos_fatura',
  {
    id: serial('id').primaryKey(),
    cardId: integer('cartao_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    /** Dono do cartão: a fatura é dele. */
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    registeredBy: integer('registrado_por').references(() => users.id, { onDelete: 'set null' }),
    /** Mês da fatura (0-11), como despesas.mes. */
    month: integer('mes').notNull(),
    year: integer('ano').notNull(),
    method: varchar('forma', { length: 10 }).notNull().$type<InvoicePaymentMethodColumn>(),
    purchasesAmount: decimal('valor_compras', { precision: 10, scale: 2 }).notNull(),
    paidAmount: decimal('valor_pago', { precision: 10, scale: 2 }).notNull(),
    chargesAmount: decimal('valor_encargos', { precision: 10, scale: 2 }).notNull().default('0'),
    interestAmount: decimal('valor_juros', { precision: 10, scale: 2 }).notNull().default('0'),
    carriedInterest: decimal('valor_juros_carregados', { precision: 10, scale: 2 }).notNull().default('0'),
    carriedForward: decimal('valor_para_frente', { precision: 10, scale: 2 }).notNull().default('0'),
    installmentCount: integer('numero_parcelas'),
    installmentAmount: decimal('valor_parcela', { precision: 10, scale: 2 }),
    paymentDate: date('data_pagamento').notNull(),
    // Texto como o banco grava (fuso da conexão, America/Sao_Paulo): o histórico mostra a data sem converter.
    createdAt: timestamp('data_criacao', { mode: 'string' }).notNull().defaultNow(),
    reversedAt: timestamp('estornado_em', { mode: 'string' }),
    reversedBy: integer('estornado_por').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    cardMonthIdx: index('idx_pagamentos_fatura_cartao_mes').on(table.cardId, table.year, table.month),
    userIdx: index('idx_pagamentos_fatura_usuario').on(table.userId),
  }),
);

export type InvoicePayment = typeof invoicePayments.$inferSelect;
export type NewInvoicePayment = typeof invoicePayments.$inferInsert;
