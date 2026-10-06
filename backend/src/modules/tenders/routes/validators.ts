import { body, param, query, type ValidationChain } from 'express-validator';
import {
  BRAZILIAN_STATES,
  NOTICE_SORTS,
  SEARCH_TERMS_MODES,
  TENDER_MODALITY_IDS,
  TRACKING_FILTERS,
} from '../domains';
import { MAX_SAVED_SEARCH_NAME_LENGTH } from '../services/savedSearches';
import { MAX_SEARCH_TEXT_LENGTH, MAX_TERM_LENGTH, MAX_TERMS, MIN_TERM_LENGTH } from '../services/searchText';

// Validações de formato das rotas do módulo (express-validator + validate).
// As regras de negócio (ao menos um critério, mínimo ≤ máximo, limite de 50
// buscas) ficam nos serviços.

export const MAX_PER_PAGE = 100;
export const DEFAULT_PER_PAGE = 20;
export const MAX_STATES = BRAZILIAN_STATES.length;
export const MAX_MUNICIPALITIES = 100;
export const MAX_AGENCIES = 50;
export const MAX_MODALITIES = TENDER_MODALITY_IDS.length;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Valor em reais: até 16 dígitos inteiros e 2 decimais, com ponto (numeric(18,2)). */
const MONEY_VALUE = /^\d{1,16}(\.\d{1,2})?$/;

const isState = (value: unknown) => typeof value === 'string' && (BRAZILIAN_STATES as readonly string[]).includes(value.toUpperCase());
const isMunicipalityCode = (value: unknown) => typeof value === 'string' && /^\d{7}$/.test(value);
const isCnpj = (value: unknown) => typeof value === 'string' && /^\d{14}$/.test(value);
const isModality = (value: unknown) => TENDER_MODALITY_IDS.includes(Number(value)) && /^\d+$/.test(String(value));

