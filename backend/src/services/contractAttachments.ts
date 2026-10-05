// Anexos do contrato no disco do servidor (`uploads/contratos`, o disco do
// Render). O arquivo já chega conferido (contractAttachmentType): o nome no
// disco é gerado aqui e o tipo gravado é o do conteúdo.
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { contractAttachments, type ContractAttachment } from '../modules/contracts/db/schema';
import { RequestInputError } from '../utils/requestInput';
import type { CheckedAttachment } from './contractAttachmentType';
import type { AttachmentKind } from './contractTypes';

export const CONTRACT_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'contratos');
const ATTACHMENT_NOT_FOUND_MESSAGE = 'Anexo não encontrado';

export interface ContractAttachmentView {
  id: number;
  contractId: number;
  originalName: string;
  kind: AttachmentKind;
  size: number;
  createdAt: Date;
}

function toView(attachment: ContractAttachment): ContractAttachmentView {
  return {
    id: attachment.id,
    contractId: attachment.contractId,
    originalName: attachment.originalName,
    kind: attachment.kind,
    size: attachment.size,
    createdAt: attachment.createdAt,
  };
}

/** Caminho do arquivo no disco: só o nome, nunca uma pasta vinda de fora. */
export function attachmentPath(fileName: string): string {
  return path.join(CONTRACT_UPLOAD_DIR, path.basename(fileName));
}

export async function listContractAttachments(contractId: number): Promise<ContractAttachmentView[]> {
  const rows = await db
    .select()
    .from(contractAttachments)
    .where(eq(contractAttachments.contractId, contractId))
    .orderBy(desc(contractAttachments.createdAt));
  return rows.map(toView);
}

/** Grava o arquivo e o registro; se o registro falhar, o arquivo sai do disco. */
export async function saveContractAttachment(
  contract: { id: number; accountId: number },
  uploaderId: number,
  file: CheckedAttachment & { content: Uint8Array },
): Promise<ContractAttachmentView> {
  fs.mkdirSync(CONTRACT_UPLOAD_DIR, { recursive: true });
  const fileName = `${randomUUID()}.${file.kind}`;
  const filePath = attachmentPath(fileName);
  await fs.promises.writeFile(filePath, file.content);
  try {
    const [attachment] = await db
      .insert(contractAttachments)
      .values({
        contractId: contract.id,
        accountId: contract.accountId,
        uploadedBy: uploaderId,
        originalName: file.originalName,
        fileName,
        kind: file.kind,
        size: file.size,
      })
      .returning();
    return toView(attachment!);
  } catch (error) {
    await fs.promises.rm(filePath, { force: true });
    throw error;
  }
}

/** Anexo pelo id (a conta é conferida pelo contrato dele, na rota). */
export async function findAttachment(attachmentId: number): Promise<ContractAttachment> {
  const [attachment] = await db.select().from(contractAttachments).where(eq(contractAttachments.id, attachmentId)).limit(1);
  if (!attachment) {
    throw new RequestInputError(ATTACHMENT_NOT_FOUND_MESSAGE, 404);
  }
  return attachment;
}

export function attachmentNotFound(): RequestInputError {
  return new RequestInputError(ATTACHMENT_NOT_FOUND_MESSAGE, 404);
}

export async function deleteContractAttachment(attachment: ContractAttachment): Promise<void> {
  await db.delete(contractAttachments).where(eq(contractAttachments.id, attachment.id));
  removeAttachmentFiles([attachment.fileName]);
}

/** Arquivos que ficaram sem registro (anexo ou contrato excluído). Falha no disco não desfaz a exclusão. */
export function removeAttachmentFiles(fileNames: string[]): void {
  for (const fileName of fileNames) {
    fs.promises.rm(attachmentPath(fileName), { force: true }).catch((error: unknown) => {
      console.error('Remove contract attachment file error:', { fileName, error });
    });
  }
}
