import { and, eq } from 'drizzle-orm';
import { RequestInputError } from '../../../utils/requestInput';
import type { TendersDb } from '../collector/database';
import type { ContractTermSummary } from '../collector/contractMapping';
import { PURCHASE_CONTROL_NUMBER, isContractKey } from '../contractStore/layout';
import { contractExists, readContract } from '../contractStore/queries';
import { tenderContractFavorites, tenderNotices } from '../db/schema';
import type { SupplierPersonType } from '../domains';
import { contractPncpLink, contractTypeLabel, type ContractContext } from './contractSearch';
import { toBrasiliaIso } from './dates';
import type { SearchRequester } from './noticeSearch';

// Detalhe do contrato e favoritos (planos .plans/licitacoes-contratos-a-vencer.md,
// Parte B, e .plans/licitacoes-contratos-no-r2.md, Parte R2). O contrato é
// público e mora no armazém do R2, identificado pelo número de controle do PNCP
// (a "chave"); o favorito é só da pessoa, na conta da requisição, e guarda a chave.

export const CONTRACT_NOT_FOUND = 'Contrato não encontrado';

/** Aditivo ou rescisão do contrato, como o PNCP informa (sem os apostilamentos). */
export interface ContractAmendmentView {
  type: string | null;
  number: string | null;
  sequence: number | null;
  signedAt: string | null;
  endDate: string | null;
  addedValue: number | null;
  changesTerm: boolean;
}

export interface ContractDetail {
  /** Número de controle do PNCP: o identificador do contrato nas rotas, nos favoritos e nos avisos. */
  pncpControlNumber: string;
  purchaseControlNumber: string | null;
  contractYear: number;
  contractSequence: number;
  contractNumber: string | null;
  processNumber: string | null;
  agencyCnpj: string;
  agencyName: string | null;
  governmentSphere: string | null;
  unitCode: string | null;
  unitName: string | null;
  state: string | null;
  cityName: string | null;
  cityIbgeCode: string | null;
  categoryId: number | null;
  categoryName: string | null;
  contractTypeId: number | null;
  /** Nome curto do tipo (`CONTRACT_TYPES`); tipo fora da lista, o nome que veio. */
  contractTypeName: string | null;
  contractObject: string;
  additionalInformation: string | null;
  supplierPersonType: SupplierPersonType | null;
  /** CNPJ (14 dígitos) ou, na pessoa física, o CPF mascarado. */
  supplierDocument: string | null;
  supplierName: string | null;
  initialValue: number | null;
  globalValue: number | null;
  signedAt: string | null;
  termStart: string;
  /** null: sem data de fim, ou com uma fora do normal. */
  originalTermEnd: string | null;
  /** null: sem vencimento. */
  expiresOn: string | null;
  isExtended: boolean;
  /** Termos conferidos no PNCP; null = sem sinal de alteração (termos não consultados). */
  amendments: ContractAmendmentView[] | null;
  publishedAt: string | null;
  pncpUpdatedAt: string | null;
  lastCollectedAt: string | null;
  pncpLink: string;
  /** Edital de origem na base (mesmo número de controle da compra), para abrir no app. */
  originNoticeId: number | null;
  /** Sem o edital na base: a página da compra no PNCP, montada pelo número de controle. */
  originPncpLink: string | null;
  /** Favorito de quem abriu o contrato (cada pessoa tem os seus). */
  isFavorite: boolean;
}

/** Página da compra de origem no PNCP, pelo número de controle; formato desconhecido: null. */
export function purchasePncpLink(purchaseControlNumber: string | null): string | null {
  const match = purchaseControlNumber?.trim().match(PURCHASE_CONTROL_NUMBER);
  if (!match) {
    return null;
  }
  const [, cnpj, sequence, year] = match;
  return `https://pncp.gov.br/app/editais/${cnpj}/${year}/${sequence}`;
}

/** A chave do contrato vinda da URL; fora do formato, "não encontrado", sem consultar nada. */
export function parseContractKey(value: unknown): string {
  if (!isContractKey(value)) {
    throw new RequestInputError(CONTRACT_NOT_FOUND, 404);
  }
  return value;
}

/** Favorito da pessoa na conta, para o contrato informado. */
function favoriteOf(requester: SearchRequester, key: string) {
  return and(
    eq(tenderContractFavorites.accountId, requester.accountId),
    eq(tenderContractFavorites.userId, requester.userId),
    eq(tenderContractFavorites.contractKey, key),
  );
}

