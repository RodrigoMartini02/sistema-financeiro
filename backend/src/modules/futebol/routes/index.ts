import { Router } from 'express';
import authRoutes from './auth';
import playersRoutes from './players';
import matchesRoutes from './matches';
import scheduleRoutes from './schedule';
import championshipsRoutes from './championships';
import publicRoutes from './public';

const router = Router();

router.use('/auth', authRoutes);
router.use('/players', playersRoutes);
router.use('/matches', matchesRoutes);
router.use('/schedule', scheduleRoutes);
router.use('/championships', championshipsRoutes);
router.use('/public', publicRoutes);

export default router;
