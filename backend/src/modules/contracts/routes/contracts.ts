import { Router, Request, Response } from 'express';
import { CLIENTS_PERSONAL_ACCOUNT_MESSAGE, findAccountClient } from '../../../services/clients';
import { readContractInput, readReadjustmentInput } from '../../../services/contractInput';
import {
  closeContract, createAmendment, createContract, deleteContract, findContractClient, findContractForRequester,
  handleReadjustment, invoiceContractIncome, loadContract, previewContract, updateContract, type ContractPreviewTarget,
} from '../../../services/contracts';
import {
  contractPortfolio, contractsWithHours, getContractDetail, listClientContracts,
} from '../../../services/contractViews';
import { resolveCompanyAccount } from '../../../utils/accountAccess';
import { getTodayIsoInTimezone } from '../../../utils/date';
import { RequestInputError, readQueryId, readRecord, readRequiredId, sendRequestError } from '../../../utils/requestInput';
import attachmentRoutes from './attachments';

// Montada em /api/contracts com authenticate, requireActivePlan e
// requireCatalogAccess('contracts'): "/with-hours" também abre para quem lança receita.
const router = Router();

const MIN_PORTFOLIO_YEAR = 2000;
const MAX_PORTFOLIO_YEAR = 2100;

function readContractId(req: Request): number {
  return readRequiredId(req.params['id'], 'Contrato não encontrado');
}

function accountFromQuery(req: Request) {
  return resolveCompanyAccount(
    req.user!.id,
    readRequiredId(req.query['accountId'], 'Informe a conta'),
    CLIENTS_PERSONAL_ACCOUNT_MESSAGE,
  );
}

/** Cliente do contrato novo: da conta informada. */
async function readNewContractClient(requesterId: number, body: Record<string, unknown>) {
  const account = await resolveCompanyAccount(
    requesterId,
    readRequiredId(body['accountId'], 'Informe a conta'),
    CLIENTS_PERSONAL_ACCOUNT_MESSAGE,
  );
  const client = await findAccountClient(account.id, readRequiredId(body['clientId'], 'Escolha o cliente'));
  if (!client) {
    throw new RequestInputError('Cliente não encontrado nesta conta');
  }
  return { account, client };
}

/** Ficha do contrato depois de gravar (o acesso já foi conferido antes da gravação). */
async function sendDetail(res: Response, contractId: number, status: number, message: string): Promise<void> {
  const contract = await loadContract(contractId);
  res.status(status).json({ success: true, message, data: await getContractDetail(contract, getTodayIsoInTimezone()) });
}

// GET /api/contracts?accountId=&clientId= — contratos do cliente
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const account = await accountFromQuery(req);
    const clientId = readRequiredId(req.query['clientId'], 'Informe o cliente');
    res.json({ success: true, data: await listClientContracts(account.id, clientId, getTodayIsoInTimezone()) });
  } catch (error) {
    sendRequestError(res, error, 'List contracts error:', req.user?.id, 'Não foi possível carregar os contratos agora.');
  }
});

// GET /api/contracts/with-hours?accountId= — para "Horas a faturar" no lançamento de receita
router.get('/with-hours', async (req: Request, res: Response): Promise<void> => {
  try {
    const account = await accountFromQuery(req);
    res.json({ success: true, data: await contractsWithHours(account.id) });
  } catch (error) {
    sendRequestError(res, error, 'List contracts with hours error:', req.user?.id, 'Não foi possível carregar os contratos agora.');
  }
});

// GET /api/contracts/portfolio?accountId=&month=&year= — carteira do Painel PJ (mês de 1 a 12)
router.get('/portfolio', async (req: Request, res: Response): Promise<void> => {
  try {
    const account = await accountFromQuery(req);
    const month = readQueryId(req.query['month'], 'Mês inválido');
    const year = readQueryId(req.query['year'], 'Ano inválido');
    if (month === null || month > 12 || year === null || year < MIN_PORTFOLIO_YEAR || year > MAX_PORTFOLIO_YEAR) {
      throw new RequestInputError('Informe o mês e o ano');
    }
    res.json({ success: true, data: await contractPortfolio(account.id, month, year) });
  } catch (error) {
    sendRequestError(res, error, 'Contract portfolio error:', req.user?.id, 'Não foi possível carregar a carteira agora.');
  }
});

// POST /api/contracts/preview — receitas que salvar vai gerar. Com `contractId`
// é a alteração; com `amendmentOf`, o aditivo; senão, contrato novo (`accountId` e `clientId`).
router.post('/preview', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = readRecord(req.body, 'Dados do contrato inválidos');
    let target: ContractPreviewTarget;
    if (body['contractId'] !== undefined && body['contractId'] !== null) {
      const contract = await findContractForRequester(req.user!.id, readRequiredId(body['contractId'], 'Contrato não encontrado'));
      target = { mode: 'update', contract, client: await findContractClient(contract) };
    } else if (body['amendmentOf'] !== undefined && body['amendmentOf'] !== null) {
      const previous = await findContractForRequester(req.user!.id, readRequiredId(body['amendmentOf'], 'Contrato não encontrado'));
      target = { mode: 'amendment', previous, client: await findContractClient(previous) };
    } else {
      const { client } = await readNewContractClient(req.user!.id, body);
      target = { mode: 'create', client };
    }
    const input = readContractInput(body, { publicEntity: target.client.kind === 'orgao_publico' });
    res.json({ success: true, data: await previewContract(target, input, getTodayIsoInTimezone()) });
  } catch (error) {
    sendRequestError(res, error, 'Contract preview error:', req.user?.id, 'Não foi possível calcular a prévia agora.');
  }
});

