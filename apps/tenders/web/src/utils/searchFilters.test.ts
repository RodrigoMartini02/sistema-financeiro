import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCurrency } from '@ui/utils/formatters';
import {
  DEFAULT_SEARCH_STATE,
  activeClosingShortcut,
  appliesMinimumDeadline,
  clearAllFilters,
  closingSoonCountQuery,
  closingWithinDays,
  favoritesApiQuery,
  filterChips,
  isValidNumberSearch,
  minimumClosingDate,
  parseSearchParams,
  purchaseYearOptions,
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
  spheres: ['M', 'F'],
  situations: [2, 4],
  openOnly: false,
  includeClosingSoon: true,
  trackingStatuses: ['ANALISAR', 'SEM'],
  hideDiscarded: false,
  favoritesOnly: true,
  number: 'PE 352/2026',
  purchaseYear: 2026,
  savedSearchId: null,
  sort: 'relevance',
};

const params = (query: string) => new URLSearchParams(query);

test('filtros: ida e volta pela URL com todos os parâmetros', () => {
  const url = toSearchParams(FULL_STATE);
  assert.equal(url.get('q'), 'software "licença de uso" -obra');
  assert.equal(url.get('modo'), 'ou');
  assert.deepEqual(url.getAll('uf'), ['SP', 'RJ']);
  assert.deepEqual(url.getAll('acompanhamento'), ['analisar', 'sem']);
  assert.deepEqual(url.getAll('esfera'), ['M', 'F']);
  assert.deepEqual(url.getAll('situacao'), ['2', '4']);
  assert.equal(url.get('ordem'), 'relevancia');
  assert.equal(url.has('pagina'), false, 'a lista tem rolagem infinita: a página não vai para a URL');
  assert.equal(url.has('porPagina'), false);
  assert.equal(url.get('prazoCurto'), '1');
  assert.equal(url.get('favoritos'), '1');
  assert.equal(url.get('numero'), 'PE 352/2026');
  assert.equal(url.get('ano'), '2026');
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
        '&ordem=xyz',
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
});

test('esfera e situação na URL: só os códigos que existem, esfera em maiúsculas, sem repetir; fora disso, de fora', () => {
  const state = parseSearchParams(
    params('abertos=0&esfera=m&esfera=M&esfera=f&esfera=X&esfera=&situacao=2&situacao=2&situacao=4&situacao=9&situacao=abc&situacao=0'),
  );
  assert.deepEqual(state.spheres, ['M', 'F']);
  assert.deepEqual(state.situations, [2, 4]);
  assert.deepEqual(parseSearchParams(params('')).spheres, []);
  assert.deepEqual(parseSearchParams(params('')).situations, []);
  assert.equal(toSearchParams(state).toString(), 'esfera=M&esfera=F&situacao=2&situacao=4&abertos=0');
});

test('situação na URL com "só abertos" ligado (o padrão) é descartada: a seção fica desabilitada e só há Divulgados', () => {
  const withOpen = parseSearchParams(params('esfera=F&situacao=2&situacao=4'));
  assert.equal(withOpen.openOnly, true);
  assert.deepEqual(withOpen.situations, []);
  assert.deepEqual(withOpen.spheres, ['F'], 'a esfera não depende de "só abertos"');
  assert.equal(toSearchParams(withOpen).toString(), 'esfera=F');
  assert.deepEqual(parseSearchParams(params('abertos=0&situacao=3')).situations, [3]);
});

