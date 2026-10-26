import assert from 'node:assert/strict';
import test from 'node:test';
import { parseContractSearchParams } from './contractFilters';
import {
  CNPJ_LIST_SIZE,
  cnpjContractsApiQuery,
  cnpjContractsPath,
  cnpjCoverageNotes,
  cnpjNoticesApiQuery,
  cnpjNoticesPath,
  cnpjTabFor,
  purchaseLabel,
  resultPeriodLabel,
} from './cnpjPage';
import { parseSearchParams } from './searchFilters';

const CNPJ = '22493902000140';
const some = { contracts: { total: 1, active: 0, totalValue: 0, firstPublishedAt: null, lastPublishedAt: null } };

test('aba: a da URL quando é válida; senão a que tem dado, com o fornecedor primeiro', () => {
  const supplier = { ...some, winners: { purchases: 0, items: 0, totalValue: 0, firstResultDate: null, lastResultDate: null, byYear: [] }, topAgencies: [] };
  const agency = { ...some, openNotices: 0, topSuppliers: [] };
  assert.equal(cnpjTabFor('orgao', { supplier, agency: null }), 'orgao', 'a URL manda');
  assert.equal(cnpjTabFor('fornecedor', { supplier: null, agency }), 'fornecedor');
  assert.equal(cnpjTabFor(null, { supplier, agency }), 'fornecedor', 'os dois: o fornecedor');
  assert.equal(cnpjTabFor(null, { supplier: null, agency }), 'orgao', 'só órgão');
  assert.equal(cnpjTabFor('qualquer', { supplier: null, agency }), 'orgao', 'valor inválido na URL: escolhe pelo dado');
  assert.equal(cnpjTabFor(null, { supplier: null, agency: null }), 'fornecedor', 'sem dado nenhum: a primeira aba');
});

test('lista curta de contratos: o CNPJ no papel da aba, com os encerrados, a publicação mais recente e 10 itens', () => {
  const supplier = new URLSearchParams(cnpjContractsApiQuery('fornecedor', CNPJ));
  assert.deepEqual(supplier.getAll('supplierCnpj'), [CNPJ]);
  assert.equal(supplier.has('agencyCnpj'), false);
  assert.equal(supplier.get('includeClosed'), 'true');
  assert.equal(supplier.get('sort'), 'publishedDesc');
  assert.equal(supplier.get('perPage'), String(CNPJ_LIST_SIZE));

  const agency = new URLSearchParams(cnpjContractsApiQuery('orgao', CNPJ));
  assert.deepEqual(agency.getAll('agencyCnpj'), [CNPJ]);
  assert.equal(agency.has('supplierCnpj'), false);
});

test('"Ver todos" os contratos: a tela já filtrada pelo CNPJ, com os encerrados, e o que ela lê de volta', () => {
  assert.equal(cnpjContractsPath('fornecedor', CNPJ), `/contratos?fornecedor=${CNPJ}&encerrados=1`);
  assert.equal(cnpjContractsPath('orgao', CNPJ), `/contratos?orgao=${CNPJ}&encerrados=1`);
  const state = parseContractSearchParams(new URLSearchParams(cnpjContractsPath('fornecedor', CNPJ).split('?')[1]));
  assert.deepEqual(state.supplierCnpjs, [CNPJ]);
  assert.equal(state.includeClosed, true);
  assert.equal(state.sort, 'publishedDesc');
});

test('editais do órgão: os abertos, inclusive os que encerram em breve e os descartados, e o que a tela Buscar lê de volta', () => {
  const api = new URLSearchParams(cnpjNoticesApiQuery(CNPJ));
  assert.deepEqual(api.getAll('agencyCnpj'), [CNPJ]);
  assert.equal(api.get('openOnly'), 'true');
  assert.equal(api.get('hideDiscarded'), 'false');
  assert.equal(api.get('perPage'), String(CNPJ_LIST_SIZE));

  const path = cnpjNoticesPath(CNPJ);
  assert.ok(path.startsWith('/buscar?'), path);
  const state = parseSearchParams(new URLSearchParams(path.split('?')[1]));
  assert.deepEqual(state.agencyCnpjs, [CNPJ]);
  assert.equal(state.openOnly, true);
  assert.equal(state.includeClosingSoon, true, 'sem o prazo mínimo: a contagem da página conta todos os abertos');
  assert.equal(state.hideDiscarded, false);
});

test('nota de cobertura: contratos desde o dia e o intervalo dos resultados, sem citar a fonte', () => {
  assert.deepEqual(cnpjCoverageNotes({ contractsFrom: '2026-10-16', winnersFrom: '2023-06-27', winnersTo: '2026-09-29' }), [
    'Contratos publicados desde 16/10/2026.',
    'Resultados de licitações de 27/06/2023 a 29/09/2026.',
  ]);
  assert.deepEqual(cnpjCoverageNotes({ contractsFrom: null, winnersFrom: null, winnersTo: null }), ['Resultados de licitações ainda não disponíveis.']);
  assert.deepEqual(cnpjCoverageNotes({ contractsFrom: '2026-10-16', winnersFrom: null, winnersTo: null }), [
    'Contratos publicados desde 16/10/2026.',
    'Resultados de licitações ainda não disponíveis.',
  ]);
});

test('número da compra e período do resultado', () => {
  assert.equal(purchaseLabel('03353358000196-1-000216/2026'), '216/2026');
  assert.equal(purchaseLabel('00394460005887-1-1234567/2021'), '1234567/2021');
  assert.equal(purchaseLabel('formato-diferente'), 'formato-diferente');
  assert.equal(resultPeriodLabel('2026-09-10', '2026-09-10'), '10/09/2026');
  assert.equal(resultPeriodLabel('2026-09-10', '2026-09-11'), '10/09/2026 a 11/09/2026');
});
