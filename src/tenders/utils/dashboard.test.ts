import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSetupGuide,
  closesWithin24Hours,
  expiringBars,
  expiringHint,
  funnelBars,
  groupAgenda,
  pipelineHint,
  savedSearchHealth,
} from './dashboard';
import { formatCompactMoney } from './money';

const TODAY = '2026-10-26';

const at = (day: string, time = '10:00:00') => ({ proposalClosesAt: `${day}T${time}-03:00` });

test('agenda: agrupa por dia do prazo, na ordem recebida, e só mostra os grupos com itens', () => {
  const notices = [
    { id: 1, ...at('2026-10-26', '17:00:00') },
    { id: 2, ...at('2026-10-26', '18:00:00') },
    { id: 3, ...at('2026-10-27') },
    { id: 4, ...at('2026-10-29') },
    { id: 5, ...at('2026-11-02') },
    { id: 6, ...at('2026-11-03') },
    { id: 7, proposalClosesAt: null },
  ];
  const groups = groupAgenda(notices, TODAY);
  assert.deepEqual(
    groups.map((group) => [group.key, group.label, group.items.map((item) => item.id)]),
    [
      ['today', 'Hoje', [1, 2]],
      ['tomorrow', 'Amanhã', [3]],
      ['week', 'Esta semana', [4, 5]],
      ['later', 'Depois', [6, 7]],
    ],
    'hoje + 7 dias ainda é "esta semana"; sem prazo vai para "depois"',
  );
  assert.deepEqual(groupAgenda([{ id: 9, ...at('2026-11-20') }], TODAY).map((group) => group.key), ['later']);
  assert.deepEqual(groupAgenda([], TODAY), []);
});

test('agenda: prazo de dia que já passou no relógio local cai em "hoje", não some', () => {
  const [group] = groupAgenda([{ id: 1, ...at('2026-10-25') }], TODAY);
  assert.equal(group?.key, 'today');
});

test('prazo em até 24 h: só antes de acabar e dentro do dia', () => {
  const now = new Date('2026-10-26T12:00:00-03:00');
  assert.equal(closesWithin24Hours('2026-10-26T17:00:00-03:00', now), true);
  assert.equal(closesWithin24Hours('2026-10-27T12:00:00-03:00', now), true, 'o limite de 24 h entra');
  assert.equal(closesWithin24Hours('2026-10-27T12:01:00-03:00', now), false);
  assert.equal(closesWithin24Hours('2026-10-26T11:59:00-03:00', now), false, 'já encerrado');
  assert.equal(closesWithin24Hours(null, now), false);
  assert.equal(closesWithin24Hours('lixo', now), false);
});

test('busca salva: pausada, ativa sem novos em 30 dias, ou em dia', () => {
  assert.equal(savedSearchHealth({ active: false, newLast30Days: 9 }), 'paused');
  assert.equal(savedSearchHealth({ active: true, newLast30Days: 0 }), 'quiet');
  assert.equal(savedSearchHealth({ active: true, newLast30Days: 1 }), 'active');
});

test('guia da conta vazia: só sem busca salva e sem acompanhamento; cada passo marca o que já foi feito', () => {
  const empty = buildSetupGuide({ hasSavedSearch: false, hasTracking: false, hasFavorite: false, notificationsEnabled: false }, false);
  assert.equal(empty.show, true);
  assert.deepEqual(empty.steps.map((step) => [step.key, step.done, step.to]), [
    ['search', false, '/buscas'],
    ['favorite', false, '/buscar'],
    ['notifications', false, '/buscas'],
    ['contracts', false, '/contratos'],
  ]);

  assert.equal(buildSetupGuide({ hasSavedSearch: true, hasTracking: false, hasFavorite: false, notificationsEnabled: true }, false).show, false);
  assert.equal(buildSetupGuide({ hasSavedSearch: false, hasTracking: true, hasFavorite: false, notificationsEnabled: false }, false).show, false);

  const partial = buildSetupGuide({ hasSavedSearch: false, hasTracking: false, hasFavorite: true, notificationsEnabled: false }, true);
  assert.deepEqual(partial.steps.map((step) => step.done), [false, true, false, true]);
});

test('barras do funil e dos contratos que vencem, e os textos dos indicadores', () => {
  assert.deepEqual(funnelBars({ analyzing: 4, participating: 2, discarded: 7, enteredLast7Days: 1, enteredLast30Days: 3 }), [
    { key: 'analyzing', label: 'Em análise', count: 4 },
    { key: 'participating', label: 'Vou participar', count: 2 },
    { key: 'discarded', label: 'Descartados', count: 7 },
  ]);
  assert.deepEqual(expiringBars({ within30Days: 2, within60Days: 5, within90Days: 9 }), [
    { key: '30', label: 'Até 30 dias', count: 2 },
    { key: '60', label: 'Até 60 dias', count: 5 },
    { key: '90', label: 'Até 90 dias', count: 9 },
  ]);

  assert.equal(pipelineHint({ estimatedValue: 10, noticesWithoutValue: 0 }), 'Valor estimado dos acompanhados abertos');
  assert.equal(pipelineHint({ estimatedValue: 10, noticesWithoutValue: 1 }), 'Estimado; 1 edital sem valor');
  assert.equal(pipelineHint({ estimatedValue: 10, noticesWithoutValue: 1200 }), 'Estimado; 1.200 editais sem valor');

  assert.equal(expiringHint({ within60Days: 0, within90Days: 0, sources: { savedSearches: 0, favorites: 0 } }), 'Salve uma busca de contratos para acompanhar');
  assert.equal(expiringHint({ within60Days: 5, within90Days: 1200, sources: { savedSearches: 1, favorites: 0 } }), 'Em 60 dias: 5 · em 90: 1.200');
});

test('valor compacto dos indicadores', () => {
  assert.match(formatCompactMoney(1500), /^R\$\s1,5\smil$/);
  assert.match(formatCompactMoney(12_300_000), /^R\$\s12,3\smi$/);
  assert.match(formatCompactMoney(0), /^R\$\s0$/);
});
