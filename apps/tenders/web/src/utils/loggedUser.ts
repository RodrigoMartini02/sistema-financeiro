// Nome de quem está logado, gravado pelo login em `dadosUsuarioLogado`
// (LoginPage). O módulo não chama outra rota só para isso.

const LOGGED_USER_KEY = 'dadosUsuarioLogado';
const FALLBACK_NAME = 'Usuário';

export function loggedUserName(stored: string | null): string {
  if (!stored) {
    return FALLBACK_NAME;
  }
  try {
    const user = JSON.parse(stored) as { nome?: unknown; sobrenome?: unknown };
    const name = [user.nome, user.sobrenome].filter((part): part is string => typeof part === 'string' && part.trim() !== '').join(' ');
    return name.trim() || FALLBACK_NAME;
  } catch {
    return FALLBACK_NAME;
  }
}

export function readLoggedUserName(): string {
  return loggedUserName(localStorage.getItem(LOGGED_USER_KEY));
}
