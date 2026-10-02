import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, type CustomValidator } from 'express-validator';
import { eq, or } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { users, accounts } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { validate, validateDocument, authRateLimiter } from '../middleware/validation';
import { recordAnalyticsEvent } from '../services/analytics';
import { ensureDefaultCategories } from '../services/defaultCategories';
import { ensureDefaultIncomeClassifications } from '../services/incomeClassificationCatalog';
import { ensureUserHasAccount } from '../services/accountBackfill';
import { companyAccountColumns, readCompanyAccountInput } from '../services/companyAccountInput';
import { releaseRecoveryAttempt, reserveRecoveryAttempt } from '../services/passwordRecoveryCode';
import { blockedAccessMessage, wrongCodeMessage } from '../utils/authMessages';
import { resolveMemberRole } from '../utils/familyVisibility';
import { sendRequestError } from '../utils/requestInput';

const router = Router();

const CNPJ_LENGTH = 14;

function documentDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

// Cadastro com CNPJ é a própria empresa: o documento e os dados dela são lidos
// por readCompanyAccountInput, com as mensagens dele. Nome e documento de
// pessoa só passam pelas validações abaixo no cadastro com CPF.
const isPersonRegistration: CustomValidator = (_value, { req }) =>
  documentDigits(req.body?.documento).length !== CNPJ_LENGTH;

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
    authRateLimiter('documento'),
    body('documento').notEmpty().withMessage('Document is required'),
    body('senha').notEmpty().withMessage('Password is required'),
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { documento, senha } = req.body as { documento: string; senha: string };
      const cleanDoc = documento.replace(/[^\d]+/g, '');

      // O campo "documento" do formulário de login também aceita um email —
      // necessário para membros sem CPF/CNPJ cadastrado (ex.: filho menor de
      // idade, criado pelo gestor com documento opcional). Login de quem tem
      // documento continua resolvendo exclusivamente por ele, sem mudança.
      const isEmailLike = documento.includes('@');
      const [user] = await db
        .select()
        .from(users)
        .where(isEmailLike ? eq(users.email, documento.toLowerCase()) : eq(users.document, cleanDoc))
        .limit(1);

      if (!user) {
        res.status(401).json({ success: false, message: 'CPF, CNPJ ou e-mail não cadastrado' });
        return;
      }

      const passwordValid = await bcrypt.compare(senha, user.password);
      if (!passwordValid) {
        res.status(401).json({ success: false, message: 'Senha incorreta' });
        return;
      }

      // O status só aparece para quem sabe a senha.
      const blockedMessage = blockedAccessMessage(user.status);
      if (blockedMessage) {
        res.status(403).json({ success: false, message: blockedMessage });
        return;
      }

      const role = await resolveMemberRole(user.id);
      const token = jwt.sign(
        { id: user.id, documento: user.document, tipo: user.type, role },
        getJwtSecret(),
        { expiresIn: (process.env['JWT_EXPIRES_IN'] ?? '7d') as unknown as number },
      );

      await db
        .update(users)
        .set({ updatedAt: new Date() })
        .where(eq(users.id, user.id));

      void recordAnalyticsEvent({
        eventType: 'login',
        path: '/app.html',
        userId: user.id,
      });

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          token,
          usuario: {
            id: user.id,
            nome: user.name,
            sobrenome: user.lastName,
            email: user.email,
            documento: user.document,
            tipo: user.type,
            role,
            status: user.status,
            foto: user.photo,
          },
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ success: false, message: 'Não foi possível entrar agora. Tente de novo em instantes.' });
    }
  },
);

