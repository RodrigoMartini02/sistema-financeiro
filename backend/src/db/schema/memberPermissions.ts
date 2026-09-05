import {
  pgTable,
  serial,
  integer,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// Permissões de acesso a tela de um membro (usuario tipo 'padrao' vinculado
// via conta_membros) dentro da conta do gestor. Cada coluna = acesso
// completo (ver/criar/editar/excluir) a UMA tela/funcionalidade — não há
// separação de leitura/escrita, nem acesso a lançamentos de outros membros
// (o membro só mexe nos próprios dados, mesmo com a tela liberada).
// Restritivo por padrão: toda coluna nasce false, e o gestor libera
// explicitamente pela tela de permissões. Uma linha por membro, criada
// automaticamente na criação dele.
export const memberPermissions = pgTable('membro_permissoes', {
  id: serial('id').primaryKey(),
  userId: integer('usuario_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Financeiro
  accessExpenses: boolean('acesso_despesas').notNull().default(false),
  accessIncomes: boolean('acesso_receitas').notNull().default(false),
  accessMonthClosing: boolean('acesso_fechamento_mes').notNull().default(false),
  accessReserves: boolean('acesso_reservas').notNull().default(false),
  accessBudget: boolean('acesso_planejamento').notNull().default(false),
  accessCalendar: boolean('acesso_calendario').notNull().default(false),

  // Relatórios e painel
  accessDashboard: boolean('acesso_painel').notNull().default(false),
  accessReports: boolean('acesso_relatorios').notNull().default(false),
  accessNotifications: boolean('acesso_notificacoes').notNull().default(false),
  accessAssistant: boolean('acesso_assistente').notNull().default(false),

  // Configurações
  accessAccounts: boolean('acesso_contas').notNull().default(false),
  accessCategories: boolean('acesso_categorias').notNull().default(false),
  accessCards: boolean('acesso_cartoes').notNull().default(false),
  accessServices: boolean('acesso_servicos').notNull().default(false),
  accessRepresentatives: boolean('acesso_representantes').notNull().default(false),
  accessPartners: boolean('acesso_socios').notNull().default(false),
  accessMembers: boolean('acesso_membros').notNull().default(false),
  accessSubscription: boolean('acesso_assinatura').notNull().default(false),

  // Comercial (visível apenas em conta tipo empresa)
  accessClients: boolean('acesso_clientes').notNull().default(false),
  accessContracts: boolean('acesso_contratos').notNull().default(false),
  accessProductCatalog: boolean('acesso_catalogo_produtos').notNull().default(false),

  updatedAt: timestamp('data_atualizacao').defaultNow(),
});

export type MemberPermissions = typeof memberPermissions.$inferSelect;
export type NewMemberPermissions = typeof memberPermissions.$inferInsert;
