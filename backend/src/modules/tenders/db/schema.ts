import {
  pgSchema,
  bigserial,
  bigint,
  integer,
  smallint,
  varchar,
  char,
  text,
  boolean,
  numeric,
  timestamp,
  jsonb,
  customType,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from '../../../db/schema/users';
import { accounts } from '../../../db/schema/accounts';
import type {
  CollectionRunStatus,
  CollectionRunType,
  DetailCacheType,
  SearchTermsMode,
  TenderNotificationType,
  TrackingHistoryStatus,
  TrackingStatus,
} from '../domains';

// Tabelas do módulo de Licitações (migrations 0072 a 0076). Funções de busca,
// configuração de texto e a coluna gerada busca_tsv existem só nas migrations.
export const tendersSchema = pgSchema('licitacoes');

/** Coluna tsvector gerada pelo banco: o código só lê. */
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

const timestampWithZone = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });

/** Detalhes gravados em coleta_execucao.detalhes (erros resumidos, ignorados e parâmetros). */
export interface CollectionRunDetails {
  errors?: Array<Record<string, unknown>>;
  omittedErrors?: number;
  [key: string]: unknown;
}

/** Global: dado público do PNCP, compartilhado por todas as contas. */
export const tenderNotices = tendersSchema.table(
  'edital',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    pncpControlNumber: varchar('numero_controle_pncp', { length: 60 }).notNull().unique(),
    agencyCnpj: varchar('orgao_cnpj', { length: 14 }),
    agencyName: text('orgao_razao_social'),
    governmentSphere: varchar('esfera', { length: 2 }),
    unitCode: varchar('unidade_codigo', { length: 30 }),
    unitName: text('unidade_nome'),
    state: char('uf', { length: 2 }),
    cityName: text('municipio_nome'),
    cityIbgeCode: varchar('municipio_ibge', { length: 7 }),
    modalityId: smallint('modalidade_id'),
    modalityName: text('modalidade_nome'),
    disputeModeId: smallint('modo_disputa_id'),
    disputeModeName: text('modo_disputa_nome'),
    situationId: smallint('situacao_id'),
    situationName: text('situacao_nome'),
    purchaseYear: integer('ano_compra'),
    purchaseSequence: integer('sequencial_compra'),
    purchaseNumber: text('numero_compra'),
    processNumber: text('processo'),
    procurementObject: text('objeto').notNull(),
    additionalInformation: text('informacao_complementar'),
    isPriceRegistration: boolean('srp'),
    estimatedTotalValue: numeric('valor_total_estimado', { precision: 18, scale: 2 }),
    publishedAt: timestampWithZone('data_publicacao_pncp'),
    proposalOpensAt: timestampWithZone('data_abertura_proposta'),
    proposalClosesAt: timestampWithZone('data_encerramento_proposta'),
    pncpUpdatedAt: timestampWithZone('data_atualizacao_pncp'),
    sourceSystemLink: text('link_sistema_origem'),
    pncpLink: text('link_pncp'),
    payload: jsonb('payload').$type<unknown>().notNull(),
    payloadHash: char('hash_payload', { length: 64 }).notNull(),
    searchVector: tsvector('busca_tsv').generatedAlwaysAs(
      sql`to_tsvector('licitacoes.pt_unaccent', coalesce(objeto, '') || ' ' || coalesce(informacao_complementar, ''))`,
    ),
    firstCollectedAt: timestampWithZone('primeira_coleta_em').defaultNow().notNull(),
    lastCollectedAt: timestampWithZone('ultima_coleta_em').defaultNow().notNull(),
  },
  (table) => ({
    searchVectorIdx: index('ix_edital_tsv').using('gin', table.searchVector),
    objectTrigramIdx: index('ix_edital_objeto_trgm').using('gin', table.procurementObject.op('gin_trgm_ops')),
    stateIdx: index('ix_edital_uf').on(table.state),
    cityIdx: index('ix_edital_municipio').on(table.cityIbgeCode),
    modalityIdx: index('ix_edital_modalidade').on(table.modalityId),
    closesAtIdx: index('ix_edital_encerramento').on(table.proposalClosesAt),
    publishedAtIdx: index('ix_edital_publicacao').on(table.publishedAt.desc()),
    valueIdx: index('ix_edital_valor').on(table.estimatedTotalValue),
    agencyIdx: index('ix_edital_orgao').on(table.agencyCnpj),
    // Busca por número (migration 0079): as mesmas expressões da consulta em services/noticeSearch.ts.
    numberGroupsIdx: index('ix_edital_numero_grupos').using(
      'gin',
      sql`licitacoes.fn_grupos_digitos(coalesce(${table.purchaseNumber}, '') || ' ' || coalesce(${table.purchaseYear}::text, ''))`,
    ),
    processGroupsIdx: index('ix_edital_processo_grupos').using(
      'gin',
      sql`licitacoes.fn_grupos_digitos(coalesce(${table.processNumber}, '') || ' ' || coalesce(${table.purchaseYear}::text, ''))`,
    ),
    controlNumberGroupsIdx: index('ix_edital_controle_grupos').using('gin', sql`licitacoes.fn_grupos_digitos(${table.pncpControlNumber})`),
  }),
);

