import type { SiteSolution } from '../brand';

export const LOGIN_REQUEST_PARAM = 'entrar';
export const FINANCE_LOGIN_ADDRESS = `/financas/?${LOGIN_REQUEST_PARAM}=1`;
export const TENDERS_LOGIN_ADDRESS = `/licitacoes/?${LOGIN_REQUEST_PARAM}=1`;

const GOOGLE_STATE_BY_SOLUTION: Record<SiteSolution, string> = {
  finance: 'google-oauth:finance',
  tenders: 'google-oauth:tenders',
};

/** O retorno do Google identifica a solução sem depender da sessão de outra. */
export function googleStateForSolution(solution: SiteSolution): string {
  return GOOGLE_STATE_BY_SOLUTION[solution];
}

export function solutionFromGoogleState(state: string | null): SiteSolution | null {
  if (state === GOOGLE_STATE_BY_SOLUTION.finance) return 'finance';
  if (state === GOOGLE_STATE_BY_SOLUTION.tenders) return 'tenders';
  return null;
}

export function googleOAuthUrl(solution: SiteSolution, redirectUri: string, clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
    state: googleStateForSolution(solution),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function destinationAfterAuth(solution: SiteSolution, financeOrigin: string | null): string {
  if (solution === 'tenders') return '/licitacoes/app';
  return financeOrigin === 'assistant' ? '/assistant.html' : '/app.html';
}
