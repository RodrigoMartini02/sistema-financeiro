import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { eq, and, ne, or, ilike } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { users, categories, cards as cardsTable, expenses, incomes, reserves, months } from '../db/schema';
import { authenticate, requireAdmin, requireMaster } from '../middleware/auth';

const router = Router();

// GET /api/users/me
router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        document: users.document,
        country: users.country,
        state: users.state,
        city: users.city,
        type: users.type,
        status: users.status,
        planStatus: users.planStatus,
        planType: users.planType,
        planExpiration: users.planExpiration,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1);

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ success: false, message: 'Failed to get user profile' });
  }
});

// PUT /api/users/me
router.put('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome, email, pais, estado, cidade, senha_atual, nova_senha } =
      req.body as Record<string, string | undefined>;

    if (!nome?.trim()) {
      res.status(400).json({ success: false, message: 'Name is required' });
      return;
    }

    const [current] = await db
      .select({ password: users.password, email: users.email })
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1);

    if (!current) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    let newHashedPassword: string | null = null;
    if (nova_senha) {
      if (!senha_atual) {
        res.status(400).json({ success: false, message: 'Provide current password to change it' });
        return;
      }
      const valid = await bcrypt.compare(senha_atual, current.password);
      if (!valid) {
        res.status(400).json({ success: false, message: 'Current password is incorrect' });
        return;
      }
      if (nova_senha.length < 8) {
        res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
        return;
      }
      newHashedPassword = await bcrypt.hash(nova_senha, 10);
    }

    const newEmail = email ? email.toLowerCase() : current.email!;

    if (newEmail !== current.email) {
      const [emailInUse] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, newEmail), ne(users.id, req.user!.id)))
        .limit(1);

      if (emailInUse) {
        res.status(400).json({ success: false, message: 'Email already in use' });
        return;
      }
    }

    const updateData: Partial<typeof users.$inferInsert> = {
      name: nome.trim(),
      email: newEmail,
      country: pais ?? null,
      state: estado ?? null,
      city: cidade ?? null,
      updatedAt: new Date(),
    };
    if (newHashedPassword) updateData.password = newHashedPassword;

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, req.user!.id))
      .returning({ id: users.id, name: users.name, email: users.email, country: users.country, state: users.state, city: users.city });

    res.json({ success: true, message: 'Profile updated successfully', data: updated });
  } catch (error) {
    console.error('Update me error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

// DELETE /api/users/me/cancel
router.delete('/me/cancel', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { senha } = req.body as { senha?: string };

    if (!senha) {
      res.status(400).json({ success: false, message: 'Provide your password to confirm cancellation' });
      return;
    }

    const [user] = await db
      .select({ password: users.password, type: users.type })
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1);

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (user.type === 'master') {
      res.status(403).json({ success: false, message: 'Master account cannot be cancelled through this flow' });
      return;
    }

    const valid = await bcrypt.compare(senha, user.password);
    if (!valid) {
      res.status(400).json({ success: false, message: 'Incorrect password' });
      return;
    }

    await pool.query(
      `UPDATE usuarios SET status = 'cancelado', plano_status = 'expirado', data_atualizacao = CURRENT_TIMESTAMP WHERE id = $1`,
      [req.user!.id],
    );

    res.json({ success: true, message: 'Account cancelled successfully' });
  } catch (error) {
    console.error('Cancel account error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel account' });
  }
});

// GET /api/users/current (legacy alias)
router.get('/current', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        document: users.document,
        type: users.type,
        status: users.status,
        photo: users.photo,
        country: users.country,
        state: users.state,
        city: users.city,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1);

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ success: false, message: 'Failed to get user data' });
  }
});

