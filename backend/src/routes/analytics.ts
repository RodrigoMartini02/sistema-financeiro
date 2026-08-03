import { Router, Request, Response, NextFunction } from 'express';
import { body, query } from 'express-validator';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { recordAnalyticsEvent } from '../services/analytics';

const router = Router();
const ANALYTICS_ALLOWED_DOCUMENT = '08996441988';

async function requireAnalyticsAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query('SELECT documento FROM usuarios WHERE id = $1 LIMIT 1', [req.user!.id]);
    const document = String((result.rows[0] as { documento?: string } | undefined)?.documento ?? '').replace(/\D/g, '');

    if (document !== ANALYTICS_ALLOWED_DOCUMENT) {
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
          COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS page_views_total,
          COUNT(*) FILTER (WHERE event_type = 'page_view' AND data_criacao >= NOW() - ($1::int * INTERVAL '1 day'))::int AS page_views_in_period,
          COUNT(*) FILTER (WHERE event_type = 'login')::int AS logins_total,
          COUNT(*) FILTER (WHERE event_type = 'login' AND data_criacao >= NOW() - ($1::int * INTERVAL '1 day'))::int AS logins_in_period,
          COUNT(DISTINCT usuario_id) FILTER (WHERE event_type = 'login' AND usuario_id IS NOT NULL AND data_criacao >= NOW() - ($1::int * INTERVAL '1 day'))::int AS login_users_in_period
         FROM analytics_events`,
        [days],
      );

      const dailyResult = await pool.query(
        `WITH days AS (
           SELECT generate_series(
             CURRENT_DATE - (($1::int - 1) * INTERVAL '1 day'),
             CURRENT_DATE,
             INTERVAL '1 day'
           )::date AS day
         ),
         event_counts AS (
           SELECT
             data_criacao::date AS day,
             COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS page_views,
             COUNT(*) FILTER (WHERE event_type = 'login')::int AS logins
           FROM analytics_events
           WHERE data_criacao >= CURRENT_DATE - (($1::int - 1) * INTERVAL '1 day')
           GROUP BY data_criacao::date
         ),
         account_counts AS (
           SELECT data_cadastro::date AS day, COUNT(*)::int AS accounts
           FROM usuarios
           WHERE data_cadastro >= CURRENT_DATE - (($1::int - 1) * INTERVAL '1 day')
           GROUP BY data_cadastro::date
         )
         SELECT
           days.day::text AS date,
           COALESCE(event_counts.page_views, 0)::int AS page_views,
           COALESCE(event_counts.logins, 0)::int AS logins,
           COALESCE(account_counts.accounts, 0)::int AS accounts
         FROM days
         LEFT JOIN event_counts ON event_counts.day = days.day
         LEFT JOIN account_counts ON account_counts.day = days.day
         ORDER BY days.day ASC`,
        [days],
      );

      const pagesResult = await pool.query(
        `SELECT path, COUNT(*)::int AS views
         FROM analytics_events
         WHERE event_type = 'page_view'
           AND data_criacao >= NOW() - ($1::int * INTERVAL '1 day')
         GROUP BY path
         ORDER BY views DESC, path ASC
         LIMIT 8`,
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
          daily: dailyResult.rows,
          topPages: pagesResult.rows,
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
              page_views_total: 0,
              page_views_in_period: 0,
              logins_total: 0,
              logins_in_period: 0,
              login_users_in_period: 0,
            },
            daily: [],
            topPages: [],
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
