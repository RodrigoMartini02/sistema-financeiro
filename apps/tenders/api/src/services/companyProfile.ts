import { eq } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { accounts, type CnaeEntry } from '../db/identity';
import { RequestInputError } from '../utils/requestInput';
import {
  CompanyLookupUnavailableError,
  CompanyNotFoundError,
  type CompanyLookup,
  type CompanyLookupSource,
} from './companyLookup';
import type { CompanyUpdateInput } from './companyInput';
import { toBrasiliaIso } from './dates';

// Perfil da empresa (item 1C): os dados cadastrais da conta, que é a própria empresa. O titular edita razão social,
// nome fantasia, abertura, porte, tipo jurídico, endereço, telefone e e-mail; situação cadastral, natureza jurídica e
// CNAEs são fatos da Receita, gravados só pela consulta do CNPJ da conta.

const COMPANY_NOT_FOUND_MESSAGE = 'Empresa não encontrada';
const NO_DOCUMENT_MESSAGE = 'Esta conta não tem CNPJ cadastrado.';
const LOOKUP_NOT_FOUND_MESSAGE = 'Não encontramos esse CNPJ na consulta cadastral. Confira o CNPJ ou preencha os dados à mão.';
const LOOKUP_UNAVAILABLE_MESSAGE =
  'A consulta de CNPJ não está disponível agora. Tente de novo em instantes ou preencha os dados à mão.';
/** contas.nome: varchar(100). */
const MAX_ACCOUNT_NAME_LENGTH = 100;

/** O perfil como a API devolve. Texto vazio é `null`; o CNPJ vem só com os dígitos e não se edita aqui. */
export interface CompanyProfileView {
  accountId: number;
  document: string | null;
  legalName: string | null;
  tradeName: string | null;
  /** AAAA-MM-DD. */
  openingDate: string | null;
  /** Códigos das listas do módulo (`COMPANY_SIZES` e `LEGAL_TYPES`). */
  size: string | null;
  legalType: string | null;
  /** Fatos da Receita, só leitura. */
  legalNature: { code: string | null; description: string | null } | null;
  registrationStatus: { code: string; since: string | null } | null;
  mainCnae: CnaeEntry | null;
  secondaryCnaes: CnaeEntry[];
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  /** Quando a consulta gravou os dados pela última vez (ISO de Brasília); nulo se nunca consultou. */
  lookedUpAt: string | null;
}

const profileColumns = {
  accountId: accounts.id,
  document: accounts.document,
  name: accounts.name,
  legalName: accounts.legalName,
  tradeName: accounts.tradeName,
  openingDate: accounts.openingDate,
  size: accounts.size,
  legalType: accounts.legalType,
  legalNatureCode: accounts.legalNatureCode,
  legalNature: accounts.legalNature,
  registrationStatus: accounts.registrationStatus,
  registrationStatusDate: accounts.registrationStatusDate,
  mainCnaeCode: accounts.mainCnaeCode,
  mainCnaeDescription: accounts.mainCnaeDescription,
  secondaryCnaes: accounts.secondaryCnaes,
  zipCode: accounts.zipCode,
  street: accounts.street,
  streetNumber: accounts.streetNumber,
  complement: accounts.complement,
  district: accounts.district,
  city: accounts.city,
  state: accounts.state,
  phone: accounts.phone,
  contactEmail: accounts.contactEmail,
  lookedUpAt: accounts.lookedUpAt,
};

function profileQuery(db: TendersDb, accountId: number) {
  return db.select(profileColumns).from(accounts).where(eq(accounts.id, accountId)).limit(1);
}

type ProfileRow = Awaited<ReturnType<typeof profileQuery>>[number];

function toProfileView(row: ProfileRow): CompanyProfileView {
  const hasNature = row.legalNatureCode !== null || row.legalNature !== null;
  return {
    accountId: row.accountId,
    document: row.document,
    legalName: row.legalName,
    tradeName: row.tradeName,
    openingDate: row.openingDate,
    size: row.size,
    legalType: row.legalType,
    legalNature: hasNature ? { code: row.legalNatureCode, description: row.legalNature } : null,
    registrationStatus: row.registrationStatus === null ? null : { code: row.registrationStatus, since: row.registrationStatusDate },
    mainCnae: row.mainCnaeCode === null ? null : { code: row.mainCnaeCode, description: row.mainCnaeDescription ?? '' },
    secondaryCnaes: Array.isArray(row.secondaryCnaes) ? row.secondaryCnaes : [],
    zipCode: row.zipCode,
    street: row.street,
    number: row.streetNumber,
    complement: row.complement,
    district: row.district,
    city: row.city,
    state: row.state,
    phone: row.phone,
    email: row.contactEmail,
    lookedUpAt: toBrasiliaIso(row.lookedUpAt),
  };
}

async function readProfileRow(db: TendersDb, accountId: number): Promise<ProfileRow> {
  const [row] = await profileQuery(db, accountId);
  if (!row) {
    throw new RequestInputError(COMPANY_NOT_FOUND_MESSAGE, 404);
  }
  return row;
}

export async function readCompanyProfile(db: TendersDb, accountId: number): Promise<CompanyProfileView> {
  return toProfileView(await readProfileRow(db, accountId));
}

type AccountColumns = Partial<typeof accounts.$inferInsert>;

