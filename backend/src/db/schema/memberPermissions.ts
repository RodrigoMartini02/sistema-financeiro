import {
  pgTable,
  serial,
  integer,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// Permissões granulares de um membro (usuario tipo 'padrao' vinculado via
// conta_membros) dentro da conta do gestor. Restritivo por padrão: toda
// coluna nasce false, e o gestor libera explicitamente pela tela de
// permissões. Uma linha por membro, criada automaticamente na criação dele.
export const memberPermissions = pgTable('membro_permissoes', {
  id: serial('id').primaryKey(),
  userId: integer('usuario_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  viewOthersEntries: boolean('ver_lancamentos_outros').notNull().default(false),
  editOthersEntries: boolean('editar_lancamentos_outros').notNull().default(false),
  deleteOthersEntries: boolean('excluir_lancamentos_outros').notNull().default(false),
  viewAggregateSummary: boolean('ver_visao_agregada').notNull().default(false),
  manageCategories: boolean('gerenciar_categorias').notNull().default(false),
  manageCards: boolean('gerenciar_cartoes').notNull().default(false),
  accessOtherMembersData: boolean('acessar_dados_outros_membros').notNull().default(false),
  updatedAt: timestamp('data_atualizacao').defaultNow(),
});

export type MemberPermissions = typeof memberPermissions.$inferSelect;
export type NewMemberPermissions = typeof memberPermissions.$inferInsert;
