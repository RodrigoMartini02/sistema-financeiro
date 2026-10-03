import { Router } from 'express';
import produtosRoutes from './produtos';
import publicRoutes from './public';
import storefrontRoutes from './storefront';

const router = Router();

router.use('/produtos', produtosRoutes);
router.use('/storefront', storefrontRoutes);
router.use('/public', publicRoutes);

export default router;
