import { logout } from './session';
import { resolveDemoRequest } from './demo/fakeApiResolver';
import { getDemoDatabase } from './demo/demoDatabaseSingleton';

interface ApiEnvelope<T> {
  success?: boolean;
  message?: string;
  data?: T;
  errors?: unknown;
}

// Documento demo.html (sempre carregado isoladamente, nunca embutido via JS na Home real —
// a Home embute a demo via <iframe>, um documento/contexto JS totalmente separado). Esta
// checagem é estática por página carregada, não uma flag runtime compartilhada, então não há
// como uma chamada da Home real "vazar" para o banco fake, nem vice-versa.
const IS_DEMO_DOCUMENT = typeof window !== 'undefined' && window.location.pathname.endsWith('/demo.html');

export function getApiUrl() {
  const { hostname, port } = window.location;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  if (!isLocal) return 'https://sistema-financeiro-backend-o199.onrender.com/api';
  // Em dev (Vite proxy) usa URL relativa; em produção servida pelo backend usa path absoluto
  return port === '5173' ? '/api' : 'http://localhost:3010/api';
}

export function getActiveAccountId() {
  const raw = localStorage.getItem('contaAtivaId');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function apiRequest<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
  // Dentro do documento demo.html, toda requisição é resolvida contra um banco fake em
  // memória — nunca toca rede real, sessão real ou localStorage/sessionStorage de sessão
  // real. Fora desse documento (Home real, app autenticado), comportamento inalterado.
  if (IS_DEMO_DOCUMENT) {
    return resolveDemoRequest(getDemoDatabase(), endpoint, { method: init.method, body: init.body as string | undefined }) as T;
  }

  const token = sessionStorage.getItem('token') ?? localStorage.getItem('token');
  const headers = new Headers(init.headers);

  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${getApiUrl()}${endpoint}`, { ...init, headers });
  const payload = await response.json().catch(() => ({})) as ApiEnvelope<T>;

  if (response.status === 401) {
    logout();
    throw new Error('Sessao expirada');
  }

  if (!response.ok || payload.success === false) {
    throw new Error(payload.message ?? 'Não foi possível concluir a requisição');
  }

  return (payload.data ?? payload) as T;
}
