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

/** Só CPF (11 dígitos, com dígito verificador); a pontuação é ignorada. */
export function isValidCpf(document: string): boolean {
  const doc = document.replace(/[^\d]+/g, '');
  return doc.length === 11 && validateCpf(doc);
}

/** Só CNPJ (14 dígitos, com dígito verificador); a pontuação é ignorada. */
export function isValidCnpj(document: string): boolean {
  const doc = document.replace(/[^\d]+/g, '');
  return doc.length === 14 && validateCnpj(doc);
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

interface AttemptData {
  attempts: number;
  firstAttempt: number;
  blockedUntil: number | null;
}

/** Campo do pedido que, junto com o IP, identifica quem está tentando. */
type RateLimitField = 'documento' | 'email';

function rateLimitIdentity(req: Request, field: RateLimitField): string {
  const value = String(req.body?.[field] ?? '');
  return field === 'email' ? value.trim().toLowerCase() : value.replace(/[^\d]+/g, '');
}

function minutesLabel(minutes: number): string {
  return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
}

export function authRateLimiter(field: RateLimitField) {
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
    const key = `${ip}:${rateLimitIdentity(req, field)}`;
    const now = Date.now();

    if (!loginAttempts.has(key)) {
      loginAttempts.set(key, { attempts: 0, firstAttempt: now, blockedUntil: null });
    }

    const data = loginAttempts.get(key)!;

    if (data.blockedUntil && now < data.blockedUntil) {
      const minutesLeft = Math.ceil((data.blockedUntil - now) / 60000);
      res.status(429).json({
        success: false,
        message: `Muitas tentativas. Tente de novo em ${minutesLabel(minutesLeft)}.`,
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
        message: `Muitas tentativas. Tente de novo em ${minutesLabel(BLOCK_DURATION / 60000)}.`,
        blockedUntil: data.blockedUntil,
      });
      return;
    }

    res.setHeader('X-RateLimit-Remaining', MAX_ATTEMPTS - data.attempts);
    res.setHeader('X-RateLimit-Reset', data.firstAttempt + WINDOW_MS);
    next();
  };
}

interface IpWindow {
  count: number;
  windowStart: number;
}

/**
 * Limite simples por IP para rotas públicas que geram custo ou dados (ex.:
 * criar pedido com cobrança na vitrine): no máximo `max` pedidos por janela.
 * Em memória, como o authRateLimiter — vale por instância do servidor.
 */
export function ipRateLimiter({ max, windowMs, message }: { max: number; windowMs: number; message: string }) {
  const windows = new Map<string, IpWindow>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of windows.entries()) {
      if (now - data.windowStart > windowMs) windows.delete(key);
    }
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const current = windows.get(ip);
    const data = current && now - current.windowStart <= windowMs ? current : { count: 0, windowStart: now };
    data.count += 1;
    windows.set(ip, data);
    if (data.count > max) {
      res.status(429).json({ success: false, message });
      return;
    }
    next();
  };
}
