// Para onde o login leva: o app em que ele começou fica guardado em
// `auth_origin` (sessionStorage) e decide o destino depois de entrar,
// inclusive na volta do Google, que passa pela página inicial.

export const AUTH_ORIGINS = ['app', 'assistant', 'tenders'] as const;
export type AuthOrigin = (typeof AUTH_ORIGINS)[number];

const DESTINATION_BY_ORIGIN: Record<AuthOrigin, string> = {
  app: '/app.html',
  assistant: '/assistant.html',
  tenders: '/licitacoes/app',
};

/** Origem guardada; ausente ou desconhecida vale como o app de finanças. */
export function parseAuthOrigin(value: string | null): AuthOrigin {
  return (AUTH_ORIGINS as readonly string[]).includes(value ?? '') ? (value as AuthOrigin) : 'app';
}

export function destinationForAuthOrigin(origin: AuthOrigin): string {
  return DESTINATION_BY_ORIGIN[origin];
}

/** Pedido de login numa página do site (`?entrar=1`): abre o login daquela solução. */
export const LOGIN_REQUEST_PARAM = 'entrar';

/** Entrada do FINGERENCE sem sessão ou ao sair: a página de Finanças com o login aberto. */
export const FINANCE_LOGIN_ADDRESS = `/produtos/financas/?${LOGIN_REQUEST_PARAM}=1`;
