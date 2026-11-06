import { createSession } from '@ui/auth/session';
import { parseAuthOrigin, type AuthOrigin } from '../utils/authOrigin';

export type { AuthOrigin };

const session = createSession('finance');

export const { getToken, getUser, setSession, getActiveAccountId, getActiveAccountName, getActiveAccountType, setActiveAccount } = session;

export function setAuthOrigin(origin: AuthOrigin) {
  session.setLoginOrigin(origin);
}

export function consumeAuthOrigin(): AuthOrigin {
  return parseAuthOrigin(session.consumeLoginOrigin());
}

export function logout() {
  session.clear();
}
