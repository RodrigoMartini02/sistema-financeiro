import { and, eq, inArray } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { tenderContractFavorites } from '../db/schema';
import type { SearchRequester } from './noticeSearch';

// Favoritos de contratos de cada pessoa na conta (plano
// .plans/licitacoes-contratos-no-r2.md): o favorito guarda o número de controle
// do contrato, e o contrato mora no armazém. Aqui, só a leitura que a busca
// precisa; marcar e desmarcar fica em contractDetail.ts.

function ownedBy(requester: SearchRequester) {
  return and(eq(tenderContractFavorites.accountId, requester.accountId), eq(tenderContractFavorites.userId, requester.userId));
}

/** Todos os favoritos da pessoa na conta, para o "Só favoritos" da busca. */
export async function listFavoriteKeys(db: TendersDb, requester: SearchRequester): Promise<string[]> {
  const rows = await db.select({ key: tenderContractFavorites.contractKey }).from(tenderContractFavorites).where(ownedBy(requester));
  return rows.map((row) => row.key);
}

/** Quais destes contratos são favoritos da pessoa (os da página da busca). */
export async function favoriteKeysAmong(db: TendersDb, requester: SearchRequester, keys: readonly string[]): Promise<Set<string>> {
  if (keys.length === 0) {
    return new Set();
  }
  const rows = await db
    .select({ key: tenderContractFavorites.contractKey })
    .from(tenderContractFavorites)
    .where(and(ownedBy(requester), inArray(tenderContractFavorites.contractKey, [...keys])));
  return new Set(rows.map((row) => row.key));
}
