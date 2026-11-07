import { Router, Request, Response } from 'express';
import { and, asc, eq, ne, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { jobTitles, sectors, type AccountNameCatalogTable } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { readAccountCatalogName, type AccountCatalogLabels } from '../services/accountNameInput';
import { canWriteToAccount, resolveCompanyAccount } from '../utils/accountAccess';
import { isUniqueViolation } from '../utils/dbErrors';
import { RequestInputError, readQueryId, readRecord, readRequiredId, sendRequestError } from '../utils/requestInput';

const PERSONAL_ACCOUNT_MESSAGE = 'Setores e cargos só existem em conta de empresa';

interface AccountNameCatalogConfig {
  table: AccountNameCatalogTable;
  labels: AccountCatalogLabels & {
    plural: string;
    notFound: string;
    duplicate: string;
  };
}

/**
 * Rotas de uma lista de nomes da conta PJ (setores, cargos): listar, criar,
 * renomear e desativar. A permissão da tela é conferida na montagem
 * (requireCatalogAccess); aqui, que a conta é PJ e do solicitante.
 */
export function createAccountNameCatalogRouter({ table, labels }: AccountNameCatalogConfig): Router {
  const router = Router();

  const view = (item: typeof table.$inferSelect) => ({
    id: item.id,
    nome: item.name,
    ativo: item.active,
    data_criacao: item.createdAt,
  });

  async function hasActiveName(accountId: number, name: string, exceptId?: number): Promise<boolean> {
    const conditions: SQL[] = [
      eq(table.accountId, accountId),
      eq(table.active, true),
      sql`LOWER(${table.name}) = LOWER(${name})`,
    ];
    if (exceptId !== undefined) {
      conditions.push(ne(table.id, exceptId));
    }
    const [found] = await db.select({ id: table.id }).from(table).where(and(...conditions)).limit(1);
    return found !== undefined;
  }

  /** Registro pelo id, desde que a conta dele seja do solicitante. */
  async function loadAccessibleItem(id: string | undefined, requesterId: number) {
    const itemId = readQueryId(id, labels.notFound);
    const [item] = itemId === null ? [] : await db.select().from(table).where(eq(table.id, itemId)).limit(1);
    if (!item || !(await canWriteToAccount(item.accountId, requesterId))) {
      throw new RequestInputError(labels.notFound, 404);
    }
    return item;
  }

  const failedMessage = `Não foi possível salvar o ${labels.singular} agora. Tente de novo em instantes.`;

  // GET /?conta_id=&incluir_inativos=true
  router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
      const account = await resolveCompanyAccount(req.user!.id, readRequiredId(req.query['conta_id'], 'Informe a conta'), PERSONAL_ACCOUNT_MESSAGE);
      const includeInactive = req.query['incluir_inativos'] === 'true';
      const rows = await db
        .select()
        .from(table)
        .where(and(eq(table.accountId, account.id), ...(includeInactive ? [] : [eq(table.active, true)])))
        .orderBy(asc(table.name), asc(table.id));
      res.json({ success: true, data: rows.map(view) });
    } catch (error) {
      sendRequestError(res, error, `List ${labels.plural} error:`, req.user?.id, `Não foi possível carregar os ${labels.plural} agora.`);
    }
  });

  // POST / { conta_id, nome }
  router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
      const body = readRecord(req.body, 'Pedido inválido');
      const name = readAccountCatalogName(body['nome'], labels);
      const account = await resolveCompanyAccount(req.user!.id, readRequiredId(body['conta_id'], 'Informe a conta'), PERSONAL_ACCOUNT_MESSAGE);
      if (await hasActiveName(account.id, name)) {
        throw new RequestInputError(labels.duplicate);
      }

      const [created] = await db
        .insert(table)
        .values({ userId: account.ownerId, accountId: account.id, name })
        .returning();
      res.status(201).json({ success: true, data: view(created!) });
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(400).json({ success: false, message: labels.duplicate });
        return;
      }
      sendRequestError(res, error, `Create ${labels.singular} error:`, req.user?.id, failedMessage);
    }
  });

  // PUT /:id { nome }
  router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
      const body = readRecord(req.body, 'Pedido inválido');
      const name = readAccountCatalogName(body['nome'], labels);
      const item = await loadAccessibleItem(req.params['id'], req.user!.id);
      if (item.active && await hasActiveName(item.accountId, name, item.id)) {
        throw new RequestInputError(labels.duplicate);
      }

      const [updated] = await db.update(table).set({ name }).where(eq(table.id, item.id)).returning();
      res.json({ success: true, data: view(updated!) });
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(400).json({ success: false, message: labels.duplicate });
        return;
      }
      sendRequestError(res, error, `Update ${labels.singular} error:`, req.user?.id, failedMessage);
    }
  });

  // DELETE /:id — desativa; quem já usa o item continua com ele.
  router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
      const item = await loadAccessibleItem(req.params['id'], req.user!.id);
      await db.update(table).set({ active: false }).where(eq(table.id, item.id));
      res.json({ success: true });
    } catch (error) {
      sendRequestError(res, error, `Deactivate ${labels.singular} error:`, req.user?.id, failedMessage);
    }
  });

  return router;
}

export const sectorRoutes = createAccountNameCatalogRouter({
  table: sectors,
  labels: { singular: 'setor', plural: 'setores', notFound: 'Setor não encontrado', duplicate: 'Já existe um setor com esse nome' },
});

export const jobTitleRoutes = createAccountNameCatalogRouter({
  table: jobTitles,
  labels: { singular: 'cargo', plural: 'cargos', notFound: 'Cargo não encontrado', duplicate: 'Já existe um cargo com esse nome' },
});
