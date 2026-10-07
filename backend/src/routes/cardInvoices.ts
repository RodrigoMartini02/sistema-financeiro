import { Router, Request, Response } from 'express';
import { readInvoiceMonth, readInvoicePaymentInput } from '../services/cardInvoiceInput';
import { getCardInvoice, listCardInvoices, payCardInvoice, undoInvoicePayment } from '../services/cardInvoiceService';
import { RequestInputError, readQueryId, readRequiredId, sendRequestError } from '../utils/requestInput';

// Pagamento da fatura do cartão ("Pagar fatura"). Montada em server.ts com
// authenticate, requireActivePlan e requireScreenAccess('accessExpenses'),
// como /api/expenses. A permissão no cartão é conferida no serviço.
const router = Router();

// GET /api/card-invoices?invoice_month=AAAA-MM&conta_id= — faturas do mês por cartão
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query as Record<string, unknown>;
    const invoiceMonthStart = readInvoiceMonth(query['invoice_month']);
    const accountId = readQueryId(query['conta_id'], 'Conta inválida');
    res.json({ success: true, data: await listCardInvoices(req.user!.id, accountId, invoiceMonthStart) });
  } catch (error) {
    sendRequestError(res, error, `List card invoices error (month ${String(req.query['invoice_month'])}):`, req.user?.id, 'Não foi possível carregar as faturas');
  }
});

// POST /api/card-invoices/payments — paga a fatura: total, parcial ou parcelado
router.post('/payments', async (req: Request, res: Response): Promise<void> => {
  try {
    const input = readInvoicePaymentInput(req.body);
    await payCardInvoice(req.user!.id, input);
    const invoice = await getCardInvoice(req.user!.id, input.cardId, input.invoiceMonthStart);
    res.status(201).json({ success: true, message: 'Invoice payment registered', data: invoice });
  } catch (error) {
    const body = (req.body ?? {}) as Record<string, unknown>;
    sendRequestError(
      res, error, `Pay card invoice error (card ${String(body['cardId'])}, month ${String(body['invoiceMonth'])}):`,
      req.user?.id, 'Não foi possível registrar o pagamento da fatura. Tente novamente.',
    );
  }
});

// DELETE /api/card-invoices/payments/:paymentId — desfaz; o registro fica como estornado
router.delete('/payments/:paymentId', async (req: Request, res: Response): Promise<void> => {
  try {
    const paymentId = readRequiredId(req.params['paymentId'], 'Pagamento não encontrado');
    const { cardId, invoiceMonthStart } = await undoInvoicePayment(req.user!.id, paymentId);
    const invoice = await getCardInvoice(req.user!.id, cardId, invoiceMonthStart);
    if (!invoice) {
      throw new RequestInputError('Pagamento não encontrado', 404);
    }
    res.json({ success: true, message: 'Invoice payment undone', data: invoice });
  } catch (error) {
    sendRequestError(res, error, `Undo invoice payment error (payment ${req.params['paymentId']}):`, req.user?.id, 'Não foi possível desfazer o pagamento da fatura. Tente novamente.');
  }
});

export default router;
