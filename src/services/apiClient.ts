import { logout } from './session';

interface ApiEnvelope<T> {
  success?: boolean;
  message?: string;
  data?: T;
  errors?: unknown;
}

export function getApiUrl() {
  const { hostname, port } = window.location;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  if (!isLocal) return 'https://sistema-financeiro-backend-o199.onrender.com/api';
  // Em dev (Vite proxy) usa URL relativa; em produção servida pelo backend usa path absoluto
  return port === '5173' ? '/api' : 'http://localhost:3010/api';
}

export function getActiveProfileId() {
  const raw = localStorage.getItem('perfilAtivoId');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function apiRequest<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
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
    throw new Error(payload.message ?? 'Nao foi possivel concluir a requisicao');
  }

  return (payload.data ?? payload) as T;
}
