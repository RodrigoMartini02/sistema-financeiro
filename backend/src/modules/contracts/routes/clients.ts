import { Router, Request, Response } from 'express';
import { hasScreenAccess } from '../../../middleware/permissions';
import { readActiveInput, readClientInput, readClientListQuery } from '../../../services/clientInput';
import {
  CLIENTS_PERSONAL_ACCOUNT_MESSAGE, createClient, deleteClient, findClientForRequester, getClientsSummary,
  listClientIncomes, listClients, setClientActive, toClientView, updateClient,
} from '../../../services/clients';
import { resolveCompanyAccount } from '../../../utils/accountAccess';
import { getTodayIsoInTimezone } from '../../../utils/date';
import { resolveVisibleUserIds } from '../../../utils/familyVisibility';
import { RequestInputError, readRecord, readRequiredId, sendRequestError } from '../../../utils/requestInput';

// Montada em /api/clients com authenticate, requireActivePlan e
// requireCatalogAccess('clients'): a lista também abre para quem lança receita.
const router = Router();

function readClientId(req: Request): number {
  return readRequiredId(req.params['id'], 'Cliente não encontrado');
}

// GET /api/clients?accountId=&search=&type=&status= — indicadores dos contratos só para quem vê contratos
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const account = await resolveCompanyAccount(
      req.user!.id,
      readRequiredId(req.query['accountId'], 'Informe a conta'),
      CLIENTS_PERSONAL_ACCOUNT_MESSAGE,
    );
    const query = readClientListQuery(req.query as Record<string, unknown>);
    const includeContracts = await hasScreenAccess(req.user!.id, 'accessContracts');
    res.json({ success: true, data: await listClients(account.id, query, { includeContracts, today: getTodayIsoInTimezone() }) });
  } catch (error) {
    sendRequestError(res, error, 'List clients error:', req.user?.id, 'Não foi possível carregar os clientes agora.');
  }
});

// GET /api/clients/summary?accountId= — recorrente do mês, contratos vencendo e atrasados
router.get('/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const account = await resolveCompanyAccount(
      req.user!.id,
      readRequiredId(req.query['accountId'], 'Informe a conta'),
      CLIENTS_PERSONAL_ACCOUNT_MESSAGE,
    );
    if (!(await hasScreenAccess(req.user!.id, 'accessContracts'))) {
      throw new RequestInputError('Sem acesso aos contratos', 403);
    }
    res.json({ success: true, data: await getClientsSummary(account.id, getTodayIsoInTimezone()) });
  } catch (error) {
    sendRequestError(res, error, 'Clients summary error:', req.user?.id, 'Não foi possível carregar o resumo agora.');
  }
});

// POST /api/clients { accountId, type, name, document, ... }
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = readRecord(req.body, 'Dados do cliente inválidos');
    const account = await resolveCompanyAccount(
      req.user!.id,
      readRequiredId(body['accountId'], 'Informe a conta'),
      CLIENTS_PERSONAL_ACCOUNT_MESSAGE,
    );
    const input = readClientInput(body);
    res.status(201).json({ success: true, message: 'Cliente cadastrado', data: await createClient(account, input) });
  } catch (error) {
    sendRequestError(res, error, 'Create client error:', req.user?.id, 'Não foi possível cadastrar o cliente agora.');
  }
});

// GET /api/clients/:id
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const client = await findClientForRequester(req.user!.id, readClientId(req));
    res.json({ success: true, data: toClientView(client) });
  } catch (error) {
    sendRequestError(res, error, 'Get client error:', req.user?.id, 'Não foi possível carregar o cliente agora.');
  }
});

// PUT /api/clients/:id
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const client = await findClientForRequester(req.user!.id, readClientId(req));
    const input = readClientInput(req.body);
    res.json({ success: true, message: 'Cliente atualizado', data: await updateClient(client, input) });
  } catch (error) {
    sendRequestError(res, error, 'Update client error:', req.user?.id, 'Não foi possível salvar o cliente agora.');
  }
});

// PUT /api/clients/:id/active { active } — desativar ou reativar
router.put('/:id/active', async (req: Request, res: Response): Promise<void> => {
  try {
    const client = await findClientForRequester(req.user!.id, readClientId(req));
    const active = readActiveInput(req.body);
    res.json({ success: true, data: await setClientActive(client, active) });
  } catch (error) {
    sendRequestError(res, error, 'Change client status error:', req.user?.id, 'Não foi possível mudar a situação do cliente agora.');
  }
});

// DELETE /api/clients/:id — só sem contrato e sem receita
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const client = await findClientForRequester(req.user!.id, readClientId(req));
    await deleteClient(client);
    res.json({ success: true, message: 'Cliente excluído' });
  } catch (error) {
    sendRequestError(res, error, 'Delete client error:', req.user?.id, 'Não foi possível excluir o cliente agora.');
  }
});

// GET /api/clients/:id/incomes — receitas do cliente que o solicitante pode ver
router.get('/:id/incomes', async (req: Request, res: Response): Promise<void> => {
  try {
    const client = await findClientForRequester(req.user!.id, readClientId(req));
    if (!(await hasScreenAccess(req.user!.id, 'accessIncomes'))) {
      throw new RequestInputError('Sem acesso às receitas', 403);
    }
    const visibleUserIds = await resolveVisibleUserIds(req.user!.id, client.accountId, true);
    res.json({ success: true, data: await listClientIncomes(client, visibleUserIds) });
  } catch (error) {
    sendRequestError(res, error, 'List client incomes error:', req.user?.id, 'Não foi possível carregar as receitas do cliente agora.');
  }
});

export default router;
