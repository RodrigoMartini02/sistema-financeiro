import type { ExpiredSubscriptionInfo } from '../types';

// Entrada no módulo: o que a tela mostra conforme a sessão e a resposta de
// GET /api/tenders/access (escopo, seções 9.3 e 11; plano licitacoes-produto).

export type TendersGateState = 'login' | 'loading' | 'noModule' | 'memberWithoutAccess' | 'expired' | 'error' | 'ready';

export interface TendersGateInput {
  hasToken: boolean;
  accessStatus: 'pending' | 'success' | 'error';
  /** Status HTTP do erro de /access; 0 = sem resposta (rede). */
  errorStatus: number | null;
}

const HTTP_UNAUTHORIZED = 401;
const HTTP_PAYMENT_REQUIRED = 402;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

/**
 * - sem token ou sessão vencida (401): login embutido;
 * - conta sem o módulo (404): "sem acesso", com a ativação para o titular;
 * - assinatura vencida (402): a assinatura para o titular, o aviso para o colaborador;
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
    case HTTP_PAYMENT_REQUIRED:
      return 'expired';
    case HTTP_NOT_FOUND:
      return 'noModule';
    case HTTP_FORBIDDEN:
      return 'memberWithoutAccess';
    default:
      return 'error';
  }
}

/** `data` do 402: o papel de quem entrou e a conta vencida; null se a resposta não trouxer os dois. */
export function expiredInfoFrom(data: unknown): ExpiredSubscriptionInfo | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const { role, account } = data as Record<string, unknown>;
  if ((role !== 'TITULAR' && role !== 'COLABORADOR') || typeof account !== 'object' || account === null) {
    return null;
  }
  const { id, name, type } = account as Record<string, unknown>;
  if (typeof id !== 'number' || typeof name !== 'string' || (type !== 'pessoal' && type !== 'empresa')) {
    return null;
  }
  return { role, account: { id, name, type } };
}
