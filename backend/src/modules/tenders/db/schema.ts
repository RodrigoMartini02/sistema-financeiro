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
  date,
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
  SupplierPersonType,
  TenderAccessType,
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

/** Um termo do contrato no PNCP (aditivo, apostilamento ou rescisão), resumido para o detalhe. */
export interface ContractTermSummary {
  type: string | null;
  number: string | null;
  sequence: number | null;
  signedAt: string | null;
  /** Fim da vigência que o termo informa (aditivo de prazo ou rescisão). */
  endDate: string | null;
  addedValue: string | null;
  /** Termo que muda a vigência: conta para o vencimento atual. */
  changesTerm: boolean;
}

/**
 * Global: contratos vigentes do PNCP (migration 0085), sem o JSON completo.
 * `amendments` NULL = termos não conferidos; [] = conferidos, sem termo.
 */
export const tenderContracts = tendersSchema.table(
  'contrato',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    pncpControlNumber: varchar('numero_controle_pncp', { length: 60 }).notNull().unique(),
    purchaseControlNumber: varchar('numero_controle_compra', { length: 60 }),
    contractYear: integer('ano_contrato').notNull(),
    contractSequence: integer('sequencial_contrato').notNull(),
    contractNumber: text('numero_contrato'),
    processNumber: text('processo'),
    agencyCnpj: varchar('orgao_cnpj', { length: 14 }).notNull(),
    agencyName: text('orgao_razao_social'),
    governmentSphere: varchar('esfera', { length: 2 }),
    unitCode: varchar('unidade_codigo', { length: 30 }),
    unitName: text('unidade_nome'),
    state: char('uf', { length: 2 }),
    cityName: text('municipio_nome'),
    cityIbgeCode: varchar('municipio_ibge', { length: 7 }),
    categoryId: smallint('categoria_id'),
    categoryName: text('categoria_nome'),
    contractObject: text('objeto').notNull(),
    additionalInformation: text('informacao_complementar'),
    supplierPersonType: varchar('fornecedor_tipo_pessoa', { length: 2 }).$type<SupplierPersonType>(),
    supplierDocument: varchar('fornecedor_documento', { length: 30 }),
    supplierName: text('fornecedor_nome'),
    initialValue: numeric('valor_inicial', { precision: 18, scale: 2 }),
    globalValue: numeric('valor_global', { precision: 18, scale: 2 }),
    signedAt: date('data_assinatura', { mode: 'string' }),
    termStart: date('vigencia_inicio', { mode: 'string' }).notNull(),
    originalTermEnd: date('vigencia_fim_original', { mode: 'string' }).notNull(),
    expiresOn: date('vencimento', { mode: 'string' }).notNull(),
    publishedAt: timestampWithZone('data_publicacao_pncp').notNull(),
    pncpUpdatedAt: timestampWithZone('data_atualizacao_pncp'),
    pncpGlobalUpdatedAt: timestampWithZone('data_atualizacao_global'),
    amendments: jsonb('aditivos').$type<ContractTermSummary[]>(),
    amendmentsReference: timestampWithZone('aditivos_referencia'),
    payloadHash: char('hash_payload', { length: 64 }).notNull(),
    searchVector: tsvector('busca_tsv').generatedAlwaysAs(
      sql`to_tsvector('licitacoes.pt_unaccent', coalesce(objeto, '') || ' ' || coalesce(informacao_complementar, ''))`,
    ),
    firstCollectedAt: timestampWithZone('primeira_coleta_em').defaultNow().notNull(),
    lastCollectedAt: timestampWithZone('ultima_coleta_em').defaultNow().notNull(),
  },
  (table) => ({
    searchVectorIdx: index('ix_contrato_tsv').using('gin', table.searchVector),
    expiresOnIdx: index('ix_contrato_vencimento').on(table.expiresOn),
    stateIdx: index('ix_contrato_uf').on(table.state),
    cityIdx: index('ix_contrato_municipio').on(table.cityIbgeCode),
    agencyIdx: index('ix_contrato_orgao').on(table.agencyCnpj),
    categoryIdx: index('ix_contrato_categoria').on(table.categoryId),
    publishedAtIdx: index('ix_contrato_publicacao').on(table.publishedAt.desc()),
    valueIdx: index('ix_contrato_valor').on(table.globalValue),
    supplierIdx: index('ix_contrato_fornecedor').on(table.supplierDocument),
    // Busca por número (parte B): as mesmas expressões da migration 0085.
    numberGroupsIdx: index('ix_contrato_numero_grupos').using(
      'gin',
      sql`licitacoes.fn_grupos_digitos(coalesce(${table.contractNumber}, '') || ' ' || ${table.contractYear}::text)`,
    ),
    processGroupsIdx: index('ix_contrato_processo_grupos').using(
      'gin',
      sql`licitacoes.fn_grupos_digitos(coalesce(${table.processNumber}, '') || ' ' || ${table.contractYear}::text)`,
    ),
    controlNumberGroupsIdx: index('ix_contrato_controle_grupos').using('gin', sql`licitacoes.fn_grupos_digitos(${table.pncpControlNumber})`),
    purchaseGroupsIdx: index('ix_contrato_compra_grupos').using('gin', sql`licitacoes.fn_grupos_digitos(${table.purchaseControlNumber})`),
  }),
);

