import { boolean, date, integer, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

// Identidade de Licitações: usuários, contas (só de empresa), vínculos de colaborador e o código de recuperação de
// senha. Mesmas tabelas e colunas do banco de Licitações (migrations/0001_baseline.sql e 0002_member_profile.sql),
// com só as colunas que o código do módulo lê e grava; as outras têm padrão ou aceitam nulo.
// Separado do schema de coleta para manter explícitas as tabelas de identidade.

export const users = pgTable('usuarios', {
  id: serial('id').primaryKey(),
  name: varchar('nome', { length: 255 }).notNull(),
  lastName: varchar('sobrenome', { length: 255 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  document: varchar('documento', { length: 20 }),
  password: varchar('senha', { length: 255 }).notNull(),
  type: varchar('tipo', { length: 20 })
    .notNull()
    .default('titular')
    .$type<'membro' | 'titular' | 'admin'>(),
  status: varchar('status', { length: 20 })
    .notNull()
    .default('ativo')
    .$type<'ativo' | 'inativo' | 'bloqueado'>(),
  googleId: varchar('google_id', { length: 255 }),
  phone: varchar('telefone', { length: 20 }),
  /** Chave do objeto da foto no R2 (relativa à pasta do ambiente); nula sem foto. */
  photoKey: varchar('foto_chave', { length: 255 }),
});

/** Só conta de empresa (CNPJ): o banco recusa outro tipo. */
export const accounts = pgTable('contas', {
  id: serial('id').primaryKey(),
  userId: integer('usuario_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('tipo', { length: 10 })
    .notNull()
    .default('empresa')
    .$type<'empresa'>(),
  name: varchar('nome', { length: 100 }).notNull(),
  document: varchar('documento', { length: 20 }),
  active: boolean('ativo').default(true),
  isDefault: boolean('eh_padrao').notNull().default(false),
  legalName: varchar('razao_social', { length: 150 }),
  tradeName: varchar('nome_fantasia', { length: 150 }),
  enquadramento: varchar('enquadramento', { length: 10 })
    .$type<'MEI' | 'ME' | 'EPP' | 'SLU' | 'EIRELI' | 'LTDA' | 'SA'>(),
  openingDate: date('data_abertura'),
});

// Um usuário só pode ser colaborador de uma conta por vez (usuario_id único).
export const accountMembers = pgTable('conta_membros', {
  id: serial('id').primaryKey(),
  accountId: integer('conta_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  userId: integer('usuario_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 })
    .notNull()
    .default('ativo')
    .$type<'ativo' | 'inativo'>(),
  // Dados de trabalho do colaborador, no vínculo com a empresa. Setor e cargo são códigos das listas padrão
  // (domains.ts), validados no código.
  sector: varchar('setor', { length: 40 }),
  jobTitle: varchar('cargo', { length: 40 }),
  admissionDate: date('data_admissao'),
});

// Código de recuperação de senha: um por usuário, com validade e tentativas (services/passwordRecovery.ts).
export const passwordRecoveryCodes = pgTable('codigo_recuperacao', {
  userId: integer('usuario_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  code: varchar('codigo', { length: 6 }).notNull(),
  expiresAt: timestamp('expira_em', { withTimezone: true, mode: 'string' }).notNull(),
  attempts: integer('tentativas').notNull().default(0),
});
