import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface TokenPayload {
  id: number;
  document: string;
  type: 'padrao' | 'admin' | 'master';
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
    req.user = { id: decoded.id, document: decoded.document, type: decoded.type };
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

export function authenticateOptional(req: Request, res: Response, next: NextFunction): void {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      const decoded = jwt.verify(token, getJwtSecret()) as TokenPayload;
      req.user = { id: decoded.id, document: decoded.document, type: decoded.type };
    }
    next();
  } catch {
    next();
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || (req.user.type !== 'admin' && req.user.type !== 'master')) {
    res.status(403).json({ success: false, message: 'Access denied. Admins only.' });
    return;
  }
  next();
}

export function requireMaster(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.type !== 'master') {
    res.status(403).json({ success: false, message: 'Access denied. Master user only.' });
    return;
  }
  next();
}
