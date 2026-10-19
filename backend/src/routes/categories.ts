import { Router, Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { categories, type Category } from '../db/schema';
import { authenticate } from '../middleware/auth';
import {
  canReceiveEntries,
  normalizeCatalogName,
  readInitialSubcategoryNames,
  requiresInitialSubcategory,
  selectableEntryIds,
  type CatalogAccountType,
} from '../services/catalogRules';
import { ensureDefaultCategories } from '../services/defaultCategories';
import { isCategoryNameTaken, type CatalogScope } from '../services/expenseCategoryCatalog';
import { resolveAccountOwnerId, resolveVisibleUserIds } from '../utils/familyVisibility';

const router = Router();

const CATEGORY_NAME_MAX_LENGTH = 255;
const NAME_TAKEN = 'A category with this name already exists';
const SYSTEM_CATEGORY = 'System categories cannot be changed';

// Resolve o tipo de conta ('pessoal' | 'empresa') a partir do conta_id
// recebido do client, validando que a conta pertence ao usuario autenticado.
/**
 * Tipo da conta, confirmando que ela pertence a alguem que o solicitante pode
 * representar. Aceita lista porque numa carteira compartilhada a conta e do
 * gestor, e o membro precisa poder resolve-la sem ser o dono.
 */
async function resolveAccountType(contaId: string, userIds: number[]): Promise<CatalogAccountType | null> {
  const result = await pool.query(
    'SELECT tipo FROM contas WHERE id = $1 AND usuario_id = ANY($2)',
    [parseInt(contaId), userIds],
  );
  return result.rows.length > 0 ? (result.rows[0] as { tipo: CatalogAccountType }).tipo : null;
}

interface AccessibleCategory {
  id: number;
  usuarioId: number;
  contaId: number | null;
  tipo: string | null;
  nome: string;
  isSystem: boolean;
}

/**
 * Encontra uma categoria pelo id, aceitando tanto a categoria autorada pelo
 * proprio requester quanto — quando ela pertence a uma conta pessoal
 * compartilhada — a categoria autorada pelo dono ou por outro membro da
 * mesma conta. Sem isto, o dono nao conseguiria editar uma categoria criada
 * por um membro (e vice-versa), mesmo sendo a mesma conta.
 *
 * Retorna null quando a categoria nao existe ou nao pertence a conta/usuario
 * que o requester pode acessar.
 */
async function findAccessibleCategory(categoryId: number, requesterId: number): Promise<AccessibleCategory | null> {
  type Row = { id: number; usuario_id: number; conta_id: number | null; tipo: string | null; nome: string; sistema: boolean };
  const toCategory = (row: Row): AccessibleCategory => ({
    id: row.id,
    usuarioId: row.usuario_id,
    contaId: row.conta_id,
    tipo: row.tipo,
    nome: row.nome,
    isSystem: row.sistema,
  });

  const own = await pool.query(
    'SELECT id, usuario_id, conta_id, tipo, nome, sistema FROM categorias WHERE id = $1 AND usuario_id = $2',
    [categoryId, requesterId],
  );
  if (own.rows.length > 0) {
    return toCategory(own.rows[0] as Row);
  }

  const candidate = await pool.query(
    'SELECT id, usuario_id, conta_id, tipo, nome, sistema FROM categorias WHERE id = $1',
    [categoryId],
  );
  const row = candidate.rows[0] as Row | undefined;
  if (!row || !row.conta_id) return null;

  const ownerId = await resolveAccountOwnerId(requesterId, row.conta_id);
  if (ownerId !== row.usuario_id) return null;

  return toCategory(row);
}

/** Onde o nome da categoria precisa ser unico: o catalogo do tipo (padrao) ou o da conta (criada nela). */
async function nameScopeOf(category: AccessibleCategory): Promise<CatalogScope> {
  if (category.tipo) {
    return { type: category.tipo as CatalogAccountType, accountId: null };
  }
  const type = category.contaId ? await resolveAccountType(String(category.contaId), [category.usuarioId]) : null;
  return { type: type ?? 'pessoal', accountId: category.contaId };
}

function toResponse(category: Category, selectable: boolean) {
  return {
    id: category.id,
    nome: category.name,
    cor: category.color,
    icone: category.icon,
    parent_id: category.parentId,
    tipo: category.type,
    conta_id: category.accountId,
    ativo: category.ativo ?? true,
    is_system: category.isSystem,
    selectable,
    data_criacao: category.createdAt,
    data_atualizacao: category.updatedAt,
  };
}

// GET /api/categories
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { usuario_id, conta_id, escopo } = req.query as Record<string, string | undefined>;
    const accountIdNum = conta_id ? parseInt(conta_id) : null;

    // Carteira compartilhada: em conta pessoal as categorias sao da conta, nao
    // de cada pessoa. O membro nao recebe mais copias das categorias do gestor
    // (ver 0031), entao sem isto ele nao teria categoria nenhuma ao lancar.
    //
    // resolveAccountOwnerId nao depende de nenhuma permissao de familia: um
    // membro sem acesso_lancamentos_familia ainda precisa enxergar o catalogo
    // da conta para categorizar e ver o grafico dos proprios lancamentos —
    // isso nunca expoe lancamentos de outra pessoa, so o catalogo.
    const targetUserId = usuario_id && req.user!.type === 'admin'
      ? parseInt(usuario_id)
      : await resolveAccountOwnerId(req.user!.id, accountIdNum);
    const visiveis = await resolveVisibleUserIds(req.user!.id, accountIdNum, escopo === 'familia');

    let whereClause: string;
    const params: unknown[] = [];
    if (visiveis.length > 1) {
      params.push(visiveis);
      whereClause = 'WHERE c.usuario_id = ANY($1)';
    } else {
      params.push(targetUserId);
      whereClause = 'WHERE c.usuario_id = $1';
    }

    let accountType: CatalogAccountType | null = null;
    if (conta_id) {
      // O dono da conta valida por si; o membro valida pelo dono, senao
      // resolveAccountType nao acha a conta e o filtro de tipo nem se aplica.
      accountType = await resolveAccountType(conta_id, visiveis.length > 1 ? visiveis : [targetUserId]);
      if (accountType) {
        // Uniao: categorias PADRAO do tipo da conta ativa (globais, tipo
        // preenchido) OU categorias CUSTOM exclusivas deste conta_id
        // especifico (conta_id preenchido).
        //
        // O terceiro caso resgata categorias ORFAS — tipo e conta_id nulos,
        // criadas antes deste modelo existir. Sem ele elas nao satisfazem
        // nenhuma das duas condicoes acima e somem da lista, embora sigam no
        // banco e ainda referenciadas por lancamentos antigos. Despesas e
        // receitas ja tratam seus orfaos assim (ver utils/accountFilter.ts):
        // registro sem conta pertence a conta pessoal do dono.
        params.push(accountType, parseInt(conta_id));
        const orfaClause = accountType === 'pessoal'
          ? ' OR (c.tipo IS NULL AND c.conta_id IS NULL)'
          : '';
        whereClause += ` AND (c.tipo = $${params.length - 1} OR c.conta_id = $${params.length}${orfaClause})`;
      }
    }

    const result = await pool.query(
      `SELECT
        c.id, c.nome, c.cor, c.icone, c.forma_favorita, c.cartao_favorito_id, c.parent_id, c.tipo, c.conta_id,
        p.nome AS parent_nome, ct.nome AS cartao_favorito_nome,
        c.data_criacao, c.data_atualizacao,
        COALESCE(c.ativo, true) AS ativo,
        c.sistema AS is_system
       FROM categorias c
       LEFT JOIN cartoes ct ON c.cartao_favorito_id = ct.id
       LEFT JOIN categorias p ON c.parent_id = p.id
       ${whereClause}
       ORDER BY COALESCE(p.nome, c.nome) ASC, c.parent_id NULLS FIRST, c.nome ASC`,
      params,
    );

    // Quem recebe lancamento e decidido aqui, uma vez so (catalogRules): a tela
    // so obedece.
    const rows = result.rows as Array<{ id: number; parent_id: number | null; ativo: boolean; is_system: boolean }>;
    const selectable = selectableEntryIds(
      rows.map((row) => ({ id: row.id, parentId: row.parent_id, active: row.ativo, isSystem: row.is_system })),
      accountType,
    );

    res.json({
      success: true,
      message: 'Categories loaded',
      data: rows.map((row) => ({ ...row, selectable: selectable.has(row.id) })),
    });
  } catch (error) {
    console.error('List categories error:', error);
    res.status(500).json({ success: false, message: 'Failed to list categories' });
  }
});

