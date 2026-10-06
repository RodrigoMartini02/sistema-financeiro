import assert from 'node:assert/strict';
import test from 'node:test';
import type { NoticeListItem, TrackingStatus } from '../types';
import { BOARD_COLUMN_LIMIT, buildBoardColumns, trackingColumnQuery } from './trackingBoard';

const NOW = new Date('2026-10-06T12:00:00-03:00');

function notice(id: number, status: TrackingStatus, proposalClosesAt: string | null): NoticeListItem {
  return {
    id,
    pncpControlNumber: `ctrl-${id}`,
    procurementObject: `Edital ${id}`,
    agencyCnpj: null,
    agencyName: null,
    state: 'SP',
    cityName: null,
    cityIbgeCode: null,
    modalityId: 6,
    modalityName: 'Pregão - Eletrônico',
    situationId: 1,
    situationName: 'Divulgada no PNCP',
    isPriceRegistration: false,
    estimatedTotalValue: null,
    publishedAt: null,
    proposalOpensAt: null,
    proposalClosesAt,
    pncpLink: null,
    sourceSystemLink: null,
    tracking: { status, updatedAt: '2026-10-05T10:00:00-03:00' },
    isFavorite: false,
    highlightedExcerpt: null,
  };
}

const ids = (items: NoticeListItem[]) => items.map((item) => item.id);

test('quadro: coluna pede o status com encerrados e descartados, por prazo, até 100', () => {
  const query = new URLSearchParams(trackingColumnQuery('DESCARTADO'));
  assert.deepEqual(query.getAll('trackingStatus'), ['DESCARTADO']);
  assert.equal(query.get('openOnly'), 'false');
  assert.equal(query.get('hideDiscarded'), 'false');
  assert.equal(query.get('sort'), 'closingAsc');
  assert.equal(query.get('perPage'), String(BOARD_COLUMN_LIMIT));
  assert.equal(query.get('q'), null);
});

test('quadro: prazo à frente primeiro, depois sem prazo e os encerrados do mais recente ao mais antigo', () => {
  const columns = buildBoardColumns(
    {
      ANALISAR: [
        notice(1, 'ANALISAR', '2026-09-01T10:00:00-03:00'),
        notice(2, 'ANALISAR', '2026-10-20T10:00:00-03:00'),
        notice(3, 'ANALISAR', null),
        notice(4, 'ANALISAR', '2026-10-07T10:00:00-03:00'),
        notice(5, 'ANALISAR', '2026-10-05T10:00:00-03:00'),
      ],
    },
    {},
    NOW,
  );
  assert.deepEqual(ids(columns.ANALISAR), [4, 2, 3, 5, 1]);
  assert.deepEqual(columns.PARTICIPAR, []);
  assert.deepEqual(columns.DESCARTADO, []);
});

test('quadro: mudança em gravação já aparece na coluna de destino, com o status novo', () => {
  const columns = buildBoardColumns(
    {
      ANALISAR: [notice(1, 'ANALISAR', '2026-10-10T10:00:00-03:00'), notice(2, 'ANALISAR', '2026-10-11T10:00:00-03:00')],
      PARTICIPAR: [notice(3, 'PARTICIPAR', '2026-10-09T10:00:00-03:00')],
    },
    { 2: 'PARTICIPAR', 3: 'DESCARTADO' },
    NOW,
  );
  assert.deepEqual(ids(columns.ANALISAR), [1]);
  assert.deepEqual(ids(columns.PARTICIPAR), [2]);
  assert.equal(columns.PARTICIPAR[0]?.tracking?.status, 'PARTICIPAR');
  assert.deepEqual(ids(columns.DESCARTADO), [3]);
  assert.equal(columns.DESCARTADO[0]?.tracking?.status, 'DESCARTADO');
});

test('quadro: edital que veio em duas colunas entra uma vez só', () => {
  const columns = buildBoardColumns(
    {
      ANALISAR: [notice(7, 'ANALISAR', '2026-10-10T10:00:00-03:00')],
      PARTICIPAR: [notice(7, 'PARTICIPAR', '2026-10-10T10:00:00-03:00')],
    },
    {},
    NOW,
  );
  assert.deepEqual(ids(columns.ANALISAR), [7]);
  assert.deepEqual(columns.PARTICIPAR, []);
});
