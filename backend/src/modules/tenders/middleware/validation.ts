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
