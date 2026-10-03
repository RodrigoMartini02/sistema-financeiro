import { Router } from 'express';
import produtosRoutes from './produtos';
import publicRoutes from './public';
import storefrontRoutes from './storefront';
import mercadoPagoRoutes from './mercadoPago';
import orderRoutes from './orders';

const router = Router();

router.use('/produtos', produtosRoutes);
router.use('/storefront', storefrontRoutes);
router.use('/mercado-pago', mercadoPagoRoutes);
router.use('/pedidos', orderRoutes);
router.use('/public', publicRoutes);

export default router;
