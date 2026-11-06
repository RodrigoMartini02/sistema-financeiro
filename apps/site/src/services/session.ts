import { createSession, type StoredSessionUser } from '@ui/auth/session';
import type { SiteSolution } from '../brand';
import { destinationAfterAuth } from '../utils/authNavigation';

const sessions = {
  finance: createSession('finance'),
  tenders: createSession('tenders'),
};

/** O site grava somente a sessão da solução pela qual a pessoa entrou. */
export function sessionForSolution(solution: SiteSolution) {
  return sessions[solution];
}

export function saveProductSession(solution: SiteSolution, token: string, user: StoredSessionUser): string {
  const session = sessionForSolution(solution);
  session.setSession(token, user);
  const origin = solution === 'finance' ? session.consumeLoginOrigin() : null;
  return destinationAfterAuth(solution, origin);
}
