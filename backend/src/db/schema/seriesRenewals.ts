import { pgTable, serial, integer, boolean, timestamp, unique } from 'drizzle-orm/pg-core';
import { users } from './users';
import { expenses } from './expenses';

/**
 * Decisão de renovar uma série mensal para o ano seguinte (plano
 * .plans/recorrente-ano-e-contagem.md). A série é a 1ª ocorrência
 * (grupo_parcelamento_id); `year` é o ano que a decisão cobre. Uma decisão
 * por série e ano: o modal não pergunta de novo.
 */
export const seriesRenewals = pgTable(
  'renovacoes_serie',
  {
    id: serial('id').primaryKey(),
    seriesId: integer('grupo_parcelamento_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    year: integer('ano').notNull(),
    renew: boolean('renovar').notNull(),
    userId: integer('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    decidedAt: timestamp('decidido_em', { mode: 'string' }).notNull().defaultNow(),
  },
  (table) => ({
    seriesYearUnique: unique('uq_renovacoes_serie_grupo_ano').on(table.seriesId, table.year),
  }),
);

export type SeriesRenewal = typeof seriesRenewals.$inferSelect;
