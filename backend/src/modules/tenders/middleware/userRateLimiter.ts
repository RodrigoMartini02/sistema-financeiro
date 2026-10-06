import type { NextFunction, Request, Response } from 'express';

// Limite de pedidos por usuário logado, no padrão do ipRateLimiter de
// middleware/validation.ts (em memória, vale por instância do servidor).
// É por usuário, não por IP: o servidor não configura `trust proxy`, e atrás do
// proxy do Render o IP visto tende a ser o mesmo para todos.

interface UserWindow {
  count: number;
  windowStart: number;
}

export function userRateLimiter({ max, windowMs, message }: { max: number; windowMs: number; message: string }) {
  const windows = new Map<number, UserWindow>();

  setInterval(() => {
    const now = Date.now();
    for (const [userId, data] of windows.entries()) {
      if (now - data.windowStart > windowMs) windows.delete(userId);
    }
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
      return;
    }
    const now = Date.now();
    const current = windows.get(req.user.id);
    const data = current && now - current.windowStart <= windowMs ? current : { count: 0, windowStart: now };
    data.count += 1;
    windows.set(req.user.id, data);
    if (data.count > max) {
      res.status(429).json({ success: false, message });
      return;
    }
    next();
  };
}
