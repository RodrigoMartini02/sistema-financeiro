import type { AppSection } from '../layout/AppShell';
import type { ConfigItemId } from '../layout/ConfigPanel';
import type { FlowIntent } from '../services/assistantFlowService';
import type { DashboardEntries } from '../services/financeService';
import type { PermissionFlag } from '../types/permissions';

/**
 * O que a pessoa logada pode ver e usar, a partir das próprias permissões
 * (titular e admin recebem todas liberadas do servidor). Só esconde o que
 * daria erro: quem barra de verdade é o servidor.
 */
export type PermissionSet = Partial<Record<PermissionFlag, boolean>>;

export type AccountType = 'pessoal' | 'empresa';

function allows(permissions: PermissionSet, flag: PermissionFlag): boolean {
  return permissions[flag] === true;
}

// ── Menu ───────────────────────────────────────────────────────────────────

/** Seções do menu, na ordem dele. Clientes é só de conta empresa (como sempre foi). */
export function visibleSections(permissions: PermissionSet, accountType: AccountType | null): AppSection[] {
  const sections: AppSection[] = [];
  if (allows(permissions, 'accessDashboard')) sections.push('painel');
  if (allows(permissions, 'accessExpenses') || allows(permissions, 'accessIncomes')) sections.push('movimentacoes');
  if (allows(permissions, 'accessReports')) sections.push('reports');
  if (accountType !== 'pessoal' && allows(permissions, 'accessClients')) sections.push('clientes');
  return sections;
}

/**
 * Seção a mostrar: a atual, se continua liberada; senão Movimentações, que é a
 * entrada de sempre; senão a primeira liberada. null: nenhuma tela liberada.
 * O editor do fluxo do assistente tem regra própria no menu e não entra aqui.
 */
export function resolveSection(current: AppSection, sections: AppSection[]): AppSection | null {
  if (current === 'fluxo-assistente' || sections.includes(current)) return current;
  if (sections.includes('movimentacoes')) return 'movimentacoes';
  return sections[0] ?? null;
}

// ── Movimentações ──────────────────────────────────────────────────────────

export interface MovementControls {
  newExpense: boolean;
  newIncome: boolean;
  calendar: boolean;
  planning: boolean;
}

export function movementControls(permissions: PermissionSet): MovementControls {
  return {
    newExpense: allows(permissions, 'accessExpenses'),
    newIncome: allows(permissions, 'accessIncomes'),
    calendar: allows(permissions, 'accessCalendar'),
    planning: allows(permissions, 'accessBudget'),
  };
}

/** Lançamentos que a pessoa pode buscar. null: nem receitas nem despesas. */
export function dashboardEntries(permissions: PermissionSet): DashboardEntries | null {
  const incomes = allows(permissions, 'accessIncomes');
  const expenses = allows(permissions, 'accessExpenses');
  if (incomes && expenses) return 'all';
  if (incomes) return 'incomes';
  if (expenses) return 'expenses';
  return null;
}

// ── Configurações ──────────────────────────────────────────────────────────

export interface ConfigItemContext {
  /** Titular ou admin: assinatura e permissões são só deles. */
  isOwner: boolean;
  isAdmin: boolean;
  canViewAnalytics: boolean;
  accountType: AccountType | null;
}

const CONFIG_ITEM_FLAG: Partial<Record<ConfigItemId, PermissionFlag>> = {
  contas: 'accessAccounts',
  categorias: 'accessCategories',
  'classificacoes-receita': 'accessCategories',
  cartoes: 'accessCards',
  servicos: 'accessServices',
  catalogo: 'accessProductCatalog',
  representantes: 'accessRepresentatives',
  socios: 'accessPartners',
};

/** Representantes, sócios, serviços e produtos não existem em conta pessoal. */
const COMPANY_ONLY_ITEMS: ReadonlySet<ConfigItemId> = new Set(['representantes', 'socios', 'servicos', 'catalogo']);

export function isConfigItemVisible(item: ConfigItemId, permissions: PermissionSet, context: ConfigItemContext): boolean {
  if (item === 'acessos') return context.canViewAnalytics;
  if (item === 'integracoes-ia') return context.isAdmin;
  if (item === 'assinatura' || item === 'permissoes') return context.isOwner;
  if (COMPANY_ONLY_ITEMS.has(item) && context.accountType === 'pessoal') return false;
  const flag = CONFIG_ITEM_FLAG[item];
  return flag !== undefined && allows(permissions, flag);
}

// ── Cadastros ──────────────────────────────────────────────────────────────

export type CatalogName =
  | 'accounts'
  | 'expenseCategories'
  | 'incomeCategories'
  | 'cards'
  | 'clients'
  | 'contracts'
  | 'representatives'
  | 'services'
  | 'products';

interface CatalogRule {
  manageFlag: PermissionFlag;
  /** 'anyMember': a lista de contas, que o servidor já limita à conta da pessoa. */
  listReaders: readonly PermissionFlag[] | 'anyMember';
}

// Espelho de CATALOG_RULES em backend/src/utils/catalogAccess.ts (a regra que
// vale é a do servidor): mudar uma exige mudar a outra.
const CATALOG_RULES: Record<CatalogName, CatalogRule> = {
  accounts: { manageFlag: 'accessAccounts', listReaders: 'anyMember' },
  expenseCategories: { manageFlag: 'accessCategories', listReaders: ['accessExpenses'] },
  incomeCategories: { manageFlag: 'accessCategories', listReaders: ['accessIncomes', 'accessRepresentatives', 'accessContracts'] },
  cards: { manageFlag: 'accessCards', listReaders: ['accessExpenses'] },
  clients: { manageFlag: 'accessClients', listReaders: ['accessIncomes'] },
  contracts: { manageFlag: 'accessContracts', listReaders: ['accessIncomes'] },
  representatives: { manageFlag: 'accessRepresentatives', listReaders: ['accessIncomes', 'accessContracts'] },
  services: { manageFlag: 'accessServices', listReaders: ['accessContracts'] },
  products: { manageFlag: 'accessProductCatalog', listReaders: ['accessIncomes'] },
};

/** Criar, editar e excluir no cadastro (ex.: "+ cadastrar" nos modais). */
export function canManageCatalog(permissions: PermissionSet, catalog: CatalogName): boolean {
  return allows(permissions, CATALOG_RULES[catalog].manageFlag);
}

/** Ler a listagem do cadastro (para escolher num campo ou num filtro). */
export function canReadCatalogList(permissions: PermissionSet, catalog: CatalogName): boolean {
  const rule = CATALOG_RULES[catalog];
  if (allows(permissions, rule.manageFlag) || rule.listReaders === 'anyMember') return true;
  return rule.listReaders.some((flag) => allows(permissions, flag));
}

// ── Assistente ─────────────────────────────────────────────────────────────

/** Opções da abertura do assistente que a pessoa pode seguir. */
export function allowedAssistantIntents(permissions: PermissionSet): FlowIntent[] {
  const intents: FlowIntent[] = [];
  // Pagar usa as rotas de despesa, como o botão "Pagar" do desktop.
  if (allows(permissions, 'accessExpenses')) intents.push('register_expense', 'pay_expense');
  if (allows(permissions, 'accessIncomes')) intents.push('register_income');
  intents.push('ask');
  return intents;
}
