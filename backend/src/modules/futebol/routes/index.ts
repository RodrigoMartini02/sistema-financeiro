import { Router } from 'express';
import authRoutes from './auth';
import playersRoutes from './players';
import matchesRoutes from './matches';
import scheduleRoutes from './schedule';
import poolRoutes from './pool';
import championshipsRoutes from './championships';
import publicRoutes from './public';
import playerRoutes from './player';

const router = Router();

router.use('/auth', authRoutes);
router.use('/players', playersRoutes);
router.use('/matches', matchesRoutes);
router.use('/schedule', scheduleRoutes);
router.use('/pool', poolRoutes);
router.use('/championships', championshipsRoutes);
router.use('/public', publicRoutes);
router.use('/jogador', playerRoutes);

export default router;
