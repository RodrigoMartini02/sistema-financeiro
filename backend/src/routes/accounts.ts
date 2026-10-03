import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { eq, and, ne } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { accounts, users } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { saveAccountPartners } from '../services/accountPartners';
import { readAccountPartnersInput } from '../services/accountPartnersInput';
import { companyAccountColumns, readCompanyAccountInput, readLoginAccessInput } from '../services/companyAccountInput';
import { findOwnLoginWithDocument } from '../services/documentConflicts';
import { ensureDefaultCategories } from '../services/defaultCategories';
import { ensureDefaultIncomeClassifications } from '../services/incomeClassificationCatalog';
import { RequestInputError, sendRequestError } from '../utils/requestInput';

const router = Router();

type QueryExecutor = Pick<typeof db, 'select'>;

/** CNPJ não repete entre as contas do mesmo titular (entre titulares diferentes, pode). */
async function assertCnpjFreeForOwner(
  executor: QueryExecutor,
  ownerId: number,
  cnpj: string,
  exceptAccountId: number | null,
): Promise<void> {
  const conditions = [eq(accounts.userId, ownerId), eq(accounts.document, cnpj)];
  if (exceptAccountId !== null) {
    conditions.push(ne(accounts.id, exceptAccountId));
  }

  const [duplicate] = await executor.select({ id: accounts.id }).from(accounts).where(and(...conditions)).limit(1);
  if (duplicate) {
    throw new RequestInputError('Este CNPJ já está em outra conta sua');
  }
}

/**
 * CNPJ e e-mail do login da PJ não podem ser o acesso de outro usuário. O
 * CNPJ só esbarra em outro acesso próprio: login de membro com o mesmo
 * documento é outro login, criado por um gestor.
 */
async function assertLoginIdentityFree(
  executor: QueryExecutor,
  userId: number,
  cnpj: string,
  email: string | undefined,
): Promise<void> {
  if (await findOwnLoginWithDocument(executor, cnpj, userId)) {
    throw new RequestInputError('Este CNPJ já é o acesso de outro usuário');
  }

  if (email === undefined) {
    return;
  }

  const [emailInUse] = await executor
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), ne(users.id, userId)))
    .limit(1);
  if (emailInUse) {
    throw new RequestInputError('E-mail já em uso');
  }
}

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
        `SELECT id, tipo, nome, documento, razao_social, nome_fantasia, enquadramento,
                data_abertura, ativo, eh_padrao, data_criacao
         FROM contas WHERE id = $1`,
        [contaId],
      );
      res.json({ success: true, data: result.rows });
      return;
    }

    const result = await pool.query(
      `SELECT id, tipo, nome, documento, razao_social, nome_fantasia, enquadramento,
              data_abertura, ativo, eh_padrao, data_criacao
       FROM contas WHERE usuario_id = $1 ${incluirInativos ? '' : 'AND ativo = true'} ORDER BY data_criacao, id`,
      [req.user!.id],
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List accounts error:', error);
    res.status(500).json({ success: false, message: 'Failed to list accounts' });
  }
});

// POST /api/contas
// Cria sempre conta PJ — uma pessoa física adicional na conta é papel do
// fluxo "Novo membro" (account-members), não de uma segunda conta própria.
// Conta, catálogo padrão e sócios (com o capital lançado como receita) entram
// juntos ou nada.
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const company = readCompanyAccountInput(req.body);
    const partnersInput = readAccountPartnersInput((req.body as Record<string, unknown>)['socios']);
    const ownerId = req.user!.id;

    const created = await db.transaction(async (transaction) => {
      await assertCnpjFreeForOwner(transaction, ownerId, company.document, null);

      const [account] = await transaction
        .insert(accounts)
        .values({
          userId: ownerId,
          type: 'empresa',
          ...companyAccountColumns(company),
          active: true,
        })
        .returning();

      await ensureDefaultCategories(ownerId, 'empresa', transaction);
      await ensureDefaultIncomeClassifications(ownerId, 'empresa', transaction);

      if (partnersInput) {
        await saveAccountPartners(transaction, {
          ownerId, accountId: account!.id, openingDate: company.openingDate, partners: partnersInput,
        });
      }

      return account;
    });

    res.status(201).json({ success: true, message: 'Company created successfully', data: created });
  } catch (error) {
    sendRequestError(res, error, 'Create account error:', req.user?.id, 'Failed to create account');
  }
});

// PUT /api/contas/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId = parseInt(req.params['id']!);
    const userId = req.user!.id;

    const [account] = await db
      .select({ id: accounts.id, type: accounts.type, isDefault: accounts.isDefault })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
      .limit(1);

    if (!account) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }

    if (account.type === 'empresa') {
      const company = readCompanyAccountInput(req.body);
      const partnersInput = readAccountPartnersInput((req.body as Record<string, unknown>)['socios']);
      // A conta padrão PJ do próprio titular é o login: nome, CNPJ, e-mail e
      // senha do acesso acompanham a empresa e são salvos no mesmo pedido.
      const loginAccess = account.isDefault ? readLoginAccessInput(req.body) : null;
      const newPasswordHash = loginAccess?.newPassword ? await bcrypt.hash(loginAccess.newPassword, 10) : null;

      // Conta e login juntos ou nada: um erro em qualquer passo desfaz tudo.
      const updated = await db.transaction(async (transaction) => {
        await assertCnpjFreeForOwner(transaction, userId, company.document, account.id);
        if (loginAccess) {
          await assertLoginIdentityFree(transaction, userId, company.document, loginAccess.email);
        }

        const [updatedAccount] = await transaction
          .update(accounts)
          .set(companyAccountColumns(company))
          .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
          .returning();

        if (loginAccess) {
          await transaction
            .update(users)
            .set({
              name: company.displayName,
              lastName: null,
              document: company.document,
              ...(loginAccess.email ? { email: loginAccess.email } : {}),
              ...(newPasswordHash ? { password: newPasswordHash } : {}),
              updatedAt: new Date(),
            })
            .where(eq(users.id, userId));
        }

        if (partnersInput) {
          await saveAccountPartners(transaction, {
            ownerId: userId, accountId: account.id, openingDate: company.openingDate, partners: partnersInput,
          });
        }

        return updatedAccount;
      });

      res.json({ success: true, message: 'Company updated successfully', data: updated });
      return;
    }

    const { nome, documento } = req.body as Record<string, string | undefined>;

    if (!nome?.trim()) {
      res.status(400).json({ success: false, message: 'Name is required' });
      return;
    }

    const [updated] = await db
      .update(accounts)
      .set({
        name: nome.trim(),
        document: documento ? documento.replace(/\D/g, '') : null,
      })
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
      .returning();

    res.json({ success: true, message: 'Account updated successfully', data: updated });
  } catch (error) {
    sendRequestError(res, error, 'Update account error:', req.user?.id, 'Failed to update account');
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
    // plano em `usuarios`) nunca pode ser desativada — ela funciona como
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
