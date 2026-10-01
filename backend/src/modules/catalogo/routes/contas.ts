import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/client';
import { authenticate } from '../../../middleware/auth';
import { requireScreenAccess } from '../../../middleware/permissions';
import { resolveAccountOwnerId } from '../../../utils/familyVisibility';
import { catalogoContas } from '../db/schema';

const router = Router();

// GET /api/catalogo/conta — retorna (e cria se necessário) o identificador público da vitrine do dono do catálogo
router.get('/', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = await resolveAccountOwnerId(req.user!.id, null);
    const [contaExistente] = await db
      .select()
      .from(catalogoContas)
      .where(eq(catalogoContas.usuarioId, ownerId))
      .limit(1);

    if (contaExistente) {
      res.json({ success: true, data: contaExistente });
      return;
    }

    const [conta] = await db
      .insert(catalogoContas)
      .values({ usuarioId: ownerId })
      .returning();

    res.status(201).json({ success: true, data: conta });
  } catch (error) {
    console.error('Get/create catalogo conta error:', error);
    res.status(500).json({ success: false, message: 'Failed to load catalogo conta' });
  }
});

export default router;
