import type { Request, RequestHandler, Response } from 'express';
import { sendRequestError } from '../../../utils/requestInput';
import { ContractStoreTimeoutError, ContractStoreUnavailableError } from '../contractStore/reader';

/** Códigos da resposta quando o armazém de contratos não pode responder (a tela mostra o estado "atualizando"). */
export const CONTRACT_STORE_UPDATING_CODE = 'CONTRACT_STORE_UPDATING';
export const CONTRACT_SEARCH_TIMEOUT_CODE = 'CONTRACT_SEARCH_TIMEOUT';

/**
 * Rota do módulo: erro do pedido (RequestInputError) volta com a mensagem e o
 * status dele; armazém de contratos sem cópia pronta volta 503 e consulta que
 * passou do limite de tempo, 504, cada um com o seu código; qualquer outro é
 * registrado com o contexto e volta com a mensagem genérica, sem detalhe
 * interno.
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
      if (error instanceof ContractStoreUnavailableError) {
        res.status(503).json({ success: false, code: CONTRACT_STORE_UPDATING_CODE, message: error.message });
        return;
      }
      if (error instanceof ContractStoreTimeoutError) {
        res.status(504).json({ success: false, code: CONTRACT_SEARCH_TIMEOUT_CODE, message: error.message });
        return;
      }
      sendRequestError(res, error, context, req.user?.id, fallbackMessage);
    }
  };
}
