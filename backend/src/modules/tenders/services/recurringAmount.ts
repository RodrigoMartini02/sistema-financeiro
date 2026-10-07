import { updateRecurringAmount } from '../../../services/mercadoPagoCharges';
import type { TendersDb } from '../collector/database';
import { centsToAmount, monthlyAmountCents } from './billing';
import { countModuleUsers, readModuleRow, setBilledUsers } from './subscription';

const RECURRING_UPDATE_FAILED =
  'Não foi possível atualizar agora o valor da assinatura recorrente. Cancele e assine de novo para cobrar o valor atual.';

/**
 * Depois de mudar os usuários da conta: a assinatura recorrente passa a cobrar o
 * valor novo a partir da próxima cobrança (sem cobrar a diferença do mês).
 * Devolve um aviso quando o Mercado Pago não aceita a mudança.
 */
export async function syncRecurringAmount(db: TendersDb, accountId: number, now: Date): Promise<string | null> {
  const row = await readModuleRow(db, accountId);
  if (!row || row.accessType !== 'assinatura' || !row.recurringId) {
    return null;
  }

  const usersCount = await countModuleUsers(db, accountId);
  if (usersCount === row.billedUsers) {
    return null;
  }

  try {
    await updateRecurringAmount(row.recurringId, centsToAmount(monthlyAmountCents(usersCount)));
  } catch (error) {
    console.error('Tender recurring amount update failed:', { accountId, error: (error as Error).message });
    return RECURRING_UPDATE_FAILED;
  }

  await setBilledUsers(db, accountId, usersCount, now);
  return null;
}
