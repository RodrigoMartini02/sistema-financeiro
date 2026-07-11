import { Router, Request, Response } from 'express';
import { eq, and, ne, count, sum, sql } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { categories, expenses } from '../db/schema';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/categories
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { usuario_id } = req.query as Record<string, string | undefined>;
    const targetUserId = usuario_id && req.user!.type === 'master' ? parseInt(usuario_id) : req.user!.id;

    const result = await pool.query(
      `SELECT
        c.id, c.nome, c.cor, c.icone, c.forma_favorita, c.cartao_favorito_id, c.parent_id,
        p.nome AS parent_nome, ct.nome AS cartao_favorito_nome,
        c.data_criacao, c.data_atualizacao,
        COALESCE(c.ativo, true) AS ativo
       FROM categorias c
       LEFT JOIN cartoes ct ON c.cartao_favorito_id = ct.id
       LEFT JOIN categorias p ON c.parent_id = p.id
       WHERE c.usuario_id = $1
       ORDER BY COALESCE(p.nome, c.nome) ASC, c.parent_id NULLS FIRST, c.nome ASC`,
      [targetUserId],
    );

    res.json({ success: true, message: 'Categories loaded', data: result.rows });
  } catch (error) {
    console.error('List categories error:', error);
    res.status(500).json({ success: false, message: 'Failed to list categories' });
  }
});

// GET /api/categories/stats/usage
router.get('/stats/usage', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.nome, c.cor,
        COUNT(d.id) AS total_uses,
        COALESCE(SUM(d.valor), 0) AS total_amount
       FROM categorias c
       LEFT JOIN despesas d ON c.id = d.categoria_id
       WHERE c.usuario_id = $1
       GROUP BY c.id, c.nome, c.cor
       ORDER BY total_uses DESC, c.nome ASC`,
      [req.user!.id],
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Category stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to get category statistics' });
  }
});

// POST /api/categories/default
router.post('/default', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const before = await pool.query('SELECT COUNT(*) AS total FROM categorias WHERE usuario_id = $1', [req.user!.id]);
    const totalBefore = parseInt((before.rows[0] as { total: string }).total);

    await pool.query('SELECT criar_categorias_padrao($1)', [req.user!.id]);

    const result = await pool.query('SELECT * FROM categorias WHERE usuario_id = $1 ORDER BY id ASC', [req.user!.id]);
    const total = result.rows.length;

    res.json({
      success: true,
      message: `${total} categories available (${total - totalBefore} new)`,
      data: result.rows,
      summary: { total, new: total - totalBefore },
    });
  } catch (error) {
    console.error('Create default categories error:', error);
    res.status(500).json({ success: false, message: 'Failed to create default categories' });
  }
});

// GET /api/categories/:id
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const categoryId = parseInt(req.params['id']!);
    if (isNaN(categoryId)) {
      res.status(400).json({ success: false, message: 'Category ID must be a valid number' });
      return;
    }

    const [category] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, req.user!.id)))
      .limit(1);

    if (!category) {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }

    res.json({ success: true, data: category });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({ success: false, message: 'Failed to get category' });
  }
});

// POST /api/categories
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome, cor, icone, parent_id } = req.body as Record<string, string | undefined>;

    if (!nome?.trim()) {
      res.status(400).json({ success: false, message: 'Category name is required' });
      return;
    }
    if (nome.length > 255) {
      res.status(400).json({ success: false, message: 'Category name must be at most 255 characters' });
      return;
    }

    const parentId = parent_id ? parseInt(parent_id) : null;

    if (parentId) {
      const parentResult = await pool.query(
        'SELECT id, parent_id FROM categorias WHERE id = $1 AND usuario_id = $2',
        [parentId, req.user!.id],
      );
      if (parentResult.rows.length === 0) {
        res.status(400).json({ success: false, message: 'Parent category not found' });
        return;
      }
      if ((parentResult.rows[0] as { parent_id: number | null }).parent_id !== null) {
        res.status(400).json({ success: false, message: 'Cannot create a subcategory of a subcategory' });
        return;
      }
    }

    const dupResult = await pool.query(
      'SELECT id FROM categorias WHERE usuario_id = $1 AND LOWER(nome) = LOWER($2)',
      [req.user!.id, nome.trim()],
    );

    if (dupResult.rows.length > 0) {
      res.status(400).json({ success: false, message: 'A category with this name already exists' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO categorias (usuario_id, nome, cor, icone, parent_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nome, cor, icone, parent_id, data_criacao, data_atualizacao`,
      [req.user!.id, nome.trim(), cor ?? '#3498db', icone ?? null, parentId],
    );

    res.status(201).json({ success: true, message: 'Category created', data: result.rows[0] });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ success: false, message: 'Failed to create category' });
  }
});

