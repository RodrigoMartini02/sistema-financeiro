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

export const representatives = pgTable(
  'representantes',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: integer('conta_id').references(() => accounts.id, { onDelete: 'set null' }),
    name: varchar('nome', { length: 100 }).notNull(),
    email: varchar('email', { length: 150 }),
    phone: varchar('telefone', { length: 20 }),
    active: boolean('ativo').default(true),
    createdAt: timestamp('data_criacao').defaultNow(),
  },
  (table) => ({
    userIdx: index('idx_representantes_usuario').on(table.userId),
    accountIdx: index('idx_representantes_conta').on(table.accountId),
  }),
);

export type Representative = typeof representatives.$inferSelect;
export type NewRepresentative = typeof representatives.$inferInsert;
