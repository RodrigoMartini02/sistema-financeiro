import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

// Validação de pedidos do módulo de Licitações. Cópia enxuta do `middleware/validation.ts` de Finanças (os dois
// backends são independentes): só o que o módulo usa.

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

interface AttemptData {
  attempts: number;
  firstAttempt: number;
  blockedUntil: number | null;
}

/** Campo do pedido que, junto com o IP, identifica quem está tentando. */
type RateLimitField = 'documento' | 'email';

/** O login aceita CNPJ, CPF ou e-mail no mesmo campo: e-mail conta por e-mail, não num balde só por IP. */
function rateLimitIdentity(req: Request, field: RateLimitField): string {
  const value = String(req.body?.[field] ?? '').trim();
  return field === 'email' || value.includes('@') ? value.toLowerCase() : value.replace(/[^\d]+/g, '');
}

function minutesLabel(minutes: number): string {
  return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
}

interface AuthRateLimiterOptions {
  windowMs?: number;
  maxAttempts?: number;
  blockMs?: number;
  now?: () => number;
}

/**
 * Limite de tentativas das rotas públicas de acesso (login e pedido de código): por IP e documento ou e-mail.
 * Mais de `maxAttempts` na janela bloqueia por `blockMs`. Em memória: vale por instância do servidor.
 */
export function authRateLimiter(field: RateLimitField, options: AuthRateLimiterOptions = {}) {
  const loginAttempts = new Map<string, AttemptData>();
  const WINDOW_MS = options.windowMs ?? 15 * 60 * 1000;
  const MAX_ATTEMPTS = options.maxAttempts ?? 5;
  const BLOCK_DURATION = options.blockMs ?? 30 * 60 * 1000;
  const clock = options.now ?? Date.now;

  setInterval(() => {
    const now = clock();
    for (const [key, data] of loginAttempts.entries()) {
      if (now - data.firstAttempt > WINDOW_MS + BLOCK_DURATION) loginAttempts.delete(key);
    }
  }, 5 * 60 * 1000).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const key = `${ip}:${rateLimitIdentity(req, field)}`;
    const now = clock();

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