// PUT /api/categories/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const categoryId = parseInt(req.params['id']!);
    const { nome, cor, icone, parent_id } = req.body as Record<string, string | undefined>;

    if (isNaN(categoryId)) {
      res.status(400).json({ success: false, message: 'Category ID must be a valid number' });
      return;
    }
    if (!nome?.trim()) {
      res.status(400).json({ success: false, message: 'Category name is required' });
      return;
    }

    const parentId = parent_id !== undefined ? (parent_id ? parseInt(parent_id) : null) : undefined;

    if (parentId !== undefined && parentId !== null) {
      if (parentId === categoryId) {
        res.status(400).json({ success: false, message: 'A category cannot be a subcategory of itself' });
        return;
      }
      const parentResult = await pool.query(
        'SELECT id, parent_id FROM categorias WHERE id = $1 AND usuario_id = $2',
        [parentId, req.user!.id],
      );
      if (parentResult.rows.length === 0) {
        res.status(400).json({ success: false, message: 'Parent category not found' });
        return;
      }
      if ((parentResult.rows[0] as { parent_id: number | null }).parent_id !== null) {
        res.status(400).json({ success: false, message: 'Cannot create a subcategory of a subcategory' });
        return;
      }
    }

    const [existing] = await db.select({ id: categories.id }).from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, req.user!.id))).limit(1);

    if (!existing) {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }

    const duplicateResult = await pool.query(
      'SELECT id FROM categorias WHERE usuario_id = $1 AND LOWER(nome) = LOWER($2) AND id != $3',
      [req.user!.id, nome.trim(), categoryId],
    );
    if (duplicateResult.rows.length > 0) {
      res.status(400).json({ success: false, message: 'A category with this name already exists' });
      return;
    }

    const setParent = parentId !== undefined ? ', parent_id = $6' : '';
    const baseParams: unknown[] = [nome.trim(), cor ?? '#3498db', icone ?? null, categoryId, req.user!.id];
    if (parentId !== undefined) baseParams.push(parentId);

    const result = await pool.query(
      `UPDATE categorias
       SET nome = $1, cor = $2, icone = $3, data_atualizacao = CURRENT_TIMESTAMP${setParent}
       WHERE id = $4 AND usuario_id = $5
       RETURNING id, nome, cor, icone, parent_id, data_criacao, data_atualizacao`,
      baseParams,
    );

    res.json({ success: true, message: 'Category updated', data: result.rows[0] });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ success: false, message: 'Failed to update category' });
  }
});

// PATCH /api/categories/:id/toggle-active
router.patch('/:id/toggle-active', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const categoryId = parseInt(req.params['id']!);
    if (isNaN(categoryId)) {
      res.status(400).json({ success: false, message: 'Invalid ID' });
      return;
    }

    const result = await pool.query(
      `UPDATE categorias
       SET ativo = NOT COALESCE(ativo, true), data_atualizacao = CURRENT_TIMESTAMP
       WHERE id = $1 AND usuario_id = $2
       RETURNING id, nome, COALESCE(ativo, true) AS active`,
      [categoryId, req.user!.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }

    const active = (result.rows[0] as { active: boolean }).active;
    res.json({ success: true, message: `Category ${active ? 'activated' : 'deactivated'}`, data: result.rows[0] });
  } catch (error) {
    console.error('Toggle category error:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle category' });
  }
});

// PUT /api/categories/:id/favorite
router.put('/:id/favorite', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const categoryId = parseInt(req.params['id']!);
    const { forma_favorita, cartao_favorito_id } = req.body as Record<string, string | undefined>;

    const [existing] = await db.select({ id: categories.id }).from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, req.user!.id))).limit(1);

    if (!existing) {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }

    const [updated] = await db.update(categories)
      .set({ favoritePaymentMethod: forma_favorita ?? null, favoriteCardId: cartao_favorito_id ? parseInt(cartao_favorito_id) : null, updatedAt: new Date() })
      .where(and(eq(categories.id, categoryId), eq(categories.userId, req.user!.id)))
      .returning();

    res.json({ success: true, message: 'Favorite saved', data: updated });
  } catch (error) {
    console.error('Update category favorite error:', error);
    res.status(500).json({ success: false, message: 'Failed to save favorite' });
  }
});

// DELETE /api/categories/:id
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const categoryId = parseInt(req.params['id']!);
    if (isNaN(categoryId)) {
      res.status(400).json({ success: false, message: 'Category ID must be a valid number' });
      return;
    }

    const [existing] = await db.select({ id: categories.id, name: categories.name }).from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, req.user!.id))).limit(1);

    if (!existing) {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }

    const childrenResult = await pool.query('SELECT COUNT(*) AS total FROM categorias WHERE parent_id = $1', [categoryId]);
    if (parseInt((childrenResult.rows[0] as { total: string }).total) > 0) {
      res.status(400).json({ success: false, message: 'Cannot delete: category has subcategories. Delete subcategories first.' });
      return;
    }

    const usageResult = await pool.query(
      'SELECT COUNT(*) AS total FROM despesas WHERE categoria_id = $1 AND usuario_id = $2',
      [categoryId, req.user!.id],
    );
    const totalUses = parseInt((usageResult.rows[0] as { total: string }).total);
    if (totalUses > 0) {
      res.status(400).json({ success: false, message: `Cannot delete: category is used in ${totalUses} expense(s).` });
      return;
    }

    await db.delete(categories).where(and(eq(categories.id, categoryId), eq(categories.userId, req.user!.id)));
    res.json({ success: true, message: `Category "${existing.name}" deleted` });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete category' });
  }
});

export default router;
