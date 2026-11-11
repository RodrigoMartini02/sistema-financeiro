import { RequestInputError } from '../utils/requestInput';

// Arquivo enviado ao cofre (item 5). Chega no corpo JSON como data URL (`{ name, data }`), como a foto de perfil
// (services/userPhoto.ts): nenhuma dependência nova, e o limite do corpo do servidor (50 MB) cobre os 10 MB do arquivo em
// base64. O tipo vale pelo conteúdo (a assinatura do arquivo), não pelo que o cliente declarou, e o nome é só um rótulo:
// o objeto no R2 tem uma chave própria (documentos/<conta>/<uuid>.<extensão>), então o nome nunca vira caminho.

/** Tamanho máximo do arquivo decodificado. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
/** Vida do link de abertura: o app o pede a cada clique em "Abrir". */
export const DOCUMENT_LINK_TTL_SECONDS = 120;
const MAX_FILE_NAME_LENGTH = 120;
const DEFAULT_FILE_NAME = 'documento';
/** O PDF pode ter alguns bytes antes do cabeçalho; a especificação admite até 1024. */
const PDF_HEADER_WINDOW = 1024;

const MISSING_FILE_MESSAGE = 'Envie o arquivo do documento';
const INVALID_FILE_MESSAGE = 'O arquivo deve ser um PDF, JPG ou PNG';
const TOO_LARGE_MESSAGE = 'O arquivo deve ter no máximo 10 MB';

interface FileKind {
  contentType: string;
  extension: string;
  /** Confere a assinatura do arquivo (os primeiros bytes), não o que o cliente declarou. */
  matches: (bytes: Uint8Array) => boolean;
}

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((value, index) => bytes[offset + index] === value);

function hasPdfHeader(bytes: Uint8Array): boolean {
  const lastStart = Math.min(bytes.length - PDF_SIGNATURE.length, PDF_HEADER_WINDOW);
  for (let offset = 0; offset <= lastStart; offset += 1) {
    if (startsWith(bytes, PDF_SIGNATURE, offset)) {
      return true;
    }
  }
  return false;
}

const FILE_KINDS: readonly FileKind[] = [
  { contentType: 'application/pdf', extension: 'pdf', matches: hasPdfHeader },
  { contentType: 'image/jpeg', extension: 'jpg', matches: (bytes) => startsWith(bytes, JPEG_SIGNATURE) },
  { contentType: 'image/png', extension: 'png', matches: (bytes) => startsWith(bytes, PNG_SIGNATURE) },
];

const DATA_URL_PREFIX = /^data:(application\/pdf|image\/jpeg|image\/png);base64,/;
const BASE64_BODY = /^[A-Za-z0-9+/]*={0,2}$/;
/** Maior texto possível para MAX_DOCUMENT_BYTES em base64 (4 caracteres para cada 3 bytes) mais o prefixo do data URL. */
const MAX_DATA_URL_LENGTH = Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4 + 64;
/** O prefixo mais longo ("data:application/pdf;base64,") cabe folgado aqui. */
const PREFIX_WINDOW = 64;

export interface DocumentUpload {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
  /** O nome para mostrar, já limpo e com a extensão do conteúdo. */
  fileName: string;
}

/** O nome do arquivo para mostrar: sem caminho, sem caracteres de controle ou reservados, com a extensão do conteúdo. */
export function sanitizeFileName(name: unknown, extension: string): string {
  const lastSegment = (typeof name === 'string' ? name : '').split(/[\\/]/).pop() ?? '';
  const cleaned = lastSegment
    // A extensão que o cliente mandou não vale: a do conteúdo é a que fica.
    .replace(/\.[A-Za-z0-9]{1,5}$/, '')
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, MAX_FILE_NAME_LENGTH)
    .trim();
  return `${cleaned === '' ? DEFAULT_FILE_NAME : cleaned}.${extension}`;
}

/**
 * O cabeçalho `Content-Disposition` com que o objeto é gravado no R2, para o navegador abrir o arquivo na própria aba
 * ("inline") e, ao salvar, propor o nome original. O nome vai codificado (RFC 5987), com uma cópia só ASCII para quem não a lê.
 */
export function contentDispositionFor(fileName: string): string {
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * Lê o arquivo do corpo (`{ name, data: "data:application/pdf;base64,..." }`). O tipo declarado precisa bater com a
 * assinatura do conteúdo (PDF, JPG ou PNG) e o tamanho, passar de 10 MB não vale. Qualquer problema é RequestInputError (400).
 */
export function readDocumentUpload(value: unknown): DocumentUpload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RequestInputError(MISSING_FILE_MESSAGE);
  }
  const file = value as Record<string, unknown>;
  const data = file['data'];
  if (typeof data !== 'string' || data.length === 0) {
    throw new RequestInputError(MISSING_FILE_MESSAGE);
  }
  if (data.length > MAX_DATA_URL_LENGTH) {
    throw new RequestInputError(TOO_LARGE_MESSAGE);
  }
  const prefix = DATA_URL_PREFIX.exec(data.slice(0, PREFIX_WINDOW));
  if (!prefix) {
    throw new RequestInputError(INVALID_FILE_MESSAGE);
  }
  const encoded = data.slice(prefix[0].length);
  if (!BASE64_BODY.test(encoded)) {
    throw new RequestInputError(INVALID_FILE_MESSAGE);
  }

  // O Buffer já é um Uint8Array: nada de copiar 10 MB de novo.
  const bytes: Uint8Array = Buffer.from(encoded, 'base64');
  if (bytes.byteLength === 0) {
    throw new RequestInputError(INVALID_FILE_MESSAGE);
  }
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new RequestInputError(TOO_LARGE_MESSAGE);
  }
  const kind = FILE_KINDS.find((candidate) => candidate.matches(bytes));
  if (!kind || kind.contentType !== prefix[1]) {
    throw new RequestInputError(INVALID_FILE_MESSAGE);
  }
  return { bytes, contentType: kind.contentType, extension: kind.extension, fileName: sanitizeFileName(file['name'], kind.extension) };
}
