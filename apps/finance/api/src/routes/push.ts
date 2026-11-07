import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { pushSubscriptions } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { getVapidPublicKey } from '../services/webPush';

const router = Router();

// GET /api/push/vapid-public-key — chave publica para PushManager.subscribe().
// Nao exige autenticacao: e informacao publica por design da Web Push API.
router.get('/vapid-public-key', (_req: Request, res: Response): void => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    res.status(503).json({ success: false, message: 'Push notifications not configured' });
    return;
  }
  res.json({ success: true, data: { publicKey } });
});

// POST /api/push/subscribe — salva a subscription do navegador. endpoint e
// unico: reassinar no mesmo navegador atualiza a subscription existente em
// vez de duplicar (ex: chaves rotacionadas pelo proprio browser).
router.post('/subscribe', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint, keys } = req.body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ success: false, message: 'Invalid subscription payload' });
      return;
    }

    await db
      .insert(pushSubscriptions)
      .values({
        userId: req.user!.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: req.header('user-agent')?.slice(0, 255),
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId: req.user!.id, p256dh: keys.p256dh, auth: keys.auth },
      });

    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Save push subscription error:', error);
    res.status(500).json({ success: false, message: 'Failed to save subscription' });
  }
});

// DELETE /api/push/subscribe — remove a subscription do navegador atual
// (ex: usuario desativa notificacoes). So o dono pode remover a propria.
router.delete('/subscribe', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint } = req.body as { endpoint?: string };
    if (!endpoint) {
      res.status(400).json({ success: false, message: 'Missing endpoint' });
      return;
    }

    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));

    res.json({ success: true });
  } catch (error) {
    console.error('Delete push subscription error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove subscription' });
  }
});

export default router;
