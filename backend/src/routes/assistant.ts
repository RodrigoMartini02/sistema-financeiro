import { Request, Response, Router } from 'express';
import {
  createFinancialAssistantDraft,
  FinancialAssistantInputError,
  type AssistantAttachmentInput,
  type AssistantDraftContext,
} from '../services/financialAssistant';

const router = Router();

function asMessage(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asAttachments(value: unknown): AssistantAttachmentInput[] {
  if (!Array.isArray(value)) return [];

  return value.map((attachment) => {
    if (!attachment || typeof attachment !== 'object') {
      throw new FinancialAssistantInputError('O anexo enviado nao e valido.');
    }

    const data = attachment as Record<string, unknown>;
    return {
      nome: typeof data.nome === 'string' ? data.nome : '',
      tipo: typeof data.tipo === 'string' ? data.tipo : '',
      tamanho: typeof data.tamanho === 'number' ? data.tamanho : Number.NaN,
      dados: typeof data.dados === 'string' ? data.dados : '',
    };
  });
}

function asContext(value: unknown): AssistantDraftContext | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const context = value as Record<string, unknown>;
  const kind = context.kind === 'income' || context.kind === 'expense' ? context.kind : undefined;
  const paymentMethod = ['pix', 'dinheiro', 'debito', 'credito', 'boleto'].includes(String(context.paymentMethod))
    ? String(context.paymentMethod) as AssistantDraftContext['paymentMethod']
    : undefined;

  return {
    kind,
    description: typeof context.description === 'string' ? context.description.slice(0, 120) : null,
    amount: typeof context.amount === 'number' && Number.isFinite(context.amount) ? context.amount : null,
    date: typeof context.date === 'string' ? context.date.slice(0, 10) : null,
    dueDate: typeof context.dueDate === 'string' ? context.dueDate.slice(0, 10) : null,
    category: typeof context.category === 'string' ? context.category.slice(0, 120) : null,
    paymentMethod,
    paid: typeof context.paid === 'boolean' ? context.paid : undefined,
  };
}

// Esta rota nunca cria receita ou despesa. Ela apenas devolve um rascunho revisavel.
router.post('/financial-draft', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const result = await createFinancialAssistantDraft({
      message: asMessage(body.message),
      attachments: asAttachments(body.attachments),
      context: asContext(body.context),
      userId: req.user!.id,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof FinancialAssistantInputError) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }

    console.error('Financial assistant draft failed:', (error as Error).message);
    res.status(500).json({ success: false, message: 'Nao foi possivel preparar o rascunho financeiro.' });
  }
});

export default router;
