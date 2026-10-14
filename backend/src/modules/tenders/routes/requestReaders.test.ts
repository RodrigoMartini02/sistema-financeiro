import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../../../utils/requestInput';
import {
  readContractSavedSearchCriteria,
  readContractSavedSearchInput,
  readContractSearchRequest,
  readNoticeSearchRequest,
  readSavedSearchCriteria,
  readSavedSearchInput,
} from './requestReaders';

test('busca sem parâmetros: só abertos, oculta descartados, prazo mais próximo, 20 por página, modo E', () => {
  const { filters, savedSearchId } = readNoticeSearchRequest({});
  assert.equal(savedSearchId, null);
  assert.equal(filters.openOnly, true);
  assert.equal(filters.hideDiscarded, true);
  assert.equal(filters.sort, 'closingAsc');
  assert.equal(filters.page, 1);
  assert.equal(filters.perPage, 20);
  assert.equal(filters.criteria.termsMode, 'E');
  assert.equal(filters.criteria.includeWithoutValue, false);
  assert.equal(filters.criteria.priceRegistration, null);
});

test('busca com todos os filtros', () => {
  const { filters, savedSearchId } = readNoticeSearchRequest({
    q: 'software -impressora',
    termsMode: 'OU',
    state: ['ma', 'PI', 'MA'],
    municipalityCode: '2111300',
    agencyCnpj: ['06.307.102/0001-30'],
    modality: ['6', '8'],
    minValue: '1000',
    maxValue: '5000.50',
    includeWithoutValue: 'true',
    publishedFrom: '2026-10-01',
    publishedTo: '2026-10-05',
    openOnly: 'false',
    trackingStatus: ['analisar', 'SEM'],
    hideDiscarded: '0',
    savedSearchId: '12',
    sort: 'valueDesc',
    page: '2',
    perPage: '50',
  });
  assert.equal(savedSearchId, 12);
  assert.deepEqual(filters.criteria, {
    terms: ['software'],
    termsMode: 'OU',
    excludedTerms: ['impressora'],
    states: ['MA', 'PI'],
    cityIbgeCodes: ['2111300'],
    agencyCnpjs: ['06307102000130'],
    modalities: [6, 8],
    minValue: '1000',
    maxValue: '5000.50',
    includeWithoutValue: true,
    priceRegistration: null,
  });
  assert.equal(filters.publishedFrom, '2026-10-01');
  assert.equal(filters.openOnly, false);
  assert.deepEqual(filters.trackingStatuses, ['ANALISAR', 'SEM']);
  assert.equal(filters.hideDiscarded, false);
  assert.equal(filters.sort, 'valueDesc');
  assert.equal(filters.page, 2);
  assert.equal(filters.perPage, 50);
});

test('mínimo maior que o máximo e período invertido recusam a busca', () => {
  assert.throws(() => readNoticeSearchRequest({ minValue: '200', maxValue: '100' }), RequestInputError);
  assert.throws(() => readNoticeSearchRequest({ closingFrom: '2026-10-10', closingTo: '2026-10-01' }), RequestInputError);
});

test('busca salva: modo OU por padrão, termos normalizados, valor numérico vira texto decimal', () => {
  const criteria = readSavedSearchCriteria({
    terms: ['  gestão   tributária ', 'Gestão tributária', 'ISS'],
    states: ['ma'],
    minValue: 1500.5,
    maxValue: null,
    priceRegistration: false,
  });
  assert.equal(criteria.termsMode, 'OU');
  assert.deepEqual(criteria.terms, ['gestão tributária', 'ISS']);
  assert.deepEqual(criteria.states, ['MA']);
  assert.equal(criteria.minValue, '1500.50');
  assert.equal(criteria.maxValue, null);
  assert.equal(criteria.priceRegistration, false);
  assert.equal(criteria.includeWithoutValue, false);
});

