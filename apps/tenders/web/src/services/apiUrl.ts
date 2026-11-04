// Endereço da API usado pelo app de Licitações. Cópia própria da de Finanças: o
// backend ainda é o mesmo serviço; o de Licitações ganha o seu na Etapa 4.

const PRODUCTION_API_URL = 'https://sistema-financeiro-backend-o199.onrender.com/api';

/** Em desenvolvimento, o proxy do Vite (`/api`, porta 5173) ou o servidor local; fora do localhost, a produção. */
export function resolveApiUrl({ hostname, port }: { hostname: string; port: string }): string {
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  if (!isLocal) return PRODUCTION_API_URL;
  return port === '5173' ? '/api' : 'http://localhost:3010/api';
}

export function getApiUrl(): string {
  return resolveApiUrl(window.location);
}
