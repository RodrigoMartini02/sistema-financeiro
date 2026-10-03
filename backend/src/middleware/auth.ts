import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import { blockedAccessMessage } from '../utils/authMessages';
import { getRequesterPlanStatus, isPlanAccessActive } from '../services/plan-lifecycle';

// Papel dentro da conta a que o usuario esta vinculado — so informativo
// (ex.: qual rotulo/tela mostrar). Nunca usado para decidir acesso a dado:
// toda checagem de visibilidade/permissao continua consultando o banco
// (familyVisibility.ts, permissions.ts), porque o token pode estar
// desatualizado se o papel mudar depois de emitido.
type MemberRole = 'member' | 'collaborator';

interface TokenPayload {
  id: number;
  document: string;
  type: 'membro' | 'titular' | 'admin';
  tipo?: 'membro' | 'titular' | 'admin';
  documento?: string;
  role?: MemberRole | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  return secret;
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
      return;
    }

    const decoded = jwt.verify(token, getJwtSecret()) as TokenPayload;

    // O status vem do banco a cada pedido (o token não sabe dele): quem foi
    // desativado ou bloqueado perde a sessão aberta no próximo pedido.
    const [account] = await db.select({ status: users.status }).from(users).where(eq(users.id, decoded.id)).limit(1);
    if (!account) {
      res.status(401).json({ success: false, message: 'Sessão inválida. Entre de novo.' });
      return;
    }
    const blockedMessage = blockedAccessMessage(account.status);
    if (blockedMessage) {
      res.status(401).json({ success: false, message: blockedMessage });
      return;
    }

    req.user = {
      id: decoded.id,
      document: decoded.document ?? decoded.documento ?? '',
      type: decoded.type ?? decoded.tipo ?? 'membro',
      role: decoded.role ?? null,
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
    console.error('Authenticate error:', error);
    res.status(500).json({ success: false, message: 'Não foi possível validar a sessão agora. Tente de novo em instantes.' });
  }
}

// Titular (dono de conta) ou Admin (plataforma) — acesso de escopo de conta.
export function requireTitular(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || (req.user.type !== 'titular' && req.user.type !== 'admin')) {
    res.status(403).json({ success: false, message: 'Access denied. Account owners only.' });
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
    // Membro ativo usa o plano do titular da conta (resolvePlanHolder).
    const planStatus = await getRequesterPlanStatus(req.user.id);
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
