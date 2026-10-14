import { body, param, query, type ValidationChain } from 'express-validator';
import {
  BRAZILIAN_STATES,
  CONTRACT_CATEGORY_IDS,
  CONTRACT_SORTS,
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
export const MAX_CONTRACT_CATEGORIES = CONTRACT_CATEGORY_IDS.length;
export const MAX_SUPPLIERS = 50;
/** "Número, processo ou controle PNCP" da busca. */
export const MAX_NUMBER_LENGTH = 60;
/** Ano da compra (editais) e do contrato (contratos). */
export const MIN_PURCHASE_YEAR = 2000;
export const MAX_PURCHASE_YEAR = 2100;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Valor em reais: até 16 dígitos inteiros e 2 decimais, com ponto (numeric(18,2)). */
const MONEY_VALUE = /^\d{1,16}(\.\d{1,2})?$/;

const isState = (value: unknown) => typeof value === 'string' && (BRAZILIAN_STATES as readonly string[]).includes(value.toUpperCase());
const isMunicipalityCode = (value: unknown) => typeof value === 'string' && /^\d{7}$/.test(value);
const isCnpj = (value: unknown) => typeof value === 'string' && /^\d{14}$/.test(value);
const isModality = (value: unknown) => TENDER_MODALITY_IDS.includes(Number(value)) && /^\d+$/.test(String(value));
const isContractCategory = (value: unknown) => CONTRACT_CATEGORY_IDS.includes(Number(value)) && /^\d+$/.test(String(value));

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

/** Número, processo ou controle PNCP: texto curto com ao menos um dígito (a busca compara só os dígitos). */
function numberQuery(): ValidationChain {
  const message = `Número: até ${MAX_NUMBER_LENGTH} caracteres, com ao menos um dígito`;
  return query('number')
    .optional()
    .isString()
    .withMessage(message)
    .isLength({ max: MAX_NUMBER_LENGTH })
    .withMessage(message)
    .matches(/\d/)
    .withMessage(message);
}

function dateQueries(fields: string[]): ValidationChain[] {
  return fields.map((field) => query(field).optional().custom(isValidIsoDate).withMessage('Data inválida (use AAAA-MM-DD)'));
}

function yearQuery(field: string): ValidationChain {
  return query(field)
    .optional()
    .isInt({ min: MIN_PURCHASE_YEAR, max: MAX_PURCHASE_YEAR })
    .withMessage(`Ano inválido (de ${MIN_PURCHASE_YEAR} a ${MAX_PURCHASE_YEAR})`);
}

/** Filtros em comum das buscas de editais e de contratos. */
function sharedSearchQueryValidators(): ValidationChain[] {
  return [
    query('q').optional().isString().isLength({ max: MAX_SEARCH_TEXT_LENGTH }).withMessage(`Busca com até ${MAX_SEARCH_TEXT_LENGTH} caracteres`),
    query('termsMode').optional().isIn([...SEARCH_TERMS_MODES]).withMessage('Modo dos termos: E ou OU'),
    listQuery('state', isState, 'UF inválida', MAX_STATES, (item) => item.toUpperCase()),
    listQuery('municipalityCode', isMunicipalityCode, 'Município inválido (código IBGE com 7 dígitos)', MAX_MUNICIPALITIES),
    listQuery('agencyCnpj', isCnpj, 'CNPJ do órgão inválido (14 dígitos)', MAX_AGENCIES, (item) => item.replace(/\D/g, '')),
    query('minValue').optional().custom(isMoneyValue).withMessage('Valor mínimo inválido'),
    query('maxValue').optional().custom(isMoneyValue).withMessage('Valor máximo inválido'),
    booleanQuery('includeWithoutValue'),
    ...dateQueries(['publishedFrom', 'publishedTo']),
    booleanQuery('favoritesOnly'),
    numberQuery(),
    query('savedSearchId').optional().isInt({ min: 1 }).withMessage('Busca salva inválida'),
    ...paginationQuery(),
  ];
}

/** Filtros da busca de editais (`GET /notices`), seção 8.1 do escopo. */
export const noticeSearchValidators: ValidationChain[] = [
  ...sharedSearchQueryValidators(),
  listQuery('modality', isModality, 'Modalidade inválida', MAX_MODALITIES),
  ...dateQueries(['closingFrom', 'closingTo']),
  booleanQuery('openOnly'),
  listQuery('trackingStatus', (item) => (TRACKING_FILTERS as readonly string[]).includes(item), 'Status de acompanhamento inválido', TRACKING_FILTERS.length, (item) => item.toUpperCase()),
  booleanQuery('hideDiscarded'),
  yearQuery('purchaseYear'),
  query('sort').optional().isIn([...NOTICE_SORTS]).withMessage('Ordenação inválida'),
];

/** Filtros da busca de contratos (`GET /contracts`), plano dos contratos a vencer. */
export const contractSearchValidators: ValidationChain[] = [
  ...sharedSearchQueryValidators(),
  listQuery('category', isContractCategory, 'Categoria inválida', MAX_CONTRACT_CATEGORIES),
  listQuery('supplierCnpj', isCnpj, 'CNPJ do fornecedor inválido (14 dígitos)', MAX_SUPPLIERS, (item) => item.replace(/\D/g, '')),
  ...dateQueries(['expiryFrom', 'expiryTo']),
  yearQuery('contractYear'),
  query('sort').optional().isIn([...CONTRACT_SORTS]).withMessage('Ordenação inválida'),
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

/** Critérios em comum das buscas salvas de editais e de contratos (corpo). */
function sharedCriteriaBodyValidators(): ValidationChain[] {
  return [
    ...termsBody('terms', 'termos'),
    body('termsMode').optional().isIn([...SEARCH_TERMS_MODES]).withMessage('Modo dos termos: E ou OU'),
    ...termsBody('excludedTerms', 'termos de exclusão'),
    body('states').optional().isArray({ max: MAX_STATES }).withMessage('Lista de UFs inválida'),
    body('states.*').custom(isState).withMessage('UF inválida'),
    body('cityIbgeCodes').optional().isArray({ max: MAX_MUNICIPALITIES }).withMessage(`Até ${MAX_MUNICIPALITIES} municípios`),
    body('cityIbgeCodes.*').custom(isMunicipalityCode).withMessage('Município inválido (código IBGE com 7 dígitos)'),
    body('agencyCnpjs').optional().isArray({ max: MAX_AGENCIES }).withMessage(`Até ${MAX_AGENCIES} órgãos`),
    body('agencyCnpjs.*').custom(isCnpj).withMessage('CNPJ do órgão inválido (14 dígitos)'),
    body('minValue').optional({ values: 'null' }).custom(isMoneyValue).withMessage('Valor mínimo inválido'),
    body('maxValue').optional({ values: 'null' }).custom(isMoneyValue).withMessage('Valor máximo inválido'),
    body('includeWithoutValue').optional().isBoolean({ strict: true }).withMessage('Use true ou false'),
  ];
}

/** Nome, critérios e os botões Notificar e Ativa da busca salva (corpo de criar e alterar). */
function savedSearchBody(criteria: ValidationChain[]): ValidationChain[] {
  return [
    body('name')
      .isString()
      .trim()
      .isLength({ min: 1, max: MAX_SAVED_SEARCH_NAME_LENGTH })
      .withMessage(`Nome obrigatório, com até ${MAX_SAVED_SEARCH_NAME_LENGTH} caracteres`),
    ...criteria,
    body('notify').optional().isBoolean({ strict: true }).withMessage('Use true ou false'),
    body('active').optional().isBoolean({ strict: true }).withMessage('Use true ou false'),
  ];
}

/** Critérios da busca salva de editais (corpo), seção 8.2 do escopo. */
export const savedSearchCriteriaValidators: ValidationChain[] = [
  ...sharedCriteriaBodyValidators(),
  body('modalities').optional().isArray({ max: MAX_MODALITIES }).withMessage('Lista de modalidades inválida'),
  body('modalities.*').custom(isModality).withMessage('Modalidade inválida'),
  body('priceRegistration').optional({ values: 'null' }).isBoolean({ strict: true }).withMessage('SRP: true, false ou null'),
];

export const savedSearchBodyValidators: ValidationChain[] = savedSearchBody(savedSearchCriteriaValidators);

/** Critérios da busca salva de contratos (corpo): os de editais, trocando modalidade e SRP por categoria e fornecedor. */
export const contractSavedSearchCriteriaValidators: ValidationChain[] = [
  ...sharedCriteriaBodyValidators(),
  body('categories').optional().isArray({ max: MAX_CONTRACT_CATEGORIES }).withMessage('Lista de categorias inválida'),
  body('categories.*').custom(isContractCategory).withMessage('Categoria inválida'),
  body('supplierCnpjs').optional().isArray({ max: MAX_SUPPLIERS }).withMessage(`Até ${MAX_SUPPLIERS} fornecedores`),
  body('supplierCnpjs.*').custom(isCnpj).withMessage('CNPJ do fornecedor inválido (14 dígitos)'),
];

export const contractSavedSearchBodyValidators: ValidationChain[] = savedSearchBody(contractSavedSearchCriteriaValidators);
