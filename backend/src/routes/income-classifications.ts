import { Router, Request, Response } from 'express';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { incomeClassifications, incomes, type IncomeClassification } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { ACCOUNT_ACCESS_DENIED } from '../utils/accountAccess';
import {
  belongsToCatalog,
  findCatalogClassification,
  resolveIncomeClassificationCatalog,
  type IncomeClassificationCatalog,
} from '../services/incomeClassificationCatalog';

// Classificações de receita: mesmo comportamento de routes/categories.ts
// (padrão do tipo da conta + criadas na conta, um nível de subcategoria,
// desativar em vez de apagar o que está em uso). A conta vem sempre em
// `conta_id` e é validada no servidor.

const router = Router();
const NOME_MAXIMO = 100;

function toResponse(row: IncomeClassification) {
  return {
    id: row.id,
    nome: row.name,
    parent_id: row.parentId,
    tipo: row.type,
    conta_id: row.accountId,
    ativo: row.active,
    data_criacao: row.createdAt,
    data_atualizacao: row.updatedAt,
  };
}

function readAccountId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function catalogFromRequest(req: Request, res: Response, accountIdValue: unknown): Promise<IncomeClassificationCatalog | null> {
  const catalog = await resolveIncomeClassificationCatalog(req.user!.id, readAccountId(accountIdValue));
  if (!catalog) res.status(400).json({ success: false, message: ACCOUNT_ACCESS_DENIED });
  return catalog;
}

function readName(value: unknown): string | null {
  const nome = typeof value === 'string' ? value.trim() : '';
  return nome && nome.length <= NOME_MAXIMO ? nome : null;
}

/** Nome já usado no catálogo (padrão ou criada), ignorando `exceptId` na edição. */
async function nameTaken(catalog: IncomeClassificationCatalog, nome: string, exceptId?: number): Promise<boolean> {
  const [found] = await db
    .select({ id: incomeClassifications.id })
    .from(incomeClassifications)
    .where(and(
      belongsToCatalog(catalog),
      sql`LOWER(${incomeClassifications.name}) = LOWER(${nome})`,
      exceptId ? ne(incomeClassifications.id, exceptId) : undefined,
    ))
    .limit(1);
  return !!found;
}

// GET /api/income-classifications?conta_id=
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const catalog = await catalogFromRequest(req, res, req.query['conta_id']);
    if (!catalog) return;

    const rows = await db
      .select()
      .from(incomeClassifications)
      .where(belongsToCatalog(catalog))
      .orderBy(asc(incomeClassifications.name));

    res.json({ success: true, data: rows.map(toResponse) });
  } catch (error) {
    console.error('List income classifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to list income classifications' });
  }
});

// POST /api/income-classifications
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome, parent_id, conta_id } = req.body as Record<string, unknown>;
    const catalog = await catalogFromRequest(req, res, conta_id);
    if (!catalog) return;

    const name = readName(nome);
    if (!name) {
      res.status(400).json({ success: false, message: `Name is required (up to ${NOME_MAXIMO} characters)` });
      return;
    }

    const parentId = parent_id == null || parent_id === '' ? null : Number(parent_id);
    if (parentId !== null) {
      const parent = Number.isInteger(parentId) ? await findCatalogClassification(catalog, parentId) : null;
      if (!parent) {
        res.status(400).json({ success: false, message: 'Parent classification not found' });
        return;
      }
      if (parent.parentId !== null) {
        res.status(400).json({ success: false, message: 'Cannot create a subcategory of a subcategory' });
        return;
      }
    }

    if (await nameTaken(catalog, name)) {
      res.status(400).json({ success: false, message: 'A classification with this name already exists' });
      return;
    }

    // Toda classificação criada pela tela é da conta onde foi criada; as
    // padrão só são gravadas por ensureDefaultIncomeClassifications.
    const [created] = await db
      .insert(incomeClassifications)
      .values({ userId: catalog.ownerId, accountId: catalog.accountId, name, parentId })
      .returning();

    res.status(201).json({ success: true, message: 'Income classification created', data: toResponse(created!) });
  } catch (error) {
    console.error('Create income classification error:', error);
    res.status(500).json({ success: false, message: 'Failed to create income classification' });
  }
});

