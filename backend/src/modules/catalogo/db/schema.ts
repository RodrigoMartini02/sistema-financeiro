import {
  pgSchema,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from '../../../db/schema/users';
import { accounts } from '../../../db/schema/accounts';

export const catalogoSchema = pgSchema('catalogo');

export const catalogoContas = catalogoSchema.table(
  'contas',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    usuarioId: integer('usuario_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    usuarioIdUnique: uniqueIndex('idx_catalogo_contas_usuario_unique').on(table.usuarioId),
  }),
);

export const catalogoProdutos = catalogoSchema.table(
  'produtos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    usuarioId: integer('usuario_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    // Conta FINANCEIRA (contas/accounts, PF ou PJ) a que o produto pertence —
    // nao confundir com catalogo.contas, que e o id da vitrine publica.
    // Nulo nos produtos criados antes do controle de estoque.
    contaId: integer('conta_id').references(() => accounts.id),
    nome: varchar('nome', { length: 255 }).notNull(),
    descricao: text('descricao'),
    valor: numeric('valor', { precision: 12, scale: 2 }).notNull(),
    // Saldo atual. Nunca editado direto pela UI: so muda por movimentacao
    // registrada em catalogo.movimentacoes_estoque.
    quantidadeEstoque: numeric('quantidade_estoque', { precision: 12, scale: 3 }).default('0').notNull(),
    // Nulo = produto sem controle de minimo, nunca alerta.
    estoqueMinimo: numeric('estoque_minimo', { precision: 12, scale: 3 }),
    ativo: boolean('ativo').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    usuarioIdx: index('idx_catalogo_produtos_usuario').on(table.usuarioId),
    usuarioAtivoIdx: index('idx_catalogo_produtos_usuario_ativo').on(table.usuarioId, table.ativo),
    contaIdx: index('idx_catalogo_produtos_conta').on(table.contaId),
  }),
);

/**
 * Historico de entradas e saidas. O saldo em `produtos.quantidade_estoque` e
 * derivado destas linhas — elas sao a fonte de verdade auditavel de como o
 * saldo chegou onde chegou.
 *
 * `receitaId` so e preenchido na baixa automatica de uma venda; saida manual
 * (perda, ajuste, uso proprio) fica sem receita associada.
 */
export const catalogoMovimentacoesEstoque = catalogoSchema.table(
  'movimentacoes_estoque',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    produtoId: uuid('produto_id').notNull().references(() => catalogoProdutos.id, { onDelete: 'cascade' }),
    usuarioId: integer('usuario_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tipo: varchar('tipo', { length: 10 }).notNull().$type<'entrada' | 'saida'>(),
    quantidade: numeric('quantidade', { precision: 12, scale: 3 }).notNull(),
    motivo: text('motivo'),
    // FK fraca para `receitas`, mesmo padrao de receitas.contrato_id: validada
    // em codigo, nao no schema.
    receitaId: integer('receita_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    produtoIdx: index('idx_catalogo_movimentacoes_produto').on(table.produtoId),
    produtoDataIdx: index('idx_catalogo_movimentacoes_produto_data').on(table.produtoId, table.createdAt),
  }),
);

export const catalogoProdutoImagens = catalogoSchema.table(
  'produto_imagens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    produtoId: uuid('produto_id').notNull().references(() => catalogoProdutos.id, { onDelete: 'cascade' }),
    nomeArquivo: varchar('nome_arquivo', { length: 255 }).notNull(),
    ordem: integer('ordem').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    produtoIdx: index('idx_catalogo_produto_imagens_produto').on(table.produtoId),
  }),
);

export type CatalogoConta = typeof catalogoContas.$inferSelect;
export type NewCatalogoConta = typeof catalogoContas.$inferInsert;
export type CatalogoProduto = typeof catalogoProdutos.$inferSelect;
export type NewCatalogoProduto = typeof catalogoProdutos.$inferInsert;
export type CatalogoProdutoImagem = typeof catalogoProdutoImagens.$inferSelect;
export type NewCatalogoProdutoImagem = typeof catalogoProdutoImagens.$inferInsert;
export type CatalogoMovimentacaoEstoque = typeof catalogoMovimentacoesEstoque.$inferSelect;
export type NewCatalogoMovimentacaoEstoque = typeof catalogoMovimentacoesEstoque.$inferInsert;
