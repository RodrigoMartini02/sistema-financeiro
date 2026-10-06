// Entrada no módulo: o que a tela mostra conforme a sessão e a resposta de
// GET /api/tenders/access (escopo, seções 9.3 e 11).

export type TendersGateState = 'login' | 'loading' | 'noModule' | 'memberWithoutAccess' | 'error' | 'ready';

export interface TendersGateInput {
  hasToken: boolean;
  accessStatus: 'pending' | 'success' | 'error';
  /** Status HTTP do erro de /access; 0 = sem resposta (rede). */
  errorStatus: number | null;
}

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

/**
 * - sem token ou sessão vencida (401): login embutido;
 * - conta sem o módulo (404): "sem acesso";
 * - colaborador sem acesso liberado (403): "sem acesso", pedindo ao titular;
 * - qualquer outro erro: mensagem e "tentar de novo".
 */
export function resolveGateState({ hasToken, accessStatus, errorStatus }: TendersGateInput): TendersGateState {
  if (!hasToken) {
    return 'login';
  }
  if (accessStatus === 'pending') {
    return 'loading';
  }
  if (accessStatus === 'success') {
    return 'ready';
  }
  switch (errorStatus) {
    case HTTP_UNAUTHORIZED:
      return 'login';
    case HTTP_NOT_FOUND:
      return 'noModule';
    case HTTP_FORBIDDEN:
      return 'memberWithoutAccess';
    default:
      return 'error';
  }
}
