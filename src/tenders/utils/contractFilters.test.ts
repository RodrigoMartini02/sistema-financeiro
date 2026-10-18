import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_CONTRACT_SEARCH_STATE,
  activeExpiryShortcut,
  clearAllContractFilters,
  contractFavoritesApiQuery,
  contractFilterChips,
  contractYearOptions,
  daysUntilExpiry,
  defaultContractSort,
  expiryLabel,
  expiryWithinDays,
  parseContractSearchParams,
  toContractApiQuery,
  toContractSearchParams,
  withContractFilters,
  type ContractSearchState,
} from './contractFilters';

const TODAY = '2026-10-14';
const params = (text: string) => new URLSearchParams(text);

test('contratos: URL ↔ estado ida e volta, sem os padrões na URL', () => {
  const state: ContractSearchState = {
    ...DEFAULT_CONTRACT_SEARCH_STATE,
    q: 'limpeza "coleta de lixo"',
    termsMode: 'OU',
    states: ['SP', 'MG'],
    municipalityCodes: ['3550308'],
    agencyCnpjs: ['46395000000139'],
    categories: [8, 2],
    supplierCnpjs: ['12345678000195'],
    minValue: '1000.00',
    maxValue: '50000.50',
    includeWithoutValue: true,
    publishedFrom: '2026-09-01',
    publishedTo: '2026-09-30',
    expiryFrom: '2026-10-14',
    expiryTo: '2027-01-12',
    favoritesOnly: true,
    includeClosed: true,
    contractTypes: [7, 12],
    number: '352/2026',
    contractYear: 2026,
    sort: 'valueDesc',
    page: 3,
    perPage: 50,
  };
  assert.deepEqual(parseContractSearchParams(toContractSearchParams(state)), state);
  assert.equal(toContractSearchParams(DEFAULT_CONTRACT_SEARCH_STATE).toString(), '', 'o padrão não vai para a URL');
});

test('contratos: com encerrados, a ordem padrão é a publicação mais recente, e ela não vai para a URL', () => {
  assert.equal(defaultContractSort(false), 'expiryAsc');
  assert.equal(defaultContractSort(true), 'publishedDesc');
  const closed = parseContractSearchParams(params('encerrados=1&tipo=7&tipo=x&tipo=7'));
  assert.equal(closed.includeClosed, true);
  assert.equal(closed.sort, 'publishedDesc');
  assert.deepEqual(closed.contractTypes, [7]);
  assert.equal(toContractSearchParams(closed).toString(), 'encerrados=1&tipo=7');
  assert.equal(parseContractSearchParams(params('encerrados=1&ordem=vencimento')).sort, 'expiryAsc', 'a ordem escolhida vale');
  assert.equal(parseContractSearchParams(params('encerrados=1&ordem=relevancia')).sort, 'publishedDesc', 'sem texto, o padrão do modo');
});

test('contratos: ligar e desligar "Incluir encerrados" troca a ordem padrão; a ordem escolhida fica', () => {
  const opened = withContractFilters(DEFAULT_CONTRACT_SEARCH_STATE, { includeClosed: true });
  assert.equal(opened.sort, 'publishedDesc');
  assert.equal(withContractFilters(opened, { includeClosed: false }).sort, 'expiryAsc');
  const chosen = withContractFilters({ ...DEFAULT_CONTRACT_SEARCH_STATE, sort: 'valueDesc' }, { includeClosed: true });
  assert.equal(chosen.sort, 'valueDesc');
  assert.equal(withContractFilters(opened, { includeClosed: false, sort: 'valueAsc' }).sort, 'valueAsc');
});

