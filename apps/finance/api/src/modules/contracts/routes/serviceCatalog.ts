import { Router, Request, Response } from 'express';
import { readActiveInput } from '../../../services/clientInput';
import { CLIENTS_PERSONAL_ACCOUNT_MESSAGE } from '../../../services/clients';
import { readCatalogServiceInput } from '../../../services/contractInput';
import {
  createCatalogService, findCatalogServiceForRequester, listCatalogServices, renameCatalogService, setCatalogServiceActive,
} from '../../../services/serviceCatalog';
import { resolveCompanyAccount } from '../../../utils/accountAccess';
import { readRecord, readRequiredId, sendRequestError } from '../../../utils/requestInput';

// Montada em /api/service-catalog com authenticate, requireActivePlan e
// requireCatalogAccess('services'): a lista também abre para quem cuida de contratos.
const router = Router();

function readServiceId(req: Request): number {
  return readRequiredId(req.params['id'], 'Serviço não encontrado');
}

// GET /api/service-catalog?accountId=&includeInactive=true
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const account = await resolveCompanyAccount(
      req.user!.id,
      readRequiredId(req.query['accountId'], 'Informe a conta'),
      CLIENTS_PERSONAL_ACCOUNT_MESSAGE,
    );
    const includeInactive = req.query['includeInactive'] === 'true';
    res.json({ success: true, data: await listCatalogServices(account.id, includeInactive) });
  } catch (error) {
    sendRequestError(res, error, 'List catalog services error:', req.user?.id, 'Não foi possível carregar os serviços agora.');
  }
});

// POST /api/service-catalog { accountId, name }
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = readRecord(req.body, 'Dados do serviço inválidos');
    const account = await resolveCompanyAccount(
      req.user!.id,
      readRequiredId(body['accountId'], 'Informe a conta'),
      CLIENTS_PERSONAL_ACCOUNT_MESSAGE,
    );
    const { name } = readCatalogServiceInput(body);
    res.status(201).json({ success: true, message: 'Serviço cadastrado', data: await createCatalogService(account, name) });
  } catch (error) {
    sendRequestError(res, error, 'Create catalog service error:', req.user?.id, 'Não foi possível cadastrar o serviço agora.');
  }
});

// PUT /api/service-catalog/:id { name }
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const service = await findCatalogServiceForRequester(req.user!.id, readServiceId(req));
    const { name } = readCatalogServiceInput(req.body);
    res.json({ success: true, message: 'Serviço atualizado', data: await renameCatalogService(service, name) });
  } catch (error) {
    sendRequestError(res, error, 'Update catalog service error:', req.user?.id, 'Não foi possível salvar o serviço agora.');
  }
});

// PUT /api/service-catalog/:id/active { active } — desativar ou reativar
router.put('/:id/active', async (req: Request, res: Response): Promise<void> => {
  try {
    const service = await findCatalogServiceForRequester(req.user!.id, readServiceId(req));
    const active = readActiveInput(req.body);
    res.json({ success: true, data: await setCatalogServiceActive(service, active) });
  } catch (error) {
    sendRequestError(res, error, 'Change catalog service status error:', req.user?.id, 'Não foi possível mudar a situação do serviço agora.');
  }
});

export default router;
