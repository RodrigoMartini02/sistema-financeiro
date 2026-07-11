import {
  pgTable,
  serial,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'usuarios',
  {
    id: serial('id').primaryKey(),
    name: varchar('nome', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    document: varchar('documento', { length: 20 }).notNull().unique(),
    password: varchar('senha', { length: 255 }).notNull(),
    type: varchar('tipo', { length: 20 })
      .default('admin')
      .$type<'padrao' | 'admin' | 'master'>(),
    status: varchar('status', { length: 20 })
      .default('ativo')
      .$type<'ativo' | 'inativo' | 'bloqueado'>(),
    financialData: jsonb('dados_financeiros'),
    categories: jsonb('categorias'),
    cards: jsonb('cartoes'),
    photo: text('foto'),
    googleId: varchar('google_id', { length: 255 }),
    planStatus: varchar('plano_status', { length: 20 })
      .default('trial')
      .$type<'trial' | 'ativo' | 'expirado'>(),
    planType: varchar('plano_tipo', { length: 10 }),
    planExpiration: timestamp('plano_expiracao'),
    preapprovalId: varchar('preapproval_id', { length: 100 }),
    planStart: timestamp('plano_inicio'),
    annualPaymentId: varchar('payment_id_anual', { length: 100 }),
    reviewDone: boolean('avaliacao_feita').default(false),
    country: varchar('pais', { length: 100 }),
    state: varchar('estado', { length: 100 }),
    city: varchar('cidade', { length: 100 }),
    createdAt: timestamp('data_cadastro').defaultNow(),
    updatedAt: timestamp('data_atualizacao').defaultNow(),
  },
  (table) => ({
    emailIdx: index('idx_usuarios_email').on(table.email),
    documentIdx: index('idx_usuarios_documento').on(table.document),
    typeIdx: index('idx_usuarios_tipo').on(table.type),
    statusIdx: index('idx_usuarios_status').on(table.status),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