// POST /api/categories/default
router.post('/default', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const before = await pool.query('SELECT COUNT(*) AS total FROM categorias WHERE usuario_id = $1', [req.user!.id]);
    const totalBefore = parseInt((before.rows[0] as { total: string }).total);

    await ensureDefaultCategories(req.user!.id, 'pessoal');

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

    const category = await findAccessibleCategory(categoryId, req.user!.id);

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
// Cria uma subcategoria (parent_id) ou uma categoria nova. Em conta pessoal a
// categoria nova so existe com ao menos uma subcategoria (subcategories), criadas
// juntas: o grupo sozinho nao recebe lancamento.
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome, cor, icone, parent_id, conta_id } = req.body as Record<string, string | undefined>;

    if (!nome?.trim()) {
      res.status(400).json({ success: false, message: 'Category name is required' });
      return;
    }
    if (nome.length > CATEGORY_NAME_MAX_LENGTH) {
      res.status(400).json({ success: false, message: 'Category name must be at most 255 characters' });
      return;
    }
    const subcategoryNames = readInitialSubcategoryNames((req.body as Record<string, unknown>)['subcategories'], CATEGORY_NAME_MAX_LENGTH);
    if (subcategoryNames === null) {
      res.status(400).json({ success: false, message: 'Subcategories must be a list of distinct names' });
      return;
    }

    const parentId = parent_id ? parseInt(parent_id) : null;
    if (parentId !== null && subcategoryNames.length > 0) {
      res.status(400).json({ success: false, message: 'Cannot create subcategories together with a subcategory' });
      return;
    }

    // Toda categoria criada manualmente e CUSTOM — exclusiva da conta onde
    // foi criada, nunca compartilhada com outras contas do mesmo tipo.
    // Categorias PADRAO so sao gravadas por ensureDefaultCategories.
    //
    // Em conta pessoal compartilhada, o catalogo pertence a conta, nao a
    // quem criou: por isso resolvemos o dono via resolveAccountOwnerId e
    // gravamos/deduplicamos sob esse usuario_id, mesmo quando quem esta
    // criando e um membro. Sem isto, uma categoria criada pelo membro
    // ficaria presa ao usuario_id dele e nao apareceria nem para ele mesmo
    // na leitura (GET resolve pelo dono), nem para o resto da familia.
    let accountId: number | null = null;
    let accountType: CatalogAccountType | null = null;
    let ownerId = req.user!.id;
    if (conta_id) {
      ownerId = await resolveAccountOwnerId(req.user!.id, parseInt(conta_id));
      accountType = await resolveAccountType(conta_id, [ownerId]);
      if (!accountType) {
        res.status(400).json({ success: false, message: 'Account not found' });
        return;
      }
      accountId = parseInt(conta_id);
    }

    if (parentId === null && subcategoryNames.length === 0 && requiresInitialSubcategory(accountType)) {
      res.status(400).json({ success: false, message: 'A new category needs at least one subcategory' });
      return;
    }

    if (parentId !== null) {
      const [parent] = await db
        .select({ id: categories.id, parentId: categories.parentId, isSystem: categories.isSystem })
        .from(categories)
        .where(and(eq(categories.id, parentId), eq(categories.userId, ownerId)))
        .limit(1);
      if (!parent) {
        res.status(400).json({ success: false, message: 'Parent category not found' });
        return;
      }
      if (parent.parentId !== null) {
        res.status(400).json({ success: false, message: 'Cannot create a subcategory of a subcategory' });
        return;
      }
      if (parent.isSystem) {
        res.status(400).json({ success: false, message: SYSTEM_CATEGORY });
        return;
      }
    }

    // O nome vale no catalogo inteiro (padrao e criadas), como nas classificacoes de receita.
    const name = nome.trim();
    const scope: CatalogScope = { type: accountType ?? 'pessoal', accountId };
    const newNames = [name, ...subcategoryNames];
    const repeatedInRequest = subcategoryNames.some((subName) => normalizeCatalogName(subName) === normalizeCatalogName(name));
    let taken = repeatedInRequest;
    for (const newName of newNames) {
      taken = taken || await isCategoryNameTaken(ownerId, scope, newName);
    }
    if (taken) {
      res.status(400).json({ success: false, message: NAME_TAKEN });
      return;
    }

    const color = cor ?? '#3498db';
    const created = await db.transaction(async (transaction) => {
      const [category] = await transaction
        .insert(categories)
        .values({ userId: ownerId, name, color, icon: icone ?? null, parentId, accountId })
        .returning();
      const subcategories = subcategoryNames.length > 0
        ? await transaction
          .insert(categories)
          .values(subcategoryNames.map((subName) => ({ userId: ownerId, name: subName, color, parentId: category!.id, accountId })))
          .returning()
        : [];
      return { category: category!, subcategories };
    });

    const data = {
      ...toResponse(created.category, canReceiveEntries(
        { id: created.category.id, parentId, active: true, isSystem: false },
        created.subcategories.length > 0,
        accountType,
      )),
      subcategories: created.subcategories.map((subcategory) => toResponse(subcategory, true)),
    };
    res.status(201).json({ success: true, message: 'Category created', data });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ success: false, message: 'Failed to create category' });
  }
});

