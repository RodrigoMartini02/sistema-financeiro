import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { createTendersAuth, createTendersRoutes, type TendersApiDeps, type TendersAuthDeps } from './routes';

export interface TendersAppDependencies {
  api: TendersApiDeps;
  auth: TendersAuthDeps;
  checkDatabase: () => Promise<void>;
  env: NodeJS.ProcessEnv;
}

export function createTendersApp({ api, auth, checkDatabase, env }: TendersAppDependencies): express.Express {
  const app = express();
  const production = env['NODE_ENV'] === 'production';
  const origins = new Set((env['ALLOWED_ORIGINS'] ?? 'https://fin-gerence.com.br,https://www.fin-gerence.com.br')
    .split(',').map((origin) => origin.trim()).filter(Boolean));
  if (!production) {
    for (const host of ['localhost', '127.0.0.1']) {
      for (const port of [3000, 5173, 5500]) origins.add(`http://${host}:${port}`);
    }
  }

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(self), camera=()');
    if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
  app.use((req, res, next) => {
    const origin = req.header('Origin');
    if (origin && !origins.has(origin)) {
      res.status(403).json({ success: false, message: 'Origem não permitida.' });
      return;
    }
    next();
  });
  app.use(cors({ origin: (origin, callback) => callback(null, !origin || origins.has(origin)), credentials: true }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  app.get('/health', async (_req, res) => {
    try {
      await checkDatabase();
      res.json({ status: 'ok', service: 'tenders-api', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'error', service: 'tenders-api', database: 'disconnected' });
    }
  });

  const tendersApi = createTendersRoutes(api);
  const tendersAuth = createTendersAuth(auth);
  app.use('/api/tenders/auth', tendersAuth.authRoutes);
  app.post('/api/tenders/billing/webhook', tendersApi.billingWebhook);
  app.use('/api/tenders/admin', tendersAuth.authenticate, tendersAuth.requireAdmin, tendersApi.adminRoutes);
  app.use('/api/tenders', tendersAuth.authenticate, tendersApi.routes);
  app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
  });

  const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
      res.status(400).json({ success: false, message: 'JSON inválido.' });
      return;
    }
    console.error('[Tenders API] Unexpected request failure');
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  };
  app.use(handleError);
  return app;
}
