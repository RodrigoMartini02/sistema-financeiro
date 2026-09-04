import { Router, Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { accounts } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { ensureDefaultCategories } from '../services/defaultCategories';

const router = Router();

// GET /api/contas
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const incluirInativos = req.query['incluir_inativos'] === 'true';

    // Membro vinculado (conta_membros) não é dono de nenhuma `conta` própria
    // — ele enxerga apenas a conta compartilhada do gestor ao qual está
    // vinculado, nunca uma lista própria (accounts.usuario_id).
    const membership = await pool.query(
      `SELECT conta_id FROM conta_membros WHERE usuario_id = $1 AND status = 'ativo'`,
      [req.user!.id],
    );

    if (membership.rows.length > 0) {
      const contaId = (membership.rows[0] as { conta_id: number }).conta_id;
      const result = await pool.query(
        `SELECT id, tipo, nome, documento, razao_social, nome_fantasia, atividade, aporte_inicial, enquadramento,
                telefone, email, data_nascimento, foto, ativo, eh_padrao, data_criacao
         FROM contas WHERE id = $1`,
        [contaId],
      );
      res.json({ success: true, data: result.rows });
      return;
    }

    const result = await pool.query(
      `SELECT id, tipo, nome, documento, razao_social, nome_fantasia, atividade, aporte_inicial, enquadramento,
              telefone, email, data_nascimento, foto, ativo, eh_padrao, data_criacao
       FROM contas WHERE usuario_id = $1 ${incluirInativos ? '' : 'AND ativo = true'} ORDER BY tipo, id`,
      [req.user!.id],
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List accounts error:', error);
    res.status(500).json({ success: false, message: 'Failed to list accounts' });
  }
});

// POST /api/contas
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { tipo, nome, documento, razao_social, nome_fantasia, atividade, aporte_inicial, enquadramento, telefone, email, data_nascimento } =
      req.body as Record<string, string | undefined>;

    if (!nome?.trim()) {
      res.status(400).json({ success: false, message: 'Name is required' });
      return;
    }

    if (!tipo || tipo === 'pessoal') {
      const [existing] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.userId, req.user!.id), eq(accounts.type, 'pessoal'), eq(accounts.active, true)))
        .limit(1);

      if (existing) {
        res.status(400).json({ success: false, message: 'Personal account already exists' });
        return;
      }

      const [created] = await db
        .insert(accounts)
        .values({
          userId: req.user!.id,
          type: 'pessoal',
          name: nome.trim(),
          document: documento ? documento.replace(/\D/g, '') : null,
          telefone: telefone ?? null,
          email: email ?? null,
          dataNascimento: data_nascimento ?? null,
          active: true,
        })
        .returning();

      await ensureDefaultCategories(req.user!.id, 'pessoal');

      res.status(201).json({ success: true, message: 'Personal account created', data: created });
      return;
    }

    const cleanCnpj = (documento ?? '').replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      res.status(400).json({ success: false, message: 'Invalid CNPJ. Provide 14 digits.' });
      return;
    }

    const [created] = await db
      .insert(accounts)
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
        telefone: telefone ?? null,
        email: email ?? null,
        active: true,
      })
      .returning();

    await ensureDefaultCategories(req.user!.id, 'empresa');

    res.status(201).json({ success: true, message: 'Company created successfully', data: created });
  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({ success: false, message: 'Failed to create account' });
  }
});

// PUT /api/contas/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId = parseInt(req.params['id']!);
    const { nome, documento, razao_social, nome_fantasia, atividade, aporte_inicial, enquadramento, telefone, email, data_nascimento } =
      req.body as Record<string, string | undefined>;

    if (!nome?.trim()) {
      res.status(400).json({ success: false, message: 'Name is required' });
      return;
    }

    const [account] = await db
      .select({ id: accounts.id, type: accounts.type })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, req.user!.id)))
      .limit(1);

    if (!account) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }

    if (account.type === 'empresa') {
      const cleanCnpj = (documento ?? '').replace(/\D/g, '');
      if (cleanCnpj.length !== 14) {
        res.status(400).json({ success: false, message: 'Invalid CNPJ. Provide 14 digits.' });
        return;
      }

      const [updated] = await db
        .update(accounts)
        .set({
          name: nome.trim(),
          document: cleanCnpj,
          legalName: razao_social ?? null,
          tradeName: nome_fantasia ?? null,
          activity: atividade ?? null,
          initialContribution: aporte_inicial ?? null,
          enquadramento: (enquadramento ?? null) as 'MEI' | 'ME' | 'EPP' | 'SLU' | 'EIRELI' | 'LTDA' | 'SA' | null,
          telefone: telefone ?? null,
          email: email ?? null,
        })
        .where(and(eq(accounts.id, accountId), eq(accounts.userId, req.user!.id)))
        .returning();

      res.json({ success: true, message: 'Company updated successfully', data: updated });
      return;
    }

    const [updated] = await db
      .update(accounts)
      .set({
        name: nome.trim(),
        document: documento ? documento.replace(/\D/g, '') : null,
        telefone: telefone ?? null,
        email: email ?? null,
        dataNascimento: data_nascimento ?? null,
      })
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, req.user!.id)))
      .returning();

    res.json({ success: true, message: 'Account updated successfully', data: updated });
  } catch (error) {
    console.error('Update account error:', error);
    res.status(500).json({ success: false, message: 'Failed to update account' });
  }
});

// PUT /api/contas/:id/photo
router.put('/:id/photo', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId = parseInt(req.params['id']!);
    const { foto } = req.body as { foto?: string };

    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, req.user!.id)))
      .limit(1);

    if (!account) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }

    await db
      .update(accounts)
      .set({ photo: foto ?? null })
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, req.user!.id)));

    res.json({ success: true, message: foto ? 'Photo updated' : 'Photo removed' });
  } catch (error) {
    console.error('Update account photo error:', error);
    res.status(500).json({ success: false, message: 'Failed to update account photo' });
  }
});

// DELETE /api/contas/:id
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId = parseInt(req.params['id']!);

    const [account] = await db
      .select({ id: accounts.id, type: accounts.type, isDefault: accounts.isDefault })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, req.user!.id)))
      .limit(1);

    if (!account) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }

    // A Conta Padrão (nascida no cadastro externo, vinculada à cobrança do
    // plano em `usuarios`) nunca pode ser arquivada — ela funciona como
    // fallback implícito para dados legados sem conta_id (ver
    // accountFilter.ts/ownerAndAccountWhere.ts) e é exigida por
    // resolveFinancialAccount quando nenhuma conta específica é selecionada.
    if (account.isDefault) {
      res.status(400).json({ success: false, message: 'Cannot archive the default account' });
      return;
    }

    const activeAccounts = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, req.user!.id), eq(accounts.active, true)));

    if (activeAccounts.length <= 1) {
      res.status(400).json({ success: false, message: 'Cannot archive the last active account' });
      return;
    }

    await db
      .update(accounts)
      .set({ active: false })
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, req.user!.id)));

    res.json({ success: true, message: 'Account archived successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ success: false, message: 'Failed to archive account' });
  }
});

// PUT /api/contas/:id/reactivate
router.put('/:id/reactivate', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId = parseInt(req.params['id']!);

    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, req.user!.id)))
      .limit(1);

    if (!account) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }

    const [updated] = await db
      .update(accounts)
      .set({ active: true })
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, req.user!.id)))
      .returning();

    res.json({ success: true, message: 'Account reactivated successfully', data: updated });
  } catch (error) {
    console.error('Reactivate account error:', error);
    res.status(500).json({ success: false, message: 'Failed to reactivate account' });
  }
});

export default router;
