import { Request, Response, NextFunction } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { accountMembers, memberPermissions } from '../db/schema';

// Cada flag = acesso completo (ver/criar/editar/excluir) a UMA tela. Não há
// separação de leitura/escrita, nem acesso a lançamentos de outros membros —
// o membro só mexe nos próprios dados, mesmo com a tela liberada.
export type PermissionFlag = keyof Omit<typeof memberPermissions.$inferSelect, 'id' | 'userId' | 'updatedAt'>;

// Resolve o conta_id ao qual `userId` está vinculado como membro ativo, ou
// null se ele não for membro de nenhuma conta (ex.: é o próprio gestor).
export async function resolveMemberAccountId(userId: number): Promise<number | null> {
  const [membership] = await db
    .select({ accountId: accountMembers.accountId })
    .from(accountMembers)
    .where(and(eq(accountMembers.userId, userId), eq(accountMembers.status, 'ativo')))
    .limit(1);
  return membership?.accountId ?? null;
}

// Verifica se `userId` pode acessar a tela correspondente a `flag`: gestor
// (não é membro de ninguém) sempre passa, sem depender de flag nenhuma;
// membro só passa se o gestor tiver liberado essa flag especificamente.
export async function hasScreenAccess(userId: number, flag: PermissionFlag): Promise<boolean> {
  const memberAccountId = await resolveMemberAccountId(userId);

  // Não é membro (é gestor ou usuário independente): acesso total.
  if (memberAccountId === null) return true;

  const [permissions] = await db
    .select()
    .from(memberPermissions)
    .where(eq(memberPermissions.userId, userId))
    .limit(1);

  return !!permissions?.[flag];
}

// Middleware Express: bloqueia a rota inteira com 403 se `req.user` (membro)
// não tiver a tela liberada. Gestor/admin nunca são bloqueados aqui.
export function requireScreenAccess(flag: PermissionFlag) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
      return;
    }

    try {
      const allowed = await hasScreenAccess(req.user.id, flag);
      if (!allowed) {
        res.status(403).json({ success: false, message: 'Access denied. This screen is not enabled for your account.' });
        return;
      }
      next();
    } catch (error) {
      console.error('Screen access check failed:', (error as Error).message);
      res.status(500).json({ success: false, message: 'Failed to verify screen access.' });
    }
  };
}
