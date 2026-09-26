import {
  index,
  integer,
  pgTable,
  serial,
  date,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { expenses } from './expenses';
import { accounts } from './accounts';

export const expenseAlerts = pgTable(
  'despesa_alertas',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expenseId: integer('despesa_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    accountId: integer('conta_id').references(() => accounts.id),
    alertType: varchar('tipo_alerta', { length: 20 })
      .notNull()
      .$type<'vencendo_hoje' | 'vencida'>(),
    // Status inicia 'pending' (gerado pelo job, ainda nao entregue), passa a
    // 'sent' quando exibido/entregue (ex: push na Fase 3), e 'read' quando o
    // usuario abre a notificacao no sininho.
    status: varchar('status', { length: 20 })
      .notNull()
      .default('pending')
      .$type<'pending' | 'sent' | 'read'>(),
    // Snapshot da data de vencimento no momento em que o alerta foi gerado —
    // se a despesa for editada depois (nova data), o alerta antigo continua
    // valido para o dedupe, sem reprocessar o mesmo vencimento duas vezes.
    dueDate: date('data_vencimento').notNull(),
    readAt: timestamp('lido_em'),
    createdAt: timestamp('data_criacao').notNull().defaultNow(),
    updatedAt: timestamp('data_atualizacao').notNull().defaultNow(),
  },
  (table) => ({
    dedupeIdx: uniqueIndex('idx_despesa_alertas_dedupe').on(
      table.expenseId,
      table.alertType,
      table.dueDate,
    ),
    userStatusIdx: index('idx_despesa_alertas_usuario_status').on(table.userId, table.status),
  }),
);

export type ExpenseAlert = typeof expenseAlerts.$inferSelect;
export type NewExpenseAlert = typeof expenseAlerts.$inferInsert;
