// "state" do OAuth do Mercado Pago: diz, na volta da autorização, qual conta
// PJ e qual usuário iniciaram a conexão. Assinado e com validade curta, para
// ninguém ligar a conta Mercado Pago dele à loja de outra pessoa. Sem acesso
// ao banco nem ao ambiente: o segredo é passado.
import jwt from 'jsonwebtoken';

const STATE_PURPOSE = 'mp-connect';
const STATE_TTL_SECONDS = 15 * 60;

export interface ConnectState {
  accountId: number;
  userId: number;
}

export class ConnectStateError extends Error {}

export function signConnectState(state: ConnectState, secret: string): string {
  return jwt.sign({ purpose: STATE_PURPOSE, accountId: state.accountId, userId: state.userId }, secret, {
    expiresIn: STATE_TTL_SECONDS,
  });
}

/** Volta da autorização: assinatura, propósito e validade conferidos. */
export function readConnectState(token: string, secret: string): ConnectState {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, secret);
  } catch {
    throw new ConnectStateError('Conexão expirada ou inválida. Tente conectar de novo.');
  }
  const payload = decoded as { purpose?: unknown; accountId?: unknown; userId?: unknown };
  if (payload.purpose !== STATE_PURPOSE
    || !Number.isInteger(payload.accountId) || !Number.isInteger(payload.userId)) {
    throw new ConnectStateError('Conexão expirada ou inválida. Tente conectar de novo.');
  }
  return { accountId: payload.accountId as number, userId: payload.userId as number };
}
