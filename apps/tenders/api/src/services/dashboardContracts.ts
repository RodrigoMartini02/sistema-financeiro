import { and, eq } from 'drizzle-orm';
import { brasiliaDate } from '../collector/dates';
import { phraseContractCriteria } from '../contractStore/criteria';
import { summarizeExpiring, type ExpiringSummary } from '../contractStore/queries';
import { postgresSearchPhrases } from '../contractStore/textSearch';
import { tenderContractSavedSearches } from '../db/schema';
import { contractSavedSearchCriteria } from './contractSavedSearches';
import { listFavoriteKeys } from './contractFavorites';
import type { ContractContext } from './contractSearch';

// Contratos que vencem, para o Dashboard: os vigentes que vencem nos próximos 30, 60 e 90 dias, e por categoria,
// entre os que batem com as buscas de contratos ativas da pessoa e os contratos que ela favoritou. Lê o armazém
// do R2 na hora (nada fica gravado), por isso tem rota própria e o Dashboard não espera por ele.

interface Requester {
  accountId: number;
  userId: number;
}

export interface ExpiringContractsView extends ExpiringSummary {
  /** De onde vêm os contratos: quantas buscas de contratos ativas e quantos favoritos a pessoa tem. */
  sources: { savedSearches: number; favorites: number };
}

export async function readExpiringContracts(context: ContractContext, requester: Requester): Promise<ExpiringContractsView> {
  const [searches, favoriteKeys] = await Promise.all([
    context.db
      .select()
      .from(tenderContractSavedSearches)
      .where(
        and(
          eq(tenderContractSavedSearches.accountId, requester.accountId),
          eq(tenderContractSavedSearches.userId, requester.userId),
          eq(tenderContractSavedSearches.active, true),
        ),
      ),
    listFavoriteKeys(context.db, requester),
  ]);
  const sources = { savedSearches: searches.length, favorites: favoriteKeys.length };
  if (searches.length === 0 && favoriteKeys.length === 0) {
    return { within30Days: 0, within60Days: 0, within90Days: 0, byCategory: [], sources };
  }

  const phrases = postgresSearchPhrases(context.db);
  const phrased = await Promise.all(searches.map((search) => phraseContractCriteria(phrases, contractSavedSearchCriteria(search))));
  const today = brasiliaDate(context.now());
  const summary = await context.contractStore.query((connection) =>
    summarizeExpiring(connection, today, { criteria: phrased, keys: favoriteKeys }),
  );
  return { ...summary, sources };
}
