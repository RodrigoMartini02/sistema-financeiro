import { sql } from 'drizzle-orm';
import { index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { catalogoProdutos } from '../../modules/catalogo/db/schema';
import { contracts } from '../../modules/contracts/db/schema';
import type { AttachmentOwnerType } from '../../services/attachmentRules';
import { expenses } from './expenses';
import { incomes } from './incomes';
import { users } from './users';

/**
 * Anexos de despesas, receitas, contratos e produtos (migration 0093). O arquivo
 * fica no R2, na chave `storageKey`; aqui ficam só os metadados. Com no máximo um
 * dono (a migration garante); sem dono, é um envio pendente.
 */
export const attachments = pgTable(
  'anexos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    uploadedBy: integer('usuario_id').references(() => users.id, { onDelete: 'set null' }),
    ownerType: varchar('tipo_dono', { length: 16 }).$type<AttachmentOwnerType>().notNull(),
    expenseId: integer('despesa_id').references(() => expenses.id, { onDelete: 'cascade' }),
    incomeId: integer('receita_id').references(() => incomes.id, { onDelete: 'cascade' }),
    contractId: integer('contrato_id').references(() => contracts.id, { onDelete: 'cascade' }),
    productId: uuid('produto_id').references(() => catalogoProdutos.id, { onDelete: 'cascade' }),
    originalName: varchar('nome_original', { length: 255 }).notNull(),
    contentType: varchar('tipo_conteudo', { length: 100 }).notNull(),
    size: integer('tamanho').notNull(),
    storageKey: varchar('chave', { length: 200 }).notNull().unique(),
    position: integer('ordem').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    expenseIdx: index('idx_anexos_despesa_id').on(table.expenseId).where(sql`${table.expenseId} IS NOT NULL`),
    incomeIdx: index('idx_anexos_receita_id').on(table.incomeId).where(sql`${table.incomeId} IS NOT NULL`),
    contractIdx: index('idx_anexos_contrato_id').on(table.contractId).where(sql`${table.contractId} IS NOT NULL`),
    productIdx: index('idx_anexos_produto_id').on(table.productId).where(sql`${table.productId} IS NOT NULL`),
    uploadedByIdx: index('idx_anexos_usuario_id').on(table.uploadedBy).where(sql`${table.uploadedBy} IS NOT NULL`),
    pendingIdx: index('idx_anexos_pendentes')
      .on(table.createdAt)
      .where(sql`${table.expenseId} IS NULL AND ${table.incomeId} IS NULL AND ${table.contractId} IS NULL AND ${table.productId} IS NULL`),
  }),
);

export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
