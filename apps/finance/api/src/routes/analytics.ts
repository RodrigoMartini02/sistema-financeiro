import { Router, Request, Response, NextFunction } from 'express';
import { body, query } from 'express-validator';
import { eq } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { users } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { recordAnalyticsEvent } from '../services/analytics';

const router = Router();
/** CPF do dono da plataforma. Vale só junto com o tipo admin: o CPF pode repetir num acesso de colaborador. */
const ANALYTICS_ALLOWED_DOCUMENT = '08996441988';

async function requireAnalyticsAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [requester] = await db
      .select({ document: users.document, type: users.type })
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1);
    const document = (requester?.document ?? '').replace(/\D/g, '');

    if (requester?.type !== 'admin' || document !== ANALYTICS_ALLOWED_DOCUMENT) {
      res.status(403).json({ success: false, message: 'Access denied.' });
      return;
    }

    next();
  } catch (error) {
    console.error('Analytics access check error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify analytics access' });
  }
}

function clampDays(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '30', 10);
  if (!Number.isFinite(parsed)) {
    return 30;
  }
  return Math.min(Math.max(parsed, 7), 365);
}

function isMissingTableError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '42P01';
}

router.post(
  '/page-view',
  [
    body('path').isString().trim().isLength({ min: 1, max: 255 }).withMessage('Path is required'),
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    const { path } = req.body as { path: string };
    const safePath = path.startsWith('/') ? path : `/${path}`;

    await recordAnalyticsEvent({
      eventType: 'page_view',
      path: safePath,
      userId: null,
    });

    res.status(204).send();
  },
);

router.get(
  '/overview',
  [
    authenticate,
    requireAnalyticsAccess,
    query('days').optional().isInt({ min: 7, max: 365 }).withMessage('Days must be between 7 and 365'),
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    const days = clampDays(req.query['days'] as string | undefined);

    try {
      const accountsResult = await pool.query(
        `SELECT
          COUNT(*)::int AS total_accounts,
          COUNT(*) FILTER (WHERE data_cadastro >= NOW() - ($1::int * INTERVAL '1 day'))::int AS accounts_in_period,
          COUNT(*) FILTER (WHERE status = 'ativo')::int AS active_accounts,
          COUNT(*) FILTER (WHERE status = 'cancelado')::int AS cancelled_accounts
         FROM usuarios`,
        [days],
      );

      const eventsResult = await pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE event_type = 'login')::int AS logins_total,
          COUNT(*) FILTER (WHERE event_type = 'login' AND data_criacao >= NOW() - ($1::int * INTERVAL '1 day'))::int AS logins_in_period,
          COUNT(DISTINCT usuario_id) FILTER (WHERE event_type = 'login' AND usuario_id IS NOT NULL AND data_criacao >= NOW() - ($1::int * INTERVAL '1 day'))::int AS login_users_in_period
         FROM analytics_events`,
        [days],
      );

      const recentAccountsResult = await pool.query(
        `SELECT id, nome, email, tipo, status, data_cadastro
         FROM usuarios
         ORDER BY data_cadastro DESC
         LIMIT 8`,
      );

      res.json({
        success: true,
        data: {
          days,
          eventsAvailable: true,
          summary: {
            ...accountsResult.rows[0],
            ...eventsResult.rows[0],
          },
          recentAccounts: recentAccountsResult.rows,
        },
      });
    } catch (error) {
      if (isMissingTableError(error)) {
        const accountsResult = await pool.query(
          `SELECT
            COUNT(*)::int AS total_accounts,
            COUNT(*) FILTER (WHERE data_cadastro >= NOW() - ($1::int * INTERVAL '1 day'))::int AS accounts_in_period,
            COUNT(*) FILTER (WHERE status = 'ativo')::int AS active_accounts,
            COUNT(*) FILTER (WHERE status = 'cancelado')::int AS cancelled_accounts
           FROM usuarios`,
          [days],
        );

        const recentAccountsResult = await pool.query(
          `SELECT id, nome, email, tipo, status, data_cadastro
           FROM usuarios
           ORDER BY data_cadastro DESC
           LIMIT 8`,
        );

        res.json({
          success: true,
          data: {
            days,
            eventsAvailable: false,
            summary: {
              ...accountsResult.rows[0],
              logins_total: 0,
              logins_in_period: 0,
              login_users_in_period: 0,
            },
            recentAccounts: recentAccountsResult.rows,
          },
        });
        return;
      }

      console.error('Analytics overview error:', error);
      res.status(500).json({ success: false, message: 'Failed to load analytics overview' });
    }
  },
);

export default router;
