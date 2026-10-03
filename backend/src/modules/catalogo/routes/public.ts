import path from 'path';
import fs from 'fs';
import { Router, Request, Response } from 'express';
import { findPublicStorefront, isPublicProductImage, listPublicProducts } from '../../../services/storefront';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'catalogo');

const STORE_NOT_FOUND_MESSAGE = 'Loja não encontrada';
const IMAGE_NOT_FOUND_MESSAGE = 'Imagem não encontrada';
/** O nome do arquivo da imagem é único e nunca é reaproveitado: o navegador pode guardá-la de vez. */
const IMMUTABLE_IMAGE_CACHE = 'public, max-age=31536000, immutable';

const router = Router();

// GET /api/catalogo/public/:vitrine — loja e produtos ativos da conta, pelo link
// amigável ou pelo código antigo. Nunca devolve quantidade em estoque, dono ou conta.
router.get('/:storefront', async (req: Request, res: Response): Promise<void> => {
  try {
    const storefront = await findPublicStorefront(req.params['storefront'] ?? '');
    if (!storefront) {
      res.status(404).json({ success: false, message: STORE_NOT_FOUND_MESSAGE });
      return;
    }

    res.json({
      success: true,
      data: {
        loja: {
          id: storefront.id,
          link: storefront.link,
          nome: storefront.nome,
          descricao: storefront.descricao,
          whatsapp: storefront.whatsapp,
          logo: storefront.logo,
        },
        produtos: await listPublicProducts(storefront),
      },
    });
  } catch (error) {
    console.error('Public storefront error:', { storefront: req.params['storefront'], error });
    res.status(500).json({ success: false, message: 'Não foi possível carregar a loja agora.' });
  }
});

// GET /api/catalogo/public/:vitrine/imagens/:nomeArquivo — imagem de produto ativo da vitrine
router.get('/:storefront/imagens/:nomeArquivo', async (req: Request, res: Response): Promise<void> => {
  try {
    const storefront = await findPublicStorefront(req.params['storefront'] ?? '');
    const fileName = path.basename(req.params['nomeArquivo'] ?? '');
    if (!storefront || !(await isPublicProductImage(storefront, fileName))) {
      res.status(404).json({ success: false, message: IMAGE_NOT_FOUND_MESSAGE });
      return;
    }

    const filePath = path.join(UPLOAD_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: IMAGE_NOT_FOUND_MESSAGE });
      return;
    }

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', IMMUTABLE_IMAGE_CACHE);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Public storefront image error:', { storefront: req.params['storefront'], error });
    res.status(500).json({ success: false, message: 'Não foi possível carregar a imagem agora.' });
  }
});

export default router;
