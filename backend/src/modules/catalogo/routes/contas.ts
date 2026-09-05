import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/client';
import { authenticate } from '../../../middleware/auth';
import { requireScreenAccess } from '../../../middleware/permissions';
import { catalogoContas } from '../db/schema';

const router = Router();

// GET /api/catalogo/conta — retorna (e cria se necessário) o identificador público da vitrine do usuário
router.get('/', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const [contaExistente] = await db
      .select()
      .from(catalogoContas)
      .where(eq(catalogoContas.usuarioId, req.user!.id))
      .limit(1);

    if (contaExistente) {
      res.json({ success: true, data: contaExistente });
      return;
    }

    const [conta] = await db
      .insert(catalogoContas)
      .values({ usuarioId: req.user!.id })
      .returning();

    res.status(201).json({ success: true, data: conta });
  } catch (error) {
    console.error('Get/create catalogo conta error:', error);
    res.status(500).json({ success: false, message: 'Failed to load catalogo conta' });
  }
});

export default router;
