import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContractSavedSearch } from '../types';
import { DEFAULT_CONTRACT_SEARCH_STATE } from './contractFilters';
import {
  CONTRACT_LEFT_OUT_LABELS,
  EMPTY_CONTRACT_SEARCH_FORM,
  contractCriteriaSummary,
  contractFormToBody,
  contractPreviewCriteria,
  contractSavedSearchToForm,
  contractSearchFormSchema,
  contractStateToForm,
  type ContractSearchFormValues,
} from './contractSearchForm';
import { CRITERION_REQUIRED_MESSAGE, VALUE_RANGE_MESSAGE } from './savedSearchForm';

const VALID_FORM: ContractSearchFormValues = { ...EMPTY_CONTRACT_SEARCH_FORM, name: 'Limpeza em SP', terms: ['limpeza'], states: ['SP'] };

function messagesOf(values: ContractSearchFormValues): string[] {
  const parsed = contractSearchFormSchema.safeParse(values);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}

test('busca salva de contratos: formulário válido passa; sem critério e com mínimo > máximo, não', () => {
  assert.deepEqual(messagesOf(VALID_FORM), []);
  assert.deepEqual(messagesOf({ ...EMPTY_CONTRACT_SEARCH_FORM, name: 'Vazia' }), [CRITERION_REQUIRED_MESSAGE]);
  assert.deepEqual(messagesOf({ ...VALID_FORM, minValue: 500, maxValue: 100 }), [VALUE_RANGE_MESSAGE]);
});

test('busca salva de contratos: categoria e fornecedor contam como critério', () => {
  assert.deepEqual(messagesOf({ ...EMPTY_CONTRACT_SEARCH_FORM, name: 'Serviços', categories: [8] }), []);
  assert.deepEqual(messagesOf({ ...EMPTY_CONTRACT_SEARCH_FORM, name: 'Fornecedor', supplierCnpjs: ['12345678000195'] }), []);
  assert.ok(messagesOf({ ...EMPTY_CONTRACT_SEARCH_FORM, name: 'CNPJ curto', supplierCnpjs: ['123'] }).length > 0);
});

test('busca salva de contratos: formulário → corpo da API, com "incluir sem valor" só com faixa', () => {
  assert.deepEqual(contractFormToBody({ ...VALID_FORM, terms: ['  coleta   de lixo '], includeWithoutValue: true }), {
    name: 'Limpeza em SP',
    terms: ['coleta de lixo'],
    termsMode: 'OU',
    excludedTerms: [],
    states: ['SP'],
    cityIbgeCodes: [],
    agencyCnpjs: [],
    categories: [],
    supplierCnpjs: [],
    minValue: null,
    maxValue: null,
    includeWithoutValue: false,
  });
  assert.equal(contractFormToBody({ ...VALID_FORM, minValue: 1000, includeWithoutValue: true }).includeWithoutValue, true);
  assert.equal(contractPreviewCriteria({ ...EMPTY_CONTRACT_SEARCH_FORM }), null, 'sem critério, sem prévia');
  assert.notEqual(contractPreviewCriteria({ ...VALID_FORM, name: '' }), null, 'a prévia não exige o nome');
});

test('busca salva de contratos: "Salvar esta busca" leva os critérios e avisa o que fica de fora', () => {
  const { values, leftOut } = contractStateToForm(
    {
      ...DEFAULT_CONTRACT_SEARCH_STATE,
      q: 'limpeza -hospitalar',
      categories: [8],
      supplierCnpjs: ['12345678000195'],
      minValue: '1000.00',
      expiryTo: '2027-01-12',
      favoritesOnly: true,
      number: '15',
      contractYear: 2026,
    },
    { terms: ['limpeza'], excludedTerms: ['hospitalar'], termsMode: 'E' },
  );
  assert.deepEqual(values.terms, ['limpeza']);
  assert.deepEqual(values.excludedTerms, ['hospitalar']);
  assert.equal(values.termsMode, 'E');
  assert.deepEqual(values.categories, [8]);
  assert.deepEqual(values.supplierCnpjs, ['12345678000195']);
  assert.equal(values.minValue, 1000);
  assert.deepEqual(leftOut, [
    CONTRACT_LEFT_OUT_LABELS.expiry,
    CONTRACT_LEFT_OUT_LABELS.favorites,
    CONTRACT_LEFT_OUT_LABELS.number,
    CONTRACT_LEFT_OUT_LABELS.contractYear,
  ]);
});

test('busca salva de contratos: gravada → formulário, e o resumo do card', () => {
  const search: ContractSavedSearch = {
    id: 1,
    name: 'Limpeza',
    terms: ['limpeza'],
    termsMode: 'OU',
    excludedTerms: [],
    states: ['SP'],
    cityIbgeCodes: [],
    agencyCnpjs: [],
    categories: [8],
    supplierCnpjs: ['12345678000195'],
    minValue: 1000,
    maxValue: null,
    includeWithoutValue: false,
    notify: true,
    active: true,
    createdAt: null,
    updatedAt: null,
    activeCount: 12,
    countedAt: '2026-10-19T06:30:00-03:00',
  };
  assert.equal(contractSavedSearchToForm(search).supplierCnpjs[0], '12345678000195');
  const summary = contractCriteriaSummary(search, { categoryName: () => 'Serviços' });
  assert.deepEqual(summary.slice(0, 2), ['Termos: "limpeza"', 'UF: SP']);
  assert.ok(summary.includes('Categoria: Serviços'));
  assert.ok(summary.includes('Fornecedor: 12.345.678/0001-95'));
  assert.ok(summary.some((line) => line.startsWith('Valor: a partir de')));
});
