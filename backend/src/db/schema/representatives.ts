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

export const representatives = pgTable(
  'representantes',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    profileId: integer('perfil_id').references(() => profiles.id, { onDelete: 'set null' }),
    name: varchar('nome', { length: 100 }).notNull(),
    email: varchar('email', { length: 150 }),
    phone: varchar('telefone', { length: 20 }),
    active: boolean('ativo').default(true),
    createdAt: timestamp('data_criacao').defaultNow(),
  },
  (table) => ({
    userIdx: index('idx_representantes_usuario').on(table.userId),
    profileIdx: index('idx_representantes_perfil').on(table.profileId),
  }),
);

export const commissions = pgTable(
  'comissoes',
  {
    id: serial('id').primaryKey(),
    representativeId: integer('representante_id')
      .notNull()
      .references(() => representatives.id, { onDelete: 'cascade' }),
    incomeType: varchar('tipo_receita', { length: 30 }).notNull(),
    percentage: decimal('percentual', { precision: 5, scale: 2 }).notNull(),
    tipo: varchar('tipo', { length: 10 }).notNull().default('mensal'),
    active: boolean('ativo').default(true),
  },
  (table) => ({
    representativeIdx: index('idx_comissoes_representante').on(table.representativeId),
  }),
);

export type Representative = typeof representatives.$inferSelect;
export type NewRepresentative = typeof representatives.$inferInsert;
export type Commission = typeof commissions.$inferSelect;
export type NewCommission = typeof commissions.$inferInsert;
