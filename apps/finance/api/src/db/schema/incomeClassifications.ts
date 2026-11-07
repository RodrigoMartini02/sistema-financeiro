import {
  pgTable,
  serial,
  integer,
  smallint,
  varchar,
  boolean,
  decimal,
  timestamp,
  date,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { accounts } from './accounts';

// Catálogo de classificações de receita, no mesmo molde de `categorias`:
// PADRÃO do sistema (tipo preenchido, conta_id nulo), global entre as contas do
// mesmo tipo do dono, OU criada pelo usuário (conta_id preenchido, tipo nulo),
// exclusiva da conta onde foi criada. Unicidade por nome nos índices parciais
// da migration 0051.
export const incomeClassifications = pgTable(
  'classificacoes_receita',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('tipo', { length: 10 }).$type<'pessoal' | 'empresa'>(),
    accountId: integer('conta_id').references(() => accounts.id),
    name: varchar('nome', { length: 100 }).notNull(),
    parentId: integer('parent_id').references((): AnyPgColumn => incomeClassifications.id, { onDelete: 'cascade' }),
    active: boolean('ativo').notNull().default(true),
    createdAt: timestamp('data_criacao').notNull().defaultNow(),
    updatedAt: timestamp('data_atualizacao').notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('idx_classificacoes_receita_usuario').on(table.userId),
    accountIdx: index('idx_classificacoes_receita_conta_id').on(table.accountId),
    parentIdx: index('idx_classificacoes_receita_parent').on(table.parentId),
  }),
);

export type IncomeClassification = typeof incomeClassifications.$inferSelect;
export type NewIncomeClassification = typeof incomeClassifications.$inferInsert;

// Fonte da série de receita. O nome físico e os IDs anteriores são preservados;
// várias séries da pessoa podem usar a mesma classificação (migration 0092).
export const incomeClassificationFixes = pgTable(
  'classificacoes_receita_fixas',
  {
    id: serial('id').primaryKey(),
    classificationId: integer('classificacao_id')
      .notNull()
      .references(() => incomeClassifications.id, { onDelete: 'cascade' }),
    accountId: integer('conta_id')
      .notNull()
      .references(() => accounts.id),
    /** De quem é a fixa: autor das previstas gravadas. */
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: decimal('valor', { precision: 12, scale: 2 }).notNull(),
    dayOfMonth: smallint('dia_recebimento').notNull(),
    /** Até que ano as previstas foram gravadas; nulo na fixa antiga, até a rotina gravar o ano. */
    registeredYear: integer('ano_registrado'),
    description: varchar('descricao', { length: 255 }),
    grossAmount: decimal('valor_bruto', { precision: 12, scale: 2 }),
    referenceDate: date('data_referencia'),
    firstMonth: date('primeira_competencia'),
    endMonth: date('mes_final'),
    clientId: integer('cliente_id'),
    representativeId: integer('representante_id'),
    active: boolean('ativa').notNull().default(true),
    createdAt: timestamp('data_criacao').notNull().defaultNow(),
    updatedAt: timestamp('data_atualizacao').notNull().defaultNow(),
  },
  (table) => ({
    accountIdx: index('idx_classificacoes_receita_fixas_conta').on(table.accountId),
    userIdx: index('idx_classificacoes_receita_fixas_usuario').on(table.userId),
  }),
);

export type IncomeClassificationFix = typeof incomeClassificationFixes.$inferSelect;
