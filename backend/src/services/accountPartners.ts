// Sócios da conta PJ: gravados junto com a conta (POST/PUT /api/contas, na
// mesma transação) e lidos pelo modal da conta (GET /api/partners), sempre do
// dono da conta. O capital vira receita uma vez só e fica ligado ao sócio por
// socios.receita_capital_id; se a receita for apagada, o vínculo some e o
// capital destrava.
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { incomes, partners } from '../db/schema';
import { getTodayIsoInTimezone } from '../utils/date';
import { RequestInputError } from '../utils/requestInput';
import type { AccountPartnerInput } from './accountPartnersInput';
import { CAPITAL_INCOME_CLASSIFICATION } from './incomeClassificationDefaults';
import { ensureCompanyIncomeClassification } from './incomeClassificationCatalog';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const CAPITAL_INCOME_DESCRIPTION = 'Capital inicial';

/** Sócio como o modal da conta mostra (campos no padrão do pedido da conta). */
export interface AccountPartnerView {
  id: number;
  nome: string;
  percentual: string;
  /** Depois do lançamento, o valor atual da receita (que pode ter sido corrigida em Receitas). */
  capital_inicial: string;
  capital_lancado: boolean;
  capital_lancado_em: string | null;
}

interface SaveAccountPartnersParams {
  ownerId: number;
  accountId: number;
  /** Data de abertura da empresa: a data da receita do capital. Sem ela, hoje. */
  openingDate: string | null;
  partners: AccountPartnerInput[];
}

/** Receita recebida com o capital do sócio, na conta e no nome do dono. */
async function launchCapitalIncome(
  transaction: Transaction,
  params: { ownerId: number; accountId: number; partnerName: string; amount: number; date: string; classificationId: number },
): Promise<number> {
  const [year, month] = params.date.split('-').map(Number);
  const [income] = await transaction
    .insert(incomes)
    .values({
      userId: params.ownerId,
      accountId: params.accountId,
      description: `${CAPITAL_INCOME_DESCRIPTION} — ${params.partnerName}`,
      amount: params.amount.toFixed(2),
      receiptDate: params.date,
      month: month!,
      year: year!,
      status: 'ativa',
      classificationId: params.classificationId,
    })
    .returning({ id: incomes.id });
  return income!.id;
}

/**
 * Deixa os sócios ativos da conta iguais à lista do modal:
 * - sócio existente: nome e participação mudam; o capital só enquanto não foi lançado;
 * - sócio novo: entra;
 * - sócio fora da lista: é desativado (a receita do capital dele continua);
 * - checkbox marcado, capital ainda não lançado: vira receita, uma vez só.
 */
export async function saveAccountPartners(transaction: Transaction, params: SaveAccountPartnersParams): Promise<void> {
  const { ownerId, accountId, openingDate } = params;

  const current = await transaction
    .select({ id: partners.id, capitalIncomeId: partners.capitalIncomeId })
    .from(partners)
    .where(and(eq(partners.userId, ownerId), eq(partners.accountId, accountId), eq(partners.active, true)));
  const currentById = new Map(current.map((row) => [row.id, row]));

  const keptIds = new Set<number>();
  for (const item of params.partners) {
    if (item.id === null) {
      continue;
    }
    if (!currentById.has(item.id)) {
      throw new RequestInputError('Sócio não encontrado nesta conta');
    }
    keptIds.add(item.id);
  }

  const removedIds = current.filter((row) => !keptIds.has(row.id)).map((row) => row.id);
  if (removedIds.length > 0) {
    await transaction.update(partners).set({ active: false }).where(inArray(partners.id, removedIds));
  }

  let capitalClassificationId: number | null = null;
  for (const item of params.partners) {
    const existing = item.id === null ? undefined : currentById.get(item.id);
    const alreadyLaunched = existing?.capitalIncomeId != null;

    let partnerId: number;
    if (existing) {
      await transaction
        .update(partners)
        .set({
          name: item.name,
          percentage: item.percentage.toFixed(2),
          ...(alreadyLaunched ? {} : { initialCapital: item.initialCapital.toFixed(2) }),
        })
        .where(eq(partners.id, existing.id));
      partnerId = existing.id;
    } else {
      const [created] = await transaction
        .insert(partners)
        .values({
          userId: ownerId,
          accountId,
          name: item.name,
          percentage: item.percentage.toFixed(2),
          initialCapital: item.initialCapital.toFixed(2),
        })
        .returning({ id: partners.id });
      partnerId = created!.id;
    }

    if (!item.launchAsIncome || alreadyLaunched || item.initialCapital <= 0) {
      continue;
    }

    capitalClassificationId ??= await ensureCompanyIncomeClassification(transaction, ownerId, CAPITAL_INCOME_CLASSIFICATION);
    const incomeId = await launchCapitalIncome(transaction, {
      ownerId,
      accountId,
      partnerName: item.name,
      amount: item.initialCapital,
      date: openingDate ?? getTodayIsoInTimezone(),
      classificationId: capitalClassificationId,
    });
    await transaction.update(partners).set({ capitalIncomeId: incomeId }).where(eq(partners.id, partnerId));
  }
}

/** Sócios ativos da conta, com o capital lançado lido da receita. */
export async function listAccountPartners(ownerId: number, accountId: number): Promise<AccountPartnerView[]> {
  const rows = await db
    .select({
      id: partners.id,
      name: partners.name,
      percentage: partners.percentage,
      initialCapital: partners.initialCapital,
      incomeId: incomes.id,
      incomeAmount: incomes.amount,
      incomeDate: incomes.receiptDate,
    })
    .from(partners)
    .leftJoin(incomes, eq(incomes.id, partners.capitalIncomeId))
    .where(and(eq(partners.userId, ownerId), eq(partners.accountId, accountId), eq(partners.active, true)))
    .orderBy(asc(partners.name), asc(partners.id));

  return rows.map((row) => ({
    id: row.id,
    nome: row.name,
    percentual: row.percentage,
    capital_inicial: row.incomeAmount ?? row.initialCapital,
    capital_lancado: row.incomeId !== null,
    capital_lancado_em: row.incomeDate,
  }));
}
