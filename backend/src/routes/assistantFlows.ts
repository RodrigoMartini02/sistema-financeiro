import { Request, Response, Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { FlowDefinitionError, parseFlowDefinition } from '../services/assistantFlowSchema';
import { DEFAULT_FLOW_DEFINITION } from '../services/assistantFlowDefault';
import { getActiveFlowForEditing, restoreDefaultFlow, saveActiveFlow } from '../services/assistantFlowStore';

const router = Router();

// GET /api/assistant-flows/abertura — saudação e chips iniciais do chat.
// Sem requireAdmin: todo usuário do assistente precisa dela para abrir a
// conversa; o que é restrito é EDITAR o fluxo, não consumi-lo.
router.get('/abertura', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const fluxo = await getActiveFlowForEditing();
    // Fluxo gravado sem abertura (anterior a esta feature) cai no padrão.
    res.json({ success: true, data: fluxo.definicao.abertura ?? DEFAULT_FLOW_DEFINITION.abertura });
  } catch (error) {
    console.error('Load assistant opening failed:', (error as Error).message);
    res.status(500).json({ success: false, message: 'Não foi possível carregar a abertura do assistente.' });
  }
});

// GET /api/assistant-flows/active — fluxo que o assistente esta executando
router.get('/active', authenticate, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await getActiveFlowForEditing() });
  } catch (error) {
    console.error('Load assistant flow failed:', (error as Error).message);
    res.status(500).json({ success: false, message: 'Não foi possível carregar o fluxo do assistente.' });
  }
});

// PUT /api/assistant-flows/active — grava o fluxo editado na tela
router.put('/active', authenticate, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;

    // O fluxo gravado vira codigo executavel do ponto de vista do motor: a
    // validacao acontece aqui, no servidor, nunca so no canvas.
    const definicao = parseFlowDefinition(body['definicao']);
    const nome = typeof body['nome'] === 'string' && body['nome'].trim()
      ? body['nome'].trim().slice(0, 120)
      : undefined;

    const salvo = await saveActiveFlow(definicao, nome);
    res.json({ success: true, message: 'Fluxo salvo', data: salvo });
  } catch (error) {
    if (error instanceof FlowDefinitionError) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    console.error('Save assistant flow failed:', (error as Error).message);
    res.status(500).json({ success: false, message: 'Não foi possível salvar o fluxo do assistente.' });
  }
});

// POST /api/assistant-flows/restore — volta ao fluxo original
router.post('/restore', authenticate, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const restaurado = await restoreDefaultFlow();
    res.json({ success: true, message: 'Fluxo padrão restaurado', data: restaurado });
  } catch (error) {
    console.error('Restore assistant flow failed:', (error as Error).message);
    res.status(500).json({ success: false, message: 'Não foi possível restaurar o fluxo padrão.' });
  }
});

export default router;
