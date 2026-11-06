import { getUser } from '../services/session';

// Nome de quem está logado na sessão de Licitações, sem outra consulta à API.
const FALLBACK_NAME = 'Usuário';

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
