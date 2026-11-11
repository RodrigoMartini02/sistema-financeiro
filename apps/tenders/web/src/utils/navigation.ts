// Rotas e menu do app de Licitações (escopo, seção 9.3), relativas à base
// `/licitacoes/app`. Os ícones ficam no menu; aqui só a parte testável.

import { cnpjFromSearchText, cnpjPagePath } from './cnpj';

export type TendersRouteKey =
  | 'dashboard'
  | 'buscar'
  | 'contratos'
  | 'contrato'
  | 'concorrentes'
  | 'cnpj'
  | 'edital'
  | 'buscas'
  | 'favoritos'
  | 'acompanhamento'
  | 'configuracoes'
  | 'contas';

export interface TendersRoute {
  key: TendersRouteKey;
  path: string;
  title: string;
  /** Aparece no menu lateral (o edital e o contrato abrem pela lista, não pelo menu). */
  inMenu: boolean;
  /** Só para o admin da plataforma (habilitação de contas). */
  platformAdminOnly: boolean;
}

export const TENDERS_ROUTES: readonly TendersRoute[] = [
  { key: 'dashboard', path: '/', title: 'Dashboard', inMenu: true, platformAdminOnly: false },
  { key: 'buscar', path: '/buscar', title: 'Editais', inMenu: true, platformAdminOnly: false },
  { key: 'contratos', path: '/contratos', title: 'Contratos a vencer', inMenu: true, platformAdminOnly: false },
  { key: 'contrato', path: '/contratos/:chave', title: 'Contrato', inMenu: false, platformAdminOnly: false },
  { key: 'concorrentes', path: '/concorrentes', title: 'Concorrentes', inMenu: true, platformAdminOnly: false },
  { key: 'cnpj', path: '/cnpj/:cnpj', title: 'CNPJ', inMenu: false, platformAdminOnly: false },
  { key: 'edital', path: '/editais/:id', title: 'Edital', inMenu: false, platformAdminOnly: false },
  { key: 'buscas', path: '/buscas', title: 'Buscas salvas', inMenu: true, platformAdminOnly: false },
  { key: 'favoritos', path: '/favoritos', title: 'Favoritos', inMenu: true, platformAdminOnly: false },
  { key: 'acompanhamento', path: '/acompanhamento', title: 'Acompanhamento', inMenu: true, platformAdminOnly: false },
  // Configurações não é uma página: abre em modal (botão no menu lateral). A rota fica só para o retorno da cobrança do
  // Mercado Pago, que redireciona para o modal (utils/settings.ts).
  { key: 'configuracoes', path: '/configuracoes', title: 'Configurações', inMenu: false, platformAdminOnly: false },
  { key: 'contas', path: '/admin/contas', title: 'Contas habilitadas', inMenu: true, platformAdminOnly: true },
];

export const NOT_FOUND_TITLE = 'Página não encontrada';

/** Permissões que `GET /api/tenders/access` devolve. */
export interface TendersPermissions {
  manageTeam: boolean;
  /** Perfil da empresa (ver, editar e consultar o CNPJ): só o titular. */
  manageCompany: boolean;
  /** Assinatura (pagar e cancelar): só o titular. */
  manageBilling: boolean;
  viewCollectionRuns: boolean;
  /** Cortesia das contas no módulo: só o admin da plataforma. */
  manageEnabledAccounts: boolean;
}

export function menuRoutes(permissions: TendersPermissions): TendersRoute[] {
  return TENDERS_ROUTES.filter((route) => route.inMenu && (!route.platformAdminOnly || permissions.manageEnabledAccounts));
}

/** Rota do caminho (relativo à base), para o título da barra; desconhecido: null. */
export function routeForPath(pathname: string): TendersRoute | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return (
    TENDERS_ROUTES.find((route) => {
      const pattern = new RegExp(`^${route.path.replace(/:[^/]+/g, '[^/]+')}$`);
      return pattern.test(path || '/');
    }) ?? null
  );
}

/**
 * Busca rápida da barra superior: um CNPJ válido leva à página dele; o resto, para Editais com o texto; vazio não navega.
 */
export function quickSearchPath(text: string): string | null {
  const query = text.trim();
  if (!query) return null;
  const cnpj = cnpjFromSearchText(query);
  return cnpj ? cnpjPagePath(cnpj) : `/buscar?q=${encodeURIComponent(query)}`;
}
