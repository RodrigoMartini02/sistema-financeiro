import type { Request, RequestHandler, Response } from 'express';
import { logAuthFailure, type AuthOperation } from '../utils/authLogging';
import { RequestInputError } from '../utils/requestInput';

/** Authentication errors must never put query parameters, codes or credentials in the log. */
export function authRoute(
  operation: AuthOperation,
  fallbackMessage: string,
  handler: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof RequestInputError) {
        res.status(error.status).json({ success: false, message: error.message });
        return;
      }
      logAuthFailure(operation);
      res.status(500).json({ success: false, message: fallbackMessage });
    }
  };
}
