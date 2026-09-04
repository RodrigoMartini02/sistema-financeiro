import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getPlanStatusForUser, isPlanAccessActive } from '../services/plan-lifecycle';

interface TokenPayload {
  id: number;
  document: string;
  type: 'padrao' | 'gestor' | 'admin';
  tipo?: 'padrao' | 'gestor' | 'admin';
  documento?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  return secret;
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
      return;
    }

    const decoded = jwt.verify(token, getJwtSecret()) as TokenPayload;
    req.user = {
      id: decoded.id,
      document: decoded.document ?? decoded.documento ?? '',
      type: decoded.type ?? decoded.tipo ?? 'padrao',
    };
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ success: false, message: 'Invalid token.' });
      return;
    }
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ success: false, message: 'Token expired. Please log in again.' });
      return;
    }
    res.status(500).json({ success: false, message: 'Failed to verify authentication.' });
  }
}

// Gestor (dono de conta) ou Admin (plataforma) — acesso de escopo de conta.
export function requireGestor(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || (req.user.type !== 'gestor' && req.user.type !== 'admin')) {
    res.status(403).json({ success: false, message: 'Access denied. Account managers only.' });
    return;
  }
  next();
}

// Admin (desenvolvedor/dono da plataforma) — acesso total, único papel de backoffice.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.type !== 'admin') {
    res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
    return;
  }
  next();
}

export async function requireActivePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    return;
  }

  try {
    const planStatus = await getPlanStatusForUser(req.user.id);
    if (!planStatus) {
      res.status(401).json({ success: false, message: 'Access denied.' });
      return;
    }

    if (!isPlanAccessActive(planStatus.status)) {
      res.status(403).json({
        success: false,
        code: 'PLAN_EXPIRED',
        message: 'Plan expired. Renew to continue using the system.',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Plan access verification failed:', (error as Error).message);
    res.status(500).json({ success: false, message: 'Failed to verify plan access.' });
  }
}