test('contratos: valores inválidos da URL ficam de fora', () => {
  const state = parseContractSearchParams(
    params('uf=ABC&uf=sp&municipio=123&orgao=1&categoria=abc&categoria=8&fornecedor=12.345.678/0001-95&valorMin=10&valorMax=5&vencimentoDe=2026-12-31&vencimentoAte=2026-01-01&ano=1999&pagina=0&porPagina=7&ordem=xyz&numero=abc'),
  );
  assert.deepEqual(state.states, ['SP']);
  assert.deepEqual(state.municipalityCodes, []);
  assert.deepEqual(state.agencyCnpjs, []);
  assert.deepEqual(state.categories, [8]);
  assert.deepEqual(state.supplierCnpjs, ['12345678000195'], 'CNPJ com pontuação vira só os dígitos');
  assert.equal(state.minValue, '10');
  assert.equal(state.maxValue, null, 'máximo menor que o mínimo sai');
  assert.equal(state.expiryFrom, '2026-12-31');
  assert.equal(state.expiryTo, null, 'fim antes do início sai');
  assert.equal(state.contractYear, null);
  assert.equal(state.page, 1);
  assert.equal(state.perPage, 20);
  assert.equal(state.sort, 'expiryAsc');
  assert.equal(state.number, '', 'número sem dígito sai');
});

test('contratos: relevância só com texto; com busca salva, os critérios da URL ficam de fora', () => {
  assert.equal(parseContractSearchParams(params('ordem=relevancia')).sort, 'expiryAsc');
  assert.equal(parseContractSearchParams(params('q=limpeza&ordem=relevancia')).sort, 'relevance');
  const fromSaved = parseContractSearchParams(params('busca=7&q=limpeza&uf=SP&vencimentoAte=2026-12-31'));
  assert.equal(fromSaved.savedSearchId, 7);
  assert.equal(fromSaved.q, '');
  assert.deepEqual(fromSaved.states, []);
  assert.equal(fromSaved.expiryTo, '2026-12-31', 'o vencimento continua valendo');
});

test('contratos: query da API, com e sem busca salva', () => {
  const state: ContractSearchState = {
    ...DEFAULT_CONTRACT_SEARCH_STATE,
    q: 'limpeza',
    states: ['SP'],
    categories: [8],
    supplierCnpjs: ['12345678000195'],
    minValue: '1000.00',
    includeWithoutValue: true,
    expiryFrom: '2026-10-14',
    expiryTo: '2027-01-12',
  };
  assert.equal(
    toContractApiQuery(state),
    'q=limpeza&termsMode=E&state=SP&category=8&supplierCnpj=12345678000195&minValue=1000.00&includeWithoutValue=true&expiryFrom=2026-10-14&expiryTo=2027-01-12&sort=expiryAsc&page=1&perPage=20',
  );
  assert.equal(
    toContractApiQuery({ ...state, savedSearchId: 3 }),
    'savedSearchId=3&expiryFrom=2026-10-14&expiryTo=2027-01-12&sort=expiryAsc&page=1&perPage=20',
  );
  assert.equal(
    toContractApiQuery({ ...DEFAULT_CONTRACT_SEARCH_STATE, includeWithoutValue: true }),
    'sort=expiryAsc&page=1&perPage=20',
    '"incluir sem valor" só vale com faixa de valor',
  );
  assert.equal(
    toContractApiQuery({ ...DEFAULT_CONTRACT_SEARCH_STATE, savedSearchId: 3, includeClosed: true, contractTypes: [1, 7], sort: 'publishedDesc' }),
    'savedSearchId=3&includeClosed=true&contractType=1&contractType=7&sort=publishedDesc&page=1&perPage=20',
    'tipo e encerrados valem também com a busca salva',
  );
});

test('contratos: aba de Favoritos traz todos os favoritos, pelo vencimento', () => {
  assert.equal(contractFavoritesApiQuery(2, 50), 'favoritesOnly=true&sort=expiryAsc&page=2&perPage=50');
});

test('contratos: atalhos de vencimento de 30, 90, 180 e 365 dias', () => {
  assert.deepEqual(expiryWithinDays(90, TODAY), { expiryFrom: '2026-10-14', expiryTo: '2027-01-12' });
  assert.equal(activeExpiryShortcut({ ...DEFAULT_CONTRACT_SEARCH_STATE, ...expiryWithinDays(365, TODAY) }, TODAY), 365);
  assert.equal(activeExpiryShortcut({ ...DEFAULT_CONTRACT_SEARCH_STATE, expiryFrom: TODAY }, TODAY), null);
});