test('notify e active ausentes ficam de fora (padrão na criação, mantidos na alteração)', () => {
  const input = readSavedSearchInput({ name: ' Saúde ', terms: ['saúde'] });
  assert.equal(input.name, 'Saúde');
  assert.equal('notify' in input, false);
  assert.equal('active' in input, false);
  const withFlags = readSavedSearchInput({ name: 'Saúde', terms: ['saúde'], notify: false, active: true });
  assert.equal(withFlags.notify, false);
  assert.equal(withFlags.active, true);
});

test('contratos sem parâmetros: só vigentes (sem "só favoritos"), vencimento mais próximo, 20 por página, modo E', () => {
  const { filters, savedSearchId } = readContractSearchRequest({});
  assert.equal(savedSearchId, null);
  assert.equal(filters.favoritesOnly, false);
  assert.equal(filters.sort, 'expiryAsc');
  assert.equal(filters.page, 1);
  assert.equal(filters.perPage, 20);
  assert.equal(filters.criteria.termsMode, 'E');
  assert.deepEqual(filters.numberGroups, []);
  assert.equal(filters.contractYear, null);
});

test('contratos com todos os filtros', () => {
  const { filters, savedSearchId } = readContractSearchRequest({
    q: 'limpeza -hospitalar',
    termsMode: 'OU',
    state: ['sp', 'SP'],
    municipalityCode: '3550308',
    agencyCnpj: '46.395.000/0001-39',
    category: ['8', '2', '8'],
    supplierCnpj: ['12.345.678/0001-95'],
    minValue: '1000',
    maxValue: '5000.50',
    includeWithoutValue: 'true',
    publishedFrom: '2026-09-01',
    publishedTo: '2026-09-30',
    expiryFrom: '2026-10-14',
    expiryTo: '2027-01-12',
    favoritesOnly: 'true',
    number: 'Contrato 015/2026',
    contractYear: '2026',
    savedSearchId: '4',
    sort: 'valueDesc',
    page: '2',
    perPage: '50',
  });
  assert.equal(savedSearchId, 4);
  assert.deepEqual(filters.criteria.terms, ['limpeza']);
  assert.deepEqual(filters.criteria.excludedTerms, ['hospitalar']);
  assert.equal(filters.criteria.termsMode, 'OU');
  assert.deepEqual(filters.criteria.states, ['SP']);
  assert.deepEqual(filters.criteria.agencyCnpjs, ['46395000000139']);
  assert.deepEqual(filters.criteria.categories, [8, 2]);
  assert.deepEqual(filters.criteria.supplierCnpjs, ['12345678000195']);
  assert.equal(filters.criteria.minValue, '1000');
  assert.equal(filters.criteria.includeWithoutValue, true);
  assert.equal(filters.expiryFrom, '2026-10-14');
  assert.equal(filters.expiryTo, '2027-01-12');
  assert.equal(filters.favoritesOnly, true);
  assert.deepEqual(filters.numberGroups, ['15', '2026']);
  assert.equal(filters.contractYear, 2026);
  assert.equal(filters.sort, 'valueDesc');
  assert.equal(filters.page, 2);
  assert.equal(filters.perPage, 50);
});

test('contratos: período de vencimento invertido e mínimo maior que o máximo dão erro de pedido', () => {
  assert.throws(() => readContractSearchRequest({ expiryFrom: '2027-01-01', expiryTo: '2026-12-31' }), RequestInputError);
  assert.throws(() => readContractSearchRequest({ minValue: '10', maxValue: '5' }), RequestInputError);
});

test('busca salva de contratos: corpo com categoria e fornecedor, modo OU por padrão', () => {
  const criteria = readContractSavedSearchCriteria({ terms: ['  limpeza  urbana '], categories: ['8', '8'], supplierCnpjs: ['12345678000195'] });
  assert.deepEqual(criteria.terms, ['limpeza urbana']);
  assert.equal(criteria.termsMode, 'OU');
  assert.deepEqual(criteria.categories, [8]);
  assert.deepEqual(criteria.supplierCnpjs, ['12345678000195']);
  const input = readContractSavedSearchInput({ name: ' Limpeza ', terms: ['limpeza'], notify: false });
  assert.equal(input.name, 'Limpeza');
  assert.equal(input.notify, false);
  assert.equal('active' in input, false);
});
