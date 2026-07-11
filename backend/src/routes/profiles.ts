import { Router, Request, Response } from 'express';
import { eq, and, isNull } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { profiles, expenses, incomes, months, reserves } from '../db/schema';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/profiles
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT id, tipo, nome, documento, razao_social, nome_fantasia, atividade, aporte_inicial, enquadramento, ativo, data_criacao
       FROM perfis WHERE usuario_id = $1 AND ativo = true ORDER BY tipo, id`,
      [req.user!.id],
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List profiles error:', error);
    res.status(500).json({ success: false, message: 'Failed to list profiles' });
  }
});

// POST /api/profiles
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { tipo, nome, documento, razao_social, nome_fantasia, atividade, aporte_inicial, enquadramento } =
      req.body as Record<string, string | undefined>;

    if (!nome?.trim()) {
      res.status(400).json({ success: false, message: 'Name is required' });
      return;
    }

    if (!tipo || tipo === 'pessoal') {
      const [existing] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(eq(profiles.userId, req.user!.id), eq(profiles.type, 'pessoal')))
        .limit(1);

      if (existing) {
        res.status(400).json({ success: false, message: 'Personal profile already exists' });
        return;
      }

      const [created] = await db
        .insert(profiles)
        .values({ userId: req.user!.id, type: 'pessoal', name: nome.trim(), active: true })
        .returning();

      res.status(201).json({ success: true, message: 'Personal profile created', data: created });
      return;
    }

    const cleanCnpj = (documento ?? '').replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      res.status(400).json({ success: false, message: 'Invalid CNPJ. Provide 14 digits.' });
      return;
    }

    const [created] = await db
      .insert(profiles)
      .values({
        userId: req.user!.id,
        type: 'empresa',
        name: nome.trim(),
        document: cleanCnpj,
        legalName: razao_social ?? null,
        tradeName: nome_fantasia ?? null,
        activity: atividade ?? null,
        initialContribution: aporte_inicial ?? null,
        enquadramento: (enquadramento ?? null) as 'MEI' | 'ME' | 'EPP' | 'SLU' | 'EIRELI' | 'LTDA' | 'SA' | null,
        active: true,
      })
      .returning();

    res.status(201).json({ success: true, message: 'Company created successfully', data: created });
  } catch (error) {
    console.error('Create profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to create profile' });
  }
});

// PUT /api/profiles/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const profileId = parseInt(req.params['id']!);
    const { nome, documento, razao_social, nome_fantasia, atividade, aporte_inicial, enquadramento } =
      req.body as Record<string, string | undefined>;

    if (!nome?.trim()) {
      res.status(400).json({ success: false, message: 'Name is required' });
      return;
    }

    const cleanCnpj = (documento ?? '').replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      res.status(400).json({ success: false, message: 'Invalid CNPJ. Provide 14 digits.' });
      return;
    }

    const [profile] = await db
      .select({ id: profiles.id, type: profiles.type })
      .from(profiles)
      .where(and(eq(profiles.id, profileId), eq(profiles.userId, req.user!.id)))
      .limit(1);

    if (!profile) {
      res.status(404).json({ success: false, message: 'Profile not found' });
      return;
    }

    if (profile.type === 'pessoal') {
      res.status(400).json({ success: false, message: 'Cannot edit the personal profile' });
      return;
    }

    const [updated] = await db
      .update(profiles)
      .set({
        name: nome.trim(),
        document: cleanCnpj,
        legalName: razao_social ?? null,
        tradeName: nome_fantasia ?? null,
        activity: atividade ?? null,
        initialContribution: aporte_inicial ?? null,
        enquadramento: (enquadramento ?? null) as 'MEI' | 'ME' | 'EPP' | 'SLU' | 'EIRELI' | 'LTDA' | 'SA' | null,
      })
      .where(and(eq(profiles.id, profileId), eq(profiles.userId, req.user!.id)))
      .returning();

    res.json({ success: true, message: 'Company updated successfully', data: updated });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

// DELETE /api/profiles/:id
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const profileId = parseInt(req.params['id']!);

    const [profile] = await db
      .select({ id: profiles.id, type: profiles.type })
      .from(profiles)
      .where(and(eq(profiles.id, profileId), eq(profiles.userId, req.user!.id)))
      .limit(1);

    if (!profile) {
      res.status(404).json({ success: false, message: 'Profile not found' });
      return;
    }

    if (profile.type === 'pessoal') {
      res.status(400).json({ success: false, message: 'Cannot archive the personal profile' });
      return;
    }

    await db
      .update(profiles)
      .set({ active: false })
      .where(and(eq(profiles.id, profileId), eq(profiles.userId, req.user!.id)));

    res.json({ success: true, message: 'Company archived successfully' });
  } catch (error) {
    console.error('Delete profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to archive profile' });
  }
});

// POST /api/profiles/migrate-orphans
router.post('/migrate-orphans', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const [personalProfile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.userId, userId), eq(profiles.type, 'pessoal')))
      .limit(1);

    if (!personalProfile) {
      res.status(404).json({ success: false, message: 'Personal profile not found' });
      return;
    }

    const profileId = personalProfile.id;

    const [r1, r2, r3, r4] = await Promise.all([
      db.update(incomes).set({ profileId }).where(and(eq(incomes.userId, userId), isNull(incomes.profileId))),
      db.update(expenses).set({ profileId }).where(and(eq(expenses.userId, userId), isNull(expenses.profileId))),
      db.update(months).set({ profileId }).where(and(eq(months.userId, userId), isNull(months.profileId))),
      db.update(reserves).set({ profileId }).where(and(eq(reserves.userId, userId), isNull(reserves.profileId))),
    ]);

    res.json({
      success: true,
      message: 'Orphaned data migrated to personal profile',
      migrated: {
        incomes: r1.rowCount,
        expenses: r2.rowCount,
        months: r3.rowCount,
        reserves: r4.rowCount,
      },
    });
  } catch (error) {
    console.error('Migrate orphans error:', error);
    res.status(500).json({ success: false, message: 'Failed to migrate data' });
  }
});

export default router;