// POST /api/auth/register
router.post(
  '/register',
  [
    body('nome').if(isPersonRegistration).notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Invalid email'),
    body('documento')
      .if(isPersonRegistration)
      .notEmpty()
      .withMessage('Document is required')
      .custom(validateDocument)
      .withMessage('Invalid CPF/CNPJ'),
    body('senha').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        nome, sobrenome, email, documento, senha, google_id, pais, estado, cidade,
        telefone, data_nascimento,
      } = req.body as Record<string, string | undefined>;

      const company = documentDigits(documento).length === CNPJ_LENGTH ? readCompanyAccountInput(req.body) : null;
      const cleanDoc = company ? company.document : documentDigits(documento);
      // O login PJ é a própria empresa: leva o nome dela e nenhum dado de pessoa.
      const identity = company
        ? { name: company.displayName, lastName: null, telefone: null, dataNascimento: null }
        : { name: nome!, lastName: sobrenome?.trim() || null, telefone: telefone ?? null, dataNascimento: data_nascimento ?? null };

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

      // Criação de usuário + conta + categorias padrão precisa ser atômica:
      // se qualquer etapa falhar, o usuário não deve ficar registrado sem
      // conta/categorias (cadastro incompleto).
      const newUser = await db.transaction(async (transaction) => {
        const [createdUser] = await transaction
          .insert(users)
          .values({
            ...identity,
            email: email!.toLowerCase(),
            document: cleanDoc,
            password: hashedPassword,
            // O cadastro pelo site cria sempre o titular. Admin só pela rota de
            // admin (POST /users); o tipo nunca vem do pedido.
            type: 'titular',
            status: 'ativo',
            googleId: google_id ?? null,
            country: pais ?? null,
            state: estado ?? null,
            city: cidade ?? null,
          })
          .returning({ id: users.id, name: users.name, lastName: users.lastName, email: users.email, document: users.document, type: users.type, status: users.status });

        // Create useful defaults for the initial account — 'empresa' when
        // registering with a CNPJ, 'pessoal' (CPF) otherwise. Esta é sempre a
        // Conta Padrão do usuário (nasceu no cadastro externo, vinculada à
        // cobrança do plano em `usuarios`).
        if (company) {
          await ensureDefaultCategories(createdUser!.id, 'empresa', transaction);
          await ensureDefaultIncomeClassifications(createdUser!.id, 'empresa', transaction);
          await transaction.insert(accounts).values({
            userId: createdUser!.id,
            type: 'empresa',
            ...companyAccountColumns(company),
            active: true,
            isDefault: true,
          });
        } else {
          await ensureDefaultCategories(createdUser!.id, 'pessoal', transaction);
          await ensureDefaultIncomeClassifications(createdUser!.id, 'pessoal', transaction);
          await transaction.insert(accounts).values({ userId: createdUser!.id, type: 'pessoal', name: 'Pessoal', active: true, isDefault: true });
        }

        return createdUser;
      });

      const registerRole = await resolveMemberRole(newUser!.id);
      const token = jwt.sign(
        { id: newUser!.id, documento: newUser!.document, tipo: newUser!.type, role: registerRole },
        getJwtSecret(),
        { expiresIn: (process.env['JWT_EXPIRES_IN'] ?? '7d') as unknown as number },
      );

      void recordAnalyticsEvent({
        eventType: 'login',
        path: '/app.html',
        userId: newUser!.id,
      });

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          token,
          usuario: {
            id: newUser!.id,
            nome: newUser!.name,
            sobrenome: newUser!.lastName,
            email: newUser!.email,
            documento: newUser!.document,
            tipo: newUser!.type,
            role: registerRole,
            status: newUser!.status,
            foto: null,
          },
        },
      });
    } catch (error) {
      sendRequestError(res, error, 'Registration error:', undefined, 'Failed to register user');
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
        lastName: users.lastName,
        email: users.email,
        document: users.document,
        type: users.type,
        status: users.status,
        photo: users.photo,
      })
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1);

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    await ensureUserHasAccount(user.id);
    const role = await resolveMemberRole(user.id);

    res.json({
      success: true,
      data: {
        usuario: {
          id: user.id,
          nome: user.name,
          sobrenome: user.lastName,
          email: user.email,
          documento: user.document,
          tipo: user.type,
          role,
          status: user.status,
          foto: user.photo,
        },
      },
    });
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
  [authRateLimiter('email'), body('email').isEmail().withMessage('Invalid email'), validate],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.body as { email: string };
      const normalizedEmail = email.toLowerCase();

      const [user] = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (!user) {
        res.status(404).json({ success: false, message: 'E-mail não cadastrado. Confira o e-mail usado no cadastro.' });
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
        res.status(502).json({ success: false, message: 'Não foi possível enviar o código agora. Tente de novo em instantes.' });
        return;
      }

      res.json({ success: true, message: 'Código enviado. Se não chegar em alguns minutos, confira a caixa de spam.' });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ success: false, message: 'Não foi possível pedir o código agora. Tente de novo em instantes.' });
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
    try {
      const { email, codigo } = req.body as { email: string; codigo: string };
      const attempt = await reserveRecoveryAttempt(email.toLowerCase());
      if (attempt.code !== String(codigo).trim()) {
        res.status(400).json({ success: false, message: wrongCodeMessage(attempt.attemptsUsed) });
        return;
      }

      // Acerto não conta: a tentativa volta, e a redefinição ainda tem a dela.
      await releaseRecoveryAttempt(attempt.userId);
      res.json({ success: true, message: 'Código confirmado.' });
    } catch (error) {
      sendRequestError(res, error, 'Verify recovery code error:', undefined, 'Não foi possível conferir o código agora. Tente de novo em instantes.');
    }
  },
);

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  [
    body('email').isEmail().withMessage('Invalid email'),
    body('nova_senha').isLength({ min: 8 }).withMessage('Minimum 8 characters'),
    body('codigo').notEmpty().withMessage('Code is required'),
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, nova_senha: newPassword, codigo } = req.body as { email: string; nova_senha: string; codigo: string };

      const attempt = await reserveRecoveryAttempt(email.toLowerCase());
      if (attempt.code !== String(codigo).trim()) {
        res.status(400).json({ success: false, message: wrongCodeMessage(attempt.attemptsUsed) });
        return;
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await pool.query(
        `UPDATE usuarios
         SET senha = $1,
             data_atualizacao = CURRENT_TIMESTAMP,
             dados_financeiros = dados_financeiros - 'recovery_code' - 'recovery_code_expiry' - 'recovery_attempts'
         WHERE id = $2`,
        [hashedPassword, attempt.userId],
      );

      res.json({ success: true, message: 'Senha redefinida.' });
    } catch (error) {
      sendRequestError(res, error, 'Reset password error:', undefined, 'Não foi possível redefinir a senha agora. Tente de novo em instantes.');
    }
  },
);

