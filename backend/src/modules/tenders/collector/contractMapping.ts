import { z } from 'zod/v4';
import type { ContractTermSummary, NewTenderContract } from '../db/schema';
import { PNCP_INITIAL_CONTRACT_TYPE_ID, SUPPLIER_PERSON_TYPES, type SupplierPersonType } from '../domains';
import { payloadHash } from './mapping';

// Registro de contrato do PNCP → linha de licitacoes.contrato (plano
// .plans/licitacoes-contratos-a-vencer.md). Como nos editais, o PNCP é dado
// externo: tudo é validado, e um registro inválido vira erro contado na
// execução, sem derrubar a página. Só o "Contrato (termo inicial)" com 180 dias
// ou mais de vigência original entra; o vencimento atual sai dos termos
// (aditivos e rescisões), consultados só quando há sinal de alteração. O dado
// que falta com frequência na origem (contrato sem data de fim, vigência fora
// do normal, aditivo de prazo sem a data nova) é contado à parte, como o
// edital sem prazo, e não como erro: medido no piloto, ele deixaria toda
// execução "Parcial".

export type TenderContractRow = Omit<NewTenderContract, 'id' | 'firstCollectedAt' | 'lastCollectedAt'>;

/**
 * Por que um contrato não entra: não é termo inicial, é curto, não tem data de
 * fim, tem vigência fora do normal (mais de 35 anos) ou já venceu.
 */
export type ContractSkipReason = 'notInitialTerm' | 'shortTerm' | 'withoutEndDate' | 'implausibleTerm' | 'expired';

export type MappedContract =
  | { ok: true; row: TenderContractRow; hasChangeSignal: boolean }
  | { ok: false; controlNumber: string | null; reason: string }
  | { ok: 'skipped'; reason: Exclude<ContractSkipReason, 'expired'> };

/** Vigência original mínima, em dias (6 meses). */
export const MIN_CONTRACT_TERM_DAYS = 180;
/** Vigência acima disso é cadastro fora do normal na origem (2227 no lugar de 2027; água e energia com 2100 ou 3024). */
const MAX_CONTRACT_TERM_YEARS = 35;
const MIN_VALID_DATE = '1990-01-01';
/** Sinal de alteração: a atualização global mais de 24 h depois da publicação. */
const CHANGE_SIGNAL_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const PNCP_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PNCP_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?$/;
// NUMERIC(18,2): até 16 dígitos inteiros.
const MAX_VALUE = 1e16;
const SMALLINT_MAX = 32_767;
const INTEGER_MAX = 2_147_483_647;
const MAX_REPORTED_ISSUES = 3;

const optionalText = z.string().nullish();

/** O PNCP manda alguns códigos como número e outros como texto. */
const integerUpTo = (max: number) =>
  z
    .union([z.number(), z.string().trim().regex(/^\d+$/)])
    .transform(Number)
    .pipe(z.number().int().min(0).max(max));

/** Valor em reais; negativo é aceito aqui e vira nulo no mapeamento, como nos editais. */
const pncpValue = z
  .union([z.number(), z.string().trim().regex(/^-?\d+(\.\d+)?$/)])
  .transform(Number)
  .pipe(z.number().gt(-MAX_VALUE).lt(MAX_VALUE))
  .nullish();

/** Data do calendário que existe (2026-02-30 não) e não é anterior a 1990. */
function isValidPncpDate(value: string): boolean {
  if (!PNCP_DATE.test(value) || value < MIN_VALID_DATE) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).toISOString().slice(0, 10) === value;
}

const pncpDate = z.string().trim().refine(isValidPncpDate, 'data fora do formato AAAA-MM-DD ou antes de 1990');
const pncpDateTime = z.string().trim().regex(PNCP_DATE_TIME, 'data e hora fora do formato do PNCP');
/** Data opcional: vazia ("") vale como não informada, e a inválida mantém a mensagem do formato. */
const optionalPncpDate = z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? null : value), pncpDate.nullish());

const contractTypeSchema = z.looseObject({ tipoContrato: z.looseObject({ id: z.unknown() }).nullish() });

