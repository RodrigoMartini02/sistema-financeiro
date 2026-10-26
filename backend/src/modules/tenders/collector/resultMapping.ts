import { z } from 'zod/v4';
import { PURCHASE_CONTROL_NUMBER } from '../contractStore/layout';
import { supplierKeyOf, type ResultRecord, type ResultSituation, type SupplierIdentity } from '../contractStore/winnerRows';
import { SUPPLIER_PERSON_TYPES, type SupplierPersonType } from '../domains';
import { cleanText, isValidPncpDate, supplierDocument } from './contractMapping';

// Resultado de um item da licitação (Compras.gov.br, Lei 14.133) → ResultRecord da agregação dos vencedores (plano
// .plans/licitacoes-vencedores.md). A fonte é dado externo: tudo é validado, e um registro inválido vira erro contado
// na execução, sem derrubar a página. Os nomes dos campos são os da sondagem real (`winners-probe`, 25/10/2026), e
// o fixture de teste sai dela (fixtures/comprasgov-resultados.json).
//
// Quem é vencedor: situação 1 (informado) sem data de cancelamento. Situação 2 ou data de cancelamento é resultado
// cancelado; a 3 (cadastro de reserva) e qualquer outra não vencem. Nenhuma delas vira vitória, mas cada uma tira o
// item da linha se ele estava lá (o resultado foi trocado ou cancelado).

/** Situação do resultado do item na fonte (`situacaoCompraItemResultadoId`). */
export const RESULT_SITUATION_ID = { informed: 1, cancelled: 2, reserve: 3 } as const;

const INTEGER_MAX = 2_147_483_647;
/** Acima disso, o valor de um item é erro de cadastro na origem: o registro é recusado. */
const MAX_ITEM_VALUE = 1e13;
const MAX_REPORTED_ISSUES = 3;
const UPDATED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const RESULT_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}(?:$|[T ])/;
const UF_PATTERN = /^[A-Z]{2}$/;
const UPDATED_AT_LENGTH = 19;
const MAX_UNIT_CODE_LENGTH = 30;

const optionalText = z.string().nullish();
/** A fonte manda alguns códigos e documentos como texto e outros como número. */
const textOrNumber = z.union([z.string(), z.number()]).nullish();

const wholeNumber = z
  .union([z.number(), z.string().trim().regex(/^\d+$/)])
  .transform(Number)
  .pipe(z.number().int().min(0).max(INTEGER_MAX));

/** Valor em reais; zero e negativo são aceitos aqui e viram "sem valor" no mapeamento. */
const money = z
  .union([z.number(), z.string().trim().regex(/^-?\d+(\.\d+)?$/)])
  .transform(Number)
  .pipe(z.number().max(MAX_ITEM_VALUE, 'valor do item acima do limite'))
  .nullish();

function isResultDate(value: string): boolean {
  return RESULT_DATE_PREFIX.test(value) && isValidPncpDate(value.slice(0, 10));
}

const resultSchema = z.looseObject({
  idContratacaoPNCP: z.string().trim().max(60).nullish(),
  numeroControlePNCPCompra: z.string().trim().max(60).nullish(),
  numeroItemPncp: wholeNumber,
  sequencialResultado: wholeNumber.nullish(),
  situacaoCompraItemResultadoId: wholeNumber.nullish(),
  niFornecedor: textOrNumber,
  tipoPessoa: optionalText,
  nomeRazaoSocialFornecedor: optionalText,
  porteFornecedorNome: optionalText,
  valorTotalHomologado: money,
  dataResultadoPncp: z.string().trim().refine(isResultDate, 'data do resultado fora do formato AAAA-MM-DD ou antes de 1990'),
  dataAtualizacaoPncp: optionalText,
  dataCancelamentoPncp: optionalText,
  unidadeOrgaoCodigoUnidade: textOrNumber,
  unidadeOrgaoUfSigla: optionalText,
  ordemClassificacaoSrp: wholeNumber.nullish(),
});