// PUT /api/users/current
router.put('/current', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome, email, pais, estado, cidade, dados_financeiros_merge } = req.body as Record<string, unknown>;

    if (dados_financeiros_merge) {
      await pool.query(
        `UPDATE usuarios SET dados_financeiros = COALESCE(dados_financeiros, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
        [JSON.stringify(dados_financeiros_merge), req.user!.id],
      );
      if (!nome && !email) {
        res.json({ success: true, message: 'Data updated successfully' });
        return;
      }
    }

    const updateResult = await pool.query(
      `UPDATE usuarios SET nome = $1, email = $2, pais = $3, estado = $4, cidade = $5, data_atualizacao = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING id, nome, email, documento, tipo, status, pais, estado, cidade`,
      [nome, email, pais ?? null, estado ?? null, cidade ?? null, req.user!.id],
    );

    res.json({ success: true, message: 'Data updated successfully', data: updateResult.rows[0] });
  } catch (error) {
    console.error('Update current user error:', error);
    res.status(500).json({ success: false, message: 'Failed to update data' });
  }
});

// PUT /api/users/current/photo
router.put('/current/photo', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { foto } = req.body as { foto?: string };
    await db.update(users).set({ photo: foto ?? null, updatedAt: new Date() }).where(eq(users.id, req.user!.id));
    res.json({ success: true, message: foto ? 'Photo updated' : 'Photo removed' });
  } catch (error) {
    console.error('Update photo error:', error);
    res.status(500).json({ success: false, message: 'Failed to update photo' });
  }
});

// GET /api/users/stats/general (Master only)
router.get('/stats/general', authenticate, requireMaster, async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) AS total_users,
        COUNT(CASE WHEN status = 'ativo' THEN 1 END) AS active_users,
        COUNT(CASE WHEN status = 'inativo' THEN 1 END) AS inactive_users,
        COUNT(CASE WHEN status = 'bloqueado' THEN 1 END) AS blocked_users,
        COUNT(CASE WHEN tipo = 'padrao' THEN 1 END) AS standard_users,
        COUNT(CASE WHEN tipo = 'admin' THEN 1 END) AS admin_users,
        COUNT(CASE WHEN tipo = 'master' THEN 1 END) AS master_users,
        COUNT(CASE WHEN plano_status = 'ativo' AND tipo != 'master' THEN 1 END) AS paying_users,
        COUNT(CASE WHEN (plano_status = 'trial' OR plano_status IS NULL) AND tipo != 'master' THEN 1 END) AS trial_users,
        COUNT(CASE WHEN plano_status = 'expirado' AND tipo != 'master' THEN 1 END) AS expired_users,
        COUNT(CASE WHEN status = 'cancelado' THEN 1 END) AS cancelled_users
      FROM usuarios
    `);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to get statistics' });
  }
});

// GET /api/users (Admin/Master)
router.get('/', authenticate, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = '1', limit = '10', search = '', tipo = '', status: statusFilter = '' } = req.query as Record<string, string>;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];
    let p = 0;

    if (search.trim()) {
      p++;
      conditions.push(`(LOWER(nome) LIKE LOWER($${p}) OR LOWER(email) LIKE LOWER($${p}) OR documento LIKE $${p})`);
      params.push(`%${search.trim()}%`);
    }
    if (tipo && tipo !== 'todos') {
      p++;
      conditions.push(`tipo = $${p}`);
      params.push(tipo);
    }
    if (statusFilter && statusFilter !== 'todos') {
      p++;
      conditions.push(`status = $${p}`);
      params.push(statusFilter);
    }
    if (req.user!.type === 'admin') {
      p++;
      conditions.push(`tipo = $${p}`);
      params.push('padrao');
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await pool.query(`SELECT COUNT(*) AS total FROM usuarios ${where}`, params);
    const total = parseInt((countResult.rows[0] as { total: string }).total);

    const dataResult = await pool.query(
      `SELECT id, nome, email, documento, tipo, status, pais, estado, cidade, data_cadastro, data_atualizacao
       FROM usuarios ${where}
       ORDER BY nome ASC
       LIMIT $${p + 1} OFFSET $${p + 2}`,
      [...params, limitNum, offset],
    );

    res.json({
      success: true,
      data: dataResult.rows,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ success: false, message: 'Failed to list users' });
  }
});

// POST /api/users (Master only)
router.post('/', authenticate, requireMaster, async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome, email, documento, senha, tipo = 'admin', status = 'ativo', pais, estado, cidade } =
      req.body as Record<string, string | undefined>;

    if (!nome || !email || !documento || !senha) {
      res.status(400).json({ success: false, message: 'Name, email, document and password are required' });
      return;
    }
    if (senha.length < 6) {
      res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ success: false, message: 'Invalid email' });
      return;
    }

    const [emailExists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (emailExists) {
      res.status(400).json({ success: false, message: 'Email already registered' });
      return;
    }

    const cleanDoc = documento.replace(/[^\d]+/g, '');
    const [docExists] = await db.select({ id: users.id }).from(users).where(eq(users.document, cleanDoc)).limit(1);
    if (docExists) {
      res.status(400).json({ success: false, message: 'Document already registered' });
      return;
    }

    const hashedPassword = await bcrypt.hash(senha, 10);
    const [created] = await db
      .insert(users)
      .values({
        name: nome,
        email,
        document: cleanDoc,
        password: hashedPassword,
        type: tipo as 'padrao' | 'admin' | 'master',
        status: status as 'ativo' | 'inativo' | 'bloqueado',
        country: pais ?? null,
        state: estado ?? null,
        city: cidade ?? null,
      })
      .returning({ id: users.id, name: users.name, email: users.email, document: users.document, type: users.type, status: users.status, country: users.country, state: users.state, city: users.city, createdAt: users.createdAt });

    res.status(201).json({ success: true, message: 'User created successfully', data: created });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Failed to create user' });
  }
});