// POST /api/contracts { accountId, clientId, ...contrato }
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = readRecord(req.body, 'Dados do contrato inválidos');
    const { account, client } = await readNewContractClient(req.user!.id, body);
    const input = readContractInput(body, { publicEntity: client.kind === 'orgao_publico' });
    const contractId = await createContract(account, client, input, getTodayIsoInTimezone());
    await sendDetail(res, contractId, 201, 'Contrato cadastrado');
  } catch (error) {
    sendRequestError(res, error, 'Create contract error:', req.user?.id, 'Não foi possível salvar o contrato agora.');
  }
});

// POST /api/contracts/incomes/:incomeId/invoice — "Faturar": prevista → faturada, com o aviso do empenho
router.post('/incomes/:incomeId/invoice', async (req: Request, res: Response): Promise<void> => {
  try {
    const incomeId = readRequiredId(req.params['incomeId'], 'Receita não encontrada');
    res.json({ success: true, data: await invoiceContractIncome(req.user!.id, incomeId) });
  } catch (error) {
    sendRequestError(res, error, 'Invoice contract income error:', req.user?.id, 'Não foi possível faturar a receita agora.');
  }
});

router.use(attachmentRoutes);

// GET /api/contracts/:id — ficha
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const contract = await findContractForRequester(req.user!.id, readContractId(req));
    res.json({ success: true, data: await getContractDetail(contract, getTodayIsoInTimezone()) });
  } catch (error) {
    sendRequestError(res, error, 'Get contract error:', req.user?.id, 'Não foi possível carregar o contrato agora.');
  }
});

// PUT /api/contracts/:id — refaz só as futuras ainda previstas
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const contract = await findContractForRequester(req.user!.id, readContractId(req));
    const client = await findContractClient(contract);
    const input = readContractInput(req.body, { publicEntity: client.kind === 'orgao_publico' });
    await updateContract(contract.id, input, getTodayIsoInTimezone());
    await sendDetail(res, contract.id, 200, 'Contrato atualizado');
  } catch (error) {
    sendRequestError(res, error, 'Update contract error:', req.user?.id, 'Não foi possível salvar o contrato agora.');
  }
});

// POST /api/contracts/:id/close — cancela as previstas a partir do mês seguinte
router.post('/:id/close', async (req: Request, res: Response): Promise<void> => {
  try {
    const contract = await findContractForRequester(req.user!.id, readContractId(req));
    await closeContract(contract.id, getTodayIsoInTimezone());
    await sendDetail(res, contract.id, 200, 'Contrato encerrado');
  } catch (error) {
    sendRequestError(res, error, 'Close contract error:', req.user?.id, 'Não foi possível encerrar o contrato agora.');
  }
});

// DELETE /api/contracts/:id — só sem receita faturada ou recebida
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const contract = await findContractForRequester(req.user!.id, readContractId(req));
    await deleteContract(contract.id);
    res.json({ success: true, message: 'Contrato excluído' });
  } catch (error) {
    sendRequestError(res, error, 'Delete contract error:', req.user?.id, 'Não foi possível excluir o contrato agora.');
  }
});

// POST /api/contracts/:id/amendment — encerra este e cria o aditivo
router.post('/:id/amendment', async (req: Request, res: Response): Promise<void> => {
  try {
    const previous = await findContractForRequester(req.user!.id, readContractId(req));
    const client = await findContractClient(previous);
    const input = readContractInput(req.body, { publicEntity: client.kind === 'orgao_publico' });
    const contractId = await createAmendment(previous.id, input, getTodayIsoInTimezone());
    await sendDetail(res, contractId, 201, 'Aditivo cadastrado');
  } catch (error) {
    sendRequestError(res, error, 'Create amendment error:', req.user?.id, 'Não foi possível salvar o aditivo agora.');
  }
});

// POST /api/contracts/:id/readjustment { action: 'apply', percent } | { action: 'dismiss' }
router.post('/:id/readjustment', async (req: Request, res: Response): Promise<void> => {
  try {
    const contract = await findContractForRequester(req.user!.id, readContractId(req));
    const input = readReadjustmentInput(req.body);
    await handleReadjustment(contract.id, input, getTodayIsoInTimezone());
    await sendDetail(res, contract.id, 200, input.action === 'apply' ? 'Reajuste aplicado' : 'Reajuste dispensado');
  } catch (error) {
    sendRequestError(res, error, 'Contract readjustment error:', req.user?.id, 'Não foi possível tratar o reajuste agora.');
  }
});

export default router;
