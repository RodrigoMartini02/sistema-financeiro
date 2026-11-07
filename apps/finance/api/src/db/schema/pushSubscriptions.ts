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

// Um usuario pode ter mais de uma subscription (celular, notebook, etc) —
// cada dispositivo/navegador gera seu proprio endpoint. endpoint e unico:
// o mesmo navegador reassinando substitui a subscription antiga, nunca
// duplica.
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: varchar('user_agent', { length: 255 }),
    createdAt: timestamp('data_criacao').notNull().defaultNow(),
  },
  (table) => ({
    endpointUniqueIdx: uniqueIndex('idx_push_subscriptions_endpoint').on(table.endpoint),
    userIdx: index('idx_push_subscriptions_usuario').on(table.userId),
  }),
);

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
