import jwt from 'jsonwebtoken';

/**
 * As sessões atuais de Finanças não têm audience. Recusar tokens destinados a
 * outro serviço preserva essas sessões e impede usar o token de outro produto,
 * mesmo se os dois segredos forem configurados com o mesmo valor por engano.
 */
export function verifyFinanceToken(token: string, secret: string): jwt.JwtPayload {
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  if (typeof decoded === 'string' || !Number.isSafeInteger(decoded.id) || decoded.id <= 0) {
    throw new jwt.JsonWebTokenError('invalid token payload');
  }
  if (decoded.aud !== undefined) {
    throw new jwt.JsonWebTokenError('invalid token audience');
  }
  return decoded;
}
