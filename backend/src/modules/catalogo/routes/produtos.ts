import path from 'path';
import fs from 'fs';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { db } from '../../../db/client';
import { authenticate } from '../../../middleware/auth';
import { requireScreenAccess } from '../../../middleware/permissions';
import { catalogoProdutos, catalogoProdutoImagens } from '../db/schema';
import { isValidProdutoValor, isValidProdutoImagemMimeType } from '../../../services/catalogo';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'catalogo');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const MAX_UPLOAD_SIZE = 8 * 1024 * 1024;
const MAX_OUTPUT_DIMENSION = 1600;

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

// GET /api/catalogo/produtos
router.get('/', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const produtos = await db
      .select()
      .from(catalogoProdutos)
      .where(eq(catalogoProdutos.usuarioId, req.user!.id))
      .orderBy(asc(catalogoProdutos.nome));

    const produtoIds = produtos.map((produto) => produto.id);
    const imagens = produtoIds.length
      ? await db
          .select()
          .from(catalogoProdutoImagens)
          .where(inArray(catalogoProdutoImagens.produtoId, produtoIds))
          .orderBy(asc(catalogoProdutoImagens.ordem))
      : [];

    const imagensPorProduto = new Map<string, typeof imagens>();
    for (const imagem of imagens) {
      const lista = imagensPorProduto.get(imagem.produtoId) ?? [];
      lista.push(imagem);
      imagensPorProduto.set(imagem.produtoId, lista);
    }

    const data = produtos.map((produto) => ({
      ...produto,
      imagens: imagensPorProduto.get(produto.id) ?? [],
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error('List catalogo produtos error:', error);
    res.status(500).json({ success: false, message: 'Failed to list produtos' });
  }
});

// POST /api/catalogo/produtos
router.post('/', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome, descricao, valor } = req.body as Record<string, unknown>;

    if (!nome || String(nome).trim() === '') {
      res.status(400).json({ success: false, message: 'Nome é obrigatório' });
      return;
    }

    if (!isValidProdutoValor(valor)) {
      res.status(400).json({ success: false, message: 'Valor deve ser maior que zero' });
      return;
    }
    const valorNumerico = Number(valor);

    const [produto] = await db
      .insert(catalogoProdutos)
      .values({
        usuarioId: req.user!.id,
        nome: String(nome).trim(),
        descricao: descricao ? String(descricao).trim() : null,
        valor: valorNumerico.toFixed(2),
      })
      .returning();

    res.status(201).json({ success: true, message: 'Produto criado', data: produto });
  } catch (error) {
    console.error('Create catalogo produto error:', error);
    res.status(500).json({ success: false, message: 'Failed to create produto' });
  }
});

// PUT /api/catalogo/produtos/:id
router.put('/:id', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome, descricao, valor, ativo } = req.body as Record<string, unknown>;

    if (!nome || String(nome).trim() === '') {
      res.status(400).json({ success: false, message: 'Nome é obrigatório' });
      return;
    }

    if (!isValidProdutoValor(valor)) {
      res.status(400).json({ success: false, message: 'Valor deve ser maior que zero' });
      return;
    }
    const valorNumerico = Number(valor);

    const [produto] = await db
      .update(catalogoProdutos)
      .set({
        nome: String(nome).trim(),
        descricao: descricao ? String(descricao).trim() : null,
        valor: valorNumerico.toFixed(2),
        ativo: typeof ativo === 'boolean' ? ativo : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(catalogoProdutos.id, req.params['id']!), eq(catalogoProdutos.usuarioId, req.user!.id)))
      .returning();

    if (!produto) {
      res.status(404).json({ success: false, message: 'Produto not found' });
      return;
    }

    res.json({ success: true, message: 'Produto atualizado', data: produto });
  } catch (error) {
    console.error('Update catalogo produto error:', error);
    res.status(500).json({ success: false, message: 'Failed to update produto' });
  }
});

// DELETE /api/catalogo/produtos/:id
router.delete('/:id', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const imagens = await db
      .select()
      .from(catalogoProdutoImagens)
      .where(eq(catalogoProdutoImagens.produtoId, req.params['id']!));

    const [produto] = await db
      .delete(catalogoProdutos)
      .where(and(eq(catalogoProdutos.id, req.params['id']!), eq(catalogoProdutos.usuarioId, req.user!.id)))
      .returning();

    if (!produto) {
      res.status(404).json({ success: false, message: 'Produto not found' });
      return;
    }

    for (const imagem of imagens) {
      const filePath = path.join(UPLOAD_DIR, path.basename(imagem.nomeArquivo));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.json({ success: true, message: 'Produto removido' });
  } catch (error) {
    console.error('Delete catalogo produto error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete produto' });
  }
});

