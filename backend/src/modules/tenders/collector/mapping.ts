import { createHash } from 'node:crypto';
import { z } from 'zod/v4';
import type { NewTenderNotice } from '../db/schema';

// Registro de contratação do PNCP → linha de licitacoes.edital. O PNCP é dado
// externo: tudo é validado, e um registro inválido vira erro contado na
// execução, sem derrubar a página. Os limites seguem as colunas da 0073, para
// que nenhum valor quebre o upsert da página inteira.

export type TenderNoticeRow = Omit<NewTenderNotice, 'id' | 'firstCollectedAt' | 'lastCollectedAt'>;

export type MappedRecord =
  | { ok: true; row: TenderNoticeRow }
  | { ok: false; controlNumber: string | null; reason: string };

const PNCP_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?$/;
// NUMERIC(18,2): até 16 dígitos inteiros.
const MAX_ESTIMATED_VALUE = 1e16;
const SMALLINT_MAX = 32_767;
const INTEGER_MAX = 2_147_483_647;
const MAX_REPORTED_ISSUES = 3;

const optionalText = z.string().nullish();

/** O PNCP manda alguns códigos como número e outros como texto (a situação, por exemplo). */
const integerUpTo = (max: number) =>
  z
    .union([z.number(), z.string().trim().regex(/^\d+$/)])
    .transform(Number)
    .pipe(z.number().int().min(0).max(max))
    .nullish();

const pncpDateTime = z.union([z.literal(''), z.string().regex(PNCP_DATE_TIME, 'data e hora fora do formato do PNCP')]).nullish();

const pncpRecordSchema = z.looseObject({
  numeroControlePNCP: z.string().trim().min(1).max(60),
  orgaoEntidade: z
    .looseObject({
      cnpj: z.string().regex(/^\d{14}$/, 'CNPJ do órgão deve ter 14 dígitos').nullish(),
      razaoSocial: optionalText,
      esferaId: z.string().max(2).nullish(),
    })
    .nullish(),
  unidadeOrgao: z
    .looseObject({
      ufSigla: z.string().regex(/^[A-Z]{2}$/, 'UF deve ter 2 letras').nullish(),
      municipioNome: optionalText,
      codigoIbge: z.string().regex(/^\d{7}$/, 'código IBGE deve ter 7 dígitos').nullish(),
      codigoUnidade: z.string().max(30).nullish(),
      nomeUnidade: optionalText,
    })
    .nullish(),
  modalidadeId: integerUpTo(SMALLINT_MAX),
  modalidadeNome: optionalText,
  modoDisputaId: integerUpTo(SMALLINT_MAX),
  modoDisputaNome: optionalText,
  situacaoCompraId: integerUpTo(SMALLINT_MAX),
  situacaoCompraNome: optionalText,
  anoCompra: integerUpTo(INTEGER_MAX),
  sequencialCompra: integerUpTo(INTEGER_MAX),
  numeroCompra: optionalText,
  processo: optionalText,
  objetoCompra: z.string(),
  informacaoComplementar: optionalText,
  srp: z.boolean().nullish(),
  valorTotalEstimado: z
    .union([z.number(), z.string().trim().regex(/^\d+(\.\d+)?$/)])
    .transform(Number)
    .pipe(z.number().min(0).lt(MAX_ESTIMATED_VALUE))
    .nullish(),
  dataPublicacaoPncp: pncpDateTime,
  dataAberturaProposta: pncpDateTime,
  dataEncerramentoProposta: pncpDateTime,
  dataAtualizacao: pncpDateTime,
  linkSistemaOrigem: optionalText,
});

/** Texto aparado; vazio vira nulo (o PNCP manda "" em vários campos sem valor). */
function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** JSON com as chaves em ordem: o mesmo registro gera o mesmo hash, qualquer que seja a ordem recebida. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function payloadHash(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function readControlNumber(raw: unknown): string | null {
  if (raw !== null && typeof raw === 'object' && 'numeroControlePNCP' in raw) {
    const value = (raw as { numeroControlePNCP: unknown }).numeroControlePNCP;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

export function mapPncpRecord(raw: unknown): MappedRecord {
  const parsed = pncpRecordSchema.safeParse(raw);
  if (!parsed.success) {
    const reason = parsed.error.issues
      .slice(0, MAX_REPORTED_ISSUES)
      .map((issue) => `${issue.path.join('.') || 'registro'}: ${issue.message}`)
      .join('; ');
    return { ok: false, controlNumber: readControlNumber(raw), reason };
  }

  const record = parsed.data;
  const agency = record.orgaoEntidade;
  const unit = record.unidadeOrgao;
  const agencyCnpj = agency?.cnpj ?? null;
  const purchaseYear = record.anoCompra ?? null;
  const purchaseSequence = record.sequencialCompra ?? null;
  // Valor 0 é orçamento sigiloso ou não informado: fica nulo, e o filtro de valor o deixa de fora.
  const estimatedValue = record.valorTotalEstimado ?? 0;

  return {
    ok: true,
    row: {
      pncpControlNumber: record.numeroControlePNCP,
      agencyCnpj,
      agencyName: cleanText(agency?.razaoSocial),
      governmentSphere: cleanText(agency?.esferaId),
      unitCode: cleanText(unit?.codigoUnidade),
      unitName: cleanText(unit?.nomeUnidade),
      state: unit?.ufSigla ?? null,
      cityName: cleanText(unit?.municipioNome),
      cityIbgeCode: unit?.codigoIbge ?? null,
      modalityId: record.modalidadeId ?? null,
      modalityName: cleanText(record.modalidadeNome),
      disputeModeId: record.modoDisputaId ?? null,
      disputeModeName: cleanText(record.modoDisputaNome),
      situationId: record.situacaoCompraId ?? null,
      situationName: cleanText(record.situacaoCompraNome),
      purchaseYear,
      purchaseSequence,
      purchaseNumber: cleanText(record.numeroCompra),
      processNumber: cleanText(record.processo),
      procurementObject: record.objetoCompra.trim(),
      additionalInformation: cleanText(record.informacaoComplementar),
      isPriceRegistration: record.srp ?? null,
      estimatedTotalValue: estimatedValue > 0 ? estimatedValue.toFixed(2) : null,
      publishedAt: cleanText(record.dataPublicacaoPncp),
      proposalOpensAt: cleanText(record.dataAberturaProposta),
      proposalClosesAt: cleanText(record.dataEncerramentoProposta),
      pncpUpdatedAt: cleanText(record.dataAtualizacao),
      sourceSystemLink: cleanText(record.linkSistemaOrigem),
      pncpLink:
        agencyCnpj && purchaseYear !== null && purchaseSequence !== null
          ? `https://pncp.gov.br/app/editais/${agencyCnpj}/${purchaseYear}/${purchaseSequence}`
          : null,
      payload: raw,
      payloadHash: payloadHash(raw),
    },
  };
}
