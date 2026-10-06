import { getApiUrl } from '../../services/apiClient';
import { getToken, logout } from '../../services/session';
import { NETWORK_ERROR_MESSAGE, TendersApiError, tendersErrorFrom } from './tendersApiError';

// Cliente da API usado pelo app de Licitações. Igual ao do app de finanças
// (mesma URL, token e saída no 401), mas o erro guarda o status HTTP.

interface ApiEnvelope<T> {
  success?: boolean;
  message?: string;
  data?: T;
}

/** Pedido à API (`apiPath` a partir de /api, ex.: `/tenders/access`). Devolve `data`. */
export async function apiJson<T>(apiPath: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${getApiUrl()}${apiPath}`, { ...init, headers });
  } catch {
    throw new TendersApiError(NETWORK_ERROR_MESSAGE, 0);
  }
  const payload: unknown = await response.json().catch(() => ({}));

  if (response.status === 401) {
    logout();
    throw tendersErrorFrom(401, payload);
  }
  if (!response.ok || (payload as ApiEnvelope<T>).success === false) {
    throw tendersErrorFrom(response.status, payload);
  }
  return ((payload as ApiEnvelope<T>).data ?? payload) as T;
}

/** Pedido às rotas do módulo (`/api/tenders...`). */
export function tendersRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return apiJson<T>(`/tenders${path}`, init);
}
