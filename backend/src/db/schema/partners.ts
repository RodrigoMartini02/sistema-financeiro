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
import { profiles } from './profiles';

export const partners = pgTable(
  'socios',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    profileId: integer('perfil_id').references(() => profiles.id, { onDelete: 'set null' }),
    name: varchar('nome', { length: 100 }).notNull(),
    percentage: decimal('percentual', { precision: 5, scale: 2 }).notNull(),
    active: boolean('ativo').default(true),
    createdAt: timestamp('data_criacao').defaultNow(),
  },
  (table) => ({
    userIdx: index('idx_socios_usuario').on(table.userId),
  }),
);

export type Partner = typeof partners.$inferSelect;
export type NewPartner = typeof partners.$inferInsert;
