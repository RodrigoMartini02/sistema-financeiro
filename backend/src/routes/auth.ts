import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body } from 'express-validator';
import { eq, or } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { users, profiles } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { validate, validateDocument, authRateLimiter } from '../middleware/validation';

const router = Router();

function getJwtSecret(): string {
  return process.env['JWT_SECRET']!;
}

async function sendRecoveryEmail(email: string, name: string, code: string): Promise<void> {
  const serviceId = process.env['EMAILJS_SERVICE_ID'];
  const templateId = process.env['EMAILJS_TEMPLATE_ID'];
  const userId = process.env['EMAILJS_USER_ID'];

  if (!serviceId || !templateId || !userId) {
    throw new Error('Email service not configured');
  }

  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: process.env['FRONTEND_URL'] ?? 'https://fin-gerence.com.br',
    },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: userId,
      template_params: {
        to_email: email,
        to_name: name,
        codigo_recuperacao: code,
        validade: '15 minutos',
        sistema_nome: 'FINGERENCE',
        assunto: '[FINGERENCE] Código de Recuperação de Senha',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send email: ${await response.text()}`);
  }
}

// POST /api/auth/login
router.post(
  '/login',
  [
    authRateLimiter(),
    body('documento').notEmpty().withMessage('Document is required'),
    body('senha').notEmpty().withMessage('Password is required'),
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { documento, senha } = req.body as { documento: string; senha: string };
      const cleanDoc = documento.replace(/[^\d]+/g, '');

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.document, cleanDoc))
        .limit(1);

      if (!user) {
        res.status(401).json({ success: false, message: 'Invalid document or password' });
        return;
      }

      if (user.status === 'bloqueado') {
        res.status(403).json({ success: false, message: 'Account blocked. Contact support.' });
        return;
      }

      const passwordValid = await bcrypt.compare(senha, user.password);
      if (!passwordValid) {
        res.status(401).json({ success: false, message: 'Invalid document or password' });
        return;
      }

      const token = jwt.sign(
        { id: user.id, documento: user.document, tipo: user.type },
        getJwtSecret(),
        { expiresIn: (process.env['JWT_EXPIRES_IN'] ?? '7d') as unknown as number },
      );

      await db
        .update(users)
        .set({ updatedAt: new Date() })
        .where(eq(users.id, user.id));

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          token,
          usuario: {
            id: user.id,
            nome: user.name,
            email: user.email,
            documento: user.document,
            tipo: user.type,
            status: user.status,
          },
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ success: false, message: 'Failed to log in' });
    }
  },
);

// POST /api/auth/register
router.post(
  '/register',
  [
    body('nome').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Invalid email'),
    body('documento')
      .notEmpty()
      .withMessage('Document is required')
      .custom(validateDocument)
      .withMessage('Invalid CPF/CNPJ'),
    body('senha').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { nome, email, documento, senha, tipo, google_id, pais, estado, cidade } =
        req.body as Record<string, string | undefined>;

      const cleanDoc = documento!.replace(/[^\d]+/g, '');

      if (cleanDoc.length !== 11) {
        res.status(400).json({
          success: false,
          message: 'Only CPF is allowed for self-registration. To register a company, contact the admin.',
        });
        return;
      }

      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(or(eq(users.email, email!.toLowerCase()), eq(users.document, cleanDoc)))
        .limit(1);

      if (existing.length > 0) {
        res.status(400).json({ success: false, message: 'Email or document already registered' });
        return;
      }

      const hashedPassword = await bcrypt.hash(senha!, 10);

      const [newUser] = await db
        .insert(users)
        .values({
          name: nome!,
          email: email!.toLowerCase(),
          document: cleanDoc,
          password: hashedPassword,
          type: (tipo as 'padrao' | 'admin' | 'master' | undefined) ?? 'padrao',
          status: 'ativo',
          googleId: google_id ?? null,
          country: pais ?? null,
          state: estado ?? null,
          city: cidade ?? null,
        })
        .returning({ id: users.id, name: users.name, email: users.email, document: users.document, type: users.type, status: users.status });

      // Create default categories and personal profile using raw SQL for PG function
      await pool.query('SELECT criar_categorias_padrao($1)', [newUser!.id]);
      await db.insert(profiles).values({ userId: newUser!.id, type: 'pessoal', name: 'Pessoal', active: true });

      const token = jwt.sign(
        { id: newUser!.id, documento: newUser!.document, tipo: newUser!.type },
        getJwtSecret(),
        { expiresIn: (process.env['JWT_EXPIRES_IN'] ?? '7d') as unknown as number },
      );

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: { token, usuario: newUser },
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ success: false, message: 'Failed to register user' });
    }
  },
);

// GET /api/auth/verify
router.get('/verify', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        document: users.document,
        type: users.type,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1);

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.json({ success: true, data: { usuario: user } });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify authentication' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, (_req: Request, res: Response): void => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// POST /api/auth/verify-password
router.post(
  '/verify-password',
  [authenticate, body('senha').notEmpty().withMessage('Password is required'), validate],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { senha } = req.body as { senha: string };

      const [user] = await db
        .select({ password: users.password })
        .from(users)
        .where(eq(users.id, req.user!.id))
        .limit(1);

      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      const valid = await bcrypt.compare(senha, user.password);
      if (!valid) {
        res.status(401).json({ success: false, message: 'Incorrect password' });
        return;
      }

      res.json({ success: true, message: 'Password verified' });
    } catch (error) {
      console.error('Verify password error:', error);
      res.status(500).json({ success: false, message: 'Failed to verify password' });
    }
  },
);

// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  [body('email').isEmail().withMessage('Invalid email'), validate],
  async (req: Request, res: Response): Promise<void> => {
    const GENERIC_MSG = 'If this email is registered, you will receive a recovery code shortly.';
    try {
      const { email } = req.body as { email: string };
      const normalizedEmail = email.toLowerCase();

      const [user] = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      // Always return 200 — don't reveal whether email exists
      if (!user) {
        res.json({ success: true, message: GENERIC_MSG });
        return;
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      await pool.query(
        `UPDATE usuarios
         SET dados_financeiros = COALESCE(dados_financeiros, '{}'::jsonb) ||
             jsonb_build_object(
                 'recovery_code', $1::text,
                 'recovery_code_expiry', $2::text,
                 'recovery_attempts', 0
             )
         WHERE id = $3`,
        [code, expiry, user.id],
      );

      try {
        await sendRecoveryEmail(normalizedEmail, user.name!, code);
      } catch (emailErr) {
        console.error('[Recovery] Failed to send email:', (emailErr as Error).message);
      }

      res.json({ success: true, message: GENERIC_MSG });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },
);

// POST /api/auth/verify-recovery-code
router.post(
  '/verify-recovery-code',
  [
    body('email').isEmail().withMessage('Invalid email'),
    body('codigo').notEmpty().withMessage('Code is required'),
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    const INVALID_MSG = 'Invalid or expired code';
    try {
      const { email, codigo } = req.body as { email: string; codigo: string };

      const result = await pool.query(
        'SELECT id, dados_financeiros FROM usuarios WHERE email = $1',
        [email.toLowerCase()],
      );

      if (result.rows.length === 0) {
        res.status(400).json({ success: false, message: INVALID_MSG });
        return;
      }

      const user = result.rows[0] as { id: number; dados_financeiros: Record<string, unknown> };
      const df = user.dados_financeiros ?? {};
      const storedCode = df['recovery_code'] as string | undefined;
      const expiry = df['recovery_code_expiry'] as string | undefined;
      const attempts = (df['recovery_attempts'] as number | undefined) ?? 0;

      if (!storedCode || !expiry) {
        res.status(400).json({ success: false, message: 'Code not found. Request a new one.' });
        return;
      }
      if (new Date() > new Date(expiry)) {
        res.status(400).json({ success: false, message: 'Code expired. Request a new one.' });
        return;
      }
      if (attempts >= 3) {
        res.status(400).json({ success: false, message: 'Too many attempts. Request a new code.' });
        return;
      }
      if (storedCode !== codigo) {
        await pool.query(
          `UPDATE usuarios SET dados_financeiros = COALESCE(dados_financeiros, '{}'::jsonb) || jsonb_build_object('recovery_attempts', $1) WHERE id = $2`,
          [attempts + 1, user.id],
        );
        res.status(400).json({ success: false, message: INVALID_MSG });
        return;
      }

      res.json({ success: true, message: 'Code is valid' });
    } catch (error) {
      console.error('Verify recovery code error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },
);

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  [
    body('email').isEmail().withMessage('Invalid email'),
    body('novaSenha').isLength({ min: 8 }).withMessage('Minimum 8 characters'),
    body('codigo').notEmpty().withMessage('Code is required'),
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, novaSenha, codigo } = req.body as { email: string; novaSenha: string; codigo: string };

      const result = await pool.query(
        'SELECT id, dados_financeiros FROM usuarios WHERE email = $1',
        [email.toLowerCase()],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      const user = result.rows[0] as { id: number; dados_financeiros: Record<string, unknown> };
      const df = user.dados_financeiros ?? {};
      const storedCode = df['recovery_code'] as string | undefined;
      const expiry = df['recovery_code_expiry'] as string | undefined;
      const attempts = (df['recovery_attempts'] as number | undefined) ?? 0;

      if (!storedCode || !expiry) {
        res.status(400).json({ success: false, message: 'Code not found. Request a new one.' });
        return;
      }
      if (new Date() > new Date(expiry)) {
        res.status(400).json({ success: false, message: 'Code expired. Request a new one.' });
        return;
      }
      if (attempts >= 3) {
        res.status(400).json({ success: false, message: 'Too many attempts. Request a new code.' });
        return;
      }
      if (storedCode !== codigo) {
        res.status(400).json({ success: false, message: 'Invalid code' });
        return;
      }

      const hashedPassword = await bcrypt.hash(novaSenha, 10);

      await pool.query(
        `UPDATE usuarios
         SET senha = $1,
             data_atualizacao = CURRENT_TIMESTAMP,
             dados_financeiros = dados_financeiros - 'recovery_code' - 'recovery_code_expiry' - 'recovery_attempts'
         WHERE id = $2`,
        [hashedPassword, user.id],
      );

      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ success: false, message: 'Failed to update password' });
    }
  },
);

// POST /api/auth/google
router.post('/google', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, redirect_uri } = req.body as { code: string; redirect_uri: string };

    if (!code) {
      res.status(400).json({ success: false, message: 'Authorization code not provided' });
      return;
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env['GOOGLE_CLIENT_ID'] ?? '',
        client_secret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
        redirect_uri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json() as Record<string, string>;

    if (tokenData['error']) {
      res.status(400).json({ success: false, message: `Google auth error: ${tokenData['error_description'] ?? tokenData['error']}` });
      return;
    }

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData['access_token']}` },
    });
    const googleUser = await userInfoResponse.json() as { email?: string; id?: string };

    if (!googleUser.email) {
      res.status(400).json({ success: false, message: 'Could not retrieve email from Google' });
      return;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, googleUser.email))
      .limit(1);

    if (!user) {
      res.status(403).json({ success: false, message: 'Email not registered in the system.' });
      return;
    }

    if (user.status !== 'ativo') {
      res.status(403).json({ success: false, message: 'Account disabled. Contact support.' });
      return;
    }

    if (!user.googleId && googleUser.id) {
      await db.update(users).set({ googleId: googleUser.id }).where(eq(users.id, user.id));
    }

    const token = jwt.sign(
      { id: user.id, documento: user.document, tipo: user.type },
      getJwtSecret(),
      { expiresIn: (process.env['JWT_EXPIRES_IN'] ?? '7d') as unknown as number },
    );

    res.json({
      success: true,
      data: {
        token,
        usuario: { id: user.id, nome: user.name, email: user.email, documento: user.document, tipo: user.type },
      },
    });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({ success: false, message: 'Internal error processing Google login' });
  }
});

export default router;