export function isValidIsoDate(value: unknown): boolean {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isMoneyValue(value: unknown): boolean {
  const text = typeof value === 'number' ? String(value) : value;
  return typeof text === 'string' && MONEY_VALUE.test(text.trim());
}

export function idParam(name = 'id'): ValidationChain {
  return param(name).isInt({ min: 1 }).withMessage('Identificador inválido');
}

export function paginationQuery(): ValidationChain[] {
  return [
    query('page').optional().isInt({ min: 1, max: 100_000 }).withMessage('Página inválida'),
    query('perPage').optional().isInt({ min: 1, max: MAX_PER_PAGE }).withMessage(`Itens por página: de 1 a ${MAX_PER_PAGE}`),
  ];
}

function booleanQuery(field: string): ValidationChain {
  return query(field).optional().isIn(['true', 'false', '1', '0']).withMessage('Use true ou false');
}

/** Parâmetro repetível (`?x=a&x=b`) como lista de textos, conferida item a item. */
function listQuery(
  field: string,
  check: (item: string) => boolean,
  message: string,
  maxItems: number,
  normalize: (item: string) => string = (item) => item,
): ValidationChain {
  return query(field)
    .optional()
    .customSanitizer((value: unknown) =>
      (Array.isArray(value) ? value : [value]).map((item) => normalize(String(item).trim())).filter((item) => item.length > 0),
    )
    .custom((items: string[]) => items.length <= maxItems && items.every(check))
    .withMessage(message);
}

/** Filtros da busca de editais (`GET /notices`), seção 8.1 do escopo. */
export const noticeSearchValidators: ValidationChain[] = [
  query('q').optional().isString().isLength({ max: MAX_SEARCH_TEXT_LENGTH }).withMessage(`Busca com até ${MAX_SEARCH_TEXT_LENGTH} caracteres`),
  query('termsMode').optional().isIn([...SEARCH_TERMS_MODES]).withMessage('Modo dos termos: E ou OU'),
  listQuery('state', isState, 'UF inválida', MAX_STATES, (item) => item.toUpperCase()),
  listQuery('municipalityCode', isMunicipalityCode, 'Município inválido (código IBGE com 7 dígitos)', MAX_MUNICIPALITIES),
  listQuery('agencyCnpj', isCnpj, 'CNPJ do órgão inválido (14 dígitos)', MAX_AGENCIES, (item) => item.replace(/\D/g, '')),
  listQuery('modality', isModality, 'Modalidade inválida', MAX_MODALITIES),
  query('minValue').optional().custom(isMoneyValue).withMessage('Valor mínimo inválido'),
  query('maxValue').optional().custom(isMoneyValue).withMessage('Valor máximo inválido'),
  booleanQuery('includeWithoutValue'),
  ...['publishedFrom', 'publishedTo', 'closingFrom', 'closingTo'].map((field) =>
    query(field).optional().custom(isValidIsoDate).withMessage('Data inválida (use AAAA-MM-DD)'),
  ),
  booleanQuery('openOnly'),
  listQuery('trackingStatus', (item) => (TRACKING_FILTERS as readonly string[]).includes(item), 'Status de acompanhamento inválido', TRACKING_FILTERS.length, (item) => item.toUpperCase()),
  booleanQuery('hideDiscarded'),
  booleanQuery('favoritesOnly'),
  query('savedSearchId').optional().isInt({ min: 1 }).withMessage('Busca salva inválida'),
  query('sort').optional().isIn([...NOTICE_SORTS]).withMessage('Ordenação inválida'),
  ...paginationQuery(),
];

function termsBody(field: string, label: string): ValidationChain[] {
  return [
    body(field).optional().isArray({ max: MAX_TERMS }).withMessage(`Até ${MAX_TERMS} ${label}`),
    body(`${field}.*`)
      .isString()
      .trim()
      .isLength({ min: MIN_TERM_LENGTH, max: MAX_TERM_LENGTH })
      .withMessage(`Cada item de ${label} deve ter de ${MIN_TERM_LENGTH} a ${MAX_TERM_LENGTH} caracteres`),
  ];
}

/** Critérios da busca salva (corpo), seção 8.2 do escopo. */
export const savedSearchCriteriaValidators: ValidationChain[] = [
  ...termsBody('terms', 'termos'),
  body('termsMode').optional().isIn([...SEARCH_TERMS_MODES]).withMessage('Modo dos termos: E ou OU'),
  ...termsBody('excludedTerms', 'termos de exclusão'),
  body('states').optional().isArray({ max: MAX_STATES }).withMessage('Lista de UFs inválida'),
  body('states.*').custom(isState).withMessage('UF inválida'),
  body('cityIbgeCodes').optional().isArray({ max: MAX_MUNICIPALITIES }).withMessage(`Até ${MAX_MUNICIPALITIES} municípios`),
  body('cityIbgeCodes.*').custom(isMunicipalityCode).withMessage('Município inválido (código IBGE com 7 dígitos)'),
  body('agencyCnpjs').optional().isArray({ max: MAX_AGENCIES }).withMessage(`Até ${MAX_AGENCIES} órgãos`),
  body('agencyCnpjs.*').custom(isCnpj).withMessage('CNPJ do órgão inválido (14 dígitos)'),
  body('modalities').optional().isArray({ max: MAX_MODALITIES }).withMessage('Lista de modalidades inválida'),
  body('modalities.*').custom(isModality).withMessage('Modalidade inválida'),
  body('minValue').optional({ values: 'null' }).custom(isMoneyValue).withMessage('Valor mínimo inválido'),
  body('maxValue').optional({ values: 'null' }).custom(isMoneyValue).withMessage('Valor máximo inválido'),
  body('includeWithoutValue').optional().isBoolean({ strict: true }).withMessage('Use true ou false'),
  body('priceRegistration').optional({ values: 'null' }).isBoolean({ strict: true }).withMessage('SRP: true, false ou null'),
];

export const savedSearchBodyValidators: ValidationChain[] = [
  body('name')
    .isString()
    .trim()
    .isLength({ min: 1, max: MAX_SAVED_SEARCH_NAME_LENGTH })
    .withMessage(`Nome obrigatório, com até ${MAX_SAVED_SEARCH_NAME_LENGTH} caracteres`),
  ...savedSearchCriteriaValidators,
  body('notify').optional().isBoolean({ strict: true }).withMessage('Use true ou false'),
  body('active').optional().isBoolean({ strict: true }).withMessage('Use true ou false'),
];
