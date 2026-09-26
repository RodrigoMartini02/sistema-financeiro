import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  decimal,
  timestamp,
  date,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// Dados pessoais (foto, telefone, data de nascimento, e-mail de login) vivem
// exclusivamente em `users` — a conta guarda so o que e da carteira/empresa
// em si, nunca da pessoa.
export const accounts = pgTable(
  'contas',
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
    isDefault: boolean('eh_padrao').notNull().default(false),
    legalName: varchar('razao_social', { length: 150 }),
    tradeName: varchar('nome_fantasia', { length: 150 }),
    activity: varchar('atividade', { length: 200 }),
    initialContribution: decimal('aporte_inicial', { precision: 12, scale: 2 }),
    enquadramento: varchar('enquadramento', { length: 10 })
      .$type<'MEI' | 'ME' | 'EPP' | 'SLU' | 'EIRELI' | 'LTDA' | 'SA'>(),
    openingDate: date('data_abertura'),
    createdAt: timestamp('data_criacao').defaultNow(),
  },
  (table) => ({
    userIdx: index('idx_contas_usuario').on(table.userId),
  }),
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