// PUT /api/categories/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const categoryId = parseInt(req.params['id']!);
    const { nome, cor, icone } = req.body as Record<string, string | undefined>;

    if (isNaN(categoryId)) {
      res.status(400).json({ success: false, message: 'Category ID must be a valid number' });
      return;
    }
    if (!nome?.trim()) {
      res.status(400).json({ success: false, message: 'Category name is required' });
      return;
    }

    const existing = await findAccessibleCategory(categoryId, req.user!.id);

    if (!existing) {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }
    if (existing.isSystem) {
      res.status(400).json({ success: false, message: SYSTEM_CATEGORY });
      return;
    }

    // Sempre sob o usuario_id dono da categoria, nao o requester — em conta
    // pessoal compartilhada os dois podem divergir.
    if (await isCategoryNameTaken(existing.usuarioId, await nameScopeOf(existing), nome, categoryId)) {
      res.status(400).json({ success: false, message: NAME_TAKEN });
      return;
    }

    const result = await pool.query(
      `UPDATE categorias
       SET nome = $1, cor = COALESCE($2, cor), icone = COALESCE($3, icone), data_atualizacao = CURRENT_TIMESTAMP
       WHERE id = $4 AND usuario_id = $5
       RETURNING id, nome, cor, icone, parent_id, tipo, conta_id, data_criacao, data_atualizacao`,
      [nome.trim(), cor ?? null, icone ?? null, categoryId, existing.usuarioId],
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

    const existing = await findAccessibleCategory(categoryId, req.user!.id);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }
    if (existing.isSystem) {
      res.status(400).json({ success: false, message: SYSTEM_CATEGORY });
      return;
    }

    const result = await pool.query(
      `UPDATE categorias
       SET ativo = NOT COALESCE(ativo, true), data_atualizacao = CURRENT_TIMESTAMP
       WHERE id = $1 AND usuario_id = $2
       RETURNING id, nome, COALESCE(ativo, true) AS active`,
      [categoryId, existing.usuarioId],
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

    const existing = await findAccessibleCategory(categoryId, req.user!.id);

    if (!existing) {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }
    if (existing.isSystem) {
      res.status(400).json({ success: false, message: SYSTEM_CATEGORY });
      return;
    }

    const [updated] = await db.update(categories)
      .set({ favoritePaymentMethod: forma_favorita ?? null, favoriteCardId: cartao_favorito_id ? parseInt(cartao_favorito_id) : null, updatedAt: new Date() })
      .where(and(eq(categories.id, categoryId), eq(categories.userId, existing.usuarioId)))
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

    const existing = await findAccessibleCategory(categoryId, req.user!.id);

    if (!existing) {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }
    if (existing.isSystem) {
      res.status(400).json({ success: false, message: SYSTEM_CATEGORY });
      return;
    }

    const childrenResult = await pool.query('SELECT COUNT(*) AS total FROM categorias WHERE parent_id = $1', [categoryId]);
    if (parseInt((childrenResult.rows[0] as { total: string }).total) > 0) {
      res.status(400).json({ success: false, message: 'Cannot delete: category has subcategories. Delete subcategories first.' });
      return;
    }

    // Em conta pessoal compartilhada, despesas de qualquer membro contam
    // para o uso da categoria — nao so as do requester. Sempre expandido
    // aqui: e checagem de integridade antes de excluir, nao exibicao de
    // dados, entao nao depende do escopo de visualizacao escolhido na tela.
    const visiveis = await resolveVisibleUserIds(req.user!.id, existing.contaId, true);
    const usageResult = await pool.query(
      'SELECT COUNT(*) AS total FROM despesas WHERE categoria_id = $1 AND usuario_id = ANY($2)',
      [categoryId, visiveis],
    );
    const totalUses = parseInt((usageResult.rows[0] as { total: string }).total);
    if (totalUses > 0) {
      res.status(400).json({ success: false, message: `Cannot delete: category is used in ${totalUses} expense(s).` });
      return;
    }

    await db.delete(categories).where(and(eq(categories.id, categoryId), eq(categories.userId, existing.usuarioId)));
    res.json({ success: true, message: `Category "${existing.nome}" deleted` });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete category' });
  }
});

export default router;
