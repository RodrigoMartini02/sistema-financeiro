import path from 'path';
import fs from 'fs';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { eq, and, asc, desc, max } from 'drizzle-orm';
import { db } from '../../../db/client';
import { authenticate } from '../../../middleware/auth';
import { requireCatalogAccess, requireScreenAccess } from '../../../middleware/permissions';
import { catalogoProdutos, catalogoProdutoImagens, catalogoMovimentacoesEstoque, type CatalogoProduto } from '../db/schema';
import { isUuid, isValidProdutoImagemMimeType } from '../../../services/catalogo';
import { readProductAccountId, readProductInput, readStockMovementInput, type ProductInput } from '../../../services/productInput';
import { buildProductPricing } from '../../../services/productPricing';
import { listImagesByProduct } from '../../../services/productImages';
import { STOCK_REASONS, recordStockMovement, type StockExecutor } from '../../../services/stock';
import { canWriteToAccount, resolveCompanyAccount } from '../../../utils/accountAccess';
import { RequestInputError, readRequiredId, sendRequestError } from '../../../utils/requestInput';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'catalogo');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const MAX_UPLOAD_SIZE = 8 * 1024 * 1024;
const MAX_OUTPUT_DIMENSION = 1600;
const MOVEMENT_HISTORY_LIMIT = 100;

const PERSONAL_ACCOUNT_MESSAGE = 'Produtos só existem em conta de empresa';
const PRODUCT_NOT_FOUND_MESSAGE = 'Produto não encontrado';
const IMAGE_NOT_FOUND_MESSAGE = 'Imagem não encontrada';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!isValidProdutoImagemMimeType(file.mimetype)) {
      cb(new Error('INVALID_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

function toDecimal(value: number): string {
  return value.toFixed(2);
}

function toQuantity(value: number | null): string | null {
  return value === null ? null : value.toFixed(3);
}

/** Colunas que o cadastro grava, iguais na criação e na edição. */
function productColumns(input: ProductInput) {
  return {
    nome: input.name,
    descricao: input.description,
    valor: toDecimal(input.price),
    descontoTipo: input.discount?.type ?? null,
    descontoValor: input.discount ? toDecimal(input.discount.value) : null,
    categoria: input.category,
    controlaEstoque: input.tracksStock,
    estoqueMinimo: toQuantity(input.minimumStock),
  };
}

/**
 * Produto pelo id, desde que a conta PJ dele seja do solicitante (dono ou
 * colaborador dela). Só o id não basta: com duas PJs do mesmo dono, o
 * colaborador de uma não mexe nos produtos da outra. Produto sem conta, de
 * conta alheia ou inexistente dão a mesma resposta.
 */
async function loadAccessibleProduct(productId: string | undefined, requesterId: number): Promise<CatalogoProduto> {
  const [product] = productId && isUuid(productId)
    ? await db.select().from(catalogoProdutos).where(eq(catalogoProdutos.id, productId)).limit(1)
    : [];
  if (!product || product.contaId === null || !(await canWriteToAccount(product.contaId, requesterId))) {
    throw new RequestInputError(PRODUCT_NOT_FOUND_MESSAGE, 404);
  }
  return product;
}

async function hasStockMovements(executor: StockExecutor, productId: string): Promise<boolean> {
  const [movement] = await executor
    .select({ id: catalogoMovimentacoesEstoque.id })
    .from(catalogoMovimentacoesEstoque)
    .where(eq(catalogoMovimentacoesEstoque.produtoId, productId))
    .limit(1);
  return movement !== undefined;
}

/** Produto como as telas recebem: com o preço final, o selo de desconto e as imagens. */
async function toProductViews(products: CatalogoProduto[]) {
  const imagesByProduct = await listImagesByProduct(products.map((product) => product.id));
  return products.map((product) => ({
    ...product,
    ...buildProductPricing(product),
    imagens: imagesByProduct.get(product.id) ?? [],
  }));
}

async function loadProductView(productId: string) {
  const [product] = await db.select().from(catalogoProdutos).where(eq(catalogoProdutos.id, productId)).limit(1);
  const [view] = await toProductViews([product!]);
  return view;
}

// GET /api/catalogo/produtos?conta_id= — produtos da conta PJ.
// A listagem também abre para quem lança receita com produto vendido (utils/catalogAccess.ts).
router.get('/', authenticate, requireCatalogAccess('products'), async (req: Request, res: Response): Promise<void> => {
  try {
    const account = await resolveCompanyAccount(
      req.user!.id,
      readRequiredId(req.query['conta_id'], 'Informe a conta'),
      PERSONAL_ACCOUNT_MESSAGE,
    );
    const products = await db
      .select()
      .from(catalogoProdutos)
      .where(and(eq(catalogoProdutos.contaId, account.id), eq(catalogoProdutos.usuarioId, account.ownerId)))
      .orderBy(asc(catalogoProdutos.nome), asc(catalogoProdutos.id));

    res.json({ success: true, data: await toProductViews(products) });
  } catch (error) {
    sendRequestError(res, error, 'List catalogo produtos error:', req.user?.id, 'Não foi possível carregar os produtos agora.');
  }
});

// POST /api/catalogo/produtos — o produto nasce na conta PJ informada; com o
// controle de estoque ligado, a quantidade inicial vira a entrada "Estoque inicial".
router.post('/', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const input = readProductInput(req.body);
    const account = await resolveCompanyAccount(req.user!.id, readProductAccountId(req.body), PERSONAL_ACCOUNT_MESSAGE);

    const productId = await db.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(catalogoProdutos)
        .values({
          ...productColumns(input),
          usuarioId: account.ownerId,
          contaId: account.id,
          ativo: input.active ?? true,
        })
        .returning({ id: catalogoProdutos.id });

      if (input.initialQuantity > 0) {
        await recordStockMovement(transaction, {
          productId: created!.id,
          ownerId: account.ownerId,
          type: 'entrada',
          quantity: input.initialQuantity,
          reason: STOCK_REASONS.initialStock,
        });
      }
      return created!.id;
    });

    res.status(201).json({ success: true, message: 'Produto criado', data: await loadProductView(productId) });
  } catch (error) {
    sendRequestError(res, error, 'Create catalogo produto error:', req.user?.id, 'Não foi possível salvar o produto agora.');
  }
});

