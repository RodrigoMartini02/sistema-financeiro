import { Router, Request, Response, NextFunction } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../../db/client';
import { authenticateFootball } from '../middleware/auth';
import { footballChampionshipMatches, footballChampionshipGuesses, footballUsers } from '../db/schema';

const router = Router();

function requireAdminAccount(req: Request, res: Response, next: NextFunction): void {
  const adminEmail = process.env['DEFAULT_ADMIN_USER'];
  if (!adminEmail || req.futebolUser?.email !== adminEmail) {
    res.status(403).json({ error: 'Acesso restrito ao administrador' });
    return;
  }
  next();
}

router.patch(
  '/matches/:id',
  authenticateFootball,
  requireAdminAccount,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { open } = req.body as Record<string, unknown>;

      const [match] = await db
        .update(footballChampionshipMatches)
        .set({ open: Boolean(open) })
        .where(eq(footballChampionshipMatches.id, id!))
        .returning();

      if (!match) {
        res.status(404).json({ error: 'Partida não encontrada' });
        return;
      }

      res.json(match);
    } catch (error) {
      console.error('Football championships update match error:', error);
      res.status(500).json({ error: 'Erro ao atualizar partida' });
    }
  },
);

router.get('/matches', authenticateFootball, async (_req: Request, res: Response): Promise<void> => {
  try {
    const matches = await db
      .select()
      .from(footballChampionshipMatches)
      .orderBy(desc(footballChampionshipMatches.matchDate));

    res.json(matches.filter((match) => match.open || match.finished));
  } catch (error) {
    console.error('Football championships list matches error:', error);
    res.status(500).json({ error: 'Erro ao listar partidas' });
  }
});

router.post('/guesses', authenticateFootball, async (req: Request, res: Response): Promise<void> => {
  try {
    const matchId = String(req.body?.matchId ?? '');
    const homeScore = Number(req.body?.homeScore);
    const awayScore = Number(req.body?.awayScore);

    if (
      !matchId ||
      !Number.isInteger(homeScore) ||
      homeScore < 0 ||
      !Number.isInteger(awayScore) ||
      awayScore < 0
    ) {
      res.status(400).json({ error: 'Palpite inválido' });
      return;
    }

    const [match] = await db
      .select()
      .from(footballChampionshipMatches)
      .where(eq(footballChampionshipMatches.id, matchId))
      .limit(1);

    if (!match || !match.open) {
      res.status(404).json({ error: 'Partida não encontrada ou fechada para palpite' });
      return;
    }

    if (new Date() > match.matchDate) {
      res.status(403).json({ error: 'Prazo de palpite encerrado' });
      return;
    }

    const [existing] = await db
      .select()
      .from(footballChampionshipGuesses)
      .where(
        and(
          eq(footballChampionshipGuesses.matchId, matchId),
          eq(footballChampionshipGuesses.userId, req.futebolUser!.userId),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(footballChampionshipGuesses)
        .set({ homeScore, awayScore })
        .where(eq(footballChampionshipGuesses.id, existing.id))
        .returning();
      res.json(updated);
      return;
    }

    const [guess] = await db
      .insert(footballChampionshipGuesses)
      .values({
        matchId,
        userId: req.futebolUser!.userId,
        homeScore,
        awayScore,
      })
      .returning();

    res.status(201).json(guess);
  } catch (error) {
    console.error('Football championships guess error:', error);
    res.status(500).json({ error: 'Erro ao registrar palpite' });
  }
});

router.get('/guesses/me', authenticateFootball, async (req: Request, res: Response): Promise<void> => {
  try {
    const guesses = await db
      .select()
      .from(footballChampionshipGuesses)
      .where(eq(footballChampionshipGuesses.userId, req.futebolUser!.userId));

    res.json(guesses);
  } catch (error) {
    console.error('Football championships my guesses error:', error);
    res.status(500).json({ error: 'Erro ao buscar palpites' });
  }
});

router.get('/leaderboard', authenticateFootball, async (_req: Request, res: Response): Promise<void> => {
  try {
    const finishedMatches = await db
      .select()
      .from(footballChampionshipMatches)
      .where(eq(footballChampionshipMatches.finished, true));

    if (finishedMatches.length === 0) {
      res.json([]);
      return;
    }

    const matchById = new Map(finishedMatches.map((match) => [match.id, match]));
    const guesses = await db.select().from(footballChampionshipGuesses);

    const scoreByUser = new Map<string, number>();
    for (const guess of guesses) {
      const match = matchById.get(guess.matchId);
      if (!match) continue;
      if (guess.homeScore === match.homeScore && guess.awayScore === match.awayScore) {
        scoreByUser.set(guess.userId, (scoreByUser.get(guess.userId) ?? 0) + 1);
      }
    }

    const users = await db.select({ id: footballUsers.id, email: footballUsers.email }).from(footballUsers);
    const userById = new Map(users.map((user) => [user.id, user]));

    const ranking = [...scoreByUser.entries()]
      .map(([userId, hits]) => ({ userId, email: userById.get(userId)?.email ?? 'desconhecido', hits }))
      .sort((a, b) => b.hits - a.hits);

    res.json(ranking);
  } catch (error) {
    console.error('Football championships leaderboard error:', error);
    res.status(500).json({ error: 'Erro ao calcular ranking' });
  }
});

export default router;
