import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { users } from '../db/identity';
import type { ObjectStorage } from '../objectStorage';
import { RequestInputError, readRecord } from '../utils/requestInput';

// Foto de perfil dos usuários do módulo (item 1A). O arquivo mora no R2 (AGENT.md: arquivo duradouro não vai para
// coluna do banco); a coluna `usuarios.foto_chave` guarda só a chave. O app abre a foto por um link assinado de vida
// curta, direto do R2: a chave nunca sai na API. A imagem chega já recortada pelo app (JPEG quadrado de poucas
// dezenas de KB); aqui só se confere o tipo pelo conteúdo e o tamanho, sem biblioteca de imagem.

/** Tamanho máximo da imagem decodificada. O recorte do app tem poucas dezenas de KB; o limite só barra abuso. */
export const MAX_PHOTO_BYTES = 1024 * 1024;
/** Vida do link assinado. O app busca a lista de novo ao abrir as Configurações. */
export const PHOTO_LINK_TTL_SECONDS = 60 * 60;

const PHOTO_UNAVAILABLE_MESSAGE = 'O envio de foto não está disponível agora. Tente de novo mais tarde.';
const INVALID_PHOTO_MESSAGE = 'Envie uma imagem JPG, PNG ou WebP';
const TOO_LARGE_MESSAGE = 'A imagem deve ter no máximo 1 MB';
const USER_NOT_FOUND_MESSAGE = 'Usuário não encontrado';

interface ImageType {
  contentType: string;
  extension: string;
  /** Confere a assinatura do arquivo (os primeiros bytes), não o que o cliente declarou. */
  matches: (bytes: Uint8Array) => boolean;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const startsWith = (bytes: Uint8Array, signature: readonly number[]) => signature.every((value, index) => bytes[index] === value);

const IMAGE_TYPES: readonly ImageType[] = [
  { contentType: 'image/jpeg', extension: 'jpg', matches: (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]) },
  { contentType: 'image/png', extension: 'png', matches: (bytes) => startsWith(bytes, PNG_SIGNATURE) },
  {
    contentType: 'image/webp',
    extension: 'webp',
    // "RIFF", quatro bytes de tamanho e "WEBP".
    matches: (bytes) => startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50]),
  },
];

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})$/;
/** Maior texto possível para MAX_PHOTO_BYTES em base64 (4 caracteres para cada 3 bytes) mais o prefixo do data URL. */
const MAX_DATA_URL_LENGTH = Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 64;

export interface PhotoUpload {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
}

/**
 * Lê o corpo `{ image: "data:image/jpeg;base64,..." }` (o recorte do app). O tipo vale pelo conteúdo: o declarado
 * precisa bater com a assinatura do arquivo. Imagem inválida ou grande demais: RequestInputError (400).
 */
export function readPhotoUpload(body: unknown): PhotoUpload {
  const image = readRecord(body, 'Pedido inválido')['image'];
  if (typeof image !== 'string' || image.length === 0) {
    throw new RequestInputError('Envie a imagem da foto');
  }
  if (image.length > MAX_DATA_URL_LENGTH) {
    throw new RequestInputError(TOO_LARGE_MESSAGE);
  }
  const match = DATA_URL.exec(image);
  if (!match) {
    throw new RequestInputError(INVALID_PHOTO_MESSAGE);
  }

  const bytes = new Uint8Array(Buffer.from(match[2] ?? '', 'base64'));
  if (bytes.byteLength === 0) {
    throw new RequestInputError(INVALID_PHOTO_MESSAGE);
  }
  if (bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new RequestInputError(TOO_LARGE_MESSAGE);
  }
  const type = IMAGE_TYPES.find((candidate) => candidate.matches(bytes));
  if (!type || type.contentType !== match[1]) {
    throw new RequestInputError(INVALID_PHOTO_MESSAGE);
  }
  return { bytes, contentType: type.contentType, extension: type.extension };
}

/** Link de leitura da foto, de vida curta; null sem foto, sem R2 ou se o link não puder ser assinado. */
export async function photoLink(storage: ObjectStorage | null, photoKey: string | null): Promise<string | null> {
  if (!storage?.signedGetUrl || photoKey === null) {
    return null;
  }
  try {
    return await storage.signedGetUrl(photoKey, PHOTO_LINK_TTL_SECONDS);
  } catch (error) {
    // Uma foto sem link não derruba a lista de usuários: o app mostra as iniciais.
    console.error('User photo link failed:', { photoKey, error });
    return null;
  }
}

/** Apaga o objeto sem derrubar a operação: o que sobrar no R2 é só lixo, e fica registrado. */
async function removeStoredPhoto(storage: ObjectStorage | null, photoKey: string): Promise<void> {
  if (!storage) {
    console.error('User photo left in storage, storage unavailable:', { photoKey });
    return;
  }
  try {
    await storage.deleteObject(photoKey);
  } catch (error) {
    console.error('User photo left in storage:', { photoKey, error });
  }
}

/**
 * Troca ou tira a foto do usuário. Quem chama já conferiu que o usuário é da conta da requisição.
 * Ordem: grava o objeto novo, aponta a coluna para ele e só então apaga o antigo; se a coluna não atualizar, o
 * objeto novo é desfeito. Sem R2 configurado o envio responde 503; tirar a foto não depende do R2.
 */
export async function changeUserPhoto(
  db: TendersDb,
  storage: ObjectStorage | null,
  userId: number,
  upload: PhotoUpload | null,
): Promise<void> {
  const [current] = await db.select({ photoKey: users.photoKey }).from(users).where(eq(users.id, userId)).limit(1);
  if (!current) {
    throw new RequestInputError(USER_NOT_FOUND_MESSAGE, 404);
  }

  let newKey: string | null = null;
  if (upload) {
    if (!storage) {
      throw new RequestInputError(PHOTO_UNAVAILABLE_MESSAGE, 503);
    }
    newKey = `usuarios/${userId}/${randomUUID()}.${upload.extension}`;
    await storage.putObject(newKey, upload.bytes, upload.contentType, {
      contentDisposition: 'inline',
      cacheControl: 'private, max-age=3600',
    });
  }

  try {
    await db.update(users).set({ photoKey: newKey }).where(eq(users.id, userId));
  } catch (error) {
    if (newKey !== null) {
      await removeStoredPhoto(storage, newKey);
    }
    throw error;
  }

  if (current.photoKey !== null) {
    await removeStoredPhoto(storage, current.photoKey);
  }
}
