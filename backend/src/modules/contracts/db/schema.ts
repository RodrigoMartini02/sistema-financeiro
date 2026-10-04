import {
  pgSchema,
  serial,
  integer,
  smallint,
  varchar,
  text,
  numeric,
  boolean,
  date,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
  char,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from '../../../db/schema/users';
import { accounts } from '../../../db/schema/accounts';
import { incomes } from '../../../db/schema/incomes';
import { incomeClassifications } from '../../../db/schema/incomeClassifications';
import { representatives } from '../../../db/schema/representatives';
import type { AttachmentKind, ChargeKind, ClientKind, ContractStatus, GovernmentSphere } from '../../../services/contractTypes';

/** Clientes, contratos e serviços das contas PJ (migration 0070). */
export const comercialSchema = pgSchema('comercial');

/** Cliente de uma conta PJ: pessoa física, empresa ou órgão público. */
export const clients = comercialSchema.table(
  'clientes',
  {
    id: serial('id').primaryKey(),
    accountId: integer('conta_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    ownerId: integer('usuario_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: varchar('tipo', { length: 20 }).$type<ClientKind>().notNull(),
    name: varchar('nome', { length: 150 }).notNull(),
    // Só dígitos: CPF (11) ou CNPJ (14).
    document: varchar('documento', { length: 14 }).notNull(),
    sphere: varchar('esfera', { length: 10 }).$type<GovernmentSphere>(),
    agency: varchar('orgao', { length: 150 }),
    contactName: varchar('contato_nome', { length: 100 }),
    contactEmail: varchar('contato_email', { length: 150 }),
    contactPhone: varchar('contato_telefone', { length: 11 }),
    zipCode: varchar('cep', { length: 8 }),
    street: varchar('rua', { length: 150 }),
    number: varchar('numero', { length: 20 }),
    complement: varchar('complemento', { length: 80 }),
    district: varchar('bairro', { length: 80 }),
    city: varchar('cidade', { length: 80 }),
    state: char('uf', { length: 2 }),
    active: boolean('ativo').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    documentUnique: uniqueIndex('ux_clientes_conta_documento').on(table.accountId, table.document),
    nameIdx: index('idx_clientes_conta_nome').on(table.accountId, table.name),
  }),
);

/** Catálogo de serviços de uma conta PJ (informativo nos contratos). */
export const catalogServices = comercialSchema.table(
  'servicos',
  {
    id: serial('id').primaryKey(),
    accountId: integer('conta_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    ownerId: integer('usuario_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('nome', { length: 150 }).notNull(),
    active: boolean('ativo').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameUnique: uniqueIndex('ux_servicos_conta_nome').on(table.accountId, sql`lower(${table.name})`),
  }),
);

export const contracts = comercialSchema.table(
  'contratos',
  {
    id: serial('id').primaryKey(),
    accountId: integer('conta_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    ownerId: integer('usuario_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    clientId: integer('cliente_id').notNull().references(() => clients.id),
    number: varchar('numero', { length: 50 }),
    description: varchar('descricao', { length: 255 }),
    notes: text('observacoes'),
    startDate: date('inicio').notNull(),
    // Nula: contrato sem prazo, sempre com 12 mensalidades previstas à frente.
    endDate: date('fim'),
    dueDay: smallint('dia_vencimento').notNull(),
    status: varchar('status', { length: 10 }).$type<ContractStatus>().notNull().default('ativo'),
    closedAt: date('encerrado_em'),
    previousContractId: integer('contrato_anterior_id').references((): AnyPgColumn => contracts.id, { onDelete: 'set null' }),
    amendmentNumber: integer('numero_aditivo').notNull().default(0),
    representativeId: integer('representante_id').references(() => representatives.id, { onDelete: 'set null' }),
    monthlyClassificationId: integer('classificacao_mensalidade_id').references(() => incomeClassifications.id, { onDelete: 'set null' }),
    setupClassificationId: integer('classificacao_implantacao_id').references(() => incomeClassifications.id, { onDelete: 'set null' }),
    projectClassificationId: integer('classificacao_projeto_id').references(() => incomeClassifications.id, { onDelete: 'set null' }),
    process: varchar('processo', { length: 100 }),
    modality: varchar('modalidade', { length: 100 }),
    withholdingIr: numeric('retencao_ir', { precision: 5, scale: 2 }),
    withholdingPisCofinsCsll: numeric('retencao_pis_cofins_csll', { precision: 5, scale: 2 }),
    withholdingIss: numeric('retencao_iss', { precision: 5, scale: 2 }),
    withholdingInss: numeric('retencao_inss', { precision: 5, scale: 2 }),
    readjustmentBaseDate: date('reajuste_data_base').notNull(),
    // Último aniversário do reajuste já aplicado ou dispensado.
    readjustmentHandledUntil: date('reajuste_tratado_ate'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    accountStatusIdx: index('idx_contratos_conta_status').on(table.accountId, table.status),
    clientIdx: index('idx_contratos_cliente').on(table.clientId),
  }),
);

/** Cobrança do contrato: mensalidade (valor do mês) ou parcelada (valor total em N parcelas). */
export const contractCharges = comercialSchema.table(
  'cobrancas',
  {
    id: serial('id').primaryKey(),
    contractId: integer('contrato_id').notNull().references(() => contracts.id, { onDelete: 'cascade' }),
    kind: varchar('tipo', { length: 12 }).$type<ChargeKind>().notNull(),
    amount: numeric('valor', { precision: 12, scale: 2 }).notNull(),
    installments: smallint('parcelas'),
    firstDate: date('primeira_data'),
  },
  (table) => ({
    kindUnique: uniqueIndex('ux_cobrancas_contrato_tipo').on(table.contractId, table.kind),
  }),
);

/** Tipo de hora do banco de horas: o saldo é a quantidade menos os consumos de receitas não canceladas. */
export const contractHourTypes = comercialSchema.table(
  'tipos_hora',
  {
    id: serial('id').primaryKey(),
    contractId: integer('contrato_id').notNull().references(() => contracts.id, { onDelete: 'cascade' }),
    name: varchar('nome', { length: 60 }).notNull(),
    hourlyRate: numeric('valor_hora', { precision: 12, scale: 2 }).notNull(),
    quantity: numeric('quantidade', { precision: 10, scale: 2 }).notNull(),
  },
  (table) => ({
    nameUnique: uniqueIndex('ux_tipos_hora_contrato_nome').on(table.contractId, sql`lower(${table.name})`),
  }),
);

export const contractHourUsages = comercialSchema.table(
  'consumos_hora',
  {
    id: serial('id').primaryKey(),
    hourTypeId: integer('tipo_hora_id').notNull().references(() => contractHourTypes.id, { onDelete: 'cascade' }),
    incomeId: integer('receita_id').notNull().unique().references(() => incomes.id, { onDelete: 'cascade' }),
    hours: numeric('horas', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    hourTypeIdx: index('idx_consumos_hora_tipo').on(table.hourTypeId),
  }),
);

/** Empenho de órgão público: um por ano no contrato. */
export const contractCommitments = comercialSchema.table(
  'empenhos',
  {
    id: serial('id').primaryKey(),
    contractId: integer('contrato_id').notNull().references(() => contracts.id, { onDelete: 'cascade' }),
    year: smallint('ano').notNull(),
    number: varchar('numero', { length: 50 }).notNull(),
    amount: numeric('valor', { precision: 14, scale: 2 }).notNull(),
  },
  (table) => ({
    yearUnique: uniqueIndex('ux_empenhos_contrato_ano').on(table.contractId, table.year),
  }),
);

export const contractServices = comercialSchema.table(
  'contrato_servicos',
  {
    contractId: integer('contrato_id').notNull().references(() => contracts.id, { onDelete: 'cascade' }),
    serviceId: integer('servico_id').notNull().references(() => catalogServices.id),
    deployed: boolean('implantado').notNull().default(false),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.contractId, table.serviceId] }),
  }),
);

export const contractAttachments = comercialSchema.table(
  'anexos',
  {
    id: serial('id').primaryKey(),
    contractId: integer('contrato_id').notNull().references(() => contracts.id, { onDelete: 'cascade' }),
    accountId: integer('conta_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    uploadedBy: integer('usuario_id').references(() => users.id, { onDelete: 'set null' }),
    originalName: varchar('nome_original', { length: 255 }).notNull(),
    fileName: varchar('nome_arquivo', { length: 255 }).notNull().unique(),
    kind: varchar('tipo', { length: 4 }).$type<AttachmentKind>().notNull(),
    size: integer('tamanho').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    contractIdx: index('idx_anexos_contrato').on(table.contractId),
  }),
);

export type Client = typeof clients.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type ContractCharge = typeof contractCharges.$inferSelect;
export type ContractHourType = typeof contractHourTypes.$inferSelect;
export type ContractCommitment = typeof contractCommitments.$inferSelect;
export type CatalogService = typeof catalogServices.$inferSelect;
export type ContractAttachment = typeof contractAttachments.$inferSelect;
