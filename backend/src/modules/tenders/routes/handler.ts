import type { Request, RequestHandler, Response } from 'express';
import { sendRequestError } from '../../../utils/requestInput';

/**
 * Rota do módulo: erro do pedido (RequestInputError) volta com a mensagem e o
 * status dele; qualquer outro é registrado com o contexto e volta com a
 * mensagem genérica, sem detalhe interno.
 */
export function tenderRoute(
  context: string,
  fallbackMessage: string,
  handler: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      sendRequestError(res, error, context, req.user?.id, fallbackMessage);
    }
  };
}
