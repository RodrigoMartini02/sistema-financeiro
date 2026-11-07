export function isTendersAppPath(pathname: string): boolean {
  return pathname === '/licitacoes/app' || pathname.startsWith('/licitacoes/app/');
}
