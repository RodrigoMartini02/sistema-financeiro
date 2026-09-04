import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { and, eq, isNotNull, or } from 'drizzle-orm';
import { body } from 'express-validator';
import { db, pool } from '../db/client';
import { users, accounts, accountMembers, categories, expenses, memberPermissions } from '../db/schema';
import { authenticate, requireGestor } from '../middleware/auth';
import { validate, validateDocument } from '../middleware/validation';
import { resolveMemberAccountId, type PermissionFlag } from '../middleware/permissions';

const router = Router();

// Resolve a Conta Padrão do gestor autenticado (mesma noção usada em todo o
// backend: a conta com eh_padrao=true é a que nasceu no cadastro externo).
async function resolveGestorAccountId(gestorId: number): Promise<number | null> {
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, gestorId), eq(accounts.isDefault, true)))
    .limit(1);
  return account?.id ?? null;
}

// GET /api/account-members — lista os membros vinculados à conta do gestor autenticado
router.get('/', authenticate, requireGestor, async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId = await resolveGestorAccountId(req.user!.id);
    if (!accountId) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }

    const result = await pool.query(
      `SELECT m.id AS membro_id, m.status AS membro_status, m.data_criacao AS vinculado_em,
              u.id AS usuario_id, u.nome, u.email, u.documento, u.status AS usuario_status
       FROM conta_membros m
       JOIN usuarios u ON u.id = m.usuario_id
       WHERE m.conta_id = $1
       ORDER BY u.nome ASC`,
      [accountId],
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List account members error:', error);
    res.status(500).json({ success: false, message: 'Failed to list account members' });
  }
});

// POST /api/account-members — gestor cria um membro vinculado à própria conta
router.post(
  '/',
  authenticate,
  requireGestor,
  [
    body('nome').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Invalid email'),
    body('senha').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { nome, email, senha, documento } = req.body as Record<string, string | undefined>;

      const accountId = await resolveGestorAccountId(req.user!.id);
      if (!accountId) {
        res.status(404).json({ success: false, message: 'Account not found' });
        return;
      }

      const normalizedEmail = email!.toLowerCase();
      const [emailExists] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
      if (emailExists) {
        res.status(400).json({ success: false, message: 'Email already registered' });
        return;
      }

      let cleanDoc: string | null = null;
      if (documento?.trim()) {
        cleanDoc = documento.replace(/[^\d]+/g, '');
        if (!validateDocument(cleanDoc)) {
          res.status(400).json({ success: false, message: 'Invalid CPF/CNPJ' });
          return;
        }
        const [docExists] = await db.select({ id: users.id }).from(users).where(eq(users.document, cleanDoc)).limit(1);
        if (docExists) {
          res.status(400).json({ success: false, message: 'Document already registered' });
          return;
        }
      }

      const hashedPassword = await bcrypt.hash(senha!, 10);

      const created = await db.transaction(async (transaction) => {
        const [member] = await transaction
          .insert(users)
          .values({
            name: nome!,
            email: normalizedEmail,
            document: cleanDoc,
            password: hashedPassword,
            type: 'padrao',
            status: 'ativo',
          })
          .returning({ id: users.id, name: users.name, email: users.email, document: users.document, type: users.type, status: users.status });

        await transaction.insert(accountMembers).values({
          accountId,
          userId: member!.id,
          status: 'ativo',
        });

        // Toda permissão nasce restritiva (false) — o gestor libera
        // explicitamente pela tela de permissões (Fase 3).
        await transaction.insert(memberPermissions).values({ userId: member!.id });

        // Membro herda cópia das categorias reais do gestor (não o conjunto
        // padrão genérico), incluindo customizações já feitas por ele —
        // categorias são usuario_id-scoped, então sem isso o membro não teria
        // nenhuma categoria para escolher ao lançar uma despesa/receita.
        const gestorCategories = await transaction
          .select({ type: categories.type, accountId: categories.accountId, name: categories.name, color: categories.color, icon: categories.icon, parentId: categories.parentId })
          .from(categories)
          .where(eq(categories.userId, req.user!.id));

        for (const category of gestorCategories) {
          await transaction.insert(categories).values({
            userId: member!.id,
            type: category.type,
            accountId: category.accountId,
            name: category.name,
            color: category.color,
            icon: category.icon,
            parentId: category.parentId,
          });
        }

        return member;
      });

      res.status(201).json({
        success: true,
        message: 'Member created successfully',
        data: { id: created!.id, nome: created!.name, email: created!.email, documento: created!.document, tipo: created!.type, status: created!.status },
      });
    } catch (error) {
      console.error('Create account member error:', error);
      res.status(500).json({ success: false, message: 'Failed to create member' });
    }
  },
);

