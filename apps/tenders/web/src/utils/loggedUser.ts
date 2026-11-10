import { getToken, getUser, setSession } from '../services/session';

// Nome de quem está logado na sessão de Licitações, sem outra consulta à API.
const FALLBACK_NAME = 'Usuário';
const USER_CHANGED_EVENT = 'tenders:user-changed';

export function loggedUserName(user: unknown): string {
  if (typeof user !== 'object' || user === null) {
    return FALLBACK_NAME;
  }
  const { nome, sobrenome } = user as Record<string, unknown>;
  const name = [nome, sobrenome].filter((part): part is string => typeof part === 'string' && part.trim() !== '').join(' ');
  return name.trim() || FALLBACK_NAME;
}

export function readLoggedUserName(): string {
  return loggedUserName(getUser());
}

/** O titular mudou o próprio nome nas Configurações: a sessão guarda o nome novo e a barra superior o mostra. */
export function rememberLoggedUserName(name: string, lastName: string | null): void {
  const token = getToken();
  const user = getUser();
  if (!token || !user) {
    return;
  }
  setSession(token, { ...user, nome: name, sobrenome: lastName });
  window.dispatchEvent(new Event(USER_CHANGED_EVENT));
}

/** Avisa quando `rememberLoggedUserName` mudou o nome; devolve a função que cancela. */
export function subscribeToLoggedUser(onChange: () => void): () => void {
  window.addEventListener(USER_CHANGED_EVENT, onChange);
  return () => window.removeEventListener(USER_CHANGED_EVENT, onChange);
}