// POST /api/auth/google
router.post('/google', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, redirect_uri } = req.body as { code: string; redirect_uri: string };

    if (!code) {
      res.status(400).json({ success: false, message: 'O Google não enviou a autorização. Tente entrar de novo.' });
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
      res.status(400).json({ success: false, message: `Erro na autenticação com o Google: ${tokenData['error_description'] ?? tokenData['error']}` });
      return;
    }

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData['access_token']}` },
    });
    const googleUser = await userInfoResponse.json() as { email?: string; id?: string };

    if (!googleUser.email) {
      res.status(400).json({ success: false, message: 'Não foi possível obter o e-mail da conta Google.' });
      return;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, googleUser.email))
      .limit(1);

    if (!user) {
      res.status(403).json({ success: false, message: 'E-mail do Google não cadastrado no sistema.' });
      return;
    }

    const blockedMessage = blockedAccessMessage(user.status);
    if (blockedMessage) {
      res.status(403).json({ success: false, message: blockedMessage });
      return;
    }

    if (!user.googleId && googleUser.id) {
      await db.update(users).set({ googleId: googleUser.id }).where(eq(users.id, user.id));
    }

    const googleRole = await resolveMemberRole(user.id);
    const token = jwt.sign(
      { id: user.id, documento: user.document, tipo: user.type, role: googleRole },
      getJwtSecret(),
      { expiresIn: (process.env['JWT_EXPIRES_IN'] ?? '7d') as unknown as number },
    );

    void recordAnalyticsEvent({
      eventType: 'login',
      path: '/app.html',
      userId: user.id,
    });

    res.json({
      success: true,
      data: {
        token,
        usuario: { id: user.id, nome: user.name, sobrenome: user.lastName, email: user.email, documento: user.document, tipo: user.type, role: googleRole, foto: user.photo },
      },
    });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({ success: false, message: 'Não foi possível entrar com o Google agora. Tente de novo em instantes.' });
  }
});

export default router;