test('filtros: link antigo com página e itens por página abre do início, sem erro', () => {
  const state = parseSearchParams(params('uf=SP&pagina=3&porPagina=50'));
  assert.deepEqual(state, { ...DEFAULT_SEARCH_STATE, states: ['SP'] });
  assert.equal(toSearchParams(state).toString(), 'uf=SP', 'a página não volta para a URL');
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
  const state = parseSearchParams(params('busca=7&q=obra&uf=SP&valorMin=10&abertos=0&esfera=f&situacao=2&ordem=recentes'));
  assert.equal(state.savedSearchId, 7);
  assert.equal(state.q, '');
  assert.deepEqual(state.states, []);
  assert.equal(state.minValue, null);
  assert.equal(state.openOnly, false, 'os filtros fora dos critérios continuam');
  assert.deepEqual([state.spheres, state.situations], [['F'], [2]], 'esfera e situação são da tela: valem por cima da busca salva');
  assert.equal(state.sort, 'publishedDesc');
  const api = new URLSearchParams(toApiQuery(state));
  assert.equal(api.get('savedSearchId'), '7');
  assert.equal(api.get('q'), null);
  assert.equal(api.get('openOnly'), 'false');
  assert.deepEqual([api.getAll('sphere'), api.getAll('situation')], [['F'], ['2']]);
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
  assert.deepEqual(api.getAll('sphere'), ['M', 'F']);
  assert.deepEqual(api.getAll('situation'), ['2', '4']);
  assert.equal(api.get('openOnly'), 'false');
  assert.deepEqual(api.getAll('trackingStatus'), ['ANALISAR', 'SEM']);
  assert.equal(api.get('hideDiscarded'), 'false');
  assert.equal(api.get('favoritesOnly'), 'true');
  assert.equal(api.get('number'), 'PE 352/2026');
  assert.equal(api.get('purchaseYear'), '2026');
  assert.equal(api.get('sort'), 'relevance');
  assert.equal(api.has('page'), false, 'a página é acrescentada por quem pede (withPaging)');
  assert.equal(api.has('perPage'), false);

  const plain = new URLSearchParams(toApiQuery({ ...DEFAULT_SEARCH_STATE, includeWithoutValue: true }));
  assert.equal(plain.get('q'), null);
  assert.equal(plain.get('termsMode'), null, 'sem texto, sem modo');
  assert.equal(plain.get('includeWithoutValue'), null, '"incluir sem valor" só com faixa de valor');
  assert.equal(plain.get('openOnly'), 'true');
  assert.equal(plain.get('hideDiscarded'), 'true');
  assert.equal(plain.get('favoritesOnly'), null, 'sem o filtro, a API traz todos');
  assert.deepEqual([plain.get('number'), plain.get('purchaseYear')], [null, null]);
  assert.deepEqual([plain.getAll('sphere'), plain.getAll('situation')], [[], []], 'sem escolha, sem parâmetro: a API traz todas');
});

test('filtros: mudar um filtro mantém os outros', () => {
  const next = withFilters({ ...DEFAULT_SEARCH_STATE, q: 'obra', sort: 'valueDesc' }, { states: ['MG'] });
  assert.deepEqual(next.states, ['MG']);
  assert.equal(next.q, 'obra');
  assert.equal(next.sort, 'valueDesc');
});

test('filtros: a situação só existe com "só abertos" desligado; ligá-lo (botão ou chip) a tira', () => {
  const closed = { ...DEFAULT_SEARCH_STATE, openOnly: false };
  assert.deepEqual(withFilters(closed, { situations: [2, 4] }).situations, [2, 4]);
  assert.deepEqual(withFilters({ ...closed, situations: [2, 4], spheres: ['F'] }, { openOnly: true }), {
    ...DEFAULT_SEARCH_STATE,
    spheres: ['F'],
  });
  assert.deepEqual(withFilters(DEFAULT_SEARCH_STATE, { situations: [2] }).situations, [], 'com "só abertos" não há situação a escolher');
  assert.deepEqual(withFilters({ ...closed, situations: [3] }, { q: 'obra' }).situations, [3], 'outras mudanças não mexem nela');
});

