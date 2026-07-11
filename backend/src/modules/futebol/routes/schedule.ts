import { Router, Request, Response } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../../db/client';
import { authenticateFootball } from '../middleware/auth';
import { footballSchedules } from '../db/schema';

const router = Router();

function parseInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

router.get('/', authenticateFootball, async (req: Request, res: Response): Promise<void> => {
  try {
    const [schedule] = await db
      .select()
      .from(footballSchedules)
      .where(eq(footballSchedules.userId, req.futebolUser!.userId))
      .orderBy(desc(footballSchedules.createdAt))
      .limit(1);

    res.json(schedule ?? null);
  } catch (error) {
    console.error('Football get schedule error:', error);
    res.status(500).json({ error: 'Erro ao buscar agenda' });
  }
});

router.post('/', authenticateFootball, async (req: Request, res: Response): Promise<void> => {
  try {
    const { active, dayOfWeek, hour, minute, drawType, teamSize } = req.body as Record<string, unknown>;

    const [schedule] = await db.transaction(async (tx) => {
      await tx.delete(footballSchedules).where(eq(footballSchedules.userId, req.futebolUser!.userId));
      return tx
        .insert(footballSchedules)
        .values({
          userId: req.futebolUser!.userId,
          active: active === undefined ? true : Boolean(active),
          dayOfWeek: parseInteger(dayOfWeek, 1),
          hour: parseInteger(hour, 20),
          minute: parseInteger(minute, 0),
          drawType: String(drawType || 'balanced'),
          teamSize: parseInteger(teamSize, 7),
        })
        .returning();
    });

    res.json(schedule);
  } catch (error) {
    console.error('Football save schedule error:', error);
    res.status(500).json({ error: 'Erro ao salvar agenda' });
  }
});

router.delete('/', authenticateFootball, async (req: Request, res: Response): Promise<void> => {
  try {
    await db.delete(footballSchedules).where(eq(footballSchedules.userId, req.futebolUser!.userId));
    res.json({ ok: true });
  } catch (error) {
    console.error('Football delete schedule error:', error);
    res.status(500).json({ error: 'Erro ao remover agenda' });
  }
});

export default router;
