import {
  pgTable,
  serial,
  integer,
  varchar,
  decimal,
  date,
  text,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

import { users } from './users';
import { profiles } from './profiles';

export const incomes = pgTable(
  'receitas',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    profileId: integer('perfil_id').references(() => profiles.id),
    description: varchar('descricao', { length: 255 }).notNull(),
    amount: decimal('valor', { precision: 10, scale: 2 }).notNull(),
    receiptDate: date('data_recebimento').notNull(),
    month: integer('mes').notNull(),
    year: integer('ano').notNull(),
    notes: text('observacoes'),
    client: varchar('cliente', { length: 100 }),
    incomeType: varchar('tipo_receita', { length: 30 }),
    representativeId: integer('representante_id'),
    attachments: jsonb('anexos'),
    createdAt: timestamp('data_criacao').defaultNow(),
  },
  (table) => ({
    userMonthYearIdx: index('idx_receitas_usuario_mes_ano').on(
      table.userId,
      table.month,
      table.year,
    ),
    profileIdx: index('idx_receitas_perfil').on(table.profileId),
  }),
);

export type Income = typeof incomes.$inferSelect;
export type NewIncome = typeof incomes.$inferInsert;