// GET /api/account-members/:id/pending — pendências (parcelas futuras +
// recorrências ativas) do membro que precisam de destino antes da desativação
router.get('/:id/pending', authenticate, requireGestor, async (req: Request, res: Response): Promise<void> => {
  try {
    const memberUserId = parseInt(req.params['id']!);
    const accountId = await resolveGestorAccountId(req.user!.id);
    if (!accountId) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }

    const [membership] = await db
      .select({ id: accountMembers.id })
      .from(accountMembers)
      .where(and(eq(accountMembers.userId, memberUserId), eq(accountMembers.accountId, accountId)))
      .limit(1);

    if (!membership) {
      res.status(404).json({ success: false, message: 'Member not found in this account' });
      return;
    }

    const pending = await db
      .select({
        id: expenses.id,
        description: expenses.description,
        installmentGroupId: expenses.installmentGroupId,
        recurring: expenses.recurring,
        finalAmount: expenses.finalAmount,
        dueDate: expenses.dueDate,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, memberUserId),
          eq(expenses.paid, false),
          or(isNotNull(expenses.installmentGroupId), eq(expenses.recurring, true)),
        ),
      );

    res.json({ success: true, data: pending });
  } catch (error) {
    console.error('List pending expenses error:', error);
    res.status(500).json({ success: false, message: 'Failed to list pending expenses' });
  }
});