// PUT /api/income-classifications/:id?conta_id=
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const catalog = await catalogFromRequest(req, res, req.query['conta_id']);
    if (!catalog) return;

    const id = Number(req.params['id']);
    const existing = Number.isInteger(id) ? await findCatalogClassification(catalog, id) : null;
    if (!existing) {
      res.status(404).json({ success: false, message: 'Income classification not found' });
      return;
    }

    const name = readName((req.body as Record<string, unknown>)['nome']);
    if (!name) {
      res.status(400).json({ success: false, message: `Name is required (up to ${NOME_MAXIMO} characters)` });
      return;
    }
    if (await nameTaken(catalog, name, id)) {
      res.status(400).json({ success: false, message: 'A classification with this name already exists' });
      return;
    }

    const [updated] = await db
      .update(incomeClassifications)
      .set({ name, updatedAt: new Date() })
      .where(eq(incomeClassifications.id, id))
      .returning();

    res.json({ success: true, message: 'Income classification updated', data: toResponse(updated!) });
  } catch (error) {
    console.error('Update income classification error:', error);
    res.status(500).json({ success: false, message: 'Failed to update income classification' });
  }
});

// PATCH /api/income-classifications/:id/toggle-active?conta_id=
router.patch('/:id/toggle-active', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const catalog = await catalogFromRequest(req, res, req.query['conta_id']);
    if (!catalog) return;

    const id = Number(req.params['id']);
    const existing = Number.isInteger(id) ? await findCatalogClassification(catalog, id) : null;
    if (!existing) {
      res.status(404).json({ success: false, message: 'Income classification not found' });
      return;
    }

    const [updated] = await db
      .update(incomeClassifications)
      .set({ active: !existing.active, updatedAt: new Date() })
      .where(eq(incomeClassifications.id, id))
      .returning();

    res.json({ success: true, message: `Income classification ${updated!.active ? 'activated' : 'deactivated'}`, data: toResponse(updated!) });
  } catch (error) {
    console.error('Toggle income classification error:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle income classification' });
  }
});

// DELETE /api/income-classifications/:id?conta_id=
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const catalog = await catalogFromRequest(req, res, req.query['conta_id']);
    if (!catalog) return;

    const id = Number(req.params['id']);
    const existing = Number.isInteger(id) ? await findCatalogClassification(catalog, id) : null;
    if (!existing) {
      res.status(404).json({ success: false, message: 'Income classification not found' });
      return;
    }

    const [children] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(incomeClassifications)
      .where(eq(incomeClassifications.parentId, id));
    if ((children?.total ?? 0) > 0) {
      res.status(400).json({ success: false, message: 'Cannot delete: classification has subcategories. Delete subcategories first.' });
      return;
    }

    // Checagem de integridade: qualquer uso bloqueia, de qualquer membro ou
    // conta — a classificação padrão é compartilhada entre as contas do tipo.
    const [usage] = await db
      .select({
        total: sql<number>`(
          (SELECT COUNT(*) FROM ${incomes} WHERE ${incomes.classificationId} = ${id})
          + (SELECT COUNT(*) FROM comissoes WHERE classificacao_id = ${id})
          + (SELECT COUNT(*) FROM contratos WHERE classificacao_mensalidade_id = ${id} OR classificacao_implantacao_id = ${id})
        )::int`,
      })
      .from(incomeClassifications)
      .where(eq(incomeClassifications.id, id));
    if ((usage?.total ?? 0) > 0) {
      res.status(400).json({ success: false, message: `Cannot delete: classification is in use (${usage!.total}). Deactivate it instead.` });
      return;
    }

    await db.delete(incomeClassifications).where(eq(incomeClassifications.id, id));
    res.json({ success: true, message: `Income classification "${existing.name}" deleted` });
  } catch (error) {
    console.error('Delete income classification error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete income classification' });
  }
});

export default router;
