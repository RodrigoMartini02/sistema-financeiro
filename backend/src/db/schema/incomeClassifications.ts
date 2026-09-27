import {
  pgTable,
  serial,
  integer,
  smallint,
  varchar,
  boolean,
  decimal,
  date,
  timestamp,
  index,
  unique,
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

// Classificação fixa: valor, dia e lançamento automático por (classificação,
// conta) — a padrão é compartilhada entre contas do mesmo tipo, então a
// configuração não pode morar na própria classificação (migration 0052).
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
    /** Quem configurou: autor das previstas lançadas automaticamente. */
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: decimal('valor', { precision: 12, scale: 2 }).notNull(),
    dayOfMonth: smallint('dia_recebimento').notNull(),
    autoLaunch: boolean('lancar_automatico').notNull().default(false),
    /** Dia em que o automático foi ligado: nada é lançado antes dele. */
    autoSince: date('automatico_desde'),
    createdAt: timestamp('data_criacao').notNull().defaultNow(),
    updatedAt: timestamp('data_atualizacao').notNull().defaultNow(),
  },
  (table) => ({
    classificationAccountUnique: unique('uq_classificacoes_receita_fixas_conta').on(table.classificationId, table.accountId),
    accountIdx: index('idx_classificacoes_receita_fixas_conta').on(table.accountId),
    userIdx: index('idx_classificacoes_receita_fixas_usuario').on(table.userId),
  }),
);

export type IncomeClassificationFix = typeof incomeClassificationFixes.$inferSelect;
