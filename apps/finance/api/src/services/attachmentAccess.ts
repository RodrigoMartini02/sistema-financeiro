// Quem pode abrir, enviar e apagar anexos. O acesso ao anexo é o acesso ao dono dele: a despesa ou
// receita que o solicitante vê, o contrato da conta dele, o produto da conta PJ dele. Um envio
// pendente (ainda sem dono) é só de quem enviou. Quem não pode recebe sempre "não encontrado", para
// não revelar quais anexos existem.
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { expenses, incomes, type Attachment } from '../db/schema';
import { resolveVisibleUserIds } from '../utils/familyVisibility';
import { RequestInputError } from '../utils/requestInput';
import { ownerOfAttachment, type AttachmentOwner } from './attachmentModel';
import { findContractForRequester } from './contracts';
import { findAccessibleProduct } from './productAccess';

export const ATTACHMENT_NOT_FOUND_MESSAGE = 'Anexo não encontrado';

const ENTRY_UPLOAD_MESSAGE = 'O anexo de um lançamento é enviado antes de o lançamento ser salvo, sem informar o lançamento';
const ENTRY_REMOVAL_MESSAGE = 'Para remover o anexo de um lançamento, edite o lançamento';

export function attachmentNotFound(): RequestInputError {
  return new RequestInputError(ATTACHMENT_NOT_FOUND_MESSAGE, 404);
}

/** Roda a checagem de acesso ao dono; qualquer recusa vira "anexo não encontrado". */
async function orAttachmentNotFound(check: () => Promise<unknown>): Promise<void> {
  try {
    await check();
  } catch (error) {
    if (error instanceof RequestInputError) {
      throw attachmentNotFound();
    }
    throw error;
  }
}

/**
 * O solicitante vê o lançamento: é dele, ou é de outra pessoa da mesma conta e ele tem a permissão da
 * carteira compartilhada (a mesma regra das listas, no modo "família").
 */
async function canViewEntry(owner: { type: 'expense' | 'income'; id: number }, requesterId: number): Promise<boolean> {
  const [entry] =
    owner.type === 'expense'
      ? await db.select({ userId: expenses.userId, accountId: expenses.accountId }).from(expenses).where(eq(expenses.id, owner.id)).limit(1)
      : await db.select({ userId: incomes.userId, accountId: incomes.accountId }).from(incomes).where(eq(incomes.id, owner.id)).limit(1);
  if (!entry) {
    return false;
  }
  if (entry.userId === requesterId) {
    return true;
  }
  const visibleUserIds = await resolveVisibleUserIds(requesterId, entry.accountId, true);
  return visibleUserIds.includes(entry.userId);
}

/** Pode abrir o anexo: o dono vale o acesso ao dono; o envio pendente é só de quem enviou. */
export async function assertCanViewAttachment(attachment: Attachment, requesterId: number): Promise<void> {
  const owner = ownerOfAttachment(attachment);
  if (owner === null) {
    if (attachment.uploadedBy !== requesterId) {
      throw attachmentNotFound();
    }
    return;
  }
  switch (owner.type) {
    case 'expense':
    case 'income':
      if (!(await canViewEntry(owner, requesterId))) {
        throw attachmentNotFound();
      }
      return;
    case 'contract':
      await orAttachmentNotFound(() => findContractForRequester(requesterId, owner.id));
      return;
    case 'product':
      await orAttachmentNotFound(() => findAccessibleProduct(owner.id, requesterId));
      return;
  }
}

/**
 * Pode enviar um anexo direto para o dono, que já existe: o contrato ou o produto do solicitante.
 * Despesa e receita não recebem envio direto: o arquivo vai antes, pendente, e o lançamento o reivindica.
 */
export async function assertCanAttachTo(owner: AttachmentOwner, requesterId: number): Promise<void> {
  switch (owner.type) {
    case 'contract':
      await findContractForRequester(requesterId, owner.id);
      return;
    case 'product':
      await findAccessibleProduct(owner.id, requesterId);
      return;
    case 'expense':
    case 'income':
      throw new RequestInputError(ENTRY_UPLOAD_MESSAGE);
  }
}

/**
 * Pode apagar o anexo agora. O pendente é de quem enviou; o de contrato ou produto, de quem mexe neles.
 * O de despesa ou receita só sai ao salvar a edição do lançamento (a lista final de anexos vale).
 */
export async function assertCanRemoveAttachment(attachment: Attachment, requesterId: number): Promise<void> {
  const owner = ownerOfAttachment(attachment);
  if (owner === null) {
    if (attachment.uploadedBy !== requesterId) {
      throw attachmentNotFound();
    }
    return;
  }
  if (owner.type === 'expense' || owner.type === 'income') {
    throw new RequestInputError(ENTRY_REMOVAL_MESSAGE);
  }
  await orAttachmentNotFound(() => assertCanAttachTo(owner, requesterId));
}
