import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const planNotificationEvents = pgTable(
  'plan_notification_events',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventType: varchar('tipo_evento', { length: 50 })
      .notNull()
      .$type<'plan_expired' | 'recurring_payment_rejected'>(),
    cycleReference: varchar('referencia_ciclo', { length: 120 }).notNull(),
    planType: varchar('plano_tipo', { length: 10 }),
    status: varchar('status', { length: 20 })
      .notNull()
      .default('pending')
      .$type<'pending' | 'processing' | 'sent' | 'failed' | 'skipped'>(),
    attempts: integer('tentativas').notNull().default(0),
    lastError: text('ultimo_erro'),
    sentAt: timestamp('enviado_em'),
    createdAt: timestamp('data_criacao').notNull().defaultNow(),
    updatedAt: timestamp('data_atualizacao').notNull().defaultNow(),
  },
  (table) => ({
    cycleUniqueIdx: uniqueIndex('idx_plan_notification_events_cycle_unique').on(
      table.userId,
      table.eventType,
      table.cycleReference,
    ),
    pendingIdx: index('idx_plan_notification_events_pending').on(table.status, table.createdAt),
  }),
);
