// Recuperação de senha de Licitações: um código de 6 dígitos por usuário, na tabela codigo_recuperacao, válido por
// 15 minutos e com no máximo 3 erros (conferência e redefinição somam).
// Cada pedido reserva uma tentativa ANTES de comparar o código, num único UPDATE condicional: com o bloqueio de
// linha, o Postgres reavalia o WHERE na versão nova da linha, e pedidos simultâneos não passam do limite.
import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { passwordRecoveryCodes, users } from '../db/identity';
import { RequestInputError } from '../utils/requestInput';
import { MAX_RECOVERY_ATTEMPTS, RECOVERY_CODE_VALIDITY_MINUTES, wrongCodeMessage } from './authMessages';

const PASSWORD_HASH_ROUNDS = 10;

interface ReservedAttempt {
  userId: number;
  code: string;
  expiresAt: string;
  /** Tentativas usadas contando esta. */
  attemptsUsed: number;
}

function newRecoveryCode(): string {
  return String(randomInt(100000, 1000000));
}

/** Código novo para o usuário (substitui o anterior e zera as tentativas). */
export async function issueRecoveryCode(db: TendersDb, userId: number, now: Date): Promise<string> {
  const code = newRecoveryCode();
  const expiresAt = new Date(now.getTime() + RECOVERY_CODE_VALIDITY_MINUTES * 60 * 1000).toISOString();
  await db
    .insert(passwordRecoveryCodes)
    .values({ userId, code, expiresAt, attempts: 0 })
    .onConflictDoUpdate({ target: passwordRecoveryCodes.userId, set: { code, expiresAt, attempts: 0 } });
  return code;
}

/** Reserva uma tentativa do código do e-mail; sem tentativa a reservar, lança o motivo. */
async function reserveAttempt(db: TendersDb, email: string): Promise<ReservedAttempt> {
  const [reserved] = await db
    .update(passwordRecoveryCodes)
    .set({ attempts: sql`${passwordRecoveryCodes.attempts} + 1` })
    .where(and(
      inArray(passwordRecoveryCodes.userId, db.select({ id: users.id }).from(users).where(eq(users.email, email))),
      gt(passwordRecoveryCodes.expiresAt, sql`now()`),
      lt(passwordRecoveryCodes.attempts, MAX_RECOVERY_ATTEMPTS),
    ))
    .returning({
      userId: passwordRecoveryCodes.userId,
      code: passwordRecoveryCodes.code,
      expiresAt: passwordRecoveryCodes.expiresAt,
      attemptsUsed: passwordRecoveryCodes.attempts,
    });

  if (reserved) {
    return reserved;
  }
  throw await missingReservationError(db, email);
}

/** Devolve a tentativa reservada: acerto não conta. */
async function releaseAttempt(db: TendersDb, attempt: ReservedAttempt): Promise<void> {
  const released = await db
    .update(passwordRecoveryCodes)
    .set({ attempts: sql`GREATEST(${passwordRecoveryCodes.attempts} - 1, 0)` })
    .where(and(
      eq(passwordRecoveryCodes.userId, attempt.userId),
      eq(passwordRecoveryCodes.code, attempt.code),
      eq(passwordRecoveryCodes.expiresAt, attempt.expiresAt),
      gt(passwordRecoveryCodes.expiresAt, sql`now()`),
    ))
    .returning({ userId: passwordRecoveryCodes.userId });
  if (released.length === 0) {
    throw new RequestInputError('Código expirado ou substituído. Peça um novo código.');
  }
}

async function missingReservationError(db: TendersDb, email: string): Promise<RequestInputError> {
  const [found] = await db
    .select({
      hasCode: sql<boolean>`${passwordRecoveryCodes.userId} IS NOT NULL`,
      expired: sql<boolean>`COALESCE(${passwordRecoveryCodes.expiresAt} <= now(), true)`,
    })
    .from(users)
    .leftJoin(passwordRecoveryCodes, eq(passwordRecoveryCodes.userId, users.id))
    .where(eq(users.email, email))
    .limit(1);

  if (!found) return new RequestInputError('E-mail não cadastrado. Confira o e-mail usado no cadastro.', 404);
  if (!found.hasCode) return new RequestInputError('Nenhum código foi pedido para este e-mail.');
  if (found.expired) return new RequestInputError('Código expirado. Peça um novo código.');
  return new RequestInputError('Muitas tentativas com este código. Peça um novo código.');
}

/** Confere o código do e-mail sem gastar a tentativa quando acerta; erra com o motivo e as tentativas que restam. */
export async function verifyRecoveryCode(db: TendersDb, email: string, code: string): Promise<void> {
  const attempt = await reserveAttempt(db, email.toLowerCase());
  if (attempt.code !== code.trim()) {
    throw new RequestInputError(wrongCodeMessage(attempt.attemptsUsed));
  }
  // Acerto não conta: a tentativa volta, e a redefinição ainda tem a dela.
  await releaseAttempt(db, attempt);
}

/** Troca a senha de quem tem o código; o código vale uma vez só e some junto com a troca. */
export async function resetPasswordWithCode(
  db: TendersDb,
  input: { email: string; code: string; newPassword: string },
): Promise<void> {
  const attempt = await reserveAttempt(db, input.email.toLowerCase());
  if (attempt.code !== input.code.trim()) {
    throw new RequestInputError(wrongCodeMessage(attempt.attemptsUsed));
  }

  const hashedPassword = await bcrypt.hash(input.newPassword, PASSWORD_HASH_ROUNDS);
  await db.transaction(async (transaction) => {
    // O DELETE disputa o bloqueio da linha: só um pedido consome esta versão do
    // código. A senha muda na mesma transação, depois do consumo confirmado.
    const consumed = await transaction
      .delete(passwordRecoveryCodes)
      .where(and(
        eq(passwordRecoveryCodes.userId, attempt.userId),
        eq(passwordRecoveryCodes.code, attempt.code),
        eq(passwordRecoveryCodes.expiresAt, attempt.expiresAt),
        gt(passwordRecoveryCodes.expiresAt, sql`now()`),
      ))
      .returning({ userId: passwordRecoveryCodes.userId });
    if (consumed.length === 0) {
      throw new RequestInputError('Código expirado ou já utilizado. Peça um novo código.');
    }
    await transaction.update(users).set({ password: hashedPassword }).where(eq(users.id, attempt.userId));
  });
}
