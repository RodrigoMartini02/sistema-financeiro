// Endereços do app de Licitações (escopo, seção 9.3). O sistema mora em
// `/licitacoes/app`; `/licitacoes` fica reservado para a página pública futura
// e, até lá, abre o sistema: o próprio app troca o endereço, nunca um 301.

export const TENDERS_APP_BASE = '/licitacoes/app';
const MODULE_ROOT = '/licitacoes';

interface AddressParts {
  pathname: string;
  search: string;
  hash: string;
}

/**
 * Endereço que substitui o atual quando a pessoa chega fora do sistema
 * (`/licitacoes`, `/licitacoes/` ou outro caminho de `/licitacoes/` que não seja
 * o app), mantendo a query e o hash. Dentro de `/licitacoes/app`, null.
 */
export function appAddressFor(location: AddressParts): string | null {
  const { pathname } = location;
  const insideApp = pathname === TENDERS_APP_BASE || pathname.startsWith(`${TENDERS_APP_BASE}/`);
  const insideModule = pathname === MODULE_ROOT || pathname.startsWith(`${MODULE_ROOT}/`);
  if (insideApp || !insideModule) {
    return null;
  }
  return `${TENDERS_APP_BASE}${location.search}${location.hash}`;
}