// PUT /api/account-members/:id/deactivate — desativa o membro, transferindo
// antes as pendências (parcelas futuras + recorrências) para outro usuário
// da mesma conta. Operação atômica: tudo ou nada.
router.put(
  '/:id/deactivate',
  authenticate,
  requireGestor,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const memberUserId = parseInt(req.params['id']!);
      const { transferir_para: rawTransferTo } = req.body as Record<string, unknown>;

      const accountId = await resolveGestorAccountId(req.user!.id);
      if (!accountId) {
        res.status(404).json({ success: false, message: 'Account not found' });
        return;
      }

      const [membership] = await db
        .select({ id: accountMembers.id })
        .from(accountMembers)
        .where(and(eq(accountMembers.userId, memberUserId), eq(accountMembers.accountId, accountId), eq(accountMembers.status, 'ativo')))
        .limit(1);

      if (!membership) {
        res.status(404).json({ success: false, message: 'Active member not found in this account' });
        return;
      }

      const pending = await db
        .select({
          id: expenses.id,
          description: expenses.description,
          installmentGroupId: expenses.installmentGroupId,
          recurring: expenses.recurring,
          finalAmount: expenses.finalAmount,
          dueDate: expenses.dueDate,
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, memberUserId),
            eq(expenses.paid, false),
            or(isNotNull(expenses.installmentGroupId), eq(expenses.recurring, true)),
          ),
        );

      // Sem pendências, a desativação não exige destino de transferência.
      if (pending.length === 0) {
        await db.transaction(async (transaction) => {
          await transaction.update(accountMembers).set({ status: 'inativo' }).where(eq(accountMembers.id, membership.id));
          await transaction.update(users).set({ status: 'inativo', updatedAt: new Date() }).where(eq(users.id, memberUserId));
        });

        res.json({ success: true, message: 'Member deactivated successfully', data: { pendencias_transferidas: 0 } });
        return;
      }

      if (rawTransferTo === undefined || rawTransferTo === null || rawTransferTo === '') {
        res.status(400).json({
          success: false,
          message: 'This member has pending expenses. Choose a transfer target before deactivating.',
          code: 'PENDING_EXPENSES',
          data: pending,
        });
        return;
      }

      const transferToUserId = parseInt(String(rawTransferTo));
      if (isNaN(transferToUserId)) {
        res.status(400).json({ success: false, message: 'Invalid transfer target' });
        return;
      }

      if (transferToUserId === memberUserId) {
        res.status(400).json({ success: false, message: 'Cannot transfer pending expenses to the member being deactivated' });
        return;
      }

      // Destino precisa ser o próprio gestor ou outro membro ativo da mesma conta.
      const isGestorTarget = transferToUserId === req.user!.id;
      let isMemberTarget = false;
      if (!isGestorTarget) {
        const [targetMembership] = await db
          .select({ id: accountMembers.id })
          .from(accountMembers)
          .where(and(eq(accountMembers.userId, transferToUserId), eq(accountMembers.accountId, accountId), eq(accountMembers.status, 'ativo')))
          .limit(1);
        isMemberTarget = !!targetMembership;
      }

      if (!isGestorTarget && !isMemberTarget) {
        res.status(400).json({ success: false, message: 'Transfer target must be the account manager or an active member of the same account' });
        return;
      }

      await db.transaction(async (transaction) => {
        if (pending.length > 0) {
          await transaction
            .update(expenses)
            .set({ userId: transferToUserId })
            .where(
              and(
                eq(expenses.userId, memberUserId),
                eq(expenses.paid, false),
                or(isNotNull(expenses.installmentGroupId), eq(expenses.recurring, true)),
              ),
            );
        }

        await transaction.update(accountMembers).set({ status: 'inativo' }).where(eq(accountMembers.id, membership.id));
        await transaction.update(users).set({ status: 'inativo', updatedAt: new Date() }).where(eq(users.id, memberUserId));
      });

      res.json({ success: true, message: 'Member deactivated successfully', data: { pendencias_transferidas: pending.length } });
    } catch (error) {
      console.error('Deactivate account member error:', error);
      res.status(500).json({ success: false, message: 'Failed to deactivate member' });
    }
  },
);

// GET /api/account-members/summary — visão agregada da conta (soma de
// despesas/receitas de todos os autores vinculados, gestor incluído).
// Gestor sempre acessa; membro só se tiver ver_visao_agregada liberado.
router.get('/summary', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { mes, ano } = req.query as Record<string, string | undefined>;

    const memberAccountId = await resolveMemberAccountId(req.user!.id);
    const isMember = memberAccountId !== null;

    if (isMember) {
      const [permissions] = await db
        .select({ viewAggregateSummary: memberPermissions.viewAggregateSummary })
        .from(memberPermissions)
        .where(eq(memberPermissions.userId, req.user!.id))
        .limit(1);

      if (!permissions?.viewAggregateSummary) {
        res.status(403).json({ success: false, message: 'Access denied' });
        return;
      }
    }

    const accountId = isMember ? memberAccountId : await resolveGestorAccountId(req.user!.id);
    if (!accountId) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }

    const memberRows = await pool.query(
      `SELECT usuario_id FROM conta_membros WHERE conta_id = $1 AND status = 'ativo'`,
      [accountId],
    );
    const accountOwner = await pool.query(`SELECT usuario_id FROM contas WHERE id = $1`, [accountId]);
    const ownerId = (accountOwner.rows[0] as { usuario_id: number } | undefined)?.usuario_id;
    const authorIds = [
      ...(ownerId ? [ownerId] : []),
      ...memberRows.rows.map((r: { usuario_id: number }) => r.usuario_id),
    ];

    const periodFilter = mes !== undefined && ano !== undefined ? 'AND mes = $2 AND ano = $3' : '';
    const periodParams = mes !== undefined && ano !== undefined ? [parseInt(mes), parseInt(ano)] : [];

    const [expensesResult, incomesResult] = await Promise.all([
      pool.query(
        `SELECT usuario_id, COALESCE(SUM(COALESCE(valor_final, valor_original)), 0) AS total
         FROM despesas WHERE usuario_id = ANY($1) ${periodFilter}
         GROUP BY usuario_id`,
        [authorIds, ...periodParams],
      ),
      pool.query(
        `SELECT usuario_id, COALESCE(SUM(valor), 0) AS total
         FROM receitas WHERE usuario_id = ANY($1) ${periodFilter}
         GROUP BY usuario_id`,
        [authorIds, ...periodParams],
      ),
    ]);

    res.json({
      success: true,
      data: {
        despesas_por_autor: expensesResult.rows,
        receitas_por_autor: incomesResult.rows,
      },
    });
  } catch (error) {
    console.error('Account summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to load account summary' });
  }
});