export type MappedResult =
  | { ok: true; record: ResultRecord }
  | { ok: false; /** Número de controle da compra, quando o registro o trouxe. */ purchase: string | null; reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function isPersonType(value: string): value is SupplierPersonType {
  return (SUPPLIER_PERSON_TYPES as readonly string[]).includes(value);
}

function readPurchase(raw: unknown): string | null {
  if (!isRecord(raw)) {
    return null;
  }
  const value = raw['idContratacaoPNCP'] ?? raw['numeroControlePNCPCompra'];
  return typeof value === 'string' ? value : null;
}

/**
 * A identidade de uma linha da fonte: licitação, item e sequência do resultado. Cada linha tem a sua, e o
 * `totalRegistros` que a fonte informa conta essas linhas (medido em 25/10/2026: 80.046 linhas em 11 dias, todas com
 * identidade diferente). Serve para saber se uma leitura trouxe todas, e é lida do registro como veio, sem depender de
 * ele ser válido. Null quando o registro não traz a licitação ou o item: ele não tem identidade, e não se repete.
 */
export function sourceRowKey(raw: unknown): string | null {
  const purchase = readPurchase(raw);
  if (purchase === null || !isRecord(raw)) {
    return null;
  }
  const item = raw['numeroItemPncp'];
  if (typeof item !== 'number' && typeof item !== 'string') {
    return null;
  }
  return `${purchase}|${String(item).trim()}|${String(raw['sequencialResultado'] ?? 1).trim()}`;
}

/**
 * Identidade do fornecedor. O tipo de pessoa que faltar sai dos dígitos (14 é PJ, 11 é PF) antes de chamar
 * `supplierDocument`, que sem o tipo devolveria o texto como veio. Documento de 11 dígitos é CPF qualquer que seja o
 * tipo declarado, e sai sempre mascarado: o CPF inteiro nunca é derivado nem guardado.
 */
export function resolveSupplier(
  personTypeText: string | null | undefined,
  documentText: string | null,
  name: string | null,
  size: string | null,
): SupplierIdentity {
  const digits = (documentText ?? '').replace(/\D/g, '');
  const declared = cleanText(personTypeText)?.toUpperCase() ?? '';
  let personType: SupplierPersonType | null = isPersonType(declared) ? declared : null;
  if (personType === null) {
    if (digits.length === 14) {
      personType = 'PJ';
    } else if (digits.length === 11) {
      personType = 'PF';
    }
  }
  const document = personType !== 'PJ' && digits.length === 11 ? supplierDocument('PF', documentText) : supplierDocument(personType, documentText);
  return { key: supplierKeyOf(personType, document, name), personType, document, name, size };
}

/**
 * O registro como veio, com o CPF mascarado, para o arquivo bruto (decisão 4 do plano: o bruto não guarda CPF
 * inteiro). Documento de 11 dígitos nunca é de empresa. O resto do registro vai como está.
 */
export function maskPersonDocument(raw: unknown): unknown {
  if (!isRecord(raw)) {
    return raw;
  }
  const document = raw['niFornecedor'];
  if (typeof document !== 'string' && typeof document !== 'number') {
    return raw;
  }
  const digits = String(document).replace(/\D/g, '');
  if (digits.length !== 11) {
    return raw;
  }
  return { ...raw, niFornecedor: `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**` };
}

function situationOf(situationId: number | null, cancelledOn: string | null): ResultSituation {
  if (situationId === RESULT_SITUATION_ID.cancelled || cancelledOn !== null) {
    return 'cancelled';
  }
  if (situationId === RESULT_SITUATION_ID.informed) {
    return 'winner';
  }
  if (situationId === RESULT_SITUATION_ID.reserve) {
    return 'reserve';
  }
  return 'other';
}

/** Valor do item em centavos; zero, negativo e ausente são "sem valor" (contam como 0 nos totais). */
function valueInCents(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !(value > 0)) {
    return null;
  }
  const cents = Math.round(value * 100);
  return cents > 0 ? cents : null;
}

export function mapResult(raw: unknown): MappedResult {
  const parsed = resultSchema.safeParse(raw);
  if (!parsed.success) {
    const reason = parsed.error.issues
      .slice(0, MAX_REPORTED_ISSUES)
      .map((issue) => `${issue.path.join('.') || 'registro'}: ${issue.message}`)
      .join('; ');
    return { ok: false, purchase: readPurchase(raw), reason };
  }

  const data = parsed.data;
  const purchase = cleanText(data.idContratacaoPNCP) ?? cleanText(data.numeroControlePNCPCompra);
  if (purchase === null || !PURCHASE_CONTROL_NUMBER.test(purchase)) {
    return { ok: false, purchase, reason: 'número de controle da compra ausente ou fora do formato' };
  }

  const cancelledText = cleanText(data.dataCancelamentoPncp);
  const cancelledDay = cancelledText?.slice(0, 10) ?? null;
  const cancelledOn = cancelledDay !== null && isValidPncpDate(cancelledDay) ? cancelledDay : null;
  const updatedText = cleanText(data.dataAtualizacaoPncp) ?? '';
  const documentText = data.niFornecedor === null || data.niFornecedor === undefined ? null : String(data.niFornecedor);
  const state = cleanText(data.unidadeOrgaoUfSigla)?.toUpperCase() ?? null;

  return {
    ok: true,
    record: {
      purchaseControlNumber: purchase,
      itemNumber: data.numeroItemPncp,
      sequence: data.sequencialResultado ?? 1,
      situation: situationOf(data.situacaoCompraItemResultadoId ?? null, cancelledText),
      supplier: resolveSupplier(data.tipoPessoa, documentText, cleanText(data.nomeRazaoSocialFornecedor), cleanText(data.porteFornecedorNome)),
      valueCents: valueInCents(data.valorTotalHomologado),
      resultDate: data.dataResultadoPncp.slice(0, 10),
      updatedAt: UPDATED_AT.test(updatedText) ? updatedText.slice(0, UPDATED_AT_LENGTH) : '',
      unitCode: data.unidadeOrgaoCodigoUnidade === null || data.unidadeOrgaoCodigoUnidade === undefined ? null : cleanText(String(data.unidadeOrgaoCodigoUnidade))?.slice(0, MAX_UNIT_CODE_LENGTH) ?? null,
      state: state !== null && UF_PATTERN.test(state) ? state : null,
      rank: data.ordemClassificacaoSrp ?? null,
      cancelledOn,
    },
  };
}
