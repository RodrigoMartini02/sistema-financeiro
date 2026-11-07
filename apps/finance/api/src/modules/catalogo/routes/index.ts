import { Router } from 'express';
import { authenticate, requireActivePlan, requirePremiumPlan } from '../../../middleware/auth';
import produtosRoutes from './produtos';
import publicRoutes from './public';
import storefrontRoutes from './storefront';
import mercadoPagoRoutes from './mercadoPago';
import orderRoutes from './orders';

const router = Router();

// Produtos, estoque, vitrine e pedidos: plano ativo e Premium. O Mercado Pago
// trava em cada rota, porque o retorno do OAuth (/callback) é público, assim
// como as rotas da loja (/public).
const premiumCatalogAccess = [authenticate, requireActivePlan, requirePremiumPlan];

router.use('/produtos', ...premiumCatalogAccess, produtosRoutes);
router.use('/storefront', ...premiumCatalogAccess, storefrontRoutes);
router.use('/mercado-pago', mercadoPagoRoutes);
router.use('/pedidos', ...premiumCatalogAccess, orderRoutes);
router.use('/public', publicRoutes);

export default router;
