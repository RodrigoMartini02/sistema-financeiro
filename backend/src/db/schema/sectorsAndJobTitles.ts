import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { accounts } from './accounts';

/**
 * Lista de nomes de uma conta PJ (setores, cargos): mesmo formato para as
 * duas, mantidas pela mesma rota e pela mesma tela. O nome é único entre os
 * ativos da conta — índice único parcial com LOWER(nome), só na migration 0062
 * (a API do Drizzle não o expressa).
 */
function accountNameCatalogTable(tableName: string) {
  return pgTable(
    tableName,
    {
      id: serial('id').primaryKey(),
      userId: integer('usuario_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
      accountId: integer('conta_id')
        .notNull()
        .references(() => accounts.id, { onDelete: 'cascade' }),
      name: varchar('nome', { length: 100 }).notNull(),
      active: boolean('ativo').notNull().default(true),
      createdAt: timestamp('data_criacao').defaultNow(),
    },
    (table) => ({
      accountIdx: index(`idx_${tableName}_conta`).on(table.accountId),
    }),
  );
}

export type AccountNameCatalogTable = ReturnType<typeof accountNameCatalogTable>;

export const sectors = accountNameCatalogTable('setores');
export const jobTitles = accountNameCatalogTable('cargos');

export type Sector = typeof sectors.$inferSelect;
export type JobTitle = typeof jobTitles.$inferSelect;
