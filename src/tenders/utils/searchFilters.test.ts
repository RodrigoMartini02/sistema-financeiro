import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCurrency } from '../../screens/finance/formatters';
import {
  DEFAULT_SEARCH_STATE,
  activeClosingShortcut,
  appliesMinimumDeadline,
  clearAllFilters,
  closingSoonCountQuery,
  closingWithinDays,
  favoritesApiQuery,
  filterChips,
  minimumClosingDate,
  parseSearchParams,
  toApiQuery,
  toSearchParams,
  withFilters,
  withMinimumDeadline,
  type SearchState,
} from './searchFilters';

const FULL_STATE: SearchState = {
  q: 'software "licença de uso" -obra',
  termsMode: 'OU',
  states: ['SP', 'RJ'],
  municipalityCodes: ['3509502'],
  agencyCnpjs: ['46395000000139'],
  modalities: [6, 8],
  minValue: '10000.00',
  maxValue: '500000.50',
  includeWithoutValue: true,
  publishedFrom: '2026-10-01',
  publishedTo: '2026-10-05',
  closingFrom: '2026-10-05',
  closingTo: '2026-10-20',
  openOnly: false,
  includeClosingSoon: true,
  trackingStatuses: ['ANALISAR', 'SEM'],
  hideDiscarded: false,
  favoritesOnly: true,
  savedSearchId: null,
  sort: 'relevance',
  page: 3,
  perPage: 50,
};

const params = (query: string) => new URLSearchParams(query);

test('filtros: ida e volta pela URL com todos os parâmetros', () => {
  const url = toSearchParams(FULL_STATE);
  assert.equal(url.get('q'), 'software "licença de uso" -obra');
  assert.equal(url.get('modo'), 'ou');
  assert.deepEqual(url.getAll('uf'), ['SP', 'RJ']);
  assert.deepEqual(url.getAll('acompanhamento'), ['analisar', 'sem']);
  assert.equal(url.get('ordem'), 'relevancia');
  assert.equal(url.get('pagina'), '3');
  assert.equal(url.get('porPagina'), '50');
  assert.equal(url.get('prazoCurto'), '1');
  assert.equal(url.get('favoritos'), '1');
  assert.deepEqual(parseSearchParams(url), FULL_STATE);
});

test('filtros: os valores padrão ficam fora da URL', () => {
  assert.equal(toSearchParams(DEFAULT_SEARCH_STATE).toString(), '');
  assert.deepEqual(parseSearchParams(params('')), DEFAULT_SEARCH_STATE);
  assert.equal(toSearchParams({ ...DEFAULT_SEARCH_STATE, q: '  pregão  ' }).toString(), 'q=preg%C3%A3o');
});

test('filtros: valor inválido ou repetido na URL fica de fora', () => {
  const state = parseSearchParams(
    params(
      'uf=sp&uf=SP&uf=XYZ&municipio=123&orgao=46.395.000/0001-39&modalidade=0&modalidade=6&valorMin=abc&valorMax=10' +
        '&publicacaoDe=2026-02-30&encerramentoDe=2026-10-20&encerramentoAte=2026-10-01&acompanhamento=talvez' +
        '&ordem=xyz&pagina=-2&porPagina=30',
    ),
  );
  assert.deepEqual(state.states, ['SP']);
  assert.deepEqual(state.municipalityCodes, []);
  assert.deepEqual(state.agencyCnpjs, ['46395000000139'], 'CNPJ com pontuação vira só dígitos');
  assert.deepEqual(state.modalities, [6]);
  assert.equal(state.minValue, null);
  assert.equal(state.maxValue, '10');
  assert.equal(state.publishedFrom, null, 'data que não existe');
  assert.equal(state.closingFrom, '2026-10-20');
  assert.equal(state.closingTo, null, 'início depois do fim: fica só o início');
  assert.deepEqual(state.trackingStatuses, []);
  assert.equal(state.sort, 'closingAsc');
  assert.equal(state.page, 1);
  assert.equal(state.perPage, 20);
});

test('filtros: mínimo maior que o máximo na URL descarta o máximo', () => {
  const state = parseSearchParams(params('valorMin=500&valorMax=100'));
  assert.equal(state.minValue, '500');
  assert.equal(state.maxValue, null);
});