/** Contas com o módulo habilitado: trava da plataforma, gerida pelo admin. */
export const tenderEnabledAccounts = tendersSchema.table('conta_habilitada', {
  accountId: integer('conta_id').primaryKey().references(() => accounts.id, { onDelete: 'cascade' }),
  active: boolean('ativa').default(true).notNull(),
  enabledBy: integer('habilitada_por').references(() => users.id, { onDelete: 'set null' }),
  enabledAt: timestampWithZone('habilitada_em').defaultNow().notNull(),
});

/** Colaboradores com acesso ao módulo: trava da conta, gerida pelo titular (que tem acesso sem linha aqui). */
export const tenderMemberAccess = tendersSchema.table(
  'acesso_membro',
  {
    accountId: integer('conta_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    userId: integer('usuario_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    grantedBy: integer('concedido_por').references(() => users.id, { onDelete: 'set null' }),
    grantedAt: timestampWithZone('concedido_em').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.accountId, table.userId] }),
  }),
);

export const tenderSavedSearches = tendersSchema.table(
  'busca_salva',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    accountId: integer('conta_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    userId: integer('usuario_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('nome', { length: 120 }).notNull(),
    terms: text('termos').array().notNull().default(sql`'{}'`),
    termsMode: varchar('modo_termos', { length: 3 }).$type<SearchTermsMode>().notNull().default('OU'),
    excludedTerms: text('termos_exclusao').array().notNull().default(sql`'{}'`),
    states: char('ufs', { length: 2 }).array().notNull().default(sql`'{}'`),
    cityIbgeCodes: varchar('municipios_ibge', { length: 7 }).array().notNull().default(sql`'{}'`),
    agencyCnpjs: varchar('orgaos_cnpj', { length: 14 }).array().notNull().default(sql`'{}'`),
    modalities: smallint('modalidades').array().notNull().default(sql`'{}'`),
    minValue: numeric('valor_min', { precision: 18, scale: 2 }),
    maxValue: numeric('valor_max', { precision: 18, scale: 2 }),
    // Com faixa de valor, edital sem valor estimado só entra com a opção ligada (migration 0076).
    includeWithoutValue: boolean('incluir_sem_valor').default(false).notNull(),
    // NULL = indiferente
    onlyPriceRegistration: boolean('apenas_srp'),
    notify: boolean('notificar').default(true).notNull(),
    active: boolean('ativa').default(true).notNull(),
    createdAt: timestampWithZone('criado_em').defaultNow().notNull(),
    updatedAt: timestampWithZone('atualizado_em').defaultNow().notNull(),
  },
  (table) => ({
    accountUserIdx: index('ix_busca_conta_usuario').on(table.accountId, table.userId).where(sql`ativa`),
  }),
);

/** Favoritos de cada pessoa na conta (migration 0078): só ela vê os seus. */
export const tenderFavorites = tendersSchema.table(
  'favorito',
  {
    accountId: integer('conta_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    userId: integer('usuario_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    noticeId: bigint('edital_id', { mode: 'number' }).notNull().references(() => tenderNotices.id, { onDelete: 'cascade' }),
    createdAt: timestampWithZone('criado_em').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.accountId, table.userId, table.noticeId] }),
    noticeIdx: index('ix_favorito_edital').on(table.noticeId),
  }),
);

