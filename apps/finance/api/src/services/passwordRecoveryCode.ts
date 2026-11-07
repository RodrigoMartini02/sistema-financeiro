// Tentativas do código de recuperação de senha, guardado em dados_financeiros
// (recovery_code, recovery_code_expiry, recovery_attempts).
// Cada pedido reserva uma tentativa ANTES de comparar o código, num único UPDATE
// condicional: com o bloqueio de linha, o Postgres reavalia o WHERE na versão nova
// da linha, e pedidos simultâneos não passam do limite.
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import { MAX_RECOVERY_ATTEMPTS } from '../utils/authMessages';
import { RequestInputError } from '../utils/requestInput';

const attemptsUsed = sql<number>`COALESCE((${users.financialData}->>'recovery_attempts')::int, 0)`;
const storedCode = sql<string | null>`${users.financialData}->>'recovery_code'`;
const codeExpiry = sql`(${users.financialData}->>'recovery_code_expiry')::timestamptz`;

export interface ReservedRecoveryAttempt {
  userId: number;
  code: string;
  /** Tentativas usadas contando esta. */
  attemptsUsed: number;
}

/** Reserva uma tentativa do código do e-mail; sem tentativa a reservar, lança o motivo. */
export async function reserveRecoveryAttempt(email: string): Promise<ReservedRecoveryAttempt> {
  const [reserved] = await db
    .update(users)
    .set({ financialData: sql`${users.financialData} || jsonb_build_object('recovery_attempts', ${attemptsUsed} + 1)` })
    .where(and(
      eq(users.email, email),
      sql`${storedCode} IS NOT NULL`,
      sql`${codeExpiry} > now()`,
      sql`${attemptsUsed} < ${MAX_RECOVERY_ATTEMPTS}`,
    ))
    .returning({ userId: users.id, code: storedCode, attemptsUsed });

  if (reserved?.code) {
    return { userId: reserved.userId, code: reserved.code, attemptsUsed: Number(reserved.attemptsUsed) };
  }
  throw await missingReservationError(email);
}

/** Devolve a tentativa reservada: acerto não conta. */
export async function releaseRecoveryAttempt(userId: number): Promise<void> {
  await db
    .update(users)
    .set({ financialData: sql`${users.financialData} || jsonb_build_object('recovery_attempts', GREATEST(${attemptsUsed} - 1, 0))` })
    .where(eq(users.id, userId));
}

async function missingReservationError(email: string): Promise<RequestInputError> {
  const [user] = await db
    .select({ code: storedCode, expired: sql<boolean>`COALESCE(${codeExpiry} <= now(), true)` })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) return new RequestInputError('E-mail não cadastrado. Confira o e-mail usado no cadastro.', 404);
  if (!user.code) return new RequestInputError('Nenhum código foi pedido para este e-mail.');
  if (user.expired) return new RequestInputError('Código expirado. Peça um novo código.');
  return new RequestInputError('Muitas tentativas com este código. Peça um novo código.');
}
