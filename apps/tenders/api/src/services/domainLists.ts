import { asc, isNotNull, and } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import {
  BRAZILIAN_STATES,
  COMPANY_SIZES,
  CONTRACT_CATEGORIES,
  CONTRACT_TYPES,
  DOCUMENT_TYPES,
  GOVERNMENT_SPHERES,
  LEGAL_TYPES,
  MEMBER_JOB_TITLES,
  MEMBER_SECTORS,
  PERSON_ROLES,
  TENDER_MODALITIES,
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
  /** Esfera do órgão (filtro de Editais e de Contratos). */
  spheres: typeof GOVERNMENT_SPHERES;
  states: typeof BRAZILIAN_STATES;
  trackingStatuses: typeof TRACKING_STATUSES;
  contractCategories: typeof CONTRACT_CATEGORIES;
  contractTypes: typeof CONTRACT_TYPES;
  /** Setores e cargos padrão do colaborador (formulário de usuários). */
  memberSectors: typeof MEMBER_SECTORS;
  memberJobTitles: typeof MEMBER_JOB_TITLES;
  /** Porte e tipo jurídico da empresa (perfil da empresa). */
  companySizes: typeof COMPANY_SIZES;
  legalTypes: typeof LEGAL_TYPES;
  /** Tipos de documento do cofre (com o dono, a validade padrão e o site do órgão emissor) e papéis das pessoas. */
  documentTypes: typeof DOCUMENT_TYPES;
  personRoles: typeof PERSON_ROLES;
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
      spheres: GOVERNMENT_SPHERES,
      states: BRAZILIAN_STATES,
      trackingStatuses: TRACKING_STATUSES,
      contractCategories: CONTRACT_CATEGORIES,
      contractTypes: CONTRACT_TYPES,
      memberSectors: MEMBER_SECTORS,
      memberJobTitles: MEMBER_JOB_TITLES,
      companySizes: COMPANY_SIZES,
      legalTypes: LEGAL_TYPES,
      documentTypes: DOCUMENT_TYPES,
      personRoles: PERSON_ROLES,
      municipalities: cached.municipalities,
    };
  };
}
