import { and, eq } from 'drizzle-orm';
import { brasiliaDate } from '../collector/dates';
import { phraseContractCriteria } from '../contractStore/criteria';
import { summarizeExpiring } from '../contractStore/queries';
import { postgresSearchPhrases } from '../contractStore/textSearch';
import { tenderContractSavedSearches } from '../db/schema';
import { contractSavedSearchCriteria } from './contractSavedSearches';
import { listFavoriteKeys } from './contractFavorites';
import type { ContractContext } from './contractSearch';

// Contratos que vencem, para o Início (plano .plans/licitacoes-inicio-painel.md, fase 2): os vigentes que vencem nos
// próximos 30, 60 e 90 dias entre os que batem com as buscas de contratos ativas da pessoa e os contratos que ela
// favoritou. Lê o armazém do R2 na hora (nada fica gravado), por isso tem rota própria e o Início não espera por ele.

export const EXPIRING_NEAREST_LIMIT = 5;

interface Requester {
  accountId: number;
  userId: number;
}

export interface ExpiringContractView {
  controlNumber: string;
  /** AAAA-MM-DD. */
  expiresOn: string;
  /** Dias de hoje (Brasília) até o vencimento; 0 vence hoje. */
  daysLeft: number;
  contractObject: string;
  agencyName: string | null;
  state: string | null;
  /** Valor global em reais; null sem valor. */
  globalValue: number | null;
}

export interface ExpiringContractsView {
  /** Janelas acumuladas: a de 60 dias inclui os da de 30. */
  within30Days: number;
  within60Days: number;
  within90Days: number;
  nearest: ExpiringContractView[];
  /** De onde vêm os contratos: quantas buscas de contratos ativas e quantos favoritos a pessoa tem. */
  sources: { savedSearches: number; favorites: number };
}

const DAY_MS = 86_400_000;

/** Dias inteiros entre dois dias AAAA-MM-DD. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
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
    return { within30Days: 0, within60Days: 0, within90Days: 0, nearest: [], sources };
  }

  const phrases = postgresSearchPhrases(context.db);
  const phrased = await Promise.all(searches.map((search) => phraseContractCriteria(phrases, contractSavedSearchCriteria(search))));
  const today = brasiliaDate(context.now());
  const summary = await context.contractStore.query((connection) =>
    summarizeExpiring(connection, today, { criteria: phrased, keys: favoriteKeys }, EXPIRING_NEAREST_LIMIT),
  );

  return {
    within30Days: summary.within30Days,
    within60Days: summary.within60Days,
    within90Days: summary.within90Days,
    nearest: summary.nearest.map((contract) => ({
      controlNumber: contract.controlNumber,
      expiresOn: contract.expiresOn,
      daysLeft: daysBetween(today, contract.expiresOn),
      contractObject: contract.contractObject,
      agencyName: contract.agencyName,
      state: contract.state,
      globalValue: contract.globalValue === null ? null : Number(contract.globalValue),
    })),
    sources,
  };
}
