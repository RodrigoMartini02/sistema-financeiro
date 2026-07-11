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

export const cards = pgTable(
  'cartoes',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    profileId: integer('perfil_id').references(() => profiles.id),
    name: varchar('nome', { length: 255 }).notNull(),
    limit: decimal('limite', { precision: 10, scale: 2 }).notNull(),
    closingDay: integer('dia_fechamento').notNull(),
    dueDay: integer('dia_vencimento').notNull(),
    color: varchar('cor', { length: 7 }).default('#3498db'),
    active: boolean('ativo').default(true),
    cardNumber: integer('numero_cartao'),
    brand: varchar('bandeira', { length: 20 }),
    lastDigits: varchar('ultimos_digitos', { length: 4 }),
    expiration: varchar('validade', { length: 7 }),
    createdAt: timestamp('data_criacao').defaultNow(),
    updatedAt: timestamp('data_atualizacao').defaultNow(),
  },
  (table) => ({
    userIdx: index('idx_cartoes_usuario').on(table.userId),
    profileIdx: index('idx_cartoes_perfil').on(table.profileId),
  }),
);

export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
