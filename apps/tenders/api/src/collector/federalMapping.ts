import { z } from 'zod/v4';
import { FEDERAL_CONTRACT_KEY_PREFIX, PURCHASE_CONTROL_NUMBER, isContractKey } from '../contractStore/layout';
import { CONTRACT_CATEGORIES, CONTRACT_TYPES } from '../domains';
import {
  PNCP_DATE_TIME,
  cleanText,
  isValidPncpDate,
  positiveValue,
  resolveTermEnd,
  type ContractWithoutExpiryReason,
  type TenderContractRow,
} from './contractMapping';
import { brasiliaDateTime } from './dates';
import { payloadHash } from './mapping';
import { resolveSupplier } from './resultMapping';

// Contrato de órgão federal do Compras.gov.br (módulo de contratos) → contrato do armazém do R2 (plano
// .plans/licitacoes-contratos-federais.md). A fonte é dado externo: tudo é validado, e uma linha inválida vira erro
// contado na execução, sem derrubar a janela. Os nomes dos campos e as formas dos valores são os da sondagem real de
// 26/10/2026 (fixtures/comprasgov-contratos.json).
//
// Só entra o que o PNCP não tem: linha com o número de controle do contrato no PNCP vale pelo PNCP (que traz os
// termos), a excluída na origem não entra, e a incluída há pouco tempo espera a carência (pode ganhar o número logo).
// O contrato federal não tem id na fonte: a chave é a unidade gestora, o tipo e o número.

/** Por que uma linha lida não vira contrato, sem ser erro. A última é cadastro errado na fonte, contado à parte para não deixar toda execução "Parcial". */
export type FederalSkipReason = 'withPncpNumber' | 'excluded' | 'recent' | 'agencyWithoutCnpj' | 'termEndsBeforeStart' | 'pncpTwin';

export type MappedFederalContract =
  | {
      ok: true;
      row: TenderContractRow;
      withoutExpiry: ContractWithoutExpiryReason | null;
      /** Data e hora da inclusão na fonte (AAAA-MM-DDTHH:mm:ss, Brasília). */
      includedAt: string;
    }
  | { ok: false; kind: 'skipped'; reason: FederalSkipReason; typeCode: string; includedAt: string }
  | { ok: false; kind: 'invalid'; reason: string };

/** Órgão federal da lista da fonte. `cnpj` é o do cadastro (14 dígitos válidos) ou nulo. */
export interface FederalAgency {
  code: string;
  name: string;
  cnpj: string | null;
  usesSisg: boolean;
}

/** Unidade gestora (UASG) da lista da fonte, só com o que o contrato leva dela. */
export interface FederalUnit {
  code: string;
  state: string | null;
  cityName: string | null;
  cityIbgeCode: string | null;
}

/** Dias que um contrato incluído na fonte espera antes de entrar: ele pode ganhar o número do PNCP logo. */
export const FEDERAL_GRACE_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;

/** O limite da carência para o `recentFrom` do mapeamento: inclusão depois dele é recente demais. */
export function federalRecentFrom(now: Date): string {
  return brasiliaDateTime(new Date(now.getTime() - FEDERAL_GRACE_DAYS * DAY_MS));
}

export interface FederalMappingContext {
  /** CNPJ do órgão a gravar (ver `resolveAgencyCnpj`); nulo = o órgão não tem CNPJ válido. */
  agencyCnpj: string | null;
  units: ReadonlyMap<string, FederalUnit>;
  /** Inclusão depois deste instante (AAAA-MM-DDTHH:mm:ss) é recente demais: espera a carência. */
  recentFrom: string;
}

