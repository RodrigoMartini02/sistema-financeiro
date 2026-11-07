import jwt from 'jsonwebtoken';

// Token de sessão de Licitações. Segredo próprio (TENDERS_JWT_SECRET) e público próprio (`aud`): um token de
// Finanças não vale aqui, e o de Licitações não vale em Finanças, mesmo que alguém repita o segredo por engano.

export const TENDERS_TOKEN_AUDIENCE = 'licitacoes';
const MIN_SECRET_LENGTH = 32;
const DEFAULT_EXPIRES_IN = '7d';

export interface TendersAuthConfig {
  jwtSecret: string;
  /** Validade do token, no formato do jsonwebtoken (`7d`, `12h`, segundos). */
  jwtExpiresIn: string;
}

export interface TokenUser {
  id: number;
  document: string | null;
  type: 'membro' | 'titular' | 'admin';
}

/** Conteúdo do token: só quem é; o status e o tipo vêm do banco a cada pedido. */
export interface TendersTokenPayload {
  id: number;
  documento: string | null;
  tipo: TokenUser['type'];
}

/** Lê o segredo e a validade do ambiente; sem o segredo, ou com um curto demais, o servidor não sobe. */
export function readTendersAuthConfig(env: NodeJS.ProcessEnv): TendersAuthConfig {
  const jwtSecret = env['TENDERS_JWT_SECRET'];
  if (!jwtSecret) {
    throw new Error('TENDERS_JWT_SECRET is not set');
  }
  if (jwtSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`TENDERS_JWT_SECRET must have at least ${MIN_SECRET_LENGTH} characters`);
  }
  return { jwtSecret, jwtExpiresIn: env['JWT_EXPIRES_IN'] ?? DEFAULT_EXPIRES_IN };
}

export function signTendersToken(user: TokenUser, config: TendersAuthConfig): string {
  const payload: TendersTokenPayload = { id: user.id, documento: user.document, tipo: user.type };
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    audience: TENDERS_TOKEN_AUDIENCE,
  });
}

/** Confere assinatura, validade e público; lança o erro do jsonwebtoken quando não vale. */
export function verifyTendersToken(token: string, config: Pick<TendersAuthConfig, 'jwtSecret'>): TendersTokenPayload {
  const decoded = jwt.verify(token, config.jwtSecret, { audience: TENDERS_TOKEN_AUDIENCE, algorithms: ['HS256'] });
  if (typeof decoded === 'string' || !Number.isSafeInteger(decoded['id']) || decoded['id'] <= 0) {
    throw new jwt.JsonWebTokenError('invalid token payload');
  }
  return decoded as unknown as TendersTokenPayload;
}
