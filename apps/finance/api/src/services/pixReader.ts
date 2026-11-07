import jsQR from 'jsqr';
import sharp from 'sharp';

export interface PixInfo {
  chave: string | null;
  valor: number | null;
  descricao: string | null;
  nome_destinatario: string | null;
  cidade: string | null;
  txid: string | null;
  raw_payload: string | null;
}

// Código Pix (BR Code, padrão EMV): campos de 2 dígitos de identificação,
// 2 de tamanho e o valor. Os que importam aqui:
//   26 dados da conta do recebedor (01 chave, 02 descrição, 25 URL do Pix dinâmico)
//   54 valor (opcional: sem ele, quem paga digita o valor)
//   59 nome do recebedor, 60 cidade
//   62 dados adicionais (05 txid)

/** Lado maior da imagem entregue ao leitor de QR: reduz fotos grandes sem distorcer. */
const MAX_QR_IMAGE_DIMENSION = 2000;

const RGBA_CHANNELS = 4;

function parsePixPayload(payload: string): Record<string, string> {
  const result: Record<string, string> = {};
  let pos = 0;
  while (pos < payload.length - 4) {
    const tag = payload.substring(pos, pos + 2);
    const len = parseInt(payload.substring(pos + 2, pos + 4));
    if (isNaN(len)) break;
    result[tag] = payload.substring(pos + 4, pos + 4 + len);
    pos += 4 + len;
  }
  return result;
}

function readPixAmount(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }
  const amount = Number.parseFloat(raw.replace(',', '.'));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function extractPixInfo(payload: string): PixInfo {
  const info: PixInfo = { chave: null, valor: null, descricao: null, nome_destinatario: null, cidade: null, txid: null, raw_payload: payload };

  if (!payload) return info;

  const parsed = parsePixPayload(payload);
  const merchantAccount = parsed['26'] ? parsePixPayload(parsed['26']) : {};
  const additionalData = parsed['62'] ? parsePixPayload(parsed['62']) : {};

  info.chave = merchantAccount['01'] ?? null;
  info.descricao = merchantAccount['02'] ?? null;
  info.valor = readPixAmount(parsed['54']);
  info.nome_destinatario = parsed['59'] ?? null;
  info.cidade = parsed['60'] ?? null;
  info.txid = additionalData['05'] ?? null;

  return info;
}

export async function readQRCode(imagePath: string): Promise<string | null> {
  try {
    // Gira conforme a orientação gravada pelo celular, reduz sem distorcer e
    // entrega ao jsQR os pixels em RGBA (sRGB primeiro: imagem em tons de
    // cinza viria com um canal só).
    const { data, info } = await sharp(imagePath)
      .autoOrient()
      .resize({ width: MAX_QR_IMAGE_DIMENSION, height: MAX_QR_IMAGE_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .toColourspace('srgb')
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== RGBA_CHANNELS) {
      throw new Error(`imagem com ${info.channels} canais`);
    }

    const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
    const code = jsQR(pixels, info.width, info.height);
    return code ? code.data : null;
  } catch (err) {
    console.error('Read QR code error:', (err as Error).message);
    return null;
  }
}

export async function readPixQRFromImage(imagePath: string): Promise<PixInfo | null> {
  const payload = await readQRCode(imagePath);
  if (!payload) return null;
  return extractPixInfo(payload);
}
