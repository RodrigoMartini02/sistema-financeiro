import { Router, Request, Response } from 'express';
import { and, asc, eq, ne } from 'drizzle-orm';
import { db } from '../../../db/client';
import { validateDocument } from '../../../middleware/validation';
import { authenticateFootball } from '../middleware/auth';
import { FootballPositions, FootballSkills, footballPlayers } from '../db/schema';

const router = Router();

function normalizePositions(value: unknown): FootballPositions {
  return Array.isArray(value) ? value.map(String) : [];
}

function normalizeSkills(value: unknown): FootballSkills {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as FootballSkills;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type CpfResult = { ok: true; cpf: string | null } | { ok: false; error: string };

async function resolveCpf(value: unknown, excludePlayerId?: string): Promise<CpfResult> {
  const cpf = String(value ?? '').replace(/\D/g, '');
  if (!cpf) return { ok: true, cpf: null };

  if (cpf.length !== 11 || !validateDocument(cpf)) {
    return { ok: false, error: 'CPF inválido' };
  }

  const conditions = excludePlayerId
    ? and(eq(footballPlayers.cpf, cpf), ne(footballPlayers.id, excludePlayerId))
    : eq(footballPlayers.cpf, cpf);

  const [existing] = await db.select({ id: footballPlayers.id }).from(footballPlayers).where(conditions).limit(1);

  if (existing) {
    return { ok: false, error: 'Este CPF já está cadastrado em outro jogador' };
  }

  return { ok: true, cpf };
}

const LIST_COLUMNS = {
  id: footballPlayers.id,
  userId: footballPlayers.userId,
  name: footballPlayers.name,
  position: footballPlayers.position,
  foot: footballPlayers.foot,
  color: footballPlayers.color,
  age: footballPlayers.age,
  height: footballPlayers.height,
  weight: footballPlayers.weight,
  skills: footballPlayers.skills,
  positions: footballPlayers.positions,
  createdAt: footballPlayers.createdAt,
  updatedAt: footballPlayers.updatedAt,
};

router.get('/', authenticateFootball, async (req: Request, res: Response): Promise<void> => {
  try {
    const players = await db
      .select(LIST_COLUMNS)
      .from(footballPlayers)
      .where(eq(footballPlayers.userId, req.futebolUser!.userId))
      .orderBy(asc(footballPlayers.createdAt));

    res.json(players);
  } catch (error) {
    console.error('Football list players error:', error);
    res.status(500).json({ error: 'Erro ao listar jogadores' });
  }
});

router.get('/:id', authenticateFootball, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const [player] = await db
      .select()
      .from(footballPlayers)
      .where(and(eq(footballPlayers.id, id!), eq(footballPlayers.userId, req.futebolUser!.userId)))
      .limit(1);

    if (!player) {
      res.status(404).json({ error: 'Jogador não encontrado' });
      return;
    }

    res.json(player);
  } catch (error) {
    console.error('Football get player error:', error);
    res.status(500).json({ error: 'Erro ao buscar jogador' });
  }
});

router.post('/', authenticateFootball, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, position, foot, color, photo } = req.body as Record<string, unknown>;

    if (!String(name ?? '').trim()) {
      res.status(400).json({ error: 'Nome obrigatório' });
      return;
    }

    const cpfResult = await resolveCpf(req.body?.cpf);
    if (!cpfResult.ok) {
      res.status(400).json({ error: cpfResult.error });
      return;
    }

    const [player] = await db
      .insert(footballPlayers)
      .values({
        userId: req.futebolUser!.userId,
        name: String(name).trim(),
        cpf: cpfResult.cpf,
        position: String(position || 'Centroavante'),
        foot: String(foot || 'direito'),
        color: String(color || '#22c55e'),
        photo: photo ? String(photo) : null,
        age: optionalNumber(req.body?.age),
        height: optionalNumber(req.body?.height),
        weight: optionalNumber(req.body?.weight),
        skills: normalizeSkills(req.body?.skills),
        positions: normalizePositions(req.body?.positions),
      })
      .returning();

    res.status(201).json(player);
  } catch (error) {
    console.error('Football create player error:', error);
    res.status(500).json({ error: 'Erro ao criar jogador' });
  }
});

router.put('/:id', authenticateFootball, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, position, foot, color, photo } = req.body as Record<string, unknown>;

    const [existing] = await db
      .select({ id: footballPlayers.id })
      .from(footballPlayers)
      .where(and(eq(footballPlayers.id, id!), eq(footballPlayers.userId, req.futebolUser!.userId)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: 'Jogador não encontrado' });
      return;
    }

    const cpfResult = await resolveCpf(req.body?.cpf, id);
    if (!cpfResult.ok) {
      res.status(400).json({ error: cpfResult.error });
      return;
    }

    const [player] = await db
      .update(footballPlayers)
      .set({
        name: String(name ?? '').trim(),
        cpf: cpfResult.cpf,
        position: String(position || 'Centroavante'),
        foot: String(foot || 'direito'),
        color: String(color || '#22c55e'),
        photo: photo ? String(photo) : null,
        age: optionalNumber(req.body?.age),
        height: optionalNumber(req.body?.height),
        weight: optionalNumber(req.body?.weight),
        skills: normalizeSkills(req.body?.skills),
        positions: normalizePositions(req.body?.positions),
        updatedAt: new Date(),
      })
      .where(and(eq(footballPlayers.id, id!), eq(footballPlayers.userId, req.futebolUser!.userId)))
      .returning();

    res.json(player);
  } catch (error) {
    console.error('Football update player error:', error);
    res.status(500).json({ error: 'Erro ao atualizar jogador' });
  }
});

router.delete('/:id', authenticateFootball, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const [existing] = await db
      .select({ id: footballPlayers.id })
      .from(footballPlayers)
      .where(and(eq(footballPlayers.id, id!), eq(footballPlayers.userId, req.futebolUser!.userId)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: 'Jogador não encontrado' });
      return;
    }

    await db
      .delete(footballPlayers)
      .where(and(eq(footballPlayers.id, id!), eq(footballPlayers.userId, req.futebolUser!.userId)));

    res.json({ ok: true });
  } catch (error) {
    console.error('Football delete player error:', error);
    res.status(500).json({ error: 'Erro ao remover jogador' });
  }
});

export default router;
