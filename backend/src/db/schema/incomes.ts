import {
  pgTable,
  serial,
  integer,
  varchar,
  decimal,
  date,
  text,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

import { users } from './users';
import { accounts } from './accounts';
import { incomeClassificationFixes, incomeClassifications } from './incomeClassifications';
import type { WithholdingAmounts } from '../../services/contractTypes';

export const incomes = pgTable(
  'receitas',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: integer('conta_id').references(() => accounts.id),
    description: varchar('descricao', { length: 255 }).notNull(),
    amount: decimal('valor', { precision: 10, scale: 2 }).notNull(),
    receiptDate: date('data_recebimento').notNull(),
    month: integer('mes').notNull(),
    year: integer('ano').notNull(),
    notes: text('observacoes'),
    // 'prevista' | 'faturada' | 'ativa' | 'cancelada'. 'ativa' significa
    // RECEBIDA — e o unico status que entra nos totais do painel.
    status: varchar('status', { length: 20 }).notNull().default('ativa'),
    contractId: integer('contrato_id'),
    // Venda de um produto do catalogo: a quantidade baixa o estoque, o valor
    // da receita segue livre (o preco do produto so pre-preenche o campo).
    // FK fraca como contrato_id/representante_id — validada em codigo.
    productId: varchar('produto_id', { length: 36 }),
    soldQuantity: decimal('quantidade_vendida', { precision: 12, scale: 3 }),
    commissionAmount: decimal('valor_comissao', { precision: 10, scale: 2 }),
    classificationId: integer('classificacao_id').references(() => incomeClassifications.id, { onDelete: 'set null' }),
    // Preenchidos só na prevista lançada automaticamente pela classificação
    // fixa: o par é único (não lança o mesmo mês duas vezes).
    fixedClassificationId: integer('classificacao_fixa_id').references(() => incomeClassificationFixes.id, { onDelete: 'set null' }),
    fixedCompetence: date('fixa_competencia'),
    representativeId: integer('representante_id'),
    attachments: jsonb('anexos'),
    createdAt: timestamp('data_criacao').defaultNow(),
    // Cliente do cadastro (comercial.clientes) e, na receita gerada por
    // contrato, a cobrança e o mês dela: o par (cobrança, competência) é único
    // entre as não canceladas. FKs no banco (0070), fracas aqui para o schema
    // do módulo poder referenciar receitas sem import circular.
    clientId: integer('cliente_id'),
    chargeId: integer('cobranca_id'),
    competence: date('competencia'),
    // Contrato com órgão público: bruto e retenções; `valor` é o líquido.
    grossAmount: decimal('valor_bruto', { precision: 10, scale: 2 }),
    withholdings: jsonb('retencoes').$type<WithholdingAmounts>(),
  },
  (table) => ({
    userMonthYearIdx: index('idx_receitas_usuario_mes_ano').on(
      table.userId,
      table.month,
      table.year,
    ),
    accountIdx: index('idx_receitas_conta').on(table.accountId),
  }),
);

export type Income = typeof incomes.$inferSelect;
export type NewIncome = typeof incomes.$inferInsert;
