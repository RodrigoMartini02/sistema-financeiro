import { eq, sql } from 'drizzle-orm';
import { brasiliaDate } from '../collector/dates';
import type { TendersDb } from '../collector/database';
import {
  queryContractsAsAgency,
  queryContractsAsSupplier,
  queryStoreCoverage,
  queryTopAgenciesByContracts,
  queryTopSuppliersOfAgency,
  type ContractPartner,
  type ContractRoleSummary,
  type StoreCoverage,
} from '../contractStore/cnpjQueries';
import type { ContractStoreAccess } from '../contractStore/reader';
import { queryWinnerCount, queryWinnerList, queryWinnerSummary, type WinnerSummary } from '../contractStore/winnerQueries';
import { toBrasiliaIso } from './dates';
import { openCondition, searchedNotice, type Paginated } from './noticeSearch';
import { findNotices, purchaseLink } from './winnerLinks';

// A página do CNPJ (plano .plans/licitacoes-pagina-cnpj.md): o que um CNPJ é nos dados, como fornecedor (contratos e
// licitações vencidas) e como órgão (contratos e editais abertos). Nada aqui é específico de uma empresa nem da conta de
// quem pergunta: os dados são públicos e iguais para todos, e a trava do módulo (acesso valendo) fica nas rotas. Os
// contratos e os vencedores vêm do armazém do R2; os editais, do Postgres. Sem cópia pronta do armazém, a consulta sobe
// como ContractStoreUnavailableError (503 na rota).

/** O que o serviço usa: o Postgres, o armazém e o relógio (o `TendersApiDeps` das rotas serve). */
export interface CnpjPageDeps {
  db: TendersDb;
  contractStore: ContractStoreAccess;
  now: () => Date;
}

export interface CnpjContracts {
  total: number;
  /** Vigentes hoje (vencimento de hoje em diante). */
  active: number;
  /** Soma do valor global, em reais. */
  totalValue: number;
  /** Publicação mais antiga e mais recente, em ISO 8601 com o fuso de Brasília. */
  firstPublishedAt: string | null;
  lastPublishedAt: string | null;
}

export interface CnpjWinnersYear {
  year: number;
  purchases: number;
  items: number;
  totalValue: number;
}

export interface CnpjWinners {
  /** Licitações vencidas (uma por licitação e fornecedor). */
  purchases: number;
  items: number;
  totalValue: number;
  /** AAAA-MM-DD. */
  firstResultDate: string | null;
  lastResultDate: string | null;
  /** Do ano mais recente para o mais antigo. */
  byYear: CnpjWinnersYear[];
}

export interface CnpjPartner {
  cnpj: string;
  name: string | null;
  contracts: number;
  totalValue: number;
}

export interface CnpjSummary {
  cnpj: string;
  /** O nome mais recente do CNPJ nos dados (como fornecedor, ou senão como órgão); null quando nenhum dado tem. */
  name: string | null;
  /** null: o CNPJ não tem contratos nem licitações vencidas como fornecedor. */
  supplier: { contracts: CnpjContracts; winners: CnpjWinners; topAgencies: CnpjPartner[] } | null;
  /** null: o CNPJ não tem contratos nem editais abertos como órgão. */
  agency: { contracts: CnpjContracts; openNotices: number; topSuppliers: CnpjPartner[] } | null;
  coverage: StoreCoverage;
}

const toNumber = (reais: string): number => Number(reais);

function contractsBlock(summary: ContractRoleSummary): CnpjContracts {
  return {
    total: summary.total,
    active: summary.active,
    totalValue: toNumber(summary.totalValue),
    firstPublishedAt: toBrasiliaIso(summary.firstPublishedAt),
    lastPublishedAt: toBrasiliaIso(summary.lastPublishedAt),
  };
}

function winnersBlock(summary: WinnerSummary): CnpjWinners {
  return {
    purchases: summary.purchases,
    items: summary.items,
    totalValue: toNumber(summary.totalValue),
    firstResultDate: summary.firstResultDate,
    lastResultDate: summary.lastResultDate,
    byYear: summary.byYear.map((year) => ({ ...year, totalValue: toNumber(year.totalValue) })),
  };
}

const partnerItems = (partners: ContractPartner[]): CnpjPartner[] => partners.map((partner) => ({ ...partner, totalValue: toNumber(partner.totalValue) }));

/** A cobertura só muda quando o armazém publica; fica guardada por armazém e por publicação (a conta varre uma coluna). */
const coverageCache = new WeakMap<ContractStoreAccess, { revision: string; coverage: StoreCoverage }>();