test('chips: um por filtro ativo, e cada um remove só o seu', () => {
  const chips = filterChips(FULL_STATE, {
    municipalityName: (code) => (code === '3509502' ? 'Campinas/SP' : undefined),
    modalityName: (id) => (id === 6 ? 'Pregão – Eletrônico' : undefined),
    sphereName: (code) => (code === 'M' ? 'Municipal' : undefined),
    situationName: (id) => (id === 2 ? 'Revogada' : undefined),
  });
  const labels = chips.map((chip) => chip.label);
  assert.deepEqual(labels, [
    'Busca: "software "licença de uso" -obra" (qualquer palavra)',
    'Número: PE 352/2026',
    'Ano: 2026',
    'UF: SP',
    'UF: RJ',
    'Município: Campinas/SP',
    'Órgão: 46.395.000/0001-39',
    'Modalidade: Pregão – Eletrônico',
    'Modalidade: 8',
    'Esfera: Municipal',
    'Esfera: F',
    'Situação: Revogada',
    'Situação: 4',
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
  assert.equal(byKey('q').q, '');
  assert.equal(byKey('q').sort, 'closingAsc', 'sem texto, a relevância sai');
  assert.deepEqual(byKey('value'), withFilters(FULL_STATE, { minValue: null, maxValue: null, includeWithoutValue: false }));
  assert.equal(byKey('openOnly').openOnly, true);
  assert.deepEqual(byKey('openOnly').situations, [], 'voltar a "só abertos" tira a situação: os abertos são os Divulgados');
  assert.equal(byKey('includeClosingSoon').includeClosingSoon, false);
  assert.equal(byKey('showDiscarded').hideDiscarded, true);
  assert.equal(byKey('favoritesOnly').favoritesOnly, false);
  assert.equal(byKey('number').number, '');
  assert.equal(byKey('number').purchaseYear, 2026, 'cada chip remove só o seu');
  assert.equal(byKey('purchaseYear').purchaseYear, null);
  assert.deepEqual(byKey('tracking:SEM').trackingStatuses, ['ANALISAR']);
  assert.deepEqual(byKey('sphere:M').spheres, ['F'], 'cada chip de esfera remove só a sua');
  assert.deepEqual(byKey('situation:2').situations, [4], 'e cada chip de situação, só a sua');
  assert.deepEqual(byKey('sphere:F').situations, [2, 4]);
});

test('chips: busca no padrão não tem chip; busca salva mostra o nome', () => {
  assert.deepEqual(filterChips(DEFAULT_SEARCH_STATE), []);
  const chips = filterChips({ ...DEFAULT_SEARCH_STATE, savedSearchId: 7 }, { savedSearchName: () => 'TI em SP' });
  assert.deepEqual(chips.map((chip) => chip.label), ['Busca salva: TI em SP']);
  assert.equal(chips[0]!.without.savedSearchId, null);
  assert.equal(filterChips({ ...DEFAULT_SEARCH_STATE, savedSearchId: 7 })[0]!.label, 'Busca salva: nº 7');
});

test('limpar tudo: filtros saem; a ordenação fica', () => {
  const cleared = clearAllFilters(FULL_STATE);
  assert.deepEqual(cleared, { ...DEFAULT_SEARCH_STATE, sort: 'closingAsc' });
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
  assert.equal(appliesMinimumDeadline({ ...DEFAULT_SEARCH_STATE, number: '352/2026' }, TODAY), false, 'com número, procura um edital certo');
  assert.equal(appliesMinimumDeadline({ ...DEFAULT_SEARCH_STATE, purchaseYear: 2026 }, TODAY), true, 'só o ano não muda a regra');
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
  const api = new URLSearchParams(favoritesApiQuery());
  assert.equal(api.get('favoritesOnly'), 'true');
  assert.equal(api.get('openOnly'), 'false');
  assert.equal(api.get('hideDiscarded'), 'false');
  assert.equal(api.get('closingFrom'), null, 'sem prazo mínimo');
  assert.equal(api.get('sort'), 'closingAsc');
  assert.deepEqual([api.get('page'), api.get('perPage')], [null, null]);
});

test('número e ano: valores inválidos na URL ficam de fora', () => {
  assert.equal(parseSearchParams(params('numero=%20%20352%2F2026%20')).number, '352/2026', 'espaços nas pontas saem');
  assert.equal(parseSearchParams(params('numero=PE')).number, '', 'sem dígito');
  assert.equal(parseSearchParams(params(`numero=${'1'.repeat(61)}`)).number, '', 'longo demais');
  assert.equal(parseSearchParams(params('ano=2026')).purchaseYear, 2026);
  for (const year of ['1999', '2101', '26', '20266', 'dois']) {
    assert.equal(parseSearchParams(params(`ano=${year}`)).purchaseYear, null, year);
  }
  assert.deepEqual(
    [isValidNumberSearch('PE 352/26'), isValidNumberSearch('PE'), isValidNumberSearch('1'.repeat(61))],
    [true, false, false],
  );
  const inSavedSearch = parseSearchParams(params('busca=7&numero=352&ano=2025'));
  assert.deepEqual([inSavedSearch.number, inSavedSearch.purchaseYear], ['352', 2025], 'valem também com busca salva');
});

test('ano da compra: do próximo até 4 anos atrás; ano da URL fora da faixa entra na lista', () => {
  assert.deepEqual(purchaseYearOptions('2026-10-06'), [2027, 2026, 2025, 2024, 2023, 2022]);
  assert.deepEqual(purchaseYearOptions('2026-10-06', 2025), [2027, 2026, 2025, 2024, 2023, 2022]);
  assert.deepEqual(purchaseYearOptions('2026-10-06', 2019), [2027, 2026, 2025, 2024, 2023, 2022, 2019]);
});