/** Compra de origem do contrato na base de editais, pelo número de controle da compra. */
async function readOriginNoticeId(db: TendersDb, purchaseControlNumber: string | null): Promise<number | null> {
  if (purchaseControlNumber === null) {
    return null;
  }
  const [notice] = await db
    .select({ id: tenderNotices.id })
    .from(tenderNotices)
    .where(eq(tenderNotices.pncpControlNumber, purchaseControlNumber))
    .limit(1);
  return notice?.id ?? null;
}

async function isFavoriteOf(db: TendersDb, requester: SearchRequester, key: string): Promise<boolean> {
  const [favorite] = await db
    .select({ createdAt: tenderContractFavorites.createdAt })
    .from(tenderContractFavorites)
    .where(favoriteOf(requester, key))
    .limit(1);
  return favorite !== undefined;
}

function toAmendmentView(term: ContractTermSummary): ContractAmendmentView {
  return { ...term, addedValue: term.addedValue === null ? null : Number(term.addedValue) };
}

export async function getContractDetail(context: ContractContext, requester: SearchRequester, key: string): Promise<ContractDetail> {
  const data = await context.contractStore.query((connection) => readContract(connection, key));
  if (!data) {
    throw new RequestInputError(CONTRACT_NOT_FOUND, 404);
  }

  const [originNoticeId, isFavorite] = await Promise.all([
    readOriginNoticeId(context.db, data.purchaseControlNumber),
    isFavoriteOf(context.db, requester, key),
  ]);
  const toNumber = (value: string | null) => (value === null ? null : Number(value));
  return {
    pncpControlNumber: data.pncpControlNumber,
    purchaseControlNumber: data.purchaseControlNumber,
    contractYear: data.contractYear,
    contractSequence: data.contractSequence,
    contractNumber: data.contractNumber,
    processNumber: data.processNumber,
    agencyCnpj: data.agencyCnpj,
    agencyName: data.agencyName,
    governmentSphere: data.governmentSphere,
    unitCode: data.unitCode,
    unitName: data.unitName,
    state: data.state,
    cityName: data.cityName,
    cityIbgeCode: data.cityIbgeCode,
    categoryId: data.categoryId,
    categoryName: data.categoryName,
    contractTypeId: data.contractTypeId,
    contractTypeName: contractTypeLabel(data.contractTypeId, data.contractTypeName),
    contractObject: data.contractObject,
    additionalInformation: data.additionalInformation,
    supplierPersonType: data.supplierPersonType,
    supplierDocument: data.supplierDocument,
    supplierName: data.supplierName,
    initialValue: toNumber(data.initialValue),
    globalValue: toNumber(data.globalValue),
    signedAt: data.signedAt,
    termStart: data.termStart,
    originalTermEnd: data.originalTermEnd,
    expiresOn: data.expiresOn,
    isExtended: data.expiresOn !== data.originalTermEnd,
    amendments: data.amendments?.map(toAmendmentView) ?? null,
    publishedAt: toBrasiliaIso(data.publishedAt),
    pncpUpdatedAt: toBrasiliaIso(data.pncpUpdatedAt),
    lastCollectedAt: toBrasiliaIso(data.lastCollectedAt),
    pncpLink: contractPncpLink(data.agencyCnpj, data.contractYear, data.contractSequence),
    originNoticeId,
    originPncpLink: originNoticeId === null ? purchasePncpLink(data.purchaseControlNumber) : null,
    isFavorite,
  };
}

/**
 * Marca o contrato como favorito da pessoa na conta. Repetir não duplica;
 * contrato que não está no armazém: 404 (o favorito só guarda a chave, então a
 * conferência é aqui).
 */
export async function addContractFavorite(
  context: ContractContext,
  requester: SearchRequester,
  key: string,
): Promise<{ pncpControlNumber: string; isFavorite: true }> {
  if (!(await context.contractStore.query((connection) => contractExists(connection, key)))) {
    throw new RequestInputError(CONTRACT_NOT_FOUND, 404);
  }
  await context.db
    .insert(tenderContractFavorites)
    .values({ accountId: requester.accountId, userId: requester.userId, contractKey: key })
    .onConflictDoNothing();
  return { pncpControlNumber: key, isFavorite: true };
}

/**
 * Tira o contrato dos favoritos da pessoa na conta. Se não era favorito, nada
 * muda. Não consulta o armazém: tirar o favorito vale mesmo enquanto os
 * contratos estão sendo atualizados.
 */
export async function removeContractFavorite(
  db: TendersDb,
  requester: SearchRequester,
  key: string,
): Promise<{ pncpControlNumber: string; isFavorite: false }> {
  await db.delete(tenderContractFavorites).where(favoriteOf(requester, key));
  return { pncpControlNumber: key, isFavorite: false };
}
