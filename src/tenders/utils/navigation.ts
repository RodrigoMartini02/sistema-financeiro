// Rotas e menu do app de Licitações (escopo, seção 9.3), relativas à base
// `/licitacoes/app`. Os ícones ficam no menu; aqui só a parte testável.

import { cnpjFromSearchText, cnpjPagePath } from './cnpj';

export type TendersRouteKey =
  | 'dashboard'
  | 'buscar'
  | 'contratos'
  | 'contrato'
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
  /** Só para quem administra o módulo na conta (titular ou admin). */
  restricted: boolean;
  /** Só para o admin da plataforma (habilitação de contas). */
  platformAdminOnly: boolean;
}

export const TENDERS_ROUTES: readonly TendersRoute[] = [
  { key: 'dashboard', path: '/', title: 'Dashboard', inMenu: true, restricted: false, platformAdminOnly: false },
  { key: 'buscar', path: '/buscar', title: 'Editais', inMenu: true, restricted: false, platformAdminOnly: false },
  { key: 'contratos', path: '/contratos', title: 'Contratos a vencer', inMenu: true, restricted: false, platformAdminOnly: false },
  { key: 'contrato', path: '/contratos/:chave', title: 'Contrato', inMenu: false, restricted: false, platformAdminOnly: false },
  { key: 'cnpj', path: '/cnpj/:cnpj', title: 'CNPJ', inMenu: false, restricted: false, platformAdminOnly: false },
  { key: 'edital', path: '/editais/:id', title: 'Edital', inMenu: false, restricted: false, platformAdminOnly: false },
  { key: 'buscas', path: '/buscas', title: 'Buscas salvas', inMenu: true, restricted: false, platformAdminOnly: false },
  { key: 'favoritos', path: '/favoritos', title: 'Favoritos', inMenu: true, restricted: false, platformAdminOnly: false },
  { key: 'acompanhamento', path: '/acompanhamento', title: 'Acompanhamento', inMenu: true, restricted: false, platformAdminOnly: false },
  { key: 'configuracoes', path: '/configuracoes', title: 'Configurações', inMenu: true, restricted: true, platformAdminOnly: false },
  { key: 'contas', path: '/admin/contas', title: 'Contas habilitadas', inMenu: true, restricted: false, platformAdminOnly: true },
];

export const NOT_FOUND_TITLE = 'Página não encontrada';

/** Permissões que `GET /api/tenders/access` devolve. */
export interface TendersPermissions {
  manageTeam: boolean;
  /** Assinatura (pagar e cancelar): só o titular. */
  manageBilling: boolean;
  viewCollectionRuns: boolean;
  /** Cortesia das contas no módulo: só o admin da plataforma. */
  manageEnabledAccounts: boolean;
}

/** Configurações do módulo: usuários e assinatura (titular) e coleta (titular ou admin). */
export function canOpenSettings(permissions: TendersPermissions): boolean {
  return permissions.manageTeam || permissions.manageBilling || permissions.viewCollectionRuns;
}

export function menuRoutes(permissions: TendersPermissions): TendersRoute[] {
  return TENDERS_ROUTES.filter(
    (route) =>
      route.inMenu &&
      (!route.restricted || canOpenSettings(permissions)) &&
      (!route.platformAdminOnly || permissions.manageEnabledAccounts),
  );
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
