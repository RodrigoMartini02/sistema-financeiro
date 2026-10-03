import { Router, Request, Response } from 'express';
import { authenticate } from '../../../middleware/auth';
import { requireScreenAccess } from '../../../middleware/permissions';
import {
  buildConnectUrl, completeConnection, disconnectMercadoPago, getConnectionStatus,
} from '../../../services/mercadoPagoAccounts';
import { resolveCompanyAccount } from '../../../utils/accountAccess';
import { readRequiredId, sendRequestError } from '../../../utils/requestInput';

const PERSONAL_ACCOUNT_MESSAGE = 'A vitrine só existe em conta de empresa';

function frontendUrl(): string {
  return process.env['FRONTEND_URL'] ?? 'https://fin-gerence.com.br';
}

/** Volta para "Produtos e estoque" com o resultado da conexão. */
function returnToApp(res: Response, result: 'conectado' | 'erro'): void {
  res.redirect(`${frontendUrl()}/app.html?config=catalogo&mercadoPago=${result}`);
}

const router = Router();

// GET /api/catalogo/mercado-pago/callback?code=&state= — volta da autorização
// no Mercado Pago (pública: quem identifica a conta é o "state" assinado).
router.get('/callback', async (req: Request, res: Response): Promise<void> => {
  const code = typeof req.query['code'] === 'string' ? req.query['code'] : '';
  const state = typeof req.query['state'] === 'string' ? req.query['state'] : '';
  if (!code || !state) {
    returnToApp(res, 'erro');
    return;
  }
  try {
    await completeConnection(code, state);
    returnToApp(res, 'conectado');
  } catch (error) {
    console.error('Mercado Pago connect callback error:', error);
    returnToApp(res, 'erro');
  }
});

async function readAccount(req: Request) {
  return resolveCompanyAccount(req.user!.id, readRequiredId(req.query['conta_id'], 'Informe a conta'), PERSONAL_ACCOUNT_MESSAGE);
}

// GET /api/catalogo/mercado-pago/status?conta_id=
router.get('/status', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const account = await readAccount(req);
    res.json({ success: true, data: await getConnectionStatus(account.id) });
  } catch (error) {
    sendRequestError(res, error, 'Mercado Pago status error:', req.user?.id, 'Não foi possível consultar o Mercado Pago agora.');
  }
});

// GET /api/catalogo/mercado-pago/connect?conta_id= — endereço da autorização
router.get('/connect', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const account = await readAccount(req);
    res.json({ success: true, data: { url: buildConnectUrl(account.id, req.user!.id) } });
  } catch (error) {
    sendRequestError(res, error, 'Mercado Pago connect error:', req.user?.id, 'Não foi possível iniciar a conexão agora.');
  }
});

// DELETE /api/catalogo/mercado-pago?conta_id=
router.delete('/', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const account = await readAccount(req);
    await disconnectMercadoPago(account.id);
    res.json({ success: true, message: 'Mercado Pago desconectado' });
  } catch (error) {
    sendRequestError(res, error, 'Mercado Pago disconnect error:', req.user?.id, 'Não foi possível desconectar agora.');
  }
});

export default router;
