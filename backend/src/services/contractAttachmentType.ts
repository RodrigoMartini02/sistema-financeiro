// Conferência do arquivo enviado como anexo do contrato, sem banco nem disco.
// O tipo vale pelo conteúdo (os primeiros bytes), nunca pelo nome nem pelo
// tipo que o navegador informa: um HTML renomeado para .pdf é recusado.
import path from 'path';
import { RequestInputError } from '../utils/requestInput';
import { MAX_ATTACHMENT_BYTES, type AttachmentKind } from './contractTypes';

const MAX_ORIGINAL_NAME = 255;

const SIGNATURES: ReadonlyArray<{ kind: AttachmentKind; bytes: readonly number[] }> = [
  { kind: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { kind: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { kind: 'jpg', bytes: [0xff, 0xd8, 0xff] },
];

const EXTENSIONS: Record<AttachmentKind, readonly string[]> = {
  pdf: ['.pdf'],
  jpg: ['.jpg', '.jpeg'],
  png: ['.png'],
};

export const ATTACHMENT_MIME_TYPES: Record<AttachmentKind, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  png: 'image/png',
};

export const ATTACHMENT_TYPE_MESSAGE = 'Envie um arquivo PDF, JPG ou PNG';
export const ATTACHMENT_SIZE_MESSAGE = 'O arquivo passa de 20 MB';

export function detectAttachmentKind(content: Uint8Array): AttachmentKind | null {
  const match = SIGNATURES.find(({ bytes }) => bytes.every((byte, index) => content[index] === byte));
  return match?.kind ?? null;
}

export interface AttachmentUpload {
  originalName: string;
  content: Uint8Array;
}

export interface CheckedAttachment {
  kind: AttachmentKind;
  /** Só o nome, sem pasta, até 255 caracteres. */
  originalName: string;
  size: number;
}

/** Arquivo aceito: PDF, JPG ou PNG pelo conteúdo, com a extensão do mesmo tipo e até 20 MB. */
export function checkAttachmentUpload(upload: AttachmentUpload): CheckedAttachment {
  if (upload.content.length === 0) {
    throw new RequestInputError(ATTACHMENT_TYPE_MESSAGE);
  }
  if (upload.content.length > MAX_ATTACHMENT_BYTES) {
    throw new RequestInputError(ATTACHMENT_SIZE_MESSAGE);
  }
  const kind = detectAttachmentKind(upload.content);
  const originalName = path.basename(upload.originalName.replace(/\\/g, '/')).trim().slice(-MAX_ORIGINAL_NAME);
  const extension = path.extname(originalName).toLowerCase();
  if (kind === null || !EXTENSIONS[kind].includes(extension)) {
    throw new RequestInputError(ATTACHMENT_TYPE_MESSAGE);
  }
  return { kind, originalName, size: upload.content.length };
}

/** Nome para o cabeçalho `Content-Disposition`: o original codificado e uma versão só com ASCII. */
export function contentDisposition(originalName: string): string {
  const ascii = originalName.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '') || 'anexo';
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(originalName)}`;
}
