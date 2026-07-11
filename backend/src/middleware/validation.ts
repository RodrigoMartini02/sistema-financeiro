import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

export function validate(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: errors.array().map((err) => ({ field: err.type === 'field' ? err.path : '', message: err.msg })),
    });
    return;
  }
  next();
}

export function validateDocument(document: string): boolean {
  const doc = document.replace(/[^\d]+/g, '');
  if (doc.length === 11) return validateCpf(doc);
  if (doc.length === 14) return validateCnpj(doc);
  return false;
}

function validateCpf(cpf: string): boolean {
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 1; i <= 9; i++) sum += parseInt(cpf[i - 1]!) * (11 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf[9]!)) return false;
  sum = 0;
  for (let i = 1; i <= 10; i++) sum += parseInt(cpf[i - 1]!) * (12 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  return remainder === parseInt(cpf[10]!);
}

function validateCnpj(cnpj: string): boolean {
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  let size = cnpj.length - 2;
  let numbers = cnpj.substring(0, size);
  const digits = cnpj.substring(size);
  let sum = 0;
  let pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += Number(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== Number(digits.charAt(0))) return false;
  size++;
  numbers = cnpj.substring(0, size);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += Number(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return result === Number(digits.charAt(1));
}

export function rateLimiter() {
  const requests = new Map<string, number[]>();
  const WINDOW_MS = 60 * 1000;
  const MAX_REQUESTS = parseInt(process.env['REQUEST_LIMIT'] ?? '100');

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const recent = (requests.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_REQUESTS) {
      res.status(429).json({ success: false, message: 'Too many requests. Try again later.' });
      return;
    }
    recent.push(now);
    requests.set(ip, recent);
    next();
  };
}

interface AttemptData {
  attempts: number;
  firstAttempt: number;
  blockedUntil: number | null;
}

export function authRateLimiter() {
  const loginAttempts = new Map<string, AttemptData>();
  const WINDOW_MS = 15 * 60 * 1000;
  const MAX_ATTEMPTS = 5;
  const BLOCK_DURATION = 30 * 60 * 1000;

  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of loginAttempts.entries()) {
      if (now - data.firstAttempt > WINDOW_MS + BLOCK_DURATION) loginAttempts.delete(key);
    }
  }, 5 * 60 * 1000);

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const document = (req.body?.documento as string | undefined)?.replace(/[^\d]+/g, '') ?? '';
    const key = `${ip}:${document}`;
    const now = Date.now();

    if (!loginAttempts.has(key)) {
      loginAttempts.set(key, { attempts: 0, firstAttempt: now, blockedUntil: null });
    }

    const data = loginAttempts.get(key)!;

    if (data.blockedUntil && now < data.blockedUntil) {
      const minutesLeft = Math.ceil((data.blockedUntil - now) / 60000);
      res.status(429).json({
        success: false,
        message: `Too many login attempts. Try again in ${minutesLeft} minutes.`,
        blockedUntil: data.blockedUntil,
      });
      return;
    }

    if (now - data.firstAttempt > WINDOW_MS) {
      data.attempts = 0;
      data.firstAttempt = now;
      data.blockedUntil = null;
    }

    data.attempts++;

    if (data.attempts > MAX_ATTEMPTS) {
      data.blockedUntil = now + BLOCK_DURATION;
      res.status(429).json({
        success: false,
        message: 'Too many login attempts. Account temporarily blocked for 30 minutes.',
        blockedUntil: data.blockedUntil,
      });
      return;
    }

    res.setHeader('X-RateLimit-Remaining', MAX_ATTEMPTS - data.attempts);
    res.setHeader('X-RateLimit-Reset', data.firstAttempt + WINDOW_MS);
    next();
  };
}
