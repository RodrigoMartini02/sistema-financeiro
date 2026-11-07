// Erros de pedido do módulo de Licitações: a mensagem em português que o app mostra e o status HTTP da resposta.
// Cópia enxuta do `utils/requestInput.ts` de Finanças (os dois backends são independentes): só o que o módulo usa.
import type { Response } from 'express';

export class RequestInputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Erro do pedido volta com a mensagem dele; qualquer outro é registrado e volta com a mensagem genérica. */
export function sendRequestError(
  res: Response,
  error: unknown,
  context: string,
  userId: number | undefined,
  fallbackMessage: string,
): void {
  if (error instanceof RequestInputError) {
    res.status(error.status).json({ success: false, message: error.message });
    return;
  }
  console.error(context, { userId, error });
  res.status(500).json({ success: false, message: fallbackMessage });
}

export function readRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RequestInputError(message);
  }
  return value as Record<string, unknown>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

export function readIsoDate(value: unknown, message: string): string {
  if (typeof value !== 'string' || !isValidIsoDate(value)) {
    throw new RequestInputError(message);
  }
  return value;
}

export function readOptionalIsoDate(value: unknown, message: string): string | null {
  if (value === undefined || value === null) return null;
  return readIsoDate(value, message);
}

/** Texto opcional aparado: vazio vira null. `label` compõe as mensagens ("Nome fantasia inválido"). */
export function readOptionalText(value: unknown, label: string, maxLength: number): string | null {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new RequestInputError(`${label} inválido`);
  }
  const text = typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
  if (text !== null && text.length > maxLength) {
    throw new RequestInputError(`${label}: até ${maxLength} caracteres`);
  }
  return text;
}
