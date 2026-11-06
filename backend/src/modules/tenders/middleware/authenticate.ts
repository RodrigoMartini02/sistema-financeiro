import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { users } from '../db/identity';
import { blockedAccessMessage } from '../services/authMessages';
import { verifyTendersToken, type TendersAuthConfig } from '../services/authTokens';
import { logAuthFailure } from '../utils/authLogging';

/**
 * Quem fez o pedido. Tipo e documento vêm do banco a cada pedido (o token só diz quem é): quem foi rebaixado,
 * desativado ou bloqueado perde o poder anterior no próximo pedido. Fica em `req.tendersUser`, separado do
 * `req.user` de Finanças.
 */
export interface TendersUser {
  id: number;
  document: string;
  type: 'membro' | 'titular' | 'admin';
}

declare global {
  namespace Express {
    interface Request {
      tendersUser?: TendersUser;
    }
  }
}

/** Autenticação de Licitações: token do módulo (segredo e público próprios) e usuário do banco do módulo. */
export function createTendersAuthenticate(db: TendersDb, config: Pick<TendersAuthConfig, 'jwtSecret'>): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      if (!token) {
        res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
        return;
      }

      const decoded = verifyTendersToken(token, config);

      const [user] = await db
        .select({ status: users.status, type: users.type, document: users.document })
        .from(users)
        .where(eq(users.id, decoded.id))
        .limit(1);
      if (!user) {
        res.status(401).json({ success: false, message: 'Sessão inválida. Entre de novo.' });
        return;
      }
      const blockedMessage = blockedAccessMessage(user.status);
      if (blockedMessage) {
        res.status(401).json({ success: false, message: blockedMessage });
        return;
      }

      req.tendersUser = { id: decoded.id, document: user.document ?? '', type: user.type };
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({ success: false, message: 'Token expired. Please log in again.' });
        return;
      }
      if (error instanceof jwt.JsonWebTokenError) {
        res.status(401).json({ success: false, message: 'Invalid token.' });
        return;
      }
      logAuthFailure('authenticate');
      res.status(500).json({ success: false, message: 'Não foi possível validar a sessão agora. Tente de novo em instantes.' });
    }
  };
}

/** Admin da plataforma de Licitações: o único papel de backoffice do módulo. */
export function requireTendersAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.tendersUser || req.tendersUser.type !== 'admin') {
    res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
    return;
  }
  next();
}
