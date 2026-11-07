// Entrada em Licitações: senha (CNPJ, CPF ou e-mail) e conta Google. Devolve o usuário que entrou ou lança o motivo
// da recusa como RequestInputError (a mensagem e o status que a tela mostra).
import bcrypt from 'bcryptjs';
import { asc, eq } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { users } from '../db/identity';
import { RequestInputError } from '../utils/requestInput';
import { blockedAccessMessage } from './authMessages';
import type { GoogleProfile } from './googleAuth';
import { pickLoginByDocument } from './loginDocument';

const CNPJ_LENGTH = 14;
/** Acessos com o mesmo documento lidos no login: o próprio e os de colaborador. */
const LOGIN_CANDIDATES_LIMIT = 10;

type UserRow = typeof users.$inferSelect;
export type SignedInUser = Pick<UserRow, 'id' | 'name' | 'lastName' | 'email' | 'document' | 'type' | 'status'>;

function signedInUser(user: UserRow): SignedInUser {
  return {
    id: user.id,
    name: user.name,
    lastName: user.lastName,
    email: user.email,
    document: user.document,
    type: user.type,
    status: user.status,
  };
}

async function findByLogin(db: TendersDb, identifier: string): Promise<UserRow | undefined> {
  // O campo do login também aceita e-mail: é como entra o colaborador cujo CPF repete o de outro acesso.
  if (identifier.includes('@')) {
    const [user] = await db.select().from(users).where(eq(users.email, identifier.trim().toLowerCase())).limit(1);
    return user;
  }

  const document = identifier.replace(/\D/g, '');
  // O mesmo documento pode abrir mais de um acesso (o próprio e logins de colaborador): pickLoginByDocument
  // escolhe sem sorteio, ou pede o e-mail.
  const candidates = await db
    .select()
    .from(users)
    .where(eq(users.document, document))
    .orderBy(asc(users.id))
    .limit(LOGIN_CANDIDATES_LIMIT);
  const pick = pickLoginByDocument(candidates);
  if (pick.kind === 'ambiguous') {
    const documentLabel = document.length === CNPJ_LENGTH ? 'CNPJ' : 'CPF';
    throw new RequestInputError(`Este ${documentLabel} tem mais de um acesso. Entre com o e-mail.`);
  }
  return pick.kind === 'found' ? pick.user : undefined;
}

/** Entra com a senha: 401 para quem não existe ou erra a senha, 403 para a conta bloqueada ou desativada. */
export async function signInWithPassword(db: TendersDb, identifier: string, password: string): Promise<SignedInUser> {
  const user = await findByLogin(db, identifier);
  if (!user) {
    throw new RequestInputError('CPF, CNPJ ou e-mail não cadastrado', 401);
  }
  if (!(await bcrypt.compare(password, user.password))) {
    throw new RequestInputError('Senha incorreta', 401);
  }
  // O status só aparece para quem sabe a senha.
  const blockedMessage = blockedAccessMessage(user.status);
  if (blockedMessage) {
    throw new RequestInputError(blockedMessage, 403);
  }
  return signedInUser(user);
}

/** Entra com o Google: só quem já tem acesso (o cadastro é o formulário da empresa). */
export async function signInWithGoogle(db: TendersDb, profile: GoogleProfile): Promise<SignedInUser> {
  const [user] = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);
  if (!user) {
    throw new RequestInputError('Este e-mail do Google não tem acesso a Licitações. Cadastre sua empresa pelo formulário.', 403);
  }
  const blockedMessage = blockedAccessMessage(user.status);
  if (blockedMessage) {
    throw new RequestInputError(blockedMessage, 403);
  }
  if (!user.googleId && profile.googleId) {
    await db.update(users).set({ googleId: profile.googleId }).where(eq(users.id, user.id));
  }
  return signedInUser(user);
}
