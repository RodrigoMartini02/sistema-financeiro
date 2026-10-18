import { asc, isNotNull, and } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import {
  BRAZILIAN_STATES,
  CONTRACT_CATEGORIES,
  CONTRACT_TYPES,
  TENDER_MODALITIES,
  TENDER_NOTIFICATION_TYPES,
  TENDER_SITUATIONS,
  TRACKING_STATUSES,
} from '../domains';
import { openCondition, searchedNotice } from './noticeSearch';

// Listas que a tela usa nos filtros (escopo, seção 8.4). Os municípios saem
// dos editais abertos e ficam 10 minutos em memória (por instância do servidor).
// As categorias e os tipos são os dos contratos ("Contratos a vencer").

export const MUNICIPALITIES_CACHE_MS = 10 * 60 * 1000;

export interface Municipality {
  code: string;
  name: string;
  state: string;
}

export interface DomainLists {
  modalities: typeof TENDER_MODALITIES;
  situations: typeof TENDER_SITUATIONS;
  states: typeof BRAZILIAN_STATES;
  trackingStatuses: typeof TRACKING_STATUSES;
  notificationTypes: typeof TENDER_NOTIFICATION_TYPES;
  contractCategories: typeof CONTRACT_CATEGORIES;
  contractTypes: typeof CONTRACT_TYPES;
  municipalities: Municipality[];
}

async function readOpenMunicipalities(db: TendersDb): Promise<Municipality[]> {
  const rows = await db
    .selectDistinctOn([searchedNotice.cityIbgeCode], {
      code: searchedNotice.cityIbgeCode,
      name: searchedNotice.cityName,
      state: searchedNotice.state,
    })
    .from(searchedNotice)
    .where(and(isNotNull(searchedNotice.cityIbgeCode), openCondition))
    .orderBy(asc(searchedNotice.cityIbgeCode), asc(searchedNotice.cityName));
  return rows
    .flatMap((row) => (row.code ? [{ code: row.code, name: row.name ?? '', state: row.state?.trim() ?? '' }] : []))
    .sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name, 'pt-BR'));
}

/** Leitor com cache próprio dos municípios; cada roteador (e cada teste) cria o seu. */
export function createDomainListsReader(db: TendersDb, now: () => number = Date.now): () => Promise<DomainLists> {
  let cached: { expiresAt: number; municipalities: Municipality[] } | null = null;
  return async () => {
    if (!cached || cached.expiresAt <= now()) {
      cached = { expiresAt: now() + MUNICIPALITIES_CACHE_MS, municipalities: await readOpenMunicipalities(db) };
    }
    return {
      modalities: TENDER_MODALITIES,
      situations: TENDER_SITUATIONS,
      states: BRAZILIAN_STATES,
      trackingStatuses: TRACKING_STATUSES,
      notificationTypes: TENDER_NOTIFICATION_TYPES,
      contractCategories: CONTRACT_CATEGORIES,
      contractTypes: CONTRACT_TYPES,
      municipalities: cached.municipalities,
    };
  };
}
