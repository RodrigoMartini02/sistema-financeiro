import path from 'path';
import fs from 'fs';
import { Router, Request, Response } from 'express';
import { ipRateLimiter } from '../../../middleware/validation';
import { getStorePublicKey } from '../../../services/mercadoPagoAccounts';
import { readOrderInput } from '../../../services/orderInput';
import { createOrder, getPublicOrder, syncOrderPayment } from '../../../services/orders';
import { getPlanStatusForUser } from '../../../services/plan-lifecycle';
import {
  findPublicStorefront, isPublicProductImage, listPublicProducts, type PublicStorefront,
} from '../../../services/storefront';
import { sendRequestError } from '../../../utils/requestInput';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'catalogo');

const STORE_NOT_FOUND_MESSAGE = 'Loja não encontrada';
const STORE_UNAVAILABLE_MESSAGE = 'Loja indisponível';
const IMAGE_NOT_FOUND_MESSAGE = 'Imagem não encontrada';
/** O nome do arquivo da imagem é único e nunca é reaproveitado: o navegador pode guardá-la de vez. */
const IMMUTABLE_IMAGE_CACHE = 'public, max-age=31536000, immutable';

const ORDER_NOT_FOUND_MESSAGE = 'Pedido não encontrado';

/** Cada pedido gera uma cobrança no Mercado Pago da loja: limite por IP contra abuso. */
const orderRateLimiter = ipRateLimiter({
  max: 10,
  windowMs: 15 * 60 * 1000,
  message: 'Muitos pedidos em pouco tempo. Tente de novo em alguns minutos.',
});

const router = Router();

/**
 * A vitrine é do Premium: sem ele (Starter ou plano vencido), a loja sai do ar.
 * Pedidos já feitos e o aviso de pagamento deles continuam funcionando.
 */
async function isStorefrontOpen(storefront: PublicStorefront): Promise<boolean> {
  const ownerPlan = await getPlanStatusForUser(storefront.ownerId);
  return ownerPlan?.premiumFeatures === true;
}

// POST /api/catalogo/public/mercado-pago/webhook?pedido=<id> — aviso do Mercado
// Pago sobre o pagamento de um pedido. Responde na hora; o corpo só informa
// ids: a situação é buscada no Mercado Pago com o token da loja.
router.post('/mercado-pago/webhook', (req: Request, res: Response): void => {
  res.sendStatus(200);
  const orderId = typeof req.query['pedido'] === 'string' ? req.query['pedido'] : '';
  const data = (req.body as { data?: { id?: unknown } } | undefined)?.data;
  const queryPaymentId = req.query['data.id'] ?? req.query['id'];
  const paymentId = data?.id ?? queryPaymentId;
  void syncOrderPayment(orderId, paymentId === undefined || paymentId === null ? null : String(paymentId))
    .catch((error: unknown) => console.error('Order payment webhook error:', { orderId, error }));
});

// GET /api/catalogo/public/:vitrine — loja e produtos ativos da conta, pelo link
// amigável ou pelo código antigo. Nunca devolve quantidade em estoque, dono ou conta.
router.get('/:storefront', async (req: Request, res: Response): Promise<void> => {
  try {
    const storefront = await findPublicStorefront(req.params['storefront'] ?? '');
    if (!storefront) {
      res.status(404).json({ success: false, message: STORE_NOT_FOUND_MESSAGE });
      return;
    }
    if (!(await isStorefrontOpen(storefront))) {
      res.status(404).json({ success: false, message: STORE_UNAVAILABLE_MESSAGE });
      return;
    }

    const [publicKey, produtos] = await Promise.all([getStorePublicKey(storefront.contaId), listPublicProducts(storefront)]);
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
        // Pagamento pela vitrine: Mercado Pago conectado e alguma entrega ativa.
        // Sem isso, a sacola segue pelo WhatsApp.
        checkout: {
          online: publicKey !== null && (storefront.retirada !== null || storefront.entrega !== null),
          publicKey,
          retirada: storefront.retirada,
          entrega: storefront.entrega,
          politicaTroca: storefront.politicaTroca,
        },
        produtos,
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

// POST /api/catalogo/public/:vitrine/pedidos — cria o pedido e a cobrança (Pix ou cartão)
router.post('/:storefront/pedidos', orderRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const input = readOrderInput(req.body);
    const storefront = await findPublicStorefront(req.params['storefront'] ?? '');
    if (!storefront) {
      res.status(404).json({ success: false, message: STORE_NOT_FOUND_MESSAGE });
      return;
    }
    if (!(await isStorefrontOpen(storefront))) {
      res.status(404).json({ success: false, message: STORE_UNAVAILABLE_MESSAGE });
      return;
    }
    res.status(201).json({ success: true, data: await createOrder(storefront, input) });
  } catch (error) {
    sendRequestError(res, error, 'Create storefront order error:', undefined, 'Não foi possível concluir o pedido agora.');
  }
});

// GET /api/catalogo/public/:vitrine/pedidos/:pedidoId — página do pedido (o id dá acesso)
router.get('/:storefront/pedidos/:pedidoId', async (req: Request, res: Response): Promise<void> => {
  try {
    const storefront = await findPublicStorefront(req.params['storefront'] ?? '');
    const order = storefront ? await getPublicOrder(storefront, req.params['pedidoId'] ?? '') : null;
    if (!order) {
      res.status(404).json({ success: false, message: ORDER_NOT_FOUND_MESSAGE });
      return;
    }
    res.json({ success: true, data: order });
  } catch (error) {
    sendRequestError(res, error, 'Get storefront order error:', undefined, 'Não foi possível carregar o pedido agora.');
  }
});

export default router;
