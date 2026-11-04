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
