// Conferência e preparo do arquivo enviado como anexo, sem banco nem R2. O tipo vale pelo conteúdo
// (os primeiros bytes), nunca pelo nome nem pelo tipo que o navegador informa: um HTML renomeado
// para .pdf é recusado. Planilha e documento do Office são reconhecidos pela família do arquivo
// (OLE ou ZIP) mais a extensão, e o texto simples, por não ter bytes NUL.
import path from 'node:path';
import sharp from 'sharp';
import { RequestInputError } from '../utils/requestInput';
import { ATTACHMENT_RULES, type AttachmentFormat, type AttachmentOwnerType } from './attachmentRules';

const MAX_ORIGINAL_NAME = 255;
const MAX_IMAGE_DIMENSION = 1600;
const WEBP_QUALITY = 82;
// Uma foto de 48 MP cabe; uma imagem "bomba" (poucos KB que viram gigabytes de pixels) não derruba o servidor.
const MAX_INPUT_PIXELS = 64_000_000;

interface FormatInfo {
  extensions: readonly string[];
  contentType: string;
  /** PDF e imagens abrem no navegador; o resto sempre baixa. */
  inline: boolean;
}

const FORMATS: Record<AttachmentFormat, FormatInfo> = {
  pdf: { extensions: ['.pdf'], contentType: 'application/pdf', inline: true },
  jpg: { extensions: ['.jpg', '.jpeg'], contentType: 'image/jpeg', inline: true },
  png: { extensions: ['.png'], contentType: 'image/png', inline: true },
  gif: { extensions: ['.gif'], contentType: 'image/gif', inline: true },
  webp: { extensions: ['.webp'], contentType: 'image/webp', inline: true },
  doc: { extensions: ['.doc'], contentType: 'application/msword', inline: false },
  xls: { extensions: ['.xls'], contentType: 'application/vnd.ms-excel', inline: false },
  docx: {
    extensions: ['.docx'],
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    inline: false,
  },
  xlsx: {
    extensions: ['.xlsx'],
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    inline: false,
  },
  txt: { extensions: ['.txt'], contentType: 'text/plain', inline: false },
};

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const GIF_87A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61];
const GIF_89A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50]; // depois de "RIFF" e dos 4 bytes de tamanho
const WEBP_SIGNATURE_OFFSET = 8;
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // .doc e .xls antigos
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // .docx e .xlsx

function hasBytesAt(content: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return content.length >= offset + signature.length && signature.every((byte, index) => content[offset + index] === byte);
}

/**
 * Formato do arquivo pelo conteúdo. A extensão só desempata o que o conteúdo não diz: .doc ou
 * .xls na família OLE, .docx ou .xlsx na família ZIP, e .txt para o texto sem bytes NUL.
 * Devolve null quando o conteúdo não é de nenhum formato conhecido.
 */
export function detectAttachmentFormat(content: Uint8Array, extension: string): AttachmentFormat | null {
  if (hasBytesAt(content, PDF_SIGNATURE)) return 'pdf';
  if (hasBytesAt(content, PNG_SIGNATURE)) return 'png';
  if (hasBytesAt(content, JPEG_SIGNATURE)) return 'jpg';
  if (hasBytesAt(content, GIF_87A_SIGNATURE) || hasBytesAt(content, GIF_89A_SIGNATURE)) return 'gif';
  if (hasBytesAt(content, RIFF_SIGNATURE) && hasBytesAt(content, WEBP_SIGNATURE, WEBP_SIGNATURE_OFFSET)) return 'webp';
  if (hasBytesAt(content, OLE_SIGNATURE)) {
    if (extension === '.doc') return 'doc';
    return extension === '.xls' ? 'xls' : null;
  }
  if (hasBytesAt(content, ZIP_SIGNATURE)) {
    if (extension === '.docx') return 'docx';
    return extension === '.xlsx' ? 'xlsx' : null;
  }
  if (extension === '.txt' && !content.includes(0)) return 'txt';
  return null;
}

export interface AttachmentUpload {
  originalName: string;
  content: Uint8Array;
}

export interface PreparedAttachment {
  /** Só o nome, sem pasta, até 255 caracteres. */
  originalName: string;
  format: AttachmentFormat;
  contentType: string;
  inline: boolean;
  /** O conteúdo que será guardado: o enviado, ou a imagem já convertida. */
  content: Uint8Array;
}

/** Só o nome do arquivo: sem pasta (nem a do Windows), sem caracteres de controle, até 255 caracteres. */
export function cleanOriginalName(name: string): string {
  const baseName = path.posix.basename(name.replace(/\\/g, '/'));
  const printable = Array.from(baseName)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join('');
  return printable.trim().slice(-MAX_ORIGINAL_NAME);
}

async function convertToWebp(originalName: string, content: Uint8Array, invalidImageMessage: string): Promise<PreparedAttachment> {
  let converted: Buffer;
  try {
    converted = await sharp(content, { limitInputPixels: MAX_INPUT_PIXELS })
      .resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch (error) {
    console.warn('Attachment image conversion failed:', { reason: error instanceof Error ? error.message : String(error) });
    throw new RequestInputError(invalidImageMessage);
  }
  const baseName = path.posix.parse(originalName).name || 'imagem';
  return {
    originalName: `${baseName}.webp`,
    format: 'webp',
    contentType: FORMATS.webp.contentType,
    inline: true,
    content: converted,
  };
}

/**
 * Confere o arquivo contra as regras do tipo de dono e o deixa pronto para guardar. Recusa, com a
 * mensagem do tipo de dono: arquivo vazio, acima do tamanho, de formato não aceito pelo conteúdo ou
 * com extensão que não combina com o conteúdo. Foto do catálogo é reduzida e convertida para WebP,
 * então a extensão original não importa (o arquivo guardado é outro).
 */
export async function prepareAttachment(ownerType: AttachmentOwnerType, upload: AttachmentUpload): Promise<PreparedAttachment> {
  const rule = ATTACHMENT_RULES[ownerType];
  if (upload.content.length === 0) {
    throw new RequestInputError(rule.typeMessage);
  }
  if (upload.content.length > rule.maxBytes) {
    throw new RequestInputError(rule.sizeMessage);
  }
  const originalName = cleanOriginalName(upload.originalName);
  const extension = path.posix.extname(originalName).toLowerCase();
  const format = detectAttachmentFormat(upload.content, extension);
  if (format === null || !rule.formats.includes(format)) {
    throw new RequestInputError(rule.typeMessage);
  }
  if (rule.convertToWebp) {
    return convertToWebp(originalName, upload.content, rule.typeMessage);
  }
  const info = FORMATS[format];
  if (!info.extensions.includes(extension)) {
    throw new RequestInputError(rule.typeMessage);
  }
  return { originalName, format, contentType: info.contentType, inline: info.inline, content: upload.content };
}

/**
 * Cabeçalho `Content-Disposition` do arquivo: o nome original codificado (RFC 8187) e uma versão só
 * com ASCII para quem não lê a codificada. PDF e imagens abrem no navegador; o resto baixa.
 */
export function buildContentDisposition(originalName: string, inline: boolean): string {
  const stripped = originalName.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '').trim();
  // Nome que só tinha letras fora do ASCII sobra vazio (ou só com a extensão): vira "anexo".
  const ascii = stripped === '' ? 'anexo' : stripped.startsWith('.') ? `anexo${stripped}` : stripped;
  const encoded = encodeURIComponent(originalName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
