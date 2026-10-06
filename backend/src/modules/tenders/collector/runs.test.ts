import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { mapPncpRecord, type TenderNoticeRow } from './mapping';
import { noticeSkipReason } from './runs';

function realNoticeRow(overrides: Record<string, unknown> = {}): TenderNoticeRow {
  const page = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'proposta-page.json'), 'utf8')) as {
    data: Record<string, unknown>[];
  };
  const mapped = mapPncpRecord({ ...page.data[0], ...overrides });
  if (!mapped.ok) {
    assert.fail(`registro deveria ser válido: ${mapped.reason}`);
  }
  return mapped.row;
}

const NOW_IN_BRASILIA = '2026-10-05T12:00:00';

test('edital sem prazo de proposta fica fora da coleta, na varredura e na incremental', () => {
  const withoutDeadline = realNoticeRow({ dataEncerramentoProposta: null });
  assert.equal(noticeSkipReason(withoutDeadline, NOW_IN_BRASILIA, false), 'withoutDeadline');
  assert.equal(noticeSkipReason(withoutDeadline, NOW_IN_BRASILIA, true), 'withoutDeadline');
});

test('encerrado só fica de fora quando a execução pede (incremental)', () => {
  const closed = realNoticeRow({ dataEncerramentoProposta: '2026-10-05T11:59:59' });
  assert.equal(noticeSkipReason(closed, NOW_IN_BRASILIA, true), 'closed');
  assert.equal(noticeSkipReason(closed, NOW_IN_BRASILIA, false), null);
});

test('edital com prazo no futuro entra', () => {
  const open = realNoticeRow({ dataEncerramentoProposta: '2026-10-20T09:30:00' });
  assert.equal(noticeSkipReason(open, NOW_IN_BRASILIA, true), null);
  assert.equal(noticeSkipReason(open, NOW_IN_BRASILIA, false), null);
});
