import path from 'path';
import fs from 'fs';
import { Router, Request, Response, NextFunction } from 'express';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { db } from '../../../db/client';
import { catalogoContas, catalogoProdutos, catalogoProdutoImagens } from '../db/schema';
import { isValidCatalogoContaId } from '../../../services/catalogo';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'catalogo');

declare global {
  namespace Express {
    interface Request {
      catalogoUsuarioId?: number;
    }
  }
}

async function contaExists(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { contaId } = req.params;

    if (!contaId || !isValidCatalogoContaId(contaId)) {
      res.status(404).json({ success: false, message: 'Catálogo não encontrado' });
      return;
    }

    const [conta] = await db
      .select({ usuarioId: catalogoContas.usuarioId })
      .from(catalogoContas)
      .where(eq(catalogoContas.id, contaId))
      .limit(1);

    if (!conta) {
      res.status(404).json({ success: false, message: 'Catálogo não encontrado' });
      return;
    }

    req.catalogoUsuarioId = conta.usuarioId;
    next();
  } catch (error) {
    console.error('Catalogo public conta lookup error:', error);
    res.status(500).json({ success: false, message: 'Erro ao validar catálogo' });
  }
}

function usuarioId(req: Request): number {
  return req.catalogoUsuarioId!;
}

const router = Router();

// GET /api/catalogo/public/:contaId/produtos
router.get('/:contaId/produtos', contaExists, async (req: Request, res: Response): Promise<void> => {
  try {
    const produtos = await db
      .select({
        id: catalogoProdutos.id,
        nome: catalogoProdutos.nome,
        descricao: catalogoProdutos.descricao,
        valor: catalogoProdutos.valor,
      })
      .from(catalogoProdutos)
      .where(and(eq(catalogoProdutos.usuarioId, usuarioId(req)), eq(catalogoProdutos.ativo, true)))
      .orderBy(asc(catalogoProdutos.nome));

    const produtoIds = produtos.map((produto) => produto.id);
    const imagens = produtoIds.length
      ? await db
          .select({
            id: catalogoProdutoImagens.id,
            produtoId: catalogoProdutoImagens.produtoId,
            nomeArquivo: catalogoProdutoImagens.nomeArquivo,
            ordem: catalogoProdutoImagens.ordem,
          })
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
    console.error('Public catalogo produtos error:', error);
    res.status(500).json({ success: false, message: 'Erro ao listar produtos' });
  }
});

// GET /api/catalogo/public/:contaId/imagens/:nomeArquivo — stream file inline
router.get(
  '/:contaId/imagens/:nomeArquivo',
  contaExists,
  async (req: Request, res: Response): Promise<void> => {
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
        .where(
          and(
            eq(catalogoProdutos.id, imagem.produtoId),
            eq(catalogoProdutos.usuarioId, usuarioId(req)),
            eq(catalogoProdutos.ativo, true),
          ),
        )
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
      console.error('Public catalogo produto imagem error:', error);
      res.status(500).json({ success: false, message: 'Erro ao carregar imagem' });
    }
  },
);

export default router;
