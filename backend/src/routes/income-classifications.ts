import { Router, Request, Response } from 'express';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  incomeClassificationFixes,
  incomeClassifications,
  incomes,
  type IncomeClassification,
  type IncomeClassificationFix,
} from '../db/schema';
import { authenticate } from '../middleware/auth';
import { contracts } from '../modules/contracts/db/schema';
import { ACCOUNT_ACCESS_DENIED } from '../utils/accountAccess';
import { getTodayIsoInTimezone } from '../utils/date';
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

const CONTRACT_BLOCKS_AUTO_LAUNCH = 'Classification used by an active contract: the contract already launches these incomes';
const GROUP_CANNOT_BE_FIXED = 'Classification with active subclassifications is only a group name: set one of its subclassifications as fixed';

function fixToResponse(fix: IncomeClassificationFix | undefined) {
  if (!fix) return null;
  return {
    valor: Number(fix.amount),
    dia_recebimento: fix.dayOfMonth,
    lancar_automatico: fix.autoLaunch,
  };
}

function toResponse(row: IncomeClassification, fix?: IncomeClassificationFix, inActiveContract = false) {
  return {
    id: row.id,
    nome: row.name,
    parent_id: row.parentId,
    tipo: row.type,
    conta_id: row.accountId,
    ativo: row.active,
    data_criacao: row.createdAt,
    data_atualizacao: row.updatedAt,
    // Configuração de fixa desta conta (a padrão é compartilhada entre contas).
    fixa: fixToResponse(fix),
    em_contrato_ativo: inActiveContract,
  };
}

/** Classificações apontadas por contrato ativo da conta: não ligam o automático. */
async function classificationsInActiveContracts(accountId: number): Promise<Set<number>> {
  const rows = await db
    .select({
      monthly: contracts.monthlyClassificationId,
      setup: contracts.setupClassificationId,
      project: contracts.projectClassificationId,
    })
    .from(contracts)
    .where(and(eq(contracts.accountId, accountId), eq(contracts.status, 'ativo')));
  const ids = new Set<number>();
  for (const row of rows) {
    for (const id of [row.monthly, row.setup, row.project]) {
      if (id !== null) ids.add(id);
    }
  }
  return ids;
}

async function fixesByClassification(accountId: number): Promise<Map<number, IncomeClassificationFix>> {
  const fixes = await db
    .select()
    .from(incomeClassificationFixes)
    .where(eq(incomeClassificationFixes.accountId, accountId));
  return new Map(fixes.map((fix) => [fix.classificationId, fix]));
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

    const [rows, fixes, inContracts] = await Promise.all([
      db.select().from(incomeClassifications).where(belongsToCatalog(catalog)).orderBy(asc(incomeClassifications.name)),
      fixesByClassification(catalog.accountId),
      classificationsInActiveContracts(catalog.accountId),
    ]);

    res.json({ success: true, data: rows.map((row) => toResponse(row, fixes.get(row.id), inContracts.has(row.id))) });
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

// PUT /api/income-classifications/:id/fixa?conta_id=
// Liga, altera ou desliga a classificação fixa NESTA conta. Quem configurou
// (autor das previstas automáticas) só muda ao desligar e ligar de novo.
router.put('/:id/fixa', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const catalog = await catalogFromRequest(req, res, req.query['conta_id']);
    if (!catalog) return;

    const id = Number(req.params['id']);
    const existing = Number.isInteger(id) ? await findCatalogClassification(catalog, id) : null;
    if (!existing) {
      res.status(404).json({ success: false, message: 'Income classification not found' });
      return;
    }

    const { fixa, valor, dia_recebimento, lancar_automatico } = req.body as Record<string, unknown>;
    const configWhere = and(
      eq(incomeClassificationFixes.classificationId, id),
      eq(incomeClassificationFixes.accountId, catalog.accountId),
    );

    if (fixa !== true) {
      await db.delete(incomeClassificationFixes).where(configWhere);
      res.json({ success: true, message: 'Fixed classification removed', data: toResponse(existing) });
      return;
    }

    const amount = Math.round(Number(valor) * 100) / 100;
    const day = Number(dia_recebimento);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(day) || day < 1 || day > 31 || typeof lancar_automatico !== 'boolean') {
      res.status(400).json({ success: false, message: 'Fixed classification needs amount > 0, day 1-31 and auto launch true/false' });
      return;
    }

    // Principal com subclassificação ativa é só o nome do grupo: não se escolhe
    // ao lançar, então também não pode ser fixa (a receita automática cairia nela).
    const [subAtiva] = await db
      .select({ id: incomeClassifications.id })
      .from(incomeClassifications)
      .where(and(eq(incomeClassifications.parentId, id), eq(incomeClassifications.active, true), belongsToCatalog(catalog)))
      .limit(1);
    if (subAtiva) {
      res.status(400).json({ success: false, message: GROUP_CANNOT_BE_FIXED });
      return;
    }

    const inContracts = await classificationsInActiveContracts(catalog.accountId);
    if (lancar_automatico && inContracts.has(id)) {
      res.status(400).json({ success: false, message: CONTRACT_BLOCKS_AUTO_LAUNCH });
      return;
    }

    const [current] = await db.select().from(incomeClassificationFixes).where(configWhere).limit(1);
    // O automático conta a partir do dia em que foi ligado; manter ligado
    // preserva a data, desligar zera.
    const autoSince = !lancar_automatico
      ? null
      : current?.autoLaunch && current.autoSince ? current.autoSince : getTodayIsoInTimezone();

    const [saved] = current
      ? await db
        .update(incomeClassificationFixes)
        .set({ amount: amount.toFixed(2), dayOfMonth: day, autoLaunch: lancar_automatico, autoSince, updatedAt: new Date() })
        .where(eq(incomeClassificationFixes.id, current.id))
        .returning()
      : await db
        .insert(incomeClassificationFixes)
        .values({
          classificationId: id,
          accountId: catalog.accountId,
          userId: req.user!.id,
          amount: amount.toFixed(2),
          dayOfMonth: day,
          autoLaunch: lancar_automatico,
          autoSince,
        })
        .returning();

    res.json({ success: true, message: 'Fixed classification saved', data: toResponse(existing, saved, inContracts.has(id)) });
  } catch (error) {
    console.error('Save fixed income classification error:', error);
    res.status(500).json({ success: false, message: 'Failed to save fixed classification' });
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
          + (SELECT COUNT(*) FROM ${contracts} WHERE ${contracts.monthlyClassificationId} = ${id}
             OR ${contracts.setupClassificationId} = ${id} OR ${contracts.projectClassificationId} = ${id})
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
