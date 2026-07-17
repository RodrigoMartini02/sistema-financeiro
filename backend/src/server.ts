import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import path from 'path';
import { testConnection } from './db/client';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || path.resolve(process.cwd(), '../../.env') });

const app = express();
const PORT = process.env.PORT ?? 3010;

const envOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [
      'https://sistema-financeiro-kxed.onrender.com',
      'https://escalacao-futebol-1.onrender.com',
      'https://escalacao-futebol.onrender.com',
    ];

const devOrigins =
  process.env.NODE_ENV !== 'production'
    ? [
        'http://localhost:3000', 'http://127.0.0.1:3000',
        'http://localhost:5173', 'http://127.0.0.1:5173',
        'http://localhost:5175', 'http://127.0.0.1:5175',
        'http://localhost:5500', 'http://127.0.0.1:5500',
      ]
    : [];

const allowedOrigins = [...new Set([...envOrigins, ...devOrigins])];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin not allowed — ${origin}`));
      }
    },
    credentials: true,
  }),
);

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

if (process.env.NODE_ENV !== 'production') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
    next();
  });
}

// ── Routes ──────────────────────────────────────────────────────────────
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import profileRoutes from './routes/profiles';
import categoryRoutes from './routes/categories';
import cardRoutes from './routes/cards';
import incomeRoutes from './routes/incomes';
import expenseRoutes from './routes/expenses';
import monthRoutes from './routes/months';
import yearRoutes from './routes/years';
import reserveRoutes from './routes/reserves';
import financialRoutes from './routes/financial';
import planRoutes from './routes/plans';
import paypalRoutes from './routes/paypal';
import ratingRoutes from './routes/ratings';
import representativeRoutes from './routes/representatives';
import partnerRoutes from './routes/partners';
import incomeTypeRoutes from './routes/income-types';
import clientRoutes from './routes/clients';
import contractRoutes from './routes/contracts';
import contractModuleRoutes from './routes/contract-modules';
import technicalServiceRoutes from './routes/technical-services';
import serviceRoutes from './routes/services';
import contractServiceRoutes from './routes/contract-services';
import contractAttachmentRoutes from './routes/contract-attachments';
import futebolRoutes from './modules/futebol/routes';
import { startFootballCron } from './modules/futebol/cron';
import { startChampionshipsCron } from './modules/futebol/championshipsCron';
import { startCobrancaCron } from './cron/cobrancas';

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/usuarios', userRoutes);           // PT alias
app.use('/api/profiles', profileRoutes);
app.use('/api/perfis', profileRoutes);          // PT alias
app.use('/api/categories', categoryRoutes);
app.use('/api/categorias', categoryRoutes);     // PT alias
app.use('/api/cards', cardRoutes);
app.use('/api/cartoes', cardRoutes);            // PT alias
app.use('/api/incomes', incomeRoutes);
app.use('/api/receitas', incomeRoutes);         // PT alias
app.use('/api/expenses', expenseRoutes);
app.use('/api/despesas', expenseRoutes);        // PT alias
app.use('/api/months', monthRoutes);
app.use('/api/meses', monthRoutes);             // PT alias
app.use('/api/years', yearRoutes);
app.use('/api/anos', yearRoutes);               // PT alias
app.use('/api/reserves', reserveRoutes);
app.use('/api/reservas', reserveRoutes);        // PT alias
app.use('/api/financial', financialRoutes);
app.use('/api/financeiro', financialRoutes);    // PT alias
app.use('/api/plans', planRoutes);
app.use('/api/planos', planRoutes);             // PT alias
app.use('/api/paypal', paypalRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/avaliacoes', ratingRoutes);       // PT alias
app.use('/api/representatives', representativeRoutes);
app.use('/api/representantes', representativeRoutes); // PT alias
app.use('/api/partners', partnerRoutes);
app.use('/api/socios', partnerRoutes);          // PT alias
app.use('/api/income-types', incomeTypeRoutes);
app.use('/api/tipos-receita', incomeTypeRoutes); // PT alias
app.use('/api/clientes', clientRoutes);
app.use('/api/contratos', contractRoutes);
app.use('/api/modulos-contrato', contractModuleRoutes);
app.use('/api/servicos-tecnicos', technicalServiceRoutes);
app.use('/api/servicos', serviceRoutes);
app.use('/api/contratos-servicos', contractServiceRoutes);
app.use('/api/contrato-anexos', contractAttachmentRoutes);
app.use('/api/futebol', futebolRoutes);

// ── System endpoints ───────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../package.json') as { version: string; releaseDate: string };

app.get('/', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Financial System API is running', version: pkg.version });
});

app.get('/health', async (_req: Request, res: Response) => {
  const dbOk = await testConnection();
  res.json({
    success: true,
    status: dbOk ? 'OK' : 'ERROR',
    database: dbOk ? 'Connected' : 'Disconnected',
    timestamp: new Date().toISOString(),
  });
});

app.get('/version', (_req: Request, res: Response) => {
  res.json({ success: true, version: pkg.version, releaseDate: pkg.releaseDate });
});

// ── 404 ─────────────────────────────────────────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Route not found', path: req.path });
});

// ── Error handler ──────────────────────────────────────────────────────
app.use((err: Error & { status?: number }, req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(err.status ?? 500).json({
    success: false,
    message: err.message ?? 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ── Bootstrap ───────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  console.log('Testing PostgreSQL connection...');
  const dbOk = await testConnection();

  if (!dbOk) {
    console.error('Could not connect to PostgreSQL. Aborting.');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log('================================================');
    console.log('SERVER STARTED');
    console.log(`Port: ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
    console.log('================================================');
  });

  startFootballCron();
  startChampionshipsCron();
  startCobrancaCron();
}

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

bootstrap();

export default app;
