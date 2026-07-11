import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/client';
import { footballUsers } from '../db/schema';
import { hashFootballPassword, verifyFootballPassword } from '../password';
import { signFootballUser } from '../middleware/auth';

const router = Router();

function getDefaultFootballAdmin(): { user: string; password: string } {
  return {
    user: (process.env['FUTEBOL_DEFAULT_ADMIN_USER'] ?? process.env['DEFAULT_ADMIN_USER'] ?? '').trim().toLowerCase(),
    password: process.env['FUTEBOL_DEFAULT_ADMIN_PASSWORD'] ?? process.env['DEFAULT_ADMIN_PASSWORD'] ?? '',
  };
}

function buildAuthResponse(user: { id: string; email: string }) {
  const token = signFootballUser({ userId: user.id, email: user.email });
  return { token, user: { id: user.id, email: user.email } };
}

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    if (!email) {
      res.status(400).json({ error: 'E-mail obrigatorio' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
      return;
    }

    const [existingUser] = await db
      .select({ id: footballUsers.id })
      .from(footballUsers)
      .where(eq(footballUsers.email, email))
      .limit(1);

    if (existingUser) {
      res.status(409).json({ error: 'Ja existe uma conta com este e-mail' });
      return;
    }

    const [user] = await db
      .insert(footballUsers)
      .values({ email, passwordHash: hashFootballPassword(password) })
      .returning({ id: footballUsers.id, email: footballUsers.email });

    res.status(201).json(buildAuthResponse(user!));
  } catch (error) {
    console.error('Football register error:', error);
    res.status(500).json({ error: 'Erro ao registrar usuario' });
  }
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    if (!email || !password) {
      res.status(400).json({ error: 'E-mail e senha sao obrigatorios' });
      return;
    }

    const defaultAdmin = getDefaultFootballAdmin();
    const isDefaultAdminLogin = Boolean(defaultAdmin.user && defaultAdmin.password && email === defaultAdmin.user);

    const lookupEmail = isDefaultAdminLogin ? defaultAdmin.user : email;
    const [existingUser] = await db
      .select()
      .from(footballUsers)
      .where(eq(footballUsers.email, lookupEmail))
      .limit(1);

    let user = existingUser;
    if (isDefaultAdminLogin && password === defaultAdmin.password) {
      const passwordHash = hashFootballPassword(defaultAdmin.password);
      if (user) {
        const [updated] = await db
          .update(footballUsers)
          .set({ passwordHash, updatedAt: new Date() })
          .where(eq(footballUsers.id, user.id))
          .returning();
        user = updated;
      } else {
        const [created] = await db
          .insert(footballUsers)
          .values({ email: defaultAdmin.user, passwordHash })
          .returning();
        user = created;
      }
    }

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

export default router;
