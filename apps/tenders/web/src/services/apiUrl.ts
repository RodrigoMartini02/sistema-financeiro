const LEGACY_API_URL = 'https://sistema-financeiro-backend-o199.onrender.com/api';

/** Em desenvolvimento, o proxy do Vite (`/api`, porta 5173) ou o servidor local; fora do localhost, a produção. */
export function resolveApiUrl({ hostname, port }: { hostname: string; port: string }, configuredBase?: string): string {
  const base = configuredBase?.trim().replace(/\/+$/, '');
  if (base) return base;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  if (!isLocal) return LEGACY_API_URL;
  return port === '5173' ? '/api' : 'http://localhost:3011/api';
}

export function getApiUrl(): string {
  return resolveApiUrl(window.location, import.meta.env?.VITE_TENDERS_API_URL);
}
