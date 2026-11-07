import { Router, Request, Response } from 'express';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { expenseAlerts, expenses } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { resolveVisibleUserIds } from '../utils/familyVisibility';

const router = Router();

// GET /api/notificacoes — alertas de vencimento do usuario logado. Cada
// notificacao e pessoal (nao ha "ver da familia" aqui, diferente de
// lancamentos): expandir=false sempre, so o proprio solicitante.
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { conta_id } = req.query as Record<string, string | undefined>;
    const visiveis = await resolveVisibleUserIds(req.user!.id, conta_id ? parseInt(conta_id) : null, false);

    const rows = await db
      .select({
        id: expenseAlerts.id,
        alertType: expenseAlerts.alertType,
        status: expenseAlerts.status,
        dueDate: expenseAlerts.dueDate,
        readAt: expenseAlerts.readAt,
        createdAt: expenseAlerts.createdAt,
        description: expenses.description,
        amount: expenses.originalAmount,
      })
      .from(expenseAlerts)
      .innerJoin(expenses, eq(expenseAlerts.expenseId, expenses.id))
      .where(and(
        inArray(expenseAlerts.userId, visiveis),
        inArray(expenseAlerts.status, ['pending', 'sent']),
      ))
      .orderBy(desc(expenseAlerts.dueDate));

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('List notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to list notifications' });
  }
});

// PUT /api/notificacoes/:id/ler — marca uma notificacao como lida. So o
// dono do alerta pode marca-la (sem escopo de familia: notificacao e sempre
// pessoal, diferente de lancamento).
router.put('/:id/ler', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const alertId = parseInt(req.params['id']!);

    const [updated] = await db
      .update(expenseAlerts)
      .set({ status: 'read', readAt: new Date(), updatedAt: new Date() })
      .where(and(eq(expenseAlerts.id, alertId), eq(expenseAlerts.userId, req.user!.id)))
      .returning({ id: expenseAlerts.id });

    if (!updated) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notification' });
  }
});

export default router;
