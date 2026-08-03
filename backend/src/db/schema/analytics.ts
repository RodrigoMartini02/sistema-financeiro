import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: serial('id').primaryKey(),
    eventType: varchar('event_type', { length: 40 }).notNull(),
    path: varchar('path', { length: 255 }),
    userId: integer('usuario_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('data_criacao').defaultNow().notNull(),
  },
  (table) => ({
    eventTypeIdx: index('idx_analytics_events_event_type').on(table.eventType),
    createdAtIdx: index('idx_analytics_events_data_criacao').on(table.createdAt),
    userIdIdx: index('idx_analytics_events_usuario_id').on(table.userId),
  }),
);

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert;
