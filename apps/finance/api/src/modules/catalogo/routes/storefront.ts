import { Router, Request, Response } from 'express';
import { authenticate } from '../../../middleware/auth';
import { requireScreenAccess } from '../../../middleware/permissions';
import { getOrCreateStorefront, updateStorefront } from '../../../services/storefront';
import { readStorefrontInput } from '../../../services/storefrontInput';
import { resolveCompanyAccount } from '../../../utils/accountAccess';
import { readRequiredId, sendRequestError } from '../../../utils/requestInput';

const PERSONAL_ACCOUNT_MESSAGE = 'A vitrine só existe em conta de empresa';

const router = Router();

// GET /api/catalogo/storefront?conta_id= — configuração da vitrine da conta PJ,
// criada na primeira leitura com o link gerado do nome fantasia.
router.get('/', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const account = await resolveCompanyAccount(
      req.user!.id,
      readRequiredId(req.query['conta_id'], 'Informe a conta'),
      PERSONAL_ACCOUNT_MESSAGE,
    );
    res.json({ success: true, data: await getOrCreateStorefront(account) });
  } catch (error) {
    sendRequestError(res, error, 'Get storefront error:', req.user?.id, 'Não foi possível carregar a vitrine agora.');
  }
});

// PUT /api/catalogo/storefront { conta_id, nome, descricao, whatsapp, link, logo }
router.put('/', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const input = readStorefrontInput(req.body);
    const account = await resolveCompanyAccount(req.user!.id, input.accountId, PERSONAL_ACCOUNT_MESSAGE);
    res.json({ success: true, message: 'Vitrine salva', data: await updateStorefront(account, input) });
  } catch (error) {
    sendRequestError(res, error, 'Update storefront error:', req.user?.id, 'Não foi possível salvar a vitrine agora.');
  }
});

export default router;
