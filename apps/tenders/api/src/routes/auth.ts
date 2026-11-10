import { Router, type RequestHandler } from 'express';
import { body } from 'express-validator';
import { eq } from 'drizzle-orm';
import { users } from '../db/identity';
import { createTendersAuthenticate, requireTendersAdmin } from '../middleware/authenticate';
import { authRateLimiter, validate } from '../middleware/validation';
import { signTendersToken } from '../services/authTokens';
import { readCompanyAccountInput } from '../services/companyAccountInput';
import { signInWithGoogle, signInWithPassword, type SignedInUser } from '../services/login';
import { issueRecoveryCode, resetPasswordWithCode, verifyRecoveryCode } from '../services/passwordRecovery';
import { registerCompany } from '../services/registration';
import { RequestInputError, readRecord } from '../utils/requestInput';
import { logAuthFailure } from '../utils/authLogging';
import { authRoute } from './authHandler';
import type { TendersAuthDeps } from './deps';

const MIN_PASSWORD_LENGTH = 8;

/** Corpo da resposta de quem entrou: o token e os dados que o app guarda na sessão. */
function sessionBody(user: SignedInUser, token: string) {
  return {
    token,
    usuario: {
      id: user.id,
      nome: user.name,
      sobrenome: user.lastName,
      email: user.email,
      documento: user.document,
      tipo: user.type,
      status: user.status,
    },
  };
}

/**
 * Acesso a Licitações, com o banco, o segredo e o token do módulo (nada de Finanças). O server.ts monta:
 * - `authRoutes` em /api/tenders/auth, público: login, cadastro da empresa, recuperação de senha e Google;
 * - `authenticate` e `requireAdmin` na frente das demais rotas do módulo.
 */
export function createTendersAuth(deps: TendersAuthDeps): {
  authRoutes: Router;
  authenticate: RequestHandler;
  requireAdmin: RequestHandler;
} {
  const authRoutes = Router();

  // POST /api/tenders/auth/login { documento (CNPJ, CPF ou e-mail), senha }
  authRoutes.post(
    '/login',
    [
      authRateLimiter('documento'),
      body('documento').isString().notEmpty().withMessage('Informe o CNPJ, o CPF ou o e-mail'),
      body('senha').isString().notEmpty().withMessage('Informe a senha'),
      validate,
    ],
    authRoute('login', 'Não foi possível entrar agora. Tente de novo em instantes.', async (req, res) => {
      const user = await signInWithPassword(deps.db, req.body.documento, req.body.senha);
      const token = signTendersToken(user, deps.config);
      res.json({ success: true, message: 'Login successful', data: sessionBody(user, token) });
    }),
  );

  // POST /api/tenders/auth/register { razao_social, nome_fantasia?, documento (CNPJ), data_abertura?, email, senha }
  authRoutes.post(
    '/register',
    [
      body('email').isEmail().withMessage('E-mail inválido'),
      body('senha').isString().isLength({ min: MIN_PASSWORD_LENGTH }).withMessage(`A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres`),
      validate,
    ],
    authRoute('registration', 'Não foi possível concluir o cadastro agora.', async (req, res) => {
      const company = readCompanyAccountInput(req.body);
      const { user } = await registerCompany(deps.db, { email: req.body.email, password: req.body.senha, company }, deps.now());
      const token = signTendersToken(user, deps.config);
      res.status(201).json({ success: true, message: 'User registered successfully', data: sessionBody(user, token) });
    }),
  );

  // POST /api/tenders/auth/forgot-password { email }: manda o código de 6 dígitos por e-mail.
  authRoutes.post(
    '/forgot-password',
    [authRateLimiter('email'), body('email').isEmail().withMessage('E-mail inválido'), validate],
    authRoute('forgot-password', 'Não foi possível pedir o código agora. Tente de novo em instantes.', async (req, res) => {
      const email = String(req.body.email).toLowerCase();
      const [user] = await deps.db.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, email)).limit(1);
      if (!user) {
        throw new RequestInputError('E-mail não cadastrado. Confira o e-mail usado no cadastro.', 404);
      }

      const code = await issueRecoveryCode(deps.db, user.id, deps.now());
      try {
        await deps.sendRecoveryEmail({ to: email, name: user.name, code });
      } catch {
        logAuthFailure('recovery-email');
        res.status(502).json({ success: false, message: 'Não foi possível enviar o código agora. Tente de novo em instantes.' });
        return;
      }
      res.json({ success: true, message: 'Código enviado. Se não chegar em alguns minutos, confira a caixa de spam.' });
    }),
  );

  // POST /api/tenders/auth/verify-recovery-code { email, codigo }
  authRoutes.post(
    '/verify-recovery-code',
    [body('email').isEmail().withMessage('E-mail inválido'), body('codigo').notEmpty().withMessage('Informe o código'), validate],
    authRoute('verify-recovery-code', 'Não foi possível conferir o código agora. Tente de novo em instantes.', async (req, res) => {
      await verifyRecoveryCode(deps.db, req.body.email, String(req.body.codigo));
      res.json({ success: true, message: 'Código confirmado.' });
    }),
  );

  // POST /api/tenders/auth/reset-password { email, codigo, nova_senha }
  authRoutes.post(
    '/reset-password',
    [
      body('email').isEmail().withMessage('E-mail inválido'),
      body('nova_senha').isString().isLength({ min: MIN_PASSWORD_LENGTH }).withMessage(`A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres`),
      body('codigo').notEmpty().withMessage('Informe o código'),
      validate,
    ],
    authRoute('reset-password', 'Não foi possível redefinir a senha agora. Tente de novo em instantes.', async (req, res) => {
      await resetPasswordWithCode(deps.db, { email: req.body.email, code: String(req.body.codigo), newPassword: req.body.nova_senha });
      res.json({ success: true, message: 'Senha redefinida.' });
    }),
  );

  // POST /api/tenders/auth/google { code, redirect_uri }: só entra quem já tem acesso.
  authRoutes.post(
    '/google',
    authRoute('google', 'Não foi possível entrar com o Google agora. Tente de novo em instantes.', async (req, res) => {
      const { code, redirect_uri: redirectUri } = readRecord(req.body, 'Pedido inválido');
      if (typeof code !== 'string' || code === '') {
        throw new RequestInputError('O Google não enviou a autorização. Tente entrar de novo.');
      }
      if (typeof redirectUri !== 'string' || redirectUri === '') {
        throw new RequestInputError('Endereço de retorno do Google ausente. Tente entrar de novo.');
      }
      const profile = await deps.readGoogleProfile(code, redirectUri);
      const user = await signInWithGoogle(deps.db, profile);
      res.json({ success: true, data: sessionBody(user, signTendersToken(user, deps.config)) });
    }),
  );

  return {
    authRoutes,
    authenticate: createTendersAuthenticate(deps.db, deps.config),
    requireAdmin: requireTendersAdmin,
  };
}
