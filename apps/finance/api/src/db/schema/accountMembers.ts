import {
  pgTable,
  serial,
  integer,
  varchar,
  date,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { accounts } from './accounts';
import { jobTitles, sectors } from './sectorsAndJobTitles';

// Vincula um usuario (membro, tipo 'membro') a uma conta gerenciada por um
// titular. Um usuario so pode ser membro de uma conta por vez (usuario_id
// unico). Despesas/receitas do membro entram na mesma conta_id do titular,
// discriminadas por usuario_id (autor) nas tabelas despesas/receitas.
export const accountMembers = pgTable(
  'conta_membros',
  {
    id: serial('id').primaryKey(),
    accountId: integer('conta_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    userId: integer('usuario_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 })
      .notNull()
      .default('ativo')
      .$type<'ativo' | 'inativo'>(),
    // Dados de trabalho do colaborador de conta PJ, no vínculo com a empresa
    // (não no cadastro da pessoa). Setor e cargo vêm das listas da conta.
    sectorId: integer('setor_id').references(() => sectors.id, { onDelete: 'set null' }),
    jobTitleId: integer('cargo_id').references(() => jobTitles.id, { onDelete: 'set null' }),
    admissionDate: date('data_admissao'),
    createdAt: timestamp('data_criacao').defaultNow(),
  },
  (table) => ({
    accountIdx: index('idx_conta_membros_conta').on(table.accountId),
  }),
);

export type AccountMember = typeof accountMembers.$inferSelect;
export type NewAccountMember = typeof accountMembers.$inferInsert;