// GET /api/users/:id/categorias
router.get('/:id/categorias', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params['id']!);
    if (isNaN(userId)) {
      res.status(400).json({ success: false, message: 'User ID must be a valid number' });
      return;
    }
    if (req.user!.id !== userId) {
      res.status(403).json({ success: false, message: 'Acesso negado' });
      return;
    }
    const result = await pool.query('SELECT categorias FROM usuarios WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Usuário não encontrado' });
      return;
    }
    const categoriasPadrao = { despesas: ['Alimentação', 'Combustível', 'Moradia'] };
    const categorias = (result.rows[0] as { categorias: unknown }).categorias ?? categoriasPadrao;
    res.json({ success: true, categorias });
  } catch (error) {
    console.error('Get categorias error:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar categorias' });
  }
});

// PUT /api/users/:id/categorias
router.put('/:id/categorias', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params['id']!);
    if (isNaN(userId)) {
      res.status(400).json({ success: false, message: 'User ID must be a valid number' });
      return;
    }
    if (req.user!.id !== userId) {
      res.status(403).json({ success: false, message: 'Acesso negado' });
      return;
    }
    const { categorias } = req.body as { categorias?: unknown };
    if (!categorias || typeof categorias !== 'object') {
      res.status(400).json({ success: false, message: 'Categorias inválidas' });
      return;
    }
    const result = await pool.query(
      'UPDATE usuarios SET categorias = $1, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id',
      [JSON.stringify(categorias), userId],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Usuário não encontrado' });
      return;
    }
    res.json({ success: true, message: 'Categorias salvas com sucesso' });
  } catch (error) {
    console.error('Put categorias error:', error);
    res.status(500).json({ success: false, message: 'Erro ao salvar categorias' });
  }
});

// GET /api/users/:id/cartoes
router.get('/:id/cartoes', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params['id']!);
    if (isNaN(userId)) {
      res.status(400).json({ success: false, message: 'User ID must be a valid number' });
      return;
    }
    if (req.user!.id !== userId) {
      res.status(403).json({ success: false, message: 'Acesso negado' });
      return;
    }
    const { perfil_id } = req.query as Record<string, string | undefined>;
    let queryStr = `SELECT c.id, c.nome AS banco, c.limite, c.dia_fechamento, c.dia_vencimento, c.cor, c.ativo, c.numero_cartao
                    FROM cartoes c
                    WHERE c.usuario_id = $1`;
    const params: unknown[] = [userId];
    if (perfil_id) {
      queryStr += ` AND (c.perfil_id = $2 OR (c.perfil_id IS NULL AND EXISTS (
        SELECT 1 FROM perfis p WHERE p.id = $2 AND p.tipo = 'pessoal' AND p.usuario_id = c.usuario_id
      )))`;
      params.push(parseInt(perfil_id));
    }
    queryStr += ' ORDER BY c.id ASC';
    const result = await pool.query(queryStr, params);
    const cartoes = result.rows.map((c: Record<string, unknown>, index: number) => ({
      id: c['id'],
      banco: c['banco'],
      nome: c['banco'],
      limite: parseFloat(String(c['limite'])) || 0,
      dia_fechamento: c['dia_fechamento'],
      dia_vencimento: c['dia_vencimento'],
      cor: (c['cor'] as string) || '#3498db',
      ativo: c['ativo'] !== false,
      numero_cartao: (c['numero_cartao'] as number) || index + 1,
    }));
    res.json({ success: true, cartoes });
  } catch (error) {
    console.error('Get cartoes error:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar cartões' });
  }
});

// GET /api/users/:id (Admin/Master)
router.get('/:id', authenticate, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params['id']!);
    if (isNaN(userId)) {
      res.status(400).json({ success: false, message: 'User ID must be a valid number' });
      return;
    }

    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email, document: users.document, type: users.type, status: users.status, country: users.country, state: users.state, city: users.city, createdAt: users.createdAt, updatedAt: users.updatedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (req.user!.type === 'admin' && user.type !== 'padrao') {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Failed to get user' });
  }
});

