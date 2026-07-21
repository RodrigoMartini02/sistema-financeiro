import { Router, Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../../db/client';
import { authenticateFootball } from '../middleware/auth';
import { footballPools, footballPoolGuesses, footballMatches, footballPlayers } from '../db/schema';

const router = Router();

router.get('/', authenticateFootball, async (req: Request, res: Response): Promise<void> => {
  try {
    const [pool] = await db
      .select()
      .from(footballPools)
      .where(eq(footballPools.userId, req.futebolUser!.userId))
      .orderBy(desc(footballPools.createdAt))
      .limit(1);

    if (!pool) {
      res.json(null);
      return;
    }

    const guesses = await db
      .select({
        id: footballPoolGuesses.id,
        poolId: footballPoolGuesses.poolId,
        playerId: footballPoolGuesses.playerId,
        playerName: footballPlayers.name,
        guessTeams: footballPoolGuesses.guessTeams,
        createdAt: footballPoolGuesses.createdAt,
      })
      .from(footballPoolGuesses)
      .innerJoin(footballPlayers, eq(footballPlayers.id, footballPoolGuesses.playerId))
      .where(eq(footballPoolGuesses.poolId, pool.id))
      .orderBy(desc(footballPoolGuesses.createdAt));

    res.json({ ...pool, guesses });
  } catch (error) {
    console.error('Football get pool error:', error);
    res.status(500).json({ error: 'Erro ao buscar bolão' });
  }
});

router.post('/', authenticateFootball, async (req: Request, res: Response): Promise<void> => {
  try {
    const { matchId, prize } = req.body as Record<string, unknown>;

    if (!matchId || !prize) {
      res.status(400).json({ error: 'matchId e prize são obrigatórios' });
      return;
    }

    const [match] = await db
      .select({ id: footballMatches.id })
      .from(footballMatches)
      .where(and(eq(footballMatches.id, String(matchId)), eq(footballMatches.userId, req.futebolUser!.userId)))
      .limit(1);

    if (!match) {
      res.status(404).json({ error: 'Partida não encontrada' });
      return;
    }

    const [pool] = await db
      .insert(footballPools)
      .values({
        userId: req.futebolUser!.userId,
        matchId: String(matchId),
        prize: String(prize),
      })
      .returning();

    res.status(201).json({ ...pool, guesses: [] });
  } catch (error) {
    console.error('Football create pool error:', error);
    res.status(500).json({ error: 'Erro ao criar bolão' });
  }
});

router.patch('/:id', authenticateFootball, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { prize, active } = req.body as Record<string, unknown>;

    const [existing] = await db
      .select({ id: footballPools.id })
      .from(footballPools)
      .where(and(eq(footballPools.id, id!), eq(footballPools.userId, req.futebolUser!.userId)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: 'Bolão não encontrado' });
      return;
    }

    const [pool] = await db
      .update(footballPools)
      .set({
        ...(prize !== undefined ? { prize: String(prize) } : {}),
        ...(active !== undefined ? { active: Boolean(active) } : {}),
      })
      .where(and(eq(footballPools.id, id!), eq(footballPools.userId, req.futebolUser!.userId)))
      .returning();

    res.json(pool);
  } catch (error) {
    console.error('Football update pool error:', error);
    res.status(500).json({ error: 'Erro ao atualizar bolão' });
  }
});

router.delete('/:id', authenticateFootball, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const [existing] = await db
      .select({ id: footballPools.id })
      .from(footballPools)
      .where(and(eq(footballPools.id, id!), eq(footballPools.userId, req.futebolUser!.userId)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: 'Bolão não encontrado' });
      return;
    }

    await db
      .delete(footballPools)
      .where(and(eq(footballPools.id, id!), eq(footballPools.userId, req.futebolUser!.userId)));

    res.json({ ok: true });
  } catch (error) {
    console.error('Football delete pool error:', error);
    res.status(500).json({ error: 'Erro ao remover bolão' });
  }
});

export default router;
