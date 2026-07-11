import { Router, Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../../db/client';
import { authenticateFootball } from '../middleware/auth';
import { FootballTeams, footballMatches } from '../db/schema';

const router = Router();

function normalizeTeams(value: unknown): FootballTeams {
  return value ?? [];
}

router.get('/', authenticateFootball, async (req: Request, res: Response): Promise<void> => {
  try {
    const matches = await db
      .select()
      .from(footballMatches)
      .where(eq(footballMatches.userId, req.futebolUser!.userId))
      .orderBy(desc(footballMatches.date));

    res.json(matches);
  } catch (error) {
    console.error('Football list matches error:', error);
    res.status(500).json({ error: 'Erro ao listar partidas' });
  }
});

router.post('/', authenticateFootball, async (req: Request, res: Response): Promise<void> => {
  try {
    const { date, teams, notes } = req.body as Record<string, unknown>;

    if (!date) {
      res.status(400).json({ error: 'date obrigatorio' });
      return;
    }

    const [match] = await db
      .insert(footballMatches)
      .values({
        userId: req.futebolUser!.userId,
        date: String(date),
        teams: normalizeTeams(teams),
        notes: notes === undefined || notes === null ? null : String(notes),
      })
      .returning();

    res.status(201).json(match);
  } catch (error) {
    console.error('Football create match error:', error);
    res.status(500).json({ error: 'Erro ao criar partida' });
  }
});

router.patch('/:id', authenticateFootball, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { teams, notes } = req.body as Record<string, unknown>;

    const [existing] = await db
      .select({ id: footballMatches.id })
      .from(footballMatches)
      .where(and(eq(footballMatches.id, id!), eq(footballMatches.userId, req.futebolUser!.userId)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: 'Partida nao encontrada' });
      return;
    }

    const [match] = await db
      .update(footballMatches)
      .set({
        teams: normalizeTeams(teams),
        ...(notes !== undefined ? { notes: notes === null ? null : String(notes) } : {}),
      })
      .where(and(eq(footballMatches.id, id!), eq(footballMatches.userId, req.futebolUser!.userId)))
      .returning();

    res.json(match);
  } catch (error) {
    console.error('Football update match error:', error);
    res.status(500).json({ error: 'Erro ao atualizar partida' });
  }
});

router.delete('/:id', authenticateFootball, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const [existing] = await db
      .select({ id: footballMatches.id })
      .from(footballMatches)
      .where(and(eq(footballMatches.id, id!), eq(footballMatches.userId, req.futebolUser!.userId)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: 'Partida nao encontrada' });
      return;
    }

    await db
      .delete(footballMatches)
      .where(and(eq(footballMatches.id, id!), eq(footballMatches.userId, req.futebolUser!.userId)));

    res.json({ ok: true });
  } catch (error) {
    console.error('Football delete match error:', error);
    res.status(500).json({ error: 'Erro ao remover partida' });
  }
});

export default router;