const pncpContractSchema = z.looseObject({
  numeroControlePNCP: z.string().trim().min(1, 'sem número de controle').max(60),
  numeroControlePncpCompra: z.string().trim().max(60).nullish(),
  anoContrato: integerUpTo(INTEGER_MAX),
  sequencialContrato: integerUpTo(INTEGER_MAX),
  numeroContratoEmpenho: optionalText,
  processo: optionalText,
  orgaoEntidade: z.looseObject({
    cnpj: z.string().regex(/^\d{14}$/, 'CNPJ do órgão deve ter 14 dígitos'),
    razaoSocial: optionalText,
    esferaId: z.string().max(2).nullish(),
  }),
  unidadeOrgao: z
    .looseObject({
      ufSigla: z.string().regex(/^[A-Z]{2}$/, 'UF deve ter 2 letras').nullish(),
      municipioNome: optionalText,
      codigoIbge: z.string().regex(/^\d{7}$/, 'código IBGE deve ter 7 dígitos').nullish(),
      codigoUnidade: z.string().max(30).nullish(),
      nomeUnidade: optionalText,
    })
    .nullish(),
  categoriaProcesso: z.looseObject({ id: integerUpTo(SMALLINT_MAX).nullish(), nome: optionalText }).nullish(),
  objetoContrato: z.string(),
  informacaoComplementar: optionalText,
  tipoPessoa: optionalText,
  niFornecedor: optionalText,
  nomeRazaoSocialFornecedor: optionalText,
  valorInicial: pncpValue,
  valorGlobal: pncpValue,
  dataAssinatura: optionalPncpDate,
  dataVigenciaInicio: pncpDate,
  // Sem data de fim, o contrato não vence: fica de fora, contado à parte.
  dataVigenciaFim: optionalPncpDate,
  dataPublicacaoPncp: pncpDateTime,
  dataAtualizacao: z.union([z.literal(''), pncpDateTime]).nullish(),
  dataAtualizacaoGlobal: z.union([z.literal(''), pncpDateTime]).nullish(),
});

/** Texto aparado; vazio vira nulo (o PNCP manda "" em vários campos sem valor). */
function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** Valor 0 é não informado, e negativo é erro de cadastro na origem: os dois ficam nulos. */
function positiveValue(value: number | null | undefined): string | null {
  return value !== null && value !== undefined && value > 0 ? value.toFixed(2) : null;
}

