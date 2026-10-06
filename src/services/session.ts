import { parseAuthOrigin, type AuthOrigin } from '../utils/authOrigin';

export type { AuthOrigin };

const AUTH_ORIGIN_KEY = 'auth_origin';

export function getToken(): string | null {
  return sessionStorage.getItem('token') ?? localStorage.getItem('token');
}

export function setAuthOrigin(origin: AuthOrigin) {
  sessionStorage.setItem(AUTH_ORIGIN_KEY, origin);
}

export function consumeAuthOrigin(): AuthOrigin {
  const origin = sessionStorage.getItem(AUTH_ORIGIN_KEY);
  sessionStorage.removeItem(AUTH_ORIGIN_KEY);
  return parseAuthOrigin(origin);
}

export function logout() {
  sessionStorage.removeItem('token');
  localStorage.removeItem('token');
  localStorage.removeItem('usuarioAtual');
  localStorage.removeItem('dadosUsuarioLogado');
  localStorage.removeItem('contaAtivaId');
  localStorage.removeItem('contaAtivaNome');
  localStorage.removeItem('contaAtivaTipo');
}