// PUT /api/catalogo/produtos/:id — a conta não muda. Ligar o controle num
// produto sem movimentação aceita a quantidade inicial.
router.put('/:id', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const product = await loadAccessibleProduct(req.params['id'], req.user!.id);
    const input = readProductInput(req.body);

    await db.transaction(async (transaction) => {
      if (input.initialQuantity > 0
        && (product.controlaEstoque || await hasStockMovements(transaction, product.id))) {
        throw new RequestInputError('A quantidade inicial só vale ao ligar o controle de um produto sem movimentação');
      }

      await transaction
        .update(catalogoProdutos)
        .set({
          ...productColumns(input),
          ativo: input.active,
          updatedAt: new Date(),
        })
        .where(eq(catalogoProdutos.id, product.id));

      if (input.initialQuantity > 0) {
        await recordStockMovement(transaction, {
          productId: product.id,
          ownerId: product.usuarioId,
          type: 'entrada',
          quantity: input.initialQuantity,
          reason: STOCK_REASONS.initialStock,
        });
      }
    });

    res.json({ success: true, message: 'Produto atualizado', data: await loadProductView(product.id) });
  } catch (error) {
    sendRequestError(res, error, 'Update catalogo produto error:', req.user?.id, 'Não foi possível salvar o produto agora.');
  }
});

