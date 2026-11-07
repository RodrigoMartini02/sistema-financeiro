import type { PermissionFlag } from '../middleware/permissions';

/**
 * Quem pode usar cada cadastro compartilhado da conta, para membros e
 * colaboradores (titular e admin passam sempre, ver requireCatalogAccess).
 *
 * A permissão do cadastro dá acesso completo: listar, ver, criar, editar e
 * excluir. A listagem também fica aberta a quem tem uma permissão que depende
 * dela — lançar despesa precisa escolher a categoria e o cartão, por exemplo —
 * sem dar o detalhe nem a escrita.
 *
 * Espelhada no front em src/utils/screenAccess.ts, que só esconde botões e
 * evita pedidos que seriam recusados: mudar uma exige mudar a outra.
 */
export type CatalogName =
  | 'accounts'
  | 'expenseCategories'
  | 'incomeCategories'
  | 'cards'
  | 'clients'
  | 'contracts'
  | 'representatives'
  | 'services'
  | 'products'
  | 'sectors'
  | 'jobTitles';

/** Qualquer membro lê a listagem — a rota já devolve só o que é dele. */
export const ANY_MEMBER = 'anyMember';

interface CatalogRule {
  manageFlag: PermissionFlag;
  listReaders: readonly PermissionFlag[] | typeof ANY_MEMBER;
  /** Caminhos da listagem, relativos à montagem da rota (`req.path`). */
  listPaths: readonly string[];
}

export const CATALOG_RULES: Record<CatalogName, CatalogRule> = {
  accounts: { manageFlag: 'accessAccounts', listReaders: ANY_MEMBER, listPaths: ['/'] },
  expenseCategories: { manageFlag: 'accessCategories', listReaders: ['accessExpenses'], listPaths: ['/'] },
  // Representantes têm comissão por categoria; o contrato escolhe a categoria
  // da mensalidade e da implantação.
  incomeCategories: {
    manageFlag: 'accessCategories',
    listReaders: ['accessIncomes', 'accessRepresentatives', 'accessContracts'],
    listPaths: ['/'],
  },
  cards: { manageFlag: 'accessCards', listReaders: ['accessExpenses'], listPaths: ['/', '/limites'] },
  clients: { manageFlag: 'accessClients', listReaders: ['accessIncomes'], listPaths: ['/'] },
  // O lançamento de receita lista só os contratos com banco de horas.
  contracts: { manageFlag: 'accessContracts', listReaders: ['accessIncomes'], listPaths: ['/with-hours'] },
  representatives: {
    manageFlag: 'accessRepresentatives',
    listReaders: ['accessIncomes', 'accessContracts'],
    listPaths: ['/'],
  },
  services: { manageFlag: 'accessServices', listReaders: ['accessContracts'], listPaths: ['/'] },
  products: { manageFlag: 'accessProductCatalog', listReaders: ['accessIncomes'], listPaths: ['/'] },
  // Só quem mantém a tela lista: o modal do colaborador, que escolhe setor e
  // cargo, é do titular, que sempre passa.
  sectors: { manageFlag: 'accessSectors', listReaders: [], listPaths: ['/'] },
  jobTitles: { manageFlag: 'accessJobTitles', listReaders: [], listPaths: ['/'] },
};

export type CatalogPermissions = Partial<Record<PermissionFlag, boolean>>;

export function isCatalogListRequest(catalog: CatalogName, method: string, path: string): boolean {
  return method === 'GET' && CATALOG_RULES[catalog].listPaths.includes(path);
}

/** `permissions` null: membro sem linha de permissões, tratado como tudo desligado. */
export function canAccessCatalog(
  catalog: CatalogName,
  permissions: CatalogPermissions | null,
  isListRequest: boolean,
): boolean {
  const rule = CATALOG_RULES[catalog];
  if (permissions?.[rule.manageFlag] === true) {
    return true;
  }
  if (!isListRequest) {
    return false;
  }
  if (rule.listReaders === ANY_MEMBER) {
    return true;
  }
  return rule.listReaders.some((flag) => permissions?.[flag] === true);
}