/** Editais abertos do órgão e o nome dele no edital mais recente, no Postgres. */
async function readNotices(db: TendersDb, cnpj: string): Promise<{ openNotices: number; name: string | null }> {
  const [row] = await db
    .select({
      openNotices: sql<number>`count(*) FILTER (WHERE ${openCondition})`.mapWith(Number),
      name: sql<string | null>`(array_agg(${searchedNotice.agencyName} ORDER BY ${searchedNotice.publishedAt} DESC NULLS LAST) FILTER (WHERE ${searchedNotice.agencyName} IS NOT NULL))[1]`,
    })
    .from(searchedNotice)
    .where(eq(searchedNotice.agencyCnpj, cnpj));
  return { openNotices: row?.openNotices ?? 0, name: row?.name ?? null };
}

/**
 * O resumo de um CNPJ válido (a rota confere os dígitos). CNPJ sem nenhum dado volta com os dois blocos nulos e a
 * cobertura, para a tela dizer "sem registros" e até quando os dados vão.
 */
export async function getCnpjSummary(deps: CnpjPageDeps, cnpj: string): Promise<CnpjSummary> {
  const today = brasiliaDate(deps.now());
  const [store, notices] = await Promise.all([
    deps.contractStore.query(async (connection) => {
      // Em sequência, numa vaga só da fila do leitor (o limite de tempo vale para o conjunto).
      const supplierContracts = await queryContractsAsSupplier(connection, cnpj, today);
      const winners = await queryWinnerSummary(connection, cnpj);
      const topAgencies = supplierContracts.total > 0 ? await queryTopAgenciesByContracts(connection, cnpj) : [];
      const agencyContracts = await queryContractsAsAgency(connection, cnpj, today);
      const topSuppliers = agencyContracts.total > 0 ? await queryTopSuppliersOfAgency(connection, cnpj) : [];
      const revision = deps.contractStore.status().revision;
      const cached = coverageCache.get(deps.contractStore);
      const coverage = cached && revision !== null && cached.revision === revision ? cached.coverage : await queryStoreCoverage(connection);
      if (revision !== null) {
        coverageCache.set(deps.contractStore, { revision, coverage });
      }
      return { supplierContracts, winners, topAgencies, agencyContracts, topSuppliers, coverage };
    }),
    readNotices(deps.db, cnpj),
  ]);

  const { supplierContracts, winners, agencyContracts } = store;
  const hasSupplierData = supplierContracts.total > 0 || winners.purchases > 0;
  const hasAgencyData = agencyContracts.total > 0 || notices.openNotices > 0;
  return {
    cnpj,
    name: supplierContracts.name ?? winners.name ?? agencyContracts.name ?? notices.name,
    supplier: hasSupplierData
      ? { contracts: contractsBlock(supplierContracts), winners: winnersBlock(winners), topAgencies: partnerItems(store.topAgencies) }
      : null,
    agency: hasAgencyData
      ? { contracts: contractsBlock(agencyContracts), openNotices: notices.openNotices, topSuppliers: partnerItems(store.topSuppliers) }
      : null,
    coverage: store.coverage,
  };
}

/** Uma licitação vencida pelo CNPJ, da mais recente para a mais antiga. */
export interface CnpjWinnerItem {
  purchaseControlNumber: string;
  year: number;
  agencyCnpj: string;
  /** A fonte de resultados não traz o nome do órgão; vem do edital quando ele ainda está no banco. */
  agencyName: string | null;
  state: string | null;
  cityName: string | null;
  supplierName: string | null;
  items: number;
  totalValue: number;
  firstResultDate: string;
  lastResultDate: string;
  /** Id do edital no banco, quando a licitação ainda tem edital (os editais saem 12 meses depois de encerrados). */
  noticeId: number | null;
  /** Endereço da compra na fonte oficial. */
  link: string;
}

/** Uma página das licitações vencidas pelo CNPJ (válido), com o total para a paginação. */
export async function listCnpjWinners(deps: CnpjPageDeps, cnpj: string, page: number, perPage: number): Promise<Paginated<CnpjWinnerItem>> {
  const { total, rows } = await deps.contractStore.query(async (connection) => ({
    total: await queryWinnerCount(connection, cnpj),
    rows: await queryWinnerList(connection, cnpj, { limit: perPage, offset: (page - 1) * perPage }),
  }));
  const notices = await findNotices(deps.db, rows.map((row) => row.purchaseControlNumber));
  return {
    items: rows.map((row) => {
      const notice = notices.get(row.purchaseControlNumber);
      return {
        purchaseControlNumber: row.purchaseControlNumber,
        year: row.year,
        agencyCnpj: row.agencyCnpj,
        agencyName: row.agencyName ?? notice?.agencyName ?? null,
        state: row.state,
        cityName: row.cityName,
        supplierName: row.supplierName,
        items: row.items,
        totalValue: toNumber(row.totalValue),
        firstResultDate: row.firstResultDate,
        lastResultDate: row.lastResultDate,
        noticeId: notice?.id ?? null,
        link: purchaseLink(row.purchaseControlNumber),
      };
    }),
    page,
    perPage,
    total,
    totalPages: Math.ceil(total / perPage),
  };
}