// POST /api/catalogo/produtos/:id/imagens
router.post(
  '/:id/imagens',
  authenticate,
  requireScreenAccess('accessProductCatalog'),
  upload.single('imagem'),
  async (req: Request, res: Response): Promise<void> => {
    const file = req.file;

    if (!file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    try {
      const [produto] = await db
        .select({ id: catalogoProdutos.id })
        .from(catalogoProdutos)
        .where(and(eq(catalogoProdutos.id, req.params['id']!), eq(catalogoProdutos.usuarioId, req.user!.id)))
        .limit(1);

      if (!produto) {
        res.status(404).json({ success: false, message: 'Produto not found' });
        return;
      }

      const ultimaImagem = await db
        .select({ ordem: catalogoProdutoImagens.ordem })
        .from(catalogoProdutoImagens)
        .where(eq(catalogoProdutoImagens.produtoId, produto.id))
        .orderBy(asc(catalogoProdutoImagens.ordem));
      const proximaOrdem = ultimaImagem.length
        ? Math.max(...ultimaImagem.map((imagem) => imagem.ordem)) + 1
        : 0;

      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
      const filePath = path.join(UPLOAD_DIR, filename);

      await sharp(file.buffer)
        .resize({ width: MAX_OUTPUT_DIMENSION, height: MAX_OUTPUT_DIMENSION, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(filePath);

      const [imagem] = await db
        .insert(catalogoProdutoImagens)
        .values({
          produtoId: produto.id,
          nomeArquivo: filename,
          ordem: proximaOrdem,
        })
        .returning();

      res.status(201).json({ success: true, message: 'Imagem enviada', data: imagem });
    } catch (error) {
      console.error('Upload catalogo produto imagem error:', error);
      res.status(500).json({ success: false, message: 'Failed to upload imagem' });
    }
  },
);

// GET /api/catalogo/produtos/imagens/:nomeArquivo — stream file inline
router.get('/imagens/:nomeArquivo', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const nomeArquivo = path.basename(req.params['nomeArquivo'] ?? '');
    const [imagem] = await db
      .select({ produtoId: catalogoProdutoImagens.produtoId })
      .from(catalogoProdutoImagens)
      .where(eq(catalogoProdutoImagens.nomeArquivo, nomeArquivo))
      .limit(1);

    if (!imagem) {
      res.status(404).json({ success: false, message: 'Imagem not found' });
      return;
    }

    const [produto] = await db
      .select({ id: catalogoProdutos.id })
      .from(catalogoProdutos)
      .where(and(eq(catalogoProdutos.id, imagem.produtoId), eq(catalogoProdutos.usuarioId, req.user!.id)))
      .limit(1);

    if (!produto) {
      res.status(404).json({ success: false, message: 'Imagem not found' });
      return;
    }

    const filePath = path.join(UPLOAD_DIR, nomeArquivo);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: 'File not found on disk' });
      return;
    }

    res.setHeader('Content-Type', 'image/webp');
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Get catalogo produto imagem error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve imagem' });
  }
});

// DELETE /api/catalogo/produtos/imagens/:imagemId
router.delete('/imagens/:imagemId', authenticate, requireScreenAccess('accessProductCatalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const [imagem] = await db
      .select()
      .from(catalogoProdutoImagens)
      .where(eq(catalogoProdutoImagens.id, req.params['imagemId']!))
      .limit(1);

    if (!imagem) {
      res.status(404).json({ success: false, message: 'Imagem not found' });
      return;
    }

    const [produto] = await db
      .select({ id: catalogoProdutos.id })
      .from(catalogoProdutos)
      .where(and(eq(catalogoProdutos.id, imagem.produtoId), eq(catalogoProdutos.usuarioId, req.user!.id)))
      .limit(1);

    if (!produto) {
      res.status(404).json({ success: false, message: 'Imagem not found' });
      return;
    }

    await db.delete(catalogoProdutoImagens).where(eq(catalogoProdutoImagens.id, imagem.id));

    const filePath = path.join(UPLOAD_DIR, path.basename(imagem.nomeArquivo));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ success: true, message: 'Imagem removida' });
  } catch (error) {
    console.error('Delete catalogo produto imagem error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete imagem' });
  }
});

export default router;