function readControlNumber(raw: unknown): string | null {
  if (raw !== null && typeof raw === 'object' && 'numeroControlePNCP' in raw) {
    const value = (raw as { numeroControlePNCP: unknown }).numeroControlePNCP;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

/** Dias entre duas datas AAAA-MM-DD. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function addYears(date: string, years: number): string {
  const [year, month, day] = date.split('-');
  return `${String(Number(year) + years).padStart(4, '0')}-${month}-${day}`;
}

/** Data e hora do PNCP (Brasília, sem fuso) em milissegundos, só para comparar duas datas do PNCP. */
function pncpInstant(value: string): number {
  return Date.parse(`${value.slice(0, 19)}Z`);
}

/** Sinal de alteração no PNCP: a atualização global mais de 24 h depois da publicação. */
export function hasChangeSignal(publishedAt: string, globalUpdatedAt: string | null | undefined): boolean {
  return Boolean(globalUpdatedAt) && pncpInstant(globalUpdatedAt ?? '') - pncpInstant(publishedAt) > CHANGE_SIGNAL_MS;
}

function isSupplierPersonType(value: string): value is SupplierPersonType {
  return (SUPPLIER_PERSON_TYPES as readonly string[]).includes(value);
}

/**
 * Documento do fornecedor: CNPJ com 14 dígitos na pessoa jurídica; CPF só
 * mascarado na pessoa física (LGPD: ***.456.789-**); como veio na estrangeira.
 */
export function supplierDocument(personType: SupplierPersonType | null, document: string | null | undefined): string | null {
  const digits = (document ?? '').replace(/\D/g, '');
  if (personType === 'PF') {
    return digits.length === 11 ? `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**` : null;
  }
  if (personType === 'PJ') {
    return digits.length === 14 ? digits : null;
  }
  return cleanText(document)?.slice(0, 30) ?? null;
}

function contractTypeId(raw: unknown): number | null {
  const parsed = contractTypeSchema.safeParse(raw);
  const id = parsed.success ? Number(parsed.data.tipoContrato?.id) : Number.NaN;
  return Number.isInteger(id) ? id : null;
}

export function mapPncpContract(raw: unknown): MappedContract {
  // O tipo vem antes da validação: empenho e "Outros" ficam de fora sem contar erro.
  if (contractTypeId(raw) !== PNCP_INITIAL_CONTRACT_TYPE_ID) {
    return { ok: 'skipped', reason: 'notInitialTerm' };
  }

  const parsed = pncpContractSchema.safeParse(raw);
  if (!parsed.success) {
    const reason = parsed.error.issues
      .slice(0, MAX_REPORTED_ISSUES)
      .map((issue) => `${issue.path.join('.') || 'registro'}: ${issue.message}`)
      .join('; ');
    return { ok: false, controlNumber: readControlNumber(raw), reason };
  }

  const record = parsed.data;
  const termStart = record.dataVigenciaInicio;
  const originalTermEnd = record.dataVigenciaFim;
  if (!originalTermEnd) {
    return { ok: 'skipped', reason: 'withoutEndDate' };
  }
  if (originalTermEnd < termStart) {
    return { ok: false, controlNumber: record.numeroControlePNCP, reason: 'fim da vigência antes do início' };
  }
  if (originalTermEnd > addYears(termStart, MAX_CONTRACT_TERM_YEARS)) {
    return { ok: 'skipped', reason: 'implausibleTerm' };
  }
  if (daysBetween(termStart, originalTermEnd) < MIN_CONTRACT_TERM_DAYS) {
    return { ok: 'skipped', reason: 'shortTerm' };
  }

  const unit = record.unidadeOrgao;
  const personTypeText = cleanText(record.tipoPessoa)?.toUpperCase() ?? '';
  const personType = isSupplierPersonType(personTypeText) ? personTypeText : null;

  return {
    ok: true,
    hasChangeSignal: hasChangeSignal(record.dataPublicacaoPncp, record.dataAtualizacaoGlobal),
    row: {
      pncpControlNumber: record.numeroControlePNCP,
      purchaseControlNumber: cleanText(record.numeroControlePncpCompra),
      contractYear: record.anoContrato,
      contractSequence: record.sequencialContrato,
      contractNumber: cleanText(record.numeroContratoEmpenho),
      processNumber: cleanText(record.processo),
      agencyCnpj: record.orgaoEntidade.cnpj,
      agencyName: cleanText(record.orgaoEntidade.razaoSocial),
      governmentSphere: cleanText(record.orgaoEntidade.esferaId),
      unitCode: cleanText(unit?.codigoUnidade),
      unitName: cleanText(unit?.nomeUnidade),
      state: unit?.ufSigla ?? null,
      cityName: cleanText(unit?.municipioNome),
      cityIbgeCode: unit?.codigoIbge ?? null,
      categoryId: record.categoriaProcesso?.id ?? null,
      categoryName: cleanText(record.categoriaProcesso?.nome),
      contractObject: record.objetoContrato.trim(),
      additionalInformation: cleanText(record.informacaoComplementar),
      supplierPersonType: personType,
      supplierDocument: supplierDocument(personType, record.niFornecedor),
      supplierName: cleanText(record.nomeRazaoSocialFornecedor),
      initialValue: positiveValue(record.valorInicial),
      globalValue: positiveValue(record.valorGlobal),
      signedAt: record.dataAssinatura || null,
      termStart,
      originalTermEnd,
      // Sem termos conferidos, vale o fim original; os termos podem mudar depois.
      expiresOn: originalTermEnd,
      publishedAt: record.dataPublicacaoPncp,
      pncpUpdatedAt: record.dataAtualizacao || null,
      pncpGlobalUpdatedAt: record.dataAtualizacaoGlobal || null,
      amendments: null,
      amendmentsReference: null,
      payloadHash: payloadHash(raw),
    },
  };
}

const pncpTermSchema = z.looseObject({
  tipoTermoContratoNome: optionalText,
  numeroTermoContrato: optionalText,
  sequencialTermoContrato: integerUpTo(INTEGER_MAX).nullish(),
  dataAssinatura: optionalText,
  dataVigenciaFim: optionalText,
  qualificacaoVigencia: z.boolean().nullish(),
  valorAcrescido: pncpValue,
});

export interface ContractExpiry {
  /** Vencimento atual: o fim original ou o do termo mais recente que muda a vigência. */
  expiresOn: string;
  /** Resumo dos aditivos e rescisões, para o detalhe (sem os apostilamentos). */
  amendments: ContractTermSummary[];
  /** Termos fora do formato (inclusive data de fim que não é data), contados como erro na execução. */
  invalidTerms: string[];
  /** Termos que mudam a vigência sem a data nova: vale o vencimento anterior, e eles são contados à parte. */
  undatedTerms: number;
}

const isRescission = (type: string | null) => /rescis/i.test(type ?? '');
const isApostille = (type: string | null) => /apostil/i.test(type ?? '');

/** Data válida do termo, ou nulo (o PNCP manda data vazia em termo sem prazo). */
function termDate(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return isValidPncpDate(trimmed) ? trimmed : null;
}

/**
 * Vencimento atual pelos termos do contrato. Contam os termos que mudam a
 * vigência (aditivo com `qualificacaoVigencia` e rescisão); apostilamento e
 * termo sem mudança de prazo não contam. Vale o mais recente, pela data de
 * assinatura e depois pelo sequencial: o aditivo dá a `dataVigenciaFim`; a
 * rescisão, a `dataVigenciaFim` ou, sem ela, a data de assinatura. Termo sem
 * a data nova mantém o vencimento anterior: conta à parte quando a data veio
 * vazia e conta erro quando veio fora do formato. Sem termo assim, vale o fim
 * original.
 */
export function contractExpiryFromTerms(originalTermEnd: string, rawTerms: unknown[]): ContractExpiry {
  const invalidTerms: string[] = [];
  const amendments: ContractTermSummary[] = [];
  const malformedEnd = new Set<ContractTermSummary>();

  for (const raw of rawTerms) {
    const parsed = pncpTermSchema.safeParse(raw);
    if (!parsed.success) {
      invalidTerms.push(`termo fora do formato: ${parsed.error.issues[0]?.message ?? 'inválido'}`);
      continue;
    }
    const term = parsed.data;
    const type = cleanText(term.tipoTermoContratoNome);
    if (isApostille(type)) {
      continue;
    }
    const summary: ContractTermSummary = {
      type,
      number: cleanText(term.numeroTermoContrato),
      sequence: term.sequencialTermoContrato ?? null,
      signedAt: termDate(term.dataAssinatura),
      endDate: termDate(term.dataVigenciaFim),
      addedValue: positiveValue(term.valorAcrescido),
      changesTerm: isRescission(type) || term.qualificacaoVigencia === true,
    };
    if (summary.endDate === null && cleanText(term.dataVigenciaFim) !== null) {
      malformedEnd.add(summary);
    }
    amendments.push(summary);
  }

  amendments.sort((a, b) => (a.signedAt ?? '').localeCompare(b.signedAt ?? '') || (a.sequence ?? 0) - (b.sequence ?? 0));

  let expiresOn = originalTermEnd;
  let undatedTerms = 0;
  for (const term of amendments.filter((item) => item.changesTerm)) {
    if (malformedEnd.has(term)) {
      invalidTerms.push(`termo ${term.sequence ?? '?'}: data de fim fora do formato`);
    }
    const newEnd = isRescission(term.type) ? (term.endDate ?? term.signedAt) : term.endDate;
    if (newEnd) {
      expiresOn = newEnd;
    } else if (!malformedEnd.has(term)) {
      undatedTerms += 1;
    }
  }

  return { expiresOn, amendments, invalidTerms, undatedTerms };
}