// PUT /api/users/:id (Admin/Master)
router.put('/:id', authenticate, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params['id']!);
    if (isNaN(userId)) {
      res.status(400).json({ success: false, message: 'User ID must be a valid number' });
      return;
    }

    const [target] = await db.select({ id: users.id, type: users.type }).from(users).where(eq(users.id, userId)).limit(1);
    if (!target) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (req.user!.type === 'admin' && target.type !== 'padrao') {
      res.status(403).json({ success: false, message: 'Admin can only edit standard users' });
      return;
    }

    const { nome, email, senha, tipo, status: newStatus, pais, estado, cidade } = req.body as Record<string, string | undefined>;

    if (tipo && req.user!.type !== 'master') {
      res.status(403).json({ success: false, message: 'Only master can change user type' });
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ success: false, message: 'Invalid email' });
      return;
    }

    if (email) {
      const [emailInUse] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, email), ne(users.id, userId))).limit(1);
      if (emailInUse) {
        res.status(400).json({ success: false, message: 'Email already in use' });
        return;
      }
    }

    if (senha && senha.length < 6) {
      res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      return;
    }

    const updateData: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (nome) updateData.name = nome;
    if (email) updateData.email = email;
    if (senha) updateData.password = await bcrypt.hash(senha, 10);
    if (tipo && req.user!.type === 'master') updateData.type = tipo as 'padrao' | 'admin' | 'master';
    if (newStatus) updateData.status = newStatus as 'ativo' | 'inativo' | 'bloqueado';
    if (pais !== undefined) updateData.country = pais || null;
    if (estado !== undefined) updateData.state = estado || null;
    if (cidade !== undefined) updateData.city = cidade || null;

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning({ id: users.id, name: users.name, email: users.email, document: users.document, type: users.type, status: users.status, updatedAt: users.updatedAt });

    res.json({ success: true, message: 'User updated successfully', data: updated });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
});

// PUT /api/users/:id/status (Admin/Master)
router.put('/:id/status', authenticate, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params['id']!);
    const { status } = req.body as { status: string };

    if (!['ativo', 'inativo', 'bloqueado'].includes(status)) {
      res.status(400).json({ success: false, message: 'Status must be: ativo, inativo or bloqueado' });
      return;
    }
    if (userId === req.user!.id) {
      res.status(400).json({ success: false, message: 'Cannot change your own status' });
      return;
    }

    const [target] = await db.select({ id: users.id, name: users.name, type: users.type }).from(users).where(eq(users.id, userId)).limit(1);
    if (!target) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    if (req.user!.type === 'admin' && target.type !== 'padrao') {
      res.status(403).json({ success: false, message: 'Admin can only change status of standard users' });
      return;
    }

    const [updated] = await db
      .update(users)
      .set({ status: status as 'ativo' | 'inativo' | 'bloqueado', updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id, name: users.name, status: users.status });

    res.json({ success: true, message: 'Status updated successfully', data: updated });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});

// DELETE /api/users/:id (Master only)
router.delete('/:id', authenticate, requireMaster, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params['id']!);
    if (userId === req.user!.id) {
      res.status(400).json({ success: false, message: 'Cannot delete your own account' });
      return;
    }

    const [user] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM (SELECT id FROM receitas WHERE usuario_id = $1 UNION SELECT id FROM despesas WHERE usuario_id = $1) AS data`,
      [userId],
    );
    const total = parseInt((countResult.rows[0] as { total: string }).total);

    if (total > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete: user has ${total} financial records. Deactivate instead.`,
      });
      return;
    }

    await db.delete(users).where(eq(users.id, userId));
    res.json({ success: true, message: `User "${user.name}" deleted successfully` });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
});

// DELETE /api/users/:id/clear-data
router.delete('/:id/clear-data', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params['id']!);
    if (req.user!.id !== userId) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    await Promise.all([
      db.delete(incomes).where(eq(incomes.userId, userId)),
      db.delete(expenses).where(eq(expenses.userId, userId)),
      db.delete(reserves).where(eq(reserves.userId, userId)),
      db.delete(months).where(eq(months.userId, userId)),
      db.delete(categories).where(eq(categories.userId, userId)),
      db.delete(cardsTable).where(eq(cardsTable.userId, userId)),
    ]);

    await db.update(users)
      .set({ financialData: null, categories: null, cards: null, updatedAt: new Date() })
      .where(eq(users.id, userId));

    await pool.query('SELECT criar_categorias_padrao($1)', [userId]);

    res.json({ success: true, message: 'System reset: data, categories, cards and notifications cleared.' });
  } catch (error) {
    console.error('Clear data error:', error);
    res.status(500).json({ success: false, message: 'Failed to clear data' });
  }
});

export default router;
