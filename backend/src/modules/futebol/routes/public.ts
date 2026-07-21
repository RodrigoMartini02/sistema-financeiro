import { Router, Request, Response, NextFunction } from 'express';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../../../db/client';
import { validateDocument } from '../../../middleware/validation';
import {
  footballConfirmations,
  footballGuests,
  footballMatches,
  footballPlayers,
  footballSchedules,
  footballUsers,
} from '../db/schema';

const router = Router();

declare global {
  namespace Express {
    interface Request {
      futebolAccountId?: string;
    }
  }
}

async function accountExists(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { accountId } = req.params;
    const [user] = await db
      .select({ id: footballUsers.id })
      .from(footballUsers)
      .where(eq(footballUsers.id, accountId!))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: 'Conta não encontrada' });
      return;
    }

    req.futebolAccountId = accountId;
    next();
  } catch (error) {
    console.error('Football public account lookup error:', error);
    res.status(500).json({ error: 'Erro ao validar conta' });
  }
}

function isAfterConfirmationDeadline(gameDate: string): boolean {
  const deadline = new Date(`${gameDate}T12:00:00-03:00`);
  return new Date() > deadline;
}

function accountId(req: Request): string {
  return req.futebolAccountId!;
}

router.get('/:accountId/players', accountExists, async (req: Request, res: Response): Promise<void> => {
  try {
    const players = await db
      .select({
        id: footballPlayers.id,
        name: footballPlayers.name,
        position: footballPlayers.position,
        color: footballPlayers.color,
      })
      .from(footballPlayers)
      .where(eq(footballPlayers.userId, accountId(req)))
      .orderBy(asc(footballPlayers.name));

    res.json(players);
  } catch (error) {
    console.error('Football public players error:', error);
    res.status(500).json({ error: 'Erro ao listar jogadores' });
  }
});

router.get('/:accountId/schedule', accountExists, async (req: Request, res: Response): Promise<void> => {
  try {
    const [schedule] = await db
      .select()
      .from(footballSchedules)
      .where(eq(footballSchedules.userId, accountId(req)))
      .orderBy(desc(footballSchedules.createdAt))
      .limit(1);

    res.json(schedule ?? null);
  } catch (error) {
    console.error('Football public schedule error:', error);
    res.status(500).json({ error: 'Erro ao buscar agenda' });
  }
});

router.get('/:accountId/confirmations', accountExists, async (req: Request, res: Response): Promise<void> => {
  try {
    const date = String(req.query['date'] ?? '');
    if (!date) {
      res.status(400).json({ error: 'date obrigatório' });
      return;
    }

    const confirmations = await db
      .select()
      .from(footballConfirmations)
      .where(and(eq(footballConfirmations.userId, accountId(req)), eq(footballConfirmations.gameDate, date)));

    res.json(confirmations);
  } catch (error) {
    console.error('Football public confirmations error:', error);
    res.status(500).json({ error: 'Erro ao listar confirmações' });
  }
});

router.post('/:accountId/confirmations', accountExists, async (req: Request, res: Response): Promise<void> => {
  try {
    const playerId = String(req.body?.playerId ?? '');
    const gameDate = String(req.body?.gameDate ?? '');

    if (!playerId || !gameDate) {
      res.status(400).json({ error: 'playerId e gameDate obrigatórios' });
      return;
    }

    const [player] = await db
      .select({ id: footballPlayers.id })
      .from(footballPlayers)
      .where(and(eq(footballPlayers.id, playerId), eq(footballPlayers.userId, accountId(req))))
      .limit(1);

    if (!player) {
      res.status(404).json({ error: 'Jogador não encontrado nesta conta' });
      return;
    }

    if (isAfterConfirmationDeadline(gameDate)) {
      res.status(403).json({ error: 'Prazo de confirmação encerrado (12h do dia do jogo)' });
      return;
    }

    const [existing] = await db
      .select()
      .from(footballConfirmations)
      .where(and(eq(footballConfirmations.playerId, playerId), eq(footballConfirmations.gameDate, gameDate)))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(footballConfirmations)
        .set({ userId: accountId(req) })
        .where(eq(footballConfirmations.id, existing.id))
        .returning();
      res.status(201).json(updated);
      return;
    }

    const [confirmation] = await db
      .insert(footballConfirmations)
      .values({ userId: accountId(req), playerId, gameDate })
      .returning();

    res.status(201).json(confirmation);
  } catch (error) {
    console.error('Football public confirm error:', error);
    res.status(500).json({ error: 'Erro ao confirmar presença' });
  }
});

router.delete('/:accountId/confirmations/:playerId/:gameDate', accountExists, async (req: Request, res: Response): Promise<void> => {
  try {
    const { playerId, gameDate } = req.params;

    if (isAfterConfirmationDeadline(gameDate!)) {
      res.status(403).json({ error: 'Prazo encerrado, não é possível cancelar' });
      return;
    }

    await db
      .delete(footballConfirmations)
      .where(
        and(
          eq(footballConfirmations.userId, accountId(req)),
          eq(footballConfirmations.playerId, playerId!),
          eq(footballConfirmations.gameDate, gameDate!),
        ),
      );

    res.json({ ok: true });
  } catch (error) {
    console.error('Football public cancel confirmation error:', error);
    res.status(500).json({ error: 'Erro ao cancelar confirmação' });
  }
});

