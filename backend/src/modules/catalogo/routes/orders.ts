import { Router, Request, Response } from 'express';
import { authenticate } from '../../../middleware/auth';
import { requireScreenAccess } from '../../../middleware/permissions';
import { readOrderStatusInput } from '../../../services/orderInput';
import { ORDER_STATUSES, type OrderStatus } from '../../../services/orderPricing';
import {
  changeStoreOrderStatus, findStoreOrder, getStoreOrderDetail, listStoreOrders,
} from '../../../services/orders';
import { resolveCompanyAccount } from '../../../utils/accountAccess';
import { RequestInputError, readRequiredId, sendRequestError } from '../../../utils/requestInput';

const PERSONAL_ACCOUNT_MESSAGE = 'Pedidos só existem em conta de empresa';
const ORDER_NOT_FOUND_MESSAGE = 'Pedido não encontrado';

/**
 * Pedido pelo id, desde que a conta PJ dele seja do solicitante (dono ou
 * colaborador dela). Pedido de outra conta ou inexistente dão a mesma resposta.
 */
async function loadAccessibleOrder(orderId: string | undefined, requesterId: number) {
  const order = await findStoreOrder(orderId ?? '');
  if (!order) {
    throw new RequestInputError(ORDER_NOT_FOUND_MESSAGE, 404);
  }
  try {
    await resolveCompanyAccount(requesterId, order.contaId, PERSONAL_ACCOUNT_MESSAGE);
  } catch (error) {
    // Sem acesso à conta do pedido: a mesma resposta de pedido inexistente.
    if (error instanceof RequestInputError) {
      throw new RequestInputError(ORDER_NOT_FOUND_MESSAGE, 404);
    }
    throw error;
  }
  return order;
}

const router = Router();

// GET /api/catalogo/pedidos?conta_id=&situacao=
router.get('/', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const account = await resolveCompanyAccount(
      req.user!.id,
      readRequiredId(req.query['conta_id'], 'Informe a conta'),
      PERSONAL_ACCOUNT_MESSAGE,
    );
    const rawStatus = req.query['situacao'];
    const status = typeof rawStatus === 'string' && ORDER_STATUSES.includes(rawStatus as OrderStatus) ? rawStatus as OrderStatus : null;
    res.json({ success: true, data: await listStoreOrders(account.id, status) });
  } catch (error) {
    sendRequestError(res, error, 'List store orders error:', req.user?.id, 'Não foi possível carregar os pedidos agora.');
  }
});

// GET /api/catalogo/pedidos/:id
router.get('/:id', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const order = await loadAccessibleOrder(req.params['id'], req.user!.id);
    res.json({ success: true, data: await getStoreOrderDetail(order) });
  } catch (error) {
    sendRequestError(res, error, 'Get store order error:', req.user?.id, 'Não foi possível carregar o pedido agora.');
  }
});

// PUT /api/catalogo/pedidos/:id/situacao { situacao }
router.put('/:id/situacao', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const status = readOrderStatusInput(req.body);
    const order = await loadAccessibleOrder(req.params['id'], req.user!.id);
    res.json({ success: true, message: 'Situação atualizada', data: await changeStoreOrderStatus(order, status) });
  } catch (error) {
    sendRequestError(res, error, 'Change store order status error:', req.user?.id, 'Não foi possível atualizar o pedido agora.');
  }
});

export default router;
