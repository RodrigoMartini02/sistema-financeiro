import type { NextFunction, Request, Response } from 'express';
import type { TendersDb } from '../collector/database';
import { resolveTenderAccess, type TenderAccess } from '../services/access';

declare global {
  namespace Express {
    interface Request {
      /** Conta e papel no módulo de Licitações, resolvidos por requireTenderAccess. */
      tenderAccess?: TenderAccess;
    }
  }
}

const MEMBER_WITHOUT_ACCESS = 'Seu acesso ao módulo de Licitações ainda não foi liberado pelo titular da conta.';
const TITULAR_ONLY = 'Só o titular da conta pode fazer isso no módulo de Licitações.';
const ACCESS_CHECK_FAILED = 'Não foi possível conferir o acesso ao módulo agora. Tente de novo em instantes.';

const MAX_INTEGER_ID = 2_147_483_647;

/** `accountId` da query: ausente vira null; fora de inteiro positivo, inválido. */
export function readAccountIdParam(value: unknown): number | null | 'invalid' {
  if (value === undefined || value === '') {
    return null;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return 'invalid';
  }
  const id = Number(value);
  return id > 0 && id <= MAX_INTEGER_ID ? id : 'invalid';
}

/** Mesma resposta da rota inexistente do server.ts: quem não tem o módulo não descobre que ele existe. */
export function respondRouteNotFound(req: Request, res: Response): void {
  res.status(404).json({ success: false, message: 'Route not found', path: req.originalUrl.split('?')[0] });
}

/** Conta não habilitada, inativa ou alheia: 404. Colaborador sem acesso: 403. */
export function createRequireTenderAccess(db: TendersDb) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
      return;
    }
    const requestedAccountId = readAccountIdParam(req.query['accountId']);
    if (requestedAccountId === 'invalid') {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: [{ field: 'accountId', message: 'Conta inválida' }],
      });
      return;
    }

    try {
      const result = await resolveTenderAccess(db, req.user, requestedAccountId);
      if (!result.allowed) {
        if (result.reason === 'memberWithoutAccess') {
          res.status(403).json({ success: false, message: MEMBER_WITHOUT_ACCESS });
          return;
        }
        respondRouteNotFound(req, res);
        return;
      }
      req.tenderAccess = result.access;
      next();
    } catch (error) {
      console.error('Tender access check failed:', { userId: req.user.id, error: (error as Error).message });
      res.status(500).json({ success: false, message: ACCESS_CHECK_FAILED });
    }
  };
}

/** Acesso resolvido pela trava do módulo; as rotas só rodam depois dela. */
export function tenderAccessOf(req: Request): TenderAccess {
  if (!req.tenderAccess) {
    throw new Error('requireTenderAccess não rodou antes da rota');
  }
  return req.tenderAccess;
}

/** Equipe e configurações do módulo: só o titular da conta. */
export function requireTenderTitular(req: Request, res: Response, next: NextFunction): void {
  if (tenderAccessOf(req).role !== 'TITULAR') {
    res.status(403).json({ success: false, message: TITULAR_ONLY });
    return;
  }
  next();
}

/** Histórico de execuções da coleta: titular da conta ou admin da plataforma. */
export function requireTenderTitularOrAdmin(req: Request, res: Response, next: NextFunction): void {
  const access = tenderAccessOf(req);
  if (access.role !== 'TITULAR' && !access.isPlatformAdmin) {
    res.status(403).json({ success: false, message: TITULAR_ONLY });
    return;
  }
  next();
}