test('filtros: relevância sem texto de busca volta para o prazo', () => {
  assert.equal(parseSearchParams(params('ordem=relevancia')).sort, 'closingAsc');
  assert.equal(parseSearchParams(params('q=obra&ordem=relevancia')).sort, 'relevance');
  assert.equal(withFilters({ ...DEFAULT_SEARCH_STATE, q: 'obra', sort: 'relevance' }, { q: '' }).sort, 'closingAsc');
});

test('filtros: busca salva na URL deixa de fora os critérios da tela', () => {
  const state = parseSearchParams(params('busca=7&q=obra&uf=SP&valorMin=10&abertos=0&ordem=recentes'));
  assert.equal(state.savedSearchId, 7);
  assert.equal(state.q, '');
  assert.deepEqual(state.states, []);
  assert.equal(state.minValue, null);
  assert.equal(state.openOnly, false, 'os filtros fora dos critérios continuam');
  assert.equal(state.sort, 'publishedDesc');
  const api = new URLSearchParams(toApiQuery(state));
  assert.equal(api.get('savedSearchId'), '7');
  assert.equal(api.get('q'), null);
  assert.equal(api.get('openOnly'), 'false');
});

test('filtros: query da API com os nomes da API', () => {
  const api = new URLSearchParams(toApiQuery(FULL_STATE));
  assert.equal(api.get('q'), FULL_STATE.q);
  assert.equal(api.get('termsMode'), 'OU');
  assert.deepEqual(api.getAll('state'), ['SP', 'RJ']);
  assert.deepEqual(api.getAll('municipalityCode'), ['3509502']);
  assert.deepEqual(api.getAll('agencyCnpj'), ['46395000000139']);
  assert.deepEqual(api.getAll('modality'), ['6', '8']);
  assert.equal(api.get('minValue'), '10000.00');
  assert.equal(api.get('maxValue'), '500000.50');
  assert.equal(api.get('includeWithoutValue'), 'true');
  assert.equal(api.get('closingTo'), '2026-10-20');
  assert.equal(api.get('openOnly'), 'false');
  assert.deepEqual(api.getAll('trackingStatus'), ['ANALISAR', 'SEM']);
  assert.equal(api.get('hideDiscarded'), 'false');
  assert.equal(api.get('favoritesOnly'), 'true');
  assert.equal(api.get('sort'), 'relevance');
  assert.equal(api.get('page'), '3');
  assert.equal(api.get('perPage'), '50');

  const plain = new URLSearchParams(toApiQuery({ ...DEFAULT_SEARCH_STATE, includeWithoutValue: true }));
  assert.equal(plain.get('q'), null);
  assert.equal(plain.get('termsMode'), null, 'sem texto, sem modo');
  assert.equal(plain.get('includeWithoutValue'), null, '"incluir sem valor" só com faixa de valor');
  assert.equal(plain.get('openOnly'), 'true');
  assert.equal(plain.get('hideDiscarded'), 'true');
  assert.equal(plain.get('favoritesOnly'), null, 'sem o filtro, a API traz todos');
});

test('filtros: mudar um filtro volta para a página 1', () => {
  const next = withFilters({ ...DEFAULT_SEARCH_STATE, page: 4 }, { states: ['MG'] });
  assert.equal(next.page, 1);
  assert.deepEqual(next.states, ['MG']);
});

