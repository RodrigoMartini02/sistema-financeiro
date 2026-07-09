import {
  pgTable,
  serial,
  integer,
  varchar,
  decimal,
  date,
  text,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { profiles } from './profiles';

export const reserves = pgTable(
  'reservas',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    profileId: integer('perfil_id').references(() => profiles.id),
    amount: decimal('valor', { precision: 10, scale: 2 }).notNull(),
    month: integer('mes').notNull(),
    year: integer('ano').notNull(),
    date: date('data').notNull(),
    notes: text('observacoes'),
    reserveType: varchar('tipo_reserva', { length: 50 }).default('normal'),
    targetAmount: decimal('objetivo_valor', { precision: 12, scale: 2 }),
    targetReached: boolean('objetivo_atingido').default(false),
    targetDate: date('data_objetivo'),
    createdAt: timestamp('data_criacao').defaultNow(),
  },
  (table) => ({
    userMonthYearIdx: index('idx_reservas_usuario_mes_ano').on(
      table.userId,
      table.month,
      table.year,
    ),
    profileIdx: index('idx_reservas_perfil').on(table.profileId),
  }),
);

export const reserveMovements = pgTable(
  'movimentacoes_reservas',
  {
    id: serial('id').primaryKey(),
    reserveId: integer('reserva_id')
      .notNull()
      .references(() => reserves.id, { onDelete: 'cascade' }),
    profileId: integer('perfil_id').references(() => profiles.id),
    type: varchar('tipo', { length: 10 }).notNull().$type<'entrada' | 'saida'>(),
    amount: decimal('valor', { precision: 10, scale: 2 }).notNull(),
    notes: text('observacoes'),
    createdAt: timestamp('data_hora').defaultNow(),
  },
  (table) => ({
    reserveIdx: index('idx_movimentacoes_reserva').on(table.reserveId),
  }),
);

export type Reserve = typeof reserves.$inferSelect;
export type NewReserve = typeof reserves.$inferInsert;
export type ReserveMovement = typeof reserveMovements.$inferSelect;
export type NewReserveMovement = typeof reserveMovements.$inferInsert;
