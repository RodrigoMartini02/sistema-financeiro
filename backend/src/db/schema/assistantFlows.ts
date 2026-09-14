import { pgTable, serial, varchar, jsonb, boolean, integer, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Fluxo de conversa do assistente, editavel pela tela de fluxograma.
 *
 * GLOBAL, nao por usuario: quem edita e o dono do sistema definindo como o
 * assistente conversa com todo mundo. Uma linha ativa por vez — as demais
 * ficam como historico do que ja esteve no ar.
 *
 * `definicao` guarda o grafo inteiro (nos e arestas) como JSON. O formato vive
 * em services/assistantFlowSchema.ts, que tambem valida o que entra aqui: uma
 * definicao invalida nao pode chegar ao motor e travar a conversa.
 */
export const assistantFlows = pgTable(
  'assistente_fluxos',
  {
    id: serial('id').primaryKey(),
    nome: varchar('nome', { length: 120 }).notNull(),
    definicao: jsonb('definicao').notNull(),
    ativo: boolean('ativo').notNull().default(false),
    /** Sobe a cada gravacao; serve para detectar edicao concorrente. */
    versao: integer('versao').notNull().default(1),
    dataCriacao: timestamp('data_criacao').notNull().defaultNow(),
    dataAtualizacao: timestamp('data_atualizacao').notNull().defaultNow(),
  },
  (table) => ({
    ativoIdx: index('idx_assistente_fluxos_ativo').on(table.ativo),
  }),
);

export type AssistantFlowRow = typeof assistantFlows.$inferSelect;
export type NewAssistantFlowRow = typeof assistantFlows.$inferInsert;