router.post('/:accountId/register', accountExists, async (req: Request, res: Response): Promise<void> => {
  try {
    const name = String(req.body?.name ?? '').trim();
    if (!name) {
      res.status(400).json({ error: 'Nome obrigatório' });
      return;
    }

    const cpf = String(req.body?.cpf ?? '').replace(/\D/g, '');
    if (cpf.length !== 11 || !validateDocument(cpf)) {
      res.status(400).json({ error: 'CPF inválido' });
      return;
    }

    const [existing] = await db
      .select({ id: footballPlayers.id })
      .from(footballPlayers)
      .where(eq(footballPlayers.cpf, cpf))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: 'Este CPF já está cadastrado' });
      return;
    }

    const defaultSkills = { velocidade: 50, drible: 50, passe: 50, chute: 50, defesa: 50, fisico: 50 };
    const [player] = await db
      .insert(footballPlayers)
      .values({
        userId: accountId(req),
        name,
        cpf,
        position: String(req.body?.position || 'Centroavante'),
        positions: Array.isArray(req.body?.positions) ? req.body.positions.map(String) : [],
        foot: String(req.body?.foot || 'direito'),
        height: req.body?.height ? Number(req.body.height) : null,
        weight: req.body?.weight ? Number(req.body.weight) : null,
        skills: defaultSkills,
        color: '#22c55e',
      })
      .returning();

    res.status(201).json(player);
  } catch (error) {
    console.error('Football public register player error:', error);
    res.status(500).json({ error: 'Erro ao cadastrar jogador' });
  }
});

router.get('/:accountId/attendance', accountExists, async (req: Request, res: Response): Promise<void> => {
  try {
    const confirmations = await db
      .select({ playerId: footballConfirmations.playerId })
      .from(footballConfirmations)
      .where(eq(footballConfirmations.userId, accountId(req)));

    const players = await db
      .select({
        id: footballPlayers.id,
        name: footballPlayers.name,
        color: footballPlayers.color,
        position: footballPlayers.position,
      })
      .from(footballPlayers)
      .where(eq(footballPlayers.userId, accountId(req)));

    const playerMap = new Map(players.map((player) => [player.id, player]));
    const counts = confirmations.reduce<Map<string, number>>((acc, confirmation) => {
      acc.set(confirmation.playerId, (acc.get(confirmation.playerId) ?? 0) + 1);
      return acc;
    }, new Map());

    const ranking = [...counts.entries()]
      .map(([playerId, total]) => ({ player: playerMap.get(playerId), count: total }))
      .filter((item): item is { player: NonNullable<typeof item.player>; count: number } => Boolean(item.player))
      .sort((a, b) => b.count - a.count);

    res.json(ranking);
  } catch (error) {
    console.error('Football public attendance error:', error);
    res.status(500).json({ error: 'Erro ao calcular ranking' });
  }
});

router.get('/:accountId/result', accountExists, async (req: Request, res: Response): Promise<void> => {
  try {
    const [match] = await db
      .select()
      .from(footballMatches)
      .where(eq(footballMatches.userId, accountId(req)))
      .orderBy(desc(footballMatches.createdAt))
      .limit(1);

    res.json(match ?? null);
  } catch (error) {
    console.error('Football public result error:', error);
    res.status(500).json({ error: 'Erro ao buscar resultado' });
  }
});

router.get('/:accountId/guests', accountExists, async (req: Request, res: Response): Promise<void> => {
  try {
    const date = String(req.query['date'] ?? '');
    if (!date) {
      res.status(400).json({ error: 'date obrigatório' });
      return;
    }

    const guests = await db
      .select()
      .from(footballGuests)
      .where(and(eq(footballGuests.userId, accountId(req)), eq(footballGuests.gameDate, date)))
      .orderBy(asc(footballGuests.createdAt));

    res.json(guests);
  } catch (error) {
    console.error('Football public guests error:', error);
    res.status(500).json({ error: 'Erro ao listar convidados' });
  }
});

router.post('/:accountId/guests', accountExists, async (req: Request, res: Response): Promise<void> => {
  try {
    const name = String(req.body?.name ?? '').trim();
    const gameDate = String(req.body?.gameDate ?? '');

    if (!name) {
      res.status(400).json({ error: 'Nome obrigatório' });
      return;
    }
    if (!gameDate) {
      res.status(400).json({ error: 'gameDate obrigatório' });
      return;
    }
    if (isAfterConfirmationDeadline(gameDate)) {
      res.status(403).json({ error: 'Prazo de confirmação encerrado (12h do dia do jogo)' });
      return;
    }

    const [guest] = await db
      .insert(footballGuests)
      .values({ userId: accountId(req), name, gameDate })
      .returning();

    res.status(201).json(guest);
  } catch (error) {
    console.error('Football public create guest error:', error);
    res.status(500).json({ error: 'Erro ao adicionar convidado' });
  }
});

router.delete('/:accountId/guests/:id', accountExists, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const [guest] = await db
      .select()
      .from(footballGuests)
      .where(and(eq(footballGuests.id, id!), eq(footballGuests.userId, accountId(req))))
      .limit(1);

    if (!guest) {
      res.status(404).json({ error: 'Convidado não encontrado' });
      return;
    }

    if (isAfterConfirmationDeadline(guest.gameDate)) {
      res.status(403).json({ error: 'Prazo encerrado' });
      return;
    }

    await db.delete(footballGuests).where(and(eq(footballGuests.id, id!), eq(footballGuests.userId, accountId(req))));
    res.json({ ok: true });
  } catch (error) {
    console.error('Football public delete guest error:', error);
    res.status(500).json({ error: 'Erro ao remover convidado' });
  }
});

export default router;