/** O nome da conta (o que o app mostra) é o nome fantasia ou, sem ele, a razão social. */
function accountDisplayName(legalName: string | null, tradeName: string | null, fallback: string): string {
  return (tradeName ?? legalName ?? fallback).slice(0, MAX_ACCOUNT_NAME_LENGTH);
}

/** Edição do titular: só o que veio no pedido muda. Recalcula o nome da conta quando a razão social ou o fantasia mudam. */
export async function updateCompanyProfile(
  db: TendersDb,
  accountId: number,
  input: CompanyUpdateInput,
): Promise<CompanyProfileView> {
  const current = await readProfileRow(db, accountId);

  const columns: AccountColumns = {};
  if (input.legalName !== undefined) columns.legalName = input.legalName;
  if (input.tradeName !== undefined) columns.tradeName = input.tradeName;
  if (input.openingDate !== undefined) columns.openingDate = input.openingDate;
  if (input.size !== undefined) columns.size = input.size;
  if (input.legalType !== undefined) columns.legalType = input.legalType;
  if (input.zipCode !== undefined) columns.zipCode = input.zipCode;
  if (input.street !== undefined) columns.street = input.street;
  if (input.number !== undefined) columns.streetNumber = input.number;
  if (input.complement !== undefined) columns.complement = input.complement;
  if (input.district !== undefined) columns.district = input.district;
  if (input.city !== undefined) columns.city = input.city;
  if (input.state !== undefined) columns.state = input.state;
  if (input.phone !== undefined) columns.phone = input.phone;
  if (input.email !== undefined) columns.contactEmail = input.email;

  if (input.legalName !== undefined || input.tradeName !== undefined) {
    columns.name = accountDisplayName(
      input.legalName ?? current.legalName,
      input.tradeName !== undefined ? input.tradeName : current.tradeName,
      current.name ?? '',
    );
  }

  await db.update(accounts).set(columns).where(eq(accounts.id, accountId));
  return readCompanyProfile(db, accountId);
}

/**
 * O que a consulta grava. Nunca apaga: o que a fonte não informou (`null`) fica como está. A lista de CNAEs
 * secundários é a exceção, porque lista vazia da fonte é um fato ("sem CNAE secundário"), e `null` é "não veio".
 */
function lookupColumns(lookup: CompanyLookup): AccountColumns {
  const columns: AccountColumns = { legalName: lookup.legalName };
  if (lookup.tradeName !== null) columns.tradeName = lookup.tradeName;
  if (lookup.openingDate !== null) columns.openingDate = lookup.openingDate;
  if (lookup.size !== null) columns.size = lookup.size;
  if (lookup.legalType !== null) columns.legalType = lookup.legalType;
  if (lookup.legalNatureCode !== null) columns.legalNatureCode = lookup.legalNatureCode;
  if (lookup.legalNature !== null) columns.legalNature = lookup.legalNature;
  if (lookup.registrationStatus !== null) columns.registrationStatus = lookup.registrationStatus;
  if (lookup.registrationStatusDate !== null) columns.registrationStatusDate = lookup.registrationStatusDate;
  if (lookup.mainCnae !== null) {
    columns.mainCnaeCode = lookup.mainCnae.code;
    columns.mainCnaeDescription = lookup.mainCnae.description;
  }
  if (lookup.secondaryCnaes !== null) columns.secondaryCnaes = lookup.secondaryCnaes;
  if (lookup.zipCode !== null) columns.zipCode = lookup.zipCode;
  if (lookup.street !== null) columns.street = lookup.street;
  if (lookup.number !== null) columns.streetNumber = lookup.number;
  if (lookup.complement !== null) columns.complement = lookup.complement;
  if (lookup.district !== null) columns.district = lookup.district;
  if (lookup.city !== null) columns.city = lookup.city;
  if (lookup.state !== null) columns.state = lookup.state;
  if (lookup.phone !== null) columns.phone = lookup.phone;
  if (lookup.email !== null) columns.contactEmail = lookup.email;
  return columns;
}

/**
 * Consulta o CNPJ da própria conta e grava o resultado. O CNPJ vem sempre da conta (a rota nunca aceita outro).
 * Fonte sem o CNPJ: 422; fonte fora do ar ou resposta inesperada: 503; conta sem CNPJ: 400.
 */
export async function applyCompanyLookup(
  db: TendersDb,
  accountId: number,
  source: CompanyLookupSource,
  now: Date,
): Promise<CompanyProfileView> {
  const current = await readProfileRow(db, accountId);
  if (!current.document) {
    throw new RequestInputError(NO_DOCUMENT_MESSAGE);
  }

  let lookup: CompanyLookup;
  try {
    lookup = await source.lookup(current.document);
  } catch (error) {
    if (error instanceof CompanyNotFoundError) {
      throw new RequestInputError(LOOKUP_NOT_FOUND_MESSAGE, 422);
    }
    if (error instanceof CompanyLookupUnavailableError) {
      console.error('Company lookup unavailable:', { accountId, reason: error.message });
      throw new RequestInputError(LOOKUP_UNAVAILABLE_MESSAGE, 503);
    }
    throw error;
  }

  const columns = lookupColumns(lookup);
  columns.name = accountDisplayName(
    lookup.legalName,
    lookup.tradeName ?? current.tradeName,
    current.name ?? '',
  );
  columns.lookedUpAt = now.toISOString();

  await db.update(accounts).set(columns).where(eq(accounts.id, accountId));
  return readCompanyProfile(db, accountId);
}