const MAX_REPORTED_ISSUES = 3;
const MIN_CONTRACT_YEAR = 1990;
const MAX_CONTRACT_YEAR = 2100;
const MAX_VALUE = 1e16;
const DATE_TIME_LENGTH = 19;
const CNPJ_LENGTH = 14;
const MIN_CNPJ_DIGITS = 8;
const UNIT_CODE = /^\d{1,8}$/;
const TYPE_CODE = /^\d{1,3}$/;
const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}(?:$|[T ])/;
const UF_PATTERN = /^[A-Z]{2}$/;
const IBGE_PATTERN = /^\d{7}$/;
const KEY_NUMBER_FORBIDDEN = /[^0-9A-Za-z/_.-]/g;
const YEAR_AFTER_SLASH = /\/(\d{4})$/;
const YEAR_BEFORE_COMMITMENT = /^(\d{4})[A-Za-z]{2}\d+$/;

const optionalText = z.string().nullish();
/** A fonte manda alguns códigos e documentos como texto e outros como número. */
const textOrNumber = z.union([z.string(), z.number()]).transform(String);
const optionalTextOrNumber = z.union([z.string(), z.number()]).nullish();

/** Data do calendário (com ou sem hora) que existe e não é anterior a 1990. */
function isSourceDate(value: string): boolean {
  return DATE_PREFIX.test(value) && isValidPncpDate(value.slice(0, 10));
}

const sourceDate = z.string().trim().refine(isSourceDate, 'data fora do formato AAAA-MM-DD ou antes de 1990');
/** Data opcional: vazia vale como não informada, e a inválida mantém a mensagem do formato. */
const optionalSourceDate = z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? null : value), sourceDate.nullish());

/** Valor em reais; negativo e zero são aceitos aqui e viram "sem valor" no mapeamento. */
const money = z
  .union([z.number(), z.string().trim().regex(/^-?\d+(\.\d+)?$/)])
  .transform(Number)
  .pipe(z.number().gt(-MAX_VALUE).lt(MAX_VALUE))
  .nullish();

const contractSchema = z.looseObject({
  codigoOrgao: textOrNumber.pipe(z.string().trim().min(1, 'sem código do órgão').max(20)),
  nomeOrgao: optionalText,
  codigoUnidadeGestora: textOrNumber.pipe(z.string().trim().regex(UNIT_CODE, 'unidade gestora deve ter até 8 dígitos')),
  nomeUnidadeGestora: optionalText,
  numeroContrato: z.string().trim().min(1, 'sem número do contrato'),
  codigoTipo: textOrNumber.pipe(z.string().trim().regex(TYPE_CODE, 'tipo deve ter até 3 dígitos')),
  nomeTipo: optionalText,
  nomeCategoria: optionalText,
  niFornecedor: optionalTextOrNumber,
  nomeRazaoSocialFornecedor: optionalText,
  processo: optionalText,
  objeto: optionalText,
  informacoesComplementares: optionalText,
  dataVigenciaInicial: sourceDate,
  dataVigenciaFinal: optionalSourceDate,
  valorGlobal: money,
  dataHoraInclusao: z.string().trim().regex(PNCP_DATE_TIME, 'data e hora de inclusão fora do formato'),
  numeroControlePncpContrato: optionalText,
  numeroControlePncpCompra: optionalText,
  contratoExcluido: z.boolean().nullish(),
});

const agencySchema = z.looseObject({
  codigoOrgao: textOrNumber.pipe(z.string().trim().min(1).max(20)),
  nomeOrgao: optionalText,
  cnpjCpfOrgao: optionalTextOrNumber,
  esfera: optionalText,
  usoSisg: z.boolean().nullish(),
});

