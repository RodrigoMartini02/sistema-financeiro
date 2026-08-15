import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';
import { categories } from './categories';
import { profiles } from './profiles';
import { users } from './users';

export const aiIntegrations = pgTable(
  'ia_integracoes',
  {
    id: serial('id').primaryKey(),
    provider: varchar('provedor', { length: 20 }).notNull().$type<'openai' | 'anthropic' | 'gemini'>(),
    encryptedApiKey: text('chave_api_cifrada').notNull(),
    model: varchar('modelo', { length: 120 }).notNull(),
    enabled: boolean('ativo').notNull().default(false),
    primary: boolean('principal').notNull().default(false),
    updatedByUserId: integer('atualizado_por_usuario_id').references(() => users.id),
    updatedAt: timestamp('atualizado_em').notNull().defaultNow(),
  },
  (table) => ({
    providerUnique: unique('ia_integracoes_provedor_unico').on(table.provider),
    primaryIdx: index('idx_ia_integracoes_principal').on(table.primary, table.enabled),
  }),
);

export const copilotConversations = pgTable(
  'copilot_conversas',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    profileId: integer('perfil_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    title: varchar('titulo', { length: 120 }).notNull().default('Nova conversa'),
    createdAt: timestamp('criado_em').notNull().defaultNow(),
    updatedAt: timestamp('atualizado_em').notNull().defaultNow(),
  },
  (table) => ({
    userProfileUpdatedIdx: index('idx_copilot_conversas_usuario_perfil_atualizado').on(table.userId, table.profileId, table.updatedAt),
  }),
);

export const copilotMessages = pgTable(
  'copilot_mensagens',
  {
    id: serial('id').primaryKey(),
    conversationId: integer('conversa_id').notNull().references(() => copilotConversations.id, { onDelete: 'cascade' }),
    role: varchar('papel', { length: 12 }).notNull().$type<'user' | 'assistant'>(),
    content: text('conteudo').notNull(),
    payload: jsonb('payload'),
    createdAt: timestamp('criado_em').notNull().defaultNow(),
  },
  (table) => ({
    conversationCreatedIdx: index('idx_copilot_mensagens_conversa_criado').on(table.conversationId, table.createdAt),
  }),
);

export const budgetTargets = pgTable(
  'orcamento_metas',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    profileId: integer('perfil_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    categoryId: integer('categoria_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
    mode: varchar('modo', { length: 20 }).notNull().$type<'amount' | 'income_percent'>(),
    targetValue: decimal('valor_meta', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('criado_em').notNull().defaultNow(),
    updatedAt: timestamp('atualizado_em').notNull().defaultNow(),
  },
  (table) => ({
    targetUnique: unique('orcamento_metas_usuario_perfil_categoria_unico').on(table.userId, table.profileId, table.categoryId),
    userProfileIdx: index('idx_orcamento_metas_usuario_perfil').on(table.userId, table.profileId),
  }),
);

export const aiUsageEvents = pgTable(
  'ia_eventos_uso',
  {
    id: serial('id').primaryKey(),
    userId: integer('usuario_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    profileId: integer('perfil_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    provider: varchar('provedor', { length: 20 }).notNull().$type<'openai' | 'anthropic' | 'gemini' | 'deterministic'>(),
    model: varchar('modelo', { length: 120 }),
    inputTokens: integer('tokens_entrada').notNull().default(0),
    outputTokens: integer('tokens_saida').notNull().default(0),
    status: varchar('status', { length: 20 }).notNull().$type<'success' | 'error' | 'limited'>(),
    createdAt: timestamp('criado_em').notNull().defaultNow(),
  },
  (table) => ({
    createdIdx: index('idx_ia_eventos_uso_criado').on(table.createdAt),
    userCreatedIdx: index('idx_ia_eventos_uso_usuario_criado').on(table.userId, table.createdAt),
  }),
);

export type AiIntegration = typeof aiIntegrations.$inferSelect;
export type BudgetTarget = typeof budgetTargets.$inferSelect;
