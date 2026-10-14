import { and, eq } from 'drizzle-orm';
import { RequestInputError } from '../../../utils/requestInput';
import type { TendersDb } from '../collector/database';
import { tenderContractFavorites, tenderContracts, tenderNotices } from '../db/schema';
import type { SupplierPersonType } from '../domains';
import { contractPncpLink } from './contractSearch';
import { toBrasiliaIso } from './dates';

// Detalhe do contrato e favoritos (plano .plans/licitacoes-contratos-a-vencer.md,
// Parte B). O contrato é público (tabela global); o favorito é só da pessoa, na
// conta da requisição.

const CONTRACT_NOT_FOUND = 'Contrato não encontrado';

/** Número de controle da compra no PNCP: CNPJ do órgão, sequencial e ano ("03353358000196-1-000216/2026"). */
const PURCHASE_CONTROL_NUMBER = /^(\d{14})-\d+-0*(\d+)\/(\d{4})$/;

interface Requester {
  accountId: number;
  userId: number;
}

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
  id: number;
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
  originalTermEnd: string;
  expiresOn: string;
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

/** Favorito da pessoa na conta, para o contrato informado. */
function favoriteOf(requester: Requester, contractId: typeof tenderContracts.id | number) {
  return and(
    eq(tenderContractFavorites.accountId, requester.accountId),
    eq(tenderContractFavorites.userId, requester.userId),
    eq(tenderContractFavorites.contractId, contractId),
  );
}

export async function assertContractExists(db: TendersDb, contractId: number): Promise<void> {
  const [contract] = await db
    .select({ id: tenderContracts.id })
    .from(tenderContracts)
    .where(eq(tenderContracts.id, contractId))
    .limit(1);
  if (!contract) {
    throw new RequestInputError(CONTRACT_NOT_FOUND, 404);
  }
}

export async function getContractDetail(db: TendersDb, requester: Requester, contractId: number): Promise<ContractDetail> {
  const [row] = await db
    .select({ contract: tenderContracts, favoritedAt: tenderContractFavorites.createdAt, originNoticeId: tenderNotices.id })
    .from(tenderContracts)
    .leftJoin(tenderContractFavorites, favoriteOf(requester, tenderContracts.id))
    .leftJoin(tenderNotices, eq(tenderNotices.pncpControlNumber, tenderContracts.purchaseControlNumber))
    .where(eq(tenderContracts.id, contractId))
    .limit(1);
  if (!row) {
    throw new RequestInputError(CONTRACT_NOT_FOUND, 404);
  }

  const { contract: data } = row;
  const toNumber = (value: string | null) => (value === null ? null : Number(value));
  return {
    id: data.id,
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
    state: data.state?.trim() ?? null,
    cityName: data.cityName,
    cityIbgeCode: data.cityIbgeCode,
    categoryId: data.categoryId,
    categoryName: data.categoryName,
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
    amendments: data.amendments?.map((term) => ({ ...term, addedValue: toNumber(term.addedValue) })) ?? null,
    publishedAt: toBrasiliaIso(data.publishedAt),
    pncpUpdatedAt: toBrasiliaIso(data.pncpUpdatedAt),
    lastCollectedAt: toBrasiliaIso(data.lastCollectedAt),
    pncpLink: contractPncpLink(data.agencyCnpj, data.contractYear, data.contractSequence),
    originNoticeId: row.originNoticeId,
    originPncpLink: row.originNoticeId === null ? purchasePncpLink(data.purchaseControlNumber) : null,
    isFavorite: row.favoritedAt !== null,
  };
}

/** Marca o contrato como favorito da pessoa na conta. Repetir não duplica; contrato inexistente: 404. */
export async function addContractFavorite(
  db: TendersDb,
  requester: Requester,
  contractId: number,
): Promise<{ contractId: number; isFavorite: true }> {
  await assertContractExists(db, contractId);
  await db
    .insert(tenderContractFavorites)
    .values({ accountId: requester.accountId, userId: requester.userId, contractId })
    .onConflictDoNothing();
  return { contractId, isFavorite: true };
}

/** Tira o contrato dos favoritos da pessoa na conta. Se não era favorito, nada muda; contrato inexistente: 404. */
export async function removeContractFavorite(
  db: TendersDb,
  requester: Requester,
  contractId: number,
): Promise<{ contractId: number; isFavorite: false }> {
  await assertContractExists(db, contractId);
  await db.delete(tenderContractFavorites).where(favoriteOf(requester, contractId));
  return { contractId, isFavorite: false };
}
