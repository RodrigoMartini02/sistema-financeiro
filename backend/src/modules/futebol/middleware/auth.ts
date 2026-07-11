import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface FootballTokenPayload {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      futebolUser?: FootballTokenPayload;
    }
  }
}

export function getFootballJwtSecret(): string {
  const secret = process.env['FUTEBOL_JWT_SECRET'] ?? process.env['JWT_SECRET'];
  if (!secret) {
    throw new Error('FUTEBOL_JWT_SECRET or JWT_SECRET is not set');
  }
  return secret;
}

export function signFootballUser(payload: FootballTokenPayload): string {
  return jwt.sign(payload, getFootballJwtSecret(), { expiresIn: '7d' });
}

export function authenticateFootball(req: Request, res: Response, next: NextFunction): void {
  try {
    const header = req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      res.status(401).json({ error: 'Token nao fornecido' });
      return;
    }

    const decoded = jwt.verify(token, getFootballJwtSecret()) as FootballTokenPayload;
    req.futebolUser = { userId: decoded.userId, email: decoded.email };
    next();
  } catch {
    res.status(401).json({ error: 'Token invalido ou expirado' });
  }
}