/** Acompanhamento compartilhado pela equipe da conta: uma linha por conta e edital. */
export const tenderTrackings = tendersSchema.table(
  'acompanhamento',
  {
    accountId: integer('conta_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    noticeId: bigint('edital_id', { mode: 'number' }).notNull().references(() => tenderNotices.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).$type<TrackingStatus>().notNull(),
    note: text('observacao'),
    updatedBy: integer('atualizado_por').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestampWithZone('criado_em').defaultNow().notNull(),
    updatedAt: timestampWithZone('atualizado_em').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.accountId, table.noticeId] }),
  }),
);

export const tenderTrackingHistory = tendersSchema.table(
  'acompanhamento_historico',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    accountId: integer('conta_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    noticeId: bigint('edital_id', { mode: 'number' }).notNull().references(() => tenderNotices.id, { onDelete: 'cascade' }),
    previousStatus: varchar('status_anterior', { length: 20 }).$type<TrackingHistoryStatus>(),
    newStatus: varchar('status_novo', { length: 20 }).$type<TrackingHistoryStatus>().notNull(),
    note: text('observacao'),
    userId: integer('usuario_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestampWithZone('criado_em').defaultNow().notNull(),
  },
  (table) => ({
    accountNoticeIdx: index('ix_historico_conta_edital').on(table.accountId, table.noticeId),
  }),
);

export const tenderNotifications = tendersSchema.table(
  'notificacao',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    accountId: integer('conta_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    userId: integer('usuario_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('tipo', { length: 30 }).$type<TenderNotificationType>().notNull(),
    title: text('titulo').notNull(),
    message: text('mensagem'),
    // Caminho a partir do início do app do módulo (ex.: /editais/123); a tela completa com /licitacoes/app.
    link: text('link').notNull(),
    noticeId: bigint('edital_id', { mode: 'number' }).references(() => tenderNotices.id, { onDelete: 'cascade' }),
    savedSearchId: bigint('busca_salva_id', { mode: 'number' }).references(() => tenderSavedSearches.id, { onDelete: 'set null' }),
    // Desambigua EDITAL_ALTERADO (data de atualização) e prazos (data de encerramento).
    reference: text('referencia'),
    readAt: timestampWithZone('lida_em'),
    createdAt: timestampWithZone('criada_em').defaultNow().notNull(),
  },
  (table) => ({
    uniqueNotification: uniqueIndex('ux_notificacao_unica').on(
      table.accountId,
      table.userId,
      table.type,
      table.noticeId,
      sql`coalesce(${table.reference}, '')`,
    ),
    unreadIdx: index('ix_notificacao_nao_lidas')
      .on(table.accountId, table.userId, table.createdAt.desc())
      .where(sql`lida_em IS NULL`),
  }),
);

/** Global: registro de cada execução do coletor. */
export const tenderCollectionRuns = tendersSchema.table('coleta_execucao', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  type: varchar('tipo', { length: 20 }).$type<CollectionRunType>().notNull(),
  status: varchar('status', { length: 20 }).$type<CollectionRunStatus>().notNull(),
  startedAt: timestampWithZone('iniciado_em').defaultNow().notNull(),
  finishedAt: timestampWithZone('finalizado_em'),
  requestCount: integer('requisicoes').default(0).notNull(),
  recordsRead: integer('registros_lidos').default(0).notNull(),
  newCount: integer('novos').default(0).notNull(),
  updatedCount: integer('atualizados').default(0).notNull(),
  notificationCount: integer('notificacoes').default(0).notNull(),
  errorCount: integer('erros').default(0).notNull(),
  details: jsonb('detalhes').$type<CollectionRunDetails>().default(sql`'{}'::jsonb`).notNull(),
});

/** Global: itens e arquivos do PNCP abertos na tela de detalhe (cache de 24 h). */
export const tenderDetailCache = tendersSchema.table(
  'cache_detalhe',
  {
    noticeId: bigint('edital_id', { mode: 'number' }).notNull().references(() => tenderNotices.id, { onDelete: 'cascade' }),
    type: varchar('tipo', { length: 10 }).$type<DetailCacheType>().notNull(),
    content: jsonb('conteudo').$type<unknown>().notNull(),
    fetchedAt: timestampWithZone('obtido_em').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.noticeId, table.type] }),
  }),
);

export type TenderNotice = typeof tenderNotices.$inferSelect;
export type NewTenderNotice = typeof tenderNotices.$inferInsert;
