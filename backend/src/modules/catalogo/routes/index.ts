import { Router } from 'express';
import produtosRoutes from './produtos';
import contasRoutes from './contas';
import publicRoutes from './public';

const router = Router();

router.use('/produtos', produtosRoutes);
router.use('/conta', contasRoutes);
router.use('/public', publicRoutes);

export default router;