const PERMISSION_COLUMNS: { flag: PermissionFlag; column: keyof typeof memberPermissions.$inferSelect }[] = [
  { flag: 'viewOthersEntries', column: 'viewOthersEntries' },
  { flag: 'editOthersEntries', column: 'editOthersEntries' },
  { flag: 'deleteOthersEntries', column: 'deleteOthersEntries' },
  { flag: 'viewAggregateSummary', column: 'viewAggregateSummary' },
  { flag: 'manageCategories', column: 'manageCategories' },
  { flag: 'manageCards', column: 'manageCards' },
  { flag: 'accessOtherMembersData', column: 'accessOtherMembersData' },
];

// GET /api/account-members/:id/permissions — permissões atuais de um membro
// (visão do gestor). Gestão de permissões nunca é delegável a outro membro.
router.get('/:id/permissions', authenticate, requireGestor, async (req: Request, res: Response): Promise<void> => {
  try {
    const memberUserId = parseInt(req.params['id']!);
    const accountId = await resolveGestorAccountId(req.user!.id);
    if (!accountId) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }

    const [membership] = await db
      .select({ id: accountMembers.id })
      .from(accountMembers)
      .where(and(eq(accountMembers.userId, memberUserId), eq(accountMembers.accountId, accountId)))
      .limit(1);

    if (!membership) {
      res.status(404).json({ success: false, message: 'Member not found in this account' });
      return;
    }

    const [permissions] = await db.select().from(memberPermissions).where(eq(memberPermissions.userId, memberUserId)).limit(1);
    if (!permissions) {
      res.status(404).json({ success: false, message: 'Permissions not found for this member' });
      return;
    }

    res.json({ success: true, data: permissions });
  } catch (error) {
    console.error('Get member permissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to get member permissions' });
  }
});

// PUT /api/account-members/:id/permissions — gestor atualiza as permissões
// de um membro específico. Nunca delegável a outro membro (só requireGestor).
router.put('/:id/permissions', authenticate, requireGestor, async (req: Request, res: Response): Promise<void> => {
  try {
    const memberUserId = parseInt(req.params['id']!);
    const accountId = await resolveGestorAccountId(req.user!.id);
    if (!accountId) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }

    const [membership] = await db
      .select({ id: accountMembers.id })
      .from(accountMembers)
      .where(and(eq(accountMembers.userId, memberUserId), eq(accountMembers.accountId, accountId)))
      .limit(1);

    if (!membership) {
      res.status(404).json({ success: false, message: 'Member not found in this account' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const updateData: Partial<typeof memberPermissions.$inferInsert> = { updatedAt: new Date() };

    for (const { flag, column } of PERMISSION_COLUMNS) {
      if (flag in body) {
        if (typeof body[flag] !== 'boolean') {
          res.status(400).json({ success: false, message: `${flag} must be a boolean` });
          return;
        }
        (updateData as Record<string, unknown>)[column] = body[flag];
      }
    }

    const [updated] = await db
      .update(memberPermissions)
      .set(updateData)
      .where(eq(memberPermissions.userId, memberUserId))
      .returning();

    if (!updated) {
      res.status(404).json({ success: false, message: 'Permissions not found for this member' });
      return;
    }

    res.json({ success: true, message: 'Permissions updated successfully', data: updated });
  } catch (error) {
    console.error('Update member permissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to update member permissions' });
  }
});

export default router;
