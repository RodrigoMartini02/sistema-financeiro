import { Router, Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../../db/client';
import { validateDocument } from '../../../middleware/validation';
import { authenticatePlayer, signFootballPlayer } from '../middleware/auth';
import {
  footballMatches,
  footballPlayers,
  footballPoolGuesses,
  footballPools,
} from '../db/schema';

const router = Router();

function normalizeCpf(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function resolveGuessDeadline(gameDate: string, customDeadline: Date | null): Date {
  return customDeadline ?? new Date(`${gameDate}T12:00:00-03:00`);
}

function isAfterGuessDeadline(gameDate: string, customDeadline: Date | null): boolean {
  return new Date() > resolveGuessDeadline(gameDate, customDeadline);
}

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const cpf = normalizeCpf(req.body?.cpf);

    if (cpf.length !== 11 || !validateDocument(cpf)) {
      res.status(400).json({ error: 'CPF inválido' });
      return;
    }

    const [player] = await db
      .select()
      .from(footballPlayers)
      .where(eq(footballPlayers.cpf, cpf))
      .limit(1);

    if (!player) {
      res.status(404).json({ error: 'CPF não encontrado' });
      return;
    }

    const token = signFootballPlayer({ role: 'player', playerId: player.id, accountId: player.userId });
    res.json({ token, player: { id: player.id, name: player.name } });
  } catch (error) {
    console.error('Football player login error:', error);
    res.status(500).json({ error: 'Erro ao entrar' });
  }
});

router.get('/me', authenticatePlayer, async (req: Request, res: Response): Promise<void> => {
  try {
    const [player] = await db
      .select()
      .from(footballPlayers)
      .where(eq(footballPlayers.id, req.futebolPlayer!.playerId))
      .limit(1);

    if (!player) {
      res.status(404).json({ error: 'Jogador não encontrado' });
      return;
    }

    const { cpf: _cpf, ...profile } = player;
    res.json(profile);
  } catch (error) {
    console.error('Football player me error:', error);
    res.status(500).json({ error: 'Erro ao buscar perfil' });
  }
});

router.get('/sorteio-atual', authenticatePlayer, async (req: Request, res: Response): Promise<void> => {
  try {
    const [match] = await db
      .select()
      .from(footballMatches)
      .where(eq(footballMatches.userId, req.futebolPlayer!.accountId))
      .orderBy(desc(footballMatches.createdAt))
      .limit(1);

    res.json(match ?? null);
  } catch (error) {
    console.error('Football player sorteio error:', error);
    res.status(500).json({ error: 'Erro ao buscar sorteio' });
  }
});

router.get('/historico', authenticatePlayer, async (req: Request, res: Response): Promise<void> => {
  try {
    const matches = await db
      .select()
      .from(footballMatches)
      .where(eq(footballMatches.userId, req.futebolPlayer!.accountId))
      .orderBy(desc(footballMatches.createdAt));

    res.json(matches);
  } catch (error) {
    console.error('Football player historico error:', error);
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

router.get('/bolao', authenticatePlayer, async (req: Request, res: Response): Promise<void> => {
  try {
    const [pool] = await db
      .select()
      .from(footballPools)
      .where(
        and(eq(footballPools.userId, req.futebolPlayer!.accountId), eq(footballPools.active, true)),
      )
      .orderBy(desc(footballPools.createdAt))
      .limit(1);

    if (!pool) {
      res.json(null);
      return;
    }

    const [match] = await db
      .select({ date: footballMatches.date, teams: footballMatches.teams })
      .from(footballMatches)
      .where(eq(footballMatches.id, pool.matchId))
      .limit(1);

    const [myGuess] = await db
      .select()
      .from(footballPoolGuesses)
      .where(
        and(
          eq(footballPoolGuesses.poolId, pool.id),
          eq(footballPoolGuesses.playerId, req.futebolPlayer!.playerId),
        ),
      )
      .limit(1);

    res.json({
      id: pool.id,
      prize: pool.prize,
      prizeValue: pool.prizeValue,
      gameDate: match?.date ?? null,
      guessDeadline: match ? resolveGuessDeadline(match.date, pool.guessDeadline) : null,
      teams: match?.teams ?? [],
      myGuess: myGuess ?? null,
      locked: match ? isAfterGuessDeadline(match.date, pool.guessDeadline) : true,
    });
  } catch (error) {
    console.error('Football player bolao error:', error);
    res.status(500).json({ error: 'Erro ao buscar bolão' });
  }
});

router.post('/bolao/guess', authenticatePlayer, async (req: Request, res: Response): Promise<void> => {
  try {
    const poolId = String(req.body?.poolId ?? '');
    const guessTeams = req.body?.guessTeams;

    if (!poolId || !Array.isArray(guessTeams)) {
      res.status(400).json({ error: 'poolId e guessTeams são obrigatórios' });
      return;
    }

    const [player] = await db
      .select({ age: footballPlayers.age })
      .from(footballPlayers)
      .where(eq(footballPlayers.id, req.futebolPlayer!.playerId))
      .limit(1);

    if (player?.age != null && player.age < 18) {
      res.status(403).json({ error: 'É necessário ter 18 anos ou mais para participar' });
      return;
    }

    const [pool] = await db
      .select()
      .from(footballPools)
      .where(
        and(
          eq(footballPools.id, poolId),
          eq(footballPools.userId, req.futebolPlayer!.accountId),
          eq(footballPools.active, true),
        ),
      )
      .limit(1);

    if (!pool) {
      res.status(404).json({ error: 'Bolão não encontrado ou encerrado' });
      return;
    }

    const [match] = await db
      .select({ date: footballMatches.date, teams: footballMatches.teams })
      .from(footballMatches)
      .where(eq(footballMatches.id, pool.matchId))
      .limit(1);

    if (!match) {
      res.status(404).json({ error: 'Partida do bolão não encontrada' });
      return;
    }

    if (isAfterGuessDeadline(match.date, pool.guessDeadline)) {
      res.status(403).json({ error: 'Prazo de palpite encerrado' });
      return;
    }

    const matchTeamCount = Array.isArray(match.teams) ? match.teams.length : 0;
    const validGuess =
      guessTeams.length === matchTeamCount &&
      guessTeams.every(
        (team: unknown) =>
          team !== null &&
          typeof team === 'object' &&
          typeof (team as { score?: unknown }).score === 'number' &&
          Number.isInteger((team as { score: number }).score) &&
          (team as { score: number }).score >= 0,
      );

    if (!validGuess) {
      res.status(400).json({ error: 'Palpite inválido' });
      return;
    }

    const [guess] = await db
      .insert(footballPoolGuesses)
      .values({
        poolId: pool.id,
        playerId: req.futebolPlayer!.playerId,
        guessTeams,
      })
      .onConflictDoUpdate({
        target: [footballPoolGuesses.poolId, footballPoolGuesses.playerId],
        set: { guessTeams },
      })
      .returning();

    res.status(201).json(guess);
  } catch (error) {
    console.error('Football player submit guess error:', error);
    res.status(500).json({ error: 'Erro ao registrar palpite' });
  }
});

export default router;
