const AUTH_ORIGIN_KEY = 'auth_origin';

export type AuthOrigin = 'assistant' | 'app';

export function getToken(): string | null {
  return sessionStorage.getItem('token') ?? localStorage.getItem('token');
}

export function setAuthOrigin(origin: AuthOrigin) {
  sessionStorage.setItem(AUTH_ORIGIN_KEY, origin);
}

export function consumeAuthOrigin(): AuthOrigin {
  const origin = sessionStorage.getItem(AUTH_ORIGIN_KEY);
  sessionStorage.removeItem(AUTH_ORIGIN_KEY);
  return origin === 'assistant' ? 'assistant' : 'app';
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
