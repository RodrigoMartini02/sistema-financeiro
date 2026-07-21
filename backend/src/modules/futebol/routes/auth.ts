import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/client';
import { footballUsers } from '../db/schema';
import { hashFootballPassword, verifyFootballPassword } from '../password';
import { signFootballUser } from '../middleware/auth';
import { authRateLimiter, validateDocument } from '../../../middleware/validation';

const router = Router();
const RESET_CODE_EXPIRY_MS = 15 * 60 * 1000;
const RESET_CODE_MAX_ATTEMPTS = 3;

function buildAuthResponse(user: { id: string; email: string; name?: string | null }) {
  const token = signFootballUser({ userId: user.id, email: user.email });
  return { token, user: { id: user.id, email: user.email, name: user.name ?? null } };
}

function generateResetCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendFootballRecoveryEmail(email: string, code: string): Promise<void> {
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
      Origin: process.env['FRONTEND_URL'] ?? 'https://escalacao-futebol-1.onrender.com',
    },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: userId,
      template_params: {
        to_email: email,
        to_name: email,
        codigo_recuperacao: code,
        validade: '15 minutos',
        sistema_nome: 'Escalação FC',
        assunto: '[Escalação FC] Código de Recuperação de Senha',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send email: ${await response.text()}`);
  }
}

router.post('/register', authRateLimiter(), async (req: Request, res: Response): Promise<void> => {
  try {
    const name = String(req.body?.name ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const cpf = String(req.body?.cpf ?? '').replace(/\D/g, '');

    if (!name) {
      res.status(400).json({ error: 'Nome obrigatório' });
      return;
    }

    if (!email) {
      res.status(400).json({ error: 'E-mail obrigatório' });
      return;
    }

    if (cpf.length !== 11 || !validateDocument(cpf)) {
      res.status(400).json({ error: 'CPF inválido' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
      return;
    }

    const [existingEmail] = await db
      .select({ id: footballUsers.id })
      .from(footballUsers)
      .where(eq(footballUsers.email, email))
      .limit(1);

    if (existingEmail) {
      res.status(409).json({ error: 'Já existe uma conta com este e-mail' });
      return;
    }

    const [existingCpf] = await db
      .select({ id: footballUsers.id })
      .from(footballUsers)
      .where(eq(footballUsers.cpf, cpf))
      .limit(1);

    if (existingCpf) {
      res.status(409).json({ error: 'Já existe uma conta com este CPF' });
      return;
    }

    const [user] = await db
      .insert(footballUsers)
      .values({ name, email, cpf, passwordHash: hashFootballPassword(password) })
      .returning({ id: footballUsers.id, email: footballUsers.email, name: footballUsers.name });

    res.status(201).json(buildAuthResponse(user!));
  } catch (error) {
    console.error('Football register error:', error);
    res.status(500).json({ error: 'Erro ao registrar usuário' });
  }
});

router.post('/login', authRateLimiter(), async (req: Request, res: Response): Promise<void> => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    if (!email || !password) {
      res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
      return;
    }

    const [user] = await db
      .select()
      .from(footballUsers)
      .where(eq(footballUsers.email, email))
      .limit(1);

    if (!user || !verifyFootballPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'E-mail ou senha incorretos' });
      return;
    }

    res.json(buildAuthResponse(user));
  } catch (error) {
    console.error('Football login error:', error);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

router.post('/forgot-password', authRateLimiter(), async (req: Request, res: Response): Promise<void> => {
  const GENERIC_MSG = 'Se este e-mail estiver cadastrado, você receberá um código em instantes.';
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!email) {
      res.status(400).json({ error: 'E-mail obrigatório' });
      return;
    }

    const [user] = await db
      .select({ id: footballUsers.id })
      .from(footballUsers)
      .where(eq(footballUsers.email, email))
      .limit(1);

    if (!user) {
      res.json({ success: true, message: GENERIC_MSG });
      return;
    }

    const code = generateResetCode();
    const expiresAt = new Date(Date.now() + RESET_CODE_EXPIRY_MS);

    await db
      .update(footballUsers)
      .set({ resetCode: code, resetCodeExpiresAt: expiresAt, resetAttempts: 0 })
      .where(eq(footballUsers.id, user.id));

    try {
      await sendFootballRecoveryEmail(email, code);
    } catch (emailError) {
      console.error('Football recovery email error:', (emailError as Error).message);
    }

    res.json({ success: true, message: GENERIC_MSG });
  } catch (error) {
    console.error('Football forgot-password error:', error);
    res.status(500).json({ error: 'Erro ao processar solicitação' });
  }
});

router.post('/verify-recovery-code', async (req: Request, res: Response): Promise<void> => {
  const INVALID_MSG = 'Código inválido ou expirado';
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const code = String(req.body?.code ?? '');

    const [user] = await db
      .select()
      .from(footballUsers)
      .where(eq(footballUsers.email, email))
      .limit(1);

    if (!user || !user.resetCode || !user.resetCodeExpiresAt) {
      res.status(400).json({ error: INVALID_MSG });
      return;
    }

    if (new Date() > user.resetCodeExpiresAt) {
      res.status(400).json({ error: 'Código expirado. Solicite um novo.' });
      return;
    }

    if (user.resetAttempts >= RESET_CODE_MAX_ATTEMPTS) {
      res.status(400).json({ error: 'Muitas tentativas. Solicite um novo código.' });
      return;
    }

    if (user.resetCode !== code) {
      await db
        .update(footballUsers)
        .set({ resetAttempts: user.resetAttempts + 1 })
        .where(eq(footballUsers.id, user.id));
      res.status(400).json({ error: INVALID_MSG });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Football verify-recovery-code error:', error);
    res.status(500).json({ error: 'Erro ao verificar código' });
  }
});

router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const code = String(req.body?.code ?? '');
    const newPassword = String(req.body?.newPassword ?? '');

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
      return;
    }

    const [user] = await db
      .select()
      .from(footballUsers)
      .where(eq(footballUsers.email, email))
      .limit(1);

    if (!user || !user.resetCode || !user.resetCodeExpiresAt) {
      res.status(400).json({ error: 'Código inválido ou expirado' });
      return;
    }

    if (new Date() > user.resetCodeExpiresAt) {
      res.status(400).json({ error: 'Código expirado. Solicite um novo.' });
      return;
    }

    if (user.resetAttempts >= RESET_CODE_MAX_ATTEMPTS) {
      res.status(400).json({ error: 'Muitas tentativas. Solicite um novo código.' });
      return;
    }

    if (user.resetCode !== code) {
      await db
        .update(footballUsers)
        .set({ resetAttempts: user.resetAttempts + 1 })
        .where(eq(footballUsers.id, user.id));
      res.status(400).json({ error: 'Código inválido' });
      return;
    }

    await db
      .update(footballUsers)
      .set({
        passwordHash: hashFootballPassword(newPassword),
        resetCode: null,
        resetCodeExpiresAt: null,
        resetAttempts: 0,
        updatedAt: new Date(),
      })
      .where(eq(footballUsers.id, user.id));

    res.json({ success: true });
  } catch (error) {
    console.error('Football reset-password error:', error);
    res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
});

export default router;
