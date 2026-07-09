import {
  pgTable,
  serial,
  integer,
  boolean,
  decimal,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { profiles } from './profiles';

export const months = pgTable(
  'meses',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    profileId: integer('perfil_id').references(() => profiles.id),
    year: integer('ano').notNull(),
    month: integer('mes').notNull(),
    closed: boolean('fechado').default(false),
    previousBalance: decimal('saldo_anterior', { precision: 10, scale: 2 }).default('0'),
    finalBalance: decimal('saldo_final', { precision: 10, scale: 2 }).default('0'),
    closedAt: timestamp('data_fechamento'),
  },
  (table) => ({
    userYearMonthIdx: index('idx_meses_usuario_ano_mes').on(
      table.userId,
      table.year,
      table.month,
    ),
    profileIdx: index('idx_meses_perfil').on(table.profileId),
  }),
);

export type Month = typeof months.$inferSelect;
export type NewMonth = typeof months.$inferInsert;
