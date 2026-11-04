import assert from 'node:assert/strict';
import test from 'node:test';
import type { Attachment } from '../db/schema/attachments';
import { RequestInputError } from '../utils/requestInput';
import {
  diffAttachmentIds, ownerOfAttachment, readAttachmentIds, readOptionalAttachmentIds, rejectLegacyAttachments, toAttachmentView,
} from './attachmentModel';
import { MAX_ATTACHMENTS_PER_REQUEST } from './attachmentRules';

const FIRST = '3f1b9e1c-8d52-4b8e-9d0e-0a1b2c3d4e5f';
const SECOND = '7a2c4d6e-1b3f-4a5c-8e7d-9f0a1b2c3d4e';
const THIRD = 'c0ffee00-1234-4abc-8def-001122334455';

const baseRow: Attachment = {
  id: FIRST,
  uploadedBy: 7,
  ownerType: 'expense',
  expenseId: null,
  incomeId: null,
  contractId: null,
  productId: null,
  originalName: 'nota.pdf',
  contentType: 'application/pdf',
  size: 1234,
  storageKey: `anexos/${FIRST}`,
  position: 0,
  createdAt: new Date('2026-11-03T17:20:00.000Z'),
};

function rejects(value: unknown): void {
  assert.throws(
    () => readAttachmentIds(value, 'Anexos inválidos'),
    (error: unknown) => error instanceof RequestInputError && error.status === 400 && error.message === 'Anexos inválidos',
  );
}

test('ids de anexos do pedido: ausente vale lista vazia, UUID em minúsculas, sem repetição', () => {
  assert.deepEqual(readAttachmentIds(undefined), []);
  assert.deepEqual(readAttachmentIds(null), []);
  assert.deepEqual(readAttachmentIds([]), []);
  assert.deepEqual(readAttachmentIds([FIRST, SECOND.toUpperCase()]), [FIRST, SECOND]);
});

test('ids de anexos do pedido: recusa o que não é lista de UUID única e de tamanho razoável', () => {
  rejects('3f1b9e1c-8d52-4b8e-9d0e-0a1b2c3d4e5f');
  rejects({ 0: FIRST });
  rejects([FIRST, FIRST]);
  rejects([FIRST, FIRST.toUpperCase()]);
  rejects([42]);
  rejects([{ id: FIRST }]);
  rejects(['../../etc/passwd']);
  rejects([`${FIRST}; DROP TABLE anexos`]);
  rejects(Array.from({ length: MAX_ATTACHMENTS_PER_REQUEST + 1 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`));
  assert.equal(
    readAttachmentIds(Array.from({ length: MAX_ATTACHMENTS_PER_REQUEST }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)).length,
    MAX_ATTACHMENTS_PER_REQUEST,
  );
});

test('ids de anexos opcionais: ausente é "não mexer", lista vazia é "tirar todos"', () => {
  assert.equal(readOptionalAttachmentIds(undefined), undefined);
  assert.equal(readOptionalAttachmentIds(null), undefined);
  assert.deepEqual(readOptionalAttachmentIds([]), []);
  assert.deepEqual(readOptionalAttachmentIds([FIRST.toUpperCase()]), [FIRST]);
  assert.throws(() => readOptionalAttachmentIds('não é lista', 'Anexos inválidos'), RequestInputError);
  assert.throws(() => readOptionalAttachmentIds([FIRST, FIRST]), RequestInputError);
});

test('o pedido de uma aba antiga, com o arquivo dentro do lançamento, é recusado em vez de perder o anexo', () => {
  assert.throws(
    () => rejectLegacyAttachments({ attachments: [{ id: 'anexo_1', nome: 'nota.pdf', dados: 'JVBERi0=' }] }),
    (error: unknown) => error instanceof RequestInputError && /Atualize a página/.test(error.message),
  );
  rejectLegacyAttachments({});
  rejectLegacyAttachments({ attachments: null });
  rejectLegacyAttachments({ attachments: [] });
  rejectLegacyAttachments({ attachmentIds: [FIRST] });
});

test('a lista final de anexos de um dono: quem entra e quem sai', () => {
  assert.deepEqual(diffAttachmentIds([], []), { toLink: [], toRemove: [] });
  assert.deepEqual(diffAttachmentIds([FIRST, SECOND], [FIRST, SECOND]), { toLink: [], toRemove: [] });
  assert.deepEqual(diffAttachmentIds([FIRST, SECOND], [SECOND, THIRD]), { toLink: [THIRD], toRemove: [FIRST] });
  assert.deepEqual(diffAttachmentIds([], [FIRST, SECOND]), { toLink: [FIRST, SECOND], toRemove: [] });
  assert.deepEqual(diffAttachmentIds([FIRST, SECOND], []), { toLink: [], toRemove: [FIRST, SECOND] });
});

test('o dono do anexo vem da coluna preenchida; sem coluna, é um envio pendente', () => {
  assert.equal(ownerOfAttachment(baseRow), null);
  assert.deepEqual(ownerOfAttachment({ ...baseRow, expenseId: 11 }), { type: 'expense', id: 11 });
  assert.deepEqual(ownerOfAttachment({ ...baseRow, ownerType: 'income', incomeId: 12 }), { type: 'income', id: 12 });
  assert.deepEqual(ownerOfAttachment({ ...baseRow, ownerType: 'contract', contractId: 13 }), { type: 'contract', id: 13 });
  assert.deepEqual(ownerOfAttachment({ ...baseRow, ownerType: 'product', productId: SECOND }), { type: 'product', id: SECOND });
});

test('o anexo para a tela não leva a chave do R2, o dono nem quem enviou', () => {
  const view = toAttachmentView({ ...baseRow, expenseId: 11 });
  assert.deepEqual(view, {
    id: FIRST,
    name: 'nota.pdf',
    contentType: 'application/pdf',
    size: 1234,
    createdAt: '2026-11-03T17:20:00.000Z',
  });
  assert.doesNotMatch(JSON.stringify(view), /anexos\/|storageKey|uploadedBy|expenseId/);
});