test('contratos: dias até o vencimento e o texto do selo', () => {
  assert.equal(daysUntilExpiry('2026-10-14', TODAY), 0);
  assert.equal(daysUntilExpiry('2026-10-13', TODAY), -1);
  assert.equal(expiryLabel('2026-10-14', TODAY), 'Vence hoje');
  assert.equal(expiryLabel('2026-10-15', TODAY), 'Vence amanhã');
  assert.equal(expiryLabel('2027-10-14', TODAY), 'Vence em 365 dias');
  assert.equal(expiryLabel('2026-10-01', TODAY), 'Vencido');
  assert.equal(expiryLabel(null, TODAY), 'Sem data de fim');
});

test('contratos: mudar filtro volta para a página 1; Limpar tudo mantém ordem e itens por página', () => {
  const state: ContractSearchState = { ...DEFAULT_CONTRACT_SEARCH_STATE, q: 'limpeza', sort: 'relevance', page: 4, perPage: 50 };
  const changed = withContractFilters(state, { states: ['SP'] });
  assert.equal(changed.page, 1);
  assert.equal(withContractFilters(state, { q: '' }).sort, 'expiryAsc', 'sem texto, a relevância sai');
  assert.deepEqual(clearAllContractFilters({ ...state, sort: 'valueDesc' }), { ...DEFAULT_CONTRACT_SEARCH_STATE, sort: 'valueDesc', perPage: 50 });
});

test('contratos: chips dos filtros ativos, cada um sem o seu filtro', () => {
  const state: ContractSearchState = {
    ...DEFAULT_CONTRACT_SEARCH_STATE,
    q: 'limpeza',
    categories: [8],
    supplierCnpjs: ['12345678000195'],
    expiryFrom: '2026-10-14',
    expiryTo: '2027-01-12',
    favoritesOnly: true,
  };
  const chips = contractFilterChips(state, { categoryName: (id) => (id === 8 ? 'Serviços' : undefined) });
  assert.deepEqual(
    chips.map((chip) => chip.label),
    ['Busca: "limpeza"', 'Categoria: Serviços', 'Fornecedor: 12.345.678/0001-95', 'Vencimento: de 14/10/2026 a 12/01/2027', 'Só favoritos'],
  );
  const withoutExpiry = chips.find((chip) => chip.key === 'expiry')?.without;
  assert.equal(withoutExpiry?.expiryFrom, null);
  assert.equal(withoutExpiry?.expiryTo, null);
  assert.deepEqual(contractFilterChips(DEFAULT_CONTRACT_SEARCH_STATE), []);
});

test('contratos: chips do tipo e de "Com encerrados"; tirar os encerrados volta à ordem do vencimento', () => {
  const state = withContractFilters(DEFAULT_CONTRACT_SEARCH_STATE, { includeClosed: true, contractTypes: [7] });
  const chips = contractFilterChips(state, { contractTypeName: (id) => (id === 7 ? 'Empenho' : undefined) });
  assert.deepEqual(
    chips.map((chip) => chip.label),
    ['Tipo: Empenho', 'Com encerrados'],
  );
  const withoutClosed = chips.find((chip) => chip.key === 'includeClosed')?.without;
  assert.equal(withoutClosed?.includeClosed, false);
  assert.equal(withoutClosed?.sort, 'expiryAsc');
  assert.deepEqual(chips.find((chip) => chip.key === 'contractType:7')?.without.contractTypes, []);
});

test('contratos: anos da lista, do próximo até 6 anos atrás, com o escolhido fora da faixa', () => {
  assert.deepEqual(contractYearOptions(TODAY), [2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020]);
  assert.deepEqual(contractYearOptions(TODAY, 2015).at(-1), 2015);
});
