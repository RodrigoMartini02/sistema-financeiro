// Anexos de despesas e receitas que moravam dentro da própria linha (coluna jsonb `anexos`, com o arquivo em
// base64), antes de irem para a tabela `anexos` e o R2 (plano .plans/unificar-anexos-no-r2.md, etapa C). Funções
// puras, sem banco nem R2: o script scripts/attachments.ts faz a cópia e a conferência com elas.
import { createHash } from 'node:crypto';
import { RequestInputError } from '../utils/requestInput';
import { cleanOriginalName, prepareAttachment } from './attachmentFile';

export type LegacyEntryType = 'expense' | 'income';

const BASE64_PATTERN = /^[A-Za-z0-9+/\s]+={0,2}\s*$/;
const UNCHECKED_CONTENT_TYPE = 'application/octet-stream';

/**
 * O id do anexo migrado: sai do tipo, do id da linha e da posição do item na lista antiga (1, 2, 3...), então
 * rodar a cópia de novo cai nos mesmos ids e não duplica. A migration 0095 calcula o mesmo id em SQL
 * (`md5('legacy:<tipo>:<linha>:<posição>')::uuid`) para conferir, antes de apagar a coluna, que todo item foi copiado.
 */
export function legacyAttachmentId(entryType: LegacyEntryType, entryId: number, position: number): string {
  const hex = createHash('md5').update(`legacy:${entryType}:${entryId}:${position}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface LegacyAttachmentCopy {
  id: string;
  originalName: string;
  contentType: string;
  /** PDF e imagem abrem no navegador; o resto baixa. */
  inline: boolean;
  content: Uint8Array;
  createdAt: Date | null;
  /**
   * O conteúdo não passou na conferência de tipo de hoje (o servidor antigo não conferia nada). O arquivo é guardado
   * mesmo assim, só para baixar, nunca para abrir no navegador, e o script lista os casos.
   */
  unchecked: boolean;
}

export type LegacyAttachmentResult = { ok: true; copy: LegacyAttachmentCopy } | { ok: false; reason: string };

function readText(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function readUploadDate(value: unknown, fallback: Date | null): Date | null {
  if (typeof value !== 'string') return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

/**
 * A lista de anexos de um lançamento sai ordenada por data de criação. Os itens de uma lista antiga sem data própria
 * herdam a da linha (todos iguais), então cada posição ganha 1 ms a mais que a anterior: a ordem original se mantém,
 * e um anexo novo, enviado depois, fica sempre por último.
 */
function withPositionOffset(date: Date | null, position: number): Date | null {
  return date === null ? null : new Date(date.getTime() + (position - 1));
}

/**
 * Um item da lista antiga pronto para copiar. Nunca descarta em silêncio: item sem nome, sem conteúdo ou com
 * conteúdo que não é base64 volta como recusa com o motivo, para o script listar. Conteúdo que só não passa na
 * conferência de tipo de hoje é aceito para download (`unchecked`).
 */
export async function prepareLegacyAttachment(
  entryType: LegacyEntryType,
  entryId: number,
  position: number,
  item: unknown,
  fallbackDate: Date | null,
): Promise<LegacyAttachmentResult> {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return { ok: false, reason: 'o item não é um objeto' };
  }
  const record = item as Record<string, unknown>;
  const name = readText(record, 'nome');
  const base64 = readText(record, 'dados');
  if (name === null) return { ok: false, reason: 'item sem nome' };
  if (base64 === null) return { ok: false, reason: 'item sem conteúdo' };
  if (!BASE64_PATTERN.test(base64)) return { ok: false, reason: 'o conteúdo não é base64' };

  const content = Buffer.from(base64, 'base64');
  if (content.length === 0) return { ok: false, reason: 'conteúdo vazio' };

  const id = legacyAttachmentId(entryType, entryId, position);
  const createdAt = withPositionOffset(readUploadDate(record['dataUpload'], fallbackDate), position);
  try {
    const prepared = await prepareAttachment(entryType, { originalName: name, content });
    return {
      ok: true,
      copy: { id, originalName: prepared.originalName, contentType: prepared.contentType, inline: prepared.inline, content, createdAt, unchecked: false },
    };
  } catch (error) {
    if (!(error instanceof RequestInputError)) throw error;
    const originalName = cleanOriginalName(name) || 'anexo';
    return {
      ok: true,
      copy: { id, originalName, contentType: UNCHECKED_CONTENT_TYPE, inline: false, content, createdAt, unchecked: true },
    };
  }
}
