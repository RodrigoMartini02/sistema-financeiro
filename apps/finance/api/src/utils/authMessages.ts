// Mensagens de acesso que dependem de regra (tentativas do código de recuperação e
// status da conta), sem acesso ao banco.
import type { users } from '../db/schema';

type UserStatus = NonNullable<(typeof users.$inferSelect)['status']>;

/** Erros aceitos por código de recuperação, somando a conferência e a redefinição. */
export const MAX_RECOVERY_ATTEMPTS = 3;

/** Mensagem do código errado, com as tentativas que sobram depois desta. */
export function wrongCodeMessage(attemptsUsed: number): string {
  const remaining = MAX_RECOVERY_ATTEMPTS - attemptsUsed;
  if (remaining <= 0) return `Código incorreto. Você usou as ${MAX_RECOVERY_ATTEMPTS} tentativas: peça um novo código.`;
  if (remaining === 1) return 'Código incorreto. Resta 1 tentativa.';
  return `Código incorreto. Restam ${remaining} tentativas.`;
}

/**
 * Motivo de a conta não poder entrar nem usar uma sessão aberta; null quando pode.
 * Só `bloqueado` e `inativo` (membro desativado) barram: status vazio, de cadastro antigo, entra.
 */
export function blockedAccessMessage(status: UserStatus | null | undefined): string | null {
  if (status === 'bloqueado') return 'Conta bloqueada. Fale com o suporte.';
  if (status === 'inativo') return 'Acesso desativado pelo titular da conta.';
  return null;
}
