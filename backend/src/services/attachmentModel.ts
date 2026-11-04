// Tipos e funções puras dos anexos (sem banco nem R2), para as rotas, os serviços e os testes.
import type { Attachment } from '../db/schema/attachments';
import { RequestInputError } from '../utils/requestInput';
import { MAX_ATTACHMENTS_PER_REQUEST } from './attachmentRules';
import { isUuid } from './catalogo';

/** Dono que já existe: despesa, receita e contrato têm id numérico; produto do catálogo, UUID. */
export type AttachmentOwner =
  | { type: 'expense'; id: number }
  | { type: 'income'; id: number }
  | { type: 'contract'; id: number }
  | { type: 'product'; id: string };

/** Vários donos do mesmo tipo, para buscar os anexos de uma lista numa consulta só. */
export type AttachmentOwnerSet =
  | { type: 'expense' | 'income' | 'contract'; ids: readonly number[] }
  | { type: 'product'; ids: readonly string[] };

/** O anexo como as telas recebem: sem a chave do R2 nem o dono. */
export interface AttachmentView {
  id: string;
  name: string;
  contentType: string;
  size: number;
  createdAt: string;
}

export function toAttachmentView(attachment: Attachment): AttachmentView {
  return {
    id: attachment.id,
    name: attachment.originalName,
    contentType: attachment.contentType,
    size: attachment.size,
    createdAt: attachment.createdAt.toISOString(),
  };
}

/** O dono do anexo; null quando é um envio pendente, ainda sem dono. */
export function ownerOfAttachment(attachment: Attachment): AttachmentOwner | null {
  if (attachment.expenseId !== null) return { type: 'expense', id: attachment.expenseId };
  if (attachment.incomeId !== null) return { type: 'income', id: attachment.incomeId };
  if (attachment.contractId !== null) return { type: 'contract', id: attachment.contractId };
  if (attachment.productId !== null) return { type: 'product', id: attachment.productId };
  return null;
}

/**
 * Ids de anexos que o pedido reivindica: lista de UUID sem repetição. Ausente vale lista vazia
 * (nenhum anexo). Qualquer outra coisa recusa o pedido com a mensagem.
 */
export function readAttachmentIds(value: unknown, message = 'Anexos inválidos'): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS_PER_REQUEST) {
    throw new RequestInputError(message);
  }
  const ids = value.map((item: unknown) => {
    if (typeof item !== 'string' || !isUuid(item)) {
      throw new RequestInputError(message);
    }
    return item.toLowerCase();
  });
  if (new Set(ids).size !== ids.length) {
    throw new RequestInputError(message);
  }
  return ids;
}

/**
 * Recusa o pedido de uma aba antiga, que ainda manda o arquivo dentro do lançamento (campo `attachments`, em base64):
 * ele não seria gravado, e a pessoa perderia o anexo sem saber. Aba aberta antes da troca (ou o app instalado com a
 * versão antiga em cache) é quem chega aqui.
 */
export function rejectLegacyAttachments(record: Record<string, unknown>): void {
  const legacy = record['attachments'];
  if (Array.isArray(legacy) && legacy.length > 0) {
    throw new RequestInputError('O envio de anexos mudou. Atualize a página e anexe os arquivos de novo.');
  }
}

/**
 * Como readAttachmentIds, mas ausente (undefined ou null) devolve undefined: "o pedido não fala de anexos", e quem
 * edita um lançamento não mexe neles. Lista vazia é diferente: tira todos.
 */
export function readOptionalAttachmentIds(value: unknown, message?: string): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return readAttachmentIds(value, message);
}

/** O que muda quando a lista de anexos de um dono passa a ser `finalIds`: quem entra e quem sai. */
export function diffAttachmentIds(
  currentIds: readonly string[],
  finalIds: readonly string[],
): { toLink: string[]; toRemove: string[] } {
  const current = new Set(currentIds);
  const final = new Set(finalIds);
  return {
    toLink: finalIds.filter((id) => !current.has(id)),
    toRemove: currentIds.filter((id) => !final.has(id)),
  };
}
