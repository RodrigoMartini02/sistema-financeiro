import assert from 'node:assert/strict';
import test from 'node:test';
import type { DashboardView, ModalityCard } from '../types';
import {
  MAX_MODALITY_SERIES,
  agencyItems,
  buildPublicationChart,
  coverageNote,
  deadlineWeekItems,
  expiringCategoryItems,
  expiringHint,
  expiringWindowItems,
  funnelItems,
  modalityColorIndex,
  modalityLink,
  modalitySparkline,
  sphereItems,
  stateItems,
} from './dashboard';

const card = (id: number, name: string): ModalityCard => ({
  id,
  name,
  published30Days: 0,
  open: 0,
  analyzing: 0,
  participating: 0,
  participated: 0,
  daily: [],
});

function view(overrides: Partial<Pick<DashboardView['publications'], 'daily' | 'monthly' | 'coverageSince'>> = {}, modalities = [card(8, 'Dispensa'), card(6, 'Pregão – Eletrônico')]) {
  return {
    modalities,
    publications: {
      daily: [
        { day: '2026-10-24', byModality: { '6': 3, '8': 1 } },
        { day: '2026-10-25', byModality: { '6': 5 } },
      ],
      monthly: [
        { month: '2026-09', partial: false, byModality: { '8': 4 } },
        { month: '2026-10', partial: true, byModality: { '6': 8, '8': 1 } },
      ],
      coverageSince: null,
      ...overrides,
    },
  };
}

test('cores das modalidades: seguem a modalidade e não a posição; as 4 da coleta ficam nas 4 primeiras cores', () => {
  assert.deepEqual([6, 8, 4, 7].map(modalityColorIndex), [0, 1, 2, 3]);
  assert.equal(modalityColorIndex(13) > modalityColorIndex(1), true);
  assert.equal(modalityColorIndex(99), 13, 'fora da lista fica depois de todas');
});

test('publicações por dia: séries só das modalidades com dado, na ordem da cor; barras com rótulo, título e total', () => {
  const chart = buildPublicationChart(view(), 'daily');
  assert.deepEqual(
    chart.series,
    [
      { key: '6', label: 'Pregão – Eletrônico', colorIndex: 0 },
      { key: '8', label: 'Dispensa', colorIndex: 1 },
    ],
    'a ordem é a da cor (Pregão Eletrônico antes de Dispensa), mesmo vindo depois na lista',
  );
  assert.deepEqual(chart.bars[0], { key: '2026-10-24', label: '24/10', title: '24/10/2026', values: { '6': 3, '8': 1 }, total: 4 });
  assert.deepEqual(chart.bars[1]?.values, { '6': 5, '8': 0 }, 'a modalidade sem edital no dia vem com zero');
  assert.equal(chart.total, 9);
});

test('publicações por mês: rótulo "mês/ano", e o mês corrente avisa que é até ontem', () => {
  const chart = buildPublicationChart(view(), 'monthly');
  assert.deepEqual(chart.bars.map((bar) => [bar.label, bar.title]), [
    ['set/26', 'setembro de 2026'],
    ['out/26', 'outubro de 2026 (até ontem)'],
  ]);
  assert.equal(chart.total, 13);
});

test('publicações: a modalidade sem edital na janela não ganha série, e acima de 8 o resto vira "Outras" em cinza', () => {
  const none = buildPublicationChart(view({}, [card(6, 'A'), card(13, 'Sem dado')]), 'daily');
  assert.deepEqual(none.series.map((series) => series.key), ['6']);

  const ids = [6, 8, 4, 7, 1, 2, 3, 5, 9, 10];
  const modalities = ids.map((id) => card(id, `Modalidade ${id}`));
  const byModality = Object.fromEntries(ids.map((id) => [String(id), 1]));
  const many = buildPublicationChart(view({ daily: [{ day: '2026-10-25', byModality }] }, modalities), 'daily');
  assert.equal(many.series.length, MAX_MODALITY_SERIES + 1);
  assert.deepEqual(many.series.at(-1), { key: 'other', label: 'Outras', colorIndex: null });
  assert.equal(many.bars[0]?.values['other'], 2, 'as duas que sobraram (9 e 10) somam em Outras');
  assert.equal(many.bars[0]?.total, 10, 'o total não muda com o agrupamento');
});

