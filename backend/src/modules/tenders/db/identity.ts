import { boolean, date, integer, pgTable, serial, varchar } from 'drizzle-orm/pg-core';

// Identidade que Licitações usa: usuários, contas e vínculos de membro. Mesmos nomes de tabela e de coluna das de
// Finanças (até a entrega 3B o banco é o mesmo), com só as colunas que o código de Licitações lê e grava; as outras
// têm padrão ou aceitam nulo. Na 3B o banco de Licitações passa a ter estas tabelas só dele.
// Fora do `db/schema.ts` de propósito: o schema de Finanças reexporta aquele, e estes nomes colidiriam.

export const users = pgTable('usuarios', {
  id: serial('id').primaryKey(),
  name: varchar('nome', { length: 255 }).notNull(),
  lastName: varchar('sobrenome', { length: 255 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  document: varchar('documento', { length: 20 }),
  password: varchar('senha', { length: 255 }).notNull(),
  type: varchar('tipo', { length: 20 })
    .default('titular')
    .$type<'membro' | 'titular' | 'admin'>(),
  status: varchar('status', { length: 20 })
    .default('ativo')
    .$type<'ativo' | 'inativo' | 'bloqueado'>(),
  telefone: varchar('telefone', { length: 20 }),
  dataNascimento: date('data_nascimento'),
});

export const accounts = pgTable('contas', {
  id: serial('id').primaryKey(),
  userId: integer('usuario_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('tipo', { length: 10 })
    .notNull()
    .default('pessoal')
    .$type<'pessoal' | 'empresa'>(),
  name: varchar('nome', { length: 100 }).notNull(),
  active: boolean('ativo').default(true),
  isDefault: boolean('eh_padrao').notNull().default(false),
});

// Um usuário só pode ser membro de uma conta por vez (usuario_id único).
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
});
