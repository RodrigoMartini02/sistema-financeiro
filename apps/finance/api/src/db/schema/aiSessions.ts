import { pgTable, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const aiSessions = pgTable('ia_sessoes', {
  userId: integer('usuario_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  history: jsonb('historico').default([]),
  updatedAt: timestamp('atualizado_em').defaultNow(),
});

export type AiSession = typeof aiSessions.$inferSelect;
export type NewAiSession = typeof aiSessions.$inferInsert;