/** Global: dias de publicação que a carga inicial de contratos já concluiu (migration 0085). */
export const tenderContractBackfillDays = tendersSchema.table('contrato_carga_dia', {
  day: date('dia', { mode: 'string' }).primaryKey(),
  completedAt: timestampWithZone('concluido_em').defaultNow().notNull(),
  recordsRead: integer('registros_lidos').default(0).notNull(),
  storedCount: integer('gravados').default(0).notNull(),
  termsChecked: integer('aditivos_consultados').default(0).notNull(),
});

/**
 * Contas com o módulo: cortesia (admin) ou assinatura (teste, pago ou
 * recorrente, migration 0080). A regra de acesso fica na função
 * licitacoes.fn_conta_com_acesso, usada pela trava e pelos avisos.
 */
export const tenderEnabledAccounts = tendersSchema.table('conta_habilitada', {
  accountId: integer('conta_id').primaryKey().references(() => accounts.id, { onDelete: 'cascade' }),
  active: boolean('ativa').default(true).notNull(),
  enabledBy: integer('habilitada_por').references(() => users.id, { onDelete: 'set null' }),
  enabledAt: timestampWithZone('habilitada_em').defaultNow().notNull(),
  accessType: varchar('tipo_acesso', { length: 12 }).$type<TenderAccessType>().default('cortesia').notNull(),
  trialUntil: timestampWithZone('teste_ate'),
  paidUntil: timestampWithZone('pago_ate'),
  recurringId: varchar('recorrente_id', { length: 100 }),
  billedUsers: integer('usuarios_cobrados'),
  lastPaymentId: varchar('ultimo_pagamento_id', { length: 40 }),
  updatedAt: timestampWithZone('atualizada_em').defaultNow().notNull(),
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

/** Buscas salvas de contratos (migration 0086): os critérios da tela, menos número, ano e "Só favoritos". */
export const tenderContractSavedSearches = tendersSchema.table(
  'busca_salva_contrato',
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
    categories: smallint('categorias').array().notNull().default(sql`'{}'`),
    supplierCnpjs: varchar('fornecedores_cnpj', { length: 14 }).array().notNull().default(sql`'{}'`),
    minValue: numeric('valor_min', { precision: 18, scale: 2 }),
    maxValue: numeric('valor_max', { precision: 18, scale: 2 }),
    // Com faixa de valor, contrato sem valor global só entra com a opção ligada.
    includeWithoutValue: boolean('incluir_sem_valor').default(false).notNull(),
    notify: boolean('notificar').default(true).notNull(),
    active: boolean('ativa').default(true).notNull(),
    createdAt: timestampWithZone('criado_em').defaultNow().notNull(),
    updatedAt: timestampWithZone('atualizado_em').defaultNow().notNull(),
  },
  (table) => ({
    accountUserIdx: index('ix_busca_contrato_conta_usuario').on(table.accountId, table.userId).where(sql`ativa`),
  }),
);

/** Favoritos de contratos de cada pessoa na conta (migration 0086): só ela vê os seus. */
export const tenderContractFavorites = tendersSchema.table(
  'favorito_contrato',
  {
    accountId: integer('conta_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    userId: integer('usuario_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    contractId: bigint('contrato_id', { mode: 'number' }).notNull().references(() => tenderContracts.id, { onDelete: 'cascade' }),
    createdAt: timestampWithZone('criado_em').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.accountId, table.userId, table.contractId] }),
    contractIdx: index('ix_favorito_contrato_contrato').on(table.contractId),
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
    // Aviso de contrato (migration 0086): um aviso é de um edital ou de um contrato, nunca dos dois.
    contractId: bigint('contrato_id', { mode: 'number' }).references(() => tenderContracts.id, { onDelete: 'cascade' }),
    // Desambigua EDITAL_ALTERADO (data de atualização), prazos (data de encerramento) e
    // os avisos de contrato (vencimento, AAAA-MM-DD).
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
    uniqueContractNotification: uniqueIndex('ux_notificacao_contrato_unica')
      .on(table.accountId, table.userId, table.type, table.contractId, sql`coalesce(${table.reference}, '')`)
      .where(sql`contrato_id IS NOT NULL`),
    contractIdx: index('ix_notificacao_contrato').on(table.contractId).where(sql`contrato_id IS NOT NULL`),
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
export type TenderContract = typeof tenderContracts.$inferSelect;
export type NewTenderContract = typeof tenderContracts.$inferInsert;
