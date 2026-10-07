import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { accountMembers } from '../../../db/schema/accountMembers';
import { accounts } from '../../../db/schema/accounts';
import type { TendersDb } from '../collector/database';
import { tenderEnabledAccounts, tenderMemberAccess } from '../db/schema';
import type { TenderRole } from '../domains';

// Conta da requisição e as travas do módulo (escopo, seção 11; plano
// .plans/licitacoes-produto.md):
// 1. a conta precisa ter o módulo com acesso válido: cortesia, teste, período
//    pago ou recorrente (licitacoes.fn_conta_com_acesso, migration 0080);
// 2. o titular sempre entra; o colaborador precisa de linha em acesso_membro.
// A conta nunca vem livre do app: o `accountId` enviado é só uma escolha,
// validada aqui contra as contas da pessoa.

export interface TenderAccount {
  id: number;
  name: string;
  type: 'pessoal' | 'empresa';
}

export interface TenderAccess {
  account: TenderAccount;
  userId: number;
  role: TenderRole;
  isPlatformAdmin: boolean;
  /** Contas com o módulo valendo em que a pessoa pode usá-lo (o titular troca entre elas). */
  availableAccounts: TenderAccount[];
}

export interface TenderRequester {
  id: number;
  type: 'membro' | 'titular' | 'admin';
}

export type TenderAccessResult =
  | { allowed: true; access: TenderAccess }
  | { allowed: false; reason: 'notFound' | 'memberWithoutAccess' }
  /** Conta com o módulo, mas sem teste, período pago nem recorrente valendo. */
  | { allowed: false; reason: 'subscriptionExpired'; role: TenderRole; account: TenderAccount };

const NOT_FOUND: TenderAccessResult = { allowed: false, reason: 'notFound' };

// A função recebe a linha inteira da conta_habilitada, pelo nome da tabela no FROM.
const hasModuleAccess = sql<boolean>`licitacoes.fn_conta_com_acesso(${sql.raw('conta_habilitada')})`;

interface ModuleAccount extends TenderAccount {
  hasAccess: boolean;
}

function toAccount({ id, name, type }: ModuleAccount): TenderAccount {
  return { id, name, type };
}

/**
 * Contas ativas com o módulo ligado (com ou sem acesso valendo agora): a
 * marcada como padrão primeiro, depois a mais antiga.
 */
async function findModuleAccounts(db: TendersDb, condition: SQL | undefined): Promise<ModuleAccount[]> {
  return db
    .select({ id: accounts.id, name: accounts.name, type: accounts.type, hasAccess: hasModuleAccess })
    .from(accounts)
    .innerJoin(
      tenderEnabledAccounts,
      and(eq(tenderEnabledAccounts.accountId, accounts.id), eq(tenderEnabledAccounts.active, true)),
    )
    .where(and(condition, sql`coalesce(${accounts.active}, true)`))
    .orderBy(desc(accounts.isDefault), asc(accounts.id));
}

/**
 * Resolve a conta da requisição e confere as travas.
 * - Membro ativo de uma conta: usa sempre a conta do vínculo (mesma precedência
 *   do app de finanças); outro `accountId` dá "não encontrada".
 * - Titular: a conta pedida, se for dele e tiver o módulo; sem pedido, a
 *   primeira com acesso valendo (a padrão, depois a mais antiga).
 * - Conta com o módulo, mas vencida: `subscriptionExpired` (o app mostra a
 *   assinatura ao titular e pede ao colaborador que fale com ele).
 */
export async function resolveTenderAccess(
  db: TendersDb,
  requester: TenderRequester,
  requestedAccountId: number | null,
): Promise<TenderAccessResult> {
  const isPlatformAdmin = requester.type === 'admin';
  const [membership] = await db
    .select({ accountId: accountMembers.accountId })
    .from(accountMembers)
    .where(and(eq(accountMembers.userId, requester.id), eq(accountMembers.status, 'ativo')))
    .limit(1);

  if (membership) {
    if (requestedAccountId !== null && requestedAccountId !== membership.accountId) {
      return NOT_FOUND;
    }
    const [account] = await findModuleAccounts(db, eq(accounts.id, membership.accountId));
    if (!account) {
      return NOT_FOUND;
    }
    const [grant] = await db
      .select({ userId: tenderMemberAccess.userId })
      .from(tenderMemberAccess)
      .where(and(eq(tenderMemberAccess.accountId, account.id), eq(tenderMemberAccess.userId, requester.id)))
      .limit(1);
    if (!grant) {
      return { allowed: false, reason: 'memberWithoutAccess' };
    }
    if (!account.hasAccess) {
      return { allowed: false, reason: 'subscriptionExpired', role: 'COLABORADOR', account: toAccount(account) };
    }
    return {
      allowed: true,
      access: { account: toAccount(account), userId: requester.id, role: 'COLABORADOR', isPlatformAdmin, availableAccounts: [toAccount(account)] },
    };
  }

  const ownedAccounts = await findModuleAccounts(db, eq(accounts.userId, requester.id));
  const usableAccounts = ownedAccounts.filter((owned) => owned.hasAccess);
  const account = requestedAccountId === null
    ? (usableAccounts[0] ?? ownedAccounts[0])
    : ownedAccounts.find((owned) => owned.id === requestedAccountId);
  if (!account) {
    return NOT_FOUND;
  }
  if (!account.hasAccess) {
    return { allowed: false, reason: 'subscriptionExpired', role: 'TITULAR', account: toAccount(account) };
  }
  return {
    allowed: true,
    access: {
      account: toAccount(account),
      userId: requester.id,
      role: 'TITULAR',
      isPlatformAdmin,
      availableAccounts: usableAccounts.map(toAccount),
    },
  };
}
