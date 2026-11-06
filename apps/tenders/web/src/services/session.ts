import { createSession } from '@ui/auth/session';

const session = createSession('tenders');

export const getToken = session.getToken;
export const getUser = session.getUser;
export const setSession = session.setSession;
export const logout = session.clear;