test('aviso de cobertura: só quando a base é mais nova que o começo da janela', () => {
  assert.equal(coverageNote(null, '2026-09-26'), null);
  assert.equal(coverageNote('2026-09-26', '2026-09-26'), null, 'a base já existia no primeiro dia');
  assert.equal(coverageNote('2026-01-01', '2026-09-26'), null);
  assert.equal(
    coverageNote('2026-10-10', '2026-09-26'),
    'A base começou a receber editais em 10/10/2026; antes disso os números aparecem menores que o real.',
  );
  assert.match(buildPublicationChart(view({ coverageSince: '2026-10-25' }), 'daily').note ?? '', /25\/10\/2026/);
  assert.match(buildPublicationChart(view({ coverageSince: '2026-09-20' }), 'monthly').note ?? '', /20\/09\/2026/, 'no mês, o começo é o dia 1 do primeiro mês');
  assert.equal(buildPublicationChart(view({ coverageSince: '2026-09-01' }), 'monthly').note, null);
});

test('mini-gráfico do card de modalidade e o link que filtra Editais pela modalidade', () => {
  const bars = modalitySparkline({ daily: [0, 4] }, ['2026-10-24', '2026-10-25']);
  assert.deepEqual(bars[1], { key: '2026-10-25', label: '25/10', title: '25/10/2026', values: { published: 4 }, total: 4 });
  assert.match(modalityLink(6), /^\/buscar\?.*modalidade=6/);
});

test('funil: % de cada etapa sobre a anterior, sem % quando a anterior é zero', () => {
  assert.deepEqual(funnelItems({ tracked: 20, participating: 5, participated: 1 }), [
    { key: 'tracked', label: 'Acompanhados', count: 20 },
    { key: 'participating', label: 'Vou participar', count: 5, suffix: '25%' },
    { key: 'participated', label: 'Participei', count: 1, suffix: '20%' },
  ]);
  assert.deepEqual(funnelItems({ tracked: 0, participating: 0, participated: 0 }).map((item) => item.suffix), [undefined, undefined, undefined]);
});

test('carga de prazos: cada semana vai do dia inicial a seis dias depois', () => {
  assert.deepEqual(deadlineWeekItems([{ startDay: '2026-10-26', count: 3 }, { startDay: '2026-11-02', count: 0 }]), [
    { key: '2026-10-26', label: '26/10 a 01/11', count: 3 },
    { key: '2026-11-02', label: '02/11 a 08/11', count: 0 },
  ]);
  assert.equal(deadlineWeekItems([{ startDay: '2026-12-28', count: 1 }])[0]?.label, '28/12 a 03/01', 'na virada do ano');
});

test('esfera, órgãos, UF e contratos que vencem', () => {
  assert.deepEqual(sphereItems([{ sphere: 'M', count: 9 }, { sphere: 'F', count: 3 }, { sphere: null, count: 1 }, { sphere: 'X', count: 1 }]).map((item) => item.label), [
    'Municipal',
    'Federal',
    'Não informada',
    'X',
  ]);

  const agencies = agencyItems([
    { cnpj: '22493902000140', name: 'Prefeitura A', count: 7 },
    { cnpj: '11111111111111', name: null, count: 2 },
  ]);
  assert.deepEqual(agencies[0], { key: '22493902000140', label: 'Prefeitura A', count: 7, to: '/cnpj/22493902000140' });
  assert.equal(agencies[1]?.to, undefined, 'CNPJ inválido não vira link');
  assert.equal(agencies[1]?.label, '11.111.111/1111-11', 'sem nome, o CNPJ formatado');

  assert.deepEqual(stateItems([{ state: 'SP', count: 4 }]), [{ key: 'SP', label: 'SP', count: 4 }]);

  assert.deepEqual(expiringWindowItems({ within30Days: 2, within60Days: 5, within90Days: 9 }).map((item) => [item.label, item.count]), [
    ['Até 30 dias', 2],
    ['Até 60 dias', 5],
    ['Até 90 dias', 9],
  ]);
  assert.deepEqual(
    expiringCategoryItems([
      { categoryId: 7, categoryName: 'Obras', count: 3 },
      { categoryId: null, categoryName: null, count: 1 },
    ]),
    [
      { key: '7', label: 'Obras', count: 3 },
      { key: 'none', label: 'Sem categoria', count: 1 },
    ],
  );
  assert.equal(expiringHint({ within60Days: 0, within90Days: 0, sources: { savedSearches: 0, favorites: 0 } }), 'Salve uma busca de contratos para acompanhar');
  assert.equal(expiringHint({ within60Days: 5, within90Days: 1200, sources: { savedSearches: 1, favorites: 0 } }), 'Em 60 dias: 5 · em 90: 1.200');
});