const unitSchema = z.looseObject({
  codigoUasg: textOrNumber.pipe(z.string().trim().regex(UNIT_CODE)),
  siglaUf: optionalText,
  codigoMunicipioIbge: optionalTextOrNumber,
  nomeMunicipioIbge: optionalText,
});

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function checkDigit(base: string, weights: readonly number[]): number {
  const sum = weights.reduce((total, weight, index) => total + Number(base[index]) * weight, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

const FIRST_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const SECOND_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

/**
 * CNPJ de 14 dígitos com os dígitos verificadores certos, ou nulo. O cadastro da fonte perde o zero à esquerda (a ANP
 * vem com 13 dígitos): de 8 a 14 dígitos, completa com zeros à esquerda antes de conferir. "0" e vazio não são CNPJ.
 */
export function normalizeCnpj(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < MIN_CNPJ_DIGITS || digits.length > CNPJ_LENGTH) {
    return null;
  }
  const cnpj = digits.padStart(CNPJ_LENGTH, '0');
  const first = checkDigit(cnpj.slice(0, 12), FIRST_WEIGHTS);
  const second = checkDigit(cnpj.slice(0, 12) + String(first), SECOND_WEIGHTS);
  return cnpj.slice(12) === `${first}${second}` ? cnpj : null;
}

/** O CNPJ da matriz do mesmo grupo: a raiz (8 dígitos), 0001 e os dígitos verificadores. */
export function headOfficeCnpj(cnpj: string): string {
  const base = `${cnpj.slice(0, 8)}0001`;
  const first = checkDigit(base, FIRST_WEIGHTS);
  const second = checkDigit(base + String(first), SECOND_WEIGHTS);
  return `${base}${first}${second}`;
}

/**
 * O CNPJ do órgão como o PNCP o tem. O PNCP usa o do órgão do Compras na forma da matriz (confirmado em 175 de 175
 * contratos de 7 órgãos); o cadastro da fonte pode trazer uma filial. O que se aprendeu dos números de controle do
 * PNCP das próprias linhas do órgão vale mais que a regra da matriz.
 */
export function resolveAgencyCnpj(learned: string | null, registered: string | null): string | null {
  if (learned !== null) {
    return learned;
  }
  return registered === null ? null : headOfficeCnpj(registered);
}

/** O CNPJ do órgão no número de controle do contrato no PNCP da linha, quando ela tiver um. */
export function pncpAgencyCnpjOf(raw: unknown): string | null {
  const control = isRecord(raw) ? raw['numeroControlePncpContrato'] : null;
  if (typeof control !== 'string') {
    return null;
  }
  return PURCHASE_CONTROL_NUMBER.exec(control.trim())?.[1] ?? null;
}

/** A data e hora de inclusão da linha como veio, sem depender de ela ser válida; nulo se não tiver o formato. */
export function inclusionOf(raw: unknown): string | null {
  const value = isRecord(raw) ? raw['dataHoraInclusao'] : null;
  return typeof value === 'string' && PNCP_DATE_TIME.test(value.trim()) ? value.trim() : null;
}

export function parseFederalAgency(raw: unknown): FederalAgency | null {
  const parsed = agencySchema.safeParse(raw);
  if (!parsed.success || cleanText(parsed.data.esfera)?.toUpperCase() !== 'F') {
    return null;
  }
  const agency = parsed.data;
  return {
    code: agency.codigoOrgao,
    name: cleanText(agency.nomeOrgao) ?? agency.codigoOrgao,
    cnpj: normalizeCnpj(agency.cnpjCpfOrgao),
    usesSisg: agency.usoSisg === true,
  };
}

export function parseFederalUnit(raw: unknown): FederalUnit | null {
  const parsed = unitSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const unit = parsed.data;
  const state = cleanText(unit.siglaUf)?.toUpperCase() ?? null;
  const ibge = unit.codigoMunicipioIbge === null || unit.codigoMunicipioIbge === undefined ? '' : String(unit.codigoMunicipioIbge).trim();
  return {
    code: unit.codigoUasg,
    state: state !== null && UF_PATTERN.test(state) ? state : null,
    cityName: cleanText(unit.nomeMunicipioIbge),
    cityIbgeCode: IBGE_PATTERN.test(ibge) ? ibge : null,
  };
}

/** Chave do contrato federal no armazém: unidade gestora, tipo e número ("comprasgov-153254-50-00586/2023"). */
export function federalContractKey(unitCode: string, typeCode: string, contractNumber: string): string {
  return `${FEDERAL_CONTRACT_KEY_PREFIX}${unitCode}-${typeCode}-${contractNumber.trim().replace(KEY_NUMBER_FORBIDDEN, '_')}`;
}

/** Tipo do Compras → tipo do PNCP (`contractTypeId`); os não listados (credenciamento e novos) caem em "Outros". */
const TYPE_ID_BY_SOURCE_CODE: Readonly<Record<string, number>> = {
  '50': 1,
  '52': 2,
  '53': 3,
  '54': 4,
  '56': 5,
  '57': 6,
  '99': 7,
  '98': 8,
  '97': 9,
  '96': 10,
  '95': 11,
  '94': 12,
};
const OTHER_TYPE_ID = 8;

/** O tipo está na tabela do Compras → PNCP; os outros (credenciamento e novos) caem em "Outros". */
export function isKnownFederalTypeCode(code: string): boolean {
  return code in TYPE_ID_BY_SOURCE_CODE;
}

function normalizedName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const CATEGORY_ID_BY_NAME: ReadonlyMap<string, number> = new Map(CONTRACT_CATEGORIES.map((category) => [normalizedName(category.name), category.id]));

function contractTypeOf(code: string, sourceName: string | null): { id: number; name: string | null } {
  const knownId = TYPE_ID_BY_SOURCE_CODE[code];
  if (knownId !== undefined) {
    return { id: knownId, name: CONTRACT_TYPES.find((type) => type.id === knownId)?.name ?? sourceName };
  }
  // Credenciamento e tipos novos: "Outros" no filtro, com o nome da origem na tela.
  return { id: OTHER_TYPE_ID, name: sourceName ?? CONTRACT_TYPES.find((type) => type.id === OTHER_TYPE_ID)?.name ?? null };
}

/** O ano do contrato: o do número (`/2023` no contrato, `2024NE...` no empenho), senão o do início da vigência. */
function contractYearOf(contractNumber: string, termStart: string): number {
  const text = YEAR_AFTER_SLASH.exec(contractNumber)?.[1] ?? YEAR_BEFORE_COMMITMENT.exec(contractNumber)?.[1];
  const fromNumber = text === undefined ? null : Number(text);
  return fromNumber !== null && fromNumber >= MIN_CONTRACT_YEAR && fromNumber <= MAX_CONTRACT_YEAR ? fromNumber : Number(termStart.slice(0, 4));
}

function issuesOf(error: z.ZodError): string {
  return error.issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map((issue) => `${issue.path.join('.') || 'registro'}: ${issue.message}`)
    .join('; ');
}

/**
 * A linha da fonte como contrato do armazém, ou o motivo de não entrar: pulada (o PNCP já tem, excluída, recente,
 * órgão sem CNPJ, fim antes do início) ou inválida. O hash vem dos campos guardados, não da linha: o `valorAcumulado` e as parcelas mudam a
 * cada pagamento e não podem reescrever o contrato.
 */
export function mapFederalContract(raw: unknown, context: FederalMappingContext): MappedFederalContract {
  const parsed = contractSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, kind: 'invalid', reason: issuesOf(parsed.error) };
  }
  const record = parsed.data;
  const includedAt = record.dataHoraInclusao;

  const skipped = (reason: FederalSkipReason): MappedFederalContract => ({ ok: false, kind: 'skipped', reason, typeCode: record.codigoTipo, includedAt });
  if (record.contratoExcluido === true) {
    return skipped('excluded');
  }
  if (cleanText(record.numeroControlePncpContrato) !== null) {
    return skipped('withPncpNumber');
  }
  if (includedAt.slice(0, DATE_TIME_LENGTH) > context.recentFrom) {
    return skipped('recent');
  }
  if (context.agencyCnpj === null) {
    return skipped('agencyWithoutCnpj');
  }

  const invalid = (reason: string): MappedFederalContract => ({ ok: false, kind: 'invalid', reason });
  const termStart = record.dataVigenciaInicial.slice(0, 10);
  const startYear = Number(termStart.slice(0, 4));
  if (startYear > MAX_CONTRACT_YEAR) {
    return invalid('início da vigência depois de 2100');
  }
  const term = resolveTermEnd(termStart, record.dataVigenciaFinal?.slice(0, 10) ?? null);
  if (!term.ok) {
    // Fim antes do início é cadastro errado na fonte (cerca de 2 em 50 mil linhas): como o ciclo lê as mesmas janelas toda
    // semana, contar como erro deixaria a execução sempre "Parcial". A linha fica de fora e é contada à parte.
    return skipped('termEndsBeforeStart');
  }

  const key = federalContractKey(record.codigoUnidadeGestora, record.codigoTipo, record.numeroContrato);
  if (!isContractKey(key)) {
    return invalid('número do contrato fora do formato da chave');
  }

  const unit = context.units.get(record.codigoUnidadeGestora) ?? null;
  const type = contractTypeOf(record.codigoTipo, cleanText(record.nomeTipo));
  const categoryName = cleanText(record.nomeCategoria);
  const supplierName = cleanText(record.nomeRazaoSocialFornecedor);
  const supplier = resolveSupplier(null, record.niFornecedor === null || record.niFornecedor === undefined ? null : String(record.niFornecedor), supplierName, null);
  const purchase = cleanText(record.numeroControlePncpCompra);

  const fields: Omit<TenderContractRow, 'payloadHash'> = {
    pncpControlNumber: key,
    purchaseControlNumber: purchase !== null && PURCHASE_CONTROL_NUMBER.test(purchase) ? purchase : null,
    contractYear: contractYearOf(record.numeroContrato, termStart),
    // Só servia para montar o link do PNCP, que o federal não tem.
    contractSequence: 0,
    contractNumber: record.numeroContrato,
    processNumber: cleanText(record.processo),
    agencyCnpj: context.agencyCnpj,
    agencyName: cleanText(record.nomeOrgao),
    governmentSphere: 'F',
    unitCode: record.codigoUnidadeGestora,
    unitName: cleanText(record.nomeUnidadeGestora),
    state: unit?.state ?? null,
    cityName: unit?.cityName ?? null,
    cityIbgeCode: unit?.cityIbgeCode ?? null,
    categoryId: categoryName === null ? null : (CATEGORY_ID_BY_NAME.get(normalizedName(categoryName)) ?? null),
    categoryName,
    contractObject: (record.objeto ?? '').trim(),
    additionalInformation: cleanText(record.informacoesComplementares),
    supplierPersonType: supplier.personType,
    supplierDocument: supplier.document,
    supplierName,
    initialValue: null,
    globalValue: positiveValue(record.valorGlobal),
    signedAt: null,
    termStart,
    originalTermEnd: term.originalTermEnd,
    // A fonte só traz o fim da vigência; o último aditivo pode não estar nele (a tela avisa).
    expiresOn: term.originalTermEnd,
    contractTypeId: type.id,
    contractTypeName: type.name,
    publishedAt: includedAt,
    pncpUpdatedAt: null,
    pncpGlobalUpdatedAt: null,
    amendments: null,
    amendmentsReference: null,
  };
  return { ok: true, row: { ...fields, payloadHash: payloadHash(fields) }, withoutExpiry: term.withoutExpiry, includedAt };
}

/**
 * Duas inclusões do mesmo contrato na fonte (cerca de 0,4% dos contratos): vale a de inclusão mais recente e, no
 * empate, a de maior fim. A que perde é contada.
 */
export function isLaterRegistration(candidate: TenderContractRow, current: TenderContractRow): boolean {
  if (candidate.publishedAt !== current.publishedAt) {
    return candidate.publishedAt > current.publishedAt;
  }
  return (candidate.expiresOn ?? '') > (current.expiresOn ?? '');
}
