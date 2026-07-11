import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  decimal,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const profiles = pgTable(
  'perfis',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('tipo', { length: 10 })
      .notNull()
      .default('pessoal')
      .$type<'pessoal' | 'empresa'>(),
    name: varchar('nome', { length: 100 }).notNull(),
    document: varchar('documento', { length: 20 }),
    active: boolean('ativo').default(true),
    legalName: varchar('razao_social', { length: 150 }),
    tradeName: varchar('nome_fantasia', { length: 150 }),
    activity: varchar('atividade', { length: 200 }),
    initialContribution: decimal('aporte_inicial', { precision: 12, scale: 2 }),
    enquadramento: varchar('enquadramento', { length: 10 })
      .$type<'MEI' | 'ME' | 'EPP' | 'SLU' | 'EIRELI' | 'LTDA' | 'SA'>(),
    createdAt: timestamp('data_criacao').defaultNow(),
  },
  (table) => ({
    userIdx: index('idx_perfis_usuario').on(table.userId),
  }),
);

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