test('chips: um por filtro ativo, e cada um remove só o seu', () => {
  const chips = filterChips(FULL_STATE, {
    municipalityName: (code) => (code === '3509502' ? 'Campinas/SP' : undefined),
    modalityName: (id) => (id === 6 ? 'Pregão – Eletrônico' : undefined),
  });
  const labels = chips.map((chip) => chip.label);
  assert.deepEqual(labels, [
    'Busca: "software "licença de uso" -obra" (qualquer palavra)',
    'UF: SP',
    'UF: RJ',
    'Município: Campinas/SP',
    'Órgão: 46.395.000/0001-39',
    'Modalidade: Pregão – Eletrônico',
    'Modalidade: 8',
    `Valor: de ${formatCurrency(10000)} a ${formatCurrency(500000.5)}, inclui sem valor`,
    'Publicação: de 01/10/2026 a 05/10/2026',
    'Encerramento: de 05/10/2026 a 20/10/2026',
    'Inclui encerrados',
    'Inclui os que encerram em menos de 3 dias',
    'Acompanhamento: Analisar',
    'Acompanhamento: Sem acompanhamento',
    'Mostra descartados',
    'Só favoritos',
  ]);

  const byKey = (key: string) => chips.find((chip) => chip.key === key)!.without;
  assert.deepEqual(byKey('state:SP').states, ['RJ']);
  assert.equal(byKey('state:SP').page, 1);
  assert.equal(byKey('q').q, '');
  assert.equal(byKey('q').sort, 'closingAsc', 'sem texto, a relevância sai');
  assert.deepEqual(byKey('value'), withFilters(FULL_STATE, { minValue: null, maxValue: null, includeWithoutValue: false }));
  assert.equal(byKey('openOnly').openOnly, true);
  assert.equal(byKey('includeClosingSoon').includeClosingSoon, false);
  assert.equal(byKey('showDiscarded').hideDiscarded, true);
  assert.equal(byKey('favoritesOnly').favoritesOnly, false);
  assert.deepEqual(byKey('tracking:SEM').trackingStatuses, ['ANALISAR']);
});

test('chips: busca no padrão não tem chip; busca salva mostra o nome', () => {
  assert.deepEqual(filterChips(DEFAULT_SEARCH_STATE), []);
  const chips = filterChips({ ...DEFAULT_SEARCH_STATE, savedSearchId: 7 }, { savedSearchName: () => 'TI em SP' });
  assert.deepEqual(chips.map((chip) => chip.label), ['Busca salva: TI em SP']);
  assert.equal(chips[0]!.without.savedSearchId, null);
  assert.equal(filterChips({ ...DEFAULT_SEARCH_STATE, savedSearchId: 7 })[0]!.label, 'Busca salva: nº 7');
});

test('limpar tudo: filtros saem; ordenação e itens por página ficam', () => {
  const cleared = clearAllFilters(FULL_STATE);
  assert.deepEqual(cleared, { ...DEFAULT_SEARCH_STATE, perPage: 50, sort: 'closingAsc' });
  assert.equal(clearAllFilters({ ...FULL_STATE, sort: 'valueDesc' }).sort, 'valueDesc');
  assert.deepEqual(filterChips(cleared), []);
});

test('encerramento: atalhos de 7, 15 e 30 dias a partir de hoje', () => {
  assert.deepEqual(closingWithinDays(7, '2026-10-28'), { closingFrom: '2026-10-28', closingTo: '2026-11-04' });
  const state = withFilters(DEFAULT_SEARCH_STATE, closingWithinDays(15, '2026-10-05'));
  assert.equal(activeClosingShortcut(state, '2026-10-05'), 15);
  assert.equal(activeClosingShortcut(state, '2026-10-06'), null, 'no dia seguinte o período já não é o atalho');
});

const TODAY = '2026-10-06';
const apiParams = (state: SearchState) => new URLSearchParams(toApiQuery(state));

test('prazo mínimo: por padrão, só os que encerram a partir de hoje + 3 dias', () => {
  assert.equal(minimumClosingDate(TODAY), '2026-10-09');
  assert.equal(appliesMinimumDeadline(DEFAULT_SEARCH_STATE, TODAY), true);
  const effective = withMinimumDeadline(DEFAULT_SEARCH_STATE, TODAY);
  assert.equal(effective.closingFrom, '2026-10-09');
  assert.equal(apiParams(effective).get('closingFrom'), '2026-10-09');
  assert.equal(parseSearchParams(params('prazoCurto=talvez')).includeClosingSoon, false, 'só "1" liga o filtro');
});

