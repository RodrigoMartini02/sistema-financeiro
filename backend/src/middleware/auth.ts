import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import { blockedAccessMessage } from '../utils/authMessages';
import {
  getRequesterPlanStatus,
  isHolderDefaultAccount,
  isPlanAccessActive,
  type RequesterPlanStatus,
} from '../services/plan-lifecycle';

/** Código da recusa de recurso do Premium: o app mostra o aviso de assinar. */
const PLAN_UPGRADE_REQUIRED = 'PLAN_UPGRADE_REQUIRED';

const PREMIUM_FEATURE_MESSAGE = 'Recurso do plano Premium.';
const TEAM_NOT_IN_PLAN_MESSAGE = 'O plano da conta não inclui equipe. Peça ao titular para assinar o Premium.';
const DEFAULT_ACCOUNT_ONLY_MESSAGE = 'No plano Starter, só a Conta Padrão fica liberada.';

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

function sendPlanUpgradeRequired(res: Response, message: string): void {
  res.status(403).json({ success: false, code: PLAN_UPGRADE_REQUIRED, message });
}

// O status calculado por requireActivePlan fica no pedido, para
// requirePremiumPlan (que vem depois dele) não consultar o banco de novo.
const PLAN_STATUS_LOCAL = 'planStatus';

function rememberPlanStatus(res: Response, planStatus: RequesterPlanStatus): void {
  res.locals[PLAN_STATUS_LOCAL] = planStatus;
}

function rememberedPlanStatus(res: Response): RequesterPlanStatus | undefined {
  return res.locals[PLAN_STATUS_LOCAL] as RequesterPlanStatus | undefined;
}

/** `conta_id` do pedido (query ou corpo), quando é um id válido. */
function readRequestAccountId(req: Request): number | null {
  const body = req.body as Record<string, unknown> | undefined;
  const raw = req.query['conta_id'] ?? body?.['conta_id'];
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return null;
  }

  const accountId = Number(raw);
  return Number.isSafeInteger(accountId) && accountId > 0 ? accountId : null;
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

    // Sem Premium (Starter): equipe e outras contas ficam travadas, e só a
    // Conta Padrão do dono do plano é usada.
    if (!planStatus.premiumFeatures) {
      if (planStatus.isAccountMember) {
        sendPlanUpgradeRequired(res, TEAM_NOT_IN_PLAN_MESSAGE);
        return;
      }

      const requestedAccountId = readRequestAccountId(req);
      if (requestedAccountId !== null && !(await isHolderDefaultAccount(planStatus.holderId, requestedAccountId))) {
        sendPlanUpgradeRequired(res, DEFAULT_ACCOUNT_ONLY_MESSAGE);
        return;
      }
    }

    rememberPlanStatus(res, planStatus);
    next();
  } catch (error) {
    console.error('Plan access verification failed:', (error as Error).message);
    res.status(500).json({ success: false, message: 'Failed to verify plan access.' });
  }
}

/** Recurso do Premium: vem depois de requireActivePlan (ou consulta o plano sozinho). */
export async function requirePremiumPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    return;
  }

  try {
    const planStatus = rememberedPlanStatus(res) ?? (await getRequesterPlanStatus(req.user.id));
    if (!planStatus) {
      res.status(401).json({ success: false, message: 'Access denied.' });
      return;
    }

    if (!planStatus.premiumFeatures) {
      sendPlanUpgradeRequired(res, PREMIUM_FEATURE_MESSAGE);
      return;
    }

    next();
  } catch (error) {
    console.error('Premium plan verification failed:', { userId: req.user.id, error: (error as Error).message });
    res.status(500).json({ success: false, message: 'Failed to verify plan access.' });
  }
}
