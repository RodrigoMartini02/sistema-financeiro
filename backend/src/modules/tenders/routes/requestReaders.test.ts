import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../../../utils/requestInput';
import { readNoticeSearchRequest, readSavedSearchCriteria, readSavedSearchInput } from './requestReaders';

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