test('prazo mínimo: período escolhido só tem o início elevado, nunca invertido', () => {
  const nextWeek = withFilters(DEFAULT_SEARCH_STATE, closingWithinDays(7, TODAY));
  const effective = withMinimumDeadline(nextWeek, TODAY);
  assert.deepEqual([effective.closingFrom, effective.closingTo], ['2026-10-09', '2026-10-13']);
  const later = withFilters(DEFAULT_SEARCH_STATE, { closingFrom: '2026-10-20' });
  assert.equal(withMinimumDeadline(later, TODAY).closingFrom, '2026-10-20', 'início já depois do mínimo');
  const shortPeriod = withFilters(DEFAULT_SEARCH_STATE, { closingFrom: TODAY, closingTo: '2026-10-08' });
  assert.equal(appliesMinimumDeadline(shortPeriod, TODAY), false, 'período que termina antes do mínimo');
  assert.deepEqual(withMinimumDeadline(shortPeriod, TODAY), shortPeriod);
});

test('prazo mínimo: não vale com o filtro ligado, sem "só abertos", com acompanhados ou com favoritos', () => {
  assert.equal(appliesMinimumDeadline({ ...DEFAULT_SEARCH_STATE, includeClosingSoon: true }, TODAY), false);
  assert.equal(appliesMinimumDeadline({ ...DEFAULT_SEARCH_STATE, openOnly: false }, TODAY), false);
  assert.equal(appliesMinimumDeadline({ ...DEFAULT_SEARCH_STATE, trackingStatuses: ['ANALISAR'] }, TODAY), false);
  assert.equal(appliesMinimumDeadline({ ...DEFAULT_SEARCH_STATE, trackingStatuses: ['SEM'] }, TODAY), true, 'sem acompanhamento continua na regra');
  assert.equal(appliesMinimumDeadline({ ...DEFAULT_SEARCH_STATE, favoritesOnly: true }, TODAY), false);
  assert.equal(closingSoonCountQuery({ ...DEFAULT_SEARCH_STATE, favoritesOnly: true }, TODAY), null);
});

test('favoritos: só "1" na URL liga o filtro', () => {
  assert.equal(parseSearchParams(params('favoritos=1')).favoritesOnly, true);
  assert.equal(parseSearchParams(params('favoritos=sim')).favoritesOnly, false);
  assert.equal(parseSearchParams(params('')).favoritesOnly, false);
  assert.equal(toSearchParams(DEFAULT_SEARCH_STATE).get('favoritos'), null);
  assert.equal(parseSearchParams(params('busca=7&favoritos=1')).favoritesOnly, true, 'vale também com busca salva');
});

test('prazo mínimo: query da contagem dos que ficaram de fora', () => {
  const hidden = new URLSearchParams(closingSoonCountQuery(withFilters(DEFAULT_SEARCH_STATE, { q: 'software' }), TODAY) ?? '');
  assert.equal(hidden.get('q'), 'software');
  assert.equal(hidden.get('closingFrom'), null);
  assert.equal(hidden.get('closingTo'), '2026-10-08');
  assert.equal(hidden.get('openOnly'), 'true');
  assert.equal(hidden.get('perPage'), '1');
  assert.equal(hidden.get('page'), '1');
  const nextWeek = new URLSearchParams(closingSoonCountQuery(withFilters(DEFAULT_SEARCH_STATE, closingWithinDays(7, TODAY)), TODAY) ?? '');
  assert.deepEqual([nextWeek.get('closingFrom'), nextWeek.get('closingTo')], [TODAY, '2026-10-08']);
  assert.equal(closingSoonCountQuery({ ...DEFAULT_SEARCH_STATE, includeClosingSoon: true }, TODAY), null);
  assert.equal(closingSoonCountQuery(withFilters(DEFAULT_SEARCH_STATE, { closingFrom: '2026-10-20' }), TODAY), null, 'nada escondido');
});

test('favoritos: a tela traz todos os favoritos, inclusive encerrados e descartados, pelo prazo', () => {
  const api = new URLSearchParams(favoritesApiQuery(2, 50));
  assert.equal(api.get('favoritesOnly'), 'true');
  assert.equal(api.get('openOnly'), 'false');
  assert.equal(api.get('hideDiscarded'), 'false');
  assert.equal(api.get('closingFrom'), null, 'sem prazo mínimo');
  assert.equal(api.get('sort'), 'closingAsc');
  assert.deepEqual([api.get('page'), api.get('perPage')], ['2', '50']);
});
