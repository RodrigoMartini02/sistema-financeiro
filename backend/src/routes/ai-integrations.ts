import { Request, Response, Router } from 'express';
import { authenticate, requireMaster } from '../middleware/auth';
import {
  AiIntegrationInputError,
  listAiIntegrationSettings,
  saveAiIntegration,
  testAiIntegration,
} from '../services/aiIntegrations';

const router = Router();

router.get('/', authenticate, requireMaster, async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await listAiIntegrationSettings() });
  } catch (error) {
    console.error('List AI integrations failed:', (error as Error).message);
    res.status(500).json({ success: false, message: 'Não foi possível carregar as integrações de IA.' });
  }
});

router.put('/:provider', authenticate, requireMaster, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const saved = await saveAiIntegration({
      provider: req.params['provider'],
      model: body['modelo'],
      apiKey: body['token'],
      enabled: body['ativo'],
      primary: body['principal'],
      updatedByUserId: req.user!.id,
    });
    res.json({ success: true, data: saved });
  } catch (error) {
    if (error instanceof AiIntegrationInputError) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    console.error('Save AI integration failed:', (error as Error).message);
    res.status(500).json({ success: false, message: 'Não foi possível salvar a integração de IA.' });
  }
});

router.post('/test', authenticate, requireMaster, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    await testAiIntegration({ provider: body['provedor'], model: body['modelo'], apiKey: body['token'] });
    res.json({ success: true, message: 'Integração testada com sucesso.' });
  } catch (error) {
    if (error instanceof AiIntegrationInputError) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    console.error('Test AI integration failed:', (error as Error).message);
    res.status(400).json({ success: false, message: 'Não foi possível validar esta integração.' });
  }
});

export default router;
