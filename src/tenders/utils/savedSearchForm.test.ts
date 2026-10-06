import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCurrency } from '../../screens/finance/formatters';
import type { SavedSearch } from '../types';
import {
  CRITERION_REQUIRED_MESSAGE,
  EMPTY_SAVED_SEARCH_FORM,
  LEFT_OUT_LABELS,
  VALUE_RANGE_MESSAGE,
  criteriaSummary,
  formToBody,
  previewCriteria,
  savedSearchFormSchema,
  savedSearchToForm,
  searchStateToForm,
  type SavedSearchFormValues,
} from './savedSearchForm';
import { DEFAULT_SEARCH_STATE } from './searchFilters';

const VALID_FORM: SavedSearchFormValues = { ...EMPTY_SAVED_SEARCH_FORM, name: 'TI em SP', terms: ['software'], states: ['SP'] };

function issuesOf(values: SavedSearchFormValues): Array<{ path: string; message: string }> {
  const parsed = savedSearchFormSchema.safeParse(values);
  return parsed.success ? [] : parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

test('busca salva: formulário válido passa', () => {
  assert.deepEqual(issuesOf(VALID_FORM), []);
});

test('busca salva: nome obrigatório, de 1 a 120 caracteres', () => {
  assert.deepEqual(issuesOf({ ...VALID_FORM, name: '   ' }).map((issue) => issue.path), ['name']);
  assert.deepEqual(issuesOf({ ...VALID_FORM, name: 'x'.repeat(121) }).map((issue) => issue.path), ['name']);
  assert.deepEqual(issuesOf({ ...VALID_FORM, name: 'x'.repeat(120) }), []);
});

test('busca salva: ao menos um critério além do nome', () => {
  const onlyName = { ...EMPTY_SAVED_SEARCH_FORM, name: 'Vazia' };
  assert.deepEqual(issuesOf(onlyName), [{ path: 'terms', message: CRITERION_REQUIRED_MESSAGE }]);
  assert.deepEqual(issuesOf({ ...onlyName, includeWithoutValue: true }).length, 1, '"incluir sem valor" sozinho não conta');
  assert.deepEqual(issuesOf({ ...onlyName, minValue: 0 }).length, 1, 'valor zero é campo vazio');
  assert.deepEqual(issuesOf({ ...onlyName, priceRegistration: 'yes' }), [], 'SRP conta como critério');
  assert.deepEqual(issuesOf({ ...onlyName, excludedTerms: ['obra'] }), []);
  assert.deepEqual(issuesOf({ ...onlyName, maxValue: 1000 }), []);
});

test('busca salva: mínimo não passa do máximo', () => {
  assert.deepEqual(issuesOf({ ...VALID_FORM, minValue: 500, maxValue: 100 }), [{ path: 'maxValue', message: VALUE_RANGE_MESSAGE }]);
  assert.deepEqual(issuesOf({ ...VALID_FORM, minValue: 100, maxValue: 100 }), []);
});

test('busca salva: até 30 termos e exclusões, de 2 a 80 caracteres', () => {
  const thirty = Array.from({ length: 30 }, (_, index) => `termo${index}`);
  assert.deepEqual(issuesOf({ ...VALID_FORM, terms: thirty, excludedTerms: thirty }), []);
  assert.deepEqual(issuesOf({ ...VALID_FORM, terms: [...thirty, 'mais'] }).map((issue) => issue.path), ['terms']);
  assert.deepEqual(issuesOf({ ...VALID_FORM, excludedTerms: [...thirty, 'mais'] }).map((issue) => issue.path), ['excludedTerms']);
  assert.deepEqual(issuesOf({ ...VALID_FORM, terms: ['a'] }).map((issue) => issue.path), ['terms.0']);
  assert.deepEqual(issuesOf({ ...VALID_FORM, terms: ['x'.repeat(81)] }).map((issue) => issue.path), ['terms.0']);
});

test('busca salva: UF, município, órgão e modalidade no formato da API', () => {
  const paths = issuesOf({
    ...VALID_FORM,
    states: ['São Paulo'],
    cityIbgeCodes: ['123'],
    agencyCnpjs: ['46.395.000/0001-39'],
    modalities: [0],
  }).map((issue) => issue.path);
  assert.deepEqual(paths, ['states.0', 'cityIbgeCodes.0', 'agencyCnpjs.0', 'modalities.0']);
});

test('busca salva: formulário → corpo da API', () => {
  const body = formToBody({
    ...VALID_FORM,
    name: '  TI em SP  ',
    terms: ['  licença   de uso '],
    minValue: 1500.5,
    maxValue: 0,
    includeWithoutValue: true,
    priceRegistration: 'no',
  });
  assert.deepEqual(body, {
    name: 'TI em SP',
    terms: ['licença de uso'],
    termsMode: 'OU',
    excludedTerms: [],
    states: ['SP'],
    cityIbgeCodes: [],
    agencyCnpjs: [],
    modalities: [],
    minValue: '1500.50',
    maxValue: null,
    includeWithoutValue: true,
    priceRegistration: false,
  });
  assert.equal(formToBody({ ...VALID_FORM, includeWithoutValue: true }).includeWithoutValue, false, 'sem faixa, não vai');
  assert.equal(formToBody({ ...VALID_FORM, priceRegistration: 'any' }).priceRegistration, null);
  assert.equal(formToBody({ ...VALID_FORM, priceRegistration: 'yes' }).priceRegistration, true);
});

test('busca salva: prévia só com critérios que a API aceitaria', () => {
  assert.equal(previewCriteria({ ...EMPTY_SAVED_SEARCH_FORM }), null, 'sem critério');
  assert.equal(previewCriteria({ ...VALID_FORM, minValue: 10, maxValue: 5 }), null, 'mínimo maior que o máximo');
  assert.deepEqual(previewCriteria({ ...VALID_FORM, name: '' })?.terms, ['software'], 'o nome não importa na prévia');
});

const SAVED: SavedSearch = {
  id: 3,
  name: 'Obras no RJ',
  terms: ['obra', 'reforma predial'],
  termsMode: 'E',
  excludedTerms: ['pintura'],
  states: ['RJ'],
  cityIbgeCodes: ['3304557'],
  agencyCnpjs: ['46395000000139', '00394460000141', '29979036000140'],
  modalities: [6],
  minValue: 1000,
  maxValue: null,
  includeWithoutValue: true,
  priceRegistration: true,
  notify: false,
  active: true,
  createdAt: '2026-10-05T10:00:00-03:00',
  updatedAt: '2026-10-05T10:00:00-03:00',
  openCount: 12,
};

test('busca salva: gravada → formulário de edição', () => {
  const values = savedSearchToForm(SAVED);
  assert.equal(values.priceRegistration, 'yes');
  assert.equal(values.minValue, 1000);
  assert.deepEqual(formToBody(values), {
    name: 'Obras no RJ',
    terms: ['obra', 'reforma predial'],
    termsMode: 'E',
    excludedTerms: ['pintura'],
    states: ['RJ'],
    cityIbgeCodes: ['3304557'],
    agencyCnpjs: ['46395000000139', '00394460000141', '29979036000140'],
    modalities: [6],
    minValue: '1000.00',
    maxValue: null,
    includeWithoutValue: true,
    priceRegistration: true,
  });
});

test('"Salvar esta busca": critérios entendidos e filtros em comum; o resto é avisado', () => {
  const { values, leftOut } = searchStateToForm(
    {
      ...DEFAULT_SEARCH_STATE,
      q: 'software -obra x',
      states: ['SP'],
      municipalityCodes: ['3509502'],
      agencyCnpjs: ['46395000000139'],
      modalities: [6],
      minValue: '1000.00',
      includeWithoutValue: true,
      publishedFrom: '2026-10-01',
      closingTo: '2026-10-30',
      openOnly: false,
      trackingStatuses: ['ANALISAR'],
      favoritesOnly: true,
      number: '352/2026',
      purchaseYear: 2026,
    },
    { terms: ['software'], excludedTerms: ['obra'], termsMode: 'E' },
  );
  assert.deepEqual(values, {
    ...EMPTY_SAVED_SEARCH_FORM,
    terms: ['software'],
    termsMode: 'E',
    excludedTerms: ['obra'],
    states: ['SP'],
    cityIbgeCodes: ['3509502'],
    agencyCnpjs: ['46395000000139'],
    modalities: [6],
    minValue: 1000,
    includeWithoutValue: true,
  });
  assert.deepEqual(leftOut, [
    LEFT_OUT_LABELS.published,
    LEFT_OUT_LABELS.closing,
    LEFT_OUT_LABELS.closedNotices,
    LEFT_OUT_LABELS.tracking,
    LEFT_OUT_LABELS.favorites,
    LEFT_OUT_LABELS.number,
    LEFT_OUT_LABELS.purchaseYear,
  ]);
  assert.deepEqual(searchStateToForm(DEFAULT_SEARCH_STATE, { terms: [], excludedTerms: [], termsMode: 'E' }).leftOut, []);
  assert.deepEqual(
    searchStateToForm({ ...DEFAULT_SEARCH_STATE, hideDiscarded: false }, { terms: [], excludedTerms: [], termsMode: 'E' }).leftOut,
    [LEFT_OUT_LABELS.tracking],
    'mostrar descartados também é filtro de acompanhamento',
  );
});

test('busca salva: resumo dos critérios para o card', () => {
  const lines = criteriaSummary(SAVED, {
    municipalityName: (code) => (code === '3304557' ? 'Rio de Janeiro/RJ' : undefined),
    modalityName: (id) => (id === 6 ? 'Pregão – Eletrônico' : undefined),
  });
  assert.deepEqual(lines, [
    'Termos: "obra", "reforma predial" (todas as palavras)',
    'Exceto: "pintura"',
    'UF: RJ',
    'Município: Rio de Janeiro/RJ',
    'Órgãos: 46.395.000/0001-39, 00.394.460/0001-41 +1',
    'Modalidade: Pregão – Eletrônico',
    `Valor: a partir de ${formatCurrency(1000)}, inclui sem valor`,
    'Só registro de preços (SRP)',
  ]);
  assert.deepEqual(criteriaSummary({ ...SAVED, terms: ['obra'], excludedTerms: [], cityIbgeCodes: [], agencyCnpjs: [], modalities: [], minValue: null, priceRegistration: false }), [
    'Termos: "obra"',
    'UF: RJ',
    'Sem registro de preços (SRP)',
  ]);
});