// POST /api/catalogo/produtos/:id/imagens
router.post(
  '/:id/imagens',
  authenticate,
  requireScreenAccess('accessProductCatalog'),
  upload.single('imagem'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const file = req.file;
      if (!file) {
        throw new RequestInputError('Envie uma imagem');
      }
      const product = await loadAccessibleProduct(req.params['id'], req.user!.id);

      const [last] = await db
        .select({ ordem: max(catalogoProdutoImagens.ordem) })
        .from(catalogoProdutoImagens)
        .where(eq(catalogoProdutoImagens.produtoId, product.id));
      const nextOrder = last?.ordem === null || last?.ordem === undefined ? 0 : last.ordem + 1;

      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
      await sharp(file.buffer)
        .resize({ width: MAX_OUTPUT_DIMENSION, height: MAX_OUTPUT_DIMENSION, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(path.join(UPLOAD_DIR, filename));

      const [image] = await db
        .insert(catalogoProdutoImagens)
        .values({ produtoId: product.id, nomeArquivo: filename, ordem: nextOrder })
        .returning();

      res.status(201).json({ success: true, message: 'Imagem enviada', data: image });
    } catch (error) {
      sendRequestError(res, error, 'Upload catalogo produto imagem error:', req.user?.id, 'Não foi possível enviar a imagem agora.');
    }
  },
);

// GET /api/catalogo/produtos/imagens/:nomeArquivo — stream file inline
router.get('/imagens/:nomeArquivo', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const nomeArquivo = path.basename(req.params['nomeArquivo'] ?? '');
    const [image] = await db
      .select({ produtoId: catalogoProdutoImagens.produtoId })
      .from(catalogoProdutoImagens)
      .where(eq(catalogoProdutoImagens.nomeArquivo, nomeArquivo))
      .limit(1);
    if (!image) {
      throw new RequestInputError(IMAGE_NOT_FOUND_MESSAGE, 404);
    }
    await loadAccessibleProduct(image.produtoId, req.user!.id);

    const filePath = path.join(UPLOAD_DIR, nomeArquivo);
    if (!fs.existsSync(filePath)) {
      throw new RequestInputError(IMAGE_NOT_FOUND_MESSAGE, 404);
    }
    res.setHeader('Content-Type', 'image/webp');
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    sendRequestError(res, error, 'Get catalogo produto imagem error:', req.user?.id, 'Não foi possível carregar a imagem agora.');
  }
});

// DELETE /api/catalogo/produtos/imagens/:imagemId
router.delete('/imagens/:imagemId', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const imageId = req.params['imagemId'] ?? '';
    const [image] = isUuid(imageId)
      ? await db.select().from(catalogoProdutoImagens).where(eq(catalogoProdutoImagens.id, imageId)).limit(1)
      : [];
    if (!image) {
      throw new RequestInputError(IMAGE_NOT_FOUND_MESSAGE, 404);
    }
    await loadAccessibleProduct(image.produtoId, req.user!.id);

    await db.delete(catalogoProdutoImagens).where(eq(catalogoProdutoImagens.id, image.id));
    const filePath = path.join(UPLOAD_DIR, path.basename(image.nomeArquivo));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.json({ success: true, message: 'Imagem removida' });
  } catch (error) {
    sendRequestError(res, error, 'Delete catalogo produto imagem error:', req.user?.id, 'Não foi possível remover a imagem agora.');
  }
});

// POST /api/catalogo/produtos/:id/estoque — entrada ou saída manual, só com o controle ligado
router.post('/:id/estoque', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const product = await loadAccessibleProduct(req.params['id'], req.user!.id);
    if (!product.controlaEstoque) {
      throw new RequestInputError('Ligue o controle de estoque deste produto');
    }
    const movement = readStockMovementInput(req.body);

    const result = await db.transaction((transaction) => recordStockMovement(transaction, {
      productId: product.id,
      ownerId: product.usuarioId,
      type: movement.type,
      quantity: movement.quantity,
      reason: movement.reason,
    }));

    res.status(201).json({
      success: true,
      message: movement.type === 'entrada' ? 'Entrada registrada' : 'Saída registrada',
      data: { saldoAtual: result.currentBalance },
    });
  } catch (error) {
    sendRequestError(res, error, 'Registrar movimentacao estoque error:', req.user?.id, 'Não foi possível registrar a movimentação agora.');
  }
});

// GET /api/catalogo/produtos/:id/estoque/movimentacoes — historico do produto
router.get('/:id/estoque/movimentacoes', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const product = await loadAccessibleProduct(req.params['id'], req.user!.id);
    const movements = await db
      .select()
      .from(catalogoMovimentacoesEstoque)
      .where(eq(catalogoMovimentacoesEstoque.produtoId, product.id))
      .orderBy(desc(catalogoMovimentacoesEstoque.createdAt))
      .limit(MOVEMENT_HISTORY_LIMIT);

    res.json({ success: true, data: movements });
  } catch (error) {
    sendRequestError(res, error, 'List movimentacoes estoque error:', req.user?.id, 'Não foi possível carregar o histórico agora.');
  }
});

export default router;
