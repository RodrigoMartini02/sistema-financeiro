import assert from 'node:assert/strict';
import test from 'node:test';
import type { CollectionRun } from '../types';
import { runDurationLabel, runErrorLines } from './collectionRuns';
import { NOTIFICATION_PANEL_FILTERS, notificationTarget, notificationsQuery } from './notifications';

test('notificação: o clique abre o link gravado, relativo à base do app', () => {
  assert.equal(notificationTarget({ link: '/editais/123', noticeId: 123 }), '/editais/123');
  assert.equal(notificationTarget({ link: ' /editais/9 ', noticeId: null }), '/editais/9');
  assert.equal(notificationTarget({ link: '/licitacoes/app/editais/5', noticeId: 5 }), '/editais/5', 'link antigo com a base');
  assert.equal(notificationTarget({ link: '/licitacoes/app', noticeId: null }), '/');
});

test('notificação: link fora do app cai no edital, ou em nada', () => {
  assert.equal(notificationTarget({ link: 'https://exemplo.com/x', noticeId: 42 }), '/editais/42');
  assert.equal(notificationTarget({ link: '//exemplo.com/x', noticeId: 42 }), '/editais/42', 'sem esquema, mas outro site');
  assert.equal(notificationTarget({ link: 'javascript:alert(1)', noticeId: null }), null);
  assert.equal(notificationTarget({ link: '', noticeId: null }), null);
});

test('notificação: query da lista e do painel do sino', () => {
  assert.equal(notificationsQuery(NOTIFICATION_PANEL_FILTERS), 'page=1&perPage=10');
  assert.equal(
    notificationsQuery({ unreadOnly: true, type: 'PRAZO_1D', page: 2, perPage: 50 }),
    'unreadOnly=true&type=PRAZO_1D&page=2&perPage=50',
  );
});

const run = (startedAt: string | null, finishedAt: string | null): Pick<CollectionRun, 'startedAt' | 'finishedAt'> => ({ startedAt, finishedAt });

test('coleta: duração da execução', () => {
  assert.equal(runDurationLabel(run('2026-10-06T03:00:00-03:00', '2026-10-06T03:00:45-03:00')), '45 s');
  assert.equal(runDurationLabel(run('2026-10-06T03:00:00-03:00', '2026-10-06T03:03:05-03:00')), '3 min 05 s');
  assert.equal(runDurationLabel(run('2026-10-06T03:00:00-03:00', '2026-10-06T04:02:10-03:00')), '1 h 02 min');
  assert.equal(runDurationLabel(run('2026-10-06T03:00:00-03:00', null)), '—', 'executando');
});

test('coleta: erros guardados em texto, com o total dos que ficaram de fora', () => {
  assert.deepEqual(
    runErrorLines({
      details: {
        errors: [
          { kind: 'record', controlNumber: '123-1-000001/2026', reason: 'sem prazo de proposta' },
          { kind: 'request', params: { pagina: 3 }, status: 429, message: 'PNCP respondeu 429' },
          { kind: 'fatal', message: 'conexão recusada' },
          { kind: 'estranho' },
        ],
        omittedErrors: 3,
      },
    }),
    [
      '123-1-000001/2026: sem prazo de proposta',
      'PNCP respondeu 429',
      'conexão recusada',
      '{"kind":"estranho"}',
      'e mais 3 erros não guardados',
    ],
  );
  assert.deepEqual(runErrorLines({ details: {} }), []);
});
