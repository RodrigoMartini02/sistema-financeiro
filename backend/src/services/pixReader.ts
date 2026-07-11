import * as fs from 'fs';

export interface PixInfo {
  chave: string | null;
  valor: number | null;
  descricao: string | null;
  nome_destinatario: string | null;
  cidade: string | null;
  txid: string | null;
  raw_payload: string | null;
}

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

export function extractPixInfo(payload: string): PixInfo {
  const info: PixInfo = { chave: null, valor: null, descricao: null, nome_destinatario: null, cidade: null, txid: null, raw_payload: payload };

  if (!payload) return info;

  const parsed = parsePixPayload(payload);

  // Tag 26 or 62 contains merchant info
  const merchantInfo = parsed['26'] ? parsePixPayload(parsed['26']) : {};
  info.chave = merchantInfo['01'] ?? null;

  // Tag 04 = transaction amount
  const amountStr = parsed['04'];
  if (amountStr) info.valor = parseFloat(amountStr.replace(',', '.')) || null;

  // Tag 59 = merchant name
  info.nome_destinatario = parsed['59'] ?? null;

  // Tag 60 = city
  info.cidade = parsed['60'] ?? null;

  // Tag 05 in merchant account = description
  info.descricao = merchantInfo['05'] ?? parsed['62'] ? parsePixPayload(parsed['62'] ?? '')['05'] ?? null : null;

  // TxID from tag 62 sub-tag 05
  const additionalData = parsed['62'] ? parsePixPayload(parsed['62']) : {};
  info.txid = additionalData['05'] ?? null;

  return info;
}

export async function readQRCode(imagePath: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jsQR = require('jsqr') as (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Jimp = require('jimp') as { read: (path: string) => Promise<{ resize: (w: number, h: number, mode: unknown) => void; bitmap: { data: Buffer; width: number; height: number }; RESIZE_CONTAIN: unknown }> };

    const img = await Jimp.read(imagePath);
    (img as unknown as { resize: (w: number, h: number) => void }).resize(800, 800);

    const { width, height } = (img as unknown as { bitmap: { data: Buffer; width: number; height: number } }).bitmap;
    const data = new Uint8ClampedArray((img as unknown as { bitmap: { data: Buffer } }).bitmap.data);

    const code = jsQR(data, width, height);
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
