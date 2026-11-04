// Anexos na demonstração (demo.html): sem servidor, o arquivo fica na memória da página e abre por um endereço local.
// O envio devolve o anexo como o servidor devolveria; ao salvar o lançamento, a demonstração troca os ids por esses anexos.
import type { AttachmentSummary } from '../../types/attachment';

const stored = new Map<string, { summary: AttachmentSummary; file: File }>();

/** Guarda o arquivo na memória da página e devolve o anexo. */
export function registerDemoAttachment(file: File): AttachmentSummary {
  const summary: AttachmentSummary = {
    id: crypto.randomUUID(),
    name: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    createdAt: new Date().toISOString(),
  };
  stored.set(summary.id, { summary, file });
  return summary;
}

/**
 * Os anexos dos ids, na ordem pedida: os enviados nesta página e os que o lançamento já tinha (`current`). Id que a
 * página não conhece, ou repetido, fica de fora.
 */
export function demoAttachmentsByIds(ids: readonly string[] | null | undefined, current: readonly AttachmentSummary[] = []): AttachmentSummary[] {
  const seen = new Set<string>();
  const found: AttachmentSummary[] = [];
  for (const id of ids ?? []) {
    const summary = stored.get(id)?.summary ?? current.find((attachment) => attachment.id === id);
    if (summary && !seen.has(id)) {
      seen.add(id);
      found.push(summary);
    }
  }
  return found;
}

export function openDemoAttachment(attachmentId: string): void {
  const entry = stored.get(attachmentId);
  if (!entry) {
    throw new Error('Este arquivo não está mais disponível na demonstração.');
  }
  window.open(URL.createObjectURL(entry.file), '_blank');
}
