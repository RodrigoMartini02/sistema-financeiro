import {
  pgSchema,
  serial,
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
import { sql } from 'drizzle-orm';
import { users } from '../../../db/schema/users';
import { accounts } from '../../../db/schema/accounts';
import { incomes } from '../../../db/schema/incomes';
import type { DeliveryType, OrderPaymentMethod, OrderStatus } from '../../../services/orderPricing';

export const catalogoSchema = pgSchema('catalogo');

/**
 * Vitrine pública de uma conta PJ (o nome da tabela é anterior a ela). O `id`
 * é o código do link antigo `/catalogo/<id>` e continua valendo; o `slug` é o
 * link amigável `/loja/<slug>`.
 */
export const catalogoContas = catalogoSchema.table(
  'contas',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    usuarioId: integer('usuario_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    // Conta FINANCEIRA (contas/accounts, PJ) dona da vitrine. Nula só na
    // vitrine antiga de quem não tem PJ, que não abre mais.
    contaId: integer('conta_id').references(() => accounts.id, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 60 }),
    // Nome exibido; nulo usa o nome fantasia ou o nome da conta.
    nome: varchar('nome', { length: 100 }),
    descricao: varchar('descricao', { length: 280 }),
    // Só dígitos, com o 55 do Brasil.
    whatsapp: varchar('whatsapp', { length: 13 }),
    // Data URL da imagem recortada na tela, como usuarios.foto.
    logo: text('logo'),
    // Formas de entrega da compra pela vitrine: retirada no local e/ou
    // entrega com taxa fixa. Sem nenhuma ativa, não há pagamento online.
    retiradaAtiva: boolean('retirada_ativa').default(false).notNull(),
    retiradaEndereco: varchar('retirada_endereco', { length: 280 }),
    retiradaHorario: varchar('retirada_horario', { length: 120 }),
    entregaAtiva: boolean('entrega_ativa').default(false).notNull(),
    entregaTaxa: numeric('entrega_taxa', { precision: 12, scale: 2 }),
    entregaDescricao: varchar('entrega_descricao', { length: 280 }),
    politicaTroca: text('politica_troca'),
    // Último número de pedido da loja (#1, #2...), somado na criação do pedido.
    ultimoNumeroPedido: integer('ultimo_numero_pedido').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    usuarioIdx: index('idx_catalogo_contas_usuario').on(table.usuarioId),
    contaUnique: uniqueIndex('ux_catalogo_contas_conta').on(table.contaId).where(sql`${table.contaId} IS NOT NULL`),
    slugUnique: uniqueIndex('ux_catalogo_contas_slug').on(table.slug).where(sql`${table.slug} IS NOT NULL`),
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
    // Desligado: a venda nao mexe no estoque e a vitrine nunca mostra o
    // produto como esgotado (services/stock.ts).
    controlaEstoque: boolean('controla_estoque').default(false).notNull(),
    // Desconto em R$ ('valor') ou em % ('percentual'), os dois juntos ou
    // nenhum. O preco final e calculado (services/productPricing.ts), nunca
    // gravado.
    descontoTipo: varchar('desconto_tipo', { length: 10 }).$type<'valor' | 'percentual'>(),
    descontoValor: numeric('desconto_valor', { precision: 12, scale: 2 }),
    categoria: varchar('categoria', { length: 60 }),
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
 * `receitaId` so e preenchido na baixa automatica de uma venda e no estorno
 * dela (receita cancelada ou excluida); movimentacao manual (perda, ajuste,
 * uso proprio) fica sem receita associada.
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
    // Estorno de venda: no maximo uma entrada por receita (services/stock.ts).
    estornoReceitaUnique: uniqueIndex('ux_movimentacoes_estoque_estorno_receita')
      .on(table.receitaId)
      .where(sql`${table.tipo} = 'entrada' AND ${table.receitaId} IS NOT NULL`),
    receitaIdx: index('idx_catalogo_movimentacoes_receita')
      .on(table.receitaId)
      .where(sql`${table.receitaId} IS NOT NULL`),
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

/**
 * Conta Mercado Pago que a conta PJ conectou (OAuth) para receber as vendas
 * da vitrine direto. Tokens cifrados (services/tokenCrypto.ts); nunca saem
 * da API.
 */
export const catalogoMercadoPagoContas = catalogoSchema.table(
  'mercado_pago_contas',
  {
    id: serial('id').primaryKey(),
    contaId: integer('conta_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    usuarioId: integer('usuario_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    mpUserId: varchar('mp_user_id', { length: 30 }).notNull(),
    publicKey: varchar('public_key', { length: 100 }).notNull(),
    accessTokenCifrado: text('access_token_cifrado').notNull(),
    refreshTokenCifrado: text('refresh_token_cifrado').notNull(),
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    liveMode: boolean('live_mode').default(true).notNull(),
    conectadoEm: timestamp('conectado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    contaUnique: uniqueIndex('ux_mercado_pago_contas_conta').on(table.contaId),
  }),
);

/**
 * Pedido feito e pago na vitrine. Pago, cada item vira uma receita "Vendas"
 * (pedido_itens.receita_id) e a taxa de entrega outra (receitaEntregaId).
 * Datas com fuso: a separação compara `reservadoAte` com o agora.
 */
export const catalogoPedidos = catalogoSchema.table(
  'pedidos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    vitrineId: uuid('vitrine_id').notNull().references(() => catalogoContas.id, { onDelete: 'cascade' }),
    contaId: integer('conta_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    // Dono da conta PJ: as receitas do pedido ficam com ele.
    usuarioId: integer('usuario_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    numero: integer('numero').notNull(),
    situacao: varchar('situacao', { length: 30 }).notNull().$type<OrderStatus>(),
    formaPagamento: varchar('forma_pagamento', { length: 10 }).notNull().$type<OrderPaymentMethod>(),
    clienteNome: varchar('cliente_nome', { length: 80 }).notNull(),
    clienteEmail: varchar('cliente_email', { length: 150 }).notNull(),
    clienteTelefone: varchar('cliente_telefone', { length: 11 }).notNull(),
    clienteCpf: varchar('cliente_cpf', { length: 11 }).notNull(),
    entregaTipo: varchar('entrega_tipo', { length: 10 }).notNull().$type<DeliveryType>(),
    enderecoCep: varchar('endereco_cep', { length: 8 }),
    enderecoRua: varchar('endereco_rua', { length: 150 }),
    enderecoNumero: varchar('endereco_numero', { length: 20 }),
    enderecoComplemento: varchar('endereco_complemento', { length: 80 }),
    enderecoBairro: varchar('endereco_bairro', { length: 80 }),
    enderecoCidade: varchar('endereco_cidade', { length: 80 }),
    enderecoUf: varchar('endereco_uf', { length: 2 }),
    observacao: varchar('observacao', { length: 300 }),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
    desconto: numeric('desconto', { precision: 12, scale: 2 }).notNull(),
    taxaEntrega: numeric('taxa_entrega', { precision: 12, scale: 2 }).notNull(),
    total: numeric('total', { precision: 12, scale: 2 }).notNull(),
    mpPaymentId: varchar('mp_payment_id', { length: 30 }),
    pixQrCode: text('pix_qr_code'),
    pixQrCodeBase64: text('pix_qr_code_base64'),
    pixExpiraEm: timestamp('pix_expira_em', { withTimezone: true }),
    reservadoAte: timestamp('reservado_ate', { withTimezone: true }),
    // Última conferência ativa com o Mercado Pago (página do pedido).
    conferidoEm: timestamp('conferido_em', { withTimezone: true }),
    pagoEm: timestamp('pago_em', { withTimezone: true }),
    receitaEntregaId: integer('receita_entrega_id').references(() => incomes.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    vitrineNumeroUnique: uniqueIndex('ux_pedidos_vitrine_numero').on(table.vitrineId, table.numero),
    contaCriacaoIdx: index('idx_pedidos_conta_criacao').on(table.contaId, table.createdAt.desc()),
    reservaIdx: index('idx_pedidos_reserva')
      .on(table.situacao, table.reservadoAte)
      .where(sql`${table.situacao} = 'aguardando_pagamento'`),
    pagamentoIdx: index('idx_pedidos_pagamento').on(table.mpPaymentId).where(sql`${table.mpPaymentId} IS NOT NULL`),
  }),
);

/** Itens do pedido, com nome e preços da hora da compra. */
export const catalogoPedidoItens = catalogoSchema.table(
  'pedido_itens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pedidoId: uuid('pedido_id').notNull().references(() => catalogoPedidos.id, { onDelete: 'cascade' }),
    produtoId: uuid('produto_id').references(() => catalogoProdutos.id, { onDelete: 'set null' }),
    nome: varchar('nome', { length: 255 }).notNull(),
    precoOriginal: numeric('preco_original', { precision: 12, scale: 2 }).notNull(),
    precoUnitario: numeric('preco_unitario', { precision: 12, scale: 2 }).notNull(),
    quantidade: integer('quantidade').notNull(),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
    receitaId: integer('receita_id').references(() => incomes.id, { onDelete: 'set null' }),
    // Pago sem saldo para baixar: a receita saiu sem a venda do produto.
    semEstoque: boolean('sem_estoque').default(false).notNull(),
  },
  (table) => ({
    pedidoIdx: index('idx_pedido_itens_pedido').on(table.pedidoId),
    produtoIdx: index('idx_pedido_itens_produto').on(table.produtoId).where(sql`${table.produtoId} IS NOT NULL`),
  }),
);

export type CatalogoMercadoPagoConta = typeof catalogoMercadoPagoContas.$inferSelect;
export type CatalogoPedido = typeof catalogoPedidos.$inferSelect;
export type CatalogoPedidoItem = typeof catalogoPedidoItens.$inferSelect;
