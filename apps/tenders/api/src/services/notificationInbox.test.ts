import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationTitle } from './notificationInbox';

test('aviso de edital alterado gravado com o título antigo aparece com o atual; os outros ficam como estão', () => {
  assert.equal(notificationTitle('Edital acompanhado foi alterado no PNCP'), 'Edital acompanhado foi alterado');
  assert.equal(notificationTitle('Edital acompanhado foi alterado'), 'Edital acompanhado foi alterado');
  assert.equal(notificationTitle('Novo edital: Limpeza'), 'Novo edital: Limpeza');
});
