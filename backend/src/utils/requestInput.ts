// Leitura dos pedidos das rotas de lançamento (corpo e query string), sem acesso
// ao banco. Os erros levam a mensagem em português que o app mostra e o status
// HTTP da resposta.
import type { Response } from 'express';

/** Maior valor que cabe nas colunas decimal(10,2). */
export const MAX_AMOUNT = 99_999_999.99;

const MAX_DESCRIPTION_LENGTH = 255;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const BRAZIL_STATES: ReadonlySet<string> = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ',
  'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

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

export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Valor em reais maior que zero, até o limite da coluna. */
export function readAmount(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RequestInputError(message);
  }
  if (value > MAX_AMOUNT) {
    throw new RequestInputError('Valor acima do limite permitido');
  }
  return roundCents(value);
}

export function readOptionalId(value: unknown, message: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new RequestInputError(message);
  }
  return value;
}

export function readDescription(value: unknown): string {
  const description = typeof value === 'string' ? value.trim() : '';
  if (!description) {
    throw new RequestInputError('Informe a descrição');
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new RequestInputError(`Descrição: até ${MAX_DESCRIPTION_LENGTH} caracteres`);
  }
  return description;
}

/** Só os dígitos do texto (CPF, CNPJ, CEP, telefone); outro tipo vira texto vazio. */
export function digitsOf(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

/** Texto obrigatório aparado. `label` leva o artigo: "Informe o nome", "O nome: até 150 caracteres". */
export function readRequiredText(value: unknown, label: string, min: number, max: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min) {
    throw new RequestInputError(`Informe ${label}`);
  }
  if (text.length > max) {
    throw new RequestInputError(`${label[0]!.toUpperCase()}${label.slice(1)}: até ${max} caracteres`);
  }
  return text;
}

/** Texto opcional aparado: vazio vira null. `label` compõe as mensagens ("Cliente inválido"). */
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

/** Lista de anexos (objetos); lista vazia vira null. */
export function readAttachments(value: unknown): unknown[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'object' && item !== null)) {
    throw new RequestInputError('Anexos inválidos');
  }
  return value.length > 0 ? value : null;
}

export function readQueryText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function readQueryId(value: unknown, message: string): number | null {
  if (value === undefined || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new RequestInputError(message);
  }
  return id;
}

/** Id obrigatório, na query ou no corpo: ausente ou inválido volta com `message`. */
export function readRequiredId(value: unknown, message: string): number {
  const id = typeof value === 'number' || typeof value === 'string' ? readQueryId(value, message) : null;
  if (id === null) {
    throw new RequestInputError(message);
  }
  return id;
}

/** Texto digitado pela pessoa usado dentro de um LIKE: `%` e `_` valem como texto. */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}
