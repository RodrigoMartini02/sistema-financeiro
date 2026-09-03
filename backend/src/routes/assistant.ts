import { Request, Response, Router } from 'express';
import {
  createFinancialAssistantDraft,
  FinancialAssistantInputError,
  type AssistantAttachmentInput,
  type AssistantDraftContext,
} from '../services/financialAssistant';
import {
  deleteCopilotConversation,
  getCopilotConversation,
  listCopilotConversations,
  runFinancialCopilot,
  FinancialCopilotInputError,
  type AssistantIntentHint,
} from '../services/financialCopilot';

const router = Router();

function asMessage(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asAttachments(value: unknown): AssistantAttachmentInput[] {
  if (!Array.isArray(value)) return [];

  return value.map((attachment) => {
    if (!attachment || typeof attachment !== 'object') {
      throw new FinancialAssistantInputError('O anexo enviado não é válido.');
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

function asIntentHint(value: unknown): AssistantIntentHint | null {
  if (value === undefined || value === null || value === '') return null;
  if (value === 'register_expense' || value === 'register_income' || value === 'ask') return value;
  throw new FinancialAssistantInputError('Comando da assistente inválido.');
}

function asOptionalPositiveInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new FinancialAssistantInputError('Identificador inválido.');
  return parsed;
}

function asMonth(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 11) throw new FinancialAssistantInputError('Mês inválido.');
  return parsed;
}

function asYear(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) throw new FinancialAssistantInputError('Ano inválido.');
  return parsed;
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
    res.status(500).json({ success: false, message: 'Não foi possível preparar o rascunho financeiro.' });
  }
});

// A conversa decide entre consultar dados e preparar rascunhos. Nenhuma escrita financeira ocorre aqui.
router.post('/chat', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const result = await runFinancialCopilot({
      userId: req.user!.id,
      accountId: asOptionalPositiveInteger(body['conta_id']),
      month: asMonth(body['mes']),
      year: asYear(body['ano']),
      message: asMessage(body['message']),
      attachments: asAttachments(body['attachments']),
      context: asContext(body['context']),
      conversationId: asOptionalPositiveInteger(body['conversa_id']),
      intentHint: asIntentHint(body['intent_hint']),
    });
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof FinancialAssistantInputError || error instanceof FinancialCopilotInputError) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    console.error('Financial copilot chat failed:', (error as Error).message);
    res.status(500).json({ success: false, message: 'Não foi possível responder agora.' });
  }
});

router.get('/conversations', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query as Record<string, unknown>;
    const conversations = await listCopilotConversations({
      userId: req.user!.id,
      accountId: asOptionalPositiveInteger(query['conta_id']),
    });
    res.json({ success: true, data: conversations });
  } catch (error) {
    if (error instanceof FinancialAssistantInputError || error instanceof FinancialCopilotInputError) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    console.error('List copilot conversations failed:', (error as Error).message);
    res.status(500).json({ success: false, message: 'Não foi possível carregar o histórico.' });
  }
});

router.get('/conversations/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query as Record<string, unknown>;
    const messages = await getCopilotConversation({
      userId: req.user!.id,
      accountId: asOptionalPositiveInteger(query['conta_id']),
      conversationId: asOptionalPositiveInteger(req.params['id'])!,
    });
    res.json({ success: true, data: messages });
  } catch (error) {
    if (error instanceof FinancialAssistantInputError || error instanceof FinancialCopilotInputError) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    console.error('Get copilot conversation failed:', (error as Error).message);
    res.status(500).json({ success: false, message: 'Não foi possível carregar a conversa.' });
  }
});

router.delete('/conversations/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query as Record<string, unknown>;
    await deleteCopilotConversation({
      userId: req.user!.id,
      accountId: asOptionalPositiveInteger(query['conta_id']),
      conversationId: asOptionalPositiveInteger(req.params['id'])!,
    });
    res.json({ success: true, message: 'Conversa removida.' });
  } catch (error) {
    if (error instanceof FinancialAssistantInputError || error instanceof FinancialCopilotInputError) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    console.error('Delete copilot conversation failed:', (error as Error).message);
    res.status(500).json({ success: false, message: 'Não foi possível remover a conversa.' });
  }
});

export default router;
